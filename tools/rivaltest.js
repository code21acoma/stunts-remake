// Kalibrace počítačových soupeřů: čas jednoho kola autopilota s danou povahou (bez ostatních aut).
//   const T = await import('/tools/rivaltest.js?v=' + Date.now()); T.lap('zeleny', 'gt', { corner: 0.9 })
import { Track } from '../js/track.js';
import { BUILTIN } from '../js/tracks.js';
import { Vehicle, CARS } from '../js/physics.js';
import { Autopilot } from '../js/ai.js';

export function lap(trackId, carId = 'gt', opts = {}, maxT = 240) {
  const data = BUILTIN.find(t => t.id === trackId);
  const track = new Track(JSON.parse(JSON.stringify(data)), window.__stunts.world.M);
  const car = new Vehicle(CARS[carId]);
  const pose = track.startPose(); car.reset(pose.p, pose.t);
  const ai = new Autopilot(track, opts); ai.reset(car.pos);
  const order = track.analysis.order, n = order.length;
  let reached = 0, t = 0, lastCp = 0, stuck = 0, resp = 0;
  for (let s = 0; s < maxT * 240; s++) {
    car.step(1 / 240, ai.input(car), track); t += 1 / 240;
    const tile = track.tileAt(car.pos.x, car.pos.z);
    const i = tile ? (track.orderIndex.get(tile) || []).find(i => i > reached && i <= reached + 2) : undefined;
    if (i !== undefined) { reached = i; lastCp = i; }
    if (reached >= n - 2 && tile === order[0].tile) break;
    stuck = car.speed < 1 || car.isUpsideDown() ? stuck + 1 / 240 : 0;
    if (stuck > 3 || car.crashed || car.destroyed || car.pos.y < -5) {
      resp++; const p = track.poseOn(order[lastCp].tile, order[lastCp].fwd, 0.15, order[lastCp].k || 0);
      car.damage = 0; car.destroyed = false; car.reset(p.p, p.t); ai.reset(car.pos); stuck = 0;
    }
  }
  track.dispose();
  return { t: +t.toFixed(1), resp };
}
