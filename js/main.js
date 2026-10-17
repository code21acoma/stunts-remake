// Hlavní smyčka: menu, závod (fyzika s pevným krokem), kamery, HUD, duch, záznam a jeho přehrávání.
import * as THREE from 'three';
import { World } from './world.js';
import { Track, drawTrackMap, pathWorld } from './track.js';
import { BUILTIN } from './tracks.js';
import { Vehicle, CARS } from './physics.js';
import { buildCarModel, carThumbnail, buildCockpit } from './car.js';
import { Audio } from './audio.js';
import { Editor } from './editor.js';
import { Store } from './store.js';
import { T, GRID, LOOPS } from './defs.js';
import { Autopilot } from './ai.js';

const $ = id => document.getElementById(id);
const STEP = 1 / 240;
const REC_EVERY = 8;          // záznam 30 Hz
const REC_HZ = 240 / REC_EVERY;
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = t => { if (t == null) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(2).padStart(5, '0'); };

const world = new World($('c'));
const audio = new Audio();
const settings = Store.settings();
settings.colors ||= {};
settings.music ??= true;
// hudba: vlastní retro skladba (audio.js) – hraje jen v menu (hlavní menu, výběr auta a trati, nápověda),
// v závodě, editoru ani záznamu ne. Spustí se po první akci uživatele (prohlížeč jinak zvuk nepovolí).
const MUSIC_MODES = ['menu', 'select', 'help'];
function syncMusic() {
  if (!audio.ctx) return;
  const want = settings.music && MUSIC_MODES.includes(mode);
  if (want && !audio.music) audio.startMusic();
  else if (!want && audio.music) audio.stopMusic();
}
window.addEventListener('pointerdown', () => { audio.init(); audio.setMuted(settings.muted); syncMusic(); }, { once: true });
window.addEventListener('keydown', () => { audio.init(); audio.setMuted(settings.muted); syncMusic(); }, { once: true });

// barvy laku (null = původní barva auta); ve hře pro dva je hráč 1 červený a hráč 2 modrý
const COLORS = [null, 0xd81f26, 0x1f5fd8, 0x2f9e3a, 0xf0c21c, 0xff7a1c, 0xf2f2f2, 0x1a1a1a, 0xa9b0b8, 0x7a2cff, 0x39b5c8, 0xff5fa8];
const P_COLORS = [0xd81f26, 0x1f5fd8];
const P_NAMES = ['HRÁČ 1', 'HRÁČ 2'];
const hexCss = c => '#' + c.toString(16).padStart(6, '0');
// počítačoví soupeři: každý jede jiným typem auta a vyniká v něčem jiném. Tempo řídí cílový čas kola:
// ideální čas kola auta hráče na dané trati + margin povahy (0–8 %) + obtížnost (RIVAL_LEVEL).
// Kdo jede před plánem, ubere – soupeř i v rychlejším autě se tak přizpůsobí (kalibrace: tools/rivaltest.js)
const RIVALS = [
  { name: 'Novák', margin: 0.02, car: 'rally', trait: 'mistr zatáček', corner: 1.02, throttle: 0.97, brake: 10, lane: -1.4 },
  { name: 'Svoboda', margin: 0.04, car: 'muscle', trait: 'raketa na rovinkách', corner: 0.84, throttle: 0.95, brake: 9, lane: 1.4 },
  { name: 'Dvořák', margin: 0.01, car: 'gt', trait: 'pozdní brzdění', corner: 0.97, throttle: 1, brake: 12, lane: -0.7 },
  { name: 'Černá', margin: 0.05, car: 'kapka', trait: 'vyrovnaná', corner: 0.97, throttle: 1, brake: 10, lane: 0.7 },
  { name: 'Procházka', margin: 0, car: 'formule', trait: 'odvážný v zatáčkách', corner: 1.03, throttle: 0.95, brake: 10, lane: 0 },
  { name: 'Kučerová', margin: 0.03, car: 'blesk', trait: 'rychlá, ale opatrná', corner: 0.94, throttle: 1, brake: 9, lane: -1.1 },
  { name: 'Veselý', margin: 0.08, car: 'buvol', trait: 'nováček', corner: 0.9, throttle: 0.95, brake: 9, lane: 1.1 },
];
// nejvyšší rychlost (km/h) a zrychlení 0–100 km/h (s) aut – pro odhad ideálního času kola
const TOP = { kapka: 124, buvol: 164, rally: 198, gt: 198, muscle: 214, blesk: 203, formule: 244 };
const ACC = { kapka: 12.1, buvol: 6.4, rally: 4.4, gt: 6.8, muscle: 7.5, blesk: 4.2, formule: 5.4 };
// oprava odhadu podle skutečných jízd autopilota (formule brzdí a zatáčí líp, těžká auta hůř)
const EST = { kapka: 0.97, buvol: 1.12, rally: 1.0, gt: 0.96, muscle: 1.12, blesk: 0.98, formule: 0.905 };
// obtížnost soupeřů (0 = bez soupeřů): pace = přídavek k cílovému času kola, corner/brake = odvaha v zatáčkách
// a při brzdění, line = ideální stopa (vnější–vnitřní–vnější) místo jízdy středem silnice,
// grip = lepší pneumatiky soupeřů (bez nich by odvážnější jízdu neudrželi)
const RIVAL_LEVEL = [
  null,
  { pace: 0.10, corner: 0.95, brake: 1, line: false, grip: 1 },       // Lehcí
  { pace: 0.07, corner: 1.0, brake: 1.05, line: true, grip: 1 },      // Střední
  { pace: -0.06, corner: 1.1, brake: 1.15, line: true, grip: 1.12 },  // Těžcí
  { pace: -0.14, corner: 1.22, brake: 1.25, line: true, grip: 1.2 },  // Mistři
];
// těžký terénní Buvol se při větší odvaze převrací
const CORNER_MAX = { buvol: 0.9 };
const oppLevel = v => (v === true ? 2 : v | 0);
const RIVAL_COLORS = [0x2f9e3a, 0xf0c21c, 0xff7a1c, 0xf2f2f2, 0x1a1a1a, 0x7a2cff, 0x39b5c8, 0xff5fa8, 0xa9b0b8, 0x8b5a2b];
function paintedSpec(id, color) {
  const s = CARS[id] || CARS.gt;
  return color == null ? s : { ...s, look: { ...s.look, base: color } };
}
const keys = new Set();

let mode = 'menu';
let prevScreen = 'menu';
let backdrop = null;
let R = null;     // aktuální závod
let RP = null;    // přehrávání záznamu
let selectedTrack = settings.track || BUILTIN[0].id;

// ------------------------------------------------------------ UI pomocníci
function show(id) {
  document.querySelectorAll('.screen:not(#dialog)').forEach(s => s.classList.toggle('show', s.id === id));
}
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1800);
}
function dialog(title, html, buttons) {
  $('dlgTitle').textContent = title; $('dlgBody').innerHTML = html;
  const bb = $('dlgBtns'); bb.innerHTML = '';
  for (const [label, fn, primary] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = label;
    b.onclick = () => { closeDialog(); fn && fn(); };
    bb.appendChild(b);
  }
  $('dialog').classList.add('show'); app.dialogOpen = true;
}
function closeDialog() { $('dialog').classList.remove('show'); app.dialogOpen = false; }
let msgTimer = 0;
function message(text, dur = 1.2, sub = '') {
  $('msg').textContent = text; $('msg').classList.toggle('show', !!text);
  $('sub').textContent = sub; msgTimer = dur;
}

const app = { world, showMenu, startRace, dialog, closeDialog, toast, dialogOpen: false };
const editor = new Editor(app);

// ------------------------------------------------------------ vstup
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyM') { settings.muted = !settings.muted; audio.setMuted(settings.muted); Store.saveSettings(settings); toast(settings.muted ? 'Zvuk vypnut' : 'Zvuk zapnut'); }
  if (e.code === 'KeyN' && mode !== 'editor') { audio.init(); settings.music = !settings.music; Store.saveSettings(settings); syncMusic(); toast(settings.music ? '🎵 Hudba zapnuta (N)' : '🎵 Hudba vypnuta (N)'); }
  if (mode === 'race' && R) {
    const [P1, P2] = R.players;
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    else if (R.paused) return;
    else if (e.code === 'KeyC') { P1.camMode = (P1.camMode + 1) % CAMS.length; if (!R.duel) camLabel(CAMS[P1.camMode]); }
    else if (e.code === 'KeyR' && !raceOver() && !P1.done) respawn(P1);
    else if (R.duel && e.code === 'ShiftRight') P2.camMode = (P2.camMode + 1) % CAMS.length;
    else if (R.duel && (e.code === 'Enter' || e.code === 'NumpadEnter') && !raceOver() && !P2.done) respawn(P2);
    else if (e.code === 'F8' && R.closed && !R.duel) { R.ai = R.ai ? null : new Autopilot(R.track); R.ai?.reset(R.car.pos); if (R.ai) R.aiUsed = true; toast(R.ai ? 'Autopilot zapnut (F8)' : 'Autopilot vypnut'); }
  } else if (mode === 'replay' && RP) {
    if (e.code === 'Space') RP.playing = !RP.playing, syncReplayUI();
    else if (e.code === 'KeyC') cycleReplayCam();
    else if (e.code === 'Escape') exitReplay();
  } else if (e.code === 'Escape' && (mode === 'select' || mode === 'help')) showMenu();
});
window.addEventListener('keyup', e => keys.delete(e.code));

