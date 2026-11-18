// Weather over Solara Bay: drifting clouds and passing rain showers.
// The state rolls on its own timer, rain follows the player, and the dim
// factor tells the daylight cycle how much sun the clouds are eating.
import * as THREE from 'three';

const RAIN_DROPS = 700;
const RAIN_SPAN = 130;
const RAIN_TOP = 46;

function makeRainPoints() {
  const positions = new Float32Array(RAIN_DROPS * 3);
  for (let i = 0; i < RAIN_DROPS; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * RAIN_SPAN;
    positions[i * 3 + 1] = Math.random() * RAIN_TOP;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_SPAN;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xa8c8e8, size: 0.22, transparent: true, opacity: 0.55, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false;
  return points;
}

function makeCloudPuff(x, y, z, s) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xf4f8fb, transparent: true, opacity: 0.85 });
  const g = new THREE.Group();
  for (const [ox, oy, oz, r] of [[0, 0, 0, 7], [7, -1, 2, 5], [-7, -1, -2, 5], [2, 2, -3, 4.5]]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    ball.position.set(ox, oy, oz);
    ball.scale.y = 0.55;
    g.add(ball);
  }
  g.position.set(x, y, z);
  g.scale.setScalar(s);
  return g;
}

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.state = 'clear';      // clear | overcast | rain
    this.dim = 0;              // 0 full sun .. 0.55 heavy cloud
    this.stateTimer = 75 + Math.random() * 60;
    this.rain = makeRainPoints();
    scene.add(this.rain);
    // Lightning: a high white point light that fires in brief cracks
    // while it rains, then dies back to nothing.
    this.flashLight = new THREE.PointLight(0xffffff, 0, 320);
    this.flashLight.position.set(0, 130, 0);
    scene.add(this.flashLight);
    this.flashLeft = 0;
    this.flashTimer = 14 + Math.random() * 16;
    this.clouds = [];
    for (let i = 0; i < 8; i += 1) {
      const cloud = makeCloudPuff(
        (Math.random() - 0.5) * 420,
        62 + Math.random() * 26,
        (Math.random() - 0.5) * 420,
        0.8 + Math.random() * 0.9,
      );
      cloud.userData.drift = 1.5 + Math.random() * 2.5;
      scene.add(cloud);
      this.clouds.push(cloud);
    }
    this.applyState();
  }
  label() {
    if (this.state === 'rain') return 'RAIN';
    if (this.state === 'overcast') return 'CLOUD';
    return 'CLEAR';
  }
  setState(next) {
    this.state = next;
    this.applyState();
  }
  applyState() {
    if (this.state === 'rain') {
      this.rain.visible = true;
      this.dim = 0.55;
      for (const c of this.clouds) c.children.forEach((m) => { m.material.opacity = 0.95; });
    } else if (this.state === 'overcast') {
      this.rain.visible = false;
      this.dim = 0.3;
      for (const c of this.clouds) c.children.forEach((m) => { m.material.opacity = 0.9; });
    } else {
      this.rain.visible = false;
      this.dim = 0;
      for (const c of this.clouds) c.children.forEach((m) => { m.material.opacity = 0.6; });
    }
  }
  rollState(rng) {
    // Clear days dominate the bay; showers pass through and move on.
    const roll = rng();
    if (roll < 0.55) return 'clear';
    if (roll < 0.85) return 'overcast';
    return 'rain';
  }
  update(dt, time, cx, cz, rng) {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.stateTimer = 75 + (rng ? rng() : Math.random()) * 90;
      this.setState(this.rollState(rng || Math.random));
    }
    // Clouds drift east and wrap around the city.
    for (const c of this.clouds) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 230) c.position.x = -230;
    }
    if (!this.rain.visible) return;
    // Rain falls around the player and recycles at the top.
    this.rain.position.set(cx, 0, cz);
    // Lightning cracks on its own timer while the rain is down.
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.flashTimer = 11 + Math.random() * 19;
      this.flashLeft = 0.28;
    }
    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      this.flashLight.intensity = 900 * Math.max(0, this.flashLeft / 0.28);
      this.flashLight.position.set(cx + (Math.random() - 0.5) * 90, 130, cz + (Math.random() - 0.5) * 90);
    } else {
      this.flashLight.intensity = 0;
    }
    const pos = this.rain.geometry.attributes.position;
    const fall = 34 * dt;
    for (let i = 0; i < RAIN_DROPS; i += 1) {
      let y = pos.getY(i) - fall;
      if (y < 0) y = RAIN_TOP;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
}
