// Procedurální 3D modely aut: oblá karoserie z "loftu" průřezů (superelipsy), prosklená kabina,
// podběhy, kola s disky, světla, spoilery a polepy kreslené do textury. + náhledy aut pro menu.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carDims } from './physics.js';

// profily karoserie: výšky jako podíl celkové výšky auta, s = 0 záď … 1 příď
const STYLES = {
  coupe: { lower: [[0, 0.44], [0.06, 0.6], [0.3, 0.66], [0.55, 0.66], [0.75, 0.58], [0.92, 0.48], [1, 0.38]],
    cab: [0.2, 0.74], roof: [[0, 0.62], [0.2, 0.93], [0.45, 1.0], [0.68, 0.95], [1, 0.6]], cabW: 0.78, sq: 4.5 },
  hatch: { lower: [[0, 0.42], [0.04, 0.56], [0.5, 0.6], [0.8, 0.57], [0.94, 0.47], [1, 0.36]],
    cab: [0.03, 0.75], roof: [[0, 0.56], [0.05, 0.95], [0.6, 1.0], [0.86, 0.9], [1, 0.57]], cabW: 0.86, sq: 3.6 },
  rally: { lower: [[0, 0.42], [0.05, 0.58], [0.5, 0.62], [0.82, 0.58], [0.95, 0.47], [1, 0.37]],
    cab: [0.08, 0.74], roof: [[0, 0.6], [0.08, 0.96], [0.6, 1.0], [0.86, 0.9], [1, 0.6]], cabW: 0.84, sq: 4 },
  muscle: { lower: [[0, 0.5], [0.05, 0.64], [0.35, 0.68], [0.62, 0.68], [0.9, 0.66], [1, 0.5]],
    cab: [0.24, 0.62], roof: [[0, 0.66], [0.25, 0.96], [0.6, 1.0], [0.82, 0.92], [1, 0.66]], cabW: 0.8, sq: 5.5 },
  gt3: { lower: [[0, 0.5], [0.05, 0.64], [0.3, 0.68], [0.55, 0.66], [0.75, 0.58], [0.92, 0.46], [1, 0.34]],
    cab: [0.22, 0.72], roof: [[0, 0.64], [0.22, 0.95], [0.45, 1.0], [0.68, 0.94], [1, 0.62]], cabW: 0.74, sq: 5 },
  hyper: { lower: [[0, 0.52], [0.1, 0.66], [0.35, 0.66], [0.62, 0.6], [0.85, 0.46], [1, 0.3]],
    cab: [0.34, 0.8], roof: [[0, 0.64], [0.3, 0.97], [0.55, 1.0], [1, 0.58]], cabW: 0.68, sq: 3.2 },
  pickup: { lower: [[0, 0.52], [0.03, 0.64], [0.5, 0.66], [0.7, 0.66], [0.88, 0.64], [1, 0.5]],
    cab: [0.4, 0.76], roof: [[0, 0.64], [0.07, 0.97], [0.8, 1.0], [1, 0.64]], cabW: 0.9, sq: 5.5 },
};

