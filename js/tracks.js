// Předpřipravené tratě. Stavěné "želvou" – posloupností příkazů, takže jsou vždy správně napojené.
import { PIECES, DELTA, opp, rotCell, GRID, buildCellMap, canPlace, tilePorts, key, analyze } from './defs.js';

// Příkazy:
//  F start   S rovinka   L/R malá zatáčka   Q/P velká zatáčka vlevo/vpravo
//  H spirála nahoru (2×2, posun o 2 pole vpřed, +1 patro)   U rampa nahoru   D rampa dolů   B most   T tunel   O looping   J skok (skokánek + mezera + dopad)
//  M/W zatáčka v tunelu vlevo/vpravo   N/G velká zatáčka v tunelu vlevo/vpravo (posun jako Q/P)
//  X překážka uprostřed   Z překážky po stranách   K hrboly
//  C podjezd (první průjezd)   Y průjezd již položeným podjezdem
//  klopení: a/b nájezd/sjezd L, c/d nájezd/sjezd P, e klopená rovinka, l/r klopená zatáčka L/P
//  ("crd" = klopená pravá zatáčka se stejným posunem jako P, "alb" = levá jako Q)
//  h spirála nahoru vpravo   k slalom s kužely   x/y esíčko vlevo/vpravo (2×2, posun o pole do strany)
//  I vjezd do roury, V roura, o roura se zátarasem, i výjezd z roury
//  q/p velká klopená zatáčka vlevo/vpravo (posun jako Q/P; "aqb", "cpd")
//  f rovinka se svodidly   < > zatáčka se svodidly L/P   { } velká zatáčka se svodidly L/P   g šotolina   v vlny   z šikana (zídky)   t urychlovač   w křižovatka (druhý průjezd Y)
//  dlouhé stoupání: A nájezd (2 pole), E rovné stoupání, u dojezd (2 pole) – každý +1 patro
//  dlouhé klesání:  n začátek (2 pole), s rovné klesání, m konec (2 pole) – každý −1 patro
export function turtle(x, y, dir, cmds) {
  const tiles = [];
  let e = 0, bank = 0;
  const place = (type, filter) => {
    const def = PIECES[type];
    for (let rot = 0; rot < 4; rot++) {
      for (let pi = 0; pi < def.ports.length; pi++) {
        const p = def.ports[pi];
        if ((p.s + rot) % 4 !== opp(dir) || (p.b || 0) !== -bank) continue;
        if (p.kind === 'jump' || (type === 'start' && pi !== 0)) continue;
        const [a, b] = rotCell(p.c, rot);
        const t = { type, rot, x: x - a, y: y - b, e: e - p.h };
        const q = def.ports[pi ^ 1];
        const [qa, qb] = rotCell(q.c, rot);
        const ex = { side: (q.s + rot) % 4, x: t.x + qa, y: t.y + qb, e: t.e + q.h, b: q.b || 0, pi };
        if (filter && !filter(ex)) continue;
        if (!canPlace(buildCellMap(tiles), t)) throw new Error(`Kolize: ${type} na ${t.x},${t.y}`);
        tiles.push(t);
        x = ex.x + DELTA[ex.side][0]; y = ex.y + DELTA[ex.side][1]; dir = ex.side; e = ex.e; bank = ex.b;
        return t;
      }
    }
    throw new Error(`Nelze umístit ${type} na ${x},${y}`);
  };
  const through = () => {   // průjezd existujícím podjezdem
    const t = buildCellMap(tiles).get(key(x, y));
    if (!t) throw new Error('Y: žádný dílek na ' + x + ',' + y);
    const ps = tilePorts(t);
    const i = ps.findIndex(p => p.x === x && p.y === y && p.s === opp(dir) && p.h === e);
    if (i < 0) throw new Error('Y: nelze projet ' + x + ',' + y);
    const q = ps[i ^ 1];
    x = q.x + DELTA[q.s][0]; y = q.y + DELTA[q.s][1]; dir = q.s; e = q.h;
  };
  for (const c of cmds.replace(/\s+/g, '')) {
    const L = ex => ex.side === (dir + 3) % 4, R = ex => ex.side === (dir + 1) % 4;
    const fwd = ex => ex.pi === 0;
    switch (c) {
      case 'F': place('start', fwd); break;
      case 'S': place('straight'); break;
      case 'L': place('curve', L); break;
      case 'R': place('curve', R); break;
      case 'Q': place('bigcurve', L); break;
      case 'P': place('bigcurve', R); break;
      case 'U': place('ramp', ex => ex.e > e); break;
      case 'D': place('ramp', ex => ex.e < e); break;
      case 'H': place('spiral', ex => ex.e > e); break;
      case 'B': place('bridge'); break;
      case 'T': place('tunnel'); break;
      case 'M': place('tunnelCurve', L); break;
      case 'W': place('tunnelCurve', R); break;
      case 'N': place('tunnelBig', L); break;
      case 'G': place('tunnelBig', R); break;
      case 'O': place('loop'); break;
      case 'X': place('obstacleC'); break;
      case 'Z': place('obstacleS'); break;
      case 'K': place('bumps'); break;
      case 'C': place('cross', ex => ex.pi === 0); break;
      case 'Y': through(); break;
      case 'a': place('bankInL', fwd); break;
      case 'b': place('bankOutL', fwd); break;
      case 'c': place('bankInR', fwd); break;
      case 'd': place('bankOutR', fwd); break;
      case 'e': place('bankS'); break;
      case 'l': place('bankCL', L); break;
      case 'r': place('bankCR', R); break;
      case 'h': place('spiralR', ex => ex.e > e); break;
      case 'k': place('cones'); break;
      case 'x': place('sbendL', fwd); break;
      case 'y': place('sbendR', fwd); break;
      case 'I': place('pipeIn', ex => ex.pi === 0); break;
      case 'V': place('pipe'); break;
      case 'i': place('pipeIn', ex => ex.pi === 1); break;
      case 'o': place('pipeObst'); break;
      case 'g': place('gravel'); break;
      case 'f': place('straightRails'); break;
      case '<': place('curveRails', L); break;    // zatáčka se svodidly vlevo / vpravo
      case '>': place('curveRails', R); break;
      case '{': place('bigcurveRails', L); break; // velká zatáčka se svodidly vlevo / vpravo
      case '}': place('bigcurveRails', R); break;
      case 'v': place('waves'); break;
      case 'z': place('chicane'); break;
      case 't': place('boost'); break;
      case 'w': place('crossFlat'); break;   // křižovatka – druhý průjezd příkazem Y
      case 'q': place('bankBigL', L); break;
      case 'p': place('bankBigR', R); break;
      case 'A': place('rampIn', ex => ex.e > e); break;
      case 'E': place('rampS', ex => ex.e > e); break;
      case 'u': place('rampOut', ex => ex.e > e); break;
      case 'n': place('rampOut', ex => ex.e < e); break;
      case 's': place('rampS', ex => ex.e < e); break;
      case 'm': place('rampIn', ex => ex.e < e); break;
      case 'J': place('kicker', fwd); x += DELTA[dir][0]; y += DELTA[dir][1]; place('landing', fwd); break;
      default: throw new Error('Neznámý příkaz ' + c);
    }
  }
  return { tiles, end: { x, y, dir, e, bank } };
}

