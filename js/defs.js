// Čistá data dílků trati (bez závislosti na three.js) – použitelné i v Node pro testy.
export const T = 40;          // velikost dlaždice (m)
export const H = 5;           // výška jednoho patra (m)
export const GRID = 40;       // mapa GRID x GRID dlaždic
export const ROAD_HALF = 5;   // polovina šířky silnice

// strany: 0 = S(ever, -z), 1 = V(ýchod, +x), 2 = J(ih, +z), 3 = Z(ápad, -x)
export const DELTA = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const opp = s => (s + 2) % 4;

// port: c = buňka, s = strana, h = výška (patro), kind = road/jump/land,
// b = klopení při pohledu ven z dílku (+1 zvednutá pravá strana, -1 levá, 0 rovně).
// Dva porty na sebe navazují, když mají stejnou výšku a b1 === -b2.
const P = (s, h = 0, kind = 'road', c = [0, 0], b = 0) => ({ c, s, h, kind, b });
const B = (s, b) => P(s, 0, 'road', [0, 0], b);

// ports[2k] a ports[2k+1] tvoří jednu cestu k (u = 0 → 1). Většina dílků má jednu cestu,
// podjezd má dvě (spodní a horní silnici).
export const PIECES = {
  start:    { name: 'Start / Cíl',      icon: '🏁', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  straight: { name: 'Rovinka',          icon: '┃',  cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  straightRails: { name: 'Rovinka se svodidly', icon: '╟', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  curveRails: { name: 'Zatáčka se svodidly', icon: '╚', cat: 'road', cells: [[0, 0]], ports: [P(0), P(1)] },
  bigcurveRails: { name: 'Velká zatáčka se svodidly', icon: '◠', cat: 'road', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [0, 0]), P(1, 0, 'road', [1, 1])] },
  curve:    { name: 'Zatáčka',          icon: '┗',  cat: 'road', cells: [[0, 0]], ports: [P(0), P(1)] },
  bigcurve: { name: 'Velká zatáčka',    icon: '◠',  cat: 'road', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [0, 0]), P(1, 0, 'road', [1, 1])] },
  // esíčko: dvě protisměrné zatáčky, ven stejným směrem o políčko vedle (L = nejdřív doleva)
  sbendL:   { name: 'Esíčko L',         icon: '⥼',  cat: 'road', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [0, 0]), P(2, 0, 'road', [1, 1])] },
  sbendR:   { name: 'Esíčko P',         icon: '⥽',  cat: 'road', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [1, 0]), P(2, 0, 'road', [0, 1])] },
  ramp:     { name: 'Rampa (krátká)',   icon: '◢',  cat: 'road', cells: [[0, 0]], ports: [P(0, 0), P(2, 1)] },
  // dlouhé stoupání: nájezd (2 pole, obloukem z roviny do sklonu 12,5 %) + rovné stoupání + dojezd (obloukem do roviny);
  // každý dílek stoupá o 1 patro, sklony na sebe plynule navazují
  rampIn:   { name: 'Stoupání – nájezd (oblouk)', icon: '◞', cat: 'road', cells: [[0, 0], [0, 1]],
              ports: [P(0, 0, 'road', [0, 0]), P(2, 1, 'road', [0, 1])] },
  rampS:    { name: 'Stoupání – rovné', icon: '⟋', cat: 'road', cells: [[0, 0]], ports: [P(0, 0), P(2, 1)] },
  rampOut:  { name: 'Stoupání – dojezd (oblouk)', icon: '◜', cat: 'road', cells: [[0, 0], [0, 1]],
              ports: [P(0, 0, 'road', [0, 0]), P(2, 1, 'road', [0, 1])] },
  spiral:   { name: 'Spirála L (nájezd na most)', icon: '🌀', cat: 'road', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [0, 0]), P(2, 1, 'road', [0, 1])] },
  spiralR:  { name: 'Spirála P (nájezd na most)', icon: '🌀', cat: 'road', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [1, 0]), P(2, 1, 'road', [1, 1])] },
  cross:    { name: 'Podjezd pod mostem', icon: '╬', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2), P(1, 1), P(3, 1)] },
  bridge:   { name: 'Most přes řeku',   icon: '🌉', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)], minE: 1 },
  bridgeDry:{ name: 'Most (bez řeky)',  icon: '🌁', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)], minE: 1 },
  // portál: sever (port 0) = otevřený zářez do kopce, jih (port 1) = navazuje na tunel
  tunnelPortal: { name: 'Tunel – portál (vjezd)', icon: '🕳', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)], maxE: 0 },
  tunnel:   { name: 'Tunel',            icon: '🚇', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)], maxE: 0 },
  // tunel S–J a přes kopec nad ním most V–Z o dvě patra výš (kopec je vysoký 10 m)
  tunnelBridge: { name: 'Tunel s mostem nad ním', icon: '⛰', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2), P(1, 2), P(3, 2)], maxE: 0 },
  tunnelCurve: { name: 'Tunel – zatáčka', icon: '↩', cat: 'road', cells: [[0, 0]], ports: [P(0), P(1)], maxE: 0 },
  tunnelBig: { name: 'Tunel – velká zatáčka', icon: '⤿', cat: 'road', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [0, 0]), P(1, 0, 'road', [1, 1])], maxE: 0 },
  loop:     { name: 'Looping (2 pole)', icon: '➰', cat: 'road', cells: [[0, 0], [0, 1]],
              ports: [P(0, 0, 'road', [0, 0]), P(2, 0, 'road', [0, 1])] },
  // roura (klasika ze Stunts): vjezd = silnice se postupně stočí do trubky, v rouře se dá jezdit i po stěnách.
  // Konce roury mají port druhu 'pipe' – navazují jen na rouru.
  pipeIn:   { name: 'Roura – vjezd/výjezd', icon: '◔', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2, 0, 'pipe')] },
  pipe:     { name: 'Roura',            icon: '◯', cat: 'road', cells: [[0, 0]], ports: [P(0, 0, 'pipe'), P(2, 0, 'pipe')] },
  // roura se zátarasem přes celé dno – projet se dá jen bokem po stěně roury
  pipeObst: { name: 'Roura s překážkou', icon: '⊘', cat: 'road', cells: [[0, 0]], ports: [P(0, 0, 'pipe'), P(2, 0, 'pipe')] },
  cones:    { name: 'Slalom (kužely)',  icon: '🔺', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  // nové dílky
  roadText: { name: 'Nápis na silnici', icon: '🅰', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  crossFlat:{ name: 'Křižovatka',       icon: '✚', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2), P(1), P(3)], maxE: 0 },
  gravel:   { name: 'Šotolina',         icon: '▒', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  chicane:  { name: 'Šikana (zídky)',   icon: '⫶', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  boost:    { name: 'Urychlovač',       icon: '⏩', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  waves:    { name: 'Vlny (vlnovka)',   icon: '∿', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  crates:   { name: 'Bedny (prorazit)', icon: '📦', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  pendulum: { name: 'Demoliční koule',  icon: '⚫', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  wind:     { name: 'Boční vítr',       icon: '🌀', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  oil:      { name: 'Olejové skvrny',   icon: '🛢', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  sideRamp: { name: 'Boční rampa (na dvě kola)', icon: '◺', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  trampoline:{ name: 'Trampolína',      icon: '⤒', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  crusher:  { name: 'Lis (drtič)',      icon: '⏸', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  spinner:  { name: 'Rotující rameno',  icon: '✢', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  hammer:   { name: 'Buchary',          icon: '🔨', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  railroad: { name: 'Železniční přejezd', icon: '🚂', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)], maxE: 0 },
  bollards: { name: 'Zvedací sloupky',  icon: '⫼', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  fireRing: { name: 'Ohnivý kruh (do mezery skoku)', icon: '🔥', cat: 'deco', cells: [[0, 0]], ports: [] },
  kicker:   { name: 'Skokánek',         icon: '⤴',  cat: 'road', cells: [[0, 0]], ports: [P(0), P(2, 0, 'jump')] },
  landing:  { name: 'Dopad',            icon: '⤵',  cat: 'road', cells: [[0, 0]], ports: [P(0, 0, 'land'), P(2)] },
  obstacleC:{ name: 'Překážka uprostřed', icon: '⛔', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  obstacleS:{ name: 'Překážky po stranách', icon: '⛓', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  bumps:    { name: 'Hrboly',           icon: '〰', cat: 'road', cells: [[0, 0]], ports: [P(0), P(2)] },
  // klopení
  bankInL:  { name: 'Nájezd do klopení L', icon: '⟋', cat: 'bank', cells: [[0, 0]], ports: [B(0, 0), B(2, 1)] },
  bankInR:  { name: 'Nájezd do klopení P', icon: '⟍', cat: 'bank', cells: [[0, 0]], ports: [B(0, 0), B(2, -1)] },
  bankOutL: { name: 'Sjezd z klopení L', icon: '⟋', cat: 'bank', cells: [[0, 0]], ports: [B(0, -1), B(2, 0)] },
  bankOutR: { name: 'Sjezd z klopení P', icon: '⟍', cat: 'bank', cells: [[0, 0]], ports: [B(0, 1), B(2, 0)] },
  bankS:    { name: 'Klopená rovinka',   icon: '▱', cat: 'bank', cells: [[0, 0]], ports: [B(0, -1), B(2, 1)] },
  bankCL:   { name: 'Klopená zatáčka L', icon: '↰', cat: 'bank', cells: [[0, 0]], ports: [B(0, -1), B(1, 1)] },
  bankCR:   { name: 'Klopená zatáčka P', icon: '↱', cat: 'bank', cells: [[0, 0]], ports: [B(0, 1), B(3, -1)] },
  // velká klopená zatáčka (2×2, poloměr 60 m jako velká zatáčka); napojuje se nájezdem/sjezdem z klopení
  bankBigL: { name: 'Velká klopená zatáčka L', icon: '◠', cat: 'bank', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [0, 0], -1), P(1, 0, 'road', [1, 1], 1)] },
  bankBigR: { name: 'Velká klopená zatáčka P', icon: '◡', cat: 'bank', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
              ports: [P(0, 0, 'road', [1, 0], 1), P(3, 0, 'road', [0, 1], -1)] },
  // starší dílky (kvůli uloženým tratím, v paletě nejsou)
  bank:     { name: 'Klopená zatáčka (stará)', icon: '◜', cat: 'road', hidden: true, cells: [[0, 0]], ports: [P(0), P(1)] },
  slalom:   { name: 'Slalom (starý)',   icon: '⛔', cat: 'road', hidden: true, cells: [[0, 0]], ports: [P(0), P(2)] },
  // dekorace
  trees:    { name: 'Stromy',           icon: '🌲', cat: 'deco', cells: [[0, 0]], ports: [] },
  house:    { name: 'Domy',             icon: '🏠', cat: 'deco', cells: [[0, 0]], ports: [] },
  river:    { name: 'Řeka',             icon: '🌊', cat: 'deco', cells: [[0, 0]], ports: [] },
  riverCurve: { name: 'Řeka – zatáčka',  icon: '↪',  cat: 'deco', cells: [[0, 0]], ports: [] },
  lake:     { name: 'Jezírko',          icon: '💧', cat: 'deco', cells: [[0, 0]], ports: [] },
  stand:    { name: 'Tribuna',          icon: '🏟', cat: 'deco', cells: [[0, 0]], ports: [] },
  wall:     { name: 'Zeď (navazuje)',   icon: '🧱', cat: 'deco', cells: [[0, 0]], ports: [] },
  billboard:{ name: 'Billboard s textem', icon: '🪧', cat: 'deco', cells: [[0, 0]], ports: [] },
};

// dílky s loopingem (stěna/strop je silnice, ne náraz)
export const LOOPS = { loop: 1, pipe: 1, pipeIn: 1, pipeObst: 1 };
// zátaras v rouře s překážkou: úhel od dna (±), výška a polovina délky (m)
export const PIPE_OBST = { ang: 0.63, h: 1.1, half: 1.5 };

export const isRoad =type => PIECES[type].cat !== 'deco';

// kategorie dílků v paletě editoru (dílek, který v žádné není, spadne do "Ostatní")
export const GROUPS = [
  ['road', 'Silnice', ['start', 'straight', 'straightRails', 'curve', 'curveRails', 'bigcurveRails', 'bigcurve', 'sbendL', 'sbendR', 'crossFlat', 'roadText', 'gravel']],
  ['elev', 'Stoupání a mosty', ['ramp', 'rampIn', 'rampS', 'rampOut', 'spiral', 'spiralR', 'cross', 'bridge', 'bridgeDry']],
  ['bank', 'Klopení', ['bankInL', 'bankInR', 'bankOutL', 'bankOutR', 'bankS', 'bankCL', 'bankCR', 'bankBigL', 'bankBigR']],
  ['tunnel', 'Tunely', ['tunnelPortal', 'tunnel', 'tunnelCurve', 'tunnelBig', 'tunnelBridge']],
  ['stunt', 'Triky a skoky', ['loop', 'kicker', 'landing', 'fireRing', 'trampoline', 'sideRamp', 'pipeIn', 'pipe', 'pipeObst', 'waves', 'boost']],
  ['trap', 'Pohyblivé pasti', ['pendulum', 'crusher', 'spinner', 'hammer', 'railroad', 'bollards', 'wind']],
  ['obst', 'Překážky', ['cones', 'crates', 'chicane', 'oil', 'obstacleC', 'obstacleS', 'bumps']],
  ['deco', 'Dekorace', ['trees', 'house', 'lake', 'river', 'riverCurve', 'stand', 'wall', 'billboard']],
];
// parametry nových překážek (sdílí geometrie, fyzika i autopilot) – souřadnice dílku, dílek se projíždí k +z
export const PENDULUM = { pivotY: 12.5, len: 10.5, r: 1.5, amp: 1.0, period: 3.4 };   // koule kmitá napříč silnicí
export const WIND = { acc: 22.5, fanX: 9 };           // m/s² od ventilátorů na straně +x k −x (s poryvy)
export const OIL = [[-2.2, -9, 2.4], [2.1, 2, 2.8], [-1.4, 12, 2.0]];   // skvrny: x, z, poloměr
export const SIDE_RAMP = { x0: 0.4, x1: 5, h: 0.95, z: [-15, -6, 6, 14] };   // klín pod polovinou silnice: stoupá, drží, klesá
export const TRAMPOLINE = { hx: 4, z0: -3, z1: 3, kick: 11 };   // plocha: polovina šířky, od–do z; svislá rychlost (m/s)
// ---- pohyblivé pasti: rozměry a časování (čisté funkce času t v sekundách, ph = fáze dílku)
const smooth01 = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const mod = (a, b) => ((a % b) + b) % b;
export const hazardPhase = t => ((t.x * 7.31 + t.y * 3.17) % 10);   // každý dílek jinak
// lis: dva bloky (polovina rozměrů hx, hy, hz) sjíždějí z krajů do středu
export const CRUSHER = { hx: 2.6, hy: 1.7, hz: 1.7, open: 8.2, closed: 2.6, period: 4.2 };
export function crusherX(time, ph) {   // poloha středu bloku (|x|); otevřeno → zavřeno prudce, otevírání pomalé
  const tt = mod(time + ph, CRUSHER.period), { open, closed } = CRUSHER;
  const f = tt < 1.8 ? 0 : tt < 2.15 ? ((tt - 1.8) / 0.35) ** 2 : tt < 2.9 ? 1 : 1 - smooth01((tt - 2.9) / 1.3);
  return open + (closed - open) * f;
}
// rotující rameno kolem sloupu uprostřed silnice
export const SPINNER = { arm: 5.2, hy: 0.35, hz: 0.3, y: 1.0, omega: 0.8, post: 0.7, lane: 3.9 };   // lane = objížďka soupeře od středu
export const spinnerYaw = (time, ph) => SPINNER.omega * time + ph;
// buchary: dvě hlavy (x = ±x, polovina rozměrů h) střídavě dopadají
export const HAMMER = { x: 2.9, h: 1.55, hy: 1.0, top: 6.2, period: 2.6 };
export function hammerY(k, time, ph) {   // výška spodní hrany hlavy nad vozovkou
  const tt = mod(time + ph + k * HAMMER.period / 2, HAMMER.period);
  if (tt < 1.1) return HAMMER.top;
  if (tt < 1.35) return HAMMER.top * (1 - ((tt - 1.1) / 0.25) ** 2);   // volný pád
  if (tt < 1.75) return 0.02;
  return HAMMER.top * smooth01((tt - 1.75) / 0.85);
}
// železniční přejezd: vlak (2 vozy) projíždí napříč silnicí mezi dvěma kůlnami, závory a světla předem varují
export const TRAIN = { period: 11, speed: 26, from: -36, to: 36, car: 8.5, gap: 0.6, hz: 1.6, hy: 1.95 };
export function trainX(time, ph) {   // poloha středu lokomotivy (null = vlak není na dílku)
  const tt = mod(time + ph, TRAIN.period), x = TRAIN.from + TRAIN.speed * tt;
  return x <= TRAIN.to + TRAIN.car * 2 ? x : null;
}
export function trainWarn(time, ph) {   // závory dole / světla blikají
  const tt = mod(time + ph, TRAIN.period);
  return tt > TRAIN.period - 2.6 || tt < (TRAIN.to - TRAIN.from) / TRAIN.speed * 0.72;
}
// zvedací sloupky: 3 řady po 4, řady jdou za sebou jako "zelená vlna" (~50 km/h)
export const BOLLARDS = { rows: [-10, 0, 10], xs: [-3.75, -1.25, 1.25, 3.75], r: 0.28, h: 1.0, period: 3.4, wave: 0.72 };
export function bollardH(row, time, ph) {   // výška sloupku v řadě (0 = zapuštěný)
  const tt = mod(time + ph - row * BOLLARDS.wave, BOLLARDS.period);
  return tt < 1.9 ? 0 : tt < 2.1 ? BOLLARDS.h * smooth01((tt - 1.9) / 0.2) : tt < 3.2 ? BOLLARDS.h : BOLLARDS.h * (1 - smooth01((tt - 3.2) / 0.2));
}
// dílky s vlastním textem (zadává se při položení)
export const TEXT_PIECES = {
  billboard: { title: 'billboard', label: 'Text na billboardu', max: 60, def: 'STUNTS' },
  roadText: { title: 'nápis na silnici', label: 'Nápis na vozovce (velká písmena se čtou nejlépe)', max: 24, def: 'STUNTS' },
};

export function rotCell([di, dj], r) {
  for (let k = 0; k < r; k++) [di, dj] = [-dj, di];
  return [di, dj];
}

export function tileCells(t) {
  return PIECES[t.type].cells.map(c => { const [a, b] = rotCell(c, t.rot); return [t.x + a, t.y + b]; });
}

export function tilePorts(t) {
  return PIECES[t.type].ports.map(p => {
    const [a, b] = rotCell(p.c, t.rot);
    return { x: t.x + a, y: t.y + b, s: (p.s + t.rot) % 4, h: t.e + p.h, kind: p.kind, b: p.b || 0 };
  });
}

export const key = (x, y) => x + ',' + y;

export function buildCellMap(tiles) {
  const m = new Map();
  for (const t of tiles) for (const [x, y] of tileCells(t)) m.set(key(x, y), t);
  return m;
}

// zdi navazují na sousední zdi: bitová maska světových stran (bit s = soused na straně s)
export function wallMask(cellMap, x, y) {
  let m = 0;
  DELTA.forEach(([dx, dy], s) => { const n = cellMap.get(key(x + dx, y + dy)); if (n && n.type === 'wall') m |= 1 << s; });
  return m;
}

export function canPlace(cellMap, t, ignore = null) {
  for (const [x, y] of tileCells(t)) {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
    const o = cellMap.get(key(x, y));
    if (o && o !== ignore) return false;
  }
  return true;
}

// navazují dva porty (odchozí `a`, příchozí `p`)?
export const portsMatch = (a, p) => p.s === opp(a.s) && p.h === a.h && (p.b || 0) === -(a.b || 0);

// Projde trať od startu a vrátí pořadí dlaždic (kontrolní body).
// Položka pořadí: {tile, fwd, k} – k = index cesty v dílku (podjezd má 2).
export function analyze(tiles) {
  const starts = tiles.filter(t => t.type === 'start');
  if (starts.length === 0) return { closed: false, order: [], error: 'Chybí dílek Start/Cíl.' };
  if (starts.length > 1) return { closed: false, order: [], error: 'Trať smí mít jen jeden start.' };
  const map = buildCellMap(tiles);
  const start = starts[0];
  const order = [{ tile: start, fwd: true, k: 0 }];
  const seen = new Set([start]);
  const seenPath = new Map();
  let exit = tilePorts(start)[1];
  for (let guard = 0; guard < 5000; guard++) {
    const [dx, dy] = DELTA[exit.s];
    let found = null, ft = null, idx = -1;
    const maxK = exit.kind === 'jump' ? 2 : 1;   // za skokánkem nejvýš 1 pole mezera
    let bankErr = false;
    for (let k = 1; k <= maxK && !found; k++) {
      const cx = exit.x + dx * k, cy = exit.y + dy * k;
      const t = map.get(key(cx, cy));
      if (!t || (exit.kind === 'jump' && PIECES[t.type].cat === 'deco')) continue;
      const ps = tilePorts(t);
      const want = exit.kind === 'jump' ? 'land' : exit.kind === 'pipe' ? 'pipe' : 'road';
      const i = ps.findIndex(p => p.x === cx && p.y === cy && p.kind === want && portsMatch(exit, p));
      if (i >= 0) { found = ps[i]; ft = t; idx = i; }
      else if (exit.kind === 'jump') continue;   // pod skokem může být volné pole i jiná (např. kolmá) silnice
      else {
        bankErr = ps.some(p => p.x === cx && p.y === cy && p.s === opp(exit.s) && p.h === exit.h && (p.b || 0) !== -(exit.b || 0));
        break;
      }
    }
    if (!found) {
      const error = exit.kind === 'jump' ? 'Za skokánkem chybí dopad (hned za ním, nebo ob jedno pole – volné nebo třeba s kolmou silnicí).'
        : bankErr ? 'Klopení nenavazuje – použij nájezd/sjezd nebo otoč dílek.'
        : exit.b ? 'Klopená silnice nekončí sjezdem z klopení.' : exit.kind === 'pipe' ? 'Roura musí končit dílkem Roura – vjezd/výjezd.' : 'Trať není napojená.';
      return { closed: false, order, error, errCell: [exit.x + dx, exit.y + dy] };
    }
    const path = idx >> 1;
    if (ft === start) {
      if (idx === 0) return { closed: true, order };
      return { closed: false, order, error: 'Trať vede do startu obráceně.' };
    }
    const sp = seenPath.get(ft) || new Set();
    if (sp.has(path) || (seen.has(ft) && PIECES[ft.type].ports.length <= 2)) {
      return { closed: false, order, error: 'Trať se kříží sama se sebou (použij podjezd).', errCell: [ft.x, ft.y] };
    }
    sp.add(path); seenPath.set(ft, sp); seen.add(ft);
    order.push({ tile: ft, fwd: (idx & 1) === 0, k: path });
    exit = tilePorts(ft)[idx ^ 1];
  }
  return { closed: false, order, error: 'Příliš dlouhá trať.' };
}
