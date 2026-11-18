// Traffic cars that loop the road grid, and pedestrians strolling the
// sidewalks. Both are simple, cheap and visible from anywhere in the city.
import * as THREE from 'three';
import { mulberry32, range, rangeInt, pick, clamp } from './rng.js';
import { makeCarMesh, Car, CAR_COLORS, CAR_NAMES } from './vehicles.js';
import { CITY } from './city.js';

const PED_COLORS = [0xd96a4a, 0x4a7dd9, 0x7db24a, 0xd9b84a, 0x9a5fd9, 0xdddddd, 0x333333];
const BUS_COLORS = [0x2e6f8e, 0x8e6f2e, 0x5a8e3a];
const BUS_ROUTES = [
  { horizontal: true, roadAt: -100, dir: 1 },
  { horizontal: true, roadAt: 100, dir: -1 },
  { horizontal: false, roadAt: 50, dir: 1 },
];

function makePedMesh(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.35), bodyMat);
  body.position.y = 0.95; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.62;
  g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3136 });
  for (const sx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), legMat);
    leg.position.set(sx, 0.28, 0);
    g.add(leg);
  }
  return g;
}

function makeBusMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 8.6), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 1.4; body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.9, 7.6), new THREE.MeshLambertMaterial({ color: 0x9fd4ff }));
  glass.position.y = 1.8;
  g.add(glass);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const [wx, wz] of [[-1.1, 2.6], [1.1, 2.6], [-1.1, -2.6], [1.1, -2.6]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.45, wz);
    g.add(wheel);
  }
  return g;
}

