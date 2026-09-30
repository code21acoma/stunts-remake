// Pomocný nástroj: vykreslí předpřipravené tratě do ASCII a ověří jejich uzavření.
//   node tools/trackcheck.mjs
import { analyze, tileCells, GRID } from '../js/defs.js';
const src = await import('../js/tracks.js');
const ch = { start: 'F', straight: 's', curve: 'c', bank: 'b', bigcurve: 'G', ramp: 'r', bridge: 'B', tunnel: 'T', tunnelCurve: 'Ť', tunnelBig: 'Ť', loop: 'O', kicker: 'k', landing: 'l', slalom: 'X', obstacleC: 'X', obstacleS: 'Z', cross: '+', spiral: '@', river: '~', riverCurve: '~', bankInL: 'a', bankOutL: 'b', bankInR: 'c', bankOutR: 'd', bankS: 'e', bankCL: 'l', bankCR: 'r', bumps: 'K', trees: ' ', house: ' ', lake: '~', stand: '#', bridgeDry: 'B', tunnelBridge: 'Ť', tunnelPortal: 'Ť', pipe: 'P', pipeIn: 'p', cones: 'k', rampIn: 'r', rampS: 'r', rampOut: 'r', spiralR: '@', sbendL: 'S', sbendR: 'S', wall: 'W', billboard: '!' };
for (const tr of src.BUILTIN) {
  const a = analyze(tr.tiles);
  const g = Array.from({ length: GRID }, () => Array(GRID).fill('.'));
  for (const t of tr.tiles) for (const [x, y] of tileCells(t)) g[y][x] = ch[t.type] + (t.e || '');
  console.log(tr.name, 'closed =', a.closed, a.error || '', '| checkpoints', a.order.length);
  console.log(g.map(r => r.map(c => c.padEnd(2)).join('')).join('\n'));
}
