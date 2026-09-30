// Jednoduchý autopilot: sleduje středovou čáru trati, rychlost volí podle křivosti před sebou.
// Používá se pro demo jízdu v menu, pro automatické testy tratí a pro počítačové soupeře.
// opts (povaha jezdce): corner = přilnavost v zatáčkách (násobek), throttle = síla plynu (0–1),
//   brake = brzdné zpomalení pro plánování (m/s²), lane = jízdní stopa (posun od středu v m),
// Řízení tempa soupeře: dyn (0–1) násobí cílové rychlosti; nastavuje ho hra podle toho, zda soupeř jede před svým plánem.
import * as THREE from 'three';
import { pathWorld } from './track.js';
import { pathOf, PIPE_R } from './pieces.js';
import { LOOPS, PIPE_OBST, SPINNER } from './defs.js';

const PIPE_OBST_TH = PIPE_OBST.ang + 0.5;
const PIPES = { pipe: 1, pipeIn: 1, pipeObst: 1 };
// pohyblivé pasti, na které soupeř čeká (demoliční koule, lis, rameno, přejezd, sloupky)
const TRAPS = { pendulum: 1, crusher: 1, spinner: 1, railroad: 1, bollards: 1 };   // o kolik (rad) vyjede soupeř po stěně roury nad zátarasem

const FAST = { ...LOOPS, landing: 1 };
// vlastní jízdní stopu drží soupeři jen na rovných úsecích; v zatáčkách a na speciálních dílcích jedou ideální stopou
// kde se nepředjíždí (úzké nebo speciální dílky)
const NO_PASS = { ...LOOPS, kicker: 1, landing: 1, cones: 1, obstacleC: 1, obstacleS: 1, slalom: 1, spiral: 1, spiralR: 1, chicane: 1, waves: 1, crossFlat: 1, crates: 1, pendulum: 1, oil: 1, sideRamp: 1, trampoline: 1, crusher: 1, spinner: 1, hammer: 1, railroad: 1, bollards: 1 };
// kde soupeř s ideální stopou jede středem (skoky, looping, roura, překážky, spirála)
const NO_LINE = { ...LOOPS, kicker: 1, landing: 1, cones: 1, obstacleC: 1, obstacleS: 1, slalom: 1, spiral: 1, spiralR: 1, tunnelBridge: 1, cross: 1, chicane: 1, waves: 1, crossFlat: 1, crates: 1, pendulum: 1, oil: 1, sideRamp: 1, trampoline: 1, wind: 1, crusher: 1, spinner: 1, hammer: 1, railroad: 1, bollards: 1 };
// úzká místa (stěny těsně u silnice): kratší pohled vpřed, aby autopilot neřízl zatáčku do stěny či svahu u portálu
const NARROW = { tunnel: 1, tunnelCurve: 1, tunnelBig: 1, tunnelPortal: 1, tunnelBridge: 1, pipe: 1, pipeIn: 1, pipeObst: 1 };
const LANE = { straight: 1, straightRails: 1, start: 1, roadText: 1, boost: 1, bridge: 1, bridgeDry: 1, tunnel: 1, bumps: 1, ramp: 1, rampIn: 1, rampS: 1, rampOut: 1, bankS: 1 };

