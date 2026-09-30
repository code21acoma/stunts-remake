// Generátor složitých tratí.
//  1) náhodný „polyomino" tvar z bloků (bez děr) → trať vede po jeho obvodu (zatáčky vpravo i vlevo),
//  2) obvod se zvětší (blok = K dílků) a převede na posloupnost rohů a volných pozic,
//  3) rohy se vylepší (velká / klopená / tunelová zatáčka), na rovinky se rozmístí prvky
//     (estakáda se spirálou a mosty, looping, skok, tunel, překážky, hrboly),
//  4) výsledek se ověří želvou (bez kolizí, uzavřená trať).
//   node tools/trackgen.mjs            → vypíše pole tratí pro js/tracks.js
import { turtle, rng } from '../js/tracks.js';
import { analyze, DELTA } from '../js/defs.js';

const K = 4;                       // velikost bloku v dílcích

// ------------------------------------------------------------ tvar
function polyomino(r, n, W, H) {
  const set = new Set(), k = (x, y) => x + ',' + y;
  set.add(k(W >> 1, H >> 1));
  let guard = 0;
  while (set.size < n && guard++ < 5000) {
    const [x, y] = [...set][Math.floor(r() * set.size)].split(',').map(Number);
    const [dx, dy] = DELTA[Math.floor(r() * 4)];
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) set.add(k(nx, ny));
  }
  // zaplnit díry (vše, kam se nedá dostat zvenku)
  const out = new Set(), st = [[-1, -1]];
  while (st.length) {
    const [x, y] = st.pop();
    if (x < -1 || y < -1 || x > W || y > H || out.has(k(x, y)) || set.has(k(x, y))) continue;
    out.add(k(x, y));
    for (const [dx, dy] of DELTA) st.push([x + dx, y + dy]);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!out.has(k(x, y))) set.add(k(x, y));
  return set;
}

// obvod po směru hodin (vnitřek vpravo) → pole směrů jednotkových hran + počáteční vrchol
function boundary(set) {
  const has = (x, y) => set.has(x + ',' + y);
  const edges = new Map();
  const add = (x0, y0, x1, y1, d) => { const key = x0 + ',' + y0; if (edges.has(key)) edges.set(key, null); else edges.set(key, { x1, y1, d }); };
  for (const c of set) {
    const [x, y] = c.split(',').map(Number);
    if (!has(x, y - 1)) add(x, y, x + 1, y, 1);
    if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1, 2);
    if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1, 3);
    if (!has(x - 1, y)) add(x, y + 1, x, y, 0);
  }
  if ([...edges.values()].includes(null)) return null;       // zúžení v jednom bodě
  const [start] = edges.keys();
  const dirs = [], verts = [];
  let cur = start;
  do {
    const e = edges.get(cur);
    verts.push(cur.split(',').map(Number)); dirs.push(e.d);
    cur = e.x1 + ',' + e.y1;
  } while (cur !== start && dirs.length <= edges.size);
  if (dirs.length !== edges.size) return null;
  return { dirs, verts };
}

