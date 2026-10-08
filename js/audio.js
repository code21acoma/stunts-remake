// Syntetizované zvuky (Web Audio), bez zvukových souborů:
//  motor – AudioWorklet: jednotlivé zážehy válců rozeznívají dvě rezonance výfuku (formanty), zátěž mění barvu
//          a zkreslení, po ubrání plynu ve vysokých otáčkách výfuk prská; profil podle typu auta (počet válců, nerovnoměrnost);
//  turbo (pískání, ufouknutí ventilu), řazení, pneumatiky (kvílení podle skluzu), povrch (tráva, šotolina), valivý hukot,
//  vítr, dopady po skoku, nárazy (tupá rána + kovové zazvonění), motory soupeřů v okolí (stereo + Dopplerův jev),
//  v kokpitu utlumené jako uvnitř auta. Bez AudioWorkletu (starý prohlížeč) zůstane jednoduchý motor z oscilátorů.

// Profily motorů (look.style auta) – fyzikálnější model: zážehy jako hladké tlakové pulzy, každý válec trvale jinak
// silný; pulzy jdou do výfuku (1 nebo 2 větve = řady válců) – vlnovod s odrazy na konci trubky (ozvěna potrubí),
// pak tlumič (dolní propust), dunění karoserie, sání pod plynem, mechanika; omezovač otáček zakoktá.
//  cyl = válce, bank = řada válce v pořadí zážehů (0/1; nepravidelné u V8 s křížovým klikovým hřídelem = bublání),
//  pipe = délky výfuku v ms (pro každou řadu), fb = odraz na konci trubky, damp = tlumení v trubce,
//  muffler = tlumič (Hz), boom = dunění (Hz), width = šířka pulzu (podíl intervalu zážehů), rough = rozdíl válců,
//  jitter = náhodnost, intake = sání, mech = mechanický hluk (diesel klepe), drive = zkreslení, pops = prskání, vol
export const ENGINES = {
  // malý městský čtyřválec: tlumený, trochu "šicí stroj"
  hatch:   { cyl: 4, bank: [0], pipe: [5.2], fb: 0.55, damp: 0.45, muffler: 950, boom: 90, width: 0.55, rough: 0.07, jitter: 0.04, intake: 0.16, mech: 0.07, drive: 1.3, pops: 0, vol: 0.9 },
  // velký terénní šestiválec turbodiesel: nízký, drsný, klepe
  jeep:    { turbo: 0.7, cyl: 6, bank: [0], pipe: [7.5], fb: 0.62, damp: 0.5, muffler: 560, boom: 55, width: 0.75, rough: 0.12, jitter: 0.08, intake: 0.22, mech: 0.25, drive: 1.9, pops: 0, vol: 1.15 },
  // rallyový čtyřválec turbo: otevřený výfuk, ostrý, při ubrání střílí (antilag)
  rally:   { turbo: 1, cyl: 4, bank: [0], pipe: [3.6], fb: 0.5, damp: 0.3, muffler: 1700, boom: 105, width: 0.48, rough: 0.09, jitter: 0.05, intake: 0.22, mech: 0.08, drive: 2.4, pops: 0, vol: 1 },
  // závodní plochý šestiválec: dvě řady, vysoké otáčky, kovový řev
  gt3:     { cyl: 6, bank: [0, 1], pipe: [3.1, 3.4], fb: 0.5, damp: 0.28, muffler: 2300, boom: 115, width: 0.45, rough: 0.05, jitter: 0.03, intake: 0.2, mech: 0.08, drive: 2.2, pops: 0, vol: 1 },
  // americká V8 s křížovým klikovým hřídelem: nepravidelné pulzy do řad = hluboké bublání
  muscle:  { cyl: 8, bank: [0, 1, 0, 0, 1, 0, 1, 1], pipe: [4.8, 7.4], bankGain: [1, 0.55], fb: 0.62, damp: 0.42, muffler: 720, boom: 48, width: 0.62, rough: 0.22, jitter: 0.06, intake: 0.18, mech: 0.06, drive: 2.3, pops: 0, vol: 1.2 },
  // hypersport: plochá V8 turbo, ostrý a čistý
  hyper:   { turbo: 0.8, cyl: 8, bank: [0, 1], pipe: [2.7, 2.9], fb: 0.48, damp: 0.25, muffler: 2500, boom: 110, width: 0.42, rough: 0.04, jitter: 0.03, intake: 0.2, mech: 0.07, drive: 2.1, pops: 0, vol: 1 },
  // formule: V10, krátké výfuky, ječivý vysoký tón
  formula: { cyl: 10, bank: [0, 1], pipe: [1.5, 1.6], fb: 0.42, damp: 0.2, muffler: 4200, boom: 170, width: 0.36, rough: 0.025, jitter: 0.02, intake: 0.24, mech: 0.07, drive: 1.9, pops: 0, vol: 0.95 },
};
const DEFAULT_ENGINE = ENGINES.gt3;

