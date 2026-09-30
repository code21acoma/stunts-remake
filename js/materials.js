// Procedurální textury (canvas) a sdílené materiály.
import * as THREE from 'three';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function noise(ctx, w, h, base, amp, count, size = 1) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = (Math.random() - 0.5) * amp;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

function tex(c, repeat = [1, 1], aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeMaterials(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // asfalt: šířka textury = šířka silnice, výška = 10 m délky
  const asphaltC = canvas(512, 512, (g, w, h) => {
    noise(g, w, h, '#3a3c40', 0.18, 26000, 2);
    for (let i = 0; i < 40; i++) { // flíčky/opravy
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 6 + Math.random() * 30, Math.random() * 3, 0, 7); g.fill();
    }
    // stopy pneumatik ve středu jízdních pruhů
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (const x of [0.22, 0.32, 0.68, 0.78]) g.fillRect(x * w - 14, 0, 28, h);
    g.fillStyle = '#e8e8e0';
    g.fillRect(w * 0.035, 0, w * 0.012, h);
    g.fillRect(w * 0.953, 0, w * 0.012, h);
    g.fillStyle = '#f2d13a';
    g.fillRect(w * 0.494, 0, w * 0.012, h * 0.45);
  });
  // asfalt bez značení (střed křižovatky)
  const asphaltPlainC = canvas(256, 256, (g, w, h) => noise(g, w, h, '#3a3c40', 0.18, 7000, 2));
  // šotolina: hnědošedý štěrk s kamínky a vyjetými kolejemi, okraje s bílou čárou jako asfalt
  const gravelC = canvas(512, 512, (g, w, h) => {
    noise(g, w, h, '#8a7a62', 0.28, 30000, 2);
    for (let i = 0; i < 2600; i++) {
      const v = 90 + Math.random() * 110 | 0;
      g.fillStyle = `rgba(${v},${v - 8},${v - 22},0.9)`;
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2.2, Math.random() * 3, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(60,45,30,0.22)';
    for (const x of [0.25, 0.35, 0.65, 0.75]) g.fillRect(x * w - 16, 0, 32, h);
    g.fillStyle = 'rgba(232,232,224,0.7)';
    g.fillRect(w * 0.035, 0, w * 0.012, h); g.fillRect(w * 0.953, 0, w * 0.012, h);
  });
  // urychlovač: svítící šipky po směru jízdy (nahoru v textuře), tmavé pozadí
  const boostC = canvas(128, 256, (g, w, h) => {
    g.fillStyle = '#10151c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      const gr = g.createLinearGradient(0, y + 56, 0, y); gr.addColorStop(0, '#00c8ff'); gr.addColorStop(1, '#e8fbff');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(w * 0.5, y + 6); g.lineTo(w * 0.95, y + 40); g.lineTo(w * 0.95, y + 58); g.lineTo(w * 0.5, y + 26); g.lineTo(w * 0.05, y + 58); g.lineTo(w * 0.05, y + 40); g.closePath(); g.fill();
    }
  });
  // šrafování středu křižovatky (žluté pruhy, průhledné)
  const junctionC = canvas(256, 256, (g, w, h) => {
    g.strokeStyle = 'rgba(242,209,58,0.9)'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.lineWidth = 7;
    for (let i = -w; i < w * 2; i += 42) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); }
  });
  // dřevěná bedna: prkna, rám a nápis
  const crateC = canvas(128, 128, (g, w, h) => {
    noise(g, w, h, '#b07a3e', 0.18, 3000, 2);
    g.fillStyle = 'rgba(70,40,15,0.55)'; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
    g.fillStyle = '#7a4b1f'; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12); g.fillRect(0, 0, 12, h); g.fillRect(w - 12, 0, 12, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.fillRect(-4, -80, 8, 160); g.restore();
    g.fillStyle = 'rgba(30,15,5,0.75)'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.fillText('FRAGILE', w / 2, h / 2 + 32);
  });
  // olej: černá lesklá kaluž s duhovým okrajem a měkkou hranou
  const oilC = canvas(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(8,8,10,0.96)'); gr.addColorStop(0.7, 'rgba(12,10,20,0.9)'); gr.addColorStop(0.82, 'rgba(80,40,120,0.6)');
    gr.addColorStop(0.9, 'rgba(30,110,120,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, 7); g.fill();
  });
  // proudění vzduchu: průhledné bílé čárky (posouvají se napříč silnicí)
  const streakC = canvas(256, 256, (g, w, h) => {
    for (let i = 0; i < 40; i++) {
      const y = Math.random() * h, x = Math.random() * w, l = 30 + Math.random() * 80;
      const gr = g.createLinearGradient(x, 0, x + l, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x, y, l, 2);
    }
  });
  const concreteC = canvas(256, 256, (g, w, h) => noise(g, w, h, '#a7a39b', 0.12, 9000, 2));
  const darkC = canvas(256, 256, (g, w, h) => noise(g, w, h, '#57544f', 0.12, 9000, 2));
  const curbC = canvas(64, 128, (g, w, h) => {
    g.fillStyle = '#d42a24'; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = '#f1f1ec'; g.fillRect(0, h / 2, w, h / 2);
  });
  const hazardC = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#f1c21b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1b';
    for (let i = -h; i < w + h; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - h, h); g.lineTo(i - h, h); g.fill(); }
  });
  const barrierC = canvas(256, 64, (g, w, h) => {
    noise(g, w, h, '#c9c6bf', 0.1, 3000, 2);
    g.fillStyle = '#d42a24'; for (let i = 0; i < w; i += 64) g.fillRect(i, h * 0.1, 32, h * 0.25);
  });
  const checkerC = canvas(256, 64, (g, w, h) => {
    const s = 16;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      g.fillStyle = ((x + y) / s) % 2 ? '#111' : '#f5f5f5'; g.fillRect(x, y, s, s);
    }
  });
  const bannerC = canvas(1024, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d7261e'); gr.addColorStop(1, '#8a120d');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = 'bold 84px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('START  ◆  CÍL', w / 2, h / 2 + 4);
  });
  const grassC = canvas(512, 512, (g, w, h) => {
    noise(g, w, h, '#5b7f3c', 0.2, 60000, 2);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,135,60' : '55,85,35'},0.22)`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 5 + Math.random() * 25, 0, 7); g.fill();
    }
  });
  const barkC = canvas(64, 128, (g, w, h) => { noise(g, w, h, '#5a3d27', 0.3, 3000, 2); });
  const windowC = canvas(128, 128, (g, w, h) => {
    noise(g, w, h, '#e9e2d0', 0.08, 2000, 2);
    for (let y = 16; y < h; y += 56) for (let x = 14; x < w; x += 58) {
      g.fillStyle = '#2d4c66'; g.fillRect(x, y, 40, 32); g.fillStyle = '#fff'; g.fillRect(x + 19, y, 2, 32); g.fillRect(x, y + 15, 40, 2);
    }
  });
  const roofC = canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#8f3524'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 12) g.fillRect(0, y, w, 2);
    for (let y = 0; y < h; y += 12) for (let x = (y / 12 % 2) * 8; x < w; x += 16) g.fillRect(x, y, 2, 12);
  });
  const crowdC = canvas(256, 128, (g, w, h) => {
    g.fillStyle = '#39414d'; g.fillRect(0, 0, w, h);
    const cols = ['#d94f3d', '#f2c14e', '#3b82c4', '#e8e8e8', '#5fae57', '#aa66cc', '#1f1f1f'];
    for (let y = 4; y < h; y += 16) for (let x = 2; x < w; x += 9) {
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(x, y + 5, 7, 9);
      g.fillStyle = '#e0b48f'; g.beginPath(); g.arc(x + 3.5, y + 3, 3, 0, 7); g.fill();
    }
  });

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const boostT = tex(boostC, [1, 6], aniso);
  const streakT = tex(streakC, [2, 3], aniso);   // proudění větru (posouvá se – viz main.js)   // šipky urychlovače (posouvají se – viz main.js)
  const M = {
    asphalt: std({ map: tex(asphaltC, [1, 1], aniso), roughness: 0.92, metalness: 0 }),
    concrete: std({ map: tex(concreteC, [1, 1], aniso), roughness: 0.85 }),
    dark: std({ map: tex(darkC, [1, 1], aniso), roughness: 0.9 }),
    curb: std({ map: tex(curbC, [1, 1], aniso), roughness: 0.7 }),
    barrier: std({ map: tex(barrierC, [1, 1], aniso), roughness: 0.8 }),
    hazard: std({ map: tex(hazardC, [1, 1], aniso), roughness: 0.6 }),
    checker: std({ map: tex(checkerC, [1, 1], aniso), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
    banner: std({ map: tex(bannerC, [1, 1], aniso), roughness: 0.6, emissive: 0x220000 }),
    grass: std({ map: tex(grassC, [1, 1], aniso), roughness: 1 }),
    sand: std({ color: 0xcdb888, roughness: 1 }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x1d5d7a, roughness: 0.05, metalness: 0.1, transmission: 0, clearcoat: 1, transparent: true, opacity: 0.88 }),
    steel: std({ color: 0xc8322a, roughness: 0.4, metalness: 0.6 }),
    metal: std({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.9 }),
    lamp: std({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 3 }),
    bark: std({ map: tex(barkC, [1, 2]), roughness: 1 }),
    leaves: std({ color: 0x2f6b2a, roughness: 0.9, flatShading: true }),
    leaves2: std({ color: 0x3f8a33, roughness: 0.9, flatShading: true }),
    wall: std({ map: tex(windowC, [1, 1]), roughness: 0.9 }),
    roof: std({ map: tex(roofC, [1, 1]), roughness: 0.8, side: THREE.DoubleSide }),
    crowd: std({ map: tex(crowdC, [1, 1]), roughness: 0.9 }),
    rock: std({ color: 0x77736b, roughness: 1, flatShading: true }),
    asphaltPlain: std({ map: tex(asphaltPlainC, [2, 2], aniso), roughness: 0.92 }),
    gravel: std({ map: tex(gravelC, [1, 1], aniso), roughness: 1 }),
    boost: std({ map: boostT, emissive: 0xffffff, emissiveMap: boostT, emissiveIntensity: 1.3, roughness: 0.4,
      polygonOffset: true, polygonOffsetFactor: -3 }),
    boostEdge: std({ color: 0x00c8ff, emissive: 0x00c8ff, emissiveIntensity: 2 }),
    crate: std({ map: tex(crateC, [1, 1], aniso), roughness: 0.85 }),
    oil: new THREE.MeshPhysicalMaterial({ map: tex(oilC, [1, 1], aniso), transparent: true, depthWrite: false, roughness: 0.05, metalness: 0.4, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -4 }),
    windStreak: std({ map: streakT, transparent: true, opacity: 0.35, depthWrite: false, emissive: 0xffffff, emissiveMap: streakT, emissiveIntensity: 0.4, side: THREE.DoubleSide }),
    rubber: std({ color: 0x1f6fd8, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -3 }),
    fire: std({ color: 0x000000, emissive: 0xff3a08, emissiveIntensity: 2.5, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }),
    fireCore: std({ color: 0x000000, emissive: 0xffc233, emissiveIntensity: 2.8, roughness: 1, transparent: true, opacity: 0.9, depthWrite: false }),
    junction: std({ map: tex(junctionC, [1, 1], aniso), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }),
  };
  M.grassTex = grassC;
  M.makeGrassTexture = (rep) => tex(grassC, [rep, rep], aniso);
  return M;
}