export class Autopilot {
  constructor(track, opts = {}) {
    this.track = track;
    this.o = { corner: 1, throttle: 1, brake: 9, lane: 0, ...opts };
    this.dyn = 1;
    this.pts = [];
    const order = track.analysis.order;
    for (const o of order) {
      const len = pathOf(o.tile.type, o.k || 0).len;
      const n = LOOPS[o.tile.type] ? Math.ceil(len / 2.5) : Math.max(10, Math.ceil(len / 4));
      for (let i = 0; i < n; i++) {
        const u = o.fwd ? i / n : 1 - i / n;
        const w = pathWorld(o.tile, u, o.k || 0);
        if (o.tile.type === 'slalom' || o.tile.type === 'obstacleC' || o.tile.type === 'cones' || o.tile.type === 'spinner') {
          // objížďka zátarasů (lokální souřadnice dílku)
          const z = -20 + 40 * u;
          const K = o.tile.type === 'slalom' ? [[-24, 0], [-10, -2.2], [0, 2.2], [10, -2.2], [24, 0]]
            : o.tile.type === 'cones' ? [[-30, 0], [-14, 3.6], [-2, -3.6], [10, 3.6], [30, 0]] : o.tile.type === 'spinner' ? [[-30, 0], [-11, SPINNER.lane], [11, SPINNER.lane], [30, 0]] : [[-30, 0], [-9, 3.3], [9, 3.3], [30, 0]];
          let k = 0; while (k < K.length - 2 && z > K[k + 1][0]) k++;
          const f = (z - K[k][0]) / (K[k + 1][0] - K[k][0]);
          // rotující rameno se objíždí po straně, kde se točí po směru jízdy (lokálně −x při jízdě k +z, +x obráceně)
          const sgn = o.tile.type === 'spinner' && !o.fwd ? -1 : 1;
          const off = sgn * (K[k][1] + (K[k + 1][1] - K[k][1]) * (f * f * (3 - 2 * f)));
          w.p.addScaledVector(new THREE.Vector3().crossVectors(w.t, w.n).normalize(), off);
        }
        if (o.tile.type === 'chicane') {
          // šikana: esíčkem mezi zídkami (poloha napříč dílkem x podle z; strana závisí na směru jízdy)
          const z = -20 + 40 * u, K = [[-30, 0], [-10, -3.3], [10, 3.3], [30, 0]];
          let k = 0; while (k < K.length - 2 && z > K[k + 1][0]) k++;
          const f = (z - K[k][0]) / (K[k + 1][0] - K[k][0]);
          const x = K[k][1] + (K[k + 1][1] - K[k][1]) * (f * f * (3 - 2 * f));
          w.p.addScaledVector(new THREE.Vector3().crossVectors(w.t, w.n).normalize(), -x);   // tečna míří vždy k +z dílku, bok = −x
        }
        this.pts.push({ p: w.p, up: w.n, side: new THREE.Vector3().crossVectors(w.t, w.n).normalize(), type: o.tile.type, tile: o.tile, fwd: o.fwd, u, fast: !!FAST[o.tile.type] && o.tile.type !== 'pipeObst' });
      }
    }
    const N = this.pts.length;
    // zátaras v rouře objede po stěně: body ~30 m před ním až ~18 m za ním se posunou po obvodu roury o úhel th od dna
    for (let i = 0; i < N; i++) {
      if (this.pts[i].type !== 'pipeObst' || (this.pts[(i - 1 + N) % N].type === 'pipeObst')) continue;
      let n = 0; while (this.pts[(i + n) % N].type === 'pipeObst' && n < N) n++;
      const c = (i + (n >> 1)) % N;
      const shift = (j, d) => {
        const q = this.pts[j];
        if (!PIPES[q.type]) return;
        const f = d < 0 ? THREE.MathUtils.smoothstep(d, -30, -12) : 1 - THREE.MathUtils.smoothstep(d, 6, 18);
        const th = PIPE_OBST_TH * f;
        q.p = q.p.clone().addScaledVector(q.side, PIPE_R * Math.sin(th)).addScaledVector(q.up, PIPE_R * (1 - Math.cos(th)));
      };
      const base = this.pts.map(q => q.p.clone());
      for (let dir = -1; dir <= 1; dir += 2) {
        let d = 0, j = c;
        if (dir > 0) { j = (c + 1) % N; d = base[c].distanceTo(base[j]); }
        while (Math.abs(d) < 32) { shift(j, d * (dir < 0 ? -1 : 1)); const k = (j + dir + N) % N; d += base[j].distanceTo(base[k]); j = k; }
      }
    }
    // ideální stopa (racingLine): body se v šíři silnice posouvají tak, aby se trať co nejvíc narovnala
    // (vyhlazení křivosti – zatáčky vnější–vnitřní–vnější); na speciálních dílcích plynule do středu
    if (this.o.racingLine && N > 4) {
      const base = this.pts.map(q => q.p.clone());
      const w0 = this.pts.map(q => (NO_LINE[q.type] ? 0 : q.type.startsWith('bank') ? 2.4 : 3.2));
      // před skokánkem (~40 m) rovně středem – šikmý odraz = dopad mimo trať
      for (let i = 0; i < N; i++) if (this.pts[i].type === 'kicker') for (let k = 1; k <= 10; k++) w0[(i - k + N) % N] = 0;
      const w = w0.map((_, i) => { let m = 9; for (let k = -10; k <= 10; k++) m = Math.min(m, w0[(i + k + N) % N] + Math.abs(k) * 0.35); return m; });
      // minimalizace součtu čtverců křivosti (druhých diferencí) → gradient = čtvrtá diference
      const off = new Float64Array(N), P = this.pts.map(q => q.p.clone());
      const at = i => P[(i + N) % N];
      for (let it = 0; it < 1500; it++) for (let i = 0; i < N; i++) {
        const m2 = at(i - 2), m1 = at(i - 1), p0 = P[i], p1 = at(i + 1), p2 = at(i + 2), s = this.pts[i].side;
        const gx = m2.x - 4 * m1.x + 6 * p0.x - 4 * p1.x + p2.x, gz = m2.z - 4 * m1.z + 6 * p0.z - 4 * p1.z + p2.z;
        off[i] = THREE.MathUtils.clamp(off[i] - 0.08 * (gx * s.x + gz * s.z), -w[i], w[i]);
        p0.copy(base[i]).addScaledVector(s, off[i]);
      }
      this.pts.forEach((q, i) => { q.p = P[i]; });
    }
    // vlastní jízdní stopa: plynulý posun od středu (mimo dílky, kde se jede středem)
    if (this.o.lane && N) {
      const raw = this.pts.map(q => (LANE[q.type] ? this.o.lane : 0));
      for (let i = 0; i < N; i++) {
        let s = 0; for (let k = -10; k <= 10; k++) s += raw[(i + k + N) % N];
        this.pts[i].p = this.pts[i].p.clone().addScaledVector(this.pts[i].side, s / 21);
      }
    }
    // doporučená rychlost podle vodorovné křivosti
    for (let i = 0; i < N; i++) {
      const a = this.pts[(i - 2 + N) % N].p, b = this.pts[i].p, c = this.pts[(i + 2) % N].p;
      const d1 = new THREE.Vector2(b.x - a.x, b.z - a.z), d2 = new THREE.Vector2(c.x - b.x, c.z - b.z);
      const l = d1.length() + d2.length();
      const ang = Math.abs(Math.atan2(d1.x * d2.y - d1.y * d2.x, d1.dot(d2)));
      const k = l > 0.5 ? ang / (l / 2) : 0;
      const bank = this.pts[i].type.startsWith('bank') ? 1.35 : 1;
      this.pts[i].vmax = this.pts[i].type === 'kicker' ? 32 : this.pts[i].type === 'slalom' ? 16 : this.pts[i].type === 'cones' ? 8 : this.pts[i].type === 'obstacleC' ? 24 : this.pts[i].type === 'obstacleS' ? 30 : this.pts[i].type === 'pipeObst' ? 26 : this.pts[i].type === 'chicane' ? 12 : this.pts[i].type === 'waves' ? 18 : this.pts[i].type === 'trampoline' ? 24 : this.pts[i].type === 'sideRamp' || this.pts[i].type === 'oil' ? 22 : this.pts[i].type === 'crates' ? 25 : this.pts[i].type === 'bollards' ? 13.5 : this.pts[i].type === 'spinner' ? 16 : this.pts[i].type === 'hammer' ? 17 : this.pts[i].type === 'crusher' ? 20 : this.pts[i].type === 'gravel' ? Math.min(40, Math.sqrt(8.5 * 0.72 * this.o.corner / Math.max(k, 1e-4))) : this.pts[i].fast ? 60 : Math.min(60, Math.sqrt(8.5 * this.o.corner * bank / Math.max(k, 1e-4)));
    }
    this.i = 0;
    this.N = N;
    // ujetá vzdálenost po trati k bodům (pro řízení tempa)
    this.cum = [0];
    for (let i = 1; i <= N; i++) this.cum.push(this.cum[i - 1] + (N ? this.pts[i - 1].p.distanceTo(this.pts[i % N].p) : 0));
    this.L = this.cum[N] || 1;
  }

