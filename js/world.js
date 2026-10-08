// Renderer, obloha, světla, terén s horami, kouř pneumatik a stopy smyku.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { makeMaterials } from './materials.js';
import { HALF_MAP, FENCE } from './track.js';

function valueNoise(seed = 1) {
  const p = new Uint8Array(512);
  let s = seed;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const h = (x, y) => p[p[x & 255] + (y & 255)] / 255;
  const f = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = f(x - xi), yf = f(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.2, 6000);
    this.M = makeMaterials(r);

    // obloha + prostředí pro odrazy
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(215));
    const sky = new Sky();
    sky.scale.setScalar(20000);
    const u = sky.material.uniforms;
    u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const sky2 = sky.clone(); envScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(15000, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3d5a2a }));
    ground.position.y = -10; envScene.add(ground);
    this.scene.environment = pm.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.8;

    this.scene.fog = new THREE.Fog(0xb9cde0, 500, 3200);

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4d5e33, 0.9);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 700;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);

    this.buildTerrain();
    this.smoke = new Smoke(this.scene);
    this.skids = new Skids(this.scene);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildTerrain() {
    const size = 7000, seg = 140;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const n = valueNoise(7);
    const pos = g.attributes.position;
    const col = [];
    const c = new THREE.Color();
    const flat = HALF_MAP + 60;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.max(Math.abs(x), Math.abs(z)) - flat;
      const t = THREE.MathUtils.smoothstep(d, 0, 900);
      let hgt = 0;
      if (t > 0) {
        let a = 1, f = 1 / 700, sum = 0;
        for (let o = 0; o < 5; o++) { sum += a * n(x * f + 31, z * f + 17); a *= 0.5; f *= 2.1; }
        hgt = t * (sum * 520 - 120) + t * t * 180;
        hgt = Math.max(hgt, t * 8);
      }
      pos.setY(i, hgt);
    }
    g.computeVertexNormals();
    // barvy podle výšky a sklonu: louka → les → skála → sníh
    const nrm = g.attributes.normal;
    const meadow = new THREE.Color(0.92, 0.95, 0.85), forest = new THREE.Color(0.45, 0.62, 0.42), rock = new THREE.Color(0.95, 0.9, 0.82), snow = new THREE.Color(3.2, 3.3, 3.4);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i), slope = 1 - nrm.getY(i);
      const x = pos.getX(i), z = pos.getZ(i);
      c.copy(meadow).multiplyScalar(0.9 + 0.2 * n(x / 90, z / 90));
      c.lerp(forest, THREE.MathUtils.smoothstep(h, 10, 60));
      if (slope > 0.25 || h > 200) c.lerp(new THREE.Color(0.55, 0.52, 0.48).multiply(rock), THREE.MathUtils.smoothstep(Math.max(slope * 400, h), 150, 260));
      c.lerp(snow, THREE.MathUtils.smoothstep(h, 310, 380) * (slope < 0.45 ? 1 : 0.4));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.terrainHeight = (x, z) => {
      const d = Math.max(Math.abs(x), Math.abs(z)) - flat;
      const t = THREE.MathUtils.smoothstep(d, 0, 900);
      if (t <= 0) return 0;
      let a = 1, f = 1 / 700, sum = 0;
      for (let o = 0; o < 5; o++) { sum += a * n(x * f + 31, z * f + 17); a *= 0.5; f *= 2.1; }
      return Math.max(t * (sum * 520 - 120) + t * t * 180, t * 8);
    };
    const mat = new THREE.MeshStandardMaterial({ map: this.M.makeGrassTexture(size / 24), vertexColors: true, roughness: 1 });
    const terrain = new THREE.Mesh(g, mat);
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // les kolem mapy (instancované stromy)
    const N = 2600;
    const coneG = new THREE.ConeGeometry(2.6, 8, 7); coneG.translate(0, 6.5, 0);
    const trunkG = new THREE.CylinderGeometry(0.3, 0.45, 3, 5); trunkG.translate(0, 1.5, 0);
    const cones = new THREE.InstancedMesh(coneG, new THREE.MeshStandardMaterial({ color: 0x2c5a2a, roughness: 1, flatShading: true }), N);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 }), N);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let placed = 0, tries = 0;
    let seed = 99; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    while (placed < N && tries++ < N * 6) {
      const x = (rnd() - 0.5) * 2 * (flat + 900), z = (rnd() - 0.5) * 2 * (flat + 900);
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < flat - 15) continue;
      const hgt = this.terrainHeight(x, z);
      if (hgt > 190 || n(x / 60, z / 60) < 0.42) continue;
      const s = 0.7 + rnd() * 0.8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      mm.compose(p.set(x, hgt - 0.3, z), q, sc.set(s, s * (0.8 + rnd() * 0.5), s));
      cones.setMatrixAt(placed, mm); trunks.setMatrixAt(placed, mm);
      placed++;
    }
    cones.count = trunks.count = placed;
    cones.castShadow = false; cones.receiveShadow = true;
    this.scene.add(cones, trunks);
    // plot kolem mapy
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 });
    const L = FENCE;
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6), fenceMat, Math.ceil(8 * L / 8) + 8);
    let k = 0; const m = new THREE.Matrix4();
    for (let s = -L; s <= L; s += 8) for (const [x, z] of [[s, -L], [s, L], [-L, s], [L, s]]) { if (k < posts.count) posts.setMatrixAt(k++, m.makeTranslation(x, 1.1, z)); }
    posts.count = k;
    this.scene.add(posts);
    const railG = new THREE.BoxGeometry(2 * L, 0.08, 0.08);
    for (const y of [0.9, 1.9]) for (const [x, z, ry] of [[0, -L, 0], [0, L, 0], [-L, 0, Math.PI / 2], [L, 0, Math.PI / 2]]) {
      const rm = new THREE.Mesh(railG, fenceMat); rm.position.set(x, y, z); rm.rotation.y = ry; this.scene.add(rm);
    }
  }

  focusShadow(p) {
    this.sun.position.copy(p).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(p);
  }

  setShadowSize(s) {
    const sc = this.sun.shadow.camera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // views = null (celá obrazovka, this.camera) nebo [{camera, focus}] – rozdělená obrazovka vedle sebe (hra pro dva)
  render(dt) {
    this.smoke.update(dt, this.views ? this.views[0].camera : this.camera);
    if (!this.views) { this.renderer.render(this.scene, this.camera); return; }
    const r = this.renderer, W = window.innerWidth, Hh = window.innerHeight, n = this.views.length;
    const w = Math.floor(W / n);
    r.setScissorTest(true);
    this.views.forEach((v, i) => {
      const x = w * i;                                  // hráč 1 vlevo, hráč 2 vpravo
      r.setViewport(x, 0, w, Hh); r.setScissor(x, 0, w, Hh);
      v.camera.aspect = w / Hh; v.camera.updateProjectionMatrix();
      if (v.focus) this.focusShadow(v.focus);           // stíny kolem auta daného hráče
      r.render(this.scene, v.camera);
    });
    r.setScissorTest(false);
    r.setViewport(0, 0, W, Hh);
  }
}