// dotykové ovládání: tlačítka simulují klávesy
document.querySelectorAll('#touch button').forEach(b => {
  const code = b.dataset.k;
  const down = e => { e.preventDefault(); b.classList.add('on'); window.dispatchEvent(new KeyboardEvent('keydown', { code })); };
  const up = e => { e.preventDefault(); b.classList.remove('on'); window.dispatchEvent(new KeyboardEvent('keyup', { code })); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});
window.addEventListener('blur', () => { keys.clear(); if (mode === 'race' && R && !R.paused && !raceOver()) togglePause(); });

// who: -1 = sólo (WASD i šipky), 0 = hráč 1 (WASD, mezerník), 1 = hráč 2 (šipky, pravý Ctrl)
function readInput(who = -1) {
  const k = c => keys.has(c);
  const wasd = who !== 1, arrows = who !== 0;
  const inp = {
    steer: ((arrows && k('ArrowRight')) || (wasd && k('KeyD')) ? 1 : 0) - ((arrows && k('ArrowLeft')) || (wasd && k('KeyA')) ? 1 : 0),
    throttle: (arrows && k('ArrowUp')) || (wasd && k('KeyW')) ? 1 : 0,
    brake: (arrows && k('ArrowDown')) || (wasd && k('KeyS')) ? 1 : 0,
    handbrake: who === 1 ? k('ControlRight') : k('Space'),
  };
  // ovladač (PlayStation DualSense CFI-ZCT1W i jiné ve standardním mapování): hráč 1 = první, hráč 2 = druhý ovladač
  const gp = getPads()[who === 1 ? 1 : 0];
  if (gp) {
    const b = i => gp.buttons[i] || { pressed: false, value: 0 };
    const ax = gp.axes[0] || 0, dz = 0.1;
    // levá páčka s mrtvou zónou a jemnější odezvou kolem středu; nebo šipky (D-pad)
    if (Math.abs(ax) > dz) inp.steer = Math.sign(ax) * ((Math.abs(ax) - dz) / (1 - dz)) ** 1.4;
    if (b(14).pressed) inp.steer = -1;
    if (b(15).pressed) inp.steer = 1;
    const r2 = b(7).value, l2 = b(6).value;
    if (r2 > 0.04) inp.throttle = r2;                       // R2 = plyn (plynule podle stisku)
    if (l2 > 0.04) inp.brake = l2;                          // L2 = brzda / zpátečka
    if (b(0).pressed) inp.handbrake = true;                 // ✕ = ruční brzda
  }
  return inp;
}

// ------------------------------------------------------------ ovladač (gamepad)
// Rozložení DualSense (standardní mapování prohlížeče): 0 ✕, 1 ○, 2 □, 3 △, 4 L1, 5 R1, 6 L2, 7 R2,
// 8 Create, 9 Options, 12–15 D-pad (↑ ↓ ← →), 16 PS.
const getPads = () => (navigator.getGamepads ? [...navigator.getGamepads()].filter(g => g && g.connected) : []);
const padPrev = new Map();
function padEdges(gp) {   // tlačítka právě stisknutá v tomto snímku
  const prev = padPrev.get(gp.index) || [];
  const now = gp.buttons.map(x => x.pressed);
  padPrev.set(gp.index, now);
  return i => now[i] && !prev[i];
}
function pollPads() {
  getPads().forEach((gp, pi) => {
    const hit = padEdges(gp);
    if (mode === 'race' && R) {
      const P = R.duel ? R.players[pi] : pi === 0 ? R.players[0] : null;
      if (hit(9)) { togglePause(); return; }                                   // Options = pauza
      if (R.paused) { if (hit(0)) togglePause(); else if (hit(1)) showMenu(); return; }   // ✕ pokračovat, ○ menu
      if ($('results').classList.contains('show')) {                            // výsledky: ✕ znovu, ○ menu
        if (hit(0)) $('againBtn').click(); else if (hit(1)) showMenu();
        return;
      }
      if (!P) return;
      if (hit(3)) { P.camMode = (P.camMode + 1) % CAMS.length; if (!R.duel) camLabel(CAMS[P.camMode]); }   // △ = kamera
      if (hit(1) && !raceOver() && !P.done) respawn(P);                        // ○ = návrat na trať
    } else if (mode === 'replay' && RP) {
      if (hit(0)) { RP.playing = !RP.playing; syncReplayUI(); }                 // ✕ = přehrát/zastavit
      if (hit(3)) cycleReplayCam();                                              // △ = kamera
      if (hit(1) || hit(9)) exitReplay();                                        // ○ = konec záznamu
    } else if (mode === 'menu' || mode === 'select' || mode === 'help') menuNav(hit, gp);
  });
}

// ovládání menu ovladačem: D-pad / levá páčka = výběr tlačítka nebo karty, ✕ = potvrdit, ○ = zpět
let padFocus = null, stickT = 0;
function menuNav(hit, gp) {
  const scr = app.dialogOpen ? $('dialog') : document.querySelector('.screen.show');
  if (!scr) return;
  const els = [...scr.querySelectorAll('button, .card, label.chk')].filter(e => e.offsetParent && !e.closest('.hidden') && e.getBoundingClientRect().width > 0);
  if (!els.length) return;
  const focus = e => { padFocus?.classList.remove('padfocus'); padFocus = e; e.classList.add('padfocus'); e.scrollIntoView({ block: 'nearest' }); };
  if (!els.includes(padFocus)) focus(scr.querySelector('.card.sel') || els.find(e => e.classList.contains('primary')) || els[0]);
  // směr z D-padu nebo levé páčky (páčka s opakováním)
  let dir = hit(12) ? [0, -1] : hit(13) ? [0, 1] : hit(14) ? [-1, 0] : hit(15) ? [1, 0] : null;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, now = performance.now();
  if (!dir && Math.hypot(ax, ay) > 0.6 && now > stickT) { dir = Math.abs(ax) > Math.abs(ay) ? [Math.sign(ax), 0] : [0, Math.sign(ay)]; stickT = now + 260; }
  if (Math.hypot(ax, ay) < 0.3) stickT = 0;
  if (dir) {
    const r0 = padFocus.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    let best = null, bs = 1e9;
    for (const e of els) {
      if (e === padFocus) continue;
      const r = e.getBoundingClientRect(), d = [r.left + r.width / 2 - c0[0], r.top + r.height / 2 - c0[1]];
      const along = d[0] * dir[0] + d[1] * dir[1], across = Math.abs(d[0] * dir[1] - d[1] * dir[0]);
      if (along <= 4) continue;
      const s = along + across * 2.5;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) focus(best);
  }
  if (hit(0)) {   // ✕: karta = výběr (druhé stisknutí vybrané karty = pokračovat), jinak kliknutí
    if (padFocus.classList.contains('card') && padFocus.classList.contains('sel')) padFocus.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    else padFocus.click();
  }
  if (hit(1)) {   // ○ = zpět
    if (app.dialogOpen) closeDialog();
    else if (mode === 'select') (!$('stepTrack').classList.contains('hidden') ? $('backCarBtn') : $('carBackBtn')).click();
    else if (mode === 'help') showMenu();
  }
}
// vibrace ovladače (DualSense/Xbox v Chrome/Edge přes vibrationActuator, ve Firefoxu hapticActuators).
// s = síla 0–1 (silný motor), weak = slabý (rychlý) motor; náraz (soft = false) má přednost před průběžným chvěním.
const rumbleBusy = [];
function rumble(pi, s, ms = 180, weak = s * 0.7, soft = false) {
  const gp = getPads()[pi];
  if (!gp) return;
  const now = performance.now();
  if (soft && now < (rumbleBusy[pi] || 0)) return;          // průběžné chvění nepřeruší ránu
  if (!soft) rumbleBusy[pi] = now + ms;
  s = Math.max(0, Math.min(1, s)); weak = Math.max(0, Math.min(1, weak));
  try {
    if (gp.vibrationActuator?.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: s, weakMagnitude: weak })?.catch?.(() => {});
    else gp.hapticActuators?.[0]?.pulse?.(Math.max(s, weak), ms);
  } catch { /* bez vibrací */ }
}
const canRumble = gp => !!(gp && (gp.vibrationActuator?.playEffect || gp.hapticActuators?.length));

// průběžná haptická odezva hráče: dopad po skoku, povrch (tráva, šotolina, hrboly) a smyk
function haptics(P, dt) {
  const car = P.car;
  if (P.isAI || !getPads()[P.i]) return;
  if ((P.hAir || 0) > 0.25 && car.onGround) {                 // dopad – ráz podle délky letu
    const a = Math.min(1.2, P.hAir);
    rumble(P.i, 0.3 + a * 0.55, 120 + a * 140, 0.2 + a * 0.3);
  }
  P.hAir = car.onGround ? 0 : (P.hAir || 0) + dt;
  P.hT = (P.hT || 0) - dt;
  if (P.hT > 0 || !car.onGround) return;
  let rough = 0;
  for (const w of car.wheels) if (w.contact && (w.ground || w.surf === 'gravel')) rough++;
  const tile = R.track.tileAt(car.pos.x, car.pos.z), bumpy = tile && (tile.type === 'bumps' || tile.type === 'waves') ? 0.5 : 0;
  const sp = Math.min(1, car.speed / 25);
  const surf = Math.max(rough / 4, bumpy) * sp;                 // hrubý povrch – chvění sílí s rychlostí
  const slip = car.speed > 5 ? Math.max(0, car.skid - 0.45) * 0.55 : 0;   // smyk – jemné bzučení
  if (surf > 0.05 || slip > 0.05) { rumble(P.i, surf * 0.35, 110, Math.max(surf * 0.45, slip), true); P.hT = 0.09; }
}

window.addEventListener('gamepadconnected', e => {
  const id = e.gamepad.id;
  const name = /dualsense|0ce6|0df2/i.test(id) ? 'PlayStation DualSense' : /054c|wireless controller/i.test(id) ? 'PlayStation' : id.replace(/\(.*\)/, '').trim();
  const vib = canRumble(e.gamepad);
  toast(`🎮 Ovladač připojen: ${name}` + (e.gamepad.mapping === 'standard' ? '' : ' (nestandardní mapování – doporučen Chrome/Edge)')
    + (vib ? ' · vibrace zapnuty' : ' · tento prohlížeč vibrace ovladače nepodporuje (zkus Chrome/Edge)'));
  if (vib) setTimeout(() => {   // zkušební zavibrování, ať je hned poznat, že vibrace fungují
    const gp = navigator.getGamepads()[e.gamepad.index];
    try { gp?.vibrationActuator?.playEffect ? gp.vibrationActuator.playEffect('dual-rumble', { duration: 220, strongMagnitude: 0.5, weakMagnitude: 0.4 })?.catch?.(() => {}) : gp?.hapticActuators?.[0]?.pulse?.(0.5, 220); } catch { /* bez vibrací */ }
  }, 50);
});
window.addEventListener('gamepaddisconnected', () => toast('🎮 Ovladač odpojen'));

// ------------------------------------------------------------ menu
let demo = null;   // ukázková jízda autopilota v menu
function ensureBackdrop() {
  if (!backdrop) backdrop = new Track(clone(BUILTIN.find(t => t.id === 'kaskader')), world.M);
  world.scene.add(backdrop.group);
  if (!demo) {
    demo = { ai: new Autopilot(backdrop), cams: makeTvCams(backdrop), stuck: 0, acc: 0, n: 2 };
    demoReset();
  }
  world.scene.add(demo.model.root);
  world.setShadowSize(90);
  world.skids.clear(); world.smoke.clear();
  camState.tv = -1;
}
function demoReset() {
  // při každém restartu jiné auto
  const ids = Object.keys(CARS), spec = CARS[ids[demo.n++ % ids.length]];
  if (demo.model) { world.scene.remove(demo.model.root); demo.model.dispose(); }
  demo.car = new Vehicle(spec); demo.model = buildCarModel(spec);
  if (mode === 'menu' || !mode) world.scene.add(demo.model.root);
  const p = backdrop.startPose();
  demo.car.reset(p.p, p.t);
  demo.ai.reset(demo.car.pos);
  demo.stuck = 0;
}
function hideBackdrop() {
  if (backdrop) world.scene.remove(backdrop.group);
  if (demo) world.scene.remove(demo.model.root);
}
function updateDemo(dt) {
  const { car, model, ai } = demo;
  demo.acc += Math.min(dt, 1 / 20);
  while (demo.acc >= STEP) { car.step(STEP, ai.input(car), backdrop); demo.acc -= STEP; }
  processHits(car, model, false);
  if (car.destroyed) { demoReset(); return; }
  demo.stuck = car.speed < 2 || car.isUpsideDown() || car.crashed ? demo.stuck + dt : 0;
  demo.laps = (demo.laps || 0) + dt;
  if (demo.stuck > 3 || car.pos.y < -5 || demo.laps > 75) { demo.laps = 0; demoReset(); }
  model.root.position.copy(car.pos);
  model.root.quaternion.copy(car.quat);
  model.update(car);
  effects(dt, car, car.wheels);
  updateCamera(dt, car.pos, car.quat, 'tv', demo.cams, car.speed);
  world.focusShadow(car.pos);
}

function showMenu() {
  cleanupReplay();
  cleanupRace();
  if (editor.active) editor.close();
  closeDialog();
  $('hud').classList.add('hidden');
  ensureBackdrop();
  mode = 'menu';
  show('menu');
}

let menuAngle = 0.6;
function menuCamera(dt) {
  menuAngle += dt * 0.04;
  const cam = world.camera;
  cam.up.set(0, 1, 0);
  cam.fov = 50; cam.updateProjectionMatrix();
  cam.position.set(Math.cos(menuAngle) * 330 + 40, 120 + Math.sin(menuAngle * 0.7) * 30, Math.sin(menuAngle) * 330);
  cam.lookAt(-40, 0, 0);
}

document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
  audio.init(); audio.setMuted(settings.muted);
  const g = b.dataset.go;
  if (g === 'select') { duel = false; openSelect(); }
  else if (g === 'duel') { duel = true; openSelect('car', 0); }
  else if (g === 'editor') openEditor();
  else if (g === 'help') { prevScreen = mode === 'menu' ? 'menu' : prevScreen; mode = 'help'; show('help'); }
  else if (g === 'menu') showMenu();
  else if (g === 'back') { mode = 'menu'; show('menu'); }
});

function allTracks() { return [...BUILTIN, ...Store.tracks()]; }