// Deterministický generátor pro dekorace
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// dekorace jen v okolí trati (dál je les kolem mapy)
function decorate(tiles, seed, extra = []) {
  const map = buildCellMap(tiles);
  for (const t of tiles) if (t.type === 'kicker') {
    const s = (2 + t.rot) % 4;
    map.set((t.x + DELTA[s][0]) + ',' + (t.y + DELTA[s][1]), 'gap');
  }
  // řeka: od každého mostu pokračuje oběma směry, dokud nenarazí na silnici (max. 5 polí)
  for (const t of tiles.filter(t => t.type === 'bridge')) {
    for (const s of [(1 + t.rot) % 4, (3 + t.rot) % 4]) {
      for (let k = 1; k <= 5; k++) {
        const x = t.x + DELTA[s][0] * k, y = t.y + DELTA[s][1] * k;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID || map.has(x + ',' + y)) break;
        const r = { type: 'river', x, y, rot: t.rot, e: 0 };
        tiles.push(r); map.set(x + ',' + y, r);
      }
    }
  }
  let x0 = GRID, y0 = GRID, x1 = 0, y1 = 0;
  for (const k of map.keys()) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const r = rng(seed);
  for (const d of extra) if (!map.has(d.x + ',' + d.y)) { tiles.push({ ...d, rot: d.rot || 0, e: 0 }); map.set(d.x + ',' + d.y, d); }
  for (let y = Math.max(0, y0 - 3); y <= Math.min(GRID - 1, y1 + 3); y++) for (let x = Math.max(0, x0 - 3); x <= Math.min(GRID - 1, x1 + 3); x++) {
    if (map.has(x + ',' + y)) continue;
    const v = r();
    if (v < 0.22) tiles.push({ type: 'trees', x, y, rot: Math.floor(r() * 4), e: 0, seed: Math.floor(r() * 1e6) });
    else if (v < 0.25) tiles.push({ type: 'house', x, y, rot: Math.floor(r() * 4), e: 0, seed: Math.floor(r() * 1e6) });
  }
  return tiles;
}

