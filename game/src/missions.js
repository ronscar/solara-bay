// Ray Delgado's story jobs plus a repeatable taxi fare: objectives, a
// beacon marker in the world and on the minimap, timers and payouts.
import * as THREE from 'three';
import { DISTRICTS } from './city.js';
import { pick } from './rng.js';

export const MISSIONS = [
  {
    id: 1, title: 'Keys to the City',
    brief: 'Ray needs wheels. Steal any car and bring it to his garage.',
    hint: 'Walk up to a parked car and press E. Drive to the yellow marker.',
    reward: 250,
  },
  {
    id: 2, title: 'Sunset Delivery',
    brief: 'A package for the Marina district. 90 seconds, no questions.',
    hint: 'Grab the package at the garage, then drive east. Beat the clock.',
    reward: 400,
  },
  {
    id: 3, title: 'Dockside Trouble',
    brief: 'The Violet crew is muscling in at the docks. Clear them out.',
    hint: 'Drive to the docks, get out and settle it. Watch your health.',
    reward: 650,
  },
  {
    id: 4, title: 'The Long Way Home',
    brief: 'The job went loud. Lose the heat and reach the hideout.',
    hint: 'You start at 3 stars. Break line of sight, then run for the hideout.',
    reward: 900,
  },
];

export class MissionDirector {
  constructor(scene, points) {
    this.scene = scene;
    this.points = points;
    this.index = 0;          // 0-based into MISSIONS
    this.stage = 'go';       // go | pickup | deliver | fight | escape | done
    this.timer = 0;
    this.active = false;
    this.taxi = null;        // {from, to, fare, state}
    this.courier = null;     // {to, fare, timer, state} repeatable rush job
    this.courierStreak = 0;  // consecutive couriers done: the pay climbs
    this.replayCount = 0;    // story runs after the first
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 2.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb02e }),
    );
    this.marker.visible = false;
    scene.add(this.marker);
    this.target = null;
  }
  current() { return MISSIONS[this.index] || null; }
  isDone() { return this.index >= MISSIONS.length; }
  start(index, game) {
    this.index = index;
    this.active = true;
    const m = this.current();
    if (!m) { this.active = false; this.hideMarker(); return null; }
    if (m.id === 1) { this.stage = 'go'; this.setTarget(this.points.garage); }
    if (m.id === 2) { this.stage = 'pickup'; this.timer = 90; this.setTarget(this.points.garage); }
    if (m.id === 3) { this.stage = 'fight'; this.setTarget(this.points.docks); }
    if (m.id === 4) {
      this.stage = 'escape'; this.setTarget(this.points.hideout);
      // The job went loud: the getaway starts at 3 stars.
      if (game) game.police.addHeat(55);
    }
    return m;
  }
  setTarget(p) {
    this.target = p;
    this.beacon.visible = true;
    this.beacon.position.set(p.x, 13, p.z);
    this.marker.visible = true;
    this.marker.position.set(p.x, 3.4, p.z);
  }
  hideMarker() {
    this.target = null;
    this.beacon.visible = false;
    this.marker.visible = false;
  }
  complete() {
    const m = this.current();
    this.hideMarker();
    this.active = false;
    this.index += 1;
    return m;
  }
  fail() {
    this.hideMarker();
    this.active = false;
    return this.current();
  }
  update(dt, time, game) {
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 2;
      this.marker.position.y = 3.4 + Math.sin(time * 2.4) * 0.5;
    }
    if (!this.active) return;
    const m = this.current();
    if (!m) return;
    const px = game.playerCar ? game.playerCar.x : game.player.x;
    const pz = game.playerCar ? game.playerCar.z : game.player.z;
    const nearTarget = this.target && (px - this.target.x) ** 2 + (pz - this.target.z) ** 2 < 64;
    if (m.id === 1) {
      if (nearTarget && game.playerCar) game.missionComplete('You delivered the wheels. Ray is impressed.');
    } else if (m.id === 2) {
      this.timer -= dt;
      if (this.stage === 'pickup' && nearTarget) {
        this.stage = 'deliver';
        this.setTarget(this.points.delivery);
        game.toast('Package secured', 'Now run it to the Marina — the clock is ticking.');
      } else if (this.stage === 'deliver' && nearTarget) {
        game.missionComplete('Delivery made with ' + Math.max(0, Math.ceil(this.timer)) + 's to spare.');
      } else if (this.timer <= 0) {
        game.missionFailed('Too slow — the buyer walked. Ray gives you another shot.');
      }
    } else if (m.id === 3) {
      if (this.stage === 'fight' && nearTarget && !game.combatSpawned) {
        game.combatSpawned = true;
        game.combat.spawnEnemies([
          { x: this.points.docks.x - 8, z: this.points.docks.z - 6 },
          { x: this.points.docks.x + 6, z: this.points.docks.z - 10 },
          { x: this.points.docks.x + 2, z: this.points.docks.z + 8 },
          { x: this.points.docks.x - 12, z: this.points.docks.z + 4 },
        ], 4);
        game.toast('Ambush!', 'The Violet crew is here. Clear them out.');
      }
      if (game.combatSpawned && game.combat.enemiesLeft() === 0) {
        game.missionComplete('Docks are yours again. The Violets will think twice.');
      }
    } else if (m.id === 4) {
      if (nearTarget && game.police.wanted === 0) {
        game.missionComplete('Clean getaway. Ray owes you one — the city is yours.');
      }
    }
    // Taxi fare: a waiting pedestrian pays to be driven across town.
    if (this.taxi && this.taxi.state === 'ride') {
      const tx = this.taxi.to.x; const tz = this.taxi.to.z;
      if ((px - tx) ** 2 + (pz - tz) ** 2 < 64) {
        game.addCash(this.taxi.fare);
        game.stats.faresDone += 1;
        game.toast('Fare complete', '+$' + this.taxi.fare + ' — the rider tipped well.');
        game.audio.pickup();
        this.taxi = null;
      }
    }
    // Courier rush: beat the clock or the streak resets.
    if (this.courier && this.courier.state === 'run') {
      this.courier.timer -= dt;
      const cx = this.courier.to.x; const cz = this.courier.to.z;
      if ((px - cx) ** 2 + (pz - cz) ** 2 < 64) {
        game.addCash(this.courier.fare);
        game.stats.couriersDone += 1;
        this.courierStreak += 1;
        game.toast('Courier done', '+$' + this.courier.fare + ' — streak ' + this.courierStreak + ', next fare pays more.');
        game.audio.missionDone();
        this.courier = null;
        if (!this.active) this.hideMarker();
      } else if (this.courier.timer <= 0) {
        game.toast('Courier late', 'The buyer walked. The streak resets.');
        this.cancelCourier();
      }
    }
  }
  startTaxi(fromPed, to) {
    this.taxi = { from: fromPed, to, fare: 120, state: 'ride' };
    this.setTarget(to);
    return this.taxi;
  }
  // Courier rush: a timed cross-town drop, repeatable in free roam. The
  // destination is a random district, the clock is 75 seconds, and each
  // courier finished in a row adds $25 to the next fare.
  startCourier(game) {
    if (this.courier) return null;
    const district = pick(Math.random, DISTRICTS);
    const to = {
      x: district.x + (Math.random() * 2 - 1) * 30,
      z: district.z + (Math.random() * 2 - 1) * 30,
    };
    const fare = 150 + this.courierStreak * 25;
    this.courier = { to, fare, timer: 75, state: 'run', district: district.name };
    this.setTarget(to);
    game.toast('Courier run — ' + district.name, 'Drop the package in 75s. Fare $' + fare + '.');
    return this.courier;
  }
  cancelCourier() {
    if (!this.courier) return;
    this.courier = null;
    this.courierStreak = 0;
    if (!this.active) this.hideMarker();
  }
  // Run the story again after the finale: same jobs, Ray pays a $100 bonus
  // per job for a driver he already trusts.
  startReplay(game) {
    this.replayCount += 1;
    this.index = 0;
    this.active = false;
    return this.start(0, game);
  }
  replayBonus() { return this.replayCount > 0 ? 100 : 0; }
  objectiveText() {
    if (this.courier && this.courier.state === 'run') {
      return {
        title: 'COURIER — ' + this.courier.district,
        sub: 'Drop the package in ' + Math.ceil(this.courier.timer) + 's. Fare $' + this.courier.fare + '.',
        dist: '',
      };
    }
    if (this.isDone()) return { title: 'Solara Bay is yours', sub: 'All of Ray\u2019s jobs are done. Cruise, earn fares, stay free.', dist: '' };
    const m = this.current();
    if (!m) return { title: '', sub: '', dist: '' };
    let sub = m.brief;
    if (m.id === 2 && this.stage === 'deliver') sub = 'Deliver the package to the Marina. ' + Math.ceil(this.timer) + 's left.';
    if (m.id === 2 && this.stage === 'pickup') sub = 'Pick up the package at Ray\u2019s garage. ' + Math.ceil(this.timer) + 's left.';
    if (m.id === 3 && this.stage === 'fight') sub = 'Clear the Violet crew at the docks. ' + (this.target ? '' : '');
    return { title: 'JOB ' + m.id + ' — ' + m.title, sub, dist: '' };
  }
}
