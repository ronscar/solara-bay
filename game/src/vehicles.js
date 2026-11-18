// Cars: procedural low-poly vehicles, one factory for player cars, traffic
// and police, plus arcade driving physics for the car the player is in.
import * as THREE from 'three';
import { mulberry32, range, pick, clamp } from './rng.js';
import { collideCircle } from './city.js';

export const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xe8e2d5, 0x22242a, 0x8a5fc2, 0xd97b2e];
export const CAR_NAMES = ['Comet', 'Sunrunner', 'Bayliner', 'Corsair', 'Dune GT', 'Marina', 'Palmetto', 'Viceroy'];

export function makeCarMesh(color, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2836 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.05, -0.2); cabin.castShadow = true;
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    g.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.6, 0.6]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    light.position.set(sx, 0.6, 2.22);
    g.add(light);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.42, -0.2);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    bar2.position.set(0.55, 1.42, -0.2);
    g.add(bar2);
  }
  return g;
}

export class Car {
  constructor(mesh, x, z, heading, name, police) {
    this.mesh = mesh;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.name = name || 'Car';
    this.police = !!police;
    this.stolen = false;
    this.steer = 0;
    this.alive = true;
    this.damage = 0;       // 0 fresh .. 1 wrecked: top speed sags, smoke shows
    this.topSpeed = 26;
    this.beams = null;     // headlight cones, fitted by addHeadlights
    this.smoke = null;
    const puff = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    puff.position.set(0, 1.1, -1.6);
    mesh.add(puff);
    this.smoke = puff;
    this.updateMesh();
  }
  updateMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    if (this.smoke) {
      const smoking = this.damage > 0.45;
      this.smoke.material.opacity = smoking ? 0.25 + Math.sin(performance.now() / 160) * 0.12 : 0;
      this.smoke.rotation.y += 0.05;
    }
  }
  takeDamage(n) {
    this.damage = clamp(this.damage + n, 0, 1);
    return this.damage >= 1;
  }
  repair() { this.damage = 0; }
  // Headlight beams: two translucent cones ahead of the car, for night driving.
  setLights(on) {
    if (on && !this.beams) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
      this.beams = [];
      for (const sx of [-0.6, 0.6]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 11, 10, 1, true), mat);
        cone.rotation.x = Math.PI / 2;
        cone.position.set(sx, 0.55, 7.4);
        this.mesh.add(cone);
        this.beams.push(cone);
      }
    }
    if (this.beams) for (const b of this.beams) b.visible = !!on;
    this.lightsOn = !!on;
  }
  // Arcade drive step. throttle -1..1, steer -1..1, dt seconds.
  drive(throttle, steer, dt, colliders) {
    const accel = throttle >= 0 ? 14 : 20;
    this.speed += throttle * accel * dt;
    this.speed *= Math.max(0, 1 - 0.6 * dt); // drag
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    // A battered car cannot reach its top speed.
    const cap = this.topSpeed * (1 - this.damage * 0.5);
    this.speed = clamp(this.speed, -9, cap);
    this.steer = steer;
    const turn = steer * clamp(Math.abs(this.speed) / 8, 0, 1) * 1.9 * Math.sign(this.speed || 1);
    this.heading += turn * dt;
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = collideCircle(colliders, nx, nz, 1.6);
    const hitWall = fixed.x !== nx || fixed.z !== nz;
    if (hitWall) this.speed *= 0.55;
    this.x = fixed.x; this.z = fixed.z;
    this.x = clamp(this.x, -196, 196);
    this.z = clamp(this.z, -196, 208);
    this.updateMesh();
    return hitWall;
  }
}

// Parked, stealable cars scattered near roads.
export function spawnParkedCars(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const roadAt = (Math.floor(rng() * 7) - 3) * 50;
    const along = range(rng, -170, 170);
    const horizontal = rng() < 0.5;
    const x = horizontal ? along : roadAt + 8.5;
    const z = horizontal ? roadAt + 8.5 : along;
    const color = pick(rng, CAR_COLORS);
    const mesh = makeCarMesh(color, false);
    scene.add(mesh);
    const car = new Car(mesh, x, z, horizontal ? Math.PI / 2 : 0, pick(rng, CAR_NAMES), false);
    car.parked = true;
    // One in five parked cars is a sports coupe: quicker, and worth stealing.
    if (rng() < 0.2) {
      car.name = 'Comet GT';
      car.topSpeed = 31;
      car.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0xd21f2e });
    }
    cars.push(car);
  }
  return cars;
}