const sm = t => t * t * (3 - 2 * t);
function prof(pts, s) {
  if (s <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, va] = pts[i], [b, vb] = pts[i + 1];
    if (s <= b) return va + (vb - va) * sm((s - a) / (b - a));
  }
  return pts[pts.length - 1][1];
}
const env = (t, p = 4) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), p)), 1 / p);
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// loft: průřezy superelipsy podél z; sect(t) -> {z, w, yb, yt}
function loft(sect, n, seg, sq, taper = 0) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, S = sect(t);
    const mid = (S.yb + S.yt) / 2, hh = (S.yt - S.yb) / 2;
    for (let j = 0; j <= seg; j++) {
      const th = -Math.PI / 2 + 2 * Math.PI * j / seg;
      const cy = spow(Math.sin(th), 2 / sq);
      const y = mid + hh * cy;
      const tp = 1 - taper * Math.max(0, cy);
      pos.push(S.w * tp * spow(Math.cos(th), 2 / sq), y, S.z);
      uv.push(j / seg, t);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const hex = c => '#' + c.toString(16).padStart(6, '0');

// polep karoserie. Textura: x = obvod (0 spodek, 0.25 levý bok, 0.5 střed shora, 0.75 pravý bok), y = délka (nahoře příď)
function liveryTexture(spec, D) {
  const L = spec.look, W = 1024, Hh = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  const circ = 2 * (D.width + D.height) * 0.9, len = D.len;
  const U = u => u * W, Vy = v => (1 - v) * Hh;
  g.fillStyle = hex(L.base); g.fillRect(0, 0, W, Hh);
  const sideText = (text, u, v, size, color, font = '900') => {
    for (const [uu, rot] of [[u, Math.PI / 2], [1 - u, -Math.PI / 2]]) {
      g.save(); g.translate(U(uu), Vy(v)); g.rotate(rot);
      g.scale(Hh / len / (W / circ), 1);
      g.fillStyle = color; g.font = `${font} ${size}px "Russo One", "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 0, 0); g.restore();
    }
  };
  const roundel = (num, v) => {
    if (!num) return;
    for (const u of [0.27, 0.73]) {
      const rx = 0.3 / circ * W, ry = 0.3 / len * Hh;
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(U(u), Vy(v), rx, ry, 0, 0, 7); g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 6; g.stroke();
    }
    sideText(num, 0.27, v, 150, '#111');
  };
  const band = (u0, u1, color) => { g.fillStyle = color; g.fillRect(U(u0), 0, U(u1) - U(u0), Hh); g.fillRect(U(1 - u1), 0, U(u1) - U(u0), Hh); };
  switch (L.livery) {
    case 'stripes':
      g.fillStyle = hex(L.accent2); for (const u of [0.468, 0.508]) g.fillRect(U(u), 0, U(0.024), Hh);
      band(0.12, 0.155, hex(L.accent));
      roundel(L.number, 0.5);
      sideText('VEKTOR', 0.2, 0.8, 70, hex(L.accent));
      break;
    case 'dots': {
      let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      g.fillStyle = hex(L.accent);
      for (let i = 0; i < 160; i++) { const u = r(), v = r(); g.beginPath(); g.ellipse(U(u), Vy(v), 10 + r() * 14, 12 + r() * 16, 0, 0, 7); g.fill(); }
      band(0.1, 0.16, hex(L.accent2));
      sideText('KAPKA', 0.21, 0.45, 90, hex(L.accent2));
      break;
    }
    case 'rally': {
      band(0.0, 0.2, hex(L.accent));
      g.fillStyle = hex(L.accent2);
      for (const s of [1, -1]) {
        g.beginPath();
        const u0 = s > 0 ? 0.2 : 0.8;
        g.moveTo(U(u0), Vy(0.2)); g.lineTo(U(u0 + 0.06 * s), Vy(0.35)); g.lineTo(U(u0 + 0.06 * s), Vy(0.45)); g.lineTo(U(u0), Vy(0.3)); g.fill();
      }
      g.fillStyle = hex(L.accent); g.fillRect(U(0.43), 0, U(0.14), Hh * 0.25);
      roundel(L.number, 0.55);
      g.save(); g.translate(U(0.5), Vy(0.88)); g.rotate(Math.PI); g.scale(Hh / len / (W / circ), 1);
      g.fillStyle = hex(L.accent); g.font = '900 60px "Russo One", sans-serif'; g.textAlign = 'center'; g.fillText('HORIZONT', 0, 20); g.restore();
      break;
    }
    case 'flames': {
      const grad = g.createLinearGradient(0, 0, 0, Hh * 0.6);
      grad.addColorStop(0, '#fff2a0'); grad.addColorStop(0.4, '#ff8a1c'); grad.addColorStop(1, hex(L.accent2));
      g.fillStyle = grad;
      for (const side of [1, -1]) {
        g.beginPath();
        const base = side > 0 ? 0.12 : 0.88;
        g.moveTo(U(base), Vy(1));
        for (let k = 0; k <= 8; k++) {
          const v = 1 - k * 0.06, amp = 0.1 * (1 - k / 10);
          g.quadraticCurveTo(U(base + side * amp * 1.4), Vy(v - 0.03), U(base + side * (k % 2 ? amp * 0.5 : amp)), Vy(v - 0.06));
        }
        g.lineTo(U(base), Vy(0.45)); g.fill();
      }
      g.fillStyle = hex(L.accent); for (const u of [0.46, 0.515]) g.fillRect(U(u), 0, U(0.025), Hh);
      roundel(L.number, 0.35);
      break;
    }
    case 'hyper':
      band(0.0, 0.2, '#15161a');
      band(0.2, 0.208, hex(L.accent2));
      g.fillStyle = hex(L.accent2); g.fillRect(U(0.495), 0, U(0.01), Hh);
      sideText('BLESK', 0.24, 0.45, 110, hex(L.accent2));
      break;
    case 'pickup': {
      band(0.0, 0.17, hex(L.accent));
      g.fillStyle = 'rgba(70,50,30,0.55)';
      let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 260; i++) { const u = r() < 0.5 ? r() * 0.14 : 1 - r() * 0.14; g.beginPath(); g.arc(U(u), Vy(r()), 2 + r() * 7, 0, 7); g.fill(); }
      sideText('BUVOL 4×4', 0.225, 0.6, 80, hex(L.accent2));
      break;
    }
  }
  // spáry dveří a kliky (realističtější karoserie)
  const st = STYLES[L.style];
  if (st) {
    const [c0, c1] = st.cab;
    const seams = [c1 - 0.02, (c0 + c1) / 2];
    if (c1 - c0 > 0.45) seams.push(c0 + 0.04);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3;
    for (const v of seams) for (const [u0, u1] of [[0.13, 0.335], [0.665, 0.87]]) { g.beginPath(); g.moveTo(U(u0), Vy(v)); g.lineTo(U(u1), Vy(v)); g.stroke(); }
    g.fillStyle = 'rgba(20,20,20,0.7)';
    for (const v of seams.slice(0, 2)) for (const u of [0.3, 0.7]) g.fillRect(U(u) - 3, Vy(v - 0.035) - 10, 6, 20);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (const u of [0.335, 0.665]) { g.beginPath(); g.moveTo(U(u), Vy(c0)); g.lineTo(U(u), Vy(c1)); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// kabina: sklo + střecha a sloupky v barvě karoserie
function cabinTexture(spec) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, '#0b141c'); gr.addColorStop(0.5, '#1f3242'); gr.addColorStop(1, '#0b141c');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = hex(spec.look.style === 'hyper' ? 0x15161a : spec.look.base);
  const U = u => u * 256, Vy = v => (1 - v) * 256;
  g.fillRect(U(0.42), Vy(0.8), U(0.16), Vy(0.3) - Vy(0.8));            // střecha
  for (const u of [0.355, 0.615]) g.fillRect(U(u), 0, U(0.03), 256);    // sloupky A/C
  for (const u of [0.18, 0.64]) g.fillRect(U(u), Vy(0.53), U(0.18), Vy(0.46) - Vy(0.53)); // B sloupky
  g.fillRect(0, 0, U(0.19), 256); g.fillRect(U(0.81), 0, U(0.19), 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- stavebnice modelu
function makeKit(spec, D, root) {
  const L = spec.look;
  const phys = o => new THREE.MeshPhysicalMaterial(o);
  const std = o => new THREE.MeshStandardMaterial(o);
  const M = {
    livery: STYLES[L.style] ? phys({ map: liveryTexture(spec, D), metalness: 0.35, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07 }) : null,
    paint: phys({ color: L.base, metalness: 0.35, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07 }),
    accent: phys({ color: L.accent, metalness: 0.3, roughness: 0.35, clearcoat: 1 }),
    accent2: phys({ color: L.accent2, metalness: 0.3, roughness: 0.35, clearcoat: 1 }),
    cabin: STYLES[L.style] ? phys({ map: cabinTexture(spec), metalness: 0.3, roughness: 0.12, clearcoat: 1 }) : null,
    glass: phys({ color: 0x16242e, metalness: 0.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }),
    trim: std({ color: L.accent === 0xffffff || L.style === 'jeep' ? 0x1a1a1a : L.accent, metalness: 0.3, roughness: 0.5 }),
    black: std({ color: 0x0c0c0c, roughness: 0.75 }),
    carbon: std({ color: 0x1b1d21, metalness: 0.4, roughness: 0.35 }),
    rubber: std({ color: 0x151515, roughness: 0.92 }),
    chrome: std({ color: 0xdddddd, metalness: 1, roughness: 0.16 }),
    steelRim: std({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.35 }),
    head: std({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.6 }),
    tail: std({ color: 0x550000, emissive: 0xff1a0a, emissiveIntensity: 0.6 }),
    orange: std({ color: 0xff8a1c, emissive: 0x552200 }),
    plate: null,
  };
  // poznávací značka
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 56;
  const pg = pc.getContext('2d');
  pg.fillStyle = '#f4f4f4'; pg.fillRect(0, 0, 256, 56); pg.fillStyle = '#1f4fb8'; pg.fillRect(0, 0, 26, 56);
  pg.strokeStyle = '#111'; pg.lineWidth = 4; pg.strokeRect(2, 2, 252, 52);
  pg.fillStyle = '#111'; pg.font = 'bold 34px Arial'; pg.textAlign = 'center'; pg.textBaseline = 'middle';
  pg.fillText(('1S' + (spec.name.length * 7 + 1000)).slice(0, 3) + ' ' + (spec.name.charCodeAt(0) * 37 % 9000 + 1000), 142, 30);
  const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
  M.plate = std({ map: pt, roughness: 0.5 });

  const add = (geo, m, x = 0, y = 0, z = 0, parent = root) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const K = {
    spec, D, L, root, M, add,
    gy: D.groundY, hl: D.hl, hw: D.hw,
    box: (m, w, h, d, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z),
    rbox: (m, w, h, d, x, y, z, r = 0.06) => add(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), m, x, y, z),
    ell: (m, rx, ry, rz, x, y, z) => { const s = add(new THREE.SphereGeometry(1, 20, 12), m, x, y, z); s.scale.set(rx, ry, rz); return s; },
    cylX: (m, r, len, x, y, z, seg = 18) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateZ(Math.PI / 2); return add(g, m, x, y, z); },
    cylZ: (m, r, len, x, y, z, seg = 18) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); return add(g, m, x, y, z); },
    // trubka mezi dvěma body (ramena zavěšení, rám)
    strut: (m, a, b, r = 0.025) => {
      const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A);
      const o = add(new THREE.CylinderGeometry(r, r, d.length(), 8), m);
      o.position.copy(A).add(Bv).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      return o;
    },
    plate: (z, y, back) => { const p = add(new THREE.PlaneGeometry(0.52, 0.12), M.plate, 0, y, z); if (back) p.rotation.y = Math.PI; return p; },
    brakeLights: [],
  };
  return K;
}

// pneumatika z rotačního profilu (bočnice + zaoblená běhoun), volitelně s terénním vzorkem
function tireGeometry(R, w, knobs) {
  const rin = R * 0.62, e = Math.min(0.05, w * 0.18);
  const pts = [[rin, -w / 2], [R - e * 1.6, -w / 2], [R - e * 0.4, -w / 2 + e * 0.4], [R, -w / 2 + e * 1.4], [R, w / 2 - e * 1.4], [R - e * 0.4, w / 2 - e * 0.4], [R - e * 1.6, w / 2], [rin, w / 2]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 36);
  g.rotateZ(Math.PI / 2);
  if (!knobs) return g;
  const parts = [g];
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2;
    for (const side of [-1, 1]) {
      const k = new THREE.BoxGeometry(w * 0.4, 0.045, 0.09);
      k.translate(side * w * 0.22 + (i % 2 ? 0.03 : -0.03), R + 0.012, 0);
      k.rotateX(a);
      parts.push(k);
    }
  }
  return mergeGeometries(parts.map(p => p.toNonIndexed()));
}

// kola: typ 'road' (5 paprsků), 'formula' (široké, bez podběhů), 'offroad' (terénní vzorek, ocelové disky)
function makeWheels(K, o = {}) {
  const { D, M, root } = K;
  const R = D.wheelR, type = o.type || 'road';
  const wF = o.wFront || 0.24 + R * 0.12, wR = o.wRear || wF;
  const wheels = [];
  const restY = D.mountY - (D.rest - D.sag);
  const spokeG = new THREE.BoxGeometry(0.05, R * 1.15, 0.07);
  const rimMat = o.rimMat || (type === 'offroad' ? M.steelRim : M.chrome);
  const pos = [[D.track, D.wbF, true], [-D.track, D.wbF, true], [D.track, D.wbR, false], [-D.track, D.wbR, false]];
  for (const [x, z, front] of pos) {
    const tw = front ? wF : wR, sx = Math.sign(x);
    const steerG = new THREE.Group();
    steerG.position.set(x, restY, z);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(tireGeometry(R, tw, type === 'offroad'), M.rubber));
    const rimR = R * 0.62;
    const barrel = new THREE.CylinderGeometry(rimR, rimR, tw * 0.9, 24, 1, true); barrel.rotateZ(Math.PI / 2);
    spin.add(new THREE.Mesh(barrel, M.black));
    const face = new THREE.CircleGeometry(rimR * 0.98, 24); face.rotateY(sx * Math.PI / 2);
    const faceM = new THREE.Mesh(face, type === 'formula' ? M.carbon : M.black); faceM.position.x = sx * tw * 0.3; spin.add(faceM);
    if (type === 'offroad') {
      const disc = new THREE.CylinderGeometry(rimR * 0.95, rimR * 0.95, 0.04, 24); disc.rotateZ(Math.PI / 2);
      const dm = new THREE.Mesh(disc, rimMat); dm.position.x = sx * tw * 0.32; spin.add(dm);
      for (let k = 0; k < 6; k++) {
        const h = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8); h.rotateZ(Math.PI / 2);
        const hm = new THREE.Mesh(h, M.black); const a = k / 6 * Math.PI * 2;
        hm.position.set(sx * tw * 0.34, Math.cos(a) * rimR * 0.55, Math.sin(a) * rimR * 0.55); spin.add(hm);
      }
    } else {
      const n = type === 'formula' ? 10 : 5;
      for (let k = 0; k < n; k++) {
        const sp = new THREE.Mesh(type === 'formula' ? new THREE.BoxGeometry(0.03, rimR * 1.9, 0.04) : spokeG, rimMat);
        sp.rotation.x = k * Math.PI * 2 / n; sp.position.x = sx * tw * 0.33; spin.add(sp);
      }
      if (type === 'formula') {
        const ring = new THREE.TorusGeometry(rimR * 0.96, 0.02, 6, 32); ring.rotateY(Math.PI / 2);
        const rm = new THREE.Mesh(ring, M.accent2); rm.position.x = sx * tw * 0.36; spin.add(rm);
      }
    }
    const hub = new THREE.CylinderGeometry(0.07, 0.07, tw * 0.95, 10); hub.rotateZ(Math.PI / 2);
    spin.add(new THREE.Mesh(hub, rimMat));
    steerG.add(spin);
    root.add(steerG);
    wheels.push({ steerG, spin, x, z, restY, tw });
  }
  return wheels;
}

// ---------------------------------------------------------------- klasická auta (loft karoserie)
function loftBody(K) {
  const { D, L, M, gy, hl, hw } = K;
  const st = STYLES[L.style] || STYLES.coupe;
  const Hc = D.height, Y = f => gy + f * Hc, zAt = s => -hl + s * D.len;
  const bodyG = loft(t => {
    const e = env(t, 4), top = Y(prof(st.lower, t)), bot = gy + D.clear;
    const mid = (top + bot) / 2;
    return { z: zAt(t), w: hw * Math.pow(e, 0.45), yt: mid + (top - mid) * Math.pow(e, 0.3), yb: mid - (mid - bot) * Math.pow(e, 0.6) };
  }, 44, 48, st.sq, 0.06);
  K.add(bodyG, M.livery);
  const [c0, c1] = st.cab;
  const cabG = loft(t => {
    const s = c0 + (c1 - c0) * t;
    const e = env(t, 3);
    const belt = Y(prof(st.lower, s)) - 0.1;
    return { z: zAt(s), w: hw * st.cabW * (0.75 + 0.25 * e), yb: belt, yt: Math.max(belt + 0.02, Y(prof(st.roof, t))) };
  }, 36, 40, 3.2, 0.28);
  K.add(cabG, M.cabin);

  // světla, zrcátka, značky, nárazníky
  const yF = Y(prof(st.lower, 0.97)) - 0.1, yR = Y(prof(st.lower, 0.03)) - 0.08;
  for (const s of [-1, 1]) {
    K.ell(M.head, hw * 0.2, 0.06, 0.08, s * hw * 0.6, yF, hl - 0.12);
    K.brakeLights.push(K.ell(M.tail, hw * 0.2, 0.05, 0.05, s * hw * 0.62, yR, -hl + 0.06));
    K.ell(M.orange, 0.05, 0.03, 0.03, s * hw * 0.85, yF - 0.02, hl - 0.25);
    const mz = zAt(c1 - 0.04), my = Y(prof(st.lower, c1)) + 0.12;
    K.box(M.trim, 0.06, 0.04, 0.04, s * (hw * st.cabW + 0.03), my - 0.03, mz);
    K.rbox(M.livery ? M.paint : M.trim, 0.1, 0.1, 0.18, s * (hw * st.cabW + 0.1), my, mz, 0.035);
  }
  K.ell(M.black, hw * 0.45, 0.06, 0.05, 0, Y(prof(st.lower, 1)) - 0.12, hl - 0.04);
  K.rbox(M.black, hw * 1.75, 0.13, 0.16, 0, gy + D.clear + 0.07, hl - 0.18, 0.05);
  K.rbox(M.black, hw * 1.65, 0.13, 0.16, 0, gy + D.clear + 0.07, -hl + 0.14, 0.05);
  K.plate(hl + 0.0, gy + D.clear + 0.2, false);
  K.plate(-hl + 0.02, yR - 0.14, true);
  K.cylZ(M.chrome, 0.045, 0.16, hw * 0.45, gy + D.clear + 0.05, -hl + 0.02, 12);

  // doplňky podle typu
  const deckY = Y(prof(st.lower, 0.06));
  if (L.style === 'gt3') {
    // závoďák GT3: přední spoiler, difuzor, velké křídlo na labutích krcích, sání na střeše
    K.box(M.carbon, hw * 2.05, 0.03, 0.32, 0, gy + D.clear + 0.01, hl - 0.05);
    for (const s of [-1, 1]) K.box(M.carbon, 0.2, 0.06, 0.12, s * hw * 0.92, gy + D.clear + 0.1, hl - 0.12);
    for (let i = -2; i <= 2; i++) K.box(M.carbon, 0.02, 0.16, 0.45, i * 0.28, gy + D.clear + 0.08, -hl + 0.2);
    const wy = deckY + 0.38, wz = -hl + 0.22;
    K.rbox(M.carbon, hw * 1.9, 0.05, 0.36, 0, wy, wz, 0.02);
    K.rbox(M.accent, hw * 1.9, 0.03, 0.16, 0, wy + 0.08, wz - 0.18, 0.012);
    for (const s of [-1, 1]) {
      K.box(M.carbon, 0.02, 0.32, 0.55, s * hw * 0.95, wy + 0.02, wz - 0.05);
      K.strut(M.carbon, [s * hw * 0.42, deckY - 0.02, wz + 0.38], [s * hw * 0.42, wy + 0.02, wz + 0.05], 0.03);
    }
    K.rbox(M.carbon, 0.36, 0.12, 0.45, 0, Y(1.0) + 0.04, zAt(0.52), 0.04);
    for (const s of [-1, 1]) K.box(M.accent2, 0.08, 0.05, 0.03, s * hw * 0.5, gy + D.clear + 0.18, hl + 0.01);
    for (const s of [-1, 1]) K.cylX(M.chrome, 0.05, 0.12, s * hw * 1.0, gy + D.clear + 0.12, zAt(0.3), 12);
  } else if (L.style === 'hyper') {
    const wy = deckY + 0.32, wz = -hl + 0.28;
    K.box(M.trim, hw * 2.0, 0.05, 0.34, 0, wy, wz);
    for (const s of [-1, 1]) {
      K.box(M.trim, 0.05, wy - deckY + 0.05, 0.16, s * hw * 0.6, (wy + deckY) / 2, wz);
      K.box(M.black, 0.06, 0.26, 0.9, s * hw * 0.97, Y(0.45), zAt(0.35));
      K.box(M.trim, 0.04, 0.3, 0.5, s * hw * 1.03, Y(0.52), wz);
    }
    K.box(M.carbon, hw * 1.9, 0.03, 0.28, 0, gy + D.clear, hl - 0.08);
  } else if (L.style === 'rally') {
    K.box(M.trim, hw * 1.5, 0.04, 0.3, 0, Y(prof(st.roof, 0.05)) + 0.02, zAt(c0 + 0.02));
    for (let i = -1.5; i <= 1.5; i++) {
      const lamp = K.cylZ(M.head, 0.09, 0.07, i * 0.26, Y(prof(st.lower, 0.93)) + 0.1, zAt(0.93), 14);
      void lamp;
    }
    for (const s of [-1, 1]) K.box(M.black, 0.3, 0.26, 0.03, s * hw * 0.8, gy + D.clear + 0.05, -hl + 0.5);
    K.rbox(M.black, 0.4, 0.08, 0.3, 0, Y(1.0) + 0.02, zAt(0.5), 0.03);     // střešní větrák
  } else if (L.style === 'muscle') {
    K.rbox(M.black, 0.55, 0.13, 0.9, 0, Y(prof(st.lower, 0.8)) + 0.05, zAt(0.78), 0.04);
    K.rbox(M.chrome, hw * 1.8, 0.08, 0.1, 0, gy + D.clear + 0.12, hl - 0.02, 0.03);
    K.rbox(M.chrome, hw * 1.8, 0.08, 0.1, 0, gy + D.clear + 0.12, -hl + 0.02, 0.03);
    for (const s of [-1, 1]) K.cylZ(M.chrome, 0.05, 0.2, s * hw * 0.55, gy + D.clear + 0.05, -hl - 0.02, 12);
  } else if (L.style === 'hatch') {
    K.rbox(M.black, hw * 1.1, 0.03, 0.9, 0, Y(1.0) + 0.02, zAt(0.4), 0.015);   // střešní nosič
  }
  return { wheels: { type: L.style === 'rally' ? 'road' : 'road', rimMat: L.style === 'rally' ? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.4, roughness: 0.4 }) : null }, arches: true };
}

// ---------------------------------------------------------------- formule
function formulaBody(K) {
  const { D, M, gy, hl } = K;
  const y0 = gy + D.clear;
  // monokok od kokpitu po špičku nosu
  const nose = loft(t => {
    const z = -0.7 + t * (hl - 0.3 + 0.7);
    const w = 0.42 - t * 0.3, top = y0 + 0.62 - t * 0.33, bot = y0 + 0.12 + t * 0.06;
    return { z, w: t > 0.97 ? w * (1 - (t - 0.97) * 25) : w, yb: bot, yt: top };
  }, 30, 28, 3, 0.2);
  K.add(nose, M.paint);
  // kryt motoru se sáním nad hlavou pilota
  const eng = loft(t => {
    const z = -hl + 0.55 + t * (hl - 0.55 - 0.45);
    const air = Math.exp(-(((t - 0.96) / 0.1) ** 2));
    return { z, w: 0.18 + t * 0.26, yb: y0 + 0.12, yt: y0 + 0.42 + t * 0.2 + air * 0.28 };
  }, 30, 28, 3.2, 0.35);
  K.add(eng, M.paint);
  K.box(M.accent, 0.02, 0.3, 1.4, 0, y0 + 0.62, -hl + 1.45);             // žraločí ploutev
  K.ell(M.black, 0.1, 0.08, 0.06, 0, y0 + 0.9, -0.33);                   // sání
  // bočnice (sidepody)
  for (const s of [-1, 1]) {
    const pod = loft(t => {
      const z = -1.15 + t * 1.8, e = env(t, 3);
      return { z, w: 0.26 * Math.pow(e, 0.5) * (0.6 + 0.4 * t), yb: y0 + 0.14, yt: y0 + 0.3 + 0.25 * Math.pow(e, 0.4) * t };
    }, 20, 20, 3, 0.1);
    pod.translate(s * 0.58, 0, 0);
    K.add(pod, M.paint);
    K.ell(M.black, 0.2, 0.13, 0.03, s * 0.58, y0 + 0.4, 0.62);
    K.rbox(M.carbon, 0.04, 0.05, 0.12, s * 0.55, y0 + 0.62, 0.35, 0.015);  // zrcátko
    K.strut(M.carbon, [s * 0.52, y0 + 0.62, 0.35], [s * 0.4, y0 + 0.5, 0.3], 0.012);
  }
  // podlaha
  K.rbox(M.carbon, 1.5, 0.04, 2.9, 0, y0 + 0.08, -0.35, 0.015);
  // kokpit, pilot, halo
  K.ell(M.black, 0.26, 0.05, 0.42, 0, y0 + 0.6, 0.05);
  K.ell(M.accent2, 0.14, 0.14, 0.15, 0, y0 + 0.72, -0.08);                // helma
  K.ell(M.black, 0.1, 0.035, 0.05, 0, y0 + 0.74, 0.04);                   // hledí
  const halo = new THREE.TorusGeometry(0.3, 0.03, 8, 24, Math.PI);
  halo.rotateX(-Math.PI / 2); halo.rotateY(Math.PI / 2 + Math.PI / 2);
  K.add(halo, M.carbon, 0, y0 + 0.86, -0.02);
  K.strut(M.carbon, [0, y0 + 0.86, 0.3], [0, y0 + 0.6, 0.62], 0.03);
  for (const s of [-1, 1]) K.strut(M.carbon, [s * 0.3, y0 + 0.86, -0.02], [s * 0.3, y0 + 0.6, -0.12], 0.025);
  // přední křídlo
  const fz = hl - 0.3;
  K.rbox(M.carbon, 1.9, 0.035, 0.46, 0, y0 + 0.06, fz, 0.012);
  K.rbox(M.accent, 1.7, 0.03, 0.2, 0, y0 + 0.14, fz - 0.2, 0.01);
  for (const s of [-1, 1]) {
    K.box(M.accent, 0.025, 0.24, 0.55, s * 0.95, y0 + 0.14, fz - 0.05);
    K.strut(M.carbon, [s * 0.12, y0 + 0.08, fz + 0.05], [s * 0.08, y0 + 0.26, fz + 0.1], 0.02);
  }
  K.ell(M.accent2, 0.1, 0.07, 0.12, 0, y0 + 0.22, hl - 0.14);             // špička nosu
  // zadní křídlo
  const rz = -hl + 0.2, ry = y0 + 0.86;
  K.rbox(M.carbon, 1.05, 0.04, 0.36, 0, ry, rz, 0.012);
  K.rbox(M.accent, 1.05, 0.03, 0.18, 0, ry + 0.12, rz - 0.12, 0.01);
  for (const s of [-1, 1]) K.box(M.paint, 0.025, 0.55, 0.62, s * 0.54, ry - 0.08, rz + 0.02);
  K.strut(M.carbon, [0, y0 + 0.45, rz + 0.35], [0, ry, rz + 0.05], 0.03);
  K.rbox(M.carbon, 0.9, 0.18, 0.4, 0, y0 + 0.14, -hl + 0.3, 0.03);      // difuzor
  K.brakeLights.push(K.box(M.tail, 0.14, 0.06, 0.03, 0, y0 + 0.32, -hl + 0.1));
  // zavěšení (ramena ke kolům)
  const restY = D.mountY - (D.rest - D.sag);
  for (const [z, bx] of [[D.wbF, 0.2], [D.wbR, 0.3]]) for (const s of [-1, 1]) {
    const wx = s * (D.track - 0.12);
    K.strut(M.carbon, [s * bx, y0 + 0.2, z + 0.25], [wx, restY - 0.06, z], 0.018);
    K.strut(M.carbon, [s * bx, y0 + 0.2, z - 0.25], [wx, restY - 0.06, z], 0.018);
    K.strut(M.carbon, [s * bx, y0 + 0.42, z + 0.2], [wx, restY + 0.12, z], 0.018);
    K.strut(M.carbon, [s * bx, y0 + 0.42, z - 0.2], [wx, restY + 0.12, z], 0.018);
  }
  return { wheels: { type: 'formula', wFront: 0.36, wRear: 0.44, rimMat: M.carbon }, arches: false };
}

// ---------------------------------------------------------------- džíp
function jeepBody(K) {
  const { D, M, gy, hl, hw } = K;
  const y0 = gy + D.clear;
  const beltY = y0 + 0.78, hoodY = beltY - 0.02;
  const wz = hl - 1.55;                    // čelní sklo
  // vana karoserie a kapota
  K.rbox(M.paint, hw * 1.72, beltY - y0 - 0.05, D.len - 1.3, 0, (beltY + y0 + 0.05) / 2, -0.62, 0.08);
  K.rbox(M.paint, hw * 1.6, 0.5, 1.5, 0, hoodY - 0.23, hl - 0.8, 0.07);
  // maska se svislými průduchy a kulatými světly
  K.rbox(M.paint, hw * 1.62, 0.62, 0.12, 0, hoodY - 0.28, hl - 0.07, 0.03);
  for (let i = -3; i <= 3; i++) K.rbox(M.black, 0.07, 0.36, 0.04, i * 0.13, hoodY - 0.26, hl - 0.005, 0.02);
  for (const s of [-1, 1]) {
    K.cylZ(M.chrome, 0.13, 0.05, s * hw * 0.62, hoodY - 0.24, hl - 0.01, 22);
    K.cylZ(M.head, 0.105, 0.06, s * hw * 0.62, hoodY - 0.24, hl - 0.0, 22);
    K.ell(M.orange, 0.05, 0.03, 0.02, s * hw * 0.45, hoodY - 0.46, hl - 0.01);
  }
  // čelní sklo v rámu (sklopné jako u džípu)
  K.rbox(M.paint, hw * 1.6, 0.07, 0.07, 0, hoodY + 0.62, wz - 0.12, 0.02);
  for (const s of [-1, 1]) K.box(M.paint, 0.07, 0.64, 0.07, s * hw * 0.78, hoodY + 0.3, wz - 0.06);
  const ws = K.add(new THREE.PlaneGeometry(hw * 1.5, 0.56), M.glass, 0, hoodY + 0.31, wz - 0.07);
  ws.rotation.x = -0.12;
  // tvrdá střecha s okny
  const roofZ0 = wz - 0.15, roofZ1 = -hl + 0.1, rl = roofZ0 - roofZ1;
  K.rbox(M.accent, hw * 1.72, 0.08, rl, 0, gy + D.height - 0.04, (roofZ0 + roofZ1) / 2, 0.04);
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[roofZ0 - 0.05, roofZ0 - 1.0], [roofZ0 - 1.12, roofZ1 + 0.15]]) {
      const win = K.add(new THREE.PlaneGeometry(z0 - z1, 0.46), M.glass, s * hw * 0.865, beltY + 0.3, (z0 + z1) / 2);
      win.rotation.y = s * Math.PI / 2;
    }
    for (const z of [roofZ0 - 0.02, roofZ0 - 1.06, roofZ1 + 0.08]) K.box(M.accent, 0.08, gy + D.height - 0.06 - beltY, 0.08, s * hw * 0.83, (beltY + gy + D.height - 0.06) / 2, z);
  }
  K.box(M.accent, hw * 1.72, gy + D.height - 0.06 - beltY, 0.06, 0, (beltY + gy + D.height - 0.06) / 2, roofZ1 + 0.05);
  K.add(new THREE.PlaneGeometry(hw * 1.3, 0.42), M.glass, 0, beltY + 0.32, roofZ1 + 0.02).rotation.y = Math.PI;
  // blatníky (ploché, černé), nášlapy, nárazníky, spáry dveří
  for (const s of [-1, 1]) {
    for (const z of [D.wbF, D.wbR]) {
      K.rbox(M.black, 0.26, 0.06, D.wheelR * 2.4, s * (hw - 0.02), D.mountY - (D.rest - D.sag) + D.wheelR + 0.08, z, 0.025);
    }
    K.rbox(M.black, 0.18, 0.06, D.wbF - D.wbR - D.wheelR * 2.3, s * (hw - 0.06), y0 + 0.06, (D.wbF + D.wbR) / 2, 0.02);
    for (const z of [wz - 0.12, wz - 1.1, -hl + 0.62]) K.box(M.black, 0.01, beltY - y0 - 0.15, 0.015, s * hw * 0.865, (beltY + y0) / 2, z);
    K.box(M.chrome, 0.02, 0.03, 0.14, s * hw * 0.87, beltY - 0.12, wz - 0.95);
    K.box(M.black, 0.02, 0.03, 0.14, s * hw * 0.87, beltY - 0.1, wz - 0.25);
    K.brakeLights.push(K.box(M.tail, 0.06, 0.24, 0.1, s * hw * 0.82, beltY - 0.25, -hl + 0.02));
    K.rbox(M.black, 0.08, 0.1, 0.16, s * (hw * 0.8 + 0.12), hoodY + 0.4, wz - 0.1, 0.03);   // zrcátko
  }
  K.rbox(M.black, hw * 2.02, 0.2, 0.22, 0, y0 + 0.08, hl + 0.03, 0.04);
  K.rbox(M.black, hw * 1.9, 0.18, 0.2, 0, y0 + 0.06, -hl + 0.02, 0.04);
  for (const s of [-1, 1]) K.box(M.orange, 0.12, 0.05, 0.05, s * hw * 0.75, y0 + 0.08, hl + 0.14);
  K.cylX(M.steelRim, 0.08, 0.5, 0, y0 + 0.08, hl + 0.17, 14);             // naviják
  K.plate(hl + 0.145, y0 + 0.2, false);
  K.plate(-hl - 0.09, y0 + 0.22, true);
  // rezerva na zadních dveřích
  const spare = new THREE.Group();
  spare.add(new THREE.Mesh(tireGeometry(D.wheelR, 0.3, true), M.rubber));
  const disc = new THREE.CylinderGeometry(D.wheelR * 0.58, D.wheelR * 0.58, 0.3, 20); disc.rotateZ(Math.PI / 2);
  spare.add(new THREE.Mesh(disc, M.steelRim));
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0, beltY + 0.02, -hl - 0.2);
  K.root.add(spare);
  return { wheels: { type: 'offroad', wFront: 0.34, wRear: 0.34 }, arches: false };
}

export function buildCarModel(spec, opts = {}) {
  const D = carDims(spec), L = spec.look;
  const root = new THREE.Group();
  const K = makeKit(spec, D, root);
  const body = L.style === 'formula' ? formulaBody(K) : L.style === 'jeep' ? jeepBody(K) : loftBody(K);
  const wheels = makeWheels(K, body.wheels);
  if (body.arches) {
    const R = D.wheelR;
    const archG = new THREE.TorusGeometry(R + 0.07, 0.07, 6, 16, Math.PI); archG.rotateY(Math.PI / 2);
    for (const w of wheels) {
      const arch = K.add(archG, L.style === 'rally' ? K.M.black : K.M.paint, Math.sign(w.x) * (K.hw - 0.05), w.restY, w.z);
      arch.scale.set(1, 1, 1.05);
    }
  }
  const mats = Object.values(K.M).filter(Boolean);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = !opts.ghost; o.receiveShadow = !opts.ghost;
    if (opts.ghost) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.32; o.material.depthWrite = false; }
  });
  const brakeLights = K.brakeLights;
  // kola a pneumatiky se nemačkají
  const noDent = new Set();
  for (const w of wheels) w.steerG.traverse(o => { if (o.isMesh) noDent.add(o); });
  const headMat = K.M.head, tailMat = K.M.tail;
  let tailBroken = false;
  const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _p = new THREE.Vector3(), _c = new THREE.Vector3();

  let burnt = false;
  return {
    root, wheels,
    update(state) {
      for (let i = 0; i < 4; i++) {
        const w = wheels[i], s = state.wheels[i];
        w.steerG.position.y = D.mountY - (D.rest - s.comp);
        w.steerG.rotation.y = i < 2 ? state.steer : 0;
        w.spin.rotation.x = s.spin;
      }
      const b = state.braking > 0.1;
      for (const l of brakeLights) l.material.emissiveIntensity = tailBroken ? 0 : b ? 3.5 : 0.6;
    },
    // promáčknutí karoserie v místě nárazu (souřadnice auta): p = bod, dir = směr tlaku dovnitř
    dent(p, dir, depth, radius) {
      root.updateMatrixWorld(true);
      const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      root.traverse(o => {
        if (!o.isMesh || noDent.has(o)) return;
        _m.multiplyMatrices(rootInv, o.matrixWorld);          // mesh -> souřadnice auta
        const g = o.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        _c.copy(g.boundingSphere.center).applyMatrix4(_m);
        if (_c.distanceTo(p) > radius + g.boundingSphere.radius * 1.2) return;
        if (!o.userData.ownGeo) { o.geometry = g.clone(); o.userData.ownGeo = true; }
        const pos = o.geometry.attributes.position;
        _mi.copy(_m).invert();
        let moved = false;
        for (let i = 0; i < pos.count; i++) {
          _p.fromBufferAttribute(pos, i).applyMatrix4(_m);
          const d = _p.distanceTo(p);
          if (d >= radius) continue;
          const f = (1 - d / radius) ** 2 * (0.55 + 0.9 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1));   // pomačkání
          _p.addScaledVector(dir, depth * f).applyMatrix4(_mi);
          pos.setXYZ(i, _p.x, _p.y, _p.z);
          moved = true;
        }
        if (moved) { pos.needsUpdate = true; o.geometry.computeVertexNormals(); o.geometry.computeBoundingSphere(); }
      });
    },
    breakLights(zone) {
      if (zone === 'front') { headMat.emissiveIntensity = 0; headMat.color.setHex(0x333333); }
      if (zone === 'rear') { tailBroken = true; tailMat.emissiveIntensity = 0; }
    },
    setBurnt(v) {
      if (burnt === v) return; burnt = v;
      root.traverse(o => {
        if (!o.isMesh || !o.material.color) return;
        if (v) { o.userData.orig = o.material; o.material = new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.95, metalness: 0.1 }); }
        else if (o.userData.orig) { o.material.dispose(); o.material = o.userData.orig; }
      });
    },
    dispose() {
      root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      mats.forEach(m => { m.map?.dispose(); m.dispose(); });
    },
  };
}

// ---------------------------------------------------------------- kokpit (pohled z místa řidiče)
// Díly v souřadnicích auta (x = doleva, y = nahoru, z = dopředu). Silniční auta mají ručičkové budíky
// (rychlost, otáčky) a ukazatel stupně, závodní (GT3, rally, hypersport) digitální displej s LED diodami
// pro řazení a ochranný rám, formule displej přímo na volantu. update(stav) hýbe ručičkami a displeji.

// číselník: stupnice 270° (minimum vlevo dole, maximum vpravo dole), červené pole od redFrom
function dialTexture(max, major, minor, label, redFrom, div, chrome) {
  const S = 256, c = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = chrome ? '#d5d8de' : '#30333a'; g.beginPath(); g.arc(c, c, c - 1, 0, 7); g.fill();
  const bg = g.createRadialGradient(c, c * 0.8, 10, c, c, c);
  bg.addColorStop(0, '#1b1e24'); bg.addColorStop(1, '#07080a');
  g.fillStyle = bg; g.beginPath(); g.arc(c, c, c - 9, 0, 7); g.fill();
  const th = v => (135 - 270 * v / max) * Math.PI / 180;
  const pt = (v, r) => [c - Math.sin(th(v)) * r, c - Math.cos(th(v)) * r];
  // červené pole
  g.strokeStyle = '#e3281d'; g.lineWidth = 10;
  for (let v = redFrom; v < max; v += max / 200) { const [x0, y0] = pt(v, c - 24), [x1, y1] = pt(Math.min(max, v + max / 190), c - 24); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  // ryski a čísla
  g.lineCap = 'round';
  for (let v = 0; v <= max + 1e-6; v += minor) {
    const big = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const [x0, y0] = pt(v, c - 14), [x1, y1] = pt(v, c - (big ? 36 : 26));
    g.strokeStyle = v >= redFrom ? '#ff5a4a' : '#f2f2f2'; g.lineWidth = big ? 5 : 2.5;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    if (big) {
      const [tx, ty] = pt(v, c - 60);
      g.fillStyle = v >= redFrom ? '#ff6a5a' : '#ffffff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(Math.round(v / div)), tx, ty);
    }
  }
  g.fillStyle = '#9aa3ad'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.fillText(label, c, c + 62);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// povrch z uhlíkových vláken (závodní auta)
let _carbon = null;
function carbonTexture() {
  if (_carbon) return _carbon;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = (x + y) % 2;
    const gr = on ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
    gr.addColorStop(0, '#151619'); gr.addColorStop(0.5, on ? '#34373d' : '#2a2c31'); gr.addColorStop(1, '#151619');
    g.fillStyle = gr; g.fillRect(x * 8, y * 8, 8, 8);
  }
  _carbon = new THREE.CanvasTexture(cv); _carbon.wrapS = _carbon.wrapT = THREE.RepeatWrapping; _carbon.repeat.set(14, 7);
  _carbon.colorSpace = THREE.SRGBColorSpace; _carbon.userData.shared = true;
  return _carbon;
}

export function buildCockpit(spec) {
  const D = carDims(spec), L = spec.look, open = L.style === 'formula';
  const race = ['gt3', 'rally', 'hyper'].includes(L.style), cage = L.style === 'gt3' || L.style === 'rally';
  const redline = spec.redline || 8000;
  const top = D.groundY + D.height;
  const eyeY = open ? D.groundY + 0.95 : top - 0.25, eyeZ = open ? -0.45 : -0.35, eyeX = open ? 0 : Math.min(0.38, D.hw - 0.55);
  const dashY = eyeY - 0.34, dashZ = eyeZ + 0.8;
  const g = new THREE.Group(), mats = [], texs = [];
  const mat = (o, phys) => { const m = phys ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // materiály podle typu auta
  const dashCol = { hatch: 0x3a3d43, jeep: 0x2b2e26, muscle: 0x221a14 }[L.style] ?? 0x15171b;
  const dark = mat({ color: dashCol, roughness: 0.82 }), trim = mat({ color: 0x2a2d33, roughness: 0.55, metalness: 0.2 });
  const soft = race ? mat({ color: 0xffffff, map: carbonTexture(), roughness: 0.35, metalness: 0.3 }) : mat({ color: dashCol, roughness: 0.95 });
  const paint = mat({ color: L.base, metalness: 0.35, roughness: 0.34, clearcoat: 1 }, true);
  const hoodPaint = mat({ color: L.base, metalness: 0.2, roughness: 0.55 });   // kapota bez lesku – při pohledu šikmo neodráží bílou oblohu
  const accent = mat({ color: L.accent2 ?? 0xff7a2a, roughness: 0.4, emissive: L.accent2 ?? 0xff7a2a, emissiveIntensity: 0.08 });
  const chrome = mat({ color: 0xe8ebef, metalness: 1, roughness: 0.18 });
  const wood = mat({ color: 0x6a3b1c, roughness: 0.35, clearcoat: 0.8 }, true);
  const glove = mat({ color: 0x1c1d22, roughness: 0.75 }), cuff = mat({ color: L.accent2 ?? 0xd81f26, roughness: 0.6 });
  const cageM = mat({ color: L.style === 'rally' ? 0x2f58b8 : 0xb9bec6, roughness: 0.35, metalness: 0.6 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); parent.add(me); return me; };
  const box = (m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz, parent);
  const rbox = (m, w, h, d, r, x, y, z, rx = 0, parent = g) => add(new RoundedBoxGeometry(w, h, d, 3, r), m, x, y, z, rx, 0, 0, parent);
  const bar = (m, a, b, r, parent = g) => {   // válec mezi dvěma body
    const len = a.distanceTo(b), me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    parent.add(me); return me;
  };
  // plocha natočená k řidiči (dívá se k −z), textura se čte zleva doprava z pohledu řidiče
  const face = (w, h, m, x, y, z, tilt = 0, parent = g) => { const me = add(new THREE.PlaneGeometry(w, h), m, x, y, z, tilt, Math.PI, 0, parent); return me; };
  const canvasMat = (w, h) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; texs.push(tex);
    const m = mat({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, roughness: 0.3 });
    return { cv, ctx: cv.getContext('2d'), tex, m };
  };

  const needles = [];   // {pivot, max, get}
  const dial = (r, x, y, z, max, major, minor, label, redFrom, div, get) => {
    const tex = dialTexture(max, major, minor, label, redFrom, div, L.style === 'muscle'); texs.push(tex);
    const fm = mat({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.4 });
    const f = add(new THREE.CircleGeometry(r, 40), fm, x, y, z, 0, Math.PI, 0);
    const pivot = new THREE.Group(); pivot.position.z = 0.003; f.add(pivot);
    const nm = mat({ color: 0xff3b1f, emissive: 0xff3b1f, emissiveIntensity: 1.1 });
    const n = new THREE.Mesh(new THREE.BoxGeometry(r * 0.07, r * 0.86, 0.002).translate(0, r * 0.3, 0), nm); pivot.add(n);
    add(new THREE.CircleGeometry(r * 0.12, 16), trim, 0, 0, 0.005, 0, 0, 0, f);
    // lem a stínítko
    const ring = add(new THREE.TorusGeometry(r + 0.004, 0.006, 6, 40), L.style === 'muscle' ? chrome : trim, 0, 0, -0.002, 0, 0, 0, f);
    ring.castShadow = false;
    needles.push({ pivot, max, get });
    return f;
  };

  if (!open) {
    // --- palubní deska: hlavní díl, horní polstrování, stínítko přístrojů, středová konzole, výdechy
    const W = 2 * (D.hw - 0.1);
    rbox(soft, W, 0.24, 0.56, 0.04, 0, dashY - 0.09, dashZ + 0.02);
    rbox(dark, W - 0.04, 0.06, 0.3, 0.025, 0, dashY + 0.04, dashZ + 0.12);
    box(accent, W - 0.1, 0.012, 0.012, 0, dashY - 0.02, dashZ - 0.26);                      // barevná linka přes desku
    if (L.style === 'muscle') box(wood, W - 0.12, 0.05, 0.01, 0, dashY - 0.08, dashZ - 0.265);   // dřevěný obklad
    // stínítko přístrojů (půlválec nad budíky)
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 20, 1, true, -Math.PI / 2, Math.PI), mat({ color: dashCol, roughness: 0.9, side: THREE.DoubleSide }));
    cowl.rotation.set(-Math.PI / 2, 0, 0); cowl.scale.set(1.05, 1, 0.45); cowl.position.set(eyeX, dashY + 0.105, dashZ - 0.2);
    g.add(cowl);
    // středová konzole s displejem a řadicí pákou
    rbox(dark, 0.26, 0.34, 0.18, 0.03, eyeX - 0.4 * Math.sign(eyeX || 1), dashY - 0.28, dashZ - 0.18, 0.35);
    const cx = eyeX - 0.4 * Math.sign(eyeX || 1);
    const scr = canvasMat(128, 80);
    { const c = scr.ctx, gr = c.createLinearGradient(0, 0, 0, 80); gr.addColorStop(0, '#0d2a4a'); gr.addColorStop(1, '#06121f'); c.fillStyle = gr; c.fillRect(0, 0, 128, 80);
      c.strokeStyle = '#39c7ff'; c.lineWidth = 3; c.beginPath(); c.moveTo(10, 62); c.bezierCurveTo(40, 20, 70, 70, 118, 18); c.stroke();
      c.fillStyle = '#39c7ff'; c.font = 'bold 14px Arial'; c.fillText('STUNTS', 10, 18); scr.tex.needsUpdate = true; }
    scr.m.emissiveIntensity = 0.7;
    face(0.16, 0.1, scr.m, cx, dashY - 0.1, dashZ - 0.285, -0.2);
    for (const s of [-1, 1]) box(trim, 0.07, 0.035, 0.02, cx + s * 0.06, dashY - 0.02, dashZ - 0.28);                       // výdechy
    for (const s of [-1, 1]) box(trim, 0.08, 0.04, 0.02, s * (D.hw - 0.2), dashY - 0.02, dashZ - 0.27);
    const lever = V(cx, dashY - 0.34, dashZ - 0.45);
    bar(chrome, lever, lever.clone().add(V(0, 0.16, -0.03)), 0.008);
    add(new THREE.SphereGeometry(0.03, 14, 10), race ? accent : dark, cx, dashY - 0.18, dashZ - 0.48);

    // --- přístroje
    if (race) {
      // digitální displej: velký stupeň, rychlost, pruh otáček; nad ním LED diody pro řazení
      const disp = canvasMat(256, 112);
      disp.m.emissiveIntensity = 1;
      face(0.24, 0.105, disp.m, eyeX, dashY + 0.1, dashZ - 0.26, -0.15);
      g.userData.disp = disp;
    } else {
      dial(0.062, eyeX + 0.075, dashY + 0.095, dashZ - 0.255, 280, 40, 10, 'km/h', 400, 1, s => s.kmh);
      const rmax = Math.ceil(redline / 1000 + 1) * 1000;
      dial(0.062, eyeX - 0.075, dashY + 0.095, dashZ - 0.255, rmax, 1000, 500, '×1000 ot/min', redline, 1000, s => s.rpm);
      const gear = canvasMat(64, 64); gear.m.emissiveIntensity = 1;
      face(0.03, 0.03, gear.m, eyeX, dashY + 0.055, dashZ - 0.25);
      g.userData.gear = gear;
    }
    const lights = [];
    for (let i = 0; i < 10; i++) {
      if (!race) break;
      const m = mat({ color: 0x111111, emissive: i < 4 ? 0x2cff4a : i < 8 ? 0xffc21a : 0xff2a1a, emissiveIntensity: 0 });
      add(new THREE.CircleGeometry(0.0075, 12), m, eyeX + (4.5 - i) * 0.021, dashY + 0.165, dashZ - 0.25, -0.15, Math.PI, 0);
      lights.push(m);
    }
    g.userData.leds = lights;
    // kontrolka poškození
    const warn = mat({ color: 0x111111, emissive: 0xff7a1a, emissiveIntensity: 0 });
    add(new THREE.CircleGeometry(0.008, 12), warn, eyeX + 0.14, dashY + 0.02, dashZ - 0.25, 0, Math.PI, 0);
    g.userData.warn = warn;

    // --- kapota v barvě laku, stěrače, čelní sklo
    const hl = D.hl - dashZ - 0.25;
    add(new THREE.PlaneGeometry(2 * (D.hw - 0.12), hl), hoodPaint, 0, dashY - 0.01, dashZ + 0.25 + hl / 2, -Math.PI / 2 + 0.05);
    for (const s of [-1, 1]) bar(dark, V(s * 0.05 + 0.02, dashY + 0.005, dashZ + 0.3), V(s * 0.05 + 0.02 - s * 0.55 * 0.8, dashY + 0.07, dashZ + 0.28), 0.007);
    const glass = mat({ color: 0x9fc4d8, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const gA = V(0, dashY + 0.01, dashZ + 0.28), gB = V(0, top - 0.07, eyeZ + 0.16);
    const glen = gA.distanceTo(gB);
    const ws = add(new THREE.PlaneGeometry(2 * (D.hw - 0.2), glen), glass, 0, (gA.y + gB.y) / 2, (gA.z + gB.z) / 2);
    ws.lookAt(ws.position.clone().add(V(0, gB.z - gA.z, -(gB.y - gA.y)))); ws.renderOrder = 3;   // rovina skla od desky ke střeše
    const band = mat({ color: 0x0b1a2a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });   // tónovaný pruh nahoře
    const bd = add(new THREE.PlaneGeometry(2 * (D.hw - 0.2), 0.09), band, 0, gB.y - 0.04, gB.z + 0.03);
    bd.quaternion.copy(ws.quaternion);

    // --- sloupky, střecha, dveře, zrcátka
    for (const s of [-1, 1]) {
      bar(trim, V(s * (D.hw - 0.1), dashY, dashZ + 0.2), V(s * (D.hw - 0.2), top - 0.06, eyeZ + 0.15), 0.05);          // sloupek A
      bar(trim, V(s * (D.hw - 0.09), dashY - 0.05, eyeZ - 0.55), V(s * (D.hw - 0.15), top - 0.06, eyeZ - 0.5), 0.08);  // sloupek B
      // dveřní panel s loketní opěrkou a klikou
      rbox(soft, 0.06, 0.26, 1.2, 0.02, s * (D.hw - 0.07), dashY - 0.17, eyeZ + 0.05);
      box(dark, 0.08, 0.05, 0.5, s * (D.hw - 0.1), dashY - 0.06, eyeZ - 0.05);
      box(accent, 0.01, 0.012, 1.0, s * (D.hw - 0.035), dashY - 0.01, eyeZ + 0.05);
      box(chrome, 0.015, 0.02, 0.07, s * (D.hw - 0.11), dashY - 0.1, eyeZ + 0.28);
      // vnější zrcátko: kryt v barvě laku a zrcadlová plocha (obloha nahoře, silnice dole)
      const mx = s * (D.hw + 0.07), my = dashY + 0.06, mz = dashZ + 0.12;
      rbox(paint, 0.17, 0.1, 0.07, 0.02, mx, my, mz + 0.03);
      bar(paint, V(s * (D.hw - 0.02), my - 0.03, mz + 0.03), V(mx - s * 0.05, my - 0.02, mz + 0.03), 0.012);
      const mirror = canvasMat(32, 32);
      { const c = mirror.ctx, gr = c.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#bcd6f0'); gr.addColorStop(0.55, '#e9f2fb'); gr.addColorStop(0.56, '#5d6a52'); gr.addColorStop(1, '#3c3f45'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); mirror.tex.needsUpdate = true; }
      mirror.m.emissiveIntensity = 0.55; mirror.m.metalness = 0.6;
      face(0.15, 0.08, mirror.m, mx, my, mz - 0.006, 0, g).rotation.y = Math.PI + s * 0.35;
    }
    rbox(dark, 2 * (D.hw - 0.15), 0.05, 1.1, 0.02, 0, top - 0.05, eyeZ - 0.4);                // střecha (čalounění)
    box(trim, 2 * (D.hw - 0.15), 0.06, 0.08, 0, top - 0.08, eyeZ + 0.15);                     // horní rám okna
    for (const s of [-1, 1]) box(dark, 0.3, 0.012, 0.16, s * 0.35, top - 0.09, eyeZ + 0.06, 0.1);   // clony proti slunci
    // vnitřní zpětné zrcátko
    rbox(dark, 0.26, 0.07, 0.03, 0.012, 0, top - 0.15, eyeZ + 0.19);
    const rm = canvasMat(64, 16);
    { const c = rm.ctx, gr = c.createLinearGradient(0, 0, 0, 16); gr.addColorStop(0, '#9fb9d2'); gr.addColorStop(0.6, '#dfe9f3'); gr.addColorStop(0.62, '#565c50'); gr.addColorStop(1, '#2e3136'); c.fillStyle = gr; c.fillRect(0, 0, 64, 16); rm.tex.needsUpdate = true; }
    rm.m.emissiveIntensity = 0.5;
    face(0.24, 0.055, rm.m, 0, top - 0.15, eyeZ + 0.174);

    // --- ochranný rám (GT3, rally)
    if (cage) {
      const hw = D.hw - 0.2;
      for (const s of [-1, 1]) {
        bar(cageM, V(s * hw, dashY - 0.3, dashZ + 0.05), V(s * (hw - 0.05), top - 0.1, eyeZ + 0.12), 0.022);   // podél sloupku A
        bar(cageM, V(s * (hw - 0.05), top - 0.1, eyeZ + 0.12), V(s * (hw - 0.05), top - 0.1, eyeZ - 0.6), 0.022);
        bar(cageM, V(s * hw, dashY - 0.1, eyeZ - 0.55), V(s * hw, dashY - 0.12, dashZ - 0.05), 0.02);          // dveřní výztuha
      }
      bar(cageM, V(hw - 0.05, top - 0.1, eyeZ + 0.12), V(-(hw - 0.05), top - 0.1, eyeZ + 0.12), 0.022);
    }
  } else {
    // --- formule: otevřený kokpit, bočnice, úzká příď, halo
    rbox(soft, 0.66, 0.2, 0.5, 0.05, 0, dashY - 0.05, dashZ);
    const nl = D.hl - dashZ - 0.2;
    add(new THREE.PlaneGeometry(0.55, nl), hoodPaint, 0, dashY - 0.1, dashZ + nl / 2, -Math.PI / 2 + 0.12);
    for (const s of [-1, 1]) {
      rbox(paint, 0.35, 0.3, 1.6, 0.06, s * 0.55, dashY - 0.14, eyeZ - 0.2);
      rbox(soft, 0.06, 0.08, 1.0, 0.02, s * 0.36, dashY + 0.01, eyeZ - 0.1);                   // polstrování okraje
      // zrcátka na bočnicích
      bar(dark, V(s * 0.45, dashY + 0.02, dashZ - 0.1), V(s * 0.5, dashY + 0.12, dashZ - 0.08), 0.01);
      rbox(paint, 0.14, 0.07, 0.05, 0.015, s * 0.52, dashY + 0.14, dashZ - 0.08);
    }
    const halo = new THREE.CatmullRomCurve3([V(0.38, eyeY - 0.14, eyeZ - 0.25), V(0.34, eyeY + 0.14, eyeZ + 0.1), V(0, eyeY + 0.17, eyeZ + 0.62), V(-0.34, eyeY + 0.14, eyeZ + 0.1), V(-0.38, eyeY - 0.14, eyeZ - 0.25)]);
    add(new THREE.TubeGeometry(halo, 40, 0.034, 10), soft, 0, 0, 0);
    bar(dark, V(0, eyeY + 0.17, eyeZ + 0.62), V(0, dashY + 0.02, dashZ + 0.35), 0.022);
    const warn = mat({ color: 0x111111, emissive: 0xff7a1a, emissiveIntensity: 0 }); g.userData.warn = warn;
    add(new THREE.CircleGeometry(0.01, 12), warn, 0.12, dashY + 0.06, dashZ - 0.251, 0, Math.PI, 0);
  }

  // --- volant: náklon k řidiči, uvnitř otočná část (věnec, ramena, rukavice, pádla, u formule displej)
  const wheelTilt = new THREE.Group();
  wheelTilt.position.set(eyeX, dashY - (open ? 0.03 : 0.085), dashZ - 0.33); wheelTilt.rotation.x = 0.4;
  bar(trim, V(0, 0, 0.02), V(0, 0, 0.18), 0.03, wheelTilt);                                    // sloupek řízení
  const spin = new THREE.Group();
  const R = open ? 0.13 : race ? 0.165 : 0.18;
  if (open) {
    // formule: plochý volant s rukojeťmi, displejem a LED diodami
    rbox(soft, 0.27, 0.12, 0.04, 0.02, 0, 0, 0, 0, spin);
    for (const s of [-1, 1]) rbox(glove, 0.045, 0.16, 0.05, 0.02, s * 0.14, -0.01, 0, 0, spin);
    const disp = canvasMat(256, 112); disp.m.emissiveIntensity = 1;
    face(0.11, 0.048, disp.m, 0, 0.01, -0.021, 0, spin);
    g.userData.disp = disp;
    const lights = [];
    for (let i = 0; i < 10; i++) {
      const m = mat({ color: 0x111111, emissive: i < 4 ? 0x2cff4a : i < 8 ? 0xff2a1a : 0x3a7bff, emissiveIntensity: 0 });
      add(new THREE.CircleGeometry(0.0065, 10), m, (4.5 - i) * 0.019, 0.045, -0.021, 0, Math.PI, 0, spin);
      lights.push(m);
    }
    g.userData.leds = lights;
    for (const [i, c] of [0xff3030, 0x30a0ff, 0xffd21f, 0x30ff70].entries()) {                 // barevná tlačítka
      const m = mat({ color: c, roughness: 0.4, emissive: c, emissiveIntensity: 0.25 });
      add(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 10), m, (i < 2 ? -1 : 1) * 0.085, (i % 2 ? -0.03 : 0.025), -0.022, Math.PI / 2, 0, 0, spin);
    }
  } else {
    // věnec (tlustší u závodních aut), značka na vrcholu, 3 ramena, střed s logem
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, race ? 0.024 : 0.02, 10, 40), race ? mat({ color: 0x2a2b30, roughness: 0.95 }) : dark));
    if (L.style === 'muscle') spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.021, 8, 40, Math.PI * 0.5).rotateZ(Math.PI * 0.25), wood));
    const mark = box(race ? accent : trim, 0.02, 0.03, 0.05, 0, R, 0, 0, 0, 0, spin);
    mark.scale.z = 0.6;
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const sp = box(trim, 0.03, R - 0.03, 0.018, Math.cos(a) * (R / 2), Math.sin(a) * (R / 2), 0, 0, 0, a - Math.PI / 2, spin);
      sp.userData.spoke = true;
    }
    const hub = add(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 20), trim, 0, 0, 0, Math.PI / 2, 0, 0, spin);
    hub.castShadow = false;
    add(new THREE.CircleGeometry(0.022, 20), race ? accent : chrome, 0, 0, -0.021, 0, Math.PI, 0, spin);
    if (race) for (const s of [-1, 1]) box(soft, 0.04, 0.08, 0.008, s * 0.1, 0.03, 0.035, 0, 0, 0, spin);   // pádla řazení
  }
  // rukavice na věnci (v 9 a ve 3 hodiny) s manžetou
  for (const s of [-1, 1]) {
    const hand = new THREE.Group(); hand.position.set(s * (open ? 0.14 : R), open ? -0.005 : 0, -0.012); spin.add(hand);
    add(new THREE.CapsuleGeometry(0.03, 0.05, 4, 10), glove, 0, 0, 0, 0, 0, 0, hand).scale.set(1, 1, 0.8);
    add(new THREE.SphereGeometry(0.018, 10, 8), glove, -s * 0.02, 0.025, -0.022, 0, 0, 0, hand);   // palec
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12), cuff, s * 0.012, -0.045, -0.035, 0.9, 0, 0, hand);
  }
  wheelTilt.add(spin); g.add(wheelTilt);
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });

  // --- živé přístroje
  const leds = g.userData.leds || [], disp = g.userData.disp, gearD = g.userData.gear, warn = g.userData.warn;
  let last = '';
  const gearTxt = gr => (gr === 0 ? 'R' : String(gr));
  return {
    group: g, spin, open, eye: new THREE.Vector3(eyeX, eyeY, eyeZ),
    // s = { kmh, rpm, gear, damage }
    update(s) {
      for (const n of needles) n.pivot.rotation.z = (135 - 270 * Math.min(1.02, Math.max(0, n.get(s) / n.max))) * Math.PI / 180;
      const r01 = Math.max(0, Math.min(1, (s.rpm - redline * 0.55) / (redline * 0.43)));
      const lit = Math.round(r01 * leds.length), blink = s.rpm > redline * 0.97 && (performance.now() / 90 | 0) % 2;
      leds.forEach((m, i) => { m.emissiveIntensity = blink ? 2.2 : i < lit ? 1.8 : 0.05; });
      if (warn) warn.emissiveIntensity = s.damage > 60 ? ((performance.now() / 300 | 0) % 2 ? 2 : 0.3) : s.damage > 25 ? 1.2 : 0;
      const key = `${Math.round(s.kmh)}|${s.gear}|${Math.round(s.rpm / 100)}`;
      if (key === last) return;
      last = key;
      if (gearD) {
        const c = gearD.ctx; c.fillStyle = '#050607'; c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#ffb02a'; c.font = 'bold 50px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(gearTxt(s.gear), 32, 35);
        gearD.tex.needsUpdate = true;
      }
      if (disp) {
        const c = disp.ctx; c.fillStyle = '#040506'; c.fillRect(0, 0, 256, 112);
        // pruh otáček
        const w = 236 * Math.min(1, s.rpm / redline);
        const gr = c.createLinearGradient(10, 0, 246, 0); gr.addColorStop(0, '#2cff4a'); gr.addColorStop(0.7, '#ffc21a'); gr.addColorStop(1, '#ff2a1a');
        c.fillStyle = '#1b1d21'; c.fillRect(10, 8, 236, 16); c.fillStyle = gr; c.fillRect(10, 8, w, 16);
        c.textBaseline = 'middle';
        c.fillStyle = '#ffffff'; c.font = 'bold 72px Arial'; c.textAlign = 'center'; c.fillText(gearTxt(s.gear), 128, 72);
        c.font = 'bold 34px Arial'; c.textAlign = 'right'; c.fillStyle = '#39c7ff'; c.fillText(String(Math.round(s.kmh)), 84, 64);
        c.font = 'bold 14px Arial'; c.fillStyle = '#8a939c'; c.fillText('KM/H', 84, 92);
        c.textAlign = 'left'; c.font = 'bold 28px Arial'; c.fillStyle = s.rpm > redline * 0.9 ? '#ff4a3a' : '#e6e6e6'; c.fillText(String(Math.round(s.rpm / 100) * 100), 172, 64);
        c.font = 'bold 14px Arial'; c.fillStyle = '#8a939c'; c.fillText('OT/MIN', 172, 92);
        disp.tex.needsUpdate = true;
      }
    },
    dispose() {
      g.traverse(o => o.geometry?.dispose());
      mats.forEach(m => m.dispose());
      texs.forEach(t => t.dispose());
    },
  };
}

// ---------------------------------------------------------------- náhledy aut (vlastní malý renderer)
let TH = null;
export function carThumbnail(spec, w = 360, h = 200) {
  if (!TH) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(w, h); r.setPixelRatio(1.5);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3226, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 6, 5); scene.add(sun);
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const g = sc.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    TH = { r, scene, shadow, cam: new THREE.PerspectiveCamera(30, w / h, 0.1, 100) };
  }
  const D = carDims(spec);
  const m = buildCarModel(spec);
  m.update({ steer: 0.25, wheels: [0, 1, 2, 3].map(() => ({ comp: D.sag, spin: 0.3 })), braking: 0 });
  TH.scene.add(m.root);
  TH.shadow.position.y = D.groundY + 0.01; TH.shadow.scale.set(D.width * 1.9, D.len * 1.35, 1);
  const dist = D.len * 1.22 + 1.3;
  TH.cam.position.set(dist * 0.72, D.groundY + dist * 0.32, dist * 0.7);
  TH.cam.lookAt(0, D.groundY + D.height * 0.45, 0);
  TH.r.render(TH.scene, TH.cam);
  const url = TH.r.domElement.toDataURL('image/png');
  TH.scene.remove(m.root);
  m.dispose();
  return url;
}