// ------------------------------------------------------------ trať z obvodu
function buildTrack(seed, diff) {
  const r = rng(seed);
  // velikost tvaru: ★ malé okruhy, od ★★ dlouhé a členité tratě přes velkou část mapy
  const cells = [4, 12, 16, 20][diff - 1] + Math.floor(r() * [2, 4, 5, 6][diff - 1]);
  const W = [5, 7, 8, 8][diff - 1], Hh = [4, 6, 7, 8][diff - 1];
  const shape = polyomino(r, cells, W, Hh);
  const b = boundary(shape);
  if (!b) return null;
  // úseky (sloučené rovné hrany)
  let runs = [];
  for (let i = 0; i < b.dirs.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.dir === b.dirs[i]) last.len++;
    else runs.push({ dir: b.dirs[i], len: 1, v: b.verts[i] });
  }
  if (runs.length > 1 && runs[0].dir === runs[runs.length - 1].dir) { const l = runs.pop(); runs[0].len += l.len; runs[0].v = l.v; }
  if (runs.length < 4) return null;
  // položky: roh + volné pozice
  const R = runs.map((run, i) => {
    const prev = runs[(i + runs.length - 1) % runs.length].dir;
    return { dir: run.dir, v: run.v, turn: run.dir === (prev + 1) % 4 ? 'R' : 'L', corner: null, slots: Array(run.len * K - 1).fill('S') };
  });
  // start doprostřed nejdelšího úseku
  let si = 0; R.forEach((q, i) => { if (q.slots.length > R[si].slots.length) si = i; });
  const sPos = Math.floor(R[si].slots.length / 2);
  R[si].slots[sPos] = 'F';
  const free = (q, j) => j >= 0 && j < q.slots.length && q.slots[j] === 'S';

  const pick = (p) => r() < p;
  // --- rohy
  R.forEach((q, i) => {
    const pr = R[(i + R.length - 1) % R.length];
    const pj = pr.slots.length - 1;
    const canWide = free(pr, pj) && free(q, 0) && pr.slots.length >= 3 && q.slots.length >= 3;
    const x = r();
    if (canWide && x < 0.28) { pr.slots[pj] = ''; q.slots[0] = ''; q.corner = q.turn === 'R' ? 'P' : 'Q'; }
    else if (canWide && x < 0.52) { pr.slots[pj] = q.turn === 'R' ? 'c' : 'a'; q.slots[0] = q.turn === 'R' ? 'd' : 'b'; q.corner = q.turn === 'R' ? 'r' : 'l'; }
    else if (canWide && x < 0.58 && diff >= 2) { pr.slots[pj] = ''; q.slots[0] = ''; q.corner = q.turn === 'R' ? 'G' : 'N'; }
    else if (x < 0.66 && diff >= 2) { q.corner = q.turn === 'R' ? 'W' : 'M'; if (free(pr, pj)) pr.slots[pj] = 'T'; if (free(q, 0)) q.slots[0] = 'T'; }
    else q.corner = q.turn;
  });
  // --- prvky na rovinkách
  const runFree = (q, a, n) => { for (let j = a; j < a + n; j++) if (!free(q, j)) return false; return true; };
  const place = (q, a, toks) => toks.forEach((t, j) => { q.slots[a + j] = t; });
  const tryFeature = (len, lead, toks, tries = 30) => {
    for (let t = 0; t < tries; t++) {
      const q = R[Math.floor(r() * R.length)];
      if (q.slots.length < len + lead) continue;
      const a = lead + Math.floor(r() * (q.slots.length - len - lead + 1));
      if (runFree(q, a - lead, len + lead)) { place(q, a, toks); return true; }
    }
    return false;
  };
  const feats = [];
  const count = (arr) => arr[diff - 1] + (pick(0.5) ? 1 : 0);   // počet prvků podle obtížnosti (+ náhoda)
  if (diff === 1) {
    for (let k = 0; k < 1; k++) if (pick(0.5)) { if (tryFeature(1, 1, [pick(0.5) ? 'X' : 'Z'])) feats.push('překážky'); }
    for (let k = 0; k < 2; k++) if (pick(0.5)) { if (tryFeature(1, 0, ['K'])) feats.push('hrboly'); }
  } else {
    // estakády: spirála (vlevo H / vpravo h) nebo dlouhé stoupání A E u; mosty a rovinky v patře;
    // sjezd rampou nebo dlouhým klesáním n s m; za sjezdem 2 rovinky na dobrzdění
    for (let k = 0; k < count([0, 1, 1, 2]); k++) {
      const v = r();
      const up = v < 0.35 ? ['H', ''] : v < 0.5 ? ['h', ''] : v < 0.8 ? ['A', '', 'E', 'u', ''] : ['U'];
      const mid = Array(1 + Math.floor(r() * 3)).fill(0).map(() => (pick(0.6) ? 'B' : 'S'));
      const down = up.length > 2 || pick(0.4) ? ['n', '', 's', 'm', '', 'S', 'S'] : ['D', 'S', 'S'];
      const toks = [...up, ...mid, ...down];
      if (tryFeature(toks.length, 2, toks, 50)) feats.push(up[0] === 'H' || up[0] === 'h' ? 'spirála' : up[0] === 'A' ? 'stoupání' : 'estakáda', mid.includes('B') ? 'most' : '');
    }
    // looping: za výjezdem 2 rovinky na dobrzdění (hned zatáčka = auto nestihne zabrat)
    for (let k = 0; k < count([0, 0, 1, 2]); k++) if (tryFeature(4, 3, ['O', '', 'S', 'S'])) feats.push('looping');
    for (let k = 0; k < count([0, 0, 1, 1]); k++) if (tryFeature(4, 4, ['J', '', '', 'S'])) feats.push('skok');
    if (diff >= 3 && pick(diff === 4 ? 0.9 : 0.6)) { const toks = pick(0.5) ? ['I', 'V', 'V', 'i'] : ['I', 'V', 'i']; if (tryFeature(toks.length, 2, toks)) feats.push('roura'); }
    for (let k = 0; k < count([0, 1, 1, 1]); k++) if (tryFeature(5, 1, pick(0.5) ? ['x', '', 'S', 'y', ''] : ['y', '', 'S', 'x', ''])) feats.push('esíčka');
    for (let k = 0; k < count([0, 0, 1, 1]); k++) if (tryFeature(1, 2, ['k'])) feats.push('slalom');
    for (let k = 0; k < count([0, 1, 1, 2]); k++) { const n = 1 + Math.floor(r() * 3); if (tryFeature(n, 0, Array(n).fill('T'))) feats.push('tunel'); }
    for (let k = 0; k < diff + 1; k++) if (pick(0.5)) { if (tryFeature(1, 1, [pick(0.5) ? 'X' : 'Z'])) feats.push('překážky'); }
    for (let k = 0; k < 3; k++) if (pick(0.5)) { if (tryFeature(1, 0, ['K'])) feats.push('hrboly'); }
  }
  // --- příkazy od startu
  const seq = [];
  const q0 = R[si];
  seq.push(...q0.slots.slice(sPos));
  for (let i = 1; i < R.length; i++) { const q = R[(si + i) % R.length]; seq.push(q.corner, ...q.slots); }
  seq.push(q0.corner, ...q0.slots.slice(0, sPos));
  const cmd = seq.filter(Boolean).join('');
  // pozice startu (dílky): vrchol úseku × K + posun
  const ox = 3, oy = 3;
  const sx = ox + q0.v[0] * K + DELTA[q0.dir][0] * (sPos + 1), sy = oy + q0.v[1] * K + DELTA[q0.dir][1] * (sPos + 1);
  const corners = R.length;
  return { cmd, x: sx, y: sy, dir: q0.dir, corners, feats: [...new Set(feats.filter(Boolean))] };
}

