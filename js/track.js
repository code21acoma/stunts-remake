// Trať ve scéně: meshe dlaždic, kolizní geometrie s BVH a raycasty pro fyziku.
import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { T, H, GRID, PIECES, DELTA, LOOPS, PENDULUM, WIND, OIL, TRAMPOLINE, CRUSHER, SPINNER, HAMMER, TRAIN, BOLLARDS, crusherX, spinnerYaw, hammerY, trainX, trainWarn, bollardH, hazardPhase, buildCellMap, analyze, key, tileCells, tilePorts, wallMask } from './defs.js';

// tunelové dílky – na sebe navazující tunely nemají mezi sebou portál
const TUNNELS = { tunnel: 1, tunnelCurve: 1, tunnelBig: 1, tunnelBridge: 1, tunnelPortal: 1 };
import { buildPiece, finalizePiece, PATHS, pathOf, frame, ROAD_LIFT, CONES, BOOST_PAD, CRATES, CRATE } from './pieces.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const HALF_MAP = GRID * T / 2;
export const cellCenter = (x, y) => new THREE.Vector3((x - GRID / 2 + 0.5) * T, 0, (y - GRID / 2 + 0.5) * T);
export const worldToCell = (px, pz) => [Math.floor(px / T + GRID / 2), Math.floor(pz / T + GRID / 2)];

const colMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const _ray = new THREE.Raycaster(); _ray.firstHitOnly = true;
const _hits = [];

// kužel slalomu (sdílená geometrie; při likvidaci dílku se nemaže)
const coneGeo = (() => {
  const g = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0.8), new THREE.Vector2(0.07, 0.8), new THREE.Vector2(0.3, 0.06), new THREE.Vector2(0.36, 0.06), new THREE.Vector2(0.36, 0), new THREE.Vector2(0.001, 0)], 16);
  return g;
})();
const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.55 });
const coneBandGeo = new THREE.CylinderGeometry(0.155, 0.2, 0.14, 16, 1, true).translate(0, 0.5, 0);
const coneBandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide });
const _cl = new THREE.Vector3(), _cq = new THREE.Quaternion(), _hd = new THREE.Vector3(), _hv = new THREE.Vector3();
// bedna, demoliční koule, lopatky ventilátoru (sdílené geometrie)
const crateGeo = new THREE.BoxGeometry(CRATE, CRATE, CRATE);
const chainGeo = new THREE.CylinderGeometry(0.1, 0.1, PENDULUM.len - PENDULUM.r, 6).translate(0, -(PENDULUM.len - PENDULUM.r) / 2, 0);
const ballGeo = new THREE.SphereGeometry(PENDULUM.r, 24, 16);
const ballMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.35, metalness: 0.8 });
const stripeGeo = new THREE.TorusGeometry(PENDULUM.r * 1.01, 0.12, 8, 32);
const bladeGeo = new THREE.BoxGeometry(0.12, 2.3, 0.75).translate(0, 1.3, 0).rotateY(0.35);
const capGeo = new THREE.SphereGeometry(0.45, 12, 8);
const _hf = new THREE.Vector3(), _hs = new THREE.Vector3(), _hn = new THREE.Vector3(), _hv2 = new THREE.Vector3(), _hw = new THREE.Vector3();
// pohyblivé pasti: sdílené geometrie a materiály (lokální souřadnice dílku)
const TRAPS = { crusher: 1, spinner: 1, hammer: 1, railroad: 1, bollards: 1 };
const G = {
  crusher: new THREE.BoxGeometry(2 * CRUSHER.hx, 2 * CRUSHER.hy, 2 * CRUSHER.hz),
  crusherFace: new THREE.BoxGeometry(0.06, 2 * CRUSHER.hy * 0.9, 2 * CRUSHER.hz * 0.9),
  spinnerArm: new THREE.BoxGeometry(2 * SPINNER.arm, 2 * SPINNER.hy, 2 * SPINNER.hz),
  spinnerTip: new THREE.BoxGeometry(0.5, 2 * SPINNER.hy + 0.2, 2 * SPINNER.hz + 0.2),
  hammer: new THREE.BoxGeometry(2 * HAMMER.h, 2 * HAMMER.hy, 2 * HAMMER.h),
  hammerBand: new THREE.BoxGeometry(2 * HAMMER.h + 0.04, 0.4, 2 * HAMMER.h + 0.04),
  rod: new THREE.CylinderGeometry(0.28, 0.28, 1, 12),
  loco: new THREE.BoxGeometry(TRAIN.car, 2 * TRAIN.hy, 2 * TRAIN.hz),
  wagon: new THREE.BoxGeometry(TRAIN.car, 2 * TRAIN.hy, 2 * TRAIN.hz),
  trainRoof: new THREE.BoxGeometry(TRAIN.car + 0.1, 0.25, 2 * TRAIN.hz - 0.3),
  trainWin: new THREE.BoxGeometry(TRAIN.car - 1.6, 0.8, 0.04),
  bogie: new THREE.BoxGeometry(2.2, 0.5, 0.3),
  headlight: new THREE.CircleGeometry(0.35, 12).rotateY(Math.PI / 2),
  boom: new THREE.BoxGeometry(5.8, 0.16, 0.16),
  boomPost: new THREE.BoxGeometry(0.35, 1.1, 0.35),
  lamp: new THREE.CircleGeometry(0.17, 14),
  bollard: new THREE.CylinderGeometry(BOLLARDS.r, BOLLARDS.r, BOLLARDS.h, 14),
  bollardTop: new THREE.CylinderGeometry(BOLLARDS.r * 0.8, BOLLARDS.r * 0.8, 0.06, 12),
};
const TM = {
  loco: new THREE.MeshStandardMaterial({ color: 0xc8261c, roughness: 0.45, metalness: 0.3 }),
  wagon: new THREE.MeshStandardMaterial({ color: 0x2f6fb8, roughness: 0.5, metalness: 0.2 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.15, metalness: 0.5 }),
};

export class Track {
  constructor(data, M) {
    this.data = data;
    this.tiles = data.tiles;
    this.M = M;
    this.group = new THREE.Group();
    this.meta = new Map();
    this._pp = new WeakMap();   // body středových křivek dílků (onTilePath)
    this.cones = [];
    this.hazards = [];          // demoliční koule, ventilátory
    this._hitT = new WeakMap();  // poslední náraz koule do auta
    this.time = 0;
    this.cellMap = buildCellMap(this.tiles);
    for (const t of this.tiles) this.addTile(t, false);
    this.refresh();
  }

