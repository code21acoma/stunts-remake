// Geometrie dílků: silnice se "táhnou" po středové křivce (sweep), takže zatáčky, rampy,
// klopené zatáčky i looping sdílejí jeden generátor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, H, PIECES, DELTA, PIPE_OBST, PENDULUM, WIND, OIL, SIDE_RAMP, TRAMPOLINE, CRUSHER, SPINNER, HAMMER, TRAIN, BOLLARDS, ROAD_HALF as RH } from './defs.js';
import { rng } from './tracks.js';

export const ROAD_LIFT = 0.1;       // silnice je lehce nad trávou
const TH = 0.6;                     // tloušťka mostovky
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.max(0, Math.min(1, t));

export const LOOP_S = 6.5, KICK_H = 3.4;

// ---------------------------------------------------------------- středové křivky
// vrací {p, up} v lokálních souřadnicích dílku (kotevní buňka ve středu, y relativně k základně)
const arc = (cx, cz, r) => u => { const a = Math.PI - u * Math.PI / 2; return { p: V(cx + r * Math.cos(a), 0, cz + r * Math.sin(a)), up: UP }; };
export const PATHS = {
  straight: { len: 40, f: u => ({ p: V(0, 0, -20 + 40 * u), up: UP }) },
  curve: { len: 31.4, f: arc(20, -20, 20) },
  bigcurve: { len: 94.2, f: arc(60, -20, 60) },
  bank: {
    len: 31.4, f: u => {
      const a = Math.PI - u * Math.PI / 2;
      const b = 0.42 * Math.sin(Math.PI * u);
      const toC = V(-Math.cos(a), 0, -Math.sin(a));
      return { p: V(20 + 20 * Math.cos(a), RH * Math.sin(b), -20 + 20 * Math.sin(a)), up: UP.clone().multiplyScalar(Math.cos(b)).addScaledVector(toC, Math.sin(b)) };
    }
  },
  ramp: { len: 40.4, f: u => ({ p: V(0, H * smooth(u), -20 + 40 * u), up: UP }) },
  kicker: { len: 40.5, f: u => ({ p: V(0, u > 0.5 ? KICK_H * ((u - 0.5) / 0.5) ** 2 : 0, -20 + 40 * u), up: UP }) },
  landing: { len: 40.3, f: u => ({ p: V(0, KICK_H * (1 - smooth(clamp01(u / 0.75))), -20 + 40 * u), up: UP }) },
  bumps: {
    len: 40, f: u => {
      const z = -20 + 40 * u; let y = 0;
      for (const c of [-10, 0, 10]) y += 0.28 * Math.exp(-(((z - c) / 3) ** 2));
      return { p: V(0, y, z), up: UP };
    }
  },
};
// Looping ve tvaru kapky: poloměr křivosti se mění s úhlem otočení φ od LOOP_RB dole po LOOP_RT nahoře,
// takže nájezd do smyčky není skokové přetížení (auto se nerozhoupe na pružinách a nedrhne podvozkem).
// Smyčka je souměrná podle vrcholu (ten leží na hranici polí, z = 20); výjezd je o kus dál než nájezd.
const LOOP_RT = 9.5, LOOP_RB = 16;
const LOOP_TAB = (() => {
  const n = 1440, tab = [{ z: 0, y: 0, s: 0, ph: 0 }];
  let z = 0, y = 0, s = 0;
  for (let i = 1; i <= n; i++) {
    const ph = 2 * Math.PI * (i - 0.5) / n, dph = 2 * Math.PI / n;
    const rho = LOOP_RT + (LOOP_RB - LOOP_RT) * ((1 + Math.cos(ph)) / 2) ** 2;
    z += Math.cos(ph) * rho * dph; y += Math.sin(ph) * rho * dph; s += rho * dph;
    tab.push({ z, y, s, ph: 2 * Math.PI * i / n });
  }
  const zTop = tab[n >> 1].z;
  tab.forEach(q => { q.z += 20 - zTop; });
  return tab;
})();
{
  const tab = LOOP_TAB, S = tab[tab.length - 1].s, z0 = tab[0].z, z1 = tab[tab.length - 1].z;
  const L1 = z0 + 20, L3 = 60 - z1, total = L1 + S + L3;
  PATHS.loop = {
    f: u => {
      const d = u * total;
      if (d <= L1) { const v = d / L1; return { p: V(-LOOP_S * smooth(v), 0, -20 + L1 * v), up: UP }; }
      if (d >= L1 + S) { const v = (d - L1 - S) / L3; return { p: V(LOOP_S * (1 - smooth(v)), 0, z1 + L3 * v), up: UP }; }
      const s = d - L1;
      let lo = 0, hi = tab.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m].s < s) lo = m; else hi = m; }
      const a = tab[lo], b = tab[hi], t = (s - a.s) / (b.s - a.s || 1);
      const ph = a.ph + (b.ph - a.ph) * t, w = s / S;
      return { p: V(-LOOP_S + 2 * LOOP_S * smooth(w), a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t), up: V(0, Math.cos(ph), -Math.sin(ph)) };
    },
  };
}
// esíčko: kosinový posun o jedno pole do strany na délce dvou polí
const sbend = (x0, dx) => u => ({ p: V(x0 + dx * (1 - Math.cos(Math.PI * u)) / 2, 0, -20 + 80 * u), up: UP });
const plen = f => { let s = 0, q = f(0).p; for (let i = 1; i <= 200; i++) { const p = f(i / 200).p; s += p.distanceTo(q); q = p; } return s; };
PATHS.sbendL = { f: sbend(0, 40) }; PATHS.sbendR = { f: sbend(40, -40) };
PATHS.sbendL.len = plen(PATHS.sbendL.f); PATHS.sbendR.len = plen(PATHS.sbendR.f);
PATHS.loop.len = plen(PATHS.loop.f);
PATHS.start = PATHS.straight; PATHS.bridgeDry = PATHS.straight; PATHS.tunnelPortal = PATHS.straight; PATHS.pipe = PATHS.straight; PATHS.pipeObst = PATHS.straight; PATHS.pipeIn = PATHS.straight; PATHS.cones = PATHS.straight; PATHS.tunnel = PATHS.straight; PATHS.bridge = PATHS.straight; PATHS.slalom = PATHS.straight;
PATHS.obstacleC = PATHS.straight; PATHS.obstacleS = PATHS.straight; PATHS.tunnelCurve = PATHS.curve; PATHS.tunnelBig = PATHS.bigcurve;
PATHS.straightRails = PATHS.straight; PATHS.curveRails = PATHS.curve; PATHS.bigcurveRails = PATHS.bigcurve; PATHS.roadText = PATHS.straight; PATHS.gravel = PATHS.straight; PATHS.chicane = PATHS.straight; PATHS.boost = PATHS.straight;
// křižovatka: dvě silnice v jedné úrovni (S–J a V–Z)
PATHS.crossFlat = { multi: [PATHS.straight, { len: 40, f: u => ({ p: V(20 - 40 * u, 0, 0), up: UP }) }] };
// vlny: dva hladké hřbety výšky WAVE_H – v rychlosti auto nadskočí
export const WAVE_H = 1.5;
PATHS.waves = { f: u => ({ p: V(0, WAVE_H * (1 - Math.cos(4 * Math.PI * u)) / 2, -20 + 40 * u), up: UP }) };
PATHS.waves.len = plen(PATHS.waves.f);
// šikana: dvě zídky ze střídavých stran (x od–do, z) – projíždí se esíčkem
export const CHICANE = [[0, 5, -10], [-5, 0, 10]];
PATHS.crates = PATHS.straight; PATHS.pendulum = PATHS.straight; PATHS.wind = PATHS.straight; PATHS.oil = PATHS.straight;
PATHS.sideRamp = PATHS.straight; PATHS.trampoline = PATHS.straight;
PATHS.crusher = PATHS.straight; PATHS.spinner = PATHS.straight; PATHS.hammer = PATHS.straight; PATHS.railroad = PATHS.straight; PATHS.bollards = PATHS.straight;
// zeď z beden přes silnici: řady 7 + 6 + 3 (střed bedny x, výška středu nad vozovkou, z)
export const CRATE = 1.25;
export const CRATES = [
  ...[-3, -2, -1, 0, 1, 2, 3].map(i => [i * CRATE, CRATE / 2, 0]),
  ...[-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map(i => [i * CRATE, CRATE * 1.5, 0]),
  ...[-1, 0, 1].map(i => [i * CRATE, CRATE * 2.5, 0]),
];
// urychlovač: plocha s šipkami (polovina šířky, polovina délky)
export const BOOST_PAD = { hx: 3.6, hz: 13 };

// Klopení: silnice se natáčí kolem své spodní hrany (spodní okraj zůstává ve výšce základny),
// úhel beta(u) > 0 zvedá pravou stranu (ve směru u). Plynulé průběhy -> nulová změna na koncích dílků.
export const BANK = 0.36;   // ~21°
function banked(flat, beta) {
  return u => {
    const s = flat(u);
    const d = 1e-3;
    const t = flat(Math.min(1, u + d)).p.sub(flat(Math.max(0, u - d)).p).normalize();
    const right = new THREE.Vector3().crossVectors(t, UP).normalize();
    const b = beta(u);
    s.p.y += RH * Math.sin(Math.abs(b));
    s.up = UP.clone().multiplyScalar(Math.cos(b)).addScaledVector(right, -Math.sin(b));
    return s;
  };
}
const arcR = (cx, cz, r) => u => { const a = u * Math.PI / 2; return { p: V(cx + r * Math.cos(a), 0, cz + r * Math.sin(a)), up: UP }; };
const straightF = PATHS.straight.f;
Object.assign(PATHS, {
  bankInL: { len: 40, f: banked(straightF, u => BANK * smooth(u)) },
  bankInR: { len: 40, f: banked(straightF, u => -BANK * smooth(u)) },
  bankOutL: { len: 40, f: banked(straightF, u => BANK * (1 - smooth(u))) },
  bankOutR: { len: 40, f: banked(straightF, u => -BANK * (1 - smooth(u))) },
  bankS: { len: 40, f: banked(straightF, () => BANK) },
  bankCL: { len: 31.4, f: banked(arc(20, -20, 20), () => BANK) },      // S → V = zatáčka vlevo
  bankCR: { len: 31.4, f: banked(arcR(-20, -20, 20), () => -BANK) },   // S → Z = zatáčka vpravo
  // velké klopené zatáčky (blok 2×2): levá jako velká zatáčka, pravá její zrcadlo podle osy bloku (x → 40 − x)
  bankBigL: { len: 94.2, f: banked(arc(60, -20, 60), () => BANK) },
  bankBigR: { len: 94.2, f: banked(u => { const s = arc(60, -20, 60)(u); s.p.x = 40 - s.p.x; return s; }, () => -BANK) },
  // spirála: rovně po zemi, jedna otočka kolem středu bloku 2×2 se stoupáním o patro, rovně ven nad začátkem
  spiral: {
    len: 206, f: u => {
      const a = 40 / 205.7, b2 = 1 - a;
      if (u < a) return { p: V(0, 0, -20 + 40 * u / a), up: UP };
      if (u > b2) return { p: V(0, H, 20 + 40 * (u - b2) / a), up: UP };
      const w = (u - a) / (b2 - a), ph = Math.PI - 2 * Math.PI * w;
      return { p: V(20 + 20 * Math.cos(ph), H * smooth(w), 20 + 20 * Math.sin(ph)), up: UP };
    }
  },
  // pravotočivá spirála = zrcadlo levé podle svislé osy bloku (x → 40 − x)
  spiralR: { len: 206, f: u => { const s = PATHS.spiral.f(u); s.p.x = 40 - s.p.x; return s; } },
  // dlouhé stoupání o patro: nájezd (parabola 0 → sklon H/40 na dvou polích), rovné stoupání, dojezd
  rampIn: { len: 80.1, f: u => ({ p: V(0, H * u * u, -20 + 80 * u), up: UP }) },
  rampS: { len: 40.3, f: u => ({ p: V(0, H * u, -20 + 40 * u), up: UP }) },
  rampOut: { len: 80.1, f: u => ({ p: V(0, H * (1 - (1 - u) ** 2), -20 + 80 * u), up: UP }) },
  // podjezd: spodní silnice S–J a horní (o patro výš) V–Z
  cross: { multi: [PATHS.straight, { len: 40, f: u => ({ p: V(20 - 40 * u, H, 0), up: UP }) }] },
  // tunel s mostem: spodní silnice v tunelu S–J, horní most V–Z přes hřeben kopce (o 2 patra výš)
  tunnelBridge: { multi: [PATHS.straight, { len: 40, f: u => ({ p: V(20 - 40 * u, 2 * H, 0), up: UP }) }] },
});
export const pathOf = (type, k = 0) => PATHS[type].multi ? PATHS[type].multi[k] : PATHS[type];

// rámec křivky (bod, tečna, pravá strana, normála)
export function frame(path, u, base = 0) {
  const d = 1e-3;
  const s = path(u);
  const a = path(Math.max(0, u - d)).p, b = path(Math.min(1, u + d)).p;
  const t = b.sub(a).normalize();
  const r = new THREE.Vector3().crossVectors(t, s.up).normalize();
  const n = new THREE.Vector3().crossVectors(r, t).normalize();
  s.p.y += base;
  return { p: s.p, t, r, n };
}

// ---------------------------------------------------------------- stavitel
class Builder {
  constructor() { this.vis = new Map(); this.col = []; }
  add(mat, geo, collide = true) {
    if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    if (!this.vis.has(mat)) this.vis.set(mat, []);
    this.vis.get(mat).push(geo);
    if (collide) this.col.push(geo);
  }
  // profil: pole [x, y] (x doprava, y nahoru; 'g' = až k zemi), orientace po směru hodinových ručiček
  sweep(path, len, base, profile, mat, o = {}) {
    const n = Math.max(2, Math.ceil(len / (o.step || 1)));
    const from = o.from ?? 0, to = o.to ?? 1;
    const frames = [];
    let s = 0, prev = null;
    for (let i = 0; i <= n; i++) {
      const f = frame(path, from + (to - from) * i / n, base);
      if (prev) s += f.p.distanceTo(prev);
      f.s = s; prev = f.p; frames.push(f);
    }
    const xs = profile.map(q => q[0]), minX = Math.min(...xs), maxX = Math.max(...xs);
    const geos = [];
    let across = 0;
    for (let k = 0; k < profile.length - 1; k++) {
      const pa = profile[k], pb = profile[k + 1];
      const pos = [], uv = [], idx = [];
      const segLen = Math.hypot(pb[0] - pa[0], (pb[1] === 'g' ? -1 : pb[1]) - (pa[1] === 'g' ? -1 : pa[1]));
      for (let i = 0; i <= n; i++) {
        const f = frames[i];
        for (const [j, q] of [pa, pb].entries()) {
          const v = f.p.clone().addScaledVector(f.r, q[0]);
          if (q[1] === 'g') v.y = -0.05; else v.addScaledVector(f.n, q[1]);
          pos.push(v.x, v.y, v.z);
          const ac = o.uvNorm ? (q[0] - minX) / (maxX - minX || 1) : (across + j * segLen) / (o.uvAcross || 4);
          uv.push(ac, f.s / (o.uvAlong || 10));
        }
      }
      for (let i = 0; i < n; i++) { const a0 = 2 * i, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3; idx.push(a0, a1, b0, b0, a1, b1); }
      // orientace: očekávaná normála (-dy, dx) v rovině profilu
      const f0 = frames[0];
      const dy = (pb[1] === 'g' ? -f0.p.y : pb[1]) - (pa[1] === 'g' ? -f0.p.y : pa[1]);
      const exp = f0.r.clone().multiplyScalar(-dy).addScaledVector(f0.n, pb[0] - pa[0]);
      const A = V(pos[0], pos[1], pos[2]), B = V(pos[3], pos[4], pos[5]), C = V(pos[6], pos[7], pos[8]);
      const gn = C.sub(A).cross(B.sub(A));
      if (gn.dot(exp) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      geos.push(g);
      across += segLen;
    }
    this.add(mat, geos.length > 1 ? mergeGeometries(geos) : geos[0], o.collide !== false);
  }
  // zakrytí čela (polygon profilu) v bodě u
  cap(path, u, base, poly, mat, outward) {
    const f = frame(path, u, base);
    const pts = poly.map(q => { const v = f.p.clone().addScaledVector(f.r, q[0]); if (q[1] === 'g') v.y = -0.05; else v.addScaledVector(f.n, q[1]); return v; });
    const pos = [], uv = [], idx = [];
    pts.forEach((p, i) => { pos.push(p.x, p.y, p.z); uv.push(poly[i][0] / 4, (p.y) / 4); });
    for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
    const gn = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0]));
    const want = f.t.clone().multiplyScalar(outward);
    if (gn.dot(want) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    this.add(mat, g, true);
  }
  // čtyřúhelník p0..p3 (proti směru hodin při pohledu zepředu)
  quad(mat, pts, uvw = 1, uvh = 1, collide = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, uvw, 0, uvw, uvh, 0, uvh], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    this.add(mat, g, collide);
  }
  box(mat, w, h, d, x, y, z, ry = 0, collide = true) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(mat, g, collide);
  }
  cyl(mat, r1, r2, h, x, y, z, seg = 12, collide = true) {
    const g = new THREE.CylinderGeometry(r1, r2, h, seg);
    g.translate(x, y, z);
    this.add(mat, g, collide);
  }
}