export class Traffic {
  constructor(scene, seed) {
    this.rng = mulberry32(seed + 101);
    this.cars = [];
    this.peds = [];
    this.buses = [];
    for (let i = 0; i < 14; i += 1) {
      const roadAt = (Math.floor(this.rng() * 7) - 3) * 50;
      const horizontal = this.rng() < 0.5;
      const along = range(this.rng, -180, 180);
      const mesh = makeCarMesh(pick(this.rng, CAR_COLORS), false);
      scene.add(mesh);
      const car = new Car(mesh, horizontal ? along : roadAt, horizontal ? roadAt : along, horizontal ? Math.PI / 2 : 0, pick(this.rng, CAR_NAMES), false);
      car.cruise = range(this.rng, 7, 11);
      car.baseCruise = car.cruise;
      car.horizontal = horizontal;
      car.roadAt = roadAt;
      car.dir = this.rng() < 0.5 ? 1 : -1;
      car.speed = car.cruise;
      this.cars.push(car);
    }
    // City buses: long, slow, fixed routes — the avenues feel lived-in.
    for (let i = 0; i < BUS_ROUTES.length; i += 1) {
      const route = BUS_ROUTES[i];
      const mesh = makeBusMesh(BUS_COLORS[i % BUS_COLORS.length]);
      scene.add(mesh);
      const bus = new Car(mesh, route.horizontal ? -120 + i * 80 : route.roadAt, route.horizontal ? route.roadAt : -120 + i * 80, route.horizontal ? Math.PI / 2 : 0, 'City Bus', false);
      bus.cruise = 6;
      bus.baseCruise = 6;
      bus.horizontal = route.horizontal;
      bus.roadAt = route.roadAt;
      bus.dir = route.dir;
      bus.speed = 6;
      this.buses.push(bus);
    }
    for (let i = 0; i < 22; i += 1) {
      const mesh = makePedMesh(pick(this.rng, PED_COLORS));
      scene.add(mesh);
      const x = range(this.rng, -180, 180);
      const z = range(this.rng, -180, 160);
      const ped = {
        mesh, x, z, heading: this.rng() * Math.PI * 2,
        speed: range(this.rng, 0.9, 1.6),
        turnAt: 0, alive: true, taxi: false, name: 'Pedestrian',
      };
      // A quarter of pedestrians are commuters: they ping-pong between two
      // sidewalk waypoints instead of wandering at random.
      if (i % 4 === 0) {
        const ax = range(this.rng, -170, 170);
        const az = range(this.rng, -170, 150);
        ped.route = [{ x: ax, z: az }, { x: ax + range(this.rng, -60, 60), z: az + range(this.rng, -60, 60) }];
        ped.leg = 0;
      }
      mesh.position.set(x, 0, z);
      this.peds.push(ped);
    }
  }
  update(dt, time, playerCar, playerPos) {
    // Traffic: cruise along its road, wrap around the city edge.
    for (const car of this.cars) {
      if (car.horizontal) {
        car.x += car.dir * car.cruise * dt;
        if (car.x > 195) car.x = -195;
        if (car.x < -195) car.x = 195;
        car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.z += car.dir * car.cruise * dt;
        if (car.z > 195) car.z = -195;
        if (car.z < -195) car.z = 195;
        car.heading = car.dir > 0 ? 0 : Math.PI;
      }
      car.updateMesh();
      // Brake for the player's car ahead instead of driving through it.
      if (playerCar) {
        const fx = Math.sin(car.heading); const fz = Math.cos(car.heading);
        const ax = playerCar.x - car.x; const az = playerCar.z - car.z;
        const ahead = ax * fx + az * fz;
        const side = Math.abs(ax * fz - az * fx);
        if (ahead > 0 && ahead < 14 && side < 3) car.cruise = 2.5;
        else car.cruise = car.baseCruise;
      }
      // Bump the player car instead of passing through it.
      if (playerCar) {
        const dx = car.x - playerCar.x; const dz = car.z - playerCar.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 12 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          playerCar.x -= (dx / d) * (3.5 - d) * 0.5;
          playerCar.z -= (dz / d) * (3.5 - d) * 0.5;
          playerCar.speed *= 0.9;
        }
      }
    }
    // Buses run their fixed routes, same road rules as traffic.
    for (const bus of this.buses) {
      if (bus.horizontal) {
        bus.x += bus.dir * bus.cruise * dt;
        if (bus.x > 195) bus.x = -195;
        if (bus.x < -195) bus.x = 195;
        bus.heading = bus.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        bus.z += bus.dir * bus.cruise * dt;
        if (bus.z > 195) bus.z = -195;
        if (bus.z < -195) bus.z = 195;
        bus.heading = bus.dir > 0 ? 0 : Math.PI;
      }
      bus.updateMesh();
    }
    // Pedestrians: wander the sidewalks, turn at random.
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      if (ped.route) {
        // Commuters walk their waypoint route and back.
        const goal = ped.route[ped.leg];
        const dx = goal.x - ped.x; const dz = goal.z - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 2) { ped.leg = (ped.leg + 1) % ped.route.length; continue; }
        ped.heading = Math.atan2(dx / d, dz / d);
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = ped.heading;
        const swing = Math.sin(time * 7 + ped.x) * 0.35;
        ped.mesh.children[2].rotation.x = swing;
        ped.mesh.children[3].rotation.x = -swing;
        continue;
      }
      if (time > ped.turnAt) {
        ped.heading += range(this.rng, -1.2, 1.2);
        ped.turnAt = time + range(this.rng, 2, 6);
      }
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      if (Math.abs(ped.x) > 185) ped.heading = Math.PI - ped.heading;
      if (ped.z > 165 || ped.z < -185) ped.heading = -ped.heading;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      // Simple leg swing.
      const swing = Math.sin(time * 7 + ped.x) * 0.35;
      ped.mesh.children[2].rotation.x = swing;
      ped.mesh.children[3].rotation.x = -swing;
    }
  }
  nearestPed(x, z, maxDist) {
    let best = null; let bestD = maxDist * maxDist;
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      const dx = ped.x - x; const dz = ped.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = ped; }
    }
    return best;
  }
  nearestTrafficCar(x, z, maxDist) {
    let best = null; let bestD = maxDist * maxDist;
    for (const car of this.cars) {
      const dx = car.x - x; const dz = car.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = car; }
    }
    return best;
  }
}