  addTile(t, refresh = true) {
    if (refresh) { this.tiles.includes(t) || this.tiles.push(t); this.refresh(); }
    this.buildTile(t);
    if (refresh) this.rebuildAround(t);
  }

  // sousední zdi / tunely se po přidání či odebrání dílku napojí znovu (zdi se spojí, mezi tunely zmizí portál)
  rebuildAround(t) {
    const kind = t.type === 'wall' ? 'wall' : TUNNELS[t.type] ? 'tunnel' : null;
    if (!kind) return;
    const done = new Set();
    for (const [x, y] of tileCells(t)) for (const [dx, dy] of DELTA) {
      const n = this.cellMap.get(key(x + dx, y + dy));
      if (!n || n === t || done.has(n) || !this.meta.has(n)) continue;
      if (kind === 'wall' ? n.type !== 'wall' : !TUNNELS[n.type]) continue;
      done.add(n); this.disposeTile(n); this.buildTile(n);
    }
  }

  // [portál na začátku, portál na konci]: portál chybí tam, kde na konec navazuje další tunel
  tunnelEnds(t) {
    const ps = tilePorts(t);
    return [0, 1].map(k => {
      const p = ps[k], [dx, dy] = DELTA[p.s];
      const n = this.cellMap.get(key(p.x + dx, p.y + dy));
      if (!n || n === t || !TUNNELS[n.type]) return true;
      // portál navazuje na tunel jen svou jižní (tunelovou) stranou, otevřená strana potřebuje čelo sousedního tunelu
      if (n.type === 'tunnelPortal') { const q = tilePorts(n)[1], [ex, ey] = DELTA[q.s]; return !(q.x + ex === p.x && q.y + ey === p.y); }
      if (t.type === 'tunnelPortal' && k === 0) return true;
      return false;
    });
  }

  disposeTile(t) {
    const m = this.meta.get(t);
    if (!m) return;
    this.group.remove(m.group);
    m.group.traverse(o => o.geometry && !o.userData.shared && o.geometry.dispose());
    if (m.mesh) { m.mesh.geometry.disposeBoundsTree?.(); m.mesh.geometry.dispose(); }
    this.meta.delete(t);
    this.cones = this.cones.filter(k => k.tile !== t);
    for (const h of this.hazards) if (h.tile === t) h.mats?.forEach(m => m.dispose());
    this.hazards = this.hazards.filter(h => h.tile !== t);
  }

  // nápis na silnici se čte ve směru jízdy: projíždí-li trať dílkem obráceně, otočí se
  textFlip(t) {
    if (t.type !== 'roadText' || !this.analysis) return false;
    const o = this.analysis.order.find(q => q.tile === t);
    return !!o && !o.fwd;
  }

  buildTile(t) {
    const flip = this.textFlip(t);
    const b = buildPiece(t, { wallMask: t.type === 'wall' ? wallMask(this.cellMap, t.x, t.y) : 0, tunnelEnds: TUNNELS[t.type] ? this.tunnelEnds(t) : undefined, flip });
    const { group, collider } = finalizePiece(b, t, this.M, cellCenter(t.x, t.y));
    let mesh = null;
    if (collider) {
      collider.computeBoundsTree();
      mesh = new THREE.Mesh(collider, colMat);
      mesh.updateMatrixWorld(true);
    }
    this.group.add(group);
    this.meta.set(t, { group, mesh, flip });
    if (t.type === 'cones') this.addCones(t, group);
    if (t.type === 'crates') this.addCrates(t, group);
    if (t.type === 'pendulum') this.addPendulum(t, group);
    if (t.type === 'wind') this.addFans(t, group);
    if (TRAPS[t.type]) this.addTrap(t, group);
    if (this.hazards.length) this.animate(this.time);
  }

  // Slalom a bedny: samostatné objekty – dají se porazit (odletí), auto to jen mírně přibrzdí.
  // Položka: home = výchozí poloha (kužel: pata, bedna: střed), r = poloměr pro zásah, w = váha zásahu,
  // floor = výška, kde objekt po pádu leží, below = bedny, na kterých stojí (spadnou-li, spadne i ona).
  addCones(t, group) {
    const c = cellCenter(t.x, t.y), a = -(t.rot || 0) * Math.PI / 2, base = (t.e || 0) * H + ROAD_LIFT;
    for (const [x, z] of CONES) {
      const home = new THREE.Vector3(x * Math.cos(a) + z * Math.sin(a), base, -x * Math.sin(a) + z * Math.cos(a)).add(c);
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(coneGeo, coneMat), band = new THREE.Mesh(coneBandGeo, coneBandMat);
      body.userData.shared = band.userData.shared = true;
      body.castShadow = true;
      mesh.add(body, band);
      mesh.position.copy(home);
      group.add(mesh);
      this.cones.push({ tile: t, mesh, home, vel: new THREE.Vector3(), spin: new THREE.Vector3(), knocked: false, rest: false, r: 0.3, w: 1, floor: base - ROAD_LIFT + 0.05, cone: true });
    }
  }

  addCrates(t, group) {
    const c = cellCenter(t.x, t.y), a = -(t.rot || 0) * Math.PI / 2, base = (t.e || 0) * H + ROAD_LIFT;
    const list = [];
    for (const [x, y, z] of CRATES) {
      const home = new THREE.Vector3(x * Math.cos(a) + z * Math.sin(a), base + y, -x * Math.sin(a) + z * Math.cos(a)).add(c);
      const mesh = new THREE.Mesh(crateGeo, this.M.crate);
      mesh.userData.shared = true; mesh.castShadow = true;
      mesh.position.copy(home); mesh.rotation.y = a;
      group.add(mesh);
      const k = { tile: t, mesh, home, rot0: a, vel: new THREE.Vector3(), spin: new THREE.Vector3(), knocked: false, rest: false, r: CRATE * 0.55, w: 1.6, floor: base + CRATE / 2 - ROAD_LIFT, lx: x, ly: y };
      k.below = list.filter(o => Math.abs(o.ly - (y - CRATE)) < 0.1 && Math.abs(o.lx - x) < CRATE);
      list.push(k); this.cones.push(k);
    }
  }

  resetCones() {
    for (const k of this.cones) {
      k.knocked = k.rest = false; k.vel.set(0, 0, 0); k.mesh.position.copy(k.home);
      k.mesh.quaternion.identity(); if (k.rot0) k.mesh.rotation.y = k.rot0;
    }
  }