const mirror = prof => prof.map(([x, y]) => [-x, y]).reverse();

// standardní silnice
function road(b, path, len, base, o = {}) {
  const step = o.step || 1;
  const bottom = o.solid ? 'g' : -TH;
  b.sweep(path, len, base, [[-RH, 0], [RH, 0]], o.surf || 'asphalt', { uvNorm: true, uvAlong: 10, step });
  b.sweep(path, len, base, [[RH, 0], [RH, bottom], [-RH, bottom], [-RH, 0]], o.solid ? 'dark' : 'concrete', { step, uvAcross: 4, uvAlong: 4 });
  if (o.rails) {
    const rh = o.railH || 0.95;
    const prof = [[RH - 0.3, 0], [RH - 0.15, rh], [RH + 0.3, rh], [RH + 0.3, o.solid ? -0.25 : bottom]];
    b.sweep(path, len, base, prof, 'barrier', { step, uvAcross: 1.2, uvAlong: 4 });
    b.sweep(path, len, base, mirror(prof), 'barrier', { step, uvAcross: 1.2, uvAlong: 4 });
  } else if (o.curbs !== false) {
    const prof = [[RH, 0], [RH + 0.1, 0.1], [RH + 0.9, 0.1], [RH + 1.0, -0.3]];
    b.sweep(path, len, base, prof, 'curb', { step, uvAcross: 1, uvAlong: 4 });
    b.sweep(path, len, base, mirror(prof), 'curb', { step, uvAcross: 1, uvAlong: 4 });
  }
  if (o.solid) {
    if (o.capEnd) b.cap(path, 1, base, [[-RH - 0.3, 0], [RH + 0.3, 0], [RH + 0.3, 'g'], [-RH - 0.3, 'g']], 'hazard', 1);
    if (o.capStart) b.cap(path, 0, base, [[-RH - 0.3, 0], [RH + 0.3, 0], [RH + 0.3, 'g'], [-RH - 0.3, 'g']], 'hazard', -1);
  }
}