// výběr: 1) auto (ve hře pro dva postupně pro hráče 1 a 2), 2) trať
let diffFilter = 0;   // 0 = vše, 1–4 = obtížnost předpřipravených tratí, 5 = jen vlastní
let duel = false, pick = 0;                      // hra pro dva / který hráč právě vybírá auto
const duelCars = settings.duelCars || ['gt', 'gt'];
const mapCache = new Map();
function openSelect(step = 'car', p = 0) {
  mode = 'select';
  pick = p;
  show('select');
  $('stepCar').classList.toggle('hidden', step !== 'car');
  $('stepTrack').classList.toggle('hidden', step !== 'track');
  if (step === 'car') renderCars(); else renderTracks();
}
function selectIn(listId, card) {
  document.querySelectorAll('#' + listId + ' .card').forEach(c => c.classList.toggle('sel', c === card));
}
const curCar = () => duel ? duelCars[pick] : settings.car;
const curColor = id => duel ? P_COLORS[pick] : settings.colors[id] ?? null;
function carThumb(id, color) {
  const k = id + ':' + color;
  return (thumbs[k] ||= carThumbnail(paintedSpec(id, color)));
}
function renderCars() {
  $('carTitle').innerHTML = duel
    ? `<span style="color:${hexCss(P_COLORS[pick])}">${pick ? 'Hráč 2 – modré auto' : 'Hráč 1 – červené auto'}</span> <small class="muted">(${pick ? 'šipky' : 'W A S D'})</small>`
    : 'Vyber auto';
  $('stepsCar').innerHTML = duel
    ? `<b class="${pick ? '' : 'on'}">1. Hráč 1</b><span>›</span><b class="${pick ? 'on' : ''}">2. Hráč 2</b><span>›</span><b>3. Trať</b>`
    : '<b class="on">1. Auto</b><span>›</span><b>2. Trať</b>';
  $('nextBtn').textContent = duel && !pick ? 'Dále – auto hráče 2 ▶' : 'Dále – výběr trati ▶';
  const cl = $('carList'); cl.innerHTML = '';
  for (const [id, c] of Object.entries(CARS)) {
    const card = document.createElement('div');
    card.className = 'card' + (curCar() === id ? ' sel' : '');
    const bar = (n, v) => `<div class="stat">${n}<i><b style="width:${v * 20}%"></b></i></div>`;
    card.innerHTML = `<img class="car-thumb" alt="" src="${carThumb(id, curColor(id))}">
      <div class="name">${c.name}</div><div class="desc">${c.desc}</div>
      ${bar('Rychlost', c.stats.speed)}${bar('Zrychlení', c.stats.accel)}${bar('Přilnavost', c.stats.grip)}`;
    card.onclick = () => {
      if (duel) { duelCars[pick] = id; settings.duelCars = duelCars; } else settings.car = id;
      Store.saveSettings(settings); selectIn('carList', card); renderColors();
    };
    card.ondblclick = () => nextFromCar();
    cl.appendChild(card);
  }
  renderColors();
}
// základní barva vybraného auta (jen sólo; ve hře pro dva je barva daná hráčem)
function renderColors() {
  const row = $('colorRow');
  row.classList.toggle('hidden', duel);
  if (duel) return;
  const id = settings.car, cur = settings.colors[id] ?? null;
  row.innerHTML = '<span class="lbl">Barva:</span>';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === cur ? ' on' : '') + (c == null ? ' orig' : '');
    b.title = c == null ? 'Původní barva' : hexCss(c);
    b.style.background = c == null ? hexCss(CARS[id].look.base) : hexCss(c);
    if (c == null) b.textContent = '↺';
    b.onclick = () => {
      if (c == null) delete settings.colors[id]; else settings.colors[id] = c;
      Store.saveSettings(settings);
      const img = [...$('carList').children][Object.keys(CARS).indexOf(id)]?.querySelector('img');
      if (img) img.src = carThumb(id, c);
      renderColors();
    };
    row.appendChild(b);
  }
}
function nextFromCar() { if (duel && pick === 0) openSelect('car', 1); else openSelect('track'); }
function renderTracks() {
  $('carChosen').textContent = duel ? `· ${CARS[duelCars[0]].name} vs. ${CARS[duelCars[1]].name}` : '· ' + (CARS[settings.car] || CARS.gt).name;
  $('ghostLbl').classList.toggle('hidden', duel);
  document.querySelectorAll('#diffSeg button').forEach(b => {
    b.classList.toggle('on', +b.dataset.d === diffFilter);
    b.onclick = () => { diffFilter = +b.dataset.d; renderTracks(); };
  });
  const list = $('trackList'); list.innerHTML = '';
  const tracks = allTracks().filter(t => !diffFilter || (diffFilter === 5 ? !t.builtin : t.builtin && t.difficulty === diffFilter));
  for (const tr of tracks) {
    const card = document.createElement('div');
    card.className = 'card' + (tr.id === selectedTrack ? ' sel' : '');
    const key = tr.id + ':' + tr.tiles.length;
    if (!mapCache.has(key)) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 200;
      drawTrackMap(cv.getContext('2d'), tr.tiles, 200, { deco: true, bg: '#3f5f2e', fit: true });
      mapCache.set(key, cv.toDataURL());
    }
    const best = Store.best(tr.tiles, settings.laps);
    card.innerHTML = `<img class="map" alt=""><div class="name"></div><div class="desc"></div><div class="meta"><span>${tr.builtin ? '★'.repeat(tr.difficulty) + '☆'.repeat(4 - tr.difficulty) : 'Vlastní'}</span><span>🏆 ${best ? fmt(best.time) : '—'}</span></div>`;
    card.querySelector('.map').src = mapCache.get(key);
    card.querySelector('.name').textContent = tr.name;
    card.querySelector('.desc').textContent = tr.desc || (tr.file ? `myTracks/${tr.file} · ` : '') + `${tr.tiles.length} dílků`;
    card.onclick = () => { selectedTrack = tr.id; settings.track = tr.id; Store.saveSettings(settings); selectIn('trackList', card); };
    card.ondblclick = () => startSelected();
    if (!tr.builtin && !tr.readonly) {   // tratě ze složky na webu (jen pro čtení) nejdou smazat
      const rm = document.createElement('button'); rm.className = 'del'; rm.textContent = '🗑';
      rm.onclick = ev => { ev.stopPropagation(); dialog('Smazat trať', `<p>Opravdu smazat „${tr.name.replace(/</g, '&lt;')}“?</p>`, [['Ne'], ['Smazat', async () => { try { await Store.deleteTrack(tr.id); } catch (e) { toast('Smazání se nepovedlo: ' + e.message); } renderTracks(); }, true]]); };
      card.appendChild(rm);
    }
    list.appendChild(card);
  }
  if (!tracks.length) list.innerHTML = diffFilter === 5 ? '<p class="muted">Zatím žádná vlastní trať – postav ji v editoru a ulož.</p>' : '<p class="muted">Žádná trať v této obtížnosti.</p>';
  document.querySelectorAll('#lapsSeg button').forEach(b => {
    b.classList.toggle('on', +b.dataset.l === settings.laps);
    b.onclick = () => { settings.laps = +b.dataset.l; Store.saveSettings(settings); renderTracks(); };
  });
  document.querySelectorAll('#oppSeg button').forEach(b => {
    b.classList.toggle('on', +b.dataset.o === oppLevel(settings.opponents));
    b.onclick = () => { settings.opponents = +b.dataset.o; Store.saveSettings(settings); renderTracks(); };
  });
  $('ghostChk').checked = settings.ghost;
  $('ghostChk').onchange = e => { settings.ghost = e.target.checked; Store.saveSettings(settings); };
}
$('nextBtn').onclick = () => nextFromCar();
$('backCarBtn').onclick = () => openSelect('car', duel ? 1 : 0);
$('carBackBtn').onclick = () => { if (duel && pick === 1) openSelect('car', 0); else showMenu(); };
const thumbs = {};
function startSelected() {
  const tr = allTracks().find(t => t.id === selectedTrack) || BUILTIN[0];
  startRace(clone(tr), { ...(duel ? { duel: true, cars: [...duelCars] } : {}), opponents: oppLevel(settings.opponents) });
}
$('startBtn').onclick = () => { audio.init(); startSelected(); };

function openEditor() {
  cleanupRace();
  hideBackdrop();
  mode = 'editor';
  show(null);
  $('hud').classList.add('hidden');
  world.camera.fov = 50; world.camera.updateProjectionMatrix();
  editor.open();
}

// ------------------------------------------------------------ závod
const CAMS = ['chase', 'far', 'hood', 'cockpit', 'tv'];
const CAM_NAMES = { chase: 'Kamera: za autem', far: 'Kamera: vzdálená', hood: 'Kamera: kapota', cockpit: 'Kamera: kokpit', tv: 'Kamera: TV', heli: 'Kamera: vrtulník' };
// Vrstvy kamer: karoserie hráče i = vrstva 10+i, jeho kokpit = 20+i. V kokpitu vlastní kamera karoserii
// nevidí (jen kola), ostatní hráči ano; kokpit vidí jen jeho vlastní kamera v režimu kokpitu.
function setCamLayers(P) {
  const cam = P.cam;
  cam.layers.set(0);
  for (const Q of R.players) if (Q !== P || CAMS[P.camMode] !== 'cockpit') cam.layers.enable(10 + Q.i);
  if (CAMS[P.camMode] === 'cockpit') cam.layers.enable(20 + P.i);
}
function camLabel(c) { $('hCam').textContent = CAM_NAMES[c] + ' (C)'; }

function startRace(data, opts = {}) {
  cleanupReplay();
  cleanupRace();
  if (editor.active) editor.close();
  hideBackdrop();
  closeDialog();
  audio.init(); audio.setMuted(settings.muted);

  const track = new Track(data, world.M);
  world.scene.add(track.group);
  const isDuel = !!opts.duel;
  // hráči: sólo = jeden (auto a barva z nastavení), hra pro dva = červený a modrý
  const ids = isDuel ? opts.cars : [opts.car || settings.car];
  const pColors = ids.map((id, i) => isDuel ? P_COLORS[i] : settings.colors[id] ?? CARS[id].look.base);
  // soupeři (jen na uzavřené trati): stejná auta jako hráči, jiné barvy; stojí v předních řadách, hráči vzadu
  const nRiv = opts.opponents && track.analysis.closed ? RIVALS.length : 0;
  const slots = gridPoses(track, nRiv + ids.length, isDuel && !nRiv);
  const near = (a, b) => Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255)) < 90;
  const rColors = RIVAL_COLORS.filter(col => !pColors.some(pc => near(col, pc)));
  const entrant = (i, id, color, pose, spec = CARS[id] || CARS.gt) => {
    const car = new Vehicle(spec);
    car.reset(pose.p, pose.t);
    const modelSpec = paintedSpec(id, color);
    const model = buildCarModel(modelSpec);
    world.scene.add(model.root);
    return {
      i, id, car, model, modelSpec, color, arrow: null,
      reached: 0, lastCp: 0, lap: 1, lapTimes: [], prevS: -1, missed: false, warnT: 0, upsideT: 0, waterT: 0, stuckT: 0,
      camMode: 0, shake: 0, lastImpact: 0, hudDmg: null, done: null, time: null, doneT: 0,
    };
  };
  const players = ids.map((id, i) => {
    const P = entrant(i, id, isDuel ? P_COLORS[i] : settings.colors[id] ?? null, slots[nRiv + i]);
    P.arrow = makeArrow(); world.scene.add(P.arrow);
    // kokpit + vrstvy (karoserie bez kol → 10+i, kokpit → 20+i)
    P.cockpit = buildCockpit(P.modelSpec);
    const wheelMeshes = new Set();
    for (const w of P.model.wheels) w.steerG.traverse(o => { if (o.isMesh) wheelMeshes.add(o); });
    // u formule zůstanou kola z kokpitu vidět, u zavřených aut je zakryje kapota
    P.model.root.traverse(o => { if (o.isMesh && (!P.cockpit.open || !wheelMeshes.has(o))) o.layers.set(10 + i); });
    P.cockpit.group.traverse(o => o.layers.set(20 + i));
    P.model.root.add(P.cockpit.group);
    P.cam = isDuel ? new THREE.PerspectiveCamera(62, 2, 0.2, 6000) : world.camera;
    P.cs = isDuel ? newCamState() : camState;
    P.cs.eye = P.cockpit.eye;
    return P;
  });
  // na startu stojí rychlejší auta vpředu, pomalejší vzadu (hráči úplně vzadu)
  const field = RIVALS.slice(0, nRiv).sort((a, b) => TOP[b.car] / ACC[b.car] - TOP[a.car] / ACC[a.car]);
  const rivals = field.map((rv, r) => {
    const L = RIVAL_LEVEL[oppLevel(opts.opponents)], base = CARS[rv.car];
    const P = entrant(ids.length + r, rv.car, rColors[r % rColors.length], slots[r], { ...base, grip: base.grip * L.grip });
    P.isAI = true; P.rv = rv; P.name = rv.name;
    const corner = Math.min(rv.corner * L.corner, CORNER_MAX[rv.car] ?? 9);
    P.ai = new Autopilot(track, { ...rv, corner, brake: rv.brake * L.brake, racingLine: L.line, lane: L.line ? 0 : rv.lane });
    P.ai.reset(P.car.pos);
    return P;
  });
  // cílové časy kola soupeřů: ideální čas auta hráče (průměr hráčů) + margin povahy
  if (rivals.length) {
    const ref = new Autopilot(track, { racingLine: RIVAL_LEVEL[oppLevel(opts.opponents)].line });   // ideální jízda (bez povahy)
    const tp = ids.reduce((s, id) => s + ref.estimateLap(TOP[id] / 3.6, ACC[id]) * EST[id], 0) / ids.length;
    for (const P of rivals) { P.target = tp * (1 + P.rv.margin + RIVAL_LEVEL[oppLevel(opts.opponents)].pace); P.dist = null; }
  }
  const { car, model } = players[0];
  const spec = car.spec;
  const closed = track.analysis.closed;
  const laps = closed ? settings.laps : 0;
  const best = closed && !isDuel ? Store.best(data.tiles, laps) : null;
  let ghost = null;
  if (!isDuel && closed && settings.ghost && best && best.ghost && best.ghost.length) {
    const gm = buildCarModel(CARS[best.car] || spec, { ghost: true });
    gm.root.visible = false;
    world.scene.add(gm.root);
    ghost = { frames: best.ghost, model: gm };
  }
  const st = track.tiles.find(t => t.type === 'start');
  const sw = st ? pathWorld(st, 0.5) : null;
  R = {
    data, opts, track, car, model, modelSpec: players[0].modelSpec, closed, laps, best, ghost, players, rivals, duel: isDuel,
    all: [...players, ...rivals], recAI: [],
    phase: 'countdown', count: 3.6, time: 0, lapStart: 0,
    rec: [], stepN: 0, acc: 0, paused: false, finishT: 0, endTimer: null,
    startCenter: sw ? sw.p : null, startDir: sw ? sw.t : null,
    tvCams: makeTvCams(track), dents: [],
  };
  R.minimap = makeMinimapBase(track);
  $('warn').classList.add('hidden');
  world.skids.clear(); world.smoke.clear();
  world.setShadowSize(90);
  for (const P of players) resetCamera(P.car, P.cs);
  world.views = isDuel ? players.map(P => ({ camera: P.cam, focus: P.car.pos })) : null;
  mode = 'race';
  show(null);
  $('hud').classList.remove('hidden');
  $('hud').classList.toggle('duel', isDuel);
  $('duelHud').classList.toggle('hidden', !isDuel);
  if (isDuel) players.forEach(P => { const el = $('pl' + P.i); el.querySelector('.nm').style.color = hexCss(P_COLORS[P.i]); el.querySelector('.pmsg').textContent = ''; el.querySelector('.pwarn').classList.add('hidden'); });
  $('hBest').textContent = best ? fmt(best.time) : '—';
  $('hPosBox').classList.toggle('hidden', !nRiv);
  $('replayBtn').style.display = isDuel ? 'none' : '';
  camLabel(CAMS[players[0].camMode]);
  $('pauseEditorBtn').classList.toggle('hidden', !opts.fromEditor);
  $('resEditorBtn').classList.toggle('hidden', !opts.fromEditor);
  if (!closed) message('VOLNÁ JÍZDA', 2.5, track.analysis.error || '');
}

