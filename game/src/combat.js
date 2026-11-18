// Combat: the player's pistol, tracer shots, rival crew enemies and cash
// pickups scattered around the city.
import * as THREE from 'three';
import { mulberry32, range, clamp } from './rng.js';

export function makeEnemyMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.38), new THREE.MeshLambertMaterial({ color: 0x5f2a6e }));
  body.position.y = 0.95; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd9a06a }));
  head.position.y = 1.62;
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.3, 1.1, 0.3);
  g.add(gun);
  return g;
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.tracers = [];
    this.pickups = [];
    this.cooldown = 0;
    this.weapon = 'pistol';   // pistol | smg
    this.healthPacks = [];
    this.weaponCrates = [];
    this.flashes = [];
  }
  spawnEnemies(points, count) {
    for (let i = 0; i < count; i += 1) {
      const p = points[i % points.length];
      const mesh = makeEnemyMesh();
      mesh.position.set(p.x + range(Math.random, -6, 6), 0, p.z + range(Math.random, -6, 6));
      this.scene.add(mesh);
      this.enemies.push({ mesh, x: mesh.position.x, z: mesh.position.z, hp: 50, alive: true, shootTimer: range(Math.random, 1, 3), heading: 0 });
    }
  }
  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }
  spawnPickups(rng, count) {
    const geo = new THREE.BoxGeometry(0.7, 0.12, 0.45);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2fae4e });
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(geo, mat);
      const x = range(rng, -180, 180);
      const z = range(rng, -180, 160);
      mesh.position.set(x, 0.4, z);
      mesh.rotation.y = rng() * Math.PI;
      this.scene.add(mesh);
      this.pickups.push({ mesh, x, z, value: 60 + Math.floor(rng() * 5) * 20, taken: false });
    }
  }
  // Hitscan shot from `origin` along `dir`. Returns the enemy hit, if any.
  shoot(origin, dir, maxDist) {
    if (this.cooldown > 0) return null;
    // The SMG spits faster and looser; the pistol hits harder per round.
    this.cooldown = this.weapon === 'smg' ? 0.09 : 0.22;
    const spread = this.weapon === 'smg' ? 1.6 : 1.1;
    const damage = this.weapon === 'smg' ? 26 : 34;
    let best = null; let bestT = maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - origin.x; const dz = e.z - origin.z;
      const t = dx * dir.x + dz * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = origin.x + dir.x * t - e.x;
      const pz = origin.z + dir.z * t - e.z;
      if (px * px + pz * pz < spread) { best = e; bestT = t; }
    }
    const end = { x: origin.x + dir.x * bestT, z: origin.z + dir.z * bestT };
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(origin.x, 1.4, origin.z),
      new THREE.Vector3(end.x, 1.2, end.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    // Muzzle flash: a brief bright quad at the barrel.
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    flash.position.set(origin.x + dir.x * 0.9, 1.4, origin.z + dir.z * 0.9);
    flash.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(flash);
    this.flashes.push({ mesh: flash, life: 0.06 });
    if (best) {
      best.hp -= damage;
      if (best.hp <= 0) { best.alive = false; this.scene.remove(best.mesh); }
    }
    return best;
  }
  weaponName() { return this.weapon === 'smg' ? 'SMG' : 'PISTOL'; }
  equipSMG() { this.weapon = 'smg'; }
  // Green-cross health packs and orange SMG crates, scattered by seed.
  spawnHealthPacks(rng, count) {
    for (let i = 0; i < count; i += 1) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      g.add(box);
      const crossMat = new THREE.MeshBasicMaterial({ color: 0x2fae4e });
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.1), crossMat);
      v.position.z = 0.42;
      g.add(v);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.1), crossMat);
      h.position.z = 0.42;
      g.add(h);
      const x = range(rng, -180, 180);
      const z = range(rng, -180, 160);
      g.position.set(x, 0.7, z);
      this.scene.add(g);
      this.healthPacks.push({ mesh: g, x, z, taken: false });
    }
  }
  spawnWeaponCrates(rng, count) {
    const geo = new THREE.BoxGeometry(0.9, 0.7, 0.9);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd97b2e });
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(geo, mat);
      const x = range(rng, -170, 170);
      const z = range(rng, -170, 150);
      mesh.position.set(x, 0.35, z);
      mesh.rotation.y = rng() * Math.PI;
      this.scene.add(mesh);
      this.weaponCrates.push({ mesh, x, z, taken: false });
    }
  }
  update(dt, time, player, hooks) {
    const onPickup = hooks && hooks.cash;
    const onHeal = hooks && hooks.heal;
    const onWeapon = hooks && hooks.weapon;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => {
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); return false; }
      return true;
    });
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => {
      if (f.life <= 0) { this.scene.remove(f.mesh); f.mesh.material.dispose(); return false; }
      f.mesh.material.opacity = Math.max(0, f.life / 0.06) * 0.9;
      return true;
    });
    // Enemies shoot back when the player is near and visible.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = player.x - e.x; const dz = player.z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      e.heading = Math.atan2(dx, dz);
      e.mesh.rotation.y = e.heading;
      e.shootTimer -= dt;
      if (d < 26 && e.shootTimer <= 0) {
        e.shootTimer = range(Math.random, 1.4, 2.6);
        if (Math.random() < 0.55) player.damage(7 + Math.random() * 6, 'shot');
      }
      if (d > 3 && d < 30) {
        e.x += Math.sin(e.heading) * 2.2 * dt;
        e.z += Math.cos(e.heading) * 2.2 * dt;
        e.mesh.position.set(e.x, 0, e.z);
      }
    }
    // Cash pickups spin and pay out on touch.
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 0.4 + Math.sin(time * 3 + p.x) * 0.08;
      const dx = player.x - p.x; const dz = player.z - p.z;
      if (dx * dx + dz * dz < 2.6) {
        p.taken = true;
        this.scene.remove(p.mesh);
        onPickup && onPickup(p.value);
      }
    }
    // Health packs mend 30 on touch; SMG crates upgrade the pistol.
    for (const h of this.healthPacks) {
      if (h.taken) continue;
      h.mesh.rotation.y += dt * 1.2;
      const dx = player.x - h.x; const dz = player.z - h.z;
      if (dx * dx + dz * dz < 3.2) {
        h.taken = true;
        this.scene.remove(h.mesh);
        onHeal && onHeal(30);
      }
    }
    for (const c of this.weaponCrates) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 0.8;
      const dx = player.x - c.x; const dz = player.z - c.z;
      if (dx * dx + dz * dz < 3.2) {
        c.taken = true;
        this.scene.remove(c.mesh);
        this.equipSMG();
        onWeapon && onWeapon('SMG');
      }
    }
  }
  enemiesLeft() { return this.enemies.filter((e) => e.alive).length; }
}