// ocelová svodidla po obou stranách silnice podél libovolné křivky: pás se dvěma vlnami (z obou stran, spodní
// plech brání podjetí karoserie), pozinkované sloupky po ~4 m, odrazky (vpravo bílé, vlevo žluté) a betonová krajnice
// gaps = úseky křivky [u0, u1] bez svodidel (průjezd bloků lisu, koleje přejezdu); svodidla sledují výšku silnice (vlny, hrboly)
function guardRails(b, P, base, gaps = []) {
  const X = RH + 0.55;
  // úseky se svodidly = celá křivka bez mezer
  const segs = []; let u = 0;
  for (const [g0, g1] of gaps.slice().sort((a, c) => a[0] - c[0])) { if (g0 > u) segs.push([u, g0]); u = Math.max(u, g1); }
  if (u < 1) segs.push([u, 1]);
  const inGap = v => gaps.some(([g0, g1]) => v > g0 && v < g1);
  for (const s of [-1, 1]) {
    const x = s * X, prof = [[0, 0.52], [-0.08, 0.6], [0, 0.68], [-0.08, 0.76], [0, 0.84]].map(([dx, y]) => [x + s * dx, y]);
    const back = [[x + s * 0.02, 0.84], [x + s * 0.02, 0.12]];
    const shoulder = s > 0 ? [[RH, -0.02], [RH + 0.5, -0.02]] : [[-RH - 0.5, -0.02], [-RH, -0.02]];   // krajnice
    for (const [from, to] of segs) {
      const o = { uvAcross: 1, uvAlong: 4, step: 1, from, to }, len = P.len * (to - from);
      for (const [a, c] of [[prof, back], [prof.slice().reverse(), back.slice().reverse()]]) {
        b.sweep(P.f, len, base, a, 'metal', o);
        b.sweep(P.f, len, base, c, 'metal', o);
      }
      b.sweep(P.f, len, base, shoulder, 'concrete', o);
    }
    const n = Math.max(2, Math.round(P.len / 4));
    for (let i = 0; i < n; i++) {
      const v = (i + 0.5) / n;
      if (inGap(v)) continue;
      const f = frame(P.f, v, base), yaw = Math.atan2(f.t.x, f.t.z);
      const at = d => f.p.clone().addScaledVector(f.r, s * d);
      const p = at(X + 0.2); b.box('metal', 0.14, 0.9, 0.14, p.x, f.p.y + 0.45, p.z, yaw, false);
      if (i % 2) { const q = at(X - 0.06); b.box(s > 0 ? 'lamp' : 'hazard', 0.04, 0.1, 0.18, q.x, f.p.y + 0.75, q.z, yaw, false); }
    }
  }
}

// pilíře pod vyvýšenou silnicí
function pillars(b, path, len, base, spacing = 13, keep = null) {
  const n = Math.max(1, Math.round(len / spacing));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const f = frame(path, u, base);
    // u klopené silnice je spodní okraj níž než střed – nosník musí být pod ním
    const top = f.p.y - TH - RH * Math.abs(f.r.y);
    if (top < 1.2 || (keep && !keep(f.p))) continue;
    const yaw = Math.atan2(f.t.x, f.t.z);
    b.cyl('concrete', 0.55, 0.7, top, f.p.x, top / 2, f.p.z, 14);
    b.box('concrete', 8.5, 0.7, 1.4, f.p.x, top - 0.35, f.p.z, yaw);
  }
}

function tree(b, r, x, z) {
  const h = 2 + r() * 1.5, s = 0.8 + r() * 0.6;
  b.cyl('bark', 0.18 * s, 0.3 * s, h, x, h / 2, z, 7);
  if (r() < 0.55) {
    for (let k = 0; k < 3; k++) {
      const g = new THREE.ConeGeometry((2.6 - k * 0.6) * s, 3.2 * s, 8);
      g.translate(x, h + (k * 1.5 + 1.2) * s, z);
      b.add(k % 2 ? 'leaves' : 'leaves2', g, false);
    }
  } else {
    for (let k = 0; k < 3; k++) {
      const g = new THREE.IcosahedronGeometry((1.7 + r() * 0.8) * s, 0);
      g.translate(x + (r() - 0.5) * 1.6 * s, h + (1 + r() * 1.4) * s, z + (r() - 0.5) * 1.6 * s);
      b.add(k % 2 ? 'leaves' : 'leaves2', g, false);
    }
  }
}

// roura: průřez = rovné dno (polovina šířky W) + dva oblouky poloměru PR, které se zvedají o úhel alfa.
// s = 0 → rovná silnice (W = 5, alfa = 0), s = 1 → celá kruhová roura (W = 0, alfa = π). Po stěnách se dá jezdit.
export const PIPE_R = 6.5;
// kužely slalomu (x, z v souřadnicích dílku) – objíždějí se střídavě zleva a zprava
export const CONES = [[0, -12], [0, 0], [0, 12]];
function pipe(b, P, base, sOf) {
  const K = 18, NB = 4, n = Math.ceil(P.len / 1);
  const cols = 2 * (K + 1) + NB - 1;                          // bodů v průřezu
  const prof = s => {
    const W = 5 * (1 - s), a = Math.PI * s, pts = [];
    for (let k = K; k >= 0; k--) { const th = a * k / K; pts.push([-W - PIPE_R * Math.sin(th), PIPE_R * (1 - Math.cos(th))]); }
    for (let j = 1; j < NB; j++) pts.push([-W + 2 * W * j / NB, 0]);
    for (let k = 0; k <= K; k++) { const th = a * k / K; pts.push([W + PIPE_R * Math.sin(th), PIPE_R * (1 - Math.cos(th))]); }
    return pts;
  };
  const mk = (off, collide, mats) => {
    const pos = [], uv = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, f = frame(P.f, u, base), s = sOf(u);
      const pr = prof(s);
      pr.forEach(([x, y], c) => {
        // vnější plášť: posun o `off` ven po normále průřezu
        let X = x, Y = y;
        if (off) {
          const A = pr[Math.max(0, c - 1)], B = pr[Math.min(pr.length - 1, c + 1)];
          let tx = B[0] - A[0], ty = B[1] - A[1];
          const l = Math.hypot(tx, ty);
          if (l > 1e-6) { tx /= l; ty /= l; X += ty * off; Y -= tx * off; } else Y -= off;
        }
        const v = f.p.clone().addScaledVector(f.r, X).addScaledVector(f.n, Y);
        pos.push(v.x, v.y, v.z); uv.push(c / 6, f.p.z / 8);
      });
    }
    const idxFor = test => {
      const idx = [];
      for (let i = 0; i < n; i++) for (let c = 0; c < cols - 1; c++) {
        if (!test(c)) continue;
        const a = i * cols + c, b1 = a + 1, a1 = a + cols, b2 = a1 + 1;
        idx.push(a, a1, b1, b1, a1, b2);
      }
      return idx;
    };
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g0.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // orientace podle dna uprostřed: vnitřek má mířit nahoru (k ose), plášť dolů
    const mid = K + (NB >> 1), p0 = V(pos[mid * 3], pos[mid * 3 + 1], pos[mid * 3 + 2]);
    const p1 = V(pos[(mid + 1) * 3], pos[(mid + 1) * 3 + 1], pos[(mid + 1) * 3 + 2]);
    const p2 = V(pos[(mid + cols) * 3], pos[(mid + cols) * 3 + 1], pos[(mid + cols) * 3 + 2]);
    const flip = (p2.clone().sub(p0).cross(p1.clone().sub(p0)).y > 0) === !!off;
    for (const [mat, test] of mats) {
      const idx = idxFor(test);
      if (flip) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      const g = g0.clone(); g.setIndex(idx); g.computeVertexNormals();
      b.add(mat, g, collide);
    }
  };
  // vnitřek: dno a spodní polovina stěn asfalt, horní polovina bílo-červené pruhy (barrier)
  const lowWall = c => c >= K / 2 && c < cols - 1 - K / 2;
  mk(0, true, [['asphalt', lowWall], ['barrier', c => !lowWall(c)]]);
  mk(0.5, true, [['concrete', () => true]]);
}

// ocelový most: pilíře s příčníky, oblouky a táhla (vozovka ve výšce base; alongX = most vede ve směru osy x)
function bridgeSteel(b, base, alongX) {
  const P3 = (s, y, a) => (alongX ? V(a, y, s) : V(s, y, a));   // s = napříč, a = podél mostu
  for (const a of [-15, 15]) {
    const [x, z] = alongX ? [a, 0] : [0, a];
    b.box('concrete', 3, base - TH, 3, x, (base - TH) / 2, z);
    b.box('concrete', alongX ? 2 : 11, 0.8, alongX ? 11 : 2, x, base - TH - 0.4, z);
  }
  for (const s of [-6.1, 6.1]) {
    const curve = new THREE.QuadraticBezierCurve3(P3(s, base - 0.2, -19), P3(s, base + 16, 0), P3(s, base - 0.2, 19));
    b.add('steel', new THREE.TubeGeometry(curve, 40, 0.35, 8), true);
    for (let a = -15; a <= 15; a += 3) {
      const yTop = curve.getPoint((a + 19) / 38).y;
      if (yTop - base < 0.8) continue;
      const p = P3(s, 0, a);
      b.cyl('metal', 0.06, 0.06, yTop - base, p.x, base + (yTop - base) / 2, p.z, 5, false);
    }
  }
}

