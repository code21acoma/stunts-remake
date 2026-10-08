// Fyzika vozu: tuhé těleso + 4 paprskové nápravy (pružina, tlumič, doraz, stabilizátor),
// model pneumatiky se skluzovým úhlem a kruhem tření, motor s momentovou křivkou a automatem,
// aerodynamický odpor + přítlak, kolize karoserie impulsy s třením.
import * as THREE from 'three';
import { FENCE } from './track.js';
import { TRAMPOLINE } from './defs.js';
const _wind = new THREE.Vector3();

const G = 9.81;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m3 = new THREE.Matrix3();

// Auta: dims = rozměry (m), look = vzhled a polep modelu
export const CARS = {
  kapka: {
    name: 'Kapka 1.2', desc: 'Malý městský hatchback s předním pohonem. Pomalý rozjezd, ale v zatáčkách drží jako přibitý.',
    mass: 900, torque: 138, redline: 6800, drive: 'fwd', grip: 1.55, gears: [3.4, 2.05, 1.42, 1.12, 1.0], final: 4.8,
    steer: 0.72, brake: 9500, downforce: 0.6, drag: 0.5, assist: 12, stats: { speed: 1, accel: 1, grip: 5 },
    dims: { len: 3.8, width: 1.72, height: 1.5, wheelR: 0.31, wb: 2.4, track: 0.75, clear: 0.17 },
    look: { style: 'hatch', base: 0x39b5c8, accent: 0xffffff, accent2: 0xff7a3d, livery: 'dots', number: '12' },
  },
  buvol: {
    name: 'Buvol 4×4', desc: 'Hranatý terénní džíp s velkými koly. Pomalý a neohrabaný, ale mimo silnici nemá konkurenci.',
    mass: 1850, torque: 480, redline: 5400, drive: 'awd', grip: 1.14, offroad: true, gears: [3.8, 2.3, 1.6, 1.25, 1.1], final: 4.6,
    steer: 0.58, brake: 13500, downforce: 0.4, drag: 0.6, assist: 11, stats: { speed: 2, accel: 2, grip: 3 },
    dims: { len: 4.35, width: 1.94, height: 1.92, wheelR: 0.43, wb: 2.5, track: 0.8, clear: 0.38, rest: 0.46, sag: 0.12 },
    look: { style: 'jeep', base: 0x5d6b35, accent: 0x1b1b1b, accent2: 0xe9dcb4, livery: 'plain', number: '' },
  },
  rally: {
    name: 'Horizont R4', desc: 'Rallyový speciál s pohonem 4×4. Drží jako přilepený, ale nejede tak rychle.',
    mass: 1180, torque: 380, redline: 7600, drive: 'awd', grip: 1.42, offroad: 0.8, gears: [3.4, 2.4, 1.8, 1.4, 1.12, 0.95], final: 3.9,
    steer: 0.62, brake: 11500, downforce: 1.2, assist: 10, stats: { speed: 3, accel: 4, grip: 5 },
    dims: { len: 4.1, width: 1.84, height: 1.42, wheelR: 0.33, wb: 2.55, track: 0.8, clear: 0.2 },
    look: { style: 'rally', base: 0xf4f4f4, accent: 0x1f6fd8, accent2: 0xe63128, livery: 'rally', number: '4' },
  },
  gt: {
    name: 'Vektor GT3', desc: 'Závodní speciál kategorie GT3 s velkým křídlem a spoilerem. Vyvážený, rychlý a hravý.',
    mass: 1250, torque: 430, redline: 7400, drive: 'rwd', grip: 1.34, gears: [3.3, 2.25, 1.68, 1.32, 1.08, 0.9], final: 3.6,
    steer: 0.58, brake: 12500, downforce: 2.3, stats: { speed: 4, accel: 4, grip: 4 },
    dims: { len: 4.55, width: 1.98, height: 1.2, wheelR: 0.35, wb: 2.68, track: 0.84, clear: 0.12 },
    look: { style: 'gt3', base: 0xd81f26, accent: 0x151515, accent2: 0xffffff, livery: 'stripes', number: '7' },
  },
  muscle: {
    name: 'Bizon V8', desc: 'Těžký americký kus s obrovským výkonem. Na rovinkách neporazitelný, v zatáčkách hodně smyku.',
    mass: 1500, torque: 640, redline: 6600, drive: 'rwd', grip: 1.22, gears: [2.9, 1.95, 1.45, 1.15, 0.92, 0.78], final: 3.5,
    steer: 0.54, brake: 12500, downforce: 1.2, assist: 6, stats: { speed: 5, accel: 5, grip: 2 },
    dims: { len: 4.8, width: 1.94, height: 1.32, wheelR: 0.35, wb: 2.8, track: 0.84, clear: 0.15 },
    look: { style: 'muscle', base: 0xf0b21c, accent: 0x111111, accent2: 0xd83a1a, livery: 'flames', number: '69' },
  },
  blesk: {
    name: 'Blesk X1', desc: 'Hypersport s velkým výkonem a přítlakem. Rychlý, ale na formuli nestačí – a chce citlivou nohu.',
    mass: 1320, torque: 400, redline: 8200, drive: 'awd', grip: 1.3, gears: [3.5, 2.4, 1.8, 1.42, 1.17, 1.0, 0.88], final: 3.6,   // 7 stupňů, jednička do ~80 km/h
    steer: 0.55, brake: 14500, downforce: 3.2, stats: { speed: 4, accel: 4, grip: 4 },
    dims: { len: 4.55, width: 2.0, height: 1.12, wheelR: 0.35, wb: 2.7, track: 0.86, clear: 0.12 },
    look: { style: 'hyper', base: 0x7a2cff, accent: 0x111111, accent2: 0x39ffcf, livery: 'hyper', number: '1' },
  },
  formule: {
    name: 'Šíp F1', desc: 'Formule s otevřenými koly. Obrovský přítlak, brzdy a přilnavost – ale na hrbolech a trávě je nervózní.',
    mass: 760, torque: 420, redline: 12000, drive: 'rwd', grip: 1.62, gears: [3.0, 2.3, 1.85, 1.55, 1.32, 1.14, 1.0], final: 4.4,
    steer: 0.5, brake: 17000, downforce: 4.6, drag: 0.52, assist: 10, stats: { speed: 5, accel: 5, grip: 5 },
    dims: { len: 5.2, width: 1.96, height: 0.98, wheelR: 0.34, wb: 3.3, track: 0.8, clear: 0.06, rest: 0.24, sag: 0.05, com: 0.32, hullMin: 0.16, endLift: 0.38 },
    look: { style: 'formula', base: 0xd8141c, accent: 0xf2f2f2, accent2: 0xffd21f, livery: 'plain', number: '5' },
  },
};