  // Vrací váhu právě poražených objektů. pos/quat = poloha auta, vel = jeho rychlost, hx/hz = polovina šířky/délky.
  updateCones(dt, pos, quat, vel, hx = 1.1, hz = 2.4) {
    let hits = 0;
    _cq.copy(quat).invert();
    for (const k of this.cones) {
      if (!k.knocked) {
        // bedna bez opory spadne
        if (k.below && k.below.some(o => o.knocked)) {
          k.knocked = true; k.vel.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2); k.spin.set(Math.random() * 4 - 2, 0, Math.random() * 4 - 2);
          continue;
        }
        if (Math.abs(k.home.x - pos.x) > 5 || Math.abs(k.home.z - pos.z) > 5) continue;
        _cl.copy(k.home).sub(pos).applyQuaternion(_cq);
        if (Math.abs(_cl.x) < hx + k.r && Math.abs(_cl.z) < hz + k.r && Math.abs(_cl.y) < 1.6 + k.r) {
          k.knocked = true; hits += k.w;
          const sp = vel.length();
          k.vel.copy(vel).multiplyScalar(k.cone ? 1.15 : 0.9).add(new THREE.Vector3((Math.random() - 0.5) * 4, 2.5 + sp * (k.cone ? 0.12 : 0.18), (Math.random() - 0.5) * 4));
          k.spin.set(Math.random() * 12 - 6, Math.random() * 8 - 4, Math.random() * 12 - 6);
        }
      } else if (!k.rest) {
        k.vel.y -= 9.81 * dt;
        k.mesh.position.addScaledVector(k.vel, dt);
        k.mesh.rotation.x += k.spin.x * dt; k.mesh.rotation.y += k.spin.y * dt; k.mesh.rotation.z += k.spin.z * dt;
        // mimo silnici dopadne na trávu
        const floor = this.tileAt(k.mesh.position.x, k.mesh.position.z) === k.tile ? k.floor : (k.cone ? 0.05 : CRATE / 2);
        if (k.mesh.position.y < floor) {
          k.mesh.position.y = floor;
          k.vel.y = Math.abs(k.vel.y) * 0.3; k.vel.x *= 0.6; k.vel.z *= 0.6; k.spin.multiplyScalar(0.5);
          if (k.vel.length() < 0.8) {
            k.rest = true;
            if (k.cone) k.mesh.rotation.set(Math.PI / 2, k.mesh.rotation.y, 0);
            else k.mesh.rotation.set(Math.round(k.mesh.rotation.x / (Math.PI / 2)) * Math.PI / 2, k.mesh.rotation.y, Math.round(k.mesh.rotation.z / (Math.PI / 2)) * Math.PI / 2);
          }
        }
      }
    }
    return hits;
  }

  // ---- pohyblivé překážky: demoliční koule, ventilátory (čas = čas závodu, v záznamu čas záznamu)
  addPendulum(t, group) {
    const c = cellCenter(t.x, t.y), a = -(t.rot || 0) * Math.PI / 2, base = (t.e || 0) * H + ROAD_LIFT;
    const orient = new THREE.Group(); orient.position.set(c.x, base + PENDULUM.pivotY, c.z); orient.rotation.y = a;
    const arm = new THREE.Group(); orient.add(arm);
    const chain = new THREE.Mesh(chainGeo, this.M.metal); chain.userData.shared = true; arm.add(chain);
    const ball = new THREE.Mesh(ballGeo, ballMat); ball.userData.shared = true; ball.castShadow = true; ball.position.y = -PENDULUM.len; arm.add(ball);
    const stripe = new THREE.Mesh(stripeGeo, this.M.hazard); stripe.userData.shared = true; stripe.position.y = -PENDULUM.len; arm.add(stripe);
    group.add(orient);
    this.hazards.push({ kind: 'pendulum', tile: t, orient, arm, a, phase: (t.x * 1.7 + t.y * 2.9) % (Math.PI * 2), ball: new THREE.Vector3(), bvel: new THREE.Vector3() });
  }

  addFans(t, group) {
    const c = cellCenter(t.x, t.y), a = -(t.rot || 0) * Math.PI / 2, base = (t.e || 0) * H + ROAD_LIFT;
    const blades = [];
    for (const z of [-12, 0, 12]) {
      const hub = new THREE.Group();
      hub.position.set(c.x + WIND.fanX * Math.cos(a) + z * Math.sin(a), base + 3.2, c.z - WIND.fanX * Math.sin(a) + z * Math.cos(a));
      hub.rotation.y = a;
      const spin = new THREE.Group(); hub.add(spin);
      for (let k = 0; k < 3; k++) { const bl = new THREE.Mesh(bladeGeo, this.M.hazard); bl.userData.shared = true; bl.rotation.x = k * Math.PI * 2 / 3; spin.add(bl); }
      const cap = new THREE.Mesh(capGeo, this.M.dark); cap.userData.shared = true; spin.add(cap);
      group.add(hub); blades.push(spin);
    }
    this.hazards.push({ kind: 'fans', tile: t, blades, a, phase: t.x * 0.9 + t.y * 1.3 });
  }

  // natočení pohyblivých překážek podle času
  animate(time) {
    this.time = time;
    const w = 2 * Math.PI / PENDULUM.period;
    for (const h of this.hazards) {
      if (h.kind === 'pendulum') {
        const th = PENDULUM.amp * Math.sin(w * time + h.phase), dth = PENDULUM.amp * w * Math.cos(w * time + h.phase);
        h.arm.rotation.z = th;
        // poloha a rychlost koule ve světě (kmitá v rovině napříč silnicí)
        const lx = PENDULUM.len * Math.sin(th), ly = -PENDULUM.len * Math.cos(th);
        const ca = Math.cos(h.a), sa = Math.sin(h.a);
        h.ball.set(h.orient.position.x + lx * ca, h.orient.position.y + ly, h.orient.position.z - lx * sa);
        const vx = PENDULUM.len * Math.cos(th) * dth, vy = PENDULUM.len * Math.sin(th) * dth;
        h.bvel.set(vx * ca, vy, -vx * sa);
      } else if (h.kind === 'fans') {
        for (const b of h.blades) b.rotation.x = time * 9 + h.phase;
      } else this.animateTrap(h, time);
    }
  }

  // náraz koule do auta: odhodí ho stranou a poškodí (nejvýš jednou za 0,6 s); vrací sílu nárazu (0 = nic)
  // dmgScale: poškození z pastí (soupeři 0,5 – ve frontě před pastí se tlačí a jinak by je pasti vyřadily)
  hazardHit(car, dmgScale = 1) {
    let hit = 0;
    for (const h of this.hazards) {
      if (h.kind !== 'pendulum') continue;
      _hd.subVectors(car.pos, h.ball);
      const d = _hd.length();
      if (d > PENDULUM.r + 1.5) continue;
      const last = this._hitT.get(car) ?? -9;
      if (this.time - last < 0.6) continue;
      _hd.y *= 0.3; _hd.normalize();
      const vn = _hv.subVectors(car.vel, h.bvel).dot(_hd);
      if (vn > 0) continue;
      this._hitT.set(car, this.time);
      car.vel.addScaledVector(_hd, -vn * 1.4 + 4).y += 2.5;
      car.ang.y += (Math.random() - 0.5) * 3; car.ang.z += (Math.random() - 0.5) * 2;
      const sp = Math.abs(vn);
      car.impact = Math.max(car.impact, sp);
      car.applyDamage({ dmg: Math.min(22, 3 + sp * 0.9) * dmgScale, speed: sp, frontal: false, point: h.ball.clone().addScaledVector(_hd, PENDULUM.r), normal: _hd.clone() });
      hit = Math.max(hit, sp);
    }
    // pasti složené z kvádrů: vytlačit auto ven, odrazit (s rychlostí pasti), poškodit
    const sp0 = car.vel.length();
    let vBox = 0, touched = null, squeeze = false;
    for (const h of this.hazards) {
      if (!h.boxes) continue;
      for (const b of h.boxes) {
        if (!b.on) continue;
        const r = this._boxHit(car, b);
        if (!r) continue;
        if (touched && touched.h === h && touched.b !== b && h.kind === 'crusher') squeeze = true;   // mezi oběma bloky lisu
        touched = { h, b };
        vBox = Math.max(vBox, b.vel.length() + (b.wy ? Math.abs(b.wy) * (b.hx + 1) : 0));
        let n = r.n;
        if (n.y < -0.5) {   // shora (buchar, vlak) – vytlačit do strany, ne do silnice
          n = _hn.set(car.pos.x - b.c.x, 0, car.pos.z - b.c.z);
          if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
          n.normalize(); car.vel.y = Math.min(car.vel.y, b.vel.y);
        }
        car.pos.addScaledVector(n, Math.min(r.pen, 0.6) * 0.9);
        const vb = _hv2.copy(b.vel);
        if (b.wy) vb.add(_hw.set(b.wy * (r.p.z - b.c.z), 0, -b.wy * (r.p.x - b.c.x)));
        const vn = _hv.subVectors(car.vel, vb).dot(n);
        if (vn >= 0) continue;
        car.vel.addScaledVector(n, -vn * (h.kind === 'railroad' ? 1.05 : 1.35));
        const sp = -vn;
        if (sp < 2.5) continue;
        car.ang.y += (Math.random() - 0.5) * Math.min(4, sp * 0.25);
        car.impact = Math.max(car.impact, sp);
        if (this.time - (this._hitT.get(car) ?? -9) < 0.5) continue;
        this._hitT.set(car, this.time);
        const K = { crusher: 1.1, spinner: 0.9, hammer: 1.4, railroad: 1.2, bollards: 1.0 }[h.kind] || 1;
        car.applyDamage({ dmg: Math.min(30, 2 + sp * K) * dmgScale, speed: sp, frontal: false, point: r.p.clone(), normal: n.clone() });
        hit = Math.max(hit, sp);
      }
    }
    if (touched) {
      // sevřené mezi bloky lisu: vymáčknout podél silnice (ne napříč), směrem, kde je auto blíž okraji lisu
      if (squeeze) {
        const [, lz] = this.local(touched.h.tile, car.pos), a = touched.h.a, s = lz >= 0 ? 1 : -1;
        car.vel.set(Math.sin(a) * s * 7, car.vel.y, Math.cos(a) * s * 7);
      }
      // odraz od pasti nesmí auto vystřelit (součet odrazů od více kvádrů v jednom kroku)
      const lim = Math.max(sp0, vBox * 1.4 + 6);
      if (car.vel.length() > lim) car.vel.setLength(lim);
    }
    return hit;
  }

  // ---- pohyblivé pasti (lis, rotující rameno, buchary, přejezd s vlakem, zvedací sloupky)
  // Každá past má seznam kvádrů h.boxes: {c (svět), hx, hy, hz, yaw, vel, wy (úhlová rychlost kolem svislé osy c), on}
  // – ty se každým krokem přepočítají v animate() a používá je hazardHit() i soupeři (hazardBlocked).
  addTrap(t, group) {
    const c = cellCenter(t.x, t.y), a = -(t.rot || 0) * Math.PI / 2, base = (t.e || 0) * H + ROAD_LIFT;
    const h = { kind: t.type, tile: t, a, base, c, ph: hazardPhase(t), boxes: [], meshes: [], mats: [], lastT: null };
    const root = new THREE.Group(); root.position.set(c.x, base, c.z); root.rotation.y = a; group.add(root);   // lokální souřadnice dílku
    h.root = root;
    const mesh = (geo, mat, parent = root) => { const m = new THREE.Mesh(geo, mat); m.userData.shared = true; m.castShadow = true; parent.add(m); return m; };
    const box = (hx, hy, hz) => { const b = { c: new THREE.Vector3(), hx, hy, hz, yaw: a, vel: new THREE.Vector3(), wy: 0, on: true }; h.boxes.push(b); return b; };
    if (t.type === 'crusher') {
      for (const s of [-1, 1]) {
        const m = mesh(G.crusher, this.M.steel);
        mesh(G.crusherFace, this.M.hazard, m).position.x = -s * (CRUSHER.hx + 0.01);
        h.meshes.push(m); box(CRUSHER.hx, CRUSHER.hy, CRUSHER.hz).s = s;
      }
    } else if (t.type === 'spinner') {
      const pivot = new THREE.Group(); pivot.position.y = SPINNER.y; root.add(pivot);
      mesh(G.spinnerArm, this.M.hazard, pivot);
      for (const s of [-1, 1]) mesh(G.spinnerTip, this.M.steel, pivot).position.x = s * (SPINNER.arm - 0.2);
      h.meshes.push(pivot); const b = box(SPINNER.arm, SPINNER.hy, SPINNER.hz); b.wy = SPINNER.omega;
    } else if (t.type === 'hammer') {
      for (const s of [-1, 1]) {
        const head = mesh(G.hammer, this.M.steel); head.position.x = s * HAMMER.x;
        mesh(G.hammerBand, this.M.hazard, head);
        const rod = mesh(G.rod, this.M.metal); rod.position.x = s * HAMMER.x;
        h.meshes.push({ head, rod }); box(HAMMER.h, HAMMER.hy, HAMMER.h).s = s;
      }
    } else if (t.type === 'railroad') {
      const train = new THREE.Group(); root.add(train); h.train = train;
      for (let k = 0; k < 2; k++) {
        const w = mesh(k ? G.wagon : G.loco, k ? TM.wagon : TM.loco, train);
        w.position.x = -k * (TRAIN.car + TRAIN.gap); w.position.y = 0.35 + TRAIN.hy;
        mesh(G.trainRoof, this.M.dark, w).position.y = TRAIN.hy + 0.1;
        for (const s of [-1, 1]) mesh(G.trainWin, TM.glass, w).position.set(0, 0.7, s * (TRAIN.hz + 0.01));
        for (const x of [-TRAIN.car / 2 + 1.4, TRAIN.car / 2 - 1.4]) for (const s of [-1, 1]) mesh(G.bogie, this.M.dark, w).position.set(x, -TRAIN.hy - 0.05, s * 0.72);
        if (!k) { const l = mesh(G.headlight, this.M.lamp, w); l.position.set(TRAIN.car / 2 + 0.01, -0.6, 0); }
        box(TRAIN.car / 2 - 0.1, TRAIN.hy, TRAIN.hz).k = k;
      }
      // závory (u každého vjezdu na pravé straně) a blikající světla na výstražných křížích
      h.booms = [];
      for (const s of [-1, 1]) {
        const hold = new THREE.Group(); hold.position.set(s * 6.2, 1.1, s * 3.6); hold.rotation.y = s > 0 ? 0 : Math.PI; root.add(hold);
        const p = new THREE.Group(); hold.add(p);
        const arm = mesh(G.boom, this.M.barrier, p); arm.position.x = -2.9;
        mesh(G.boomPost, this.M.metal).position.set(s * 6.2, 0.55, s * 3.6);
        h.booms.push(p);
      }
      h.lamps = [0, 1].map(() => { const m = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a0a, emissiveIntensity: 0 }); h.mats.push(m); return m; });
      for (const s of [-1, 1]) for (const k of [0, 1]) {
        const l = new THREE.Mesh(G.lamp, h.lamps[k]); l.userData.shared = true;
        l.position.set(s * 6.4 + (k ? 0.35 : -0.35), 2.7, s * 5.2 - s * 0.08); root.add(l);
      }
      h.boomA = Math.PI / 2;
    } else if (t.type === 'bollards') {
      h.rev = this.textFlipAny(t);
      for (const [k, z] of BOLLARDS.rows.entries()) for (const x of BOLLARDS.xs) {
        const m = mesh(G.bollard, this.M.barrier); m.position.set(x, 0, z);
        const top = mesh(G.bollardTop, this.M.lamp, m); top.position.y = BOLLARDS.h / 2 + 0.03;
        h.meshes.push(m); const b = box(BOLLARDS.r, BOLLARDS.h / 2, BOLLARDS.r); b.row = k; b.lx = x; b.lz = z;
      }
    }
    this.hazards.push(h);
  }

  // projíždí trať dílkem obráceně (k −z)?
  textFlipAny(t) {
    if (!this.analysis) return false;
    const o = this.analysis.order.find(q => q.tile === t);
    return !!o && !o.fwd;
  }

  // lokální bod dílku pasti → svět
  _w(h, x, y, z, out) {
    const ca = Math.cos(h.a), sa = Math.sin(h.a);
    return out.set(h.c.x + x * ca + z * sa, h.base + y, h.c.z - x * sa + z * ca);
  }

  // natočení pastí v čase `time` (volá animate)
  animateTrap(h, time) {
    const dt = h.lastT == null ? 0 : Math.max(0, Math.min(0.1, time - h.lastT)); h.lastT = time;
    const vloc = (x, y, z) => _hv.set(x * Math.cos(h.a) + z * Math.sin(h.a), y, -x * Math.sin(h.a) + z * Math.cos(h.a));
    if (h.kind === 'crusher') {
      const x = crusherX(time, h.ph), vx = (crusherX(time + 0.005, h.ph) - crusherX(time - 0.005, h.ph)) / 0.01;
      h.boxes.forEach((b, i) => {
        h.meshes[i].position.set(b.s * x, CRUSHER.hy, 0);
        this._w(h, b.s * x, CRUSHER.hy, 0, b.c); b.vel.copy(vloc(b.s * vx, 0, 0));
      });
    } else if (h.kind === 'spinner') {
      const yaw = spinnerYaw(time, h.ph);
      h.meshes[0].rotation.y = yaw;
      const b = h.boxes[0]; this._w(h, 0, SPINNER.y, 0, b.c); b.yaw = h.a + yaw;
    } else if (h.kind === 'hammer') {
      h.boxes.forEach((b, i) => {
        const k = b.s > 0 ? 1 : 0, y = hammerY(k, time, h.ph), vy = (hammerY(k, time + 0.005, h.ph) - hammerY(k, time - 0.005, h.ph)) / 0.01;
        const { head, rod } = h.meshes[i];
        head.position.y = y + HAMMER.hy;
        const top = HAMMER.top + 2 * HAMMER.hy + 2.2 - 1.6;   // spodek hydraulického válce
        rod.position.y = (top + y + 2 * HAMMER.hy) / 2; rod.scale.y = Math.max(0.05, top - y - 2 * HAMMER.hy);
        this._w(h, b.s * HAMMER.x, y + HAMMER.hy, 0, b.c); b.vel.set(0, vy, 0);
      });
    } else if (h.kind === 'railroad') {
      const x = trainX(time, h.ph);
      h.train.visible = x != null;
      if (x != null) h.train.position.x = x;
      h.train.children.forEach((w, k) => { w.visible = x != null && Math.abs(x - k * (TRAIN.car + TRAIN.gap)) < 20.5 + TRAIN.car * 0.2; });
      h.boxes.forEach(b => {
        const cx = x == null ? 999 : x - b.k * (TRAIN.car + TRAIN.gap);
        b.on = x != null && Math.abs(cx) < 20;
        this._w(h, cx, 0.35 + TRAIN.hy, 0, b.c); b.vel.copy(vloc(TRAIN.speed, 0, 0));
      });
      const warn = trainWarn(time, h.ph);
      const target = warn ? 0 : Math.PI / 2;
      h.boomA += (target - h.boomA) * (dt > 0 ? Math.min(1, dt * 3) : 1);
      for (const p of h.booms) p.rotation.z = -h.boomA;   // závora se zvedá kolem čepu na sloupku
      const blink = warn && Math.floor(time * 2.2) % 2;
      h.lamps[0].emissiveIntensity = warn ? (blink ? 3 : 0.1) : 0; h.lamps[1].emissiveIntensity = warn ? (blink ? 0.1 : 3) : 0;
    } else if (h.kind === 'bollards') {
      h.boxes.forEach((b, i) => {
        const row = h.rev ? BOLLARDS.rows.length - 1 - b.row : b.row;
        const y = bollardH(row, time, h.ph), vy = (bollardH(row, time + 0.005, h.ph) - bollardH(row, time - 0.005, h.ph)) / 0.01;
        h.meshes[i].position.y = y - BOLLARDS.h / 2;
        b.on = y > 0.08;
        this._w(h, b.lx, y / 2, b.lz, b.c); b.hy = Math.max(0.02, y / 2); b.vel.set(0, vy, 0);
      });
    }
  }

  // nejhlubší průnik auta (tři koule podél auta) do kvádru pasti
  _boxHit(car, b) {
    const fwd = _hf.set(0, 0, 1).applyQuaternion(car.quat), cy = Math.cos(b.yaw), sy = Math.sin(b.yaw), R = 1.0;
    let best = null;
    for (const k of [-1.35, 0, 1.35]) {
      _hs.copy(car.pos).addScaledVector(fwd, k);
      const dx = _hs.x - b.c.x, dy = _hs.y - b.c.y, dz = _hs.z - b.c.z;
      if (Math.abs(dx) > b.hx + b.hz + 3 || Math.abs(dz) > b.hx + b.hz + 3 || Math.abs(dy) > b.hy + 2) continue;
      const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
      const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qy = Math.max(-b.hy, Math.min(b.hy, dy)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
      let nx = lx - qx, ny = dy - qy, nz = lz - qz, pen;
      const d = Math.hypot(nx, ny, nz);
      if (d >= R) continue;
      if (d < 1e-4) {   // střed koule uvnitř kvádru – ven nejkratší cestou
        const px = b.hx - Math.abs(lx), py = b.hy - Math.abs(dy), pz = b.hz - Math.abs(lz);
        nx = ny = nz = 0;
        if (px <= pz && px <= py) { nx = Math.sign(lx) || 1; pen = px + R; } else if (pz <= py) { nz = Math.sign(lz) || 1; pen = pz + R; } else { ny = Math.sign(dy) || 1; pen = py + R; }
      } else { nx /= d; ny /= d; nz /= d; pen = R - d; }
      if (!best || pen > best.pen) best = { pen, n: new THREE.Vector3(nx * cy + nz * sy, ny, -nx * sy + nz * cy), p: _hs.clone() };
    }
    return best;
  }

  // Soupeři: je past v okamžiku příjezdu zavřená? dist = vzdálenost auta ke středu dílku po trati, v = rychlost,
  // fwd = směr průjezdu. Vrací vzdálenost, na které je potřeba zastavit (−1 = volno).
  hazardBlocked(t, dist, v, fwd) {
    const h = this.hazards.find(q => q.tile === t);
    if (!h) return null;
    // čas příjezdu na vzdálenost d: auto zrychluje (~4 m/s²) až na rychlost průjezdu pastí
    const A = 4, vmax = { bollards: 13.5, spinner: 16, crusher: 20, railroad: 25 }[h.kind] || 20;   // jako cílové rychlosti autopilota
    const at = d => {
      d = Math.max(0, d);
      const tAcc = (-v + Math.sqrt(v * v + 2 * A * d)) / A, vEnd = Math.sqrt(v * v + 2 * A * d);
      if (vEnd <= vmax || v >= vmax) return this.time + (v >= vmax ? d / v : tAcc);
      const dAcc = (vmax * vmax - v * v) / (2 * A);
      return this.time + (vmax - v) / A + (d - dAcc) / vmax;
    };
    const vAt = d => Math.min(Math.max(v, vmax), Math.sqrt(v * v + 2 * A * Math.max(0, d)));
    if (h.kind === 'pendulum') {
      const w = 2 * Math.PI / PENDULUM.period, busy = tt => Math.abs(PENDULUM.len * Math.sin(PENDULUM.amp * Math.sin(w * tt + h.phase))) < 3.4;   // koule u středu silnice
      return busy(at(dist) - 0.15) || busy(at(dist)) || busy(at(dist) + 0.2) || busy(at(dist) + 0.4) ? dist - 5 : null;
    }
    if (h.kind === 'crusher') {
      const shut = tt => crusherX(tt, h.ph) - CRUSHER.hx < 2.4;
      return shut(at(dist)) || shut(at(dist) + 0.5) || shut(at(dist) - 0.3) ? dist - 4.5 : null;
    }
    if (h.kind === 'spinner') {
      // průjezd vedle sloupu (soupeř jede ~3,3 m od středu): projde rameno autem v některém okamžiku průjezdu?
      const t0 = at(dist), vc = Math.max(8, vAt(dist)), carX = fwd ? -SPINNER.lane : SPINNER.lane;   // objížďka po straně, kde se rameno točí po směru jízdy
      const span = (SPINNER.arm + 2.6) / vc;   // jak dlouho je auto v dosahu ramene
      for (let tau = -span; tau <= span; tau += 0.04) {
        const yaw = spinnerYaw(t0 + tau, h.ph), c = Math.cos(yaw), sn = Math.sin(yaw), zc = (fwd ? 1 : -1) * tau * vc;
        for (const xs of [carX - 0.95, carX, carX + 0.95]) {
          if (Math.abs(c) < 1e-3) continue;
          const s = xs / c;
          if (Math.abs(s) > SPINNER.arm + 0.4) continue;
          if (Math.abs(-s * sn - zc) < 2.7) return dist - SPINNER.arm - 3;
        }
      }
      return null;
    }
    if (h.kind === 'railroad') {
      const w = tt => trainWarn(tt, h.ph);
      return w(at(dist) - 0.5) || w(at(dist)) || w(at(dist) + 0.8) ? dist - 7.5 : null;
    }
    if (h.kind === 'bollards') {
      for (const [k, z] of BOLLARDS.rows.entries()) {
        const d = dist + (fwd ? z : -z);
        if (d < 1.5) continue;
        const row = h.rev ? BOLLARDS.rows.length - 1 - k : k;
        if (bollardH(row, at(d), h.ph) > 0.05 || bollardH(row, at(d) + 0.35, h.ph) > 0.05) return d - 3;
      }
      return null;
    }
    return null;
  }

  // vítr od ventilátorů (zrychlení ve světových souřadnicích, s poryvy); null = bezvětří
  windAt(p, out) {
    const t = this.tileAt(p.x, p.z);
    if (!t || t.type !== 'wind' || Math.abs(p.y - (t.e || 0) * H - 1) > 5) return null;
    const a = -(t.rot || 0) * Math.PI / 2, gust = 0.55 + 0.45 * Math.sin((this.time || 0) * 1.7 + t.x + t.y);
    // proud z ventilátorů je plný nad silnicí, za závětrným okrajem (lokální −x) rychle slábne – odfouknuté auto se může vrátit
    const lx = this.local(t, p)[0], fade = Math.max(0, Math.min(1, (lx + 10) / 4));
    if (fade <= 0) return null;
    return out.set(-Math.cos(a), 0, Math.sin(a)).multiplyScalar(WIND.acc * gust * fade);   // lokální −x
  }

  // stojí auto na trampolíně?
  trampolineAt(p) {
    const t = this.tileAt(p.x, p.z);
    if (!t || t.type !== 'trampoline' || Math.abs(p.y - (t.e || 0) * H) > 1.6) return false;
    const [lx, lz] = this.local(t, p);
    return Math.abs(lx) < TRAMPOLINE.hx + 0.5 && lz > TRAMPOLINE.z0 - 0.5 && lz < TRAMPOLINE.z1 + 0.5;
  }

  // bod ve světě → lokální souřadnice dílku [x, z]
  local(t, p) {
    const c = cellCenter(t.x, t.y), a = (t.rot || 0) * Math.PI / 2, x = p.x - c.x, z = p.z - c.z;
    return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
  }

  // je bod ve olejové skvrně?
  inOil(t, p) {
    const [lx, lz] = this.local(t, p);
    return OIL.some(([x, z, r]) => ((lx - x) / r) ** 2 + ((lz - z) / (r * 1.25)) ** 2 < 1);
  }

  removeTile(t) {
    this.disposeTile(t);
    const i = this.tiles.indexOf(t);
    if (i >= 0) this.tiles.splice(i, 1);
    this.refresh();
    this.rebuildAround(t);
  }

  refresh() {
    this.cellMap = buildCellMap(this.tiles);
    this.analysis = analyze(this.tiles);
    this.orderIndex = new Map();
    this.analysis.order.forEach((o, i) => { if (!this.orderIndex.has(o.tile)) this.orderIndex.set(o.tile, []); this.orderIndex.get(o.tile).push(i); });
    for (const h of this.hazards) if (h.kind === 'bollards') h.rev = this.textFlipAny(h.tile);   // zelená vlna po směru jízdy
    // nápisy na silnici natočit podle směru jízdy (po změně trati se může otočit)
    for (const t of this.tiles) {
      if (t.type !== 'roadText') continue;
      const m = this.meta.get(t);
      if (m && m.flip !== this.textFlip(t)) { this.disposeTile(t); this.buildTile(t); }
    }
  }

  dispose() {
    for (const t of [...this.meta.keys()]) {
      const m = this.meta.get(t);
      m.group.traverse(o => o.geometry && !o.userData.shared && o.geometry.dispose());
      if (m.mesh) m.mesh.geometry.dispose();
    }
    this.meta.clear();
  }

  tileAt(px, pz) {
    const [x, y] = worldToCell(px, pz);
    return this.cellMap.get(key(x, y)) || null;
  }

  // Raycast proti trati a zemi. Vrací {dist, point, normal, ground} nebo null.
  raycast(origin, dir, far) {
    let best = null;
    // země (y = 0)
    if (dir.y < -1e-6 && origin.y >= -0.01) {
      const d = origin.y / -dir.y;
      if (d <= far) best = { dist: d, point: origin.clone().addScaledVector(dir, d), normal: new THREE.Vector3(0, 1, 0), ground: true };
    } else if (origin.y < 0 && dir.y > 1e-6) {
      // bod pod zemí – nic
    }
    const ex = origin.x + dir.x * far, ez = origin.z + dir.z * far;
    const [x0, y0] = worldToCell(Math.min(origin.x, ex) - 0.5, Math.min(origin.z, ez) - 0.5);
    const [x1, y1] = worldToCell(Math.max(origin.x, ex) + 0.5, Math.max(origin.z, ez) + 0.5);
    _ray.set(origin, dir);
    _ray.near = 0; _ray.far = best ? best.dist : far;
    let seen0 = null, seen1 = null;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = this.cellMap.get(key(x, y));
      if (!t || t === seen0 || t === seen1) continue;
      seen1 = seen0; seen0 = t;
      const m = this.meta.get(t);
      if (!m || !m.mesh) continue;
      _hits.length = 0;
      m.mesh.raycast(_ray, _hits);
      for (const h of _hits) {
        if (h.distance <= _ray.far && (!best || h.distance < best.dist)) {
          const n = h.face.normal.clone();
          if (n.dot(dir) > 0) n.negate();
          best = { dist: h.distance, point: h.point.clone(), normal: n, ground: false, surf: t.type === 'gravel' ? 'gravel' : t.type === 'oil' && this.inOil(t, h.point) ? 'oil' : null };
          _ray.far = h.distance;
        }
      }
    }
    return best;
  }

  pathWorld(tile, u, k = 0) { return pathWorld(tile, u, k); }

  // Jede auto po vozovce dílku? Nejbližší bod středové křivky: vodorovně do 7,5 m a výškově do 2,5 m,
  // nebo celkem do 4 m (looping, roura, klopení). Body křivek se ukládají pro každý dílek.
  onTilePath(t, p) {
    if (!PATHS[t.type]) return true;
    let pts = this._pp.get(t);
    if (!pts) {
      pts = [];
      const nP = PATHS[t.type].multi ? PATHS[t.type].multi.length : 1;
      for (let k = 0; k < nP; k++) {
        const n = Math.max(12, Math.ceil(pathOf(t.type, k).len / 2));
        for (let i = 0; i <= n; i++) pts.push(pathWorld(t, i / n, k).p);
      }
      this._pp.set(t, pts);
    }
    for (const q of pts) {
      const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z, h2 = dx * dx + dz * dz;
      if ((h2 < 56 && Math.abs(dy) < 2.5) || h2 + dy * dy < 16) return true;
    }
    return false;
  }

  // v loopingu je "stěna" silnicí – náraz tam není havárie
  // (kromě zátarasu uprostřed roury s překážkou – čelní náraz do něj je havárie)
  noCrashAt(p) {
    const t = this.tileAt(p.x, p.z);
    if (!t || !LOOPS[t.type]) return false;
    if (t.type === 'pipeObst') { const c = cellCenter(t.x, t.y); return Math.hypot(p.x - c.x, p.z - c.z) > 5; }
    return true;
  }

  // stojí auto na ploše urychlovače? (v lokálních souřadnicích dílku, výškově u vozovky)
  boostAt(p) {
    const t = this.tileAt(p.x, p.z);
    if (!t || t.type !== 'boost' || Math.abs(p.y - (t.e || 0) * H) > 2.2) return false;
    const c = cellCenter(t.x, t.y), lx = p.x - c.x, lz = p.z - c.z;
    const along = t.rot % 2 ? Math.abs(lx) : Math.abs(lz), across = t.rot % 2 ? Math.abs(lz) : Math.abs(lx);
    return along < BOOST_PAD.hz && across < BOOST_PAD.hx + 1;
  }

  // je bod ve vodě (řeka pod mostem / jezírko)?
  isWater(px, py, pz) {
    if (py > 1.2) return false;
    const t = this.tileAt(px, pz);
    if (!t) return false;
    const c = cellCenter(t.x, t.y);
    const lx = px - c.x, lz = pz - c.z;
    if (t.type === 'lake') return lx * lx + lz * lz < 16.5 * 16.5;
    if (t.type === 'bridge' || t.type === 'river') { const across = t.rot % 2 ? Math.abs(lx) : Math.abs(lz); return across < 11; }
    if (t.type === 'riverCurve') {
      // zpět do lokálních souřadnic dílku (inverzní otočení)
      let x = lx, z = lz;
      for (let k = 0; k < t.rot; k++) [x, z] = [z, -x];
      const d = Math.hypot(x + 20, z - 20);
      return d > 9 && d < 31;
    }
    return false;
  }

  startPose() {
    const st = this.tiles.find(t => t.type === 'start');
    if (!st) {
      const road = this.tiles.find(t => PIECES[t.type].cat !== 'deco' && PATHS[t.type]);
      if (road) return this.poseOn(road, true, 0.3);
      return { p: new THREE.Vector3(0, 1, 0), t: new THREE.Vector3(0, 0, 1) };
    }
    return this.poseOn(st, true, 0.3);
  }

  poseOn(tile, fwd, u = 0.12, k = 0) {
    const w = this.pathWorld(tile, fwd ? u : 1 - u, k);
    if (!fwd) w.t.negate();
    w.p.addScaledVector(w.n, 0.8);
    return w;
  }

  drawMap(ctx, size, opts = {}) { drawTrackMap(ctx, this.tiles, size, opts); }
}