// tunel v kopci: trouba se táhne po středové křivce (rovně i v oblouku), kopec + portály s betonovým rámem
const hillY = d => (Math.abs(d) < 20 ? 10 * Math.cos(Math.PI * d / 40) ** 2 : 0) - 0.1;
// arc = null (rovný tunel) nebo {cx, cz, R, x0, x1, z0, z1} – střed a poloměr oblouku, rozsah kopce
// ends = [portál na začátku, portál na konci] – mezi dvěma tunelovými dílky se portál nekreslí
// from = od které části dílku (u) začíná trouba (dílek portálu má první polovinu otevřenou)
function tunnel(b, P, base, arc, ends = [true, true], from = 0) {
  const curved = !!arc;
  road(b, P.f, P.len, base, { curbs: false });
  const inner = [], outer = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * i / 16;
    inner.push([6.5 * Math.cos(a), 4.5 + 2.5 * Math.sin(a)]);
    outer.push([7.3 * Math.cos(a), 4.5 + 3.3 * Math.sin(a)]);
  }
  const step = curved ? 1 : 2;
  // chodníky mezi silnicí a stěnou
  const walk = [[RH, 0], [RH, 0.15], [6.6, 0.15]];
  b.sweep(P.f, P.len, base, walk, 'concrete', { uvAcross: 2, uvAlong: 4, step, from });
  b.sweep(P.f, P.len, base, mirror(walk), 'concrete', { uvAcross: 2, uvAlong: 4, step, from });
  b.sweep(P.f, P.len, base, [[6.5, -0.3], ...inner, [-6.5, -0.3]], 'dark', { uvAcross: 4, uvAlong: 4, step, from });
  b.sweep(P.f, P.len, base, [[-7.3, -0.3], ...outer.slice().reverse(), [7.3, -0.3]], 'concrete', { uvAcross: 4, uvAlong: 4, step, collide: false, from });
  // kopec: stejný příčný profil jako rovný tunel, u zatáčky podle vzdálenosti od oblouku
  const hill = [];
  for (let i = 0; i <= 28; i++) { const x = -20 + 40 * i / 28; hill.push([x, hillY(x)]); }
  if (!curved) b.sweep(P.f, P.len, 0, hill, 'grass', { uvAcross: 10, uvAlong: 10, step: 4, from });
  else {
    const w = arc.x1 - arc.x0, h = arc.z1 - arc.z0;
    const g = new THREE.PlaneGeometry(w, h, Math.round(w * 1.2), Math.round(h * 1.2)); g.rotateX(-Math.PI / 2);
    g.translate((arc.x0 + arc.x1) / 2, 0, (arc.z0 + arc.z1) / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, Math.max(-0.1, hillY(Math.hypot(x - arc.cx, z - arc.cz) - arc.R)));
      uv.setXY(i, x / 10, z / 10);
    }
    g.computeVertexNormals();
    b.add('grass', g, true);
  }
  // portály jen na koncích, kde tunel nepokračuje (natočené ven z dílku)
  for (const u of [0, 1]) if (ends[u]) portalFace(b, P, u, base, hill, u ? 1 : -1);
  // světla pod stropem
  const nl = Math.max(5, Math.round(P.len / 8));
  for (let i = 1; i <= nl; i++) {
    const u = i / (nl + 1);
    if (u < from) continue;
    const f = frame(P.f, u, base);
    b.box('lamp', 0.5, 0.12, 2, f.p.x, base + 6.9, f.p.z, Math.atan2(f.t.x, f.t.z), false);
  }
}

// čelo tunelu v bodě u: travnatý svah s otvorem + betonový rám oblouku; sign = +1 čelem po směru trati, -1 proti
function portalFace(b, P, u, base, hill, sign) {
  {
    const f = frame(P.f, u, 0);
    const out = sign > 0 ? f.t : f.t.clone().negate();
    const rot = Math.atan2(out.x, out.z);
    const sh = new THREE.Shape();
    sh.moveTo(-20, 0); hill.forEach(([x, y]) => sh.lineTo(x, y + 0.02)); sh.lineTo(20, 0); sh.lineTo(6.5, 0);
    for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; sh.lineTo(6.5 * Math.cos(a), base + 4.5 + 2.5 * Math.sin(a)); }
    sh.lineTo(-6.5, 0); sh.lineTo(-20, 0);
    const g = new THREE.ShapeGeometry(sh);
    const uvs = g.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) / 10, uvs.getY(i) / 10);
    g.rotateY(rot); g.translate(f.p.x, 0, f.p.z);
    b.add('grass', g, true);
    const fr = new THREE.Shape();
    fr.moveTo(8.6, 0);
    for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; fr.lineTo(8.6 * Math.cos(a), base + 4.5 + 4.2 * Math.sin(a)); }
    fr.lineTo(-8.6, 0); fr.lineTo(-6.5, 0);
    for (let i = 16; i >= 0; i--) { const a = Math.PI * i / 16; fr.lineTo(6.5 * Math.cos(a), base + 4.5 + 2.5 * Math.sin(a)); }
    fr.lineTo(6.5, 0);
    const fg = new THREE.ExtrudeGeometry(fr, { depth: 0.8, bevelEnabled: false });
    const fu = fg.attributes.uv; for (let i = 0; i < fu.count; i++) fu.setXY(i, fu.getX(i) / 4, fu.getY(i) / 4);
    fg.translate(0, 0, -0.4); fg.rotateY(rot); fg.translate(f.p.x, 0, f.p.z);
    b.add('concrete', fg, true);
  }
}

// Portál tunelu (rovný dílek): první polovina je zářez do kopce s opěrnými zdmi a svahy, které rostou
// do výšky kopce; uprostřed kamenné čelo s obloukem, cedulí a světly; druhá polovina už je tunel.
// Silnice jde od severu (u = 0, otevřená strana) k jihu (u = 1, navazuje na tunel).
function tunnelPortal(b, P, base, ends) {
  tunnel(b, P, base, null, [false, ends[1]], 0.5);
  // obrubníky jen v otevřené části
  const curb = [[RH, 0], [RH + 0.1, 0.1], [RH + 0.9, 0.1], [RH + 1.0, -0.3]];
  b.sweep(P.f, P.len, base, curb, 'curb', { uvAcross: 1, uvAlong: 4, to: 0.5 });
  b.sweep(P.f, P.len, base, mirror(curb), 'curb', { uvAcross: 1, uvAlong: 4, to: 0.5 });
  const ramp = z => smooth(clamp01((z + 20) / 20));        // 0 na severní hraně → 1 u čela (z = 0)
  const WX = 8.2;                                           // vnitřní líc opěrné zdi
  const wallTop = z => Math.max(0.6, hillY(WX + 1) * ramp(z) + 0.5);
  // svahy zářezu (vlevo a vpravo od zdí)
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(20 - WX, 20, 12, 20); g.rotateX(-Math.PI / 2);
    g.translate(s * (WX + (20 - WX) / 2), 0, -10);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const edge = Math.abs(x) - WX < 0.8 ? wallTop(z) - 0.25 : hillY(x) * ramp(z);   // u zdi napojení na její korunu
      pos.setY(i, Math.max(-0.1, edge)); uv.setXY(i, x / 10, z / 10);
    }
    g.computeVertexNormals();
    b.add('grass', g, true);
  }
  // opěrné zdi zářezu (tvar v rovině z–y vytažený do tloušťky 0,6 m)
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(-20, 0); sh.lineTo(0, 0);
    for (let k = 0; k <= 20; k++) { const z = -k; sh.lineTo(z, wallTop(z)); }
    sh.lineTo(-20, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false });
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    g.rotateY(-Math.PI / 2);                                 // tvar X → osa z, vytažení → -x
    g.translate(s > 0 ? WX + 0.6 : -WX, base - ROAD_LIFT, 0);
    b.add('concrete', g, true);
  }
  // čelo: travnatý svah + rám oblouku uprostřed dílku, čelem k otevřené straně
  const hill = [];
  for (let i = 0; i <= 28; i++) { const x = -20 + 40 * i / 28; hill.push([x, hillY(x)]); }
  portalFace(b, P, 0.5, base, hill, -1);
  // kamenná čelní zeď s obloukem
  const fw = new THREE.Shape();
  fw.moveTo(-10.5, 0); fw.lineTo(10.5, 0); fw.lineTo(10.5, 11.2); fw.lineTo(-10.5, 11.2); fw.lineTo(-10.5, 0);
  const hole = new THREE.Path();
  hole.moveTo(8.6, 0.01);
  for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; hole.lineTo(8.6 * Math.cos(a), base + 4.5 + 4.2 * Math.sin(a)); }
  hole.lineTo(-8.6, 0.01); hole.lineTo(8.6, 0.01);
  fw.holes.push(hole);
  const wg = new THREE.ExtrudeGeometry(fw, { depth: 1.2, bevelEnabled: false });
  const wu = wg.attributes.uv; for (let i = 0; i < wu.count; i++) wu.setXY(i, wu.getX(i) / 3, wu.getY(i) / 3);
  wg.rotateY(Math.PI); wg.translate(0, 0, -0.2);             // čelem na sever (proti směru u)
  b.add('rock', wg, true);
  // římsa, cedule a světla
  b.box('concrete', 22, 0.6, 1.8, 0, 11.5, -0.8);
  const sign = new THREE.PlaneGeometry(7, 1.6); sign.rotateY(Math.PI); sign.translate(0, base + 9.9, -1.45);
  b.add(billboardMat('TUNEL'), sign, false);
  for (const x of [-9.4, 9.4]) {
    b.box('metal', 0.15, 0.9, 0.15, x, base + 7.4, -1.6, 0, false);
    b.box('lamp', 0.5, 0.35, 0.5, x, base + 7.9, -1.9, 0, false);
  }
}