// Portály tunelů: na začátek a konec každého souvislého úseku tunelu (rovný, zatáčky) dá dílek portálu –
// rovný tunel na kraji úseku se změní na portál, jinak se na portál změní sousední rovinka (tunel se prodlouží).
// Portál má otevřenou stranu (port 0) směrem ven z tunelu, podle směru jízdy.
const TUN = { tunnel: 1, tunnelCurve: 1, tunnelBig: 1 };
function addPortals(tiles) {
  const an = analyze(tiles);
  if (!an.closed) return tiles;
  const o = an.order, n = o.length, used = new Set();
  const at = i => o[((i % n) + n) % n];
  const conv = (e, entry) => {
    const t = e.tile;
    t.rot = entry === e.fwd ? t.rot : (t.rot + 2) % 4;   // vjezd: port 0 proti směru jízdy; výjezd: po směru
    t.type = 'tunnelPortal';
    used.add(t);
  };
  const free = (e, type) => e.tile.type === type && !used.has(e.tile);
  if (o.every(e => TUN[e.tile.type])) return tiles;
  // začátek procházení mimo tunel, aby se úsek nerozdělil přes start
  let s0 = 0; while (TUN[at(s0).tile.type]) s0++;
  for (let i = s0; i < s0 + n; i++) {
    if (!TUN[at(i).tile.type] || TUN[at(i - 1).tile.type]) continue;
    let j = i; while (TUN[at(j + 1).tile.type]) j++;        // úsek tunelu i..j
    // kandidáti: vjezd = první dílek (rovný tunel) nebo rovinka před ním; výjezd = poslední nebo rovinka za ním
    const inC = [free(at(i), 'tunnel') && at(i), free(at(i - 1), 'straight') && at(i - 1)].filter(Boolean);
    const outC = [free(at(j), 'tunnel') && at(j), free(at(j + 1), 'straight') && at(j + 1)].filter(Boolean);
    let best = null;
    for (const x of [...inC, null]) for (const y of [...outC, null]) {
      if (x && y && x.tile === y.tile) continue;
      // co nejvíc portálů; při shodě raději přestavět tunel než prodlužovat o rovinku
      const score = (x ? 10 : 0) + (y ? 10 : 0) + (x && TUN[x.tile.type] ? 1 : 0) + (y && TUN[y.tile.type] ? 1 : 0);
      if (!best || score > best.score) best = { x, y, score };
    }
    if (best.x) conv(best.x, true);
    if (best.y) conv(best.y, false);
    i = j;
  }
  return tiles;
}

function make(id, name, desc, difficulty, x, y, dir, cmds, seed, extra = []) {
  const tiles = addPortals(turtle(x, y, dir, cmds).tiles);
  return { id, name, desc, difficulty, builtin: true, tiles: decorate(tiles, seed, extra) };
}