// ------------------------------------------------------------------ kouř (jeden draw call)
class Smoke {
  constructor(scene) {
    this.N = 500;
    this.pos = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    this.max = new Float32Array(this.N).fill(1);
    this.size = new Float32Array(this.N);
    this.alpha = new Float32Array(this.N);
    this.tint = new Float32Array(this.N);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 }, fogColor: { value: new THREE.Color(0xb9cde0) } },
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float size; attribute float alpha; attribute float tint; varying float vA; varying float vT;
        uniform float scale; void main(){ vA = alpha; vT = tint; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <common>
        #include <logdepthbuf_pars_fragment>
        varying float vA; varying float vT; void main(){
        #include <logdepthbuf_fragment>
        vec2 c = gl_PointCoord - 0.5; float d = dot(c,c)*4.0;
        if (d > 1.0) discard; float a = (1.0 - d) * (1.0 - d) * vA; vec3 col = vT < 1.5 ? mix(vec3(0.86,0.86,0.84), vec3(0.45,0.36,0.25), vT) : vT < 2.5 ? vec3(0.07,0.065,0.06) : vec3(1.0,0.5,0.12); if (vT > 2.5) a *= 1.6;
        gl_FragColor = vec4(col, a); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, v, amount = 1, tint = 0) {
    const i = this.i; this.i = (this.i + 1) % this.N;
    this.pos[i * 3] = p.x + (Math.random() - 0.5) * 0.3; this.pos[i * 3 + 1] = p.y + 0.15; this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
    this.vel[i * 3] = v.x * 0.3 + (Math.random() - 0.5) * 1.5; this.vel[i * 3 + 1] = 0.6 + Math.random() * 1.2; this.vel[i * 3 + 2] = v.z * 0.3 + (Math.random() - 0.5) * 1.5;
    this.max[i] = this.life[i] = 1.2 + Math.random() * 1.4;
    this.size[i] = 0.8; this.alpha[i] = 0.5 * amount; this.tint[i] = tint;
  }
  update(dt, camera) {
    this.points.material.uniforms.scale.value = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.max[i];
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 0.97; this.vel[i * 3 + 2] *= 0.97;
      this.size[i] = 0.8 + t * 5.5;
      this.alpha[i] = Math.max(0, (1 - t)) * 0.45 * (this.alpha[i] > 0 ? 1 : 0);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = a.tint.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

// ------------------------------------------------------------------ stopy smyku
class Skids {
  constructor(scene) {
    this.N = 4000;
    this.pos = new Float32Array(this.N * 4 * 3);
    this.col = new Float32Array(this.N * 4 * 4);
    const idx = new Uint32Array(this.N * 6);
    for (let i = 0; i < this.N; i++) { const b = i * 4; idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.i = 0;
    this.last = [null, null, null, null];
  }
  add(w, p, n, side, alpha) {
    const lift = 0.03;
    const L = p.clone().addScaledVector(side, 0.13).addScaledVector(n, lift);
    const R = p.clone().addScaledVector(side, -0.13).addScaledVector(n, lift);
    const last = this.last[w];
    this.last[w] = { L, R, a: alpha };
    if (!last || last.L.distanceTo(L) > 3 || last.L.distanceTo(L) < 0.05) { if (last && last.L.distanceTo(L) < 0.05) this.last[w] = last; return; }
    const i = this.i; this.i = (this.i + 1) % this.N;
    const P = this.pos, C = this.col, b = i * 12;
    [last.L, last.R, L, R].forEach((v, k) => { P[b + k * 3] = v.x; P[b + k * 3 + 1] = v.y; P[b + k * 3 + 2] = v.z; });
    const cb = i * 16;
    [last.a, last.a, alpha, alpha].forEach((a, k) => { C[cb + k * 4] = 0.05; C[cb + k * 4 + 1] = 0.05; C[cb + k * 4 + 2] = 0.05; C[cb + k * 4 + 3] = a * 0.55; });
    const g = this.mesh.geometry.attributes;
    g.position.needsUpdate = true; g.color.needsUpdate = true;
  }
  lift(w) { this.last[w] = null; }
  clear() { this.pos.fill(0); this.col.fill(0); this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true; this.last = [null, null, null, null]; }
}