// ---------------------------------------------------------------- stavba dílku
// materiál billboardu s textem (sdílený pro stejný text)
const bbCache = new Map();
export const BILLBOARD_DEFAULT = 'STUNTS';
function billboardMat(text) {
  text = (text || BILLBOARD_DEFAULT).trim() || BILLBOARD_DEFAULT;
  if (bbCache.has(text)) return bbCache.get(text);
  const W = 1024, Hh = 384, cv = document.createElement('canvas');
  cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, Hh); grd.addColorStop(0, '#fff8e0'); grd.addColorStop(1, '#ffd84a');
  g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
  g.lineWidth = 18; g.strokeStyle = '#c8261c'; g.strokeRect(9, 9, W - 18, Hh - 18);
  // zalomení do max. 3 řádků a zmenšení písma, aby se text vešel
  const font = s => `900 ${s}px "Segoe UI", Arial, sans-serif`;
  const wrap = (s, maxW) => {
    const lines = []; let cur = '';
    for (const w of text.split(/\s+/)) { const t = cur ? cur + ' ' + w : w; g.font = font(s); if (cur && g.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur); return lines;
  };
  let size = 190, lines;
  for (; size > 24; size -= 6) {
    lines = wrap(size, W - 90);
    g.font = font(size);
    if (lines.length * size * 1.1 <= Hh - 70 && lines.every(l => g.measureText(l).width <= W - 90)) break;
  }
  g.font = font(size); g.fillStyle = '#1a1a2e'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, W / 2, Hh / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });
  if (bbCache.size > 40) { const [k, v] = bbCache.entries().next().value; v.map.dispose(); v.dispose(); bbCache.delete(k); }
  bbCache.set(text, mat);
  return mat;
}

// nápis na vozovce: bílá písmena protažená ve směru jízdy (jako silniční značení), průhledné pozadí.
// Textura se čte od strany, odkud auto přijíždí (dílek se projíždí k +z).
const rtCache = new Map();
export const ROAD_TEXT_DEFAULT = 'STUNTS';
function roadTextMat(text) {
  text = (text || ROAD_TEXT_DEFAULT).toUpperCase();
  if (rtCache.has(text)) return rtCache.get(text);
  const W = 512, Hh = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d');
  const words = text.split(/\s+/).filter(Boolean).slice(0, 3);
  // řádky jdou po směru jízdy: první řádek nejblíž přijíždějícímu autu (dole v textuře)
  const lines = words.length ? words : [ROAD_TEXT_DEFAULT];
  const rowH = Hh / lines.length;
  g.fillStyle = '#f4f4ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    let size = 220;
    g.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    while (size > 40 && g.measureText(l).width > W - 30) { size -= 8; g.font = `900 ${size}px "Arial Black", Arial, sans-serif`; }
    // písmena protáhnout do výšky řádku (na vozovce se při pohledu z auta zkrátí)
    const stretch = Math.min(3.2, (rowH * 0.8) / size);
    g.save(); g.translate(W / 2, Hh - rowH * (i + 0.5)); g.scale(1, stretch); g.fillText(l, 0, 0); g.restore();
  });
  // opotřebení barvy
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.fillRect(Math.random() * W, Math.random() * Hh, 3, 3); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  if (rtCache.size > 40) { const [k, v] = rtCache.entries().next().value; v.map.dispose(); v.dispose(); rtCache.delete(k); }
  rtCache.set(text, mat);
  return mat;
}