function cleanupRace() {
  if (!R) return;
  world.scene.remove(R.track.group);
  R.track.dispose();
  world.scene.remove(R.model.root); R.model.dispose();
  for (const P of R.all) {
    P.cockpit?.dispose();
    if (P.i > 0) { world.scene.remove(P.model.root); P.model.dispose(); }
    if (P.arrow) world.scene.remove(P.arrow);
  }
  if (R.ghost) { world.scene.remove(R.ghost.model.root); R.ghost.model.dispose(); }
  $('warn').classList.add('hidden');
  $('duelHud').classList.add('hidden');
  $('hud').classList.remove('duel');
  world.views = null;
  world.camera.layers.enableAll();
  R = null;
  message('');
}

function togglePause() {
  if (!R || raceOver()) return;
  R.paused = !R.paused;
  show(R.paused ? 'pause' : null);
}
$('resumeBtn').onclick = () => togglePause();
$('restartBtn').onclick = () => { const d = R.data, o = R.opts; startRace(d, o); };
$('pauseMenuBtn').onclick = () => showMenu();
$('pauseEditorBtn').onclick = () => backToEditor();
$('resMenuBtn').onclick = () => showMenu();
$('resEditorBtn').onclick = () => backToEditor();
$('againBtn').onclick = () => { const d = R.data, o = R.opts; startRace(d, o); };
$('replayBtn').onclick = () => startReplay();

function backToEditor() {
  cleanupReplay(); cleanupRace();
  $('hud').classList.add('hidden');
  mode = 'editor'; show(null);
  world.camera.fov = 50; world.camera.updateProjectionMatrix();
  editor.open();
}

// startovní rošt: 3 auta vedle sebe, řady po 8 m směrem dozadu po trati (i přes zatáčku před startem)
function gridPoses(track, count, pair) {
  const pose = track.startPose(), up = new THREE.Vector3(0, 1, 0);
  const side = t => new THREE.Vector3().crossVectors(t, up).normalize();
  if (count === 1) return [pose];
  if (pair) return [-2.6, 2.6].map(x => ({ p: pose.p.clone().addScaledVector(side(pose.t), x), t: pose.t.clone() }));
  const order = track.analysis.order, rows = Math.ceil(count / 3), need = (rows - 1) * 8 + 1;
  // body trati od startu dozadu
  const pts = [];
  const push = (o, s) => { const w = pathWorld(o.tile, o.fwd ? s : 1 - s, o.k || 0); if (!o.fwd) w.t.negate(); w.p.addScaledVector(w.n, 0.8); pts.push(w); };
  if (track.analysis.closed) {
    for (let s = 0.3; s >= 0; s -= 0.01) push(order[0], s);
    for (let k = order.length - 1, len = 0; k > 0 && len < need + 10; k--) { for (let s = 1; s >= 0; s -= 0.02) push(order[k], s); len += 40; }
  }
  const at = d => {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = pts[i].p.distanceTo(pts[i - 1].p);
      if (acc + seg >= d) return pts[i];
      acc += seg;
    }
    return { p: pose.p.clone().addScaledVector(pose.t, -d), t: pose.t };
  };
  const out = [];
  for (let k = 0; k < count; k++) {
    const q = at(Math.floor(k / 3) * 8), lat = [-3.2, 0, 3.2][k % 3];
    out.push({ p: q.p.clone().addScaledVector(side(q.t), lat), t: q.t.clone() });
  }
  return out;
}

function makeTvCams(track) {
  const cams = [];
  const order = track.analysis.order.length ? track.analysis.order : track.tiles.filter(t => t.type in { straight: 1, curve: 1, start: 1 }).map(tile => ({ tile, fwd: true }));
  order.forEach((o, i) => {
    if (i % 2) return;
    const w = pathWorld(o.tile, 0.5, o.k || 0);
    const side = new THREE.Vector3().crossVectors(w.t, new THREE.Vector3(0, 1, 0)).normalize();
    const big = LOOPS[o.tile.type] ? 1.6 : 1;
    const p = w.p.clone().addScaledVector(side, (i % 4 ? 15 : -15) * big);
    p.y = Math.max(p.y, (o.tile.e || 0) * 5) + 4 + 4 * big;
    cams.push(p);
  });
  return cams;
}

function respawn(P = R.players[0]) {
  const { track } = R, car = P.car;
  let pose;
  if (!R.closed) pose = track.startPose();
  else {
    const order = track.analysis.order;
    let i = P.lastCp;
    // před loopingem/skokem vrátit o kus dál, aby byl rozjezd
    const special = t => LOOPS[t.type] || ['kicker', 'landing', 'slalom', 'obstacleC', 'obstacleS', 'chicane', 'waves', 'trampoline', 'sideRamp'].includes(t.type);
    if (special(order[i].tile) || (order[i + 1] && special(order[i + 1].tile))) {
      while (i > 0 && special(order[i].tile)) i--;
      for (let k = 0; k < 2 && i > 0 && !special(order[i - 1].tile) && !order[i - 1].tile.type.startsWith('bigcurve'); k++) i--;
    }
    pose = track.poseOn(order[i].tile, order[i].fwd, 0.15, order[i].k || 0);
  }
  car.reset(pose.p, pose.t);
  if (P.isAI) { P.ai.reset(car.pos); P.stuckT = 0; P.farT = 0; }
  else if (P.i === 0) R.ai?.reset(car.pos);
  if (!P.isAI) R.duelAI?.[P.i].reset(car.pos);
  P.prevPos?.copy(car.pos); P.prevQuat?.copy(car.quat);   // po přenesení nedopočítávat let přes mapu
  for (let w = 0; w < 4; w++) world.skids.lift(w + P.i * 4);
  P.upsideT = P.waterT = 0;
  setMissed(P, false);
  if (P.cs) resetCamera(car, P.cs);
}

// Kontrolní body = dílky trati v pořadí jízdy. Vynechat lze nejvýš 1 dílek (krátké vyjetí mimo trať);
// větší zkratka se nezapočítá a hráč dostane upozornění se šipkou zpět ke kontrolnímu bodu.
const MAX_SKIP = 1;
// Poloha auta pro vykreslení: fyzika běží po 1/240 s, snímek se kreslí kdykoli mezi kroky – bez dopočtu by auto
// cukalo (jednou 4, podruhé 5 kroků na snímek). Mezi stavem před a po posledním kroku se plynule dopočítá.
function renderPose(P) {
  const car = P.car;
  if (!P.prevPos || P.done === 'out') return { pos: car.pos, quat: car.quat };
  const a = Math.max(0, Math.min(1, R.acc / STEP));
  P.rPos ||= new THREE.Vector3(); P.rQuat ||= new THREE.Quaternion();
  P.rPos.lerpVectors(P.prevPos, car.pos, a);
  P.rQuat.slerpQuaternions(P.prevQuat, car.quat, a);
  return { pos: P.rPos, quat: P.rQuat };
}

// motory ostatních aut pro zvuk: nejbližší tři ke kameře hráče, stereo podle polohy vůči kameře,
// Dopplerův jev podle rychlosti přibližování (zvuk 343 m/s)
const _ne = new THREE.Vector3(), _nr = new THREE.Vector3(), _nv = new THREE.Vector3();
function nearbyEngines(me, cam) {
  _nr.set(1, 0, 0).applyQuaternion(cam.quaternion);
  const list = [];
  for (const Q of R.all) {
    if (Q === me || Q.done === 'out' || !Q.car) continue;
    _ne.subVectors(Q.car.pos, cam.position);
    const dist = _ne.length();
    if (dist > 90) continue;
    _ne.divideScalar(dist || 1);
    const approach = -_nv.subVectors(Q.car.vel, me.car.vel).dot(_ne);
    list.push({ spec: Q.car.spec, rpm: Q.car.rpm, throttle: Q.car.throttle || 0, dist, pan: _ne.dot(_nr) * 0.9,
      doppler: THREE.MathUtils.clamp(343 / (343 - approach), 0.8, 1.25) });
  }
  return list.sort((a, b) => a.dist - b.dist).slice(0, 3);
}

// stojí auto na vozovce koly na obou stranách? (kolo na trávě = kontakt se zemí, ne s dílkem)
function bothSidesOnRoad(car) {
  let left = false, right = false;
  for (const w of car.wheels) if (w.contact && !w.ground) { if (w.local.x > 0) left = true; else right = true; }
  return left && right;
}

