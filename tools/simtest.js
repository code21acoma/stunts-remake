// Vývojářský test: autopilot projede tratě v zrychleném čase a vypíše výsledky.
// V konzoli prohlížeče: (await import('/tools/simtest.js')).run()
import * as THREE from 'three';
import { Track } from '../js/track.js';
import { BUILTIN } from '../js/tracks.js';
import { Vehicle, CARS } from '../js/physics.js';
import { Autopilot } from '../js/ai.js';

export function simulate(data, carId = 'gt', maxT = 240, M = window.__stunts.world.M) {
  const track = new Track(JSON.parse(JSON.stringify(data)), M);
  const car = new Vehicle(CARS[carId]);
  const pose = track.startPose();
  car.reset(pose.p, pose.t);
  const ai = new Autopilot(track);
  ai.reset(car.pos);
  const order = track.analysis.order, n = order.length;
  let crashes = 0, destroyed = 0, coneHits = 0;
  let reached = 0, t = 0, respawns = 0, upside = 0, stuck = 0, lastCp = 0;
  const log = [];
  const types = {};
  let maxAir = 0, wasAir = 0;
  for (let step = 0; step < maxT * 240; step++) {
    const inp = ai.input(car);
    track.animate(t);
    car.step(1 / 240, inp, track);
    if (track.hazardHit(car)) log.push(`hazard hit @${t.toFixed(1)}s`);
    const ch = track.updateCones(1 / 240, car.pos, car.quat, car.vel);
    if (ch) { coneHits += ch; car.vel.multiplyScalar(0.96 ** ch); }
    t += 1 / 240;
    maxAir = Math.max(maxAir, car.airTime);
    if (step % (240 * 3) === 0) log.push(`t${t.toFixed(0)} cp${reached} v${(car.fwdSpeed * 3.6).toFixed(0)} g${car.gear} in(${inp.steer.toFixed(2)},${inp.throttle},${inp.brake}) ai${ai.i} pos ${car.pos.toArray().map(v => v.toFixed(1))}`);
    const tile = track.tileAt(car.pos.x, car.pos.z);
    if (tile && tile.type === 'kicker' && !car.onGround && car.airTime < 1 / 200) log.push(`jump takeoff v=${(car.speed * 3.6).toFixed(0)}km/h`);
    if (wasAir > 0.3 && car.onGround) log.push(`landed after ${wasAir.toFixed(2)}s on ${tile ? tile.type : 'grass'} v=${(car.speed * 3.6).toFixed(0)}`);
    wasAir = car.airTime;
    const i = tile ? (track.orderIndex.get(tile) || []).find(i => i > reached && i <= reached + 2) : undefined;
    if (i !== undefined) { reached = i; lastCp = i; types[tile.type] = (types[tile.type] || 0) + 1; }
    if (reached >= n - 2 && tile === order[0].tile) { log.push('LAP ' + t.toFixed(2)); break; }
    upside = car.isUpsideDown() ? upside + 1 / 240 : 0;
    stuck = car.speed < 1 ? stuck + (ai.waiting ? 0.25 : 1) / 240 : 0;
    if (car.destroyed) { destroyed++; log.push(`DESTROYED @${t.toFixed(1)}s`); }
    if (car.crashed) { crashes++; log.push(`CRASH @${t.toFixed(1)}s ${(car.crashed.speed * 3.6).toFixed(0)} km/h on ${tile ? tile.type : '-'}`); }
    if (car.crashed || car.destroyed || upside > 2 || stuck > 4 || car.pos.y < -5 || (car.inWater && car.speed < 3)) {
      respawns++;
      log.push(`respawn @${t.toFixed(1)}s tile#${lastCp} ${order[lastCp].tile.type} pos ${car.pos.toArray().map(v => v.toFixed(1))} upside=${upside > 2}`);
      let k = lastCp;
      const special = t => ['loop', 'pipeObst', 'kicker', 'landing', 'slalom', 'obstacleC', 'obstacleS', 'chicane', 'waves', 'trampoline', 'sideRamp'].includes(t.type);
      if (special(order[k].tile) || (order[k + 1] && special(order[k + 1].tile))) {
        while (k > 0 && special(order[k].tile)) k--;
        for (let q = 0; q < 2 && k > 0 && !special(order[k - 1].tile) && !order[k - 1].tile.type.startsWith('bigcurve'); q++) k--;
      }
      const p = track.poseOn(order[k].tile, order[k].fwd, 0.15, order[k].k || 0);
      if (car.destroyed) { car.damage = 0; car.destroyed = false; }
      car.reset(p.p, p.t); ai.reset(car.pos); upside = stuck = 0;
      if (respawns > 8) break;
    }
  }
  track.dispose();
  return { name: data.name, car: carId, time: t.toFixed(1), reached: reached + '/' + n, respawns, crashes, destroyed, damage: car.damage.toFixed(0), coneHits, maxAir: maxAir.toFixed(2), log };
}

export function run(carId = 'gt') {
  return BUILTIN.map(b => simulate(b, carId));
}
export function runAll() {
  return Object.keys(CARS).flatMap(c => run(c).map(r => `${c.padEnd(7)} ${r.name.padEnd(18)} t=${r.time} cp=${r.reached} resp=${r.respawns} crash=${r.crashes} zniceno=${r.destroyed} poskozeni=${r.damage}%` +
    (r.crashes || r.destroyed ? ' | ' + r.log.filter(l => l.startsWith('CRASH') || l.startsWith('DESTROYED')).join('; ') : '')));
}
