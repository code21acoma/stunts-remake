// Vývojářský test pohyblivých pastí: autopilot projede trať a vypíše zásahy pastmi.
// V konzoli prohlížeče: (await import('/tools/traptest.js')).run(['gt', 'kapka'])
import { Track } from '../js/track.js';
import { Vehicle, CARS } from '../js/physics.js';
import { Autopilot } from '../js/ai.js';
import { turtle } from '../js/tracks.js';

// zkušební okruh: lis, rameno, buchary; přejezd, sloupky, demoliční koule
export function trapTrack() {
  const r = turtle(15, 25, 0, 'F SSSSSS R SS R SSSSSSS R SS R');
  const at = (x, y) => r.tiles.find(t => t.x === x && t.y === y);
  at(15, 24).type = 'crusher'; at(15, 22).type = 'spinner'; at(15, 20).type = 'hammer';
  const s3 = r.tiles.filter(t => t.type === 'straight' && t.x === 18).sort((a, b) => a.y - b.y);
  s3[0].type = 'railroad'; s3[2].type = 'bollards'; s3[4].type = 'pendulum';
  return { name: 'Pasti', tiles: r.tiles };
}

export function run(cars = ['gt'], data = trapTrack(), secs = 70) {
  const M = window.__stunts.world.M;
  return cars.map(cid => {
    const track = new Track(JSON.parse(JSON.stringify(data)), M);
    const car = new Vehicle(CARS[cid]); const pose = track.startPose(); car.reset(pose.p, pose.t);
    const ai = new Autopilot(track); ai.reset(car.pos);
    const order = track.analysis.order, hits = [];
    let t = 0, laps = 0, reached = 0, waited = 0;
    for (let s = 0; s < 240 * secs; s++) {
      const inp = ai.input(car); track.animate(t); car.step(1 / 240, inp, track); const h = track.hazardHit(car); t += 1 / 240;
      if (ai.waiting) waited += 1 / 240;
      const tile = track.tileAt(car.pos.x, car.pos.z);
      const i = tile ? (track.orderIndex.get(tile) || []).find(i => i > reached && i <= reached + 2) : undefined;
      if (i !== undefined) reached = i;
      if (reached >= order.length - 2 && tile === order[0].tile) { laps++; reached = 0; }
      if (h) hits.push(`${t.toFixed(1)}:${tile && tile.type}:${h.toFixed(0)}`);
    }
    track.dispose();
    return `${cid}: kola ${laps} poškození ${car.damage.toFixed(0)} čekání ${waited.toFixed(1)} s | ${hits.join(' ')}`;
  }).join('\n');
}