function progress(P) {
  const { track } = R, car = P.car;
  if (!R.closed || R.phase !== 'racing' || P.done) return;
  const order = track.analysis.order, n = order.length;
  // Dílek se počítá, jen když auto opravdu jede po jeho vozovce (i výškově – pod mostem se most nepočítá);
  // ve vzduchu se nevyhodnocuje. Varování o zkratce až po 0,4 s, aby ho nespustil jeden okamžik (např. odraz
  // ze skokánku nad sousední silnicí). Na startovním roštu za čarou (konec kola, ještě bez bodu) se nehlásí.
  // Průjezd se uzná, jen když má auto aspoň v některé části dílku kola na obou stranách na vozovce (ne jedním bokem
  // na trávě). Výjimka – let: přeletěný dílek (skok, trampolína) se uzná bez dotyku, je-li na řadě a auto letí nad jeho silnicí.
  const t = track.tileAt(car.pos.x, car.pos.z);
  let skip = false;
  // V rouře a loopingu stačí jet uvnitř (kola mohou být kdekoli na stěně, auto může i přeskočit).
  const inside = t && LOOPS[t.type];
  const air = !car.onGround && !inside;
  if (t && (inside ? track.onTilePath(t, car.pos, 'inside') : air ? track.onTilePath(t, car.pos, true) : bothSidesOnRoad(car) && track.onTilePath(t, car.pos))) {
    const idx = track.orderIndex.get(t) || [];
    const i = air ? idx.find(i => i === P.reached + 1) : idx.find(i => i > P.reached && i <= P.reached + 1 + MAX_SKIP);
    if (i !== undefined) { P.reached = i; P.lastCp = i; P.missT = 0; if (P.missed) setMissed(P, false); }
    else if (!air) skip = idx.length > 0 && idx.every(i => i > P.reached + 1 + MAX_SKIP) && !(P.reached === 0 && idx.every(i => i >= n - 3));
  }
  P.missT = skip ? (P.missT || 0) + STEP : 0;
  if (P.missT > 0.4) setMissed(P, true);
  const d = _v.subVectors(car.pos, R.startCenter);
  const s = d.dot(R.startDir);
  const side = Math.abs(d.x * R.startDir.z - d.z * R.startDir.x);
  if (P.prevS < 0 && s >= 0 && s < 8 && side < 12 && Math.abs(d.y) < 2.5) {   // jen na úrovni startu (ne přes něj po mostě)
    if (P.reached >= n - 1 - MAX_SKIP) {
      const lapStart = P.lapTimes.reduce((a, b) => a + b, 0);
      P.lapTimes.push(R.time - lapStart);
      P.reached = 0; P.lastCp = 0;
      if (P.missed) setMissed(P, false);
      if (P.lap >= R.laps) { if (P.isAI) { P.done = 'finish'; P.time = R.time; } else if (R.duel) duelFinish(P); else finishRace(); }
      else {
        P.lap++;
        const txt = P.lap === R.laps ? 'POSLEDNÍ KOLO' : 'KOLO ' + P.lap;
        if (P.isAI) return void (P.prevS = s);
        if (R.duel) pMessage(P, txt + ' · ' + fmt(P.lapTimes.at(-1)), 2);
        else message(txt, 1.5, 'Čas kola ' + fmt(P.lapTimes.at(-1)));
        audio.beep(880, 0.25);
      }
    } else if (P.reached > 0) setMissed(P, true);   // zkratka rovnou do cíle
  }
  P.prevS = s;
}

// upozornění na vynechaný kontrolní bod
function setMissed(P, v) {
  if (P.missed === v) return;
  P.missed = v;
  if (P.isAI) return;
  if (R.duel) $('pl' + P.i).querySelector('.pwarn').classList.toggle('hidden', !v);
  else $('warn').classList.toggle('hidden', !v);
  P.arrow.visible = v;
  if (v) { audio.beep(330, 0.3); setTimeout(() => R && P.missed && audio.beep(330, 0.3), 350); }
}
function missedTarget(P) {
  const order = R.track.analysis.order;
  const o = order[(P.reached + 1) % order.length];
  return pathWorld(o.tile, o.fwd ? 0.25 : 0.75, o.k || 0).p;
}
function makeArrow() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc53d, depthTest: false, transparent: true, opacity: 0.95 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 1.6), mat); shaft.position.z = -0.3;
  const headG = new THREE.ConeGeometry(0.75, 1.2, 4); headG.rotateX(Math.PI / 2); headG.rotateZ(Math.PI / 4);
  const head = new THREE.Mesh(headG, mat); head.position.z = 1.0; head.scale.y = 0.35;
  g.add(shaft, head);
  g.traverse(o => { o.renderOrder = 10; });
  g.visible = false;
  return g;
}
function updateMissed(P, dt) {
  if (!P.missed) return;
  const target = missedTarget(P), car = P.car;
  const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
  P.arrow.position.set(car.pos.x, car.pos.y + 2.6 + Math.sin(performance.now() / 180) * 0.15, car.pos.z);
  P.arrow.rotation.set(0, Math.atan2(dx, dz), 0);
  P.warnT -= dt;
  if (P.warnT <= 0 && !R.duel) {
    P.warnT = 0.2;
    $('warnDist').textContent = Math.round(Math.hypot(dx, dz, target.y - car.pos.y)) + ' m';
  }
}

// ------------------------------------------------------------ hra pro dva
function pMessage(P, text, dur = 2.5) {
  const el = $('pl' + P.i).querySelector('.pmsg');
  el.textContent = text; el.classList.add('show');
  P.msgT = dur;
}
function duelFinish(P) {
  P.done = 'finish'; P.time = R.time;
  const place = R.players.filter(q => q.done === 'finish').length;
  pMessage(P, (place === 1 ? '🏆 CÍL! 1. místo' : 'CÍL! 2. místo') + ' · ' + fmt(P.time), 99);
  audio.beep(place === 1 ? 1040 : 700, 0.4);
  if (R.players.some(q => !q.done)) R.endTimer = 30;          // soupeř má 30 s na dojetí
}
function duelOut(P) {
  const kmh = P.car.crashed ? Math.round(P.car.crashed.speed * 3.6) : 0;
  P.done = P.car.crashed ? 'crash' : 'destroyed';
  P.model.setBurnt(true);
  setMissed(P, false);
  rumble(P.i, 1, 700);
  audio.bang(3); P.shake = 1;
  for (let k = 0; k < 30; k++) world.smoke.emit(P.car.pos, _v2.set(0, 0, 0), 1, k % 3 ? 2 : 3);
  pMessage(P, P.car.crashed ? `💥 HAVÁRIE (${kmh} km/h) – vypadáváš` : '🔧 AUTO ZNIČENO – vypadáváš', 99);
}
function duelCheckEnd() {
  if (R.players.every(P => P.done)) endDuel();
}
function endDuel() {
  for (const P of R.players) if (!P.done) { P.done = 'timeout'; pMessage(P, '⏱ Čas vypršel', 99); }
  R.phase = 'finished';
  R.finishT = 0;
  const fin = R.players.filter(P => P.done === 'finish').sort((a, b) => a.time - b.time);
  const w = fin[0];
  message(w ? P_NAMES[w.i] + ' VYHRÁL!' : 'NIKDO NEDOJEL', 2.5);
  $('resTitle').innerHTML = w ? `Vítěz: <span style="color:${hexCss(P_COLORS[w.i])}">${w.i ? 'Hráč 2 (modrý)' : 'Hráč 1 (červený)'}</span>` : 'Nikdo nedojel do cíle';
  $('resTime').textContent = w ? fmt(w.time) : '—';
  $('resBadge').style.display = 'none';
  const why = { crash: 'havárie', destroyed: 'auto zničeno', timeout: 'nedojel včas' };
  $('resLaps').innerHTML = R.rivals.length ? standingsHtml(standings())
    : R.players.map(P => `<span style="color:${hexCss(P_COLORS[P.i])}">■</span> ${P.i ? 'Hráč 2' : 'Hráč 1'} (${CARS[P.id].name}): ${P.done === 'finish' ? fmt(P.time) : why[P.done]}`).join('<br>');
  $('resBest').textContent = fin.length === 2 ? `Rozdíl ${(fin[1].time - fin[0].time).toFixed(2)} s` : '';
}
// vzájemné srážky aut: každé auto = dva kruhy (předek, záď) v rovině, pružný odraz s částečnou ztrátou energie
const _ca = [new THREE.Vector3(), new THREE.Vector3()], _cb = [new THREE.Vector3(), new THREE.Vector3()], _cn = new THREE.Vector3();
function carContacts(a, b) {
  if (Math.abs(a.pos.y - b.pos.y) > 2.2 || a.pos.distanceToSquared(b.pos) > 64) return 0;
  const circles = (c, out) => {
    const f = _cn.set(0, 0, 1).applyQuaternion(c.quat); f.y = 0; f.normalize();
    out[0].copy(c.pos).addScaledVector(f, c.d.hl * 0.5); out[1].copy(c.pos).addScaledVector(f, -c.d.hl * 0.5);
  };
  circles(a, _ca); circles(b, _cb);
  const ra = a.d.hw + 0.15, rb = b.d.hw + 0.15, ma = a.spec.mass, mb = b.spec.mass;
  let hit = 0;
  for (const pa of _ca) for (const pb of _cb) {
    _cn.subVectors(pa, pb); _cn.y = 0;
    const d = _cn.length(), over = ra + rb - d;
    if (over <= 0 || d < 1e-4) continue;
    _cn.divideScalar(d);
    a.pos.addScaledVector(_cn, over * mb / (ma + mb)); b.pos.addScaledVector(_cn, -over * ma / (ma + mb));
    const vrel = _v.subVectors(a.vel, b.vel).dot(_cn);
    if (vrel < 0) {
      const j = -(1.3) * vrel / (1 / ma + 1 / mb);
      a.vel.addScaledVector(_cn, j / ma); b.vel.addScaledVector(_cn, -j / mb);
      hit = Math.max(hit, -vrel);
    }
  }
  return hit;
}
function recordFrame() {
  const r3 = x => Math.round(x * 1000) / 1000;
  if (R.rivals.length) R.recAI.push(R.rivals.map(P => [P.car.pos.x, P.car.pos.y, P.car.pos.z, P.car.quat.x, P.car.quat.y, P.car.quat.z, P.car.quat.w].map(r3)));
  const c = R.car, q = c.quat, p = c.pos;
  R.rec.push([p.x, p.y, p.z, q.x, q.y, q.z, q.w, c.steer, c.fwdSpeed, c.rpm, c.throttle, c.braking, c.skid, c.onGround ? 1 : 0,
    c.wheels[0].comp, c.wheels[1].comp, c.wheels[2].comp, c.wheels[3].comp]);
}