export function generate(seed, diff, need = []) {
  for (let k = 0; k < 400; k++) {
    const t = buildTrack(seed * 1000 + k, diff);
    if (!t || t.corners < [6, 12, 14, 16][diff - 1]) continue;
    if (need.some(f => !t.feats.includes(f))) continue;       // povinné prvky (podle názvu trati)
    try {
      const { tiles, end } = turtle(t.x, t.y, t.dir, t.cmd);
      if (end.x !== t.x || end.y !== t.y || end.dir !== t.dir || end.e !== 0 || end.bank !== 0) continue;
      if (!analyze(tiles).closed) continue;
      if (tiles.some(p => p.x < 1 || p.y < 1 || p.x > 38 || p.y > 38)) continue;
      return { ...t, seed: seed * 1000 + k };
    } catch { /* kolize – zkusit jiné rozmístění */ }
  }
  return null;
}

// popis trati z jejích prvků
export function describe(t) {
  const f = t.feats, parts = [`${t.corners} zatáček`];
  const n = (s, a, b, c) => (s === 1 ? a : s < 5 ? b : c);
  const cnt = s => (t.cmd.match(new RegExp(s, 'g')) || []).length;
  if (cnt('[rl]')) parts.push(`${cnt('[rl]')} ${n(cnt('[rl]'), 'klopená', 'klopené', 'klopených')}`);
  if (cnt('[WMGN]')) parts.push(`${cnt('[WMGN]')} v tunelu`);
  const extra = [];
  const spir = cnt('[Hh]'), climb = cnt('A');
  if (spir) extra.push(spir > 1 ? `${spir} spirály` : 'spirála na estakádu');
  if (climb) extra.push(climb > 1 ? `${climb} dlouhá stoupání` : 'dlouhé stoupání');
  if (!spir && !climb && cnt('U')) extra.push('estakáda');
  if (cnt('B')) extra.push(n(cnt('B'), 'most přes řeku', 'mosty přes řeku', 'mostů'));
  if (cnt('O')) extra.push(cnt('O') > 1 ? `${cnt('O')} loopingy` : 'looping');
  if (cnt('J')) extra.push(cnt('J') > 1 ? `${cnt('J')} skoky` : 'skok přes mezeru');
  if (cnt('I')) extra.push('roura');
  if (cnt('x')) extra.push('esíčka');
  if (cnt('k')) extra.push('slalom s kužely');
  if (cnt('T') > cnt('[WMGN]') * 2) extra.push('tunely');
  if (cnt('[XZ]')) extra.push('překážky');
  if (cnt('K')) extra.push('hrboly');
  return parts.join(', ') + (extra.length ? '; ' + extra.join(', ') : '') + '.';
}

// spuštění z příkazové řádky: node tools/trackgen.mjs '[[seed, obtížnost, "id", "Název"], ...]'
//   → vypíše řádky pole GENERATED pro js/tracks.js
if (process.argv[1] && process.argv[1].endsWith('trackgen.mjs')) {
  const arg = process.argv[2] || '[]';
  const list = JSON.parse(arg.endsWith('.json') ? (await import('node:fs')).readFileSync(arg, 'utf8') : arg);
  for (const [seed, diff, id, name, need] of list) {
    const t = generate(seed, diff, need || []);
    if (!t) { console.log(`// ${id}: NENALEZENO`); continue; }
    console.log(`  [${JSON.stringify(id)}, ${JSON.stringify(name)}, ${JSON.stringify(describe(t))}, ${diff}, ${t.x}, ${t.y}, ${t.dir}, ${JSON.stringify(t.cmd)}],`);
  }
}