// ctx.wallMask – sousední zdi (viz wallMask v defs.js)
export function buildPiece(tile, ctx = {}) {
  const type = tile.type;
  const b = new Builder();
  const e = tile.e || 0;
  const base = e * H + ROAD_LIFT;
  const P = PATHS[type] && pathOf(type);
  const elevated = e > 0;
  switch (type) {
    case 'bankInL': case 'bankInR': case 'bankOutL': case 'bankOutR': case 'bankS': case 'bankCL': case 'bankCR': case 'bankBigL': case 'bankBigR':
      road(b, P.f, P.len, base, { rails: true, railH: 0.9, solid: !elevated, step: 0.8 });
      if (elevated) pillars(b, P.f, P.len, base);
      break;
    case 'obstacleC':
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      b.box('hazard', 3.2, 1.1, 1.6, 0, base + 0.55, 0);
      for (const z of [-1.6, 1.6]) b.cyl('hazard', 0.1, 0.28, 0.8, 0, base + 0.4, z, 10, false);
      break;
    case 'obstacleS':
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      for (const x of [-3.75, 3.75]) b.box('hazard', 2.6, 1.1, 1.6, x, base + 0.55, 0);
      break;
    case 'cross': {
      const lo = PATHS.cross.multi[0], hi = PATHS.cross.multi[1];
      road(b, lo.f, lo.len, base, { rails: elevated });
      road(b, hi.f, hi.len, base, { rails: true });
      const top = base + H - TH;
      for (const x of [-13.5, 13.5]) {
        b.cyl('concrete', 0.6, 0.75, top, x, top / 2, 0, 14);
        b.box('concrete', 1.4, 0.7, 8.5, x, top - 0.35, 0);
      }
      for (const x of [-2.5, 2.5]) b.box('lamp', 0.3, 0.1, 1.2, x, top - 0.06, 0, 0, false);
      break;
    }
    case 'bumps':   // hrboly se svodidly (nedají se objet)
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      break;
    case 'straight': case 'curve': case 'bigcurve': case 'sbendL': case 'sbendR':
      road(b, P.f, P.len, base, { rails: elevated });
      if (elevated) pillars(b, P.f, P.len, base);
      break;
    case 'straightRails': case 'curveRails': case 'bigcurveRails':
      // silnice se svodidly i na zemi (rovinka, malá a velká zatáčka)
      road(b, P.f, P.len, base, { curbs: false });
      if (elevated) pillars(b, P.f, P.len, base);
      guardRails(b, P, base);
      break;
    case 'roadText': {
      road(b, P.f, P.len, base, { rails: elevated });
      if (elevated) pillars(b, P.f, P.len, base);
      // horní okraj textury k +z; ctx.flip = trať vede dílkem obráceně (k −z) – nápis se otočí, aby se četl z auta
      const g = new THREE.PlaneGeometry(8.4, 30).rotateX(-Math.PI / 2).rotateY(ctx.flip ? 0 : Math.PI);
      g.translate(0, base + 0.03, 0);
      b.add(roadTextMat(tile.text), g, false);
      break;
    }
    case 'gravel': {
      road(b, P.f, P.len, base, { rails: elevated, surf: 'gravel' });
      if (elevated) pillars(b, P.f, P.len, base);
      // tabule "pozor šotolina" u vjezdů
      for (const z of [-17, 17]) {
        const s = z < 0 ? 1 : -1;
        b.cyl('metal', 0.07, 0.07, 2.2, s * 6.8, base + 1.1, z, 6, false);
        const tri = new THREE.CircleGeometry(0.7, 3).rotateZ(Math.PI / 2).rotateY(z < 0 ? Math.PI : 0);
        tri.translate(s * 6.8, base + 2.5, z + (z < 0 ? -0.08 : 0.08));
        b.add('hazard', tri, false);
      }
      break;
    }
    case 'boost': {
      road(b, P.f, P.len, base, { rails: elevated });
      if (elevated) pillars(b, P.f, P.len, base);
      const g = new THREE.PlaneGeometry(2 * BOOST_PAD.hx, 2 * BOOST_PAD.hz).rotateX(-Math.PI / 2).rotateY(Math.PI);
      g.translate(0, base + 0.03, 0);
      b.add('boost', g, false);
      // svítící obruby po stranách plochy
      for (const x of [-BOOST_PAD.hx - 0.2, BOOST_PAD.hx + 0.2]) b.box('boostEdge', 0.25, 0.06, 2 * BOOST_PAD.hz, x, base + 0.03, 0, 0, false);
      break;
    }
    case 'chicane':
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      for (const [x0, x1, z] of CHICANE) {
        b.box('concrete', x1 - x0, 1.0, 1.2, (x0 + x1) / 2, base + 0.5, z);
        b.box('hazard', x1 - x0 + 0.05, 0.3, 1.25, (x0 + x1) / 2, base + 0.85, z, 0, false);
      }
      break;
    case 'waves':
      road(b, P.f, P.len, base, { curbs: false, solid: !elevated, step: 0.5 }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      break;
    case 'crates':   // bedny jsou samostatné objekty (rozletí se) – přidává je Track; tady jen náhled v editoru
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      if (ctx.withCones) for (const [x, y, z] of CRATES) b.box('crate', CRATE, CRATE, CRATE, x, base + y, z, 0, false);
      break;
    case 'pendulum': {
      // portál s koulí na řetězu; koule a řetěz se hýbou (Track), tady jen konstrukce
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      const top = base + PENDULUM.pivotY;
      for (const x of [-7.6, 7.6]) {
        b.box('steel', 0.9, top + 0.4 - base, 0.9, x, (base + top + 0.4) / 2, 0);
        b.box('hazard', 1.0, 1.4, 1.0, x, base + 0.7, 0);
        for (const z of [-1, 1]) b.box('steel', 0.3, 0.3, 4, x, base + 0.15, z * 1.4, 0, false);   // patky
      }
      b.box('steel', 16.2, 0.9, 1.0, 0, top + 0.45, 0);
      b.box('hazard', 4, 0.5, 1.1, 0, top + 0.45, 0, 0, false);
      if (ctx.withCones) {
        b.cyl('metal', 0.12, 0.12, PENDULUM.len - PENDULUM.r, 0, top - (PENDULUM.len - PENDULUM.r) / 2, 0, 6, false);
        const s = new THREE.SphereGeometry(PENDULUM.r, 20, 14); s.translate(0, top - PENDULUM.len, 0); b.add('dark', s, false);
      }
      break;
    }
    case 'wind': {
      // tři obří ventilátory na straně +x foukají přes silnici k −x; lopatky se točí (Track)
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      for (const z of [-12, 0, 12]) {
        const ring = new THREE.TorusGeometry(2.7, 0.35, 10, 32).rotateY(Math.PI / 2); ring.translate(WIND.fanX, base + 3.2, z);
        b.add('metal', ring, true);
        const back = new THREE.CylinderGeometry(2.7, 2.7, 0.2, 24, 1, true).rotateZ(Math.PI / 2); back.translate(WIND.fanX + 0.8, base + 3.2, z);
        b.add('dark', back, false);
        b.box('steel', 0.5, 3.2, 0.5, WIND.fanX + 0.4, base + 1.6, z);
        b.box('concrete', 2.4, 0.4, 2.4, WIND.fanX + 0.4, base + 0.2, z);
        if (ctx.withCones) for (let k = 0; k < 3; k++) b.box('hazard', 0.15, 4.6, 0.7, WIND.fanX - 0.1, base + 3.2, z, 0, false);
      }
      // proudění vzduchu nad silnicí
      for (const y of [0.9, 2.2]) { const g = new THREE.PlaneGeometry(16, 38).rotateX(-Math.PI / 2); g.translate(0, base + y, 0); b.add('windStreak', g, false); }
      break;
    }
    case 'oil':
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      for (const [x, z, r] of OIL) { const g = new THREE.CircleGeometry(r * 1.12, 28).rotateX(-Math.PI / 2); g.scale(1, 1, 1.25); g.translate(x, base + 0.025, z); b.add('oil', g, false); }
      // sud, ze kterého olej vytekl
      b.cyl('steel', 0.6, 0.6, 1.4, 6.6, base + 0.7, -9, 14);
      break;
    case 'sideRamp': {
      road(b, P.f, P.len, base, { rails: elevated });
      if (elevated) pillars(b, P.f, P.len, base);
      // klín pod jednou polovinou silnice (strana +x): najetí, rovná část, sjetí
      const { x0, x1, h, z } = SIDE_RAMP, prof = [[z[0], 0], [z[1], h], [z[2], h], [z[3], 0]];
      const pos = [], idx = [];
      const q = (a, bb, c, d) => { const i = pos.length / 3; pos.push(...a, ...bb, ...c, ...d); idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };
      for (let i = 0; i < 3; i++) {
        const [za, ha] = prof[i], [zb, hb] = prof[i + 1], ya = base + ha + 0.01, yb = base + hb + 0.01;
        q([x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za]);                         // horní plocha
        q([x0, base, za], [x0, base, zb], [x0, yb, zb], [x0, ya, za]);                     // vnitřní bok
        q([x1, ya, za], [x1, yb, zb], [x1, base, zb], [x1, base, za]);                     // vnější bok
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const uv = []; for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3] / 4, pos[i * 3 + 2] / 4);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      const g2 = g.clone(); g2.index.array.reverse();   // oboustranně (kolize i pohled zespodu)
      b.add('hazard', g, true); b.add('hazard', g2, true);
      break;
    }
    case 'trampoline': {
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      const { hx, z0, z1 } = TRAMPOLINE;
      const mat = new THREE.PlaneGeometry(2 * hx, z1 - z0).rotateX(-Math.PI / 2); mat.translate(0, base + 0.04, (z0 + z1) / 2);
      b.add('rubber', mat, false);
      for (const x of [-hx - 0.2, hx + 0.2]) b.box('hazard', 0.35, 0.12, z1 - z0 + 0.7, x, base + 0.06, (z0 + z1) / 2, 0, false);
      for (const z of [z0 - 0.2, z1 + 0.2]) b.box('hazard', 2 * hx + 0.75, 0.12, 0.35, 0, base + 0.06, z, 0, false);
      for (let i = -3; i <= 3; i++) for (const z of [z0 - 0.2, z1 + 0.2]) b.cyl('metal', 0.08, 0.08, 0.14, i * hx / 3.4, base + 0.14, z, 6, false);   // pružiny
      break;
    }
    case 'crusher': {
      // lis: kryty po stranách, vodicí kolejnice v silnici, výstražné pruhy; bloky se hýbou (Track)
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base, [[(20 - CRUSHER.hz - 1) / 40, (20 + CRUSHER.hz + 1) / 40]]);   // mezera pro bloky lisu
      if (elevated) pillars(b, P.f, P.len, base);
      const { hx, hy, hz, open } = CRUSHER;
      for (const s of [-1, 1]) {
        // skříň pohonu: začíná těsně u silnice, otevřený blok se do ní celý zasune (vedle silnice nezbude mezera)
        const x0 = open - hx + 0.3, x1 = open + hx + 0.8;
        b.box('dark', x1 - x0, 2 * hy + 1.2, 2 * hz + 1.6, s * (x0 + x1) / 2, base + hy + 0.6, 0);
        b.box('hazard', x1 - x0 + 0.1, 0.5, 2 * hz + 1.7, s * (x0 + x1) / 2, base + 2 * hy + 1.2, 0, 0, false);
        for (const z of [-hz - 0.3, hz + 0.3]) b.box('metal', open + hx - 1, 0.08, 0.25, s * (open + hx - 1) / 2, base + 0.04, z, 0, false);   // kolejnice
      }
      const g = new THREE.PlaneGeometry(10, 2 * hz + 3).rotateX(-Math.PI / 2); g.translate(0, base + 0.02, 0); b.add('junction', g, false);
      if (ctx.withCones) for (const s of [-1, 1]) b.box('steel', 2 * hx, 2 * hy, 2 * hz, s * open, base + hy, 0, 0, false);
      break;
    }
    case 'spinner': {
      // rotující rameno: sloup uprostřed silnice (kolize) s motorem; rameno se točí (Track)
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      b.cyl('concrete', SPINNER.post + 0.4, SPINNER.post + 0.6, 0.35, 0, base + 0.17, 0, 20);
      b.cyl('steel', SPINNER.post, SPINNER.post, SPINNER.y + 0.9, 0, base + (SPINNER.y + 0.9) / 2, 0, 16);
      b.cyl('hazard', SPINNER.post + 0.05, SPINNER.post + 0.05, 0.5, 0, base + 0.6, 0, 16, false);
      const circ = new THREE.RingGeometry(SPINNER.arm - 0.15, SPINNER.arm + 0.15, 48).rotateX(-Math.PI / 2); circ.translate(0, base + 0.02, 0);
      b.add('hazard', circ, false);
      if (ctx.withCones) b.box('hazard', 2 * SPINNER.arm, 2 * SPINNER.hy, 2 * SPINNER.hz, 0, base + SPINNER.y, 0, 0, false);
      break;
    }
    case 'hammer': {
      // buchary: portál s válci, hlavy dopadají (Track); na silnici otisky dopadu
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      const top = base + HAMMER.top + 2 * HAMMER.hy + 2.2;
      for (const x of [-7.4, 7.4]) { b.box('steel', 1, top - base, 1.4, x, (base + top) / 2, 0); b.box('hazard', 1.1, 1.2, 1.5, x, base + 0.6, 0); }
      b.box('steel', 15.8, 1.1, 1.6, 0, top + 0.55, 0);
      for (const x of [-HAMMER.x, HAMMER.x]) {
        b.cyl('dark', 0.55, 0.55, 1.6, x, top - 0.8, 0, 14);                                          // hydraulický válec
        const mark = new THREE.PlaneGeometry(2 * HAMMER.h, 2 * HAMMER.h).rotateX(-Math.PI / 2); mark.translate(x, base + 0.02, 0);
        b.add('junction', mark, false);
      }
      if (ctx.withCones) for (const x of [-HAMMER.x, HAMMER.x]) b.box('steel', 2 * HAMMER.h, 2 * HAMMER.hy, 2 * HAMMER.h, x, base + HAMMER.top + HAMMER.hy, 0, 0, false);
      break;
    }
    case 'railroad': {
      // přejezd: koleje napříč, pražce, kůlny (vlak z nich vyjíždí), výstražné kříže; vlak, závory a světla hýbe Track
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base, [[(20 - 3.2) / 40, (20 + 3.2) / 40]]);   // mezera pro vlak
      for (const z of [-0.72, 0.72]) b.box('metal', 40, 0.14, 0.12, 0, base + 0.07, z, 0, false);
      for (let x = -19; x <= 19; x += 1.2) if (Math.abs(x) > 5.6) b.box('bark', 0.25, 0.12, 2.4, x, 0.06, 0, 0, false);
      const plank = new THREE.PlaneGeometry(10, 2.6).rotateX(-Math.PI / 2); plank.translate(0, base + 0.03, 0); b.add('dark', plank, false);
      for (const s of [-1, 1]) {
        // kůlna (otevřená k silnici)
        const cx = s * 17;
        b.box('wall', 6, 0.4, 5.4, cx, 5.4, 0);                      // střecha
        b.box('roof', 6.4, 0.3, 6, cx, 5.75, 0, 0, false);
        for (const z of [-2.5, 2.5]) b.box('wall', 6, 5.2, 0.4, cx, 2.6, z);
        b.box('dark', 0.1, 5.2, 4.6, s * 20, 2.6, 0, 0, false);      // tmavá zadní stěna (vlak "mizí")
        // výstražný kříž na sloupku vpravo u každého vjezdu (světla a závoru přidává Track)
        const px = s * 6.4, z = s * 5.2;
        b.cyl('metal', 0.09, 0.09, 3.8, px, base + 1.9, z, 8, false);
        for (const r of [0.62, -0.62]) {
          const g = new THREE.BoxGeometry(2, 0.3, 0.06).rotateZ(r); g.translate(px, base + 3.4, z); b.add('hazard', g, false);
        }
      }
      if (ctx.withCones) b.box('steel', 2 * TRAIN.car, 2 * TRAIN.hy, 2 * TRAIN.hz, 0, base + TRAIN.hy + 0.2, 0, 0, false);
      break;
    }
    case 'bollards': {
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      for (const z of BOLLARDS.rows) for (const x of BOLLARDS.xs) {
        const h = new THREE.CircleGeometry(BOLLARDS.r + 0.12, 16).rotateX(-Math.PI / 2); h.translate(x, base + 0.02, z); b.add('dark', h, false);
      }
      for (const z of BOLLARDS.rows) { const l = new THREE.PlaneGeometry(10, 0.25).rotateX(-Math.PI / 2); l.translate(0, base + 0.021, z - 1); b.add('hazard', l, false); }
      if (ctx.withCones) for (const z of BOLLARDS.rows) for (const x of BOLLARDS.xs) b.cyl('barrier', BOLLARDS.r, BOLLARDS.r, BOLLARDS.h, x, base + BOLLARDS.h / 2, z, 12, false);
      break;
    }
    case 'fireRing': {
      // hořící kruh (dekorace) – postaví se do mezery mezi skokánek a dopad; nekoliduje, auto jím proletí
      const cy = 7.5, R = 6;
      const ring = new THREE.TorusGeometry(R, 0.35, 10, 48); ring.translate(0, cy, 0); b.add('metal', ring, false);
      for (const s of [-1, 1]) b.box('steel', 0.4, cy - R * 0.7, 0.4, s * R * 0.72, (cy - R * 0.7) / 2, 0, 0, false);
      // plameny: vnější oranžovočervené a vnitřní žluté jazyky, nepravidelné, šlehají hlavně vzhůru
      const r = rng(tile.x * 31 + tile.y * 17 + 5);
      const layer = (n, rad, len, mat) => {
        const fl = [];
        for (let i = 0; i < n; i++) {
          const a = (i + r() * 0.6) / n * Math.PI * 2, up = Math.max(0, Math.sin(a)) * 0.9;   // nahoře delší
          const f = new THREE.ConeGeometry(rad * (0.7 + r() * 0.6), len * (0.6 + r() * 0.8 + up), 5);
          const h = f.parameters.height;
          // jazyk míří ven z kruhu a stáčí se vzhůru
          f.translate(0, h / 2, 0); f.rotateZ(Math.atan2(Math.sin(a) + 0.6, Math.cos(a)) - Math.PI / 2);
          f.translate(Math.cos(a) * (R + 0.1), cy + Math.sin(a) * (R + 0.1), (r() - 0.5) * 0.5);
          fl.push(f);
        }
        b.add(mat, mergeGeometries(fl), false);
      };
      layer(70, 0.42, 1.5, 'fire');
      layer(50, 0.26, 0.9, 'fireCore');
      break;
    }
    case 'crossFlat': {
      // ramena obou silnic mimo střed + prostřední čtverec bez značení; obrubníky jen na ramenech
      const [p0, p1] = PATHS.crossFlat.multi, a = (20 - RH) / 40;
      for (const P2 of [p0, p1]) for (const [from, to] of [[0, a], [1 - a, 1]]) {
        const o = { from, to, step: 1 };
        b.sweep(P2.f, 40 * (to - from), base, [[-RH, 0], [RH, 0]], 'asphalt', { ...o, uvNorm: true, uvAlong: 10 });
        b.sweep(P2.f, 40 * (to - from), base, [[RH, 0], [RH, -TH], [-RH, -TH], [-RH, 0]], 'concrete', { ...o, uvAcross: 4, uvAlong: 4 });
        const prof = [[RH, 0], [RH + 0.1, 0.1], [RH + 0.9, 0.1], [RH + 1.0, -0.3]];
        b.sweep(P2.f, 40 * (to - from), base, prof, 'curb', { ...o, uvAcross: 1, uvAlong: 4 });
        b.sweep(P2.f, 40 * (to - from), base, mirror(prof), 'curb', { ...o, uvAcross: 1, uvAlong: 4 });
      }
      const sq = new THREE.PlaneGeometry(2 * RH, 2 * RH).rotateX(-Math.PI / 2); sq.translate(0, base, 0);
      b.add('asphaltPlain', sq, true);
      // žluté šrafování středu (nezastavovat) a výstražné značky v rozích
      const hatch = new THREE.PlaneGeometry(2 * RH - 1, 2 * RH - 1).rotateX(-Math.PI / 2); hatch.translate(0, base + 0.02, 0);
      b.add('junction', hatch, false);
      for (const [x, z] of [[7.2, -7.2], [-7.2, 7.2], [7.2, 7.2], [-7.2, -7.2]]) {
        b.cyl('metal', 0.07, 0.07, 2.2, x, base + 1.1, z, 6, false);
        b.cyl('hazard', 0.55, 0.55, 0.06, x, base + 2.4, z, 3, false);
      }
      break;
    }
    case 'bank':
      road(b, P.f, P.len, base, { rails: true, railH: 0.8 });
      pillars(b, P.f, P.len, base);
      break;
    case 'spiral': case 'spiralR': {
      road(b, P.f, P.len, base, { rails: true, step: 0.8 });
      // pilíře jen mimo spodní průjezd (sloupec rovných úseků x ≈ 0, u pravé x ≈ 40)
      const sx = type === 'spiral' ? 0 : 40;
      pillars(b, P.f, P.len, base, 9, p => Math.abs(p.x - sx) > 9.5 || p.z > 46);
      break;
    }
    case 'rampIn': case 'rampS': case 'rampOut':
      road(b, P.f, P.len, base, { rails: true });
      pillars(b, P.f, P.len, base, 12);
      break;
    case 'river': {
      const w = new THREE.PlaneGeometry(40, 22); w.rotateX(-Math.PI / 2); w.translate(0, 0.06, 0);
      b.add('water', w, false);
      for (const s of [1, -1]) {
        const g = new THREE.PlaneGeometry(40, 3); g.rotateX(-Math.PI / 2); g.translate(0, 0.04, s * 12.3);
        b.add('sand', g, false);
      }
      break;
    }
    case 'riverCurve': {
      // čtvrtkruh se středem v rohu (-20, 20): napojuje západní a jižní hranu (voda 22 m široká)
      const ring = (r0, r1, mat, y) => { const g = new THREE.RingGeometry(r0, r1, 28, 1, 0, Math.PI / 2); g.rotateX(-Math.PI / 2); g.translate(-20, y, 20); b.add(mat, g, false); };
      ring(9, 31, 'water', 0.06);
      ring(31, 34, 'sand', 0.04);
      ring(6, 9, 'sand', 0.04);
      break;
    }
    case 'ramp':
      road(b, P.f, P.len, base, { rails: true });
      pillars(b, P.f, P.len, base, 10);
      break;
    case 'start': {
      road(b, P.f, P.len, base, { rails: elevated });
      if (elevated) pillars(b, P.f, P.len, base);
      const g = new THREE.PlaneGeometry(10, 1.6); g.rotateX(-Math.PI / 2); g.translate(0, base + 0.02, 0);
      b.add('checker', g, false);
      for (const x of [-7.4, 7.4]) b.box('metal', 0.7, 7.4, 0.7, x, base + 3.7, 0);
      b.box('dark', 15.5, 1.5, 0.6, 0, base + 7.2, 0);
      for (const s of [1, -1]) {
        const p = new THREE.PlaneGeometry(14.5, 1.3); if (s < 0) p.rotateY(Math.PI); p.translate(0, base + 7.2, 0.31 * s);
        b.add('banner', p, false);
      }
      break;
    }
    case 'tunnelPortal':
      tunnelPortal(b, P, base, ctx.tunnelEnds || [true, true]);
      break;
    case 'tunnel': case 'tunnelCurve': case 'tunnelBig':
      tunnel(b, P, base, type === 'tunnelCurve' ? { cx: 20, cz: -20, R: 20, x0: -20, x1: 20, z0: -20, z1: 20 }
        : type === 'tunnelBig' ? { cx: 60, cz: -20, R: 60, x0: -20, x1: 60, z0: -20, z1: 60 } : null, ctx.tunnelEnds);
      break;
    case 'bridge': case 'bridgeDry': {
      road(b, P.f, P.len, base, { rails: true });
      if (type === 'bridge') {
        // řeka pod mostem
        const w = new THREE.PlaneGeometry(40, 22); w.rotateX(-Math.PI / 2); w.translate(0, 0.06, 0);
        b.add('water', w, false);
        for (const s of [1, -1]) {
          const g = new THREE.PlaneGeometry(40, 3); g.rotateX(-Math.PI / 2); g.translate(0, 0.04, s * 12.3);
          b.add('sand', g, false);
        }
      }
      bridgeSteel(b, base, false);
      break;
    }
    case 'tunnelBridge': {
      tunnel(b, P, base, null, ctx.tunnelEnds);
      const hi = PATHS.tunnelBridge.multi[1], top = base + 2 * H;
      road(b, hi.f, hi.len, top - 2 * H, { rails: true });
      bridgeSteel(b, top, true);
      break;
    }
    case 'loop': {
      // samonosný looping bez rámu; v patře pilíře jen pod nájezdem a výjezdem (ne uvnitř smyčky)
      road(b, P.f, P.len, base, { rails: true, railH: 1.2, step: 0.5 });
      if (elevated) pillars(b, P.f, P.len, base, 13, p => p.y < base + 0.5);
      break;
    }
    case 'pipeIn': case 'pipe': case 'pipeObst':
      pipe(b, P, base, type === 'pipeIn' ? u => smooth(u) : () => 1);
      if (elevated) pillars(b, P.f, P.len, base - 0.5);
      if (type !== 'pipeIn') for (const z of [-15, -5, 5, 15]) b.box('lamp', 0.5, 0.12, 3, 0, base + 2 * PIPE_R - 0.15, z, 0, false);
      if (type === 'pipeObst') {
        // zátaras kopíruje dno roury (oblouk ±ang od dna) – skládá se z úzkých kvádrů natočených kolem osy roury
        const { ang, h, half } = PIPE_OBST, n = 10, seg = 2 * PIPE_R * Math.sin(ang / n) + 0.08;
        for (let k = 0; k < n; k++) {
          const th = -ang + (2 * k + 1) * ang / n, rr = PIPE_R - h / 2;
          const g = new THREE.BoxGeometry(seg, h, 2 * half);
          g.rotateZ(th); g.translate(rr * Math.sin(th), base + PIPE_R - rr * Math.cos(th), 0);
          b.add(k % 2 ? 'hazard' : 'barrier', g, true);
        }
      }
      break;
    case 'cones':   // slalom: kužely jsou samostatné (dají se porazit) – přidává je Track; tady jen pro náhled v editoru
      road(b, P.f, P.len, base, { curbs: false }); guardRails(b, P, base);
      if (elevated) pillars(b, P.f, P.len, base);
      if (ctx.withCones) for (const [x, z] of CONES) b.cyl('hazard', 0.06, 0.34, 0.8, x, base + 0.4, z, 12, false);
      break;
    case 'kicker':      road(b, P.f, P.len, base, { rails: false, curbs: false, solid: e === 0, capEnd: e === 0 });
      if (e > 0) pillars(b, P.f, P.len, base);
      for (const x of [-5.4, 5.4]) b.box('hazard', 0.5, 0.5, 6, x, base + 0.25, -17);
      break;
    case 'landing':
      road(b, P.f, P.len, base, { rails: false, curbs: false, solid: e === 0, capStart: e === 0 });
      if (e > 0) pillars(b, P.f, P.len, base);
      break;
    case 'slalom':
      road(b, P.f, P.len, base, { rails: elevated });
      if (elevated) pillars(b, P.f, P.len, base);
      [[2.9, -10], [-2.9, 0], [2.9, 10]].forEach(([x, z]) => b.box('hazard', 3.8, 1.0, 0.9, x, base + 0.5, z));
      break;
    case 'trees': {
      const r = rng(tile.seed || (tile.x * 73 + tile.y * 151));
      const n = 3 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) tree(b, r, (r() - 0.5) * 32, (r() - 0.5) * 32);
      break;
    }
    case 'house': {
      const r = rng(tile.seed || (tile.x * 91 + tile.y * 37));
      const n = 1 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const w = 7 + r() * 4, d = 8 + r() * 4, h = 4 + r() * 3;
        const x = n === 1 ? 0 : (i ? 8 : -8), z = (r() - 0.5) * 10;
        b.box('wall', w, h, d, x, h / 2, z);
        const roof = new THREE.BufferGeometry();
        const rh = 3, hw = w / 2 + 0.4, hd = d / 2 + 0.4;
        const pts = [[-hw, h, -hd], [hw, h, -hd], [0, h + rh, -hd], [-hw, h, hd], [hw, h, hd], [0, h + rh, hd]];
        const tri = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
        const pos = [], uv = [];
        for (const i of tri) { pos.push(pts[i][0] + x, pts[i][1], pts[i][2] + z); uv.push(pts[i][2] / 3, (pts[i][1] + pts[i][0]) / 3); }
        roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const ng = roof.index ? roof : (() => { roof.setIndex([...Array(tri.length).keys()]); return roof; })();
        ng.computeVertexNormals();
        b.add('roof', ng, true);
      }
      for (let i = 0; i < 3; i++) tree(b, r, (r() - 0.5) * 34, 14 + r() * 4);
      break;
    }
    case 'lake': {
      const g = new THREE.CircleGeometry(17, 40); g.rotateX(-Math.PI / 2); g.translate(0, 0.07, 0);
      b.add('water', g, false);
      const s = new THREE.RingGeometry(16.5, 19, 40); s.rotateX(-Math.PI / 2); s.translate(0, 0.05, 0);
      b.add('sand', s, false);
      break;
    }
    case 'wall': { // zeď: ramena ke středům stran, kde je sousední zeď (maska ve světových stranách)
      const rot = tile.rot || 0, m = ctx.wallMask || 0;
      const arms = [];
      for (let s = 0; s < 4; s++) if (m >> s & 1) arms.push((s - rot + 4) % 4);
      if (arms.length === 0) arms.push(0, 2);                 // samostatná zeď – přes celé pole podle otočení
      else if (arms.length === 1) arms.push((arms[0] + 2) % 4); // konec řady – dotáhnout přes celé pole
      const WH = 1.8, WT = 0.9;
      for (const s of arms) {
        const [dx, dz] = DELTA[s], along = s % 2 === 0;
        b.box('concrete', along ? WT : 20, WH, along ? 20 : WT, dx * 10, WH / 2, dz * 10);
        b.box('hazard', along ? WT + 0.12 : 20, 0.3, along ? 20 : WT + 0.12, dx * 10, WH + 0.15, dz * 10);
      }
      b.box('concrete', WT + 0.3, WH + 0.5, WT + 0.3, 0, (WH + 0.5) / 2, 0);
      break;
    }
    case 'billboard': { // reklamní tabule s vlastním textem, čelem k +z (text i ze zadní strany)
      for (const x of [-6, 6]) b.cyl('metal', 0.3, 0.35, 9.4, x, 4.7, 0, 10);
      b.box('dark', 16.6, 6.6, 1.0, 0, 6.3, 0);
      const mat = billboardMat(tile.text);
      for (const s of [1, -1]) {
        const p = new THREE.PlaneGeometry(16, 6); if (s < 0) p.rotateY(Math.PI); p.translate(0, 6.3, 0.52 * s);
        b.add(mat, p, false);
      }
      break;
    }
    case 'stand': { // tribuna čelem k +z (k jižní hraně dlaždice)
      for (let k = 0; k < 5; k++) { const h = 1 + k * 1.1; b.box('concrete', 34, h, 2.2, 0, h / 2, 10 - k * 2.2); }
      b.quad('crowd', [[-17, 1.1, 11.1], [17, 1.1, 11.1], [17, 5.5, 0.1], [-17, 5.5, 0.1]], 5, 1);
      for (const x of [-16.5, 16.5]) for (const z of [-0.6, 11.5]) b.box('metal', 0.4, 11, 0.4, x, 5.5, z);
      const roof = new THREE.BoxGeometry(35, 0.3, 14); roof.rotateX(0.1); roof.translate(0, 11.2, 5.5);
      b.add('metal', roof, false);
      break;
    }
  }
  return b;
}