function finishRace() {
  R.players[0].done = 'finish'; R.players[0].time = R.time;
  R.phase = 'finished';
  R.finishT = 0;
  recordFrame();
  const total = R.time;
  const key = R.data.tiles;
  const prev = Store.best(key, R.laps);
  const isBest = !R.aiUsed && (!prev || total < prev.time);
  if (isBest) {
    const r3 = x => Math.round(x * 1000) / 1000;
    const ghost = R.rec.map(f => f.slice(0, 7).map(r3));
    Store.saveBest(key, R.laps, { time: total, car: settings.car, date: Date.now(), ghost });
  }
  const place = R.rivals.length ? standings().indexOf(R.players[0]) + 1 : 0;
  message(place ? place + '. MÍSTO' : 'CÍL!', 2.5, fmt(total));
  audio.beep(1040, 0.4);
  $('resTitle').textContent = (place ? place + '. místo – ' : 'Cíl – ') + (R.data.name || '');
  $('resTime').textContent = fmt(total);
  $('resBadge').style.display = isBest ? '' : 'none';
  const lt = R.players[0].lapTimes;
  $('resLaps').textContent = lt.length > 1 ? lt.map((t, i) => `Kolo ${i + 1}: ${fmt(t)}`).join(' · ') : '';
  if (R.rivals.length) $('resLaps').innerHTML = ($('resLaps').textContent ? $('resLaps').textContent + '<br><br>' : '') + standingsHtml(standings());
  $('resBest').textContent = R.aiUsed ? 'Jízda s autopilotem se nezapočítává do rekordů.' : prev ? (isBest ? 'Předchozí rekord ' + fmt(prev.time) : 'Rekord ' + fmt(prev.time) + ' (+' + (total - prev.time).toFixed(2) + ' s)') : '';
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const raceOver = () => R && (R.phase === 'finished' || R.phase === 'crashed');

// nárazy -> promáčkliny, rozbitá světla, jiskry, zvuk (rec = ukládat pro záznam)
function processHits(car, model, rec, P = null) {
  while (car.hits.length) {
    const h = car.hits.shift();
    const depth = Math.min(0.32, 0.03 + h.dmg * 0.009), radius = 0.55 + Math.min(0.6, h.dmg * 0.02);
    model.dent(h.point, h.dir, depth, radius);
    const broken = car.zones[h.zone] > 35;
    if (broken) model.breakLights(h.zone);
    if (P) { audio.bang(Math.min(2.5, 0.4 + h.dmg / 10)); P.shake = Math.max(P.shake, Math.min(1, h.dmg / 25)); rumble(P.i, 0.3 + h.dmg / 15, 220); }
    if (!rec) continue;
    R.dents.push({ t: R.time, point: h.point.clone(), dir: h.dir.clone(), depth, radius, zone: h.zone, broken });
    const wp = h.point.clone().applyQuaternion(car.quat).add(car.pos);
    for (let k = 0; k < Math.min(12, 2 + h.dmg / 3); k++) world.smoke.emit(wp, _v2.set(0, 0, 0), 0.8, k % 2 ? 3 : 0);
  }
}
// kouř z poškozeného motoru
function damageSmoke(dt, car, pos, quat) {
  if (car.damage < 45) return;
  const p = _v.set(0, 0.35, car.d.hl * 0.55).applyQuaternion(quat).add(pos);
  if (Math.random() < dt * (car.damage - 35) * 0.35) world.smoke.emit(p, _v2.set(0, 0, 0), 0.7, car.damage >= 75 ? 2 : 0);
}

// čelní náraz ve vysoké rychlosti nebo zničené auto = konec hry
function crashRace() {
  setMissed(R.players[0], false);
  rumble(0, 1, 700);
  R.phase = 'crashed';
  R.finishT = 0;
  R.crashTime = R.time;
  recordFrame();
  if (!R.car.crashed) {   // zničeno postupným poškozením
    R.model.setBurnt(true);
    audio.bang(3);
    R.players[0].shake = 1;
    for (let k = 0; k < 30; k++) world.smoke.emit(R.car.pos, _v2.set(0, 0, 0), 1, k % 3 ? 2 : 3);
    message('AUTO ZNIČENO!', 2.6, 'Poškození 100 %');
    $('resTitle').textContent = 'Konec hry – auto zničeno';
    $('resTime').textContent = '🔧 100 %';
    $('resBadge').style.display = 'none';
    $('resLaps').textContent = 'Čas do zničení: ' + fmt(R.time);
    $('resBest').textContent = 'Nárazy postupně poškozují auto – boční méně, čelní víc. Při 100 % závod končí.';
    return;
  }
  const kmh = Math.round(R.car.crashed.speed * 3.6);
  R.model.setBurnt(true);
  audio.bang(3); audio.bang(2);
  R.players[0].shake = 1;
  for (let k = 0; k < 40; k++) world.smoke.emit(R.car.pos, _v2.set(0, 0, 0), 1, k % 3 ? 2 : 3);
  message('HAVÁRIE!', 2.6, 'Čelní náraz v ' + kmh + ' km/h');
  $('resTitle').textContent = 'Konec hry – havárie';
  $('resTime').textContent = '💥 ' + kmh + ' km/h';
  $('resBadge').style.display = 'none';
  $('resLaps').textContent = 'Čas do nárazu: ' + fmt(R.time);
  $('resBest').textContent = 'Čelní náraz do překážky nebo zdi ukončí závod. Zkus to znovu!';
}
function crashFx(dt, car) {
  const p = car.pos;
  if (Math.random() < dt * 30) world.smoke.emit(p, _v2.set(0, 0, 0), 1, 2);
  if (Math.random() < dt * 20) world.smoke.emit(p, _v2.set(0, 0, 0), 1, 3);
}

function updateRace(dt) {
  const { track } = R, PL = R.players, ALL = R.all;
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) message(''); }
  if (R.paused) { audio.update(PL[0].car, false); audio.updateOthers([]); return; }

  const hold = { steer: 0, throttle: 0, brake: 0.6, handbrake: false, hold: true };
  const traffic = ALL.filter(P => P.done !== 'out').map(P => P.car);
  const inputs = ALL.map(P => {
    if (P.isAI) {   // soupeři jedou dál i po dojetí do cíle (neblokují trať)
      if (P.done === 'out') return hold;
      if (R.phase === 'countdown') return { steer: 0, throttle: 0, brake: 1, handbrake: false, hold: true };
      return P.ai.input(P.car, traffic);
    }
    let input = R.duelAI && R.phase === 'racing' ? R.duelAI[P.i].input(P.car)   // ladění: autopilot pro oba
      : R.ai && P.i === 0 && R.phase === 'racing' ? R.ai.input(P.car) : readInput(R.duel ? P.i : -1);
    if (R.phase === 'countdown') input = { steer: input.steer, throttle: 0, brake: 1, handbrake: false, hold: true };
    else if (raceOver() || P.done) input = hold;
    return input;
  });
  if (R.phase === 'countdown') {
    const before = Math.ceil(R.count);
    R.count -= dt;
    const now = Math.ceil(R.count);
    if (now !== before && now > 0 && now <= 3) { message(String(now), 0.9); audio.beep(520, 0.15); }
    if (R.count <= 0) { R.phase = 'racing'; message('START!', 0.9); audio.beep(1040, 0.35); }
  } else if (raceOver()) {
    R.finishT += dt;
    if (R.phase === 'crashed' && R.finishT < 3) crashFx(dt, PL[0].car);
    if (R.finishT > 2.6 && mode === 'race' && !$('results').classList.contains('show')) { show('results'); message(''); }
  }
  // hra pro dva: po dojetí prvního má soupeř 30 s
  if (R.duel && R.phase === 'racing' && R.endTimer != null) {
    R.endTimer -= dt;
    if (R.endTimer <= 0) endDuel();
  }

  const active = ALL.filter(P => P.done !== 'out');
  R.acc += Math.min(dt, 1 / 20);
  while (R.acc >= STEP) {
    track.animate(R.time);   // demoliční koule, ventilátory, poryvy větru
    // stav před krokem – pro plynulé vykreslení mezi kroky fyziky (viz renderPose)
    for (const P of active) { (P.prevPos ||= new THREE.Vector3()).copy(P.car.pos); (P.prevQuat ||= new THREE.Quaternion()).copy(P.car.quat); }
    active.forEach(P => P.car.step(STEP, inputs[ALL.indexOf(P)], track));
    if (track.hazards.length) for (const P of active) {
      const h = track.hazardHit(P.car, P.isAI ? 0.5 : 1);
      if (h && !P.isAI) { audio.bang(Math.min(2.5, 0.8 + h / 6)); P.shake = Math.min(1, 0.4 + h / 15); rumble(P.i, 0.9, 300); }
    }
    for (const P of active) if (P.car.bounced && !P.isAI) audio.bang(0.25);
    // vzájemné srážky všech aut
    for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
      const A = active[a], B = active[b];
      const hit = carContacts(A.car, B.car);
      if (hit > 3 && (!A.isAI || !B.isAI)) {
        audio.bang(Math.min(2, hit / 6));
        for (const P of [A, B]) if (!P.isAI) { P.shake = Math.max(P.shake, Math.min(0.6, hit / 20)); rumble(P.i, hit / 15, 120); }
      }
    }
    R.acc -= STEP;
    if (R.phase === 'racing') {
      R.time += STEP;
      R.stepN++;
      if (!R.duel && R.stepN % REC_EVERY === 0) recordFrame();
      for (const P of ALL) {
        if (P.done === 'out') continue;
        if (!P.done) progress(P);
        if (P.isAI) {
          if (P.car.destroyed && !P.done) { P.done = 'out'; P.model.root.visible = false; for (let k = 0; k < 20; k++) world.smoke.emit(P.car.pos, _v2.set(0, 0, 0), 1, k % 3 ? 2 : 3); }
          else if (P.car.crashed) respawn(P);   // soupeř po havárii jen pokračuje od kontrolního bodu
        } else if (!P.done && (P.car.crashed || P.car.destroyed)) { if (R.duel) duelOut(P); else crashRace(); }
      }
      if (R.duel && R.phase === 'racing') duelCheckEnd();
      if (R.phase !== 'racing') break;
    }
  }

  for (const P of ALL) {
    if (P.done === 'out') continue;
    const car = P.car;
    // automatický návrat (soupeři i při uváznutí)
    if (P.isAI ? R.phase !== 'countdown' : !raceOver() && !P.done) {
      P.upsideT = car.isUpsideDown() ? P.upsideT + dt : 0;
      P.waterT = car.inWater ? P.waterT + dt : 0;
      if (P.isAI) P.stuckT = car.speed < 1.5 ? P.stuckT + dt * (P.ai.waiting ? 0.25 : 1) : 0;   // čekání před pastí se počítá pomaleji (odtah až po ~16 s)
      // soupeř daleko mimo trať (odhozený pastí, vyletěl) – po 3 s zpět na trať
      if (P.isAI) { const q = P.ai.pts[P.ai.i]; P.farT = q && q.p.distanceTo(car.pos) > 30 ? (P.farT || 0) + dt : 0; }
      if (P.upsideT > 2.2 || P.waterT > 1.6 || car.pos.y < -5 || P.stuckT > 4 || P.farT > 3) {
        if (car.inWater && !P.isAI) { if (R.duel) pMessage(P, 'ŠPLOUCH!', 1); else message('ŠPLOUCH!', 1); }
        respawn(P);
      }
    }
    if (!P.isAI && P.done && P.done !== 'finish' && P.done !== 'timeout' && P.doneT < 3) { P.doneT += dt; crashFx(dt, car); }
    if (!P.isAI) {
      if (car.impact > 6 && car.impact > P.lastImpact + 2) { audio.bang(car.impact / 8); P.shake = Math.min(1, car.impact / 20); }
      // vibrace při nárazu: citlivější než zvuk, síla i délka podle prudkosti rány
      if (car.impact > 3 && car.impact > P.lastImpact + 1.5) rumble(P.i, 0.25 + car.impact / 16, 110 + Math.min(260, car.impact * 14), 0.2 + car.impact / 22);
      haptics(P, dt);
      P.lastImpact = car.impact;
    }
    const model = P.i === 0 ? R.model : P.model;
    processHits(car, model, !R.duel && !P.isAI, P.isAI ? null : P);
    // slalom: poražený kužel auto jen mírně přibrzdí
    if (track.cones.length) {
      const n = track.updateCones(dt, car.pos, car.quat, car.vel);
      if (n) { car.vel.multiplyScalar(0.96 ** n); if (!P.isAI) audio.bang(0.12 * n); }
    }
    if (!P.isAI) updateMissed(P, dt);
    else if (R.phase === 'racing' && !P.done) paceRival(P);
    damageSmoke(dt, car, car.pos, car.quat);
    const pose = renderPose(P);
    model.root.position.copy(pose.pos);
    model.root.quaternion.copy(pose.quat);
    model.update(car);
    effects(dt, car, car.wheels, P.i * 4);
    if (P.msgT > 0) { P.msgT -= dt; if (P.msgT <= 0) $('pl' + P.i).querySelector('.pmsg').classList.remove('show'); }
  }

  // duch
  if (R.ghost) {
    const f = sampleFrames(R.ghost.frames, R.phase === 'countdown' ? 0 : R.time);
    R.ghost.model.root.visible = !!f;
    if (f) { R.ghost.model.root.position.set(f[0], f[1], f[2]); R.ghost.model.root.quaternion.set(f[3], f[4], f[5], f[6]); }
  }

  for (const P of PL) {
    setCamLayers(P);
    if (P.cockpit) {
      P.cockpit.spin.rotation.z = -P.car.steer * 3.2;   // volant podle natočení kol
      if (CAMS[P.camMode] === 'cockpit') P.cockpit.update({ kmh: Math.abs(P.car.fwdSpeed) * 3.6, rpm: P.car.rpm, gear: P.car.gear, damage: P.car.damage });
    }
    const pose = renderPose(P);
    updateCamera(dt, pose.pos, pose.quat, CAMS[P.camMode], R.tvCams, P.car.speed, P.cam, P.cs, P);
  }
  if (!R.duel) world.focusShadow(PL[0].car.pos);
  audio.setInterior(CAMS[PL[0].camMode] === 'cockpit');
  audio.update(PL[0].car, true);
  audio.updateOthers(nearbyEngines(PL[0], PL[0].cam || world.camera));
  if (R.duel) updateDuelHud(); else updateHud(PL[0].car);
}