// Obdélníkové okruhy s velkými zatáčkami P: délky stran a, b, c = a + 1, d = b
// (vlnovka RLLR a looping O se počítají za 2, skok J za 3, klopená zatáčka "crd" nahrazuje P).
export const BUILTIN = [
  make('zeleny', 'Zelený okruh', 'Rychlý okruh s velkými i klopenými zatáčkami, hrboly a tunelem. Ideální na zahřátí.', 1,
    16, 15, 1, 'F SSSSS crd SSKSS P SSTSSS crd SSKSS P', 11,
    [{ type: 'stand', x: 17, y: 14 }, { type: 'stand', x: 18, y: 14 }, { type: 'lake', x: 19, y: 19 }, { type: 'lake', x: 20, y: 19 }]),
  make('mosty', 'Mosty a tunely', 'Vyjeďte po spirále na most přes řeku, projeďte horským tunelem, estakádou a zvládněte esíčko.', 2,
    13, 14, 1, 'F SHBSDSS P STSSUS P BSDSSSSSS P S RLLR SSS crd', 23,
    [{ type: 'stand', x: 14, y: 13 }, { type: 'stand', x: 15, y: 13 }]),
  make('osmicka', 'Osmička', 'Trať ve tvaru osmičky: jednou projedete pod mostem, podruhé přes něj. Klopené zatáčky na obou stranách.', 2,
    20, 18, 2, 'F S C SSS alb SSS Q SS Q USSS Y SDSS crd SSS P SSS P SS', 61,
    [{ type: 'stand', x: 19, y: 17 }, { type: 'stand', x: 21, y: 16 }]),
  make('kaskader', 'Kaskadérská show', 'Looping, skok přes mezeru, překážky a klopená zatáčka. Rychlost je klíčová!', 3,
    13, 14, 1, 'F SSOSSS crd SSSJ P SXSSZSSS P KSSOS P', 37,
    [{ type: 'stand', x: 14, y: 13 }, { type: 'stand', x: 15, y: 13 }, { type: 'stand', x: 16, y: 13 }]),
  make('silenec', 'Šílenec', 'Všechno najednou: patra, skoky, dva loopingy, esíčka, překážky i tunel. Jen pro odvážné.', 4,
    12, 13, 1, 'F SSOSUSBDSJS P SU RLLR DSK crd SXSSOSTS SZ SSSS P SKSSJ P', 51,
    [{ type: 'stand', x: 13, y: 12 }, { type: 'stand', x: 14, y: 12 }]),
];