// odvozené rozměry: montážní body kol, výška těžiště, body trupu pro kolize
export function carDims(spec) {
  const d = spec.dims;
  const rest = d.rest ?? 0.36, sag = d.sag ?? 0.085, wheelR = d.wheelR;
  const hl = d.len / 2, hw = d.width / 2;
  const comH = d.com ?? Math.max(0.46, d.clear + (d.height - d.clear) * 0.3);   // těžiště nad zemí
  const groundY = -comH;
  const mountY = groundY + rest + wheelR - sag;
  const bot = groundY + Math.max(d.hullMin ?? 0.26, d.clear + 0.1), top = groundY + d.height, belt = groundY + d.height * 0.6;
  const hull = [];
  const endBot = bot + (d.endLift ?? 0);   // u dlouhých nízkých aut (formule) jsou konce výš – projedou looping
  for (const x of [-hw + 0.03, hw - 0.03]) for (const z of [-hl + 0.05, hl - 0.05]) hull.push([x, endBot, z], [x, Math.max(belt, endBot + 0.1), z]);
  for (const x of [-hw * 0.7, hw * 0.7]) for (const z of [-hl * 0.45, hl * 0.2]) hull.push([x, top - 0.02, z]);
  hull.push([0, endBot + 0.1, hl], [0, endBot + 0.1, -hl], [hw, bot + 0.25, 0], [-hw, bot + 0.25, 0], [0, bot, 0], [0, top, -hl * 0.1]);
  // front = přední body (čelní náraz), low = spodní hrana (obrubník, okraj silnice – jen škrábnutí)
  hull.forEach(p => { p.front = p[2] > hl * 0.8; p.low = p[1] <= endBot + 0.11; });
  return { rest, sag, wheelR, hl, hw, groundY, mountY, wbF: d.wb / 2 + 0.03, wbR: -(d.wb / 2 - 0.03), track: d.track, hull, len: d.len, width: d.width, height: d.height, clear: d.clear };
}