// řízení tempa soupeře: sleduje ujetou vzdálenost po trati; je-li před plánem (cílový čas kola), ubere
function paceRival(P) {
  const ai = P.ai, i = ai.i, L = ai.L;
  if (P.dist == null) { P.dist = ai.cum[i] > L / 2 ? ai.cum[i] - L : ai.cum[i]; P.prevI = i; }
  let d = ai.cum[i] - ai.cum[P.prevI];
  if (d < -L / 2) d += L; else if (d > L / 2) d -= L;
  P.dist += d; P.prevI = i;
  const lead = P.dist - R.time / P.target * L;
  ai.dyn = THREE.MathUtils.clamp(1 - lead / 80, 0.45, 1);
}

// pořadí všech jezdců: v cíli podle času, jinak podle ujeté vzdálenosti (kola, kontrolní body, vzdálenost k dalšímu bodu)
function standings() {
  const n = Math.max(1, R.track.analysis.order.length);
  const score = P => P.done === 'finish' ? 1e12 - P.time
    : P.done === 'out' || (P.done && !P.isAI) ? -1e9 + (P.lap - 1) * n + P.reached
    : ((P.lap - 1) * n + P.reached) * 1000 - Math.min(999, P.car.pos.distanceTo(missedTarget(P)));
  return [...R.all].sort((a, b) => score(b) - score(a));
}
const who = P => P.isAI ? `${P.name} – ${CARS[P.id].name} (${P.rv.trait})` : R.duel ? (P.i ? 'Hráč 2' : 'Hráč 1') : 'Ty';
function standingsHtml(list) {
  return list.map((P, k) => `<span style="color:${hexCss(P.color ?? CARS[P.id].look.base)};text-shadow:0 0 1px #fff,0 0 1px #fff">■</span> ${k + 1}. ${who(P)} – ${P.done === 'finish' ? fmt(P.time) : P.done === 'out' ? 'vypadl' : P.done && !P.isAI ? ({ crash: 'havárie', destroyed: 'auto zničeno', timeout: 'nedojel včas' })[P.done] : 'na trati'}`).join('<br>');
}

// kouř, stopy, voda (off = posun indexů stop smyku – každé auto má vlastní)
function effects(dt, car, wheels, off = 0) {
  const right = _v2.set(-1, 0, 0).applyQuaternion(car.quat);
  for (let i = 0; i < 4; i++) {
    const w = wheels[i];
    if (w.contact && w.slip > 0.35 && car.speed > 2.5) {
      if (!w.ground) world.skids.add(i + off, w.point, w.normal, right, Math.min(1, w.slip));
      if (Math.random() < w.slip * dt * (w.ground ? 12 : 45)) world.smoke.emit(w.point, car.vel, w.slip, w.ground ? 1 : 0);
    } else {
      world.skids.lift(i + off);
      if (w.contact && w.ground && car.speed > 8 && Math.random() < dt * car.speed * 0.07) world.smoke.emit(w.point, car.vel, 0.3, 1);
    }
  }
  if (car.inWater && car.speed > 1) for (let k = 0; k < 3; k++) world.smoke.emit(car.pos, car.vel, 1, 0);
}

function sampleFrames(frames, t) {
  const x = t * REC_HZ;
  const i = Math.floor(x);
  if (i < 0 || i >= frames.length - 1) return i === frames.length - 1 ? frames[i] : null;
  const a = frames[i], b = frames[i + 1], k = x - i;
  const out = a.map((v, j) => v + (b[j] - v) * k);
  _qa.set(a[3], a[4], a[5], a[6]); _qb.set(b[3], b[4], b[5], b[6]);
  _qa.slerp(_qb, k);
  out[3] = _qa.x; out[4] = _qa.y; out[5] = _qa.z; out[6] = _qa.w;
  return out;
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

// ------------------------------------------------------------ kamera
const newCamState = () => ({ pos: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), tv: -1, fov: 62, heli: 0 });
const camState = newCamState(), globalCam = camState;
function resetCamera(car, cs = camState) {
  const f = _v.set(0, 0, 1).applyQuaternion(car.quat);
  cs.pos.copy(car.pos).addScaledVector(f, -7).add(new THREE.Vector3(0, 3, 0));
  cs.up.set(0, 1, 0);
  cs.tv = -1;
}
function updateCamera(dt, pos, quat, modeName, tvCams, speed, cam = world.camera, camState = globalCam, shaker = null) {
  const fwd = _cf.set(0, 0, 1).applyQuaternion(quat);
  const up = _cu.set(0, 1, 0).applyQuaternion(quat);
  let fov = 62;
  if (modeName === 'chase' || modeName === 'far') {
    const far = modeName === 'far';
    const desired = _cd.copy(pos).addScaledVector(fwd, far ? -11 : -7.2).addScaledVector(up, far ? 3.6 : 2.3).add(_cw.set(0, far ? 1.2 : 0.5, 0));
    const look = _cl.copy(pos).addScaledVector(up, 0.9).addScaledVector(fwd, 2);
    // zákryt
    const dir = _cw.subVectors(desired, look); const len = dir.length(); dir.divideScalar(len);
    const tr = R ? R.track : RP && RP.track;
    const hit = tr && tr.raycast(look, dir, len);
    if (hit) { desired.copy(look).addScaledVector(dir, Math.max(2.2, hit.dist - 0.4)); if (hit.dist < 2.6) desired.addScaledVector(up, 1.5); }
    camState.pos.lerp(desired, 1 - Math.exp(-dt * 9));
    camState.up.lerp(up, 1 - Math.exp(-dt * 2.5)).normalize();
    if (camState.pos.y < 0.4) camState.pos.y = 0.4;
    cam.position.copy(camState.pos);
    cam.up.copy(camState.up);
    cam.lookAt(look);
    fov = 60 + Math.min(18, speed * 0.2);
  } else if (modeName === 'cockpit') {
    // oči řidiče (souřadnice auta: x doleva, y nahoru, z dopředu)
    const e = camState.eye || _cw.set(0.35, 0.5, -0.15);
    const left = _cd.set(1, 0, 0).applyQuaternion(quat);
    // hlava řidiče se při přetížení mírně vychyluje (zatáčky do strany, brzdění dopředu, nárazy nahoru/dolů)
    const car = shaker && shaker.car;   // shaker = hráč (má i auto)
    if (car && dt > 0) {
      if (!camState.pv) { camState.pv = car.vel.clone(); camState.head = new THREE.Vector3(); }
      const acc = _cl.subVectors(car.vel, camState.pv).divideScalar(dt); camState.pv.copy(car.vel);
      const tgt = _cw2.set(-acc.dot(left) * 0.0035, -acc.dot(up) * 0.0012, -acc.dot(fwd) * 0.0025);
      tgt.clampLength(0, 0.07);
      camState.head.lerp(tgt, 1 - Math.exp(-dt * 7));
    }
    const hd = camState.head || _cw2.set(0, 0, 0);
    cam.position.copy(pos).addScaledVector(left, e.x + hd.x).addScaledVector(up, e.y + hd.y).addScaledVector(fwd, e.z + hd.z);
    cam.up.copy(up);
    cam.lookAt(_cl.copy(cam.position).addScaledVector(fwd, 20).addScaledVector(up, -1.5));
    fov = 72 + Math.min(8, speed * 0.08);
  } else if (modeName === 'hood') {
    cam.position.copy(pos).addScaledVector(up, 0.72).addScaledVector(fwd, 0.1);
    cam.up.copy(up);
    cam.lookAt(_cl.copy(pos).addScaledVector(fwd, 20).addScaledVector(up, 0.3));
    fov = 70 + Math.min(12, speed * 0.15);
  } else if (modeName === 'tv') {
    let best = camState.tv, bd = best >= 0 ? tvCams[best].distanceTo(pos) : 1e9;
    tvCams.forEach((c, i) => { const d = c.distanceTo(pos); if (d < bd * 0.7) { bd = d; best = i; } });
    if (best < 0) { fov = 62; } else {
      camState.tv = best;
      cam.position.copy(tvCams[best]);
      cam.up.set(0, 1, 0);
      cam.lookAt(pos);
      fov = THREE.MathUtils.clamp(2 * Math.atan((mode === 'race' || mode === 'replay' ? 7 : 18) / Math.max(1, bd)) * 180 / Math.PI, 12, 65);
    }
  } else if (modeName === 'heli') {
    camState.heli += dt * 0.35;
    cam.position.set(pos.x + Math.cos(camState.heli) * 22, pos.y + 11, pos.z + Math.sin(camState.heli) * 22);
    cam.up.set(0, 1, 0);
    cam.lookAt(pos);
    fov = 55;
  }
  if (shaker && shaker.shake > 0) {
    cam.position.x += (Math.random() - 0.5) * shaker.shake * 0.5;
    cam.position.y += (Math.random() - 0.5) * shaker.shake * 0.5;
    shaker.shake = Math.max(0, shaker.shake - dt * 2.5);
  }
  camState.fov += (fov - camState.fov) * Math.min(1, dt * (modeName === 'tv' ? 20 : 4));
  cam.fov = camState.fov;
  cam.updateProjectionMatrix();
}
const _cf = new THREE.Vector3(), _cu = new THREE.Vector3(), _cd = new THREE.Vector3(), _cl = new THREE.Vector3(), _cw = new THREE.Vector3(), _cw2 = new THREE.Vector3();

// ------------------------------------------------------------ HUD
function makeMinimapBase(track) {
  const c = document.createElement('canvas'); c.width = c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  c.tf = drawTrackMap(g, track.tiles, 400, { deco: false, color: '#e6e6e6', color2: '#ffd35a', fit: true });
  return c;
}
const tacho = $('tacho').getContext('2d');
const mini = $('minimap').getContext('2d');
function updateHud(car) {
  const P = R.players[0];
  const kmh = Math.abs(car.fwdSpeed) * 3.6;
  $('hSpeed').textContent = Math.round(kmh);
  $('hGear').textContent = car.gear === 0 ? 'R' : car.gear;
  $('hTime').textContent = R.closed ? fmt(R.phase === 'countdown' ? 0 : R.time) : '—';
  $('hLap').textContent = R.closed ? `${Math.min(P.lap, R.laps)}/${R.laps}` : '—';
  const n = R.track.analysis.order.length;
  $('hProg').style.width = (R.closed ? ((P.lap - 1) + P.reached / Math.max(1, n)) / R.laps * 100 : 0) + '%';

  // poškození (zóny: přední, levý, pravý bok, záď)
  const col = v => `hsl(${Math.max(0, 120 - v * 1.2)}, 75%, 50%)`;
  const dm = Math.round(car.damage);
  if (dm !== P.hudDmg) {
    if (P.hudDmg != null && dm > P.hudDmg) { const el = document.querySelector('.dmg'); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
    P.hudDmg = dm;
    $('hDmgTxt').textContent = dm + ' %';
    // mobil: poškození jako údaj v horní liště, barva od zelené po červenou (jako ve hře pro dva)
    $('hDmgMini').textContent = '🔧 ' + dm + ' %';
    $('hDmgMini').style.color = `hsl(${Math.max(0, 120 - dm * 1.2)}, 75%, 60%)`;
    $('hPow').textContent = dm > 0 ? `Výkon ${Math.round((car.powerFactor ?? 1) * 100)} % · max. rychlost ${Math.round((car.speedFactor ?? 1) * 100)} %` : '';
    $('hDmg').style.width = dm + '%'; $('hDmg').style.background = col(dm);
    $('zF').style.background = col(car.zones.front); $('zB').style.background = col(car.zones.rear);
    $('zL').style.background = col(car.zones.left); $('zR').style.background = col(car.zones.right);
  }

  // otáčkoměr
  const g = tacho, S = 260, cx = 130, cy = 130, red = car.spec.redline, max = Math.ceil((red + 600) / 1000) * 1000;
  g.clearRect(0, 0, S, S);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const ang = r => a0 + (a1 - a0) * r / max;
  g.lineWidth = 16; g.lineCap = 'butt';
  g.strokeStyle = 'rgba(10,14,20,0.6)'; g.beginPath(); g.arc(cx, cy, 108, a0, a1); g.stroke();
  g.strokeStyle = 'rgba(255,60,40,0.55)'; g.beginPath(); g.arc(cx, cy, 108, ang(red), a1); g.stroke();
  const grd = g.createLinearGradient(0, 0, S, 0); grd.addColorStop(0, '#ffc53d'); grd.addColorStop(1, '#ff4a2e');
  g.strokeStyle = grd; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, 108, a0, ang(car.rpm)); g.stroke();
  g.fillStyle = '#dfe6ef'; g.font = '600 13px "Exo 2"'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let r = 0; r <= max; r += 1000) {
    const a = ang(r);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath();
    g.moveTo(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96); g.lineTo(cx + Math.cos(a) * 118, cy + Math.sin(a) * 118); g.stroke();
    g.fillText(r / 1000, cx + Math.cos(a) * 82, cy + Math.sin(a) * 82);
  }
  const an = ang(car.rpm);
  g.strokeStyle = '#ff4a2e'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx + Math.cos(an) * 30, cy + Math.sin(an) * 30); g.lineTo(cx + Math.cos(an) * 116, cy + Math.sin(an) * 116); g.stroke();

  if (R.rivals.length) $('hPos').textContent = `${standings().indexOf(P) + 1}/${R.all.length}`;
  drawMinimap([{ car, color: '#ff4a2e', P }]);
}

