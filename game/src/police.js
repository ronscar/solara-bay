// The wanted system and the Bay PD: stars rise with crimes, police cars and
// foot officers spawn and chase, and the heat cools off when you lie low.
import * as THREE from 'three';
import { makeCarMesh, Car } from './vehicles.js';
import { clamp, dist2 } from './rng.js';

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.wanted = 0;
    this.heat = 0;        // 0..100, stars = ceil(heat / 20)
    this.cars = [];
    this.officers = [];
    this.spawnTimer = 0;
    this.calmTimer = 0;
    this.bustTimer = 0;
    this.heli = null;        // Bay PD helicopter, 4 stars and up
    this.heliTimer = 0;
    this.roadblocks = [];    // parked interceptors blocking the road ahead
    this.blockTimer = 0;
  }
  addHeat(amount, reason) {
    this.heat = clamp(this.heat + amount, 0, 100);
    const stars = Math.ceil(this.heat / 20);
    const rose = stars > this.wanted;
    this.wanted = stars;
    this.calmTimer = 0;
    return rose;
  }
  crimeStealCar() { return this.addHeat(15, 'steal'); }
  crimeHitPed() { return this.addHeat(30, 'ped'); }
  crimeShoot() { return this.addHeat(14, 'shoot'); }
  crimeKillCop() { return this.addHeat(25, 'cop'); }

  officerMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.38), new THREE.MeshLambertMaterial({ color: 0x1e3a5f }));
    body.position.y = 0.95; body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
    head.position.y = 1.62;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x14263e }));
    cap.position.y = 1.82;
    g.add(cap);
    return g;
  }

  update(dt, time, player, playerCar, onCrime) {
    // Heat cools when no crime has happened recently.
    this.calmTimer += dt;
    if (this.calmTimer > 14 && this.wanted > 0) {
      this.heat = Math.max(0, this.heat - dt * 2.2);
      this.wanted = Math.ceil(this.heat / 20);
    }
    const wantCars = this.wanted >= 2 ? Math.min(3, this.wanted - 1) : 0;
    const wantOfficers = this.wanted >= 1 ? Math.min(4, this.wanted + 1) : 0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      if (this.cars.length < wantCars) this.spawnCar(player);
      if (this.officers.length < wantOfficers) this.spawnOfficer(player);
    }
    // Despawn extras when the heat drops (roadblock cars hold their posts).
    while (this.cars.length > wantCars + this.roadblocks.length) {
      const i = this.cars.findIndex((c) => !c.blocked);
      if (i < 0) break;
      const c = this.cars[i];
      this.cars.splice(i, 1);
      this.scene.remove(c.mesh);
    }
    while (this.officers.length > wantOfficers) {
      const o = this.officers.pop();
      this.scene.remove(o.mesh);
    }
    // Police cars chase and ram.
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    for (const car of this.cars) {
      if (car.blocked) continue; // roadblock cars hold their ground
      const dx = px - car.x; const dz = pz - car.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
      const target = clamp(d * 0.5, 10, 24);
      car.speed += (target - car.speed) * dt * 0.8;
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.updateMesh();
      if (d < 3.4) {
        // Ram: shove the player car and slow it.
        if (playerCar) {
          playerCar.speed *= 0.86;
          playerCar.x += (dx / d) * -1.2;
          playerCar.z += (dz / d) * -1.2;
        } else {
          onCrime && onCrime('ram');
        }
      }
    }
    // Officers chase on foot and punch when close.
    for (const o of this.officers) {
      const dx = player.x - o.x; const dz = player.z - o.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      o.heading = Math.atan2(dx, dz);
      const speed = 4.6;
      o.x += Math.sin(o.heading) * speed * dt;
      o.z += Math.cos(o.heading) * speed * dt;
      o.mesh.position.set(o.x, 0, o.z);
      o.mesh.rotation.y = o.heading;
      if (d < 1.4 && !player.inCar) {
        o.hitTimer -= dt;
        if (o.hitTimer <= 0) {
          o.hitTimer = 0.9;
          onCrime && onCrime('punch');
        }
      }
    }
    this.updateHeli(dt, time, player, playerCar, onCrime);
    this.updateRoadblocks(dt, player, playerCar);
  }
  heliMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.6), new THREE.MeshLambertMaterial({ color: 0x1e3a5f }));
    body.castShadow = true;
    g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.4), new THREE.MeshLambertMaterial({ color: 0x9fd4ff }));
    glass.position.set(0, 0.4, 1.4);
    g.add(glass);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x14161a }));
    rotor.position.y = 0.9;
    g.add(rotor);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(7, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.rotation.x = Math.PI;
    beam.position.y = -17;
    g.add(beam);
    g.userData.rotor = rotor;
    return g;
  }
  updateHeli(dt, time, player, playerCar, onCrime) {
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    if (this.wanted >= 4 && !this.heli) {
      const mesh = this.heliMesh();
      this.scene.add(mesh);
      this.heli = { mesh, x: px + 30, z: pz - 30, angle: 0 };
      mesh.position.set(this.heli.x, 32, this.heli.z);
      onCrime && onCrime('heli');
    }
    if (this.wanted < 4 && this.heli) {
      this.scene.remove(this.heli.mesh);
      this.heli = null;
    }
    if (!this.heli) return;
    // Circle the player at 26 m, rotor spinning, beam pinned on them.
    this.heli.angle += dt * 0.5;
    this.heli.x = px + Math.sin(this.heli.angle) * 26;
    this.heli.z = pz + Math.cos(this.heli.angle) * 26;
    this.heli.mesh.position.set(this.heli.x, 32 + Math.sin(time * 1.3) * 1.5, this.heli.z);
    this.heli.mesh.rotation.y = Math.atan2(px - this.heli.x, pz - this.heli.z);
    this.heli.mesh.userData.rotor.rotation.y += dt * 22;
    // The spotlight keeps the heat up: standing in the open at 4 stars
    // slows the cool-off, so the player has to break line of sight.
    this.calmTimer = Math.max(this.calmTimer - dt * 0.5, 0);
  }
  updateRoadblocks(dt, player, playerCar) {
    this.blockTimer -= dt;
    if (this.wanted >= 3 && this.roadblocks.length === 0 && this.blockTimer <= 0) {
      this.blockTimer = 9;
      const px = playerCar ? playerCar.x : player.x;
      const pz = playerCar ? playerCar.z : player.z;
      const heading = playerCar ? playerCar.heading : player.heading;
      const aheadX = px + Math.sin(heading) * 42;
      const aheadZ = pz + Math.cos(heading) * 42;
      const sideX = Math.sin(heading + Math.PI / 2);
      const sideZ = Math.cos(heading + Math.PI / 2);
      for (const s of [-6, 6]) {
        const mesh = makeCarMesh(0xf2f2f2, true);
        this.scene.add(mesh);
        const car = new Car(mesh, aheadX + sideX * s, aheadZ + sideZ * s, heading + Math.PI / 2, 'Bay PD Interceptor', true);
        car.blocked = true;
        this.cars.push(car);
        this.roadblocks.push(car);
      }
    }
    if (this.wanted < 3 && this.roadblocks.length > 0) {
      for (const c of this.roadblocks) {
        this.scene.remove(c.mesh);
        const i = this.cars.indexOf(c);
        if (i >= 0) this.cars.splice(i, 1);
      }
      this.roadblocks = [];
    }
  }
  spawnCar(player) {
    const a = Math.random() * Math.PI * 2;
    const x = player.x + Math.sin(a) * 70;
    const z = player.z + Math.cos(a) * 70;
    const mesh = makeCarMesh(0xf2f2f2, true);
    this.scene.add(mesh);
    const car = new Car(mesh, clamp(x, -190, 190), clamp(z, -190, 190), 0, 'Bay PD Interceptor', true);
    this.cars.push(car);
  }
  spawnOfficer(player) {
    const a = Math.random() * Math.PI * 2;
    const mesh = this.officerMesh();
    this.scene.add(mesh);
    const o = { mesh, x: player.x + Math.sin(a) * 26, z: player.z + Math.cos(a) * 26, heading: 0, hitTimer: 0, alive: true, hp: 40 };
    mesh.position.set(o.x, 0, o.z);
    this.officers.push(o);
  }
  clearAll() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const o of this.officers) this.scene.remove(o.mesh);
    if (this.heli) this.scene.remove(this.heli.mesh);
    this.cars = []; this.officers = [];
    this.heli = null; this.roadblocks = [];
    this.wanted = 0; this.heat = 0;
  }
}