// bod, tečna a normála středové křivky dílku ve světě
const _rm = new THREE.Matrix4();
export function pathWorld(tile, u, k = 0) {
  const P = pathOf(tile.type, k);
  const f = frame(P.f, u, (tile.e || 0) * H + ROAD_LIFT);
  _rm.makeRotationY(-tile.rot * Math.PI / 2);
  const c = cellCenter(tile.x, tile.y);
  return { p: f.p.applyMatrix4(_rm).add(c), t: f.t.transformDirection(_rm), n: f.n.transformDirection(_rm) };
}

// mapa trati do canvasu (minimapa / náhledy)
// opts.fit: přiblíží na oblast silnic; vrací {ox, oy, s} – převod buněk na pixely
export function mapTransform(tiles, size, fit) {
  if (!fit) return { ox: 0, oy: 0, s: size / GRID };
  let x0 = GRID, y0 = GRID, x1 = 0, y1 = 0;
  for (const t of tiles) if (PIECES[t.type].cat !== 'deco') for (const [x, y] of tileCells(t)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  if (x1 <= x0) return { ox: 0, oy: 0, s: size / GRID };
  const span = Math.max(x1 - x0, y1 - y0) + 1.2;
  return { ox: (x0 + x1) / 2 - span / 2, oy: (y0 + y1) / 2 - span / 2, s: size / span };
}

export function drawTrackMap(ctx, tiles, size, opts = {}) {
  const tf = mapTransform(tiles, size, opts.fit);
  {
    const s = tf.s;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, size, size); }
    ctx.translate(-tf.ox * s, -tf.oy * s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const t of tiles) {
      const def = PIECES[t.type];
      if (def.cat === 'deco') {

        if (opts.deco) {
          ctx.fillStyle = { trees: '#2f5f2a', house: '#9b5a44', lake: '#2e6f96', river: '#2e6f96', riverCurve: '#2e6f96', stand: '#777', wall: '#c9c4b8', billboard: '#ffd84a' }[t.type];
          for (const [x, y] of tileCells(t)) ctx.fillRect(x * s + s * 0.2, y * s + s * 0.2, s * 0.6, s * 0.6);
        }
        continue;
      }
      ctx.lineWidth = Math.max(2, s * 0.32);
      const nPaths = PATHS[t.type].multi ? PATHS[t.type].multi.length : 1;
      for (let k = 0; k < nPaths; k++) {
        const mid = pathWorld(t, 0.5, k);
        ctx.strokeStyle = mid.p.y > 2 && !LOOPS[t.type] ? (opts.color2 || '#ffd35a') : (opts.color || '#e9e9e9');
        ctx.beginPath();
        const n = Math.max(16, Math.round(pathOf(t.type, k).len / 6));
        for (let i = 0; i <= n; i++) {
          if (t.type === 'loop' && i > n * 0.33 && i < n * 0.67) continue;
          const w = pathWorld(t, i / n, k);
          const X = (w.p.x / T + GRID / 2) * s, Y = (w.p.z / T + GRID / 2) * s;
          i === 0 || (t.type === 'loop' && i === Math.ceil(n * 0.67)) ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
      if (t.type === 'start') {
        const c = cellCenter(t.x, t.y);
        ctx.fillStyle = '#ff4a3d';
        ctx.beginPath(); ctx.arc((c.x / T + GRID / 2) * s, (c.z / T + GRID / 2) * s, s * 0.3, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }
  return tf;
}