// převede stavitele na skupinu meshů + kolizní geometrii ve světových souřadnicích
export function finalizePiece(b, tile, M, center, opts = {}) {
  const m = new THREE.Matrix4().makeRotationY(-tile.rot * Math.PI / 2).setPosition(center.x, 0, center.z);
  // kolize nejdřív – vizuální geometrie se transformují na místě
  let collider = null;
  if (!opts.ghost && b.col.length) {
    const parts = b.col.map(g => {
      const c = new THREE.BufferGeometry();
      c.setAttribute('position', g.attributes.position.clone());
      c.setIndex(g.index.clone());
      return c;
    });
    collider = mergeGeometries(parts, false);
    collider.applyMatrix4(m);
  }
  const group = new THREE.Group();
  for (const [mat, geos] of b.vis) {
    const g = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (!g) continue;
    g.applyMatrix4(m);
    const mesh = new THREE.Mesh(g, opts.ghost ? opts.ghost : typeof mat === 'string' ? M[mat] : mat);
    mesh.castShadow = !['water', 'sand', 'checker', 'asphalt', 'asphaltPlain', 'gravel', 'boost', 'boostEdge', 'junction', 'oil', 'windStreak', 'rubber', 'fire', 'fireCore', 'lamp', 'crowd'].includes(mat) && !opts.ghost;
    mesh.receiveShadow = !opts.ghost;
    group.add(mesh);
  }
  return { group, collider };
}

export function pieceDef(type) { return PIECES[type]; }
export { T };