// zpracování v audio vlákně: generátor zvuku motoru (parametry rpm, load = plyn 0–1, redline, gain)
const WORKLET = `
class EngineVoice extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rpm', defaultValue: 900 }, { name: 'load', defaultValue: 0 }, { name: 'redline', defaultValue: 7000 }, { name: 'gain', defaultValue: 0 }];
  }
  constructor(options) {
    super();
    this.seed = 12345 + Math.floor(Math.random() * 1e6);
    this.setEngine((options && options.processorOptions && options.processorOptions.engine) || ${JSON.stringify(DEFAULT_ENGINE)});
    this.port.onmessage = e => this.setEngine(e.data);
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  setEngine(c) {
    this.c = c;
    this.ph = 0; this.k = 0; this.pulses = []; this.pop = 0; this.cut = 0;
    // každý válec trvale trochu jinak silný (jako skutečný motor)
    this.cylGain = []; for (let i = 0; i < c.cyl; i++) this.cylGain.push(1 + c.rough * (this.rnd() * 2 - 1));
    // výfukové větve: zpožďovací linka (vlnovod) + tlumení v trubce
    this.pipes = c.pipe.map(ms => ({ buf: new Float32Array(4096), w: 0, len: Math.max(8, Math.round(ms / 1000 * sampleRate)), lp: 0 }));
    this.pw = 0.05; this.m1 = 0; this.m2 = 0; this.boom = [0, 0]; this.inl = 0; this.mh = 0; this.dc = 0; this.env = 0;
  }
  process(inputs, outputs, p) {
    const out = outputs[0], o = out[0];
    if (!o) return true;
    const c = this.c, sr = sampleRate, rpm = p.rpm[0], load = Math.max(0, Math.min(1, p.load[0])), gain = p.gain[0], red = p.redline[0];
    if (gain < 1e-4) { for (let ch = 0; ch < out.length; ch++) out[ch].fill(0); return true; }
    const rn = Math.min(1.05, rpm / red), fireHz = rpm / 60 * c.cyl / 2, inc = fireHz / sr;
    const width = c.width * (0.75 + 0.35 * load), dur = Math.max(8, Math.round(width / fireHz * sr));
    // tlumič: dvoupólová dolní propust, pod plynem a ve vysokých otáčkách se otevírá
    const fm = Math.min(sr * 0.45, c.muffler * (0.55 + 0.45 * load + 0.35 * rn)), wm = Math.tan(Math.PI * fm / sr), km = wm / (1 + wm);
    // dunění karoserie / rezonance tlumiče (pásmová propust)
    const wb = 2 * Math.PI * c.boom / sr, Rb = Math.exp(-Math.PI * 40 / sr), ab = 2 * Rb * Math.cos(wb), bb = -Rb * Rb, gb = (1 - Rb) * 2 * Math.sin(wb);
    const drive = 1 + c.drive * (0.2 + 0.8 * load), limiter = rn > 0.985 && load > 0.5;
    const pre = 0.38 * drive, comp = Math.pow(0.38 * (1 + c.drive) / pre, 0.7);
    const target = 0.23 + 0.11 * load + 0.06 * rn, agcK = 1 - Math.exp(-1 / (0.25 * sr));
    for (let i = 0; i < o.length; i++) {
      this.ph += inc;
      if (this.ph >= 1) {
        this.ph -= 1;
        const cyl = this.k % c.cyl, bank = c.bank[this.k % c.bank.length] % c.pipe.length;
        this.k++;
        // omezovač otáček: některé zážehy vynechá (koktání)
        if (!(limiter && this.rnd() < 0.45)) {
          const a = this.cylGain[cyl] * (0.42 + 0.58 * load) * (1 + c.jitter * (this.rnd() * 2 - 1));
          if (this.pulses.length < 6) this.pulses.push({ t: 0, d: dur, a: a * (c.bankGain ? c.bankGain[bank] : 1), b: bank });
        }
        if (load < 0.06 && rn > 0.5 && this.rnd() < c.pops) this.pop = 0.5 + this.rnd() * 0.7;   // prsknutí z výfuku
      }
      // tlakové pulzy válců (zvýšený kosinus) + šum spalování, rozdělené do větví výfuku
      let x0 = 0, x1 = 0;
      for (let j = this.pulses.length - 1; j >= 0; j--) {
        const q = this.pulses[j], u = q.t / q.d;
        const v = q.a * (0.5 - 0.5 * Math.cos(2 * Math.PI * u)) * (1 + 0.25 * load * (this.rnd() - 0.5));
        if (q.b) x1 += v; else x0 += v;
        if (++q.t >= q.d) this.pulses.splice(j, 1);
      }
      if (this.pop > 0.002) { const n = (this.rnd() * 2 - 1) * this.pop * 1.6; x0 += n; x1 += n; this.pop *= 0.986; }
      // výfukové trubky: vlnovod – odraz na konci trubky (s opačnou fází) a tlumení
      let ex = 0;
      for (let b = 0; b < this.pipes.length; b++) {
        const P = this.pipes[b], r = (P.w - P.len + 4096) & 4095;
        const back = P.buf[r];
        P.lp += (back - P.lp) * (1 - c.damp);
        const y = (b ? x1 : x0) - c.fb * 0.72 * P.lp;
        P.buf[P.w] = y; P.w = (P.w + 1) & 4095;
        ex += y;
      }
      if (this.pipes.length === 1) ex += x1;   // jedna řada – všechny pulzy do jedné trubky
      // tlumič
      this.m1 += (ex - this.m1) * km; this.m2 += (this.m1 - this.m2) * km;
      // dunění (rezonance) z pulzů
      const yb = ab * this.boom[0] + bb * this.boom[1] + ex; this.boom[1] = this.boom[0]; this.boom[0] = yb;
      // sání: šum modulovaný pulzy, pod plynem víc
      this.env += (Math.abs(ex) - this.env) * 0.01;
      this.inl += ((this.rnd() * 2 - 1) - this.inl) * 0.35;
      const intake = this.inl * c.intake * (0.03 + 0.97 * load) * (0.3 + this.env);
      // mechanika (rozvody, u dieselu klepání): vysokofrekvenční šum v rytmu zážehů
      this.mh = (this.rnd() * 2 - 1) - this.mh * 0.2;
      const mech = this.mh * c.mech * 0.08 * (0.3 + rn) * (0.4 + this.env) * (0.25 + 0.75 * load);
      let s = this.m2 * 1.0 + yb * gb * 0.8 + intake * 0.25 + mech;
      this.dc += (s - this.dc) * 0.002; s -= this.dc;
      // pomalé vyrovnání hlasitosti: rezonance potrubí mění barvu, ne hlasitost o desítky procent
      this.pw += (s * s - this.pw) * agcK;
      s *= Math.max(0.25, Math.min(4, Math.pow(target / Math.sqrt(this.pw + 1e-9), 0.8)));
      // mírné zkreslení (pod plynem víc); bez plynu se méně zkreslený signál dorovná, aby motor nezmizel
      s = Math.tanh(s * pre) * comp * gain;
      for (let ch = 0; ch < out.length; ch++) out[ch][i] = s;
    }
    return true;
  }
}
registerProcessor('engine-voice', EngineVoice);
`;


export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.others = []; this.interior = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    // master → (utlumení v kokpitu) → kompresor → výstup
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    this.cabin = ctx.createBiquadFilter(); this.cabin.type = 'lowpass'; this.cabin.frequency.value = 20000; this.cabin.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    const tame = ctx.createBiquadFilter(); tame.type = 'highshelf'; tame.frequency.value = 2800; tame.gain.value = -7;   // ostré výšky dolů
    this.master.connect(this.cabin).connect(tame).connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);        // zvuky auta hráče

    // šum (sdílený buffer) pro pneumatiky, povrch, vítr, nárazy
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
    const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
    const bq = (type, f, q = 1, g = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };
    const gn = v => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // záložní motor z oscilátorů (než se načte AudioWorklet, nebo když ho prohlížeč nemá)
    this.engGain = gn(0); this.engFilter = bq('lowpass', 800, 3);
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(2.2 * (i / 512 - 1));
    shaper.curve = curve;
    this.oscs = [['sawtooth', 1, 0.5], ['sawtooth', 0.5, 0.45], ['square', 2, 0.12]].map(([type, mul, g]) => {
      const o = ctx.createOscillator(); o.type = type; o.connect(gn(g)).connect(shaper); o.start(); return { o, mul };
    });
    chain(shaper, this.engFilter, this.engGain, this.sfx);

    // pneumatiky: kvílení = úzká pásma šumu (základ + vyšší), výška podle skluzu
    this.sqGain = gn(0); this.sq1 = bq('bandpass', 900, 14); this.sq2 = bq('bandpass', 1800, 10);
    const sqMix = gn(1);
    noise().connect(this.sq1).connect(sqMix); noise().connect(this.sq2).connect(gn(0.5)).connect(sqMix);
    // tónová složka kvílení (skutečné kvílení gumy je dost tónové): dva oscilátory, výška se rychle chvěje
    this.sqOsc = [['triangle', 1, 0.05], ['sine', 2.02, 0.03]].map(([type, mul, g]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 900 * mul; o.start(); o.connect(gn(g)).connect(sqMix); return { o, mul };
    });
    chain(sqMix, this.sqGain, this.sfx);
    // povrch: tráva (tlumené šustění) a šotolina (křupání kamínků)
    this.grassGain = gn(0); chain(noise(), bq('lowpass', 650, 0.7), this.grassGain, this.sfx);
    this.gravelGain = gn(0); chain(noise(), bq('bandpass', 1500, 0.8), this.gravelGain, this.sfx);
    // valivý hukot pneumatik po asfaltu
    this.rollGain = gn(0); this.rollF = bq('lowpass', 160, 0.8); chain(noise(), this.rollF, this.rollGain, this.sfx);
    // vítr kolem auta
    this.windGain = gn(0); this.windF = bq('bandpass', 500, 0.6); chain(noise(), this.windF, this.windGain, this.master);
    // turbo: pískání (sinus) + svist
    this.turboGain = gn(0); this.turboOsc = ctx.createOscillator(); this.turboOsc.type = 'sine'; this.turboOsc.frequency.value = 3000; this.turboOsc.start();
    this.turboOsc.connect(this.turboGain); this.turboGain.connect(this.sfx);
    this.turboHiss = gn(0); this.turboHissF = bq('bandpass', 4500, 2); chain(noise(), this.turboHissF, this.turboHiss, this.sfx);

    this.prev = { air: 0, gear: 1, boost: 0, throttle: 0 };
    this.shiftT = 0;
    this.engine = DEFAULT_ENGINE; this.spec = null;
    // hlavní motor jako AudioWorklet (načte se asynchronně)
    if (ctx.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      ctx.audioWorklet.addModule(url).then(() => {
        this.voice = this.makeVoice(this.sfx);
        this.voice.setEngine(this.engine);
        for (let i = 0; i < 3; i++) this.others.push(this.makeVoice(this.master, true));
      }).catch(() => { /* zůstane záložní motor */ });
    }
  }

  // hlas motoru (AudioWorklet); spatial = s pánováním a vlastní hlasitostí (soupeř)
  makeVoice(out, spatial = false) {
    const ctx = this.ctx;
    const node = new AudioWorkletNode(ctx, 'engine-voice', { numberOfInputs: 0, outputChannelCount: [1], processorOptions: { engine: this.engine } });
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 9000;   // vzdálenost tlumí výšky
    if (spatial) { const pan = ctx.createStereoPanner(); tone.connect(pan); pan.connect(out); node.pan = pan; } else tone.connect(out);
    node.connect(tone);
    node.tone = tone;
    node.engine = this.engine;
    node.setEngine = e => { if (node.engine !== e) { node.engine = e; node.port.postMessage(e); } };
    node.p = n => node.parameters.get(n);
    return node;
  }

  setMuted(m) { this.enabled = !m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }

  // pohled z kokpitu: zvuky zvenku utlumené karoserií
  setInterior(v) {
    if (!this.ctx || this.interior === v) return;
    this.interior = v;
    this.cabin.frequency.setTargetAtTime(v ? 2600 : 20000, this.ctx.currentTime, 0.08);
  }

  engineFor(spec) { return (spec && ENGINES[spec.look?.style]) || DEFAULT_ENGINE; }

  update(car, active) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, set = (param, v, tc = 0.05) => param.setTargetAtTime(v, t, tc);
    const quiet = () => {
      set(this.engGain.gain, 0, 0.1); [this.sqGain, this.grassGain, this.gravelGain, this.rollGain, this.windGain, this.turboGain, this.turboHiss].forEach(g => set(g.gain, 0, 0.08));
      if (this.voice) set(this.voice.p('gain'), 0, 0.1);
      for (const v of this.others) set(v.p('gain'), 0, 0.1);
    };
    if (!active || !car) { quiet(); return; }
    if (car.spec && car.spec !== this.spec) { this.spec = car.spec; this.engine = this.engineFor(car.spec); this.voice?.setEngine(this.engine); }
    const E = this.engine, turbo = E.turbo || 0, redline = car.spec?.redline || this.redline || 7000;
    this.redline = redline;
    const speed = car.speed || 0, onG = car.onGround ? 1 : 0;
    const dtA = Math.min(0.1, Math.max(0, t - (this.prevT ?? t))); this.prevT = t;   // čas od minulého snímku

    // řazení: krátké přerušení zapalování (nahoru) / meziplyn (dolů)
    if (car.gear != null && car.gear !== this.prev.gear) {
      if (car.gear > this.prev.gear && this.prev.gear > 0) { this.shiftT = 0.09; if (turbo && this.prev.boost > 0.4) this.blowOff(this.prev.boost * turbo); }
      this.prev.gear = car.gear;
    }
    this.shiftT = Math.max(0, this.shiftT - dtA);
    let load = car.throttle || 0;
    if (this.shiftT > 0) load *= 0.15;

    // motor
    const vol = E.vol * 0.8 * (0.3 + 0.13 * load + 0.06 * Math.min(1, car.rpm / redline));
    if (this.voice) {
      set(this.voice.p('rpm'), car.rpm, 0.025); set(this.voice.p('load'), load, 0.03); this.voice.p('redline').value = redline;
      set(this.voice.p('gain'), vol * (this.interior ? 1.25 : 1), 0.04);
      set(this.engGain.gain, 0, 0.1);
    } else {
      const f = car.rpm / 60 * 2;
      for (const { o, mul } of this.oscs) set(o.frequency, f * mul, 0.02);
      set(this.engFilter.frequency, 350 + load * 2200 + car.rpm * 0.15);
      set(this.engGain.gain, 0.1 + load * 0.16);
    }

    // turbo: tlak roste s otáčkami pod plynem, pískání stoupá s tlakem
    const boostTarget = turbo ? Math.max(0, Math.min(1, (car.rpm / redline - 0.35) / 0.5)) * (car.throttle || 0) : 0;
    this.prev.boost += (boostTarget - this.prev.boost) * (boostTarget > this.prev.boost ? 0.04 : 0.15);
    const boost = this.prev.boost;
    set(this.turboOsc.frequency, 1400 + boost * 2600, 0.05);
    set(this.turboGain.gain, boost * 0.009 * turbo, 0.05);
    set(this.turboHissF.frequency, 2200 + boost * 2200, 0.05);
    set(this.turboHiss.gain, boost * 0.03 * turbo, 0.05);
    if (turbo && this.prev.throttle > 0.6 && (car.throttle || 0) < 0.2 && boost > 0.45) this.blowOff(boost * turbo);
    this.prev.throttle = car.throttle || 0;

    // pneumatiky a povrch podle kol (v záznamu jízdy jen celkový smyk)
    let slipA = 0, nA = 0, grass = 0, gravel = 0, nC = 0;
    if (car.wheels) {
      for (const w of car.wheels) {
        if (!w.contact) continue;
        nC++;
        if (w.ground) grass++;
        else if (w.surf === 'gravel') gravel++;
        else { slipA = Math.max(slipA, w.slip || 0); nA++; }
      }
    } else { slipA = car.skid || 0; nA = onG * 4; nC = nA; }
    const sp = Math.min(1, speed / 6);
    const squeal = Math.max(0, slipA - 0.22) / 0.78;
    set(this.sqGain.gain, squeal * 0.32 * sp * (nA ? 1 : 0) * (0.85 + 0.3 * Math.random()), 0.03);
    set(this.sq1.frequency, 560 + squeal * 340 + Math.min(200, speed * 3) + (Math.random() - 0.5) * 50, 0.03);
    set(this.sq2.frequency, 1150 + squeal * 450, 0.04);
    const sqF = 600 + squeal * 320 + Math.min(180, speed * 2.5);
    for (const { o, mul } of this.sqOsc) set(o.frequency, (sqF + (Math.random() - 0.5) * 90) * mul, 0.015);
    const fG = nC ? grass / nC : 0, fV = nC ? gravel / nC : 0, sv = Math.min(1, speed / 25);
    set(this.grassGain.gain, fG * sv * 0.22 * (0.8 + 0.4 * Math.random()), 0.04);
    set(this.gravelGain.gain, fV * sv * 0.2 * (0.6 + 0.8 * Math.random()), 0.02);
    set(this.rollGain.gain, (nC ? (nA / nC) : 0) * Math.min(0.12, speed * 0.0035) * onG, 0.08);
    set(this.rollF.frequency, 120 + Math.min(260, speed * 4), 0.1);
    // vítr: sílí s rychlostí (v kokpitu tlumený), ve vzduchu víc
    set(this.windGain.gain, Math.min(0.22, speed * speed / 14000) * (this.interior ? 0.4 : 1) * (onG ? 1 : 1.3), 0.2);
    set(this.windF.frequency, 220 + speed * 6, 0.2);

    // dopad po skoku: tupá rána podle délky letu
    if (this.prev.air > 0.25 && onG) this.thump(Math.min(1.5, this.prev.air * 0.9));
    this.prev.air = onG ? 0 : (this.prev.air + dtA);
  }

  // motory ostatních aut v okolí: list = [{ spec, rpm, throttle, dist, pan, doppler }] (nejbližší první)
  updateOthers(list) {
    if (!this.ctx || !this.others.length) return;
    const t = this.ctx.currentTime;
    this.others.forEach((v, i) => {
      const o = list[i];
      if (!o) { v.p('gain').setTargetAtTime(0, t, 0.15); return; }
      const E = this.engineFor(o.spec);
      v.setEngine(E);
      const att = 1 / (1 + (o.dist / 9) ** 1.6);
      v.p('rpm').setTargetAtTime(o.rpm * o.doppler, t, 0.04);
      v.p('load').setTargetAtTime(o.throttle, t, 0.05);
      v.p('redline').value = (o.spec?.redline || 7000) * o.doppler;
      v.p('gain').setTargetAtTime(E.vol * (0.12 + 0.18 * o.throttle) * att * 0.8, t, 0.06);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, o.pan)), t, 0.05);
      v.tone.frequency.setTargetAtTime(1500 + 9000 * att, t, 0.1);
    });
  }

  // ufouknutí přepouštěcího ventilu turba
  blowOff(s) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.45);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * Math.min(1, s), t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    n.connect(f).connect(g).connect(this.sfx); n.start(t, Math.random()); n.stop(t + 0.55);
    this.prev.boost *= 0.3;
  }

  // tupý dopad (pérování, podvozek)
  thump(s) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(Math.min(0.9, 0.35 * s), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.32);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(Math.min(0.5, 0.18 * s), t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(f).connect(g2).connect(this.sfx); n.start(t, Math.random()); n.stop(t + 0.18);
  }

  // náraz: tupá rána karoserie + drť plechu; silné nárazy i kovové zazvonění
  bang(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, s = Math.min(3, strength);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(900 + s * 500, t); f.frequency.exponentialRampToValueAtTime(350, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(1, 0.3 * s), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + s * 0.08);
    n.connect(f).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + 0.6);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(90 + s * 15, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.2);
    og.gain.setValueAtTime(Math.min(0.8, 0.28 * s), t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.28);
    if (s > 0.9) for (const [fr, a] of [[410, 1], [1130, 0.6], [2650, 0.35], [3770, 0.2]]) {   // plech
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.frequency.value = fr * (0.92 + Math.random() * 0.16);
      rg.gain.setValueAtTime(0.03 * a * Math.min(2, s), t); rg.gain.exponentialRampToValueAtTime(0.0005, t + 0.35 + 0.25 * a);
      r.connect(rg).connect(this.master); r.start(t); r.stop(t + 0.7);
    }
  }

  // ---------------------------------------------------------------- hudba
  // Vlastní skladba ve stylu her z počátku 90. let (FM zvuk jako karta AdLib/OPL2), generovaná v reálném čase:
  // basa, arpeggio akordů, melodie a bicí. 16 taktů (dvě části), 128 BPM, A moll. Žádný zvukový soubor.
  startMusic() {
    if (!this.ctx || this.music) return;
    const ctx = this.ctx, gain = ctx.createGain();
    gain.gain.value = 0; gain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.4);
    gain.connect(this.master);
    this.music = { gain, next: ctx.currentTime + 0.12, step: 0 };
    this.music.timer = setInterval(() => this.scheduleMusic(), 25);
  }
  stopMusic() {
    const m = this.music;
    if (!m) return;
    clearInterval(m.timer);
    m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    setTimeout(() => m.gain.disconnect(), 1200);
    this.music = null;
  }
  scheduleMusic() {
    const m = this.music, ctx = this.ctx;
    if (!m) return;
    if (m.next < ctx.currentTime) m.next = ctx.currentTime + 0.05;       // po uspání karty nedohánět
    const s16 = 60 / 128 / 4;
    while (m.next < ctx.currentTime + 0.15) { this.musicStep(m.step, m.next, s16); m.next += s16; m.step = (m.step + 1) % 256; }
  }
  musicStep(step, t, s16) {
    const bar = step >> 4, s = step & 15, out = this.music.gain;
    // akordy (kořen MIDI, typ): část A a část B
    const CH = [[57, 'm'], [53, 'M'], [48, 'M'], [55, 'M'], [57, 'm'], [53, 'M'], [55, 'M'], [52, 'M'],
      [50, 'm'], [57, 'm'], [52, 'M'], [57, 'm'], [53, 'M'], [55, 'M'], [48, 'M'], [52, 'M']];
    const [root, kind] = CH[bar];
    const tones = [0, kind === 'm' ? 3 : 4, 7].map(x => root + x);
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    // bicí: kopák na 1 a 3, virbl na 2 a 4, hi-hat v osminách, na konci části přechod
    if (s === 0 || s === 8 || (s === 10 && bar % 2)) this.drum(t, 'kick', out);
    if (s === 4 || s === 12 || (bar % 8 === 7 && s >= 13)) this.drum(t, 'snare', out);
    if (s % 2 === 0) this.drum(t, 'hat', out, s % 4 === 2 ? 0.6 : 0.35);
    // basa: osminy, kořen a oktáva
    if (s % 2 === 0) this.fm(t, hz(root - 12 + (s % 8 === 6 ? 12 : 0)), s16 * 1.8, 0.5, 1, 2.2, out);
    // arpeggio: šestnáctiny přes tóny akordu nahoru a dolů
    const arp = [0, 1, 2, 1][s % 4] + (s >= 8 ? 1 : 0);
    this.square(t, hz(tones[arp % 3] + 12 + (arp > 2 ? 12 : 0)), s16 * 0.9, 0.07, out);
    // melodie: vlastní motiv – rytmus a obrys se mění podle části, tóny z akordu a stupnice A moll
    const rhythm = bar < 8 ? [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0] : [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0];
    if (rhythm[s]) {
      const scale = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
      const contour = bar < 8 ? [4, 3, 2, 4, 5, 4, 3, 1] : [2, 4, 6, 7, 6, 4, 5, 3];
      const idx = Math.max(0, Math.min(scale.length - 1, contour[(s >> 1) & 7] + (bar % 4 === 3 ? 2 : 0) + ((bar >> 1) & 1)));
      let n = scale[idx];
      if (s === 0) n = tones[bar % 2 ? 2 : 1] + 12;          // na začátku taktu tón akordu
      this.fm(t, hz(n), s16 * (rhythm[s + 1] ? 1 : 2.6), 0.22, 2, 1.4, out);
    }
  }
  // FM hlas (2 operátory): nosná + modulátor s doznívajícím indexem – typický zvuk OPL2
  fm(t, f, dur, vol, ratio, index, out) {
    const ctx = this.ctx, car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * index * 0.15 + 1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    mod.connect(mg).connect(car.frequency); car.connect(g).connect(out);
    car.start(t); mod.start(t); car.stop(t + dur + 0.02); mod.stop(t + dur + 0.02);
  }
  square(t, f, dur, vol, out) {
    const ctx = this.ctx, o = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f; flt.type = 'lowpass'; flt.frequency.value = 2600;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(flt).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  drum(t, kind, out, vol = 1) {
    const ctx = this.ctx;
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
      return;
    }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf;
    f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const d = kind === 'hat' ? 0.045 : 0.16;
    g.gain.setValueAtTime((kind === 'hat' ? 0.18 : 0.55) * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 1.5); s.stop(t + d + 0.02);
  }

  beep(freq = 660, dur = 0.18) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  }
}