// minimapa: trať, vynechaný kontrolní bod, duch a šipky aut
function drawMinimap(list) {
  const m = mini, MS = 200;
  m.clearRect(0, 0, MS, MS);
  m.drawImage(R.minimap, 0, 0, MS, MS);
  const tf = R.minimap.tf, k = MS / 400;
  const toM = p => [((p.x / T + GRID / 2) - tf.ox) * tf.s * k, ((p.z / T + GRID / 2) - tf.oy) * tf.s * k];
  for (const { P, color } of list) if (P.missed && Math.floor(performance.now() / 300) % 2) {
    const [tx, ty] = toM(missedTarget(P));
    m.strokeStyle = color; m.lineWidth = 3; m.beginPath(); m.arc(tx, ty, 8, 0, 7); m.stroke();
  }
  for (const Q of R.rivals) if (Q.done !== 'out') {
    const [x, y] = toM(Q.car.pos);
    m.fillStyle = hexCss(Q.color); m.strokeStyle = 'rgba(0,0,0,0.7)'; m.lineWidth = 1;
    m.beginPath(); m.arc(x, y, 3.5, 0, 7); m.fill(); m.stroke();
  }
  if (R.ghost && R.ghost.model.root.visible) {
    const [gx, gy] = toM(R.ghost.model.root.position);
    m.fillStyle = 'rgba(120,220,255,0.9)'; m.beginPath(); m.arc(gx, gy, 4, 0, 7); m.fill();
  }
  for (const { car, color } of list) {
    const [x, y] = toM(car.pos);
    const f = _v.set(0, 0, 1).applyQuaternion(car.quat);
    const a = Math.atan2(f.z, f.x);
    m.save(); m.translate(x, y); m.rotate(a);
    m.fillStyle = color; m.strokeStyle = '#fff'; m.lineWidth = 1.5;
    m.beginPath(); m.moveTo(8, 0); m.lineTo(-5, 5); m.lineTo(-2, 0); m.lineTo(-5, -5); m.closePath(); m.fill(); m.stroke();
    m.restore();
  }
}

// HUD hry pro dva: pořadí, kolo, čas, rychlost, poškození každého hráče
function updateDuelHud() {
  const st = standings();
  for (const P of R.players) {
    const el = $('pl' + P.i), q = s => el.querySelector(s);
    q('.pos').textContent = R.closed ? (st.indexOf(P) + 1) + '.' + (R.rivals.length ? '/' + R.all.length : '') : '';
    q('.lap').textContent = R.closed ? `Kolo ${Math.min(P.lap, R.laps)}/${R.laps}` : 'Volná jízda';
    q('.tm').textContent = fmt(P.done === 'finish' ? P.time : R.phase === 'countdown' ? 0 : R.time);
    q('.sp').textContent = Math.round(Math.abs(P.car.fwdSpeed) * 3.6) + ' km/h';
    const dm = Math.round(P.car.damage);
    q('.dm').textContent = '🔧 ' + dm + ' %';
    q('.dm').style.color = `hsl(${Math.max(0, 120 - dm * 1.2)}, 75%, 60%)`;
  }
  if (R.endTimer != null && R.phase === 'racing') for (const P of R.players) if (!P.done) {
    const el = $('pl' + P.i).querySelector('.pmsg');
    el.textContent = `Soupeř je v cíli – zbývá ${Math.ceil(R.endTimer)} s`; el.classList.add('show'); P.msgT = 0.3;
  }
  drawMinimap(R.players.map(P => ({ car: P.car, color: hexCss(P_COLORS[P.i]), P })));
}

// ------------------------------------------------------------ přehrávání záznamu
function rebuildReplayModel() {
  world.scene.remove(R.model.root); R.model.dispose();
  R.model = buildCarModel(R.modelSpec || R.car.spec);
  world.scene.add(R.model.root);
  RP.dentIdx = 0;
}
function startReplay() {
  world.camera.layers.enableAll();
  if (!R || R.rec.length < 2) return;
  show(null);
  $('hud').classList.add('hidden');
  $('replayBar').classList.remove('hidden');
  RP = { frames: R.rec, t: 0, playing: true, speed: 1, cam: 'tv', track: R.track, spin: [0, 0, 0, 0], dur: (R.rec.length - 1) / REC_HZ };
  if (R.ghost) R.ghost.model.root.visible = false;
  mode = 'replay';
  RP.lastT = 0;
  RP.aiFrames = R.rivals.map((P, r) => R.recAI.map(fr => fr[r]));
  RP.track.resetCones();
  rebuildReplayModel();
  world.smoke.clear();
  camState.tv = -1;
  syncReplayUI();
}
function syncReplayUI() {
  if (!RP) return;
  $('rpPlay').textContent = RP.playing ? '⏸' : '▶';
  document.querySelectorAll('#rpSpeed button').forEach(b => b.classList.toggle('on', +b.dataset.s === RP.speed));
  $('rpCam').textContent = '🎥 ' + CAM_NAMES[RP.cam].replace('Kamera: ', '');
}
function cycleReplayCam() {
  const list = ['tv', 'chase', 'heli', 'hood', 'far'];
  RP.cam = list[(list.indexOf(RP.cam) + 1) % list.length];
  camState.tv = -1;
  syncReplayUI();
}
function exitReplay() {
  cleanupReplay();
  mode = 'race';
  show('results');
}
function cleanupReplay() {
  if (!RP) return;
  RP = null;
  $('replayBar').classList.add('hidden');
}
$('rpPlay').onclick = () => { RP.playing = !RP.playing; if (RP.t >= RP.dur) RP.t = 0; syncReplayUI(); };
$('rpRestart').onclick = () => { RP.t = 0; RP.playing = true; syncReplayUI(); };
$('rpCam').onclick = () => cycleReplayCam();
$('rpExit').onclick = () => exitReplay();
$('rpSeek').oninput = e => { RP.t = e.target.value / 1000 * RP.dur; };
document.querySelectorAll('#rpSpeed button').forEach(b => b.onclick = () => { RP.speed = +b.dataset.s; syncReplayUI(); });

const fakeCar = { rpm: 900, throttle: 0, skid: 0, speed: 0, onGround: true };
function updateReplay(dt) {
  if (RP.playing) RP.t = Math.min(RP.dur, RP.t + dt * RP.speed);
  if (RP.t >= RP.dur) { RP.playing = false; syncReplayUI(); }
  $('rpSeek').value = Math.round(RP.t / RP.dur * 1000);
  const f = sampleFrames(RP.frames, RP.t) || RP.frames.at(-1);
  if (RP.t < RP.lastT - 1e-4) { if (RP.dentIdx > 0) rebuildReplayModel(); RP.track.resetCones(); }
  RP.lastT = RP.t;
  const model = R.model;
  while (RP.dentIdx < R.dents.length && (R.dents[RP.dentIdx].t <= RP.t || RP.t >= RP.dur - 1e-3)) {
    const d = R.dents[RP.dentIdx++];
    model.dent(d.point, d.dir, d.depth, d.radius);
    if (d.broken) model.breakLights(d.zone);
  }
  RP.track.animate(RP.t);
  if (RP.track.cones.length && RP.playing) {
    const dtv = Math.max(1e-3, dt * RP.speed);
    _v2.set(f[0], f[1], f[2]).sub(model.root.position).divideScalar(dtv);
    RP.track.updateCones(dtv, _v.set(f[0], f[1], f[2]), model.root.quaternion.clone().set(f[3], f[4], f[5], f[6]), _v2.clone());
  }
  R.rivals.forEach((Q, r) => {
    const g = sampleFrames(RP.aiFrames[r], RP.t) || RP.aiFrames[r].at(-1);
    Q.model.root.visible = !!g;
    if (g) { Q.model.root.position.set(g[0], g[1], g[2]); Q.model.root.quaternion.set(g[3], g[4], g[5], g[6]); }
  });
  model.root.position.set(f[0], f[1], f[2]);
  model.root.quaternion.set(f[3], f[4], f[5], f[6]);
  const sdt = RP.playing ? dt * RP.speed : 0;
  const wheels = [0, 1, 2, 3].map(i => { RP.spin[i] += f[8] / R.car.d.wheelR * sdt; return { comp: f[14 + i], spin: RP.spin[i] }; });
  model.setBurnt(R.crashTime != null && RP.t >= R.crashTime);
  model.update({ steer: f[7], wheels, braking: f[11] });
  // kouř podle záznamu
  if (f[12] > 0.4 && f[13] && RP.playing && Math.abs(f[8]) > 2.5) {
    for (const i of [2, 3]) {
      const p = _v.set(i === 2 ? 0.82 : -0.82, -0.5, -1.3).applyQuaternion(model.root.quaternion).add(model.root.position);
      if (Math.random() < f[12] * sdt * 45) world.smoke.emit(p, _v2.set(0, 0, 0), f[12], 0);
    }
  }
  updateCamera(dt, model.root.position, model.root.quaternion, RP.cam, R.tvCams, Math.abs(f[8]));
  world.focusShadow(model.root.position);
  Object.assign(fakeCar, { rpm: f[9], throttle: f[10], skid: f[12], speed: Math.abs(f[8]), onGround: !!f[13] });
  audio.setInterior(RP.cam === 'cockpit');
  audio.update(fakeCar, RP.playing && RP.speed >= 0.5);
  audio.updateOthers([]);
}

// ------------------------------------------------------------ hlavní smyčka
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    pollPads();
    syncMusic();
    if (world.M.boost) world.M.boost.map.offset.y = (world.M.boost.map.offset.y - dt * 1.6) % 1;   // šipky urychlovače běží vpřed
    if (editor.active && editor.track && editor.track.hazards.length) editor.track.animate(now / 1000);   // koule a ventilátory se hýbou i v editoru
    if (world.M.windStreak) world.M.windStreak.map.offset.x = (world.M.windStreak.map.offset.x + dt * 1.8) % 1;   // proudění větru
    if (world.M.fire) {   // plameny blikají
      world.M.fire.emissiveIntensity = 2.2 + Math.sin(now * 0.023) * 0.6 + Math.sin(now * 0.061) * 0.4;
      world.M.fireCore.emissiveIntensity = 2.6 + Math.sin(now * 0.037 + 1) * 0.7;
    }
    if (mode === 'race' && R) updateRace(dt);
    else if (mode === 'replay' && RP) updateReplay(dt);
    else if (mode === 'editor') { editor.update(dt, keys); audio.update(null, false); audio.setInterior(false); }
    else { if (demo && backdrop) updateDemo(dt); else menuCamera(dt); audio.update(null, false); audio.setInterior(false); }
  } catch (err) { console.error(err); }
  world.render(dt);
  requestAnimationFrame(loop);
}

// start
// vlastní tratě ze složky myTracks (přes server); při prvním spuštění se do ní přesunou tratě z prohlížeče
Store.init().then(r => {
  if (r.moved) toast(`Tratě z prohlížeče přesunuty do složky myTracks (${r.moved})`);
  if (mode === 'select' && !$('stepTrack').classList.contains('hidden')) renderTracks();
});
setTimeout(() => {
  ensureBackdrop();
  $('loading').classList.remove('show');
  showMenu();
  requestAnimationFrame(loop);
}, 30);

// ladicí přístup z konzole (ff = rychlé přetočení závodu)
window.__stunts = { world, get R() { return R; }, get RP() { return RP; }, editor, BUILTIN, startRace, clone, startReplay, pollPads, audio, get mode() { return mode; }, duelAI() { if (R) R.duelAI = R.players.map(P => { const a = new Autopilot(R.track); a.reset(P.car.pos); return a; }); }, ff(sec) { for (let i = 0; i < sec * 60 && R; i++) updateRace(1 / 60); } };
