// Syntetizované zvuky (Web Audio): motor, pískání pneumatik, vítr, nárazy.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(ctx.destination);

    // motor: dvě pily + obdélník přes filtr a mírné zkreslení
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 3;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(2.2 * x); }
    shaper.curve = curve;
    this.oscs = [['sawtooth', 1, 0.5], ['sawtooth', 0.5, 0.45], ['square', 2, 0.12]].map(([type, mul, g]) => {
      const o = ctx.createOscillator(); o.type = type;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(gg).connect(shaper); o.start();
      return { o, mul };
    });
    shaper.connect(this.engFilter).connect(this.engGain).connect(this.master);

    // šum pro pneumatiky a vítr
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    this.noiseBuf = buf;

    this.tireGain = ctx.createGain(); this.tireGain.gain.value = 0;
    const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1100; tf.Q.value = 6;
    const tf2 = ctx.createBiquadFilter(); tf2.type = 'peaking'; tf2.frequency.value = 2400; tf2.gain.value = 8;
    noise().connect(tf).connect(tf2).connect(this.tireGain).connect(this.master);

    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 500;
    noise().connect(wf).connect(this.windGain).connect(this.master);
  }

  setMuted(m) { this.enabled = !m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }

  update(car, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!active || !car) {
      this.engGain.gain.setTargetAtTime(0, t, 0.1);
      this.tireGain.gain.setTargetAtTime(0, t, 0.05);
      this.windGain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    const f = car.rpm / 60 * 2;
    for (const { o, mul } of this.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.02);
    this.engFilter.frequency.setTargetAtTime(350 + car.throttle * 2200 + car.rpm * 0.15, t, 0.05);
    this.engGain.gain.setTargetAtTime(0.1 + car.throttle * 0.16, t, 0.05);
    const onG = car.onGround ? 1 : 0;
    this.tireGain.gain.setTargetAtTime(Math.max(0, car.skid - 0.25) * 0.35 * onG * Math.min(1, car.speed / 6), t, 0.04);
    this.windGain.gain.setTargetAtTime(Math.min(0.25, car.speed * car.speed / 12000), t, 0.2);
  }

  bang(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400 + strength * 600;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(1, 0.25 * strength), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.4);
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