// Dalších 25 tratí – vygenerované nástrojem tools/trackgen.mjs: trať vede po obvodu náhodného tvaru z bloků
// (zatáčky vlevo i vpravo), zatáčky jsou velké / klopené / v tunelu, na rovinkách estakády, spirály, loopingy, skoky…
// [id, název, popis, obtížnost, start x, start y, směr, příkazy želvy]
const GENERATED = [
  ["lesni", "Lesní okruh", "10 zatáček, 3 klopené; překážky, hrboly.", 1, 19, 11, 2, "FKSSRSSalbSSRSSSSSSSRSScrdSSLSZPSSLSSKRSScrdSS"],
  ["vinice", "Vinice", "8 zatáček, 2 klopené; překážky.", 1, 9, 11, 1, "FSSSScrdScrdSSLSSPSPSSLSSXRSSPSSSS"],
  ["rybnik", "Kolem rybníka", "6 zatáček, 1 klopená; hrboly.", 1, 9, 11, 1, "FSSSSSRSSSSSSPSPSalbSSSSSSRKSSRSSSSS"],
  ["klikatice", "Klikatice", "10 zatáček, 3 klopené; hrboly.", 1, 19, 7, 1, "FSSSRSSSRSSalbSPSSLSKcrdScrdSSSSSPSSLSSSRSSS"],
  ["stara", "Stará silnice", "6 zatáček, 1 klopená; překážky, hrboly.", 1, 11, 13, 0, "FSZSSSRSSSSSSSRSKSRSSSLSSSSSKSRSScrdSSSS"],
  ["louka", "Louka", "14 zatáček, 3 klopené, 5 v tunelu; esíčka, tunely, překážky, hrboly.", 2, 13, 27, 3, "FSZSScrdKQSTWTKTWTSSXSSNScrdSSSTTTLSSTWTScrdSSTSSTMTSPSPSySxLSXPSSSS"],
  ["prusmyk", "Horský průsmyk", "12 zatáček, 1 v tunelu; dlouhé stoupání, esíčka, slalom s kužely, tunely, překážky, hrboly.", 2, 17, 27, 3, "FSSSSSSSSPSTWTKZLSSSSxSySSRTTTLSSPSSRSSAEuKnsmSSLSSSLSSPSZRSSSkSSSRSSSSSSSSS"],
  ["hadi", "Hadí stezka", "12 zatáček, 3 klopené, 3 v tunelu; esíčka, překážky, hrboly.", 2, 27, 13, 2, "FSSSSSRSSQSPTNSSRSSSSSXPSSySxKSTWTSQSGSalbScrdSSKSScrdSSSS"],
  ["udoli", "Údolí mostů", "14 zatáček, 3 klopené, 3 v tunelu; spirála na estakádu, most přes řeku, esíčka, hrboly.", 2, 7, 15, 0, "FSSSSSSPSTWTSSLSSThSSBDSSRSScrdSSLTTTRKSQKSLSSGSGSSSSScrdSQScrdSySx"],
  ["mlyn", "Mlýnský náhon", "12 zatáček, 2 klopené, 1 v tunelu; estakáda, mosty přes řeku, skok přes mezeru, esíčka, slalom s kužely, tunely, hrboly.", 2, 21, 19, 3, "FSSSSalbSySxRSSkRSSSSUBBDSSQSPSSRSSalbSTWTSSSSSJTSRSSSKSSQSPSPSSSS"],
  ["zamek", "Zámecký okruh", "12 zatáček, 5 klopených, 1 v tunelu; esíčka, tunely, hrboly.", 2, 11, 19, 0, "FSSSSSScrdSySxLSScrdTTTSSTWTSSSSSSRTSQKalbSSRSScrdSSSKKalbSPSSSSSPSSSSSS"],
  ["serpentiny", "Serpentiny", "18 zatáček, 2 klopené; esíčka, slalom s kužely, tunely, překážky, hrboly.", 2, 11, 19, 0, "FSSQSSRSSSRSZalbSSRTTTRSSQSPSQSPSalbSSRSSSRSySxQSSRSKkRSSQSSRSSS"],
  ["prumysl", "Průmyslová zóna", "20 zatáček, 3 klopené, 2 v tunelu; estakáda, mosty přes řeku, roura, slalom s kužely, tunely, překážky, hrboly.", 3, 29, 23, 3, "FSSTTalbSPSSSSSPSQSPSSRSSQKPSSLSSkLSScrdSPSSUBBBDSZcrdSPSQTTLSXIVViGSSLSSTWTSPSSSS"],
  ["kanon", "Kaňon", "16 zatáček, 7 klopených, 2 v tunelu; spirála na estakádu, most přes řeku, slalom s kužely, překážky, hrboly.", 3, 31, 21, 2, "FSSSScrdSQScrdSSZSSPSQTTRSSShBSDSSSLSScrdSGSalbScrdSTWTKalbSSSSkPSalbSSRSSSSS"],
  ["orli", "Orlí hnízdo", "14 zatáček, 3 klopené, 3 v tunelu; dlouhé stoupání, most přes řeku, roura, esíčka, slalom s kužely, překážky, hrboly.", 3, 35, 19, 2, "FSxSySRSSAEuBnsmSTRSSQSKRSZTMTSPScrdKNSPTTkSSNSPScrdSalbSZIViPSSSZSS"],
  ["bludiste", "Bludiště", "14 zatáček, 3 klopené; looping, roura, esíčka, slalom s kužely, tunely, překážky, hrboly.", 3, 15, 13, 0, "FTTTSSRSZalbSPSSSSkPSQSSRSKkLKSPSySxRSSSOSSLSScrdSSIViSRSSXLSXcrdSSSS"],
  ["drak", "Dračí ocas", "14 zatáček, 3 klopené, 2 v tunelu; looping, skok přes mezeru, esíčka, slalom s kužely, překážky, hrboly.", 3, 17, 23, 3, "FSSSScrdSKRSSSLSSSOSSRSSSSSJSSNSPSPSSTSXalbSSRSSPSQSySxSSScrdSSSSSPSSSSSTMTSSkS"],
  ["vodopad", "Vodopád", "18 zatáček, 2 klopené, 1 v tunelu; spirála na estakádu, most přes řeku, looping, esíčka, slalom s kužely, tunely, překážky, hrboly.", 3, 21, 23, 3, "FSSSZTWTSSHBSDSSSLSXPSxSyRSSSOSSRSKQSSLSScrdSPSSLSZSRSScrdSQSPSQSSLSSkRSSSRTTTSk"],
  ["pevnost", "Pevnost", "18 zatáček, 6 klopených, 4 v tunelu; estakáda, most přes řeku, 2 loopingy, skok přes mezeru, roura, esíčka, slalom s kužely, tunely, překážky, hrboly.", 3, 27, 15, 1, "FSSSSSScrdSTWTSalbSXRSSNSxSyRSKSRSTSOSSLSSIVViSJSLTTSRSSSOSSRSKUBDSSRSSSSSSalbSTWTSTMTScrdScrdSalbSSkSSS"],
  ["letiste", "Letiště", "22 zatáček, 2 klopené, 5 v tunelu; roura, esíčka, slalom s kužely, tunely, překážky.", 4, 35, 19, 2, "FSSZSSSPSZLSTTRSTTLSSPScrdSNSSRSZcrdSQSSLSySxPSTWTSSTTSSLSSTMTSPSGSSIVViLSSkRSSPSSLSSTWTSSSXSS"],
  ["tornado", "Tornádo", "18 zatáček, 4 klopené, 2 v tunelu; spirála na estakádu, looping, esíčka, slalom s kužely, tunely, překážky, hrboly.", 4, 35, 19, 2, "FSSSOSSRSSHSDSSTTTLSScrdSQScrdScrdSQSPSSSSSPSQKSZXSTWTTTTSSNSPSSRSZkLSSQScrdSPKySx"],
  ["dabel", "Ďáblova smyčka", "18 zatáček, 4 klopené, 3 v tunelu; looping, roura, esíčka, slalom s kužely, tunely, překážky, hrboly.", 4, 23, 15, 1, "FSSSSSSGSQSSRSScrdSQSSRSSTMTSTTTSPTTTSOSSSSkSScrdSXRSZQSSIViTMTSZSSScrdSSRSSkLSySxPSPKalbSSSSSS"],
  ["bourlivak", "Bouřlivák", "20 zatáček, 7 klopených, 1 v tunelu; looping, skok přes mezeru, roura, slalom s kužely, tunely, překážky, hrboly.", 4, 31, 23, 2, "FSSSSOSSSScrdSPSalbSSRKSQSalbSPSGSSIViQTTTkScrdSPTTLSScrdSSZSSQSSRSSkRSZalbSQSPScrdSSSSJSSZ"],
  ["labyrintsmrti", "Labyrint smrti", "18 zatáček, 3 klopené, 7 v tunelu; spirála na estakádu, most přes řeku, skok přes mezeru, roura, slalom s kužely, překážky.", 4, 35, 23, 2, "FSSSSSSGScrdSNSXHBDSSScrdSTMTSQSSSIViRSSTWTSTTSSTMTSSRSSSSSScrdTSRSZQSQTTSZSSRSSkSSJSSGSSLSSSkSSTWTSSSSSS"],
  ["raj", "Kaskadérský ráj", "20 zatáček, 6 klopených, 5 v tunelu; spirála na estakádu, most přes řeku, 2 loopingy, skok přes mezeru, roura, esíčka, slalom s kužely, tunely, překážky, hrboly.", 4, 7, 21, 0, "FSSSSJSPSySxRSSkLSSIVViOSSSHSBDSSSRSXTWTSSSSSalbSalbScrdKSRTTalbSTWTSSRSZTMTTTTSSQSalbSGKcrdSSkSSTWTSQSSRSSSSOSZS"],
];
GENERATED.forEach(([id, name, desc, diff, x, y, dir, cmds], i) => {
  const L = DELTA[(dir + 3) % 4];   // tribuna vlevo od startu (vně okruhu)
  BUILTIN.push(make(id, name, desc, diff, x, y, dir, cmds, 100 + i * 17,
    [{ type: 'stand', x: x + L[0], y: y + L[1], rot: (dir + 3) % 4 }, { type: 'stand', x: x + L[0] - DELTA[dir][0], y: y + L[1] - DELTA[dir][1], rot: (dir + 3) % 4 }]));
});
BUILTIN.sort((a, b) => a.difficulty - b.difficulty);