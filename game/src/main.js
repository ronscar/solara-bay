// Solara Bay — game orchestration: renderer, third-person player, driving,
// entering cars, shooting, busted flow, menus and the main loop.
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './rng.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, collideCircle, districtAt } from './city.js';
import { spawnParkedCars } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { MissionDirector } from './missions.js';
import { HUD } from './hud.js';
import { Weather } from './weather.js';
import { loadSave, writeSave, hasSave, loadStats, writeStats, bumpStat } from './save.js';
import { applyShotScene } from './shots.js';

const SEED = 7;
const SAVE_MONEY_START = 120;

function makePlayerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.38), new THREE.MeshLambertMaterial({ color: 0x2e6f8e }));
  body.position.y = 0.95; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.62;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.14, 8), new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  cap.position.y = 1.8;
  g.add(cap);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3136 });
  for (const sx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), legMat);
    leg.position.set(sx, 0.28, 0);
    g.add(leg);
  }
  return g;
}

export class Game {
  constructor() {
    this.state = 'menu';
    this.time = 0;
    this.money = SAVE_MONEY_START;
    this.health = 100;
    this.stats = loadStats();      // lifetime totals, shown on the pause screen
    this.clockHour = 8;            // the bay wakes at 08:00
    this.night01 = 0;              // 0 noon sun .. 1 deep night
    this.lightsOn = false;
    this.statTimer = 0;
    this.lastDriveX = null;
    this.lastDriveZ = null;
    this.player = { x: -25, z: -25, heading: 0, vy: 0, y: 0, speed: 0 };
    this.playerCar = null;
    this.camYaw = Math.PI * 0.75;
    this.camPitch = 0.32;
    this.camDist = 8;
    this.combatSpawned = false;
    this.missionDelay = 0;
    this.shotMode = new URLSearchParams(location.search).get('shot');
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.prepend(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
    this.city = buildCity(this.scene, SEED);
    // Grab the lights the city built, so the day/night cycle can steer them.
    this.sunLight = null;
    this.hemiLight = null;
    this.scene.traverse((o) => {
      if (o.isDirectionalLight) this.sunLight = o;
      if (o.isHemisphereLight) this.hemiLight = o;
    });
    this.skyDay = new THREE.Color(0x87bfe8);
    this.skyNight = new THREE.Color(0x0e1626);
    this.fogDay = new THREE.Color(0xbfd9ea);
    this.fogNight = new THREE.Color(0x0e1626);
    this.rng = mulberry32(SEED);
    this.parkedCars = spawnParkedCars(this.scene, this.rng, 10);
    this.traffic = new Traffic(this.scene, SEED);
    this.police = new Police(this.scene);
    this.combat = new Combat(this.scene);
    this.combat.spawnPickups(this.rng, 14);
    this.combat.spawnHealthPacks(this.rng, 6);
    this.combat.spawnWeaponCrates(this.rng, 3);
    this.weather = new Weather(this.scene);
    this.missions = new MissionDirector(this.scene, this.city.points);
    this.hud.setRadio(this.audio.stationName());
    this.updateDaylight(0);
    this.playerMesh = makePlayerMesh();
    this.scene.add(this.playerMesh);
    this.taxiPed = this.pickTaxiPed();
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.bindMenus();
    if (this.shotMode) this.startShot();
    else this.showMenu();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      // Shot mode freezes the simulation after its staged steps, so the
      // screenshot frame is exactly the staged one.
      if (this.state === 'playing' && !this.shotMode) this.update(dt);
      // Toasts and banners still expire on the wall clock, so a staged
      // "Car stolen" toast is gone by the time the shot is taken.
      this.hud.update(this.time);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  pickTaxiPed() {
    const ped = this.traffic.peds[3];
    if (ped) { ped.taxi = true; ped.name = 'Fare'; }
    return ped;
  }

  bindMenus() {
    document.getElementById('play').addEventListener('click', (e) => { e.currentTarget.blur(); this.audio.ensure(); this.startGame(null); });
    document.getElementById('continue').addEventListener('click', (e) => { e.currentTarget.blur(); this.audio.ensure(); this.startGame(loadSave()); });
    document.getElementById('resume').addEventListener('click', () => this.setPaused(false));
    document.getElementById('save-now').addEventListener('click', () => {
      this.saveGame();
      document.getElementById('save-note2').textContent = 'Saved just now.';
    });
    document.getElementById('quit-menu').addEventListener('click', () => {
      this.saveGame();
      document.getElementById('pause').hidden = true;
      this.state = 'menu';
      this.showMenu();
    });
    document.getElementById('busted-ok').addEventListener('click', () => {
      document.getElementById('busted').hidden = true;
      this.respawn();
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.audio.setMuted(!this.audio.muted);
      if (e.code === 'KeyP' && this.state === 'playing') this.setPaused(true);
      else if (e.code === 'KeyP' && this.state === 'paused') this.setPaused(false);
    });
  }

  showMenu() {
    document.getElementById('menu').hidden = false;
    document.getElementById('continue').hidden = !hasSave();
    this.hud.hide();
    this.state = 'menu';
  }

  setPaused(paused) {
    this.state = paused ? 'paused' : 'playing';
    document.getElementById('pause').hidden = !paused;
    if (paused) { this.hud.setStats(this.stats); this.saveStats(); }
  }

  startGame(save) {
    document.getElementById('menu').hidden = true;
    this.hud.show();
    this.state = 'playing';
    if (save) {
      this.money = save.money ?? SAVE_MONEY_START;
      this.player.x = save.x ?? this.city.points.spawn.x;
      this.player.z = save.z ?? this.city.points.spawn.z;
      this.missions.start(Math.min(save.mission ?? 0, 3), this);
      this.hud.showToast('Welcome back', 'Job ' + (this.missions.index + 1) + ' of 4 is waiting.');
    } else {
      this.money = SAVE_MONEY_START;
      this.player.x = this.city.points.spawn.x;
      this.player.z = this.city.points.spawn.z;
      this.health = 100;
      this.missions.start(0, this);
      this.hud.showToast('SOLARA BAY', 'Steal a car. Reach Ray\u2019s garage. The city is yours.');
    }
    this.syncHud();
  }

  saveGame() {
    writeStats(this.stats);
    return writeSave({
      money: this.money,
      mission: this.missions.index,
      x: this.playerCar ? this.playerCar.x : this.player.x,
      z: this.playerCar ? this.playerCar.z : this.player.z,
      wanted: this.police.wanted,
    });
  }

  addCash(n) {
    this.money += n;
    bumpStat(this.stats, 'cashEarned', n);
    this.syncHud();
  }

  damage(n, cause) {
    if (this.state !== 'playing') return;
    this.health -= n;
    this.syncHud();
    if (this.health <= 0) {
      this.health = 0;
      this.busted(cause === 'shot' ? 'wasted' : 'busted');
    }
  }

  busted(kind) {
    this.state = 'busted';
    const fine = Math.min(200, this.money);
    this.money -= fine;
    bumpStat(this.stats, 'timesBusted', 1);
    this.saveStats();
    this.police.clearAll();
    this.combat.clearEnemies();
    this.combatSpawned = false;
    document.getElementById('busted-title').textContent = kind === 'wasted' ? 'WASTED' : 'BUSTED';
    document.getElementById('busted-text').textContent = kind === 'wasted'
      ? 'The Violet crew got the better of you. You wake up outside the precinct, $' + fine + ' lighter.'
      : 'The Bay PD caught up with you. You lose $' + fine + ' in fines and wake up outside the precinct.';
    document.getElementById('busted').hidden = false;
    this.saveGame();
  }

  respawn() {
    this.health = 100;
    this.player.x = this.city.points.hospital.x;
    this.player.z = this.city.points.hospital.z;
    this.playerCar = null;
    this.playerMesh.visible = true;
    this.state = 'playing';
    this.syncHud();
    this.hud.showToast('Back on the streets', 'Ray still has work for you.');
  }

  toast(title, sub) { this.hud.showToast(title, sub); }

  missionComplete(text) {
    const m = this.missions.complete();
    if (!m) return;
    const payout = m.reward + this.missions.replayBonus();
    this.addCash(payout);
    this.audio.missionDone();
    this.hud.showToast('JOB DONE — ' + m.title, text + '  +$' + payout);
    this.combatSpawned = false;
    this.saveGame();
    if (!this.missions.isDone()) {
      this.missionDelay = 2.5;
    } else {
      this.hud.showBanner('ALL JOBS DONE — SOLARA BAY IS YOURS', 6000);
    }
  }

  missionFailed(text) {
    this.missions.fail();
    this.hud.showToast('JOB FAILED', text);
    this.missionDelay = 2.0;
  }

  // Day into night: the clock advances an hour a minute, the sun drops,
  // the sky and fog go navy, and the neon and headlights earn their keep.
  updateDaylight(dt) {
    this.clockHour = (this.clockHour + dt / 60) % 24;
    const elev = Math.sin((this.clockHour - 6) / 12 * Math.PI);
    this.night01 = clamp(0.5 - elev, 0, 1);
    const n = this.night01;
    const cloudDim = this.weather ? this.weather.dim : 0;
    if (this.sunLight) {
      this.sunLight.intensity = 2.6 * (1 - n * 0.85) * (1 - cloudDim * 0.45);
      this.sunLight.color.setHex(n > 0.6 ? 0x8fa8ff : 0xfff1cf);
    }
    if (this.hemiLight) this.hemiLight.intensity = 1.1 * (1 - n * 0.7);
    this.scene.background = this.scene.background || new THREE.Color();
    this.scene.background.lerpColors(this.skyDay, this.skyNight, n);
    if (this.scene.fog) this.scene.fog.color.lerpColors(this.fogDay, this.fogNight, n);
  }
  setClockHour(h) {
    this.clockHour = ((h % 24) + 24) % 24;
    this.updateDaylight(0);
  }
  saveStats() { writeStats(this.stats); }

  syncHud() {
    this.hud.setMoney(this.money);
    this.hud.setHealth(this.health);
    this.hud.setWanted(this.police.wanted);
  }

  nearestParkedCar(maxDist) {
    let best = null; let bestD = maxDist * maxDist;
    for (const car of this.parkedCars) {
      if (!car.parked) continue;
      const dx = car.x - this.player.x; const dz = car.z - this.player.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = car; }
    }
    return best;
  }

  enterCar(car) {
    this.playerCar = car;
    car.parked = false;
    this.playerMesh.visible = false;
    car.setLights(this.lightsOn);
    this.audio.doorSlam();
    if (!car.stolen) {
      car.stolen = true;
      bumpStat(this.stats, 'carsStolen', 1);
      if (this.police.crimeStealCar()) this.audio.wantedUp();
      this.hud.showToast('Car stolen', car.name + ' — the PD has your description.');
    }
    this.syncHud();
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    this.playerCar = null;
    this.audio.doorSlam();
    this.player.x = car.x - Math.sin(car.heading + Math.PI / 2) * 2.4;
    this.player.z = car.z - Math.cos(car.heading + Math.PI / 2) * 2.4;
    this.player.heading = car.heading;
    this.playerMesh.visible = true;
    this.playerMesh.position.set(this.player.x, 0, this.player.z);
  }

  shoot() {
    const dir = { x: Math.sin(this.player.heading), z: Math.cos(this.player.heading) };
    const origin = { x: this.player.x, z: this.player.z };
    const hit = this.combat.shoot(origin, dir, 60);
    this.audio.gunshot();
    if (hit) {
      if (!hit.alive) {
        bumpStat(this.stats, 'rivalsDown', 1);
        this.addCash(40);
        this.hud.showBanner('Rival down — +$40', 1600);
      }
    } else if (this.police.wanted < 5) {
      this.police.crimeShoot();
      this.syncHud();
    }
  }

  update(dt) {
    this.time += dt;
    const input = this.input;
    input.pollPad();
    const drag = input.consumeDrag();
    this.camYaw -= drag.dx * 0.005;
    this.camPitch = clamp(this.camPitch + drag.dy * 0.004, 0.05, 1.1);
    const axis = input.axis();
    // Gamepad left stick blends with the keys.
    const pad = input.padAxis();
    if (Math.abs(pad.x) > 0.01 || Math.abs(pad.z) > 0.01) {
      axis.x += pad.x;
      axis.z += pad.z;
    }
    // Radio, headlights and courier runs, on keys or pad.
    if (input.wasPressed('KeyC') || input.padWasPressed(3)) {
      this.hud.setRadio(this.audio.nextStation());
    }
    if (input.wasPressed('KeyL')) {
      this.lightsOn = !this.lightsOn;
      if (this.playerCar) this.playerCar.setLights(this.lightsOn);
      this.hud.showBanner(this.lightsOn ? 'Headlights on' : 'Headlights off', 1200);
    }
    if (input.wasPressed('KeyJ') && !this.missions.active && !this.missions.courier) {
      this.missions.startCourier(this);
    }
    // Story finished: R runs it again, with Ray's trust bonus.
    if (input.wasPressed('KeyR') && this.missions.isDone()) {
      this.missions.startReplay(this);
      this.hud.showToast('THE STORY, AGAIN', 'Ray pays a $100 bonus per job this time.');
    }
    // The clock runs: one game hour per real minute, day into night.
    this.updateDaylight(dt);
    this.city.tick(this.time, this.night01);
    // Weather rolls on: clouds drift, showers pass over the player.
    const wx = this.playerCar ? this.playerCar.x : this.player.x;
    const wz = this.playerCar ? this.playerCar.z : this.player.z;
    this.weather.update(dt, this.time, wx, wz, this.rng);
    // Lifetime stats tick over while the player is out.
    this.stats.playSeconds += dt;
    this.statTimer += dt;
    if (this.statTimer > 30) { this.statTimer = 0; this.saveStats(); }
    if (this.playerCar) {
      if (this.lastDriveX !== null) {
        const moved = Math.hypot(this.playerCar.x - this.lastDriveX, this.playerCar.z - this.lastDriveZ);
        this.stats.distanceDrivenM += moved;
      }
      this.lastDriveX = this.playerCar.x;
      this.lastDriveZ = this.playerCar.z;
    } else {
      this.lastDriveX = null;
      this.lastDriveZ = null;
    }

    if (this.missionDelay > 0) {
      this.missionDelay -= dt;
      if (this.missionDelay <= 0 && !this.missions.isDone()) {
        const m = this.missions.start(this.missions.index, this);
        if (m) this.hud.showToast('NEW JOB — ' + m.title, m.brief);
      }
    }

    if (this.playerCar) this.updateDriving(dt, axis, input);
    else this.updateOnFoot(dt, axis, input);

    this.traffic.update(dt, this.time, this.playerCar, this.player);
    this.police.update(dt, this.time, this.player, this.playerCar, (kind) => {
      if (kind === 'punch') this.damage(8, 'police');
      if (kind === 'ram') this.damage(4, 'police');
      if (kind === 'heli') {
        this.hud.showToast('PD HELICOPTER', 'Four stars — the chopper has the spotlight on you. Break line of sight.');
        this.audio.heliChop();
      }
    });
    this.combat.update(dt, this.time, this.player, {
      cash: (value) => {
        this.addCash(value);
        this.audio.pickup();
        this.hud.showBanner('Cash found — +$' + value, 1500);
      },
      heal: (n) => {
        this.health = Math.min(100, this.health + n);
        this.syncHud();
        this.hud.showBanner('Patched up — +' + n + ' health', 1500);
      },
      weapon: (name) => {
        this.hud.setWeapon(name);
        this.hud.showToast(name + ' picked up', 'Faster fire, looser spread. Make it count.');
      },
    });
    this.missions.update(dt, this.time, this);
    this.checkPedCollisions();
    this.updateCamera(dt);
    this.updateHud();
    this.audio.setEngine(this.playerCar ? Math.abs(this.playerCar.speed) / 26 : 0, !!this.playerCar);
    this.audio.setSiren(this.police.wanted >= 2);
    this.audio.updateSiren(this.time);
    input.endFrame();
  }

  updateOnFoot(dt, axis, input) {
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 9.5 : 5.2;
    const forward = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
    const right = { x: Math.sin(this.camYaw - Math.PI / 2), z: Math.cos(this.camYaw - Math.PI / 2) };
    let mx = forward.x * -axis.z + right.x * axis.x;
    let mz = forward.z * -axis.z + right.z * axis.x;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.player.heading = Math.atan2(mx, mz);
      const nx = this.player.x + mx * speed * dt;
      const nz = this.player.z + mz * speed * dt;
      const fixed = collideCircle(this.city.colliders, nx, nz, 0.6);
      this.player.x = clamp(fixed.x, -196, 196);
      this.player.z = clamp(fixed.z, -196, 204);
      this.player.speed = speed;
      const swing = Math.sin(this.time * 10) * 0.4;
      this.playerMesh.children[2].rotation.x = swing;
      this.playerMesh.children[3].rotation.x = -swing;
    } else {
      this.player.speed = 0;
      this.playerMesh.children[2].rotation.x = 0;
      this.playerMesh.children[3].rotation.x = 0;
    }
    // Jump with simple gravity.
    if ((input.wasPressed('Space') || input.padWasPressed(0)) && this.player.y === 0) this.player.vy = 6.5;
    this.player.vy -= 18 * dt;
    this.player.y = Math.max(0, this.player.y + this.player.vy * dt);
    if (this.player.y === 0) this.player.vy = 0;
    this.playerMesh.position.set(this.player.x, this.player.y, this.player.z);
    this.playerMesh.rotation.y = this.player.heading;

    // Enter a car, or take the taxi fare.
    const car = this.nearestParkedCar(4.5);
    const taxiNear = this.taxiPed && this.taxiPed.alive && !this.missions.taxi &&
      (this.player.x - this.taxiPed.x) ** 2 + (this.player.z - this.taxiPed.z) ** 2 < 12;
    if (car) this.hud.setInteract('<kbd>E</kbd> Steal the ' + car.name);
    else if (taxiNear) this.hud.setInteract('<kbd>E</kbd> Take the fare — drive them across town');
    else this.hud.setInteract(null);
    if (input.wasPressed('KeyE') || input.padWasPressed(2)) {
      if (car) this.enterCar(car);
      else if (taxiNear) {
        const dest = { x: (Math.random() < 0.5 ? -1 : 1) * 125, z: (Math.random() < 0.5 ? -1 : 1) * 125 };
        this.missions.startTaxi(this.taxiPed, dest);
        this.hud.showToast('Fare picked up', 'Drive your rider to the yellow marker. +$120.');
      }
    }
    if (input.wasPressed('KeyR') && this.missions.active) {
      this.missions.fail();
      this.missionDelay = 1.0;
      this.hud.showToast('Job restarted', 'Ray sets the job up again.');
    }
    // Shooting: click fires toward where the camera looks.
    if (input.consumeClick()) {
      this.player.heading = this.camYaw + Math.PI;
      this.shoot();
    }
  }

  updateDriving(dt, axis, input) {
    const car = this.playerCar;
    const throttle = -axis.z;
    const steer = axis.x;
    const handbrake = input.down('Space') || input.padDown(0);
    const hitWall = car.drive(throttle, steer, dt, this.city.colliders);
    if (hitWall && Math.abs(car.speed) > 6) {
      this.audio.crash();
      car.takeDamage(0.08);
      this.audio.skid();
    }
    if (handbrake) car.speed *= Math.max(0, 1 - 3 * dt);
    // Ray's garage patches the bodywork for $50 when you pull up outside.
    const gx = this.city.points.garage.x; const gz = this.city.points.garage.z;
    if (car.damage > 0.05 && this.money >= 50 && (car.x - gx) ** 2 + (car.z - gz) ** 2 < 400) {
      car.repair();
      this.money -= 50;
      this.syncHud();
      this.hud.showToast('Tuned up at Ray\u2019s', 'Bodywork fixed — $50. Good as new.');
    }
    // Running over a pedestrian is a crime.
    for (const ped of this.traffic.peds) {
      if (!ped.alive || ped.taxi) continue;
      const dx = ped.x - car.x; const dz = ped.z - car.z;
      if (dx * dx + dz * dz < 4.5 && Math.abs(car.speed) > 4) {
        ped.alive = false;
        ped.mesh.rotation.z = Math.PI / 2;
        ped.mesh.position.y = 0.3;
        if (this.police.crimeHitPed()) this.audio.wantedUp();
        this.hud.showToast('You hit a pedestrian!', 'The PD is on its way.');
        this.syncHud();
      }
    }
    if (input.wasPressed('KeyE') || input.padWasPressed(2)) this.exitCar();
    this.hud.setInteract(null);
  }

  checkPedCollisions() {
    // On foot, walking into a police officer's punch range is handled by Police.
  }

  updateCamera(dt) {
    let target;
    let desiredDist = 8;
    let desiredYaw = this.camYaw;
    if (this.playerCar) {
      const car = this.playerCar;
      target = new THREE.Vector3(car.x, 2.2, car.z);
      desiredDist = 11;
      const behind = car.heading + Math.PI;
      let dy = behind - desiredYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      desiredYaw += dy * Math.min(1, dt * 2.2);
      this.camYaw = desiredYaw;
    } else {
      target = new THREE.Vector3(this.player.x, 1.6 + this.player.y, this.player.z);
    }
    const cx = target.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * desiredDist;
    const cz = target.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * desiredDist;
    const cy = target.y + Math.sin(this.camPitch) * desiredDist + 1.2;
    this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
    this.camera.lookAt(target);
  }

  updateHud() {
    const obj = this.missions.objectiveText();
    let dist = '';
    if (this.missions.target) {
      const px = this.playerCar ? this.playerCar.x : this.player.x;
      const pz = this.playerCar ? this.playerCar.z : this.player.z;
      const d = Math.hypot(px - this.missions.target.x, pz - this.missions.target.z);
      dist = Math.round(d) + ' m to marker';
    }
    if (this.missions.taxi) {
      this.hud.setObjective('TAXI FARE — +$120', 'Drive your rider to the yellow marker.', dist);
    } else {
      this.hud.setObjective(obj.title, obj.sub, dist);
    }
    this.hud.setDriving(this.playerCar ? this.playerCar.speed * 2.2 : 0, !!this.playerCar);
    this.hud.setHealth(this.health);
    this.hud.setWanted(this.police.wanted);
    // Clock with the district you are standing in, and the weapon in hand.
    const hx = this.playerCar ? this.playerCar.x : this.player.x;
    const hz = this.playerCar ? this.playerCar.z : this.player.z;
    const hour = Math.floor(this.clockHour);
    const minute = Math.floor((this.clockHour - hour) * 60);
    const daypart = this.clockHour < 5 || this.clockHour >= 20 ? 'NIGHT' : this.clockHour < 8 ? 'DAWN' : this.clockHour < 17 ? 'DAY' : 'DUSK';
    this.hud.setClock(hour, minute, districtAt(hx, hz).toUpperCase() + ' · ' + daypart);
    this.hud.setWeather(this.weather ? this.weather.label() : 'CLEAR');
    this.hud.setWeapon(this.combat.weaponName());
    this.hud.setHint(this.playerCar
      ? '<kbd>W</kbd><kbd>S</kbd> Drive &nbsp; <kbd>A</kbd><kbd>D</kbd> Steer &nbsp; <kbd>Space</kbd> Handbrake &nbsp; <kbd>E</kbd> Exit car'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp; <kbd>Shift</kbd> Sprint &nbsp; <kbd>Click</kbd> Shoot &nbsp; <kbd>E</kbd> Enter car');
    this.hud.drawMinimap(this);
    this.hud.update(this.time);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  startShot() {
    // Screenshot mode: skip the menu, run the scene, flag readiness.
    document.getElementById('menu').hidden = true;
    this.hud.show();
    this.state = 'playing';
    applyShotScene(this, this.shotMode);
    this.syncHud();
    this.updateHud();
    this.render();
    window.__game = this;
    window.__shotReady = true;
  }
}

window.__game = new Game();