  // Odhad ideálního času kola pro auto s nejvyšší rychlostí top (m/s) a zrychlením 0–100 za t100 (s):
  // rychlosti v bodech omezené zatáčkami, rozjezd podle zrychlení (klesá s rychlostí), brzdění 9 m/s².
  estimateLap(top, t100) {
    const N = this.N, a0 = 27.8 / t100 * 1.3;
    const ds = [], lim = [], v = new Float64Array(N);
    for (let i = 0; i < N; i++) { ds.push(this.cum[i + 1] - this.cum[i]); lim.push(Math.min(top, this.pts[i].vmax)); }
    let cur = 0;
    for (let k = 0; k < 2 * N; k++) { const i = k % N; const a = a0 * Math.max(0.05, 1 - (cur / top) ** 2); cur = Math.min(lim[i], Math.sqrt(cur * cur + 2 * a * ds[i])); v[i] = cur; }
    for (let k = 2 * N - 1; k >= 0; k--) { const i = k % N, n = (i + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[n] * v[n] + 2 * 9 * ds[i])); }
    let t = 0;
    for (let i = 0; i < N; i++) t += ds[i] / Math.max(1, (v[i] + v[(i + 1) % N]) / 2);
    return t;
  }

  // blíží se looping, roura nebo skok? (tam se nesmí zpomalovat)
  fastAhead(best) {
    for (let k = 0; k < 30; k++) { const q = this.pts[(best + k) % this.N]; if (q.fast || q.type === 'kicker') return true; }
    return false;
  }

  // past do ~50 m před autem? (nepředjíždět – vybočení ke kraji by skončilo v lisu či pod bucharem)
  trapAhead(best) {
    for (let k = 1; k < 13; k++) { const t = this.pts[(best + k) % this.N].type; if (TRAPS[t] || t === 'hammer') return true; }
    return false;
  }

  // před loopingem, rourou a skokem vždy plný plyn (slabší povaha by nenabrala potřebnou rychlost)
  rushAhead(best) { return this.o.throttle < 1 && this.fastAhead(best); }

  reset(pos) {
    let best = 0, bd = 1e9;
    this.pts.forEach((q, i) => { const d = q.p.distanceToSquared(pos); if (d < bd) { bd = d; best = i; } });
    this.i = best;
  }

  // others = auta ostatních jezdců (soupeři je objíždějí a nenaráží do nich zezadu)
  input(car, others = null) {
    const N = this.N;
    if (!N) return { steer: 0, throttle: 0, brake: 0 };
    // nejbližší bod v okně před posledním indexem
    let best = this.i, bd = 1e9;
    for (let k = -5; k < 40; k++) {
      const j = (this.i + k + N) % N;
      const d = this.pts[j].p.distanceToSquared(car.pos);
      if (d < bd) { bd = d; best = j; }
    }
    // daleko mimo stopu (vyletěl z trati): znovu najít nejbližší bod na celé trati
    if (bd > 15 * 15) this.pts.forEach((q, i) => { const d = q.p.distanceToSquared(car.pos); if (d < bd) { bd = d; best = i; } });
    this.i = best;
    const v = Math.max(0, car.fwdSpeed);
    // pohled vpřed; když do něj spadne úzké místo (tunel, portál, roura), zkrátí se – jinak by autopilot
    // řízl zatáčku za portálem napříč přes svah kopce
    let look = this.pts[best].type === 'cones' ? 4 + v * 0.25 : Math.min(40, 6 + v * 0.45);
    let j = best, acc = 0, narrow = false;
    while (acc < look) { const n = (j + 1) % N; acc += this.pts[j].p.distanceTo(this.pts[n].p); j = n; if (NARROW[this.pts[j].type]) narrow = true; }
    if (narrow && look > 5 + v * 0.3) {
      look = Math.min(18, 5 + v * 0.3); j = best; acc = 0;
      while (acc < look) { const n = (j + 1) % N; acc += this.pts[j].p.distanceTo(this.pts[n].p); j = n; }
    }
    // cílový bod blíž, pokud by spojnice k němu vedla víc než 2,5 m mimo stopu (zkracování zatáček přes trávu
    // a návrat přes obrubník auto nadhodí a roztočí)
    for (let guard = 0; guard < 40 && j !== best; guard++) {
      const A = car.pos, Bp = this.pts[j].p, dx = Bp.x - A.x, dz = Bp.z - A.z, L2 = dx * dx + dz * dz || 1;
      let worst = 0;
      for (let q = (best + 1) % N; q !== j; q = (q + 1) % N) {
        const P = this.pts[q].p, t = Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.z - A.z) * dz) / L2));
        worst = Math.max(worst, Math.hypot(A.x + dx * t - P.x, A.z + dz * t - P.z));
      }
      if (worst <= 2.5) break;
      j = (j - 1 + N) % N;
    }
    let target = this.pts[j].p;
    const fwd = _f.set(0, 0, 1).applyQuaternion(car.quat);
    const up = _u.set(0, 1, 0).applyQuaternion(car.quat);
    const right = _r.crossVectors(fwd, up);
    // provoz: auto před sebou ve své stopě objede z opačné strany; když je moc blízko, přizpůsobí mu rychlost
    let follow = Infinity;
    const stunt = this.fastAhead(best) || NO_PASS[this.pts[best].type] || this.trapAhead(best);
    if (others && stunt) {
      // skok, looping, roura: nepředjíždět, jen nenajet zezadu (větší odstup by zpomalil pod rychlost potřebnou pro looping)
      for (const o of others) {
        if (o === car) continue;
        _d.subVectors(o.pos, car.pos);
        const along = _d.dot(fwd), lat = _d.dot(right);
        if (along > 0.5 && along < 16 && Math.abs(lat) < 3 && Math.abs(_d.y) < 4) follow = Math.min(follow, Math.max(0, o.vel.dot(fwd) + (along - 8) * 0.8));
      }
    } else if (others) {
      let near = null, na = 1e9, nl = 0;
      for (const o of others) {
        if (o === car) continue;
        _d.subVectors(o.pos, car.pos);
        if (Math.abs(_d.y) > 3) continue;
        const along = _d.dot(fwd), lat = _d.dot(right);
        if (along > 0.5 && along < 18 && Math.abs(lat) < 2.8 && along < na) { na = along; near = o; nl = lat; }
      }
      if (near) {
        if (!(this.passT > 0)) this.passSide = nl > 0 ? -1 : 1;      // strana objetí drží ~1 s
        this.passT = 60;
        target = _t2.copy(target).addScaledVector(right, this.passSide * Math.min(3.4, 1.4 + 2.6 * (1 - na / 18)));
        const vo = near.vel.dot(fwd);
        if (na < 8 && Math.abs(nl) < 2.2) follow = Math.max(0, vo + (na - 4.5) * 0.9);
      } else if (this.passT > 0) this.passT--;
    }
    const to = _t.subVectors(target, car.pos);
    const ang = Math.atan2(to.dot(right), to.dot(fwd));
    // plánování rychlosti na ~ brzdnou dráhu
    let vt = 60, dist = 0;
    for (let k = 0, q = best; k < 90 && dist < 140; k++) {
      const n = (q + 1) % N;
      dist += this.pts[q].p.distanceTo(this.pts[n].p);
      const allowed = Math.sqrt(this.pts[n].vmax ** 2 + 2 * this.o.brake * dist);
      vt = Math.min(vt, allowed);
      q = n;
    }
    if (this.dyn < 1 && !this.fastAhead(best)) vt *= this.dyn;   // řízení tempa soupeře
    // vyjel mimo trať (smyk po slalomu, přestřelená zatáčka): zpomalit, aby se stihl vrátit a na trávě se netočil v kruhu
    const offH = Math.hypot(this.pts[best].p.x - car.pos.x, this.pts[best].p.z - car.pos.z);
    if (offH > 5 && car.onGround && !stunt) vt = Math.min(vt, Math.max(7, 18 - 0.8 * offH));
    // pohyblivé pasti: je-li past v okamžiku příjezdu zavřená, zpomalit a počkat před ní (waiting = nečeká se na odtah)
    this.waiting = false;
    if (this.track.hazards?.length) {
      // stop = vzdálenost k místu, kde je nutné stát (null = volno); těsně před čarou stát, hluboko v pasti už jet
      const offLine = Math.hypot(this.pts[best].p.x - car.pos.x, this.pts[best].p.z - car.pos.z) > 3;   // vystrčený mimo stopu – nečekat, vrátit se
      const hold = stop => {
        if (stop == null || stop < -0.3 || offLine) return;   // už v pasti → nestát, projet
        vt = stop > 0.5 ? Math.min(vt, Math.sqrt(2 * this.o.brake * Math.max(0, stop - 1))) : 0;
        this.waiting = this.waiting || v < 2.5;
      };
      const cur = this.pts[best];
      let d = 0, q = best;
      for (let k = 0; k < 90 && d < 75; k++) {
        const n = (q + 1) % N; d += this.pts[q].p.distanceTo(this.pts[n].p); q = n;
        const pt = this.pts[q];
        if (TRAPS[pt.type] && pt.tile !== cur.tile) { hold(this.track.hazardBlocked(pt.tile, d + 20, v, pt.fwd)); break; }
      }
      // už na dílku pasti: vzdálenost ke středu podle skutečné polohy auta
      if (TRAPS[cur.type]) {
        const lz = this.track.local(cur.tile, car.pos)[1];
        hold(this.track.hazardBlocked(cur.tile, cur.fwd ? -lz : lz, v, cur.fwd));
      }
    }
    vt = Math.min(vt, follow);
    const inLoop = !!LOOPS[this.pts[best].type];
    const loopOnly = this.pts[best].type === 'loop' && up.y < 0.7;   // jen ve strmé části loopingu
    const maxSteer = car.spec.steer / (1 + Math.max(0, Math.abs(car.fwdSpeed) - 5) / 12);
    // kontrola trakce: auto ve smyku (velká boční rychlost) mimo triky ubere plyn, jinak se zadokolka roztočí
    const slide = !stunt && !inLoop && v > 8 && Math.abs(car.vel.dot(right)) > 0.18 * v + 1;
    return {
      // v loopingu jen jemné korekce (při velkém přetížení by plný rejd auto stočil napříč do svodidla)
      steer: THREE.MathUtils.clamp(Math.atan2(2 * 2.63 * Math.sin(ang), Math.max(4, to.length())) * (inLoop ? 1.2 : 1.9) / maxSteer, loopOnly ? -0.3 : -1, loopOnly ? 0.3 : 1),
      throttle: v < vt && !slide ? (this.rushAhead(best) ? 1 : this.o.throttle) : 0,
      brake: v > vt + 1 ? 1 : 0,
      handbrake: false,
    };
  }
}
const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _t = new THREE.Vector3(), _t2 = new THREE.Vector3(), _d = new THREE.Vector3();