export const BOOST_ACC = 16;     // m/s² navíc na urychlovači
export const CRASH_SPEED = 13;   // m/s kolmé složky rychlosti při čelním nárazu = havárie
export const DAMAGE_MIN_SPEED = 4;   // pomalejší doteky auto nepoškodí

export class Vehicle {
  constructor(spec) {
    this.spec = spec;
    this.m = spec.mass;
    const D = this.d = carDims(spec);
    const w = D.width, h = D.height, l = D.len, k = 1.35;
    this.Ibody = new THREE.Vector3(this.m / 12 * (h * h + l * l) * k, this.m / 12 * (w * w + l * l) * k, this.m / 12 * (w * w + h * h) * k);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.ang = new THREE.Vector3();
    this.wheels = [
      { local: new THREE.Vector3(D.track, D.mountY, D.wbF), front: true },
      { local: new THREE.Vector3(-D.track, D.mountY, D.wbF), front: true },
      { local: new THREE.Vector3(D.track, D.mountY, D.wbR), front: false },
      { local: new THREE.Vector3(-D.track, D.mountY, D.wbR), front: false },
    ].map(w => Object.assign(w, {
      driven: spec.drive === 'awd' || (spec.drive === 'fwd' ? w.front : !w.front), comp: 0, lastComp: 0, contact: false, spin: 0, spinVel: 0,
      slip: 0, load: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), ground: false,
    }));
    this.steer = 0;
    this.gear = 1;          // 0 = zpátečka (R), 1..n
    this.rpm = 900;
    this.throttle = 0;
    this.braking = 0;
    this.shiftTimer = 0;
    this.speed = 0;
    this.fwdSpeed = 0;
    this.airTime = 0;
    this.impact = 0;        // síla posledního nárazu (pro zvuk/kameru)
    this.inWater = false;
    this.onGround = false;
    this.skid = 0;
    this.crashed = null;    // {speed} po čelním nárazu
    // poškození 0–100 %, podle zón; hits = nové nárazy k vykreslení (promáčkliny)
    this.damage = 0;
    this.zones = { front: 0, rear: 0, left: 0, right: 0 };
    this.hits = [];
    this.destroyed = false;
  }
  reset(p, dir) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.ang.set(0, 0, 0);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().negate(), new THREE.Vector3(0, 1, 0));
    this.quat.setFromRotationMatrix(m);
    this.gear = 1; this.rpm = 900; this.steer = 0;
    for (const w of this.wheels) { w.comp = w.lastComp = this.d.sag; w.contact = false; }
    this.crashed = null;
  }

  axes() {
    const fwd = _fwd.set(0, 0, 1).applyQuaternion(this.quat);
    const up = _up.set(0, 1, 0).applyQuaternion(this.quat);
    const right = _right.set(-1, 0, 0).applyQuaternion(this.quat);
    return { fwd, up, right };
  }

  invInertiaWorld() {
    _m3.setFromMatrix4(_m4.makeRotationFromQuaternion(this.quat));
    const R = _m3;
    const Rt = _m3b.copy(R).transpose();
    const D = _m3c.set(1 / this.Ibody.x, 0, 0, 0, 1 / this.Ibody.y, 0, 0, 0, 1 / this.Ibody.z);
    return _m3d.copy(R).multiply(D).multiply(Rt);
  }

  step(dt, input, track) {
    const s = this.spec;
    const D = this.d, WHEEL_R = D.wheelR, REST = D.rest;
    const { fwd, up, right } = this.axes();
    const Iinv = this.invInertiaWorld();
    const F = _F.set(0, -G * this.m, 0);
    const Tq = _Tq.set(0, 0, 0);
    const addForceAt = (f, point) => {
      F.add(f);
      _v.subVectors(point, this.pos).cross(f);
      Tq.add(_v);
    };

    const vFwd = this.vel.dot(fwd);
    this.fwdSpeed = vFwd;
    this.speed = this.vel.length();

    // ---------- řízení (citlivé na rychlost, plynulé)
    const maxSteer = s.steer * (1 / (1 + Math.max(0, Math.abs(vFwd) - 5) / 12));
    const target = -input.steer * maxSteer;
    const rate = (Math.sign(target - this.steer) !== Math.sign(this.steer) ? 5.5 : 3.2) * dt;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rate, rate);

    // ---------- plyn / brzda / zpátečka
    let throttle = input.throttle, brake = input.brake;
    if (input.hold) { /* držení na místě bez řazení zpátečky */ }
    else if (this.gear === 0) {
      // v zpátečce se role prohodí
      if (input.throttle > 0.1 && vFwd > -1) { this.gear = 1; }
      throttle = input.brake; brake = input.throttle;
    } else if (input.brake > 0.1 && vFwd < 1.0 && input.throttle < 0.1) {
      this.gear = 0; throttle = input.brake; brake = 0;
    }
    this.throttle = throttle; this.braking = brake;

    // ---------- motor a převodovka
    const drivenCount = this.wheels.filter(w => w.driven).length;
    const ratio = this.gear === 0 ? -3.2 : s.gears[this.gear - 1];
    const wheelOmega = Math.abs(vFwd) / WHEEL_R;
    let rpm = wheelOmega * Math.abs(ratio) * s.final * 60 / (2 * Math.PI);
    const anySpin = this.wheels.some(w => w.driven && w.slip > 0.6);
    if (anySpin || !this.onGround) rpm = Math.max(rpm, 1000 + throttle * (s.redline - 800) * 0.9);
    rpm = Math.max(900, Math.min(rpm, s.redline + 200));
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 12);
    this.shiftTimer -= dt;
    if (this.gear > 0 && this.shiftTimer <= 0) {
      const realRpm = wheelOmega * ratio * s.final * 60 / (2 * Math.PI);
      if (realRpm > s.redline - 250 && this.gear < s.gears.length) { this.gear++; this.shiftTimer = 0.35; this.shifted = true; }
      else if (this.gear > 1) {
        const lower = wheelOmega * s.gears[this.gear - 2] * s.final * 60 / (2 * Math.PI);
        if (lower < s.redline * 0.62) { this.gear--; this.shiftTimer = 0.35; this.shifted = true; }
      }
    }
    const r01 = THREE.MathUtils.clamp((this.rpm - 1000) / (s.redline - 1000), 0, 1);
    const torque = s.torque * (0.62 + 0.55 * Math.sin(Math.PI * Math.min(1, r01 * 0.95 + 0.05)) - 0.25 * r01 * r01);
    const cut = this.rpm >= s.redline ? 0 : 1;
    const shifting = this.shiftTimer > 0.2 ? 0.3 : 1;
    // jemná kontrola trakce: při velkém bočním skluzu hnaných kol ubere výkon
    const rearAlpha = Math.max(...this.wheels.filter(w => w.driven).map(w => w.alpha || 0));
    const tc = input.handbrake ? 1 : 1 - THREE.MathUtils.clamp((rearAlpha - 0.12) * 2.5, 0, 0.75);
    // poškození mírně snižuje zrychlení (až −30 %) a maximální rychlost (až −20 %)
    const dmg = Math.min(1, this.damage / 100);
    const health = 1 - 0.3 * dmg;
    const vTop = s.redline * Math.PI / 30 * WHEEL_R / (s.gears[s.gears.length - 1] * s.final);
    const vCap = vTop * (1 - 0.2 * dmg);
    const governor = this.gear > 0 && dmg > 0 ? THREE.MathUtils.clamp((vCap - vFwd) / 2, 0, 1) : 1;
    this.powerFactor = health;
    this.speedFactor = 1 - 0.2 * dmg;
    let driveForce = throttle * torque * ratio * s.final / WHEEL_R * cut * shifting * 0.9 * tc * health * governor;

    // ---------- kola
    let contacts = 0;
    const surfaceGrip = [];
    for (const w of this.wheels) {
      const mount = _mount.copy(w.local).applyQuaternion(this.quat).add(this.pos);
      const dir = _dir.copy(up).negate();
      const hit = track.raycast(mount, dir, REST + WHEEL_R);
      w.lastComp = w.comp;
      if (!hit) {
        w.contact = false; w.comp = Math.max(0, w.comp - dt * 3); w.load = 0; w.slip = 0;
        w.spinVel = w.driven && throttle > 0 ? w.spinVel + dt * 60 * throttle : w.spinVel * 0.99;
        continue;
      }
      contacts++;
      w.contact = true; w.ground = hit.ground; w.surf = hit.surf || null;   // povrch pro zvuk (tráva, šotolina, olej)
      w.comp = REST + WHEEL_R - hit.dist;
      w.point.copy(hit.point); w.normal.copy(hit.normal);
      // tráva: silniční auta kloužou, terénní méně; šotolina (štěrková silnice) je něco mezi
      surfaceGrip.push(hit.ground ? (s.offroad ? (s.offroad === true ? 0.98 : s.offroad) : 0.62)
        : hit.surf === 'gravel' ? (s.offroad ? 0.95 : 0.74) : hit.surf === 'oil' ? 0.28 : 1);
    }
    // stabilizátory (rozdíl stlačení na nápravě)
    const arb = [[0, 1, 26000], [2, 3, 20000]];
    const arbF = [0, 0, 0, 0];
    for (const [a, b, k] of arb) {
      const d = (this.wheels[a].contact ? this.wheels[a].comp : 0) - (this.wheels[b].contact ? this.wheels[b].comp : 0);
      arbF[a] += k * d; arbF[b] -= k * d;
    }
    const k = this.m * G / 4 / D.sag;  // statické stlačení
    const c = 2 * Math.sqrt(k * this.m / 4) * 0.55;
    let gi = 0;
    this.skid = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.contact) continue;
      const mu = s.grip * surfaceGrip[gi++];
      const cv = (w.comp - w.lastComp) / dt;
      let fs = k * w.comp + c * cv + arbF[i];
      if (w.comp > REST * 0.78) fs += 280000 * (w.comp - REST * 0.78);   // doraz
      fs = Math.max(0, fs);
      w.load = fs;
      // síla pružení podél normály karoserie
      addForceAt(_v2.copy(up).multiplyScalar(fs), _mount.copy(w.local).applyQuaternion(this.quat).add(this.pos));

      // pneumatika
      const n = w.normal;
      const wf = _wf.copy(fwd);
      if (w.front) wf.applyAxisAngle(up, this.steer);
      wf.addScaledVector(n, -wf.dot(n)).normalize();
      const ws = _ws.crossVectors(n, wf).normalize();
      const r = _r.subVectors(w.point, this.pos);
      const vp = _vp.copy(this.ang).cross(r).add(this.vel);
      const vLong = vp.dot(wf), vLat = vp.dot(ws);
      const Fz = Math.min(fs, this.m * G * 1.6);
      const maxF = mu * Fz;

      // podélně
      let fx = 0;
      if (w.driven) fx += driveForce / drivenCount;
      const hand = input.handbrake && !w.front;
      const bForce = s.brake * brake * (w.front ? 0.6 : 0.4) + (hand ? 9000 : 0) + 180;  // + valivý odpor
      if (Math.abs(vLong) > 0.6) fx -= Math.sign(vLong) * bForce;
      else fx -= THREE.MathUtils.clamp(vLong * bForce * 1.2, -bForce, bForce) * (brake > 0.05 || hand || throttle < 0.05 ? 1 : 0.1);

      // bočně: skluzový úhel + tlumení při nízké rychlosti
      const absL = Math.abs(vLong);
      const alpha = Math.atan2(vLat, absL + 1.5);
      w.alpha = absL > 3 ? Math.abs(alpha) : 0;
      const peak = Math.sin(1.75 * Math.atan(9 * alpha));   // "Pacejka-lite"
      let fy = -maxF * peak * (hand ? 0.45 : 1);
      if (absL < 4) {
        const visc = -vLat * this.m * 0.25 * 12;
        const t = absL / 4;
        fy = fy * t + THREE.MathUtils.clamp(visc, -maxF, maxF) * (1 - t);
      }
      // kruh tření
      const tot = Math.hypot(fx, fy);
      let slip = 0;
      if (tot > maxF) {
        const sc = maxF / tot; fx *= sc; fy *= sc;
        slip = Math.min(1, (tot - maxF) / maxF);
      }
      w.slip = Math.max(slip, Math.min(1, Math.abs(alpha) * 3.2 - 0.5)) * (absL > 3 || Math.abs(vLat) > 2 ? 1 : 0);
      if (hand && absL > 3) w.slip = Math.max(w.slip, 0.7);
      if (w.slip > this.skid) this.skid = w.slip;
      const ft = _v2.copy(wf).multiplyScalar(fx).addScaledVector(ws, fy);
      // působiště bočních sil posunuté nahoru snižuje klopení
      addForceAt(ft, _v3.copy(w.point).addScaledVector(up, 0.22));

      // rotace kola (vizuální)
      const spinning = w.driven && slip > 0.3 && throttle > 0.5;
      w.spinVel = spinning ? vLong / WHEEL_R + Math.sign(ratio) * 25 * slip : vLong / WHEEL_R;
      if (hand) w.spinVel = 0;
    }
    for (const w of this.wheels) w.spin += w.spinVel * dt;
    this.onGround = contacts > 0;
    this.airTime = this.onGround ? 0 : this.airTime + dt;

    // ---------- aerodynamika
    const sp = this.speed;
    F.addScaledVector(this.vel, -(s.drag ?? 0.42) * sp);
    F.addScaledVector(up, -s.downforce * vFwd * vFwd * (contacts > 1 ? 1 : 0.3));

    // urychlovač: dokud jsou kola na ploše se šipkami, tlačí auto dopředu (do ~250 km/h)
    this.boosting = contacts > 1 && vFwd > 1 && vFwd < 70 && !!track.boostAt?.(this.pos);
    if (this.boosting) F.addScaledVector(fwd, this.m * BOOST_ACC);
    // boční vítr od ventilátorů
    const wind = track.windAt?.(this.pos, _wind);
    if (wind) F.addScaledVector(wind, this.m);
    // trampolína: kola na pružné ploše auto vymrští vzhůru (jednou za dotyk)
    this.bounced = false;
    if (contacts > 0 && this.vel.y < TRAMPOLINE.kick * 0.5 && track.trampolineAt?.(this.pos)) {
      this.vel.y = TRAMPOLINE.kick; this.bounced = true;
      this.ang.x += (Math.random() - 0.5) * 0.4;
    }

    // voda
    this.inWater = track.isWater(this.pos.x, this.pos.y, this.pos.z);
    if (this.inWater) { F.addScaledVector(this.vel, -this.m * 1.6); Tq.addScaledVector(this.ang, -this.m * 0.8); }

    // ovládání ve vzduchu (lehké), tlumení rotace
    if (!this.onGround) {
      // ve vzduchu jen jemné vyrovnávání náklonu řízením (plyn už příď nestáčí)
      Tq.addScaledVector(fwd, input.steer * this.m * 0.35);
      Tq.addScaledVector(this.ang, -this.m * 0.12);
    } else {
      Tq.addScaledVector(this.ang, -this.m * 0.25);
      // asistent stability: při velkém smyku (bez ruční brzdy) natáčí příď zpět do směru jízdy
      if (!input.handbrake && Math.abs(vFwd) > 5 && vFwd > 0) {
        const beta = Math.atan2(this.vel.dot(right), vFwd);
        const ex = Math.sign(beta) * Math.max(0, Math.min(0.7, Math.abs(beta)) - 0.1);
        Tq.addScaledVector(up, -ex * this.m * (s.assist ?? 9));
      }
    }

    // ---------- integrace
    this.vel.addScaledVector(F, dt / this.m);
    _v.copy(Tq).applyMatrix3(Iinv);
    this.ang.addScaledVector(_v, dt);
    if (this.ang.length() > 14) this.ang.setLength(14);
    this.pos.addScaledVector(this.vel, dt);
    const a = this.ang;
    _q.set(a.x * dt * 0.5, a.y * dt * 0.5, a.z * dt * 0.5, 0).multiply(this.quat);
    this.quat.x += _q.x; this.quat.y += _q.y; this.quat.z += _q.z; this.quat.w += _q.w;
    this.quat.normalize();

    // ---------- kolize karoserie
    this.collide(track, dt);

    // hranice mapy: plot – auto se zastaví, jakmile se ho dotkne kterýkoli roh (ne až střed), a odrazí se
    const f2 = _v4.set(0, 0, 1).applyQuaternion(this.quat), r2 = _v5.set(1, 0, 0).applyQuaternion(this.quat);
    for (const ax of ['x', 'z']) {
      const ext = Math.abs(f2[ax]) * this.d.hl + Math.abs(r2[ax]) * this.d.hw;   // dosah karoserie v ose
      const lim = FENCE - 0.25 - ext;
      if (Math.abs(this.pos[ax]) > lim) {
        const s = Math.sign(this.pos[ax]);
        this.pos[ax] = s * lim;
        if (this.vel[ax] * s > 0) { this.impact = Math.max(this.impact, Math.abs(this.vel[ax])); this.vel[ax] *= -0.3; this.vel.multiplyScalar(0.85); }
      }
    }
  }

  collide(track, dt) {
    const Iinv = this.invInertiaWorld();
    const fwdW = _v4.set(0, 0, 1).applyQuaternion(this.quat);
    const upW = _v5.set(0, 1, 0).applyQuaternion(this.quat);
    let ev = null;
    this.impact = Math.max(0, this.impact - dt * 4);
    let pushX = 0, pushY = 0, pushZ = 0;
    const center = _center.copy(this.pos);
    const loopTile = !!track.noCrashAt?.(this.pos);
    for (const hp of this.d.hull) {
      const pt = _pt.set(hp[0], hp[1], hp[2]).applyQuaternion(this.quat).add(this.pos);
      const d = _d.subVectors(pt, center);
      const len = d.length();
      d.divideScalar(len);
      const hit = track.raycast(center, d, len);
      if (!hit) continue;
      // v loopingu nese auto jen na kolech: spodní hrana karoserie se o zakřivenou silnici neopírá
      // (jinak by ji v přetížení nadzvedla, kola by ztratila kontakt a auto by prudce zpomalilo)
      if (loopTile && hp.low && hit.normal.dot(upW) > 0.7) continue;
      const depth = len - hit.dist;
      const n = hit.normal;
      const r = _r.subVectors(pt, this.pos);
      const vp = _vp.copy(this.ang).cross(r).add(this.vel);
      const vn = vp.dot(n);
      if (vn < 0) {
        const rn = _v.copy(r).cross(n).applyMatrix3(Iinv).cross(r);
        const denom = 1 / this.m + n.dot(rn);
        // v loopingu/rouře při velkém přetížení dosedne podvozek na silnici – klouže bez tření a odrazu,
        // jinak by drhnutí auto v loopingu silně přibrzdilo
        const slideLoop = loopTile && n.dot(upW) > 0.7;
        const e = -vn > 3 && !slideLoop ? 0.25 : 0;
        const j = -(1 + e) * vn / denom;
        // tření
        const vt = _v2.copy(vp).addScaledVector(n, -vn);
        const vtl = vt.length();
        const imp = _v3.copy(n).multiplyScalar(j);
        if (vtl > 1e-3 && !slideLoop) {
          const rt = _v.copy(r).cross(vt.divideScalar(vtl)).applyMatrix3(Iinv).cross(r);
          const jt = Math.min(vtl / (1 / this.m + vt.dot(rt)), 0.45 * j);
          imp.addScaledVector(vt, -jt);
        }
        this.vel.addScaledVector(imp, 1 / this.m);
        this.ang.add(_v.copy(r).cross(imp).applyMatrix3(Iinv));
        this.impact = Math.max(this.impact, -vn);
        // čelní náraz do překážky/zdi ve vysoké rychlosti = okamžitý konec
        const frontal = hp.front && !hp.low && n.dot(fwdW) < -0.55 && n.y < 0.7;
        if (frontal && -vn > CRASH_SPEED && !this.crashed && !track.noCrashAt?.(this.pos)) this.crashed = { speed: -vn };
        // poškození: podle rychlosti proti překážce a úhlu (čelně plně, bokem/šikmo méně, dosednutí na zem málo)
        // náraz podlahou do silnice (i v loopingu/klopení) je jen dosednutí, ne náraz do překážky
        const sp = -vn, ground = n.y > 0.7 || n.dot(upW) > 0.7;
        if (sp > DAMAGE_MIN_SPEED && !(ground && sp < 11)) {
          const angle = frontal ? 1 : hp.low ? 0.25 : 0.3 + 0.55 * Math.abs(n.dot(fwdW));
          const dmg = 2.2 * Math.pow(sp - DAMAGE_MIN_SPEED, 1.3) * (ground ? 0.2 : angle);
          if (!ev || dmg > ev.dmg) ev = { dmg, speed: sp, frontal, point: pt.clone(), normal: n.clone() };
        }
      }
      // vytlačení z geometrie
      const px = n.x * depth, py = n.y * depth, pz = n.z * depth;
      if (Math.abs(px) > Math.abs(pushX)) pushX = px;
      if (Math.abs(py) > Math.abs(pushY)) pushY = py;
      if (Math.abs(pz) > Math.abs(pushZ)) pushZ = pz;
    }
    this.pos.x += pushX * 0.9; this.pos.y += pushY * 0.9; this.pos.z += pushZ * 0.9;
    if (ev) this.applyDamage(ev);
  }

  applyDamage(ev) {
    // do souřadnic auta
    const inv = _q2.copy(this.quat).invert();
    const local = ev.point.sub(this.pos).applyQuaternion(inv);
    const dir = ev.normal.applyQuaternion(inv);
    const D = this.d;
    const zone = local.z > D.hl * 0.45 ? 'front' : local.z < -D.hl * 0.45 ? 'rear' : local.x > 0 ? 'left' : 'right';
    this.zones[zone] = Math.min(100, this.zones[zone] + ev.dmg * 1.6);
    this.damage = Math.min(100, this.damage + ev.dmg);
    this.hits.push({ point: local, dir, dmg: ev.dmg, speed: ev.speed, zone, frontal: ev.frontal });
    if (this.damage >= 100) this.destroyed = true;
  }

  isUpsideDown() {
    return _up.set(0, 1, 0).applyQuaternion(this.quat).y < 0.1 && this.speed < 2.5;
  }
}

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _m3b = new THREE.Matrix3(), _m3c = new THREE.Matrix3(), _m3d = new THREE.Matrix3();
const _F = new THREE.Vector3(), _Tq = new THREE.Vector3(), _mount = new THREE.Vector3(), _dir = new THREE.Vector3();
const _wf = new THREE.Vector3(), _ws = new THREE.Vector3(), _r = new THREE.Vector3(), _vp = new THREE.Vector3();
const _center = new THREE.Vector3(), _pt = new THREE.Vector3(), _d = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
