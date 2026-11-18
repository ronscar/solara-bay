// Solara Bay itself: a sun-soaked coastal grid city, built procedurally from
// one seeded pass. Exports the scene, collision boxes, road graph and spawn
// points the other systems drive on.
import * as THREE from 'three';
import { mulberry32, range, rangeInt, pick } from './rng.js';

export const CITY = {
  half: 200,          // city spans -200..200 m on x and z
  block: 50,          // one block (road centre to road centre)
  roadHalf: 5,        // half width of a road
  beachZ: 165,        // south of this line is sand, then water
  waterZ: 195,
};

const BUILDING_COLORS = [0xe8dcc8, 0xd9c4a5, 0xc9b8a3, 0xb8c4c9, 0xe0b48f, 0xcfd8dc, 0xd8cfae, 0xc2b49a];
const ROOF_COLORS = [0x8a7a66, 0x6e7f80, 0x9a8a76, 0x5f6e75];
const PALETTE = { road: 0x3a3f45, sidewalk: 0x9aa0a3, sand: 0xe8d29a, water: 0x2e7fa8, grass: 0x7fae62 };

function windowTexture(rng, base) {
  // A lit-window facade texture drawn on a canvas: no image files.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#' + base.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : 'rgba(20, 30, 44, 0.85)';
      g.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];   // {x, z, hx, hz} building footprints
  const buildings = [];
  const roads = [];       // road centre lines for traffic routing
  const group = new THREE.Group();
  scene.add(group);

  // Sky, sun and haze.
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0xbfd9ea, 220, 620);
  const sun = new THREE.DirectionalLight(0xfff1cf, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

  // Ground: grass base, road grid, sidewalks, sand and water.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 80, CITY.half * 2 + 80),
    new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
  for (let i = -3; i <= 3; i += 1) {
    const c = i * CITY.block;
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2, CITY.roadHalf * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(horizontal ? 0 : c, 0.02, horizontal ? c : 0);
      if (!horizontal) road.rotation.z = Math.PI / 2;
      road.receiveShadow = true;
      group.add(road);
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2, CITY.roadHalf * 2 + 6), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(horizontal ? 0 : c, 0.015, horizontal ? c : 0);
      if (!horizontal) walk.rotation.z = Math.PI / 2;
      group.add(walk);
      for (let d = -CITY.half + 12; d < CITY.half; d += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.4), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(horizontal ? d : c, 0.04, horizontal ? c : d);
        if (!horizontal) dash.rotation.z = Math.PI / 2;
        group.add(dash);
      }
      roads.push({ axis: horizontal ? 'x' : 'z', at: c });
    }
  }

  // Beach and sea on the south edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2, 30),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, CITY.beachZ + 15);
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 400, 220),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.01, CITY.waterZ + 110);
  group.add(sea);

  // Buildings: one per block, with a couple of districts left open.
  const openBlocks = new Set(['-1,-1', '0,2', '2,0', '-2,1', '1,-2', '-2,-2']); // parks / plaza / docks / garage
  const facadeMats = BUILDING_COLORS.map((c) => {
    const tex = windowTexture(rng, c);
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6e6258 });
  for (let bx = -3; bx <= 3; bx += 1) {
    for (let bz = -3; bz <= 3; bz += 1) {
      if (bz === 3) continue; // beach row stays open
      const key = bx + ',' + bz;
      if (openBlocks.has(key)) continue;
      const cx = bx * CITY.block + 25;
      const cz = bz * CITY.block + 25;
      const w = range(rng, 22, 30);
      const d = range(rng, 22, 30);
      const h = range(rng, 12, bz === 0 && Math.abs(bx) <= 1 ? 58 : 34);
      const mat = facadeMats[Math.floor(rng() * facadeMats.length)];
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      tower.position.set(cx, h / 2, cz);
      tower.castShadow = true; tower.receiveShadow = true;
      group.add(tower);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1), roofMat);
      roof.position.set(cx, h + 0.6, cz);
      group.add(roof);
      if (rng() < 0.5) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 8), new THREE.MeshLambertMaterial({ color: 0x7a6a55 }));
        tank.position.set(cx + w * 0.25, h + 2.5, cz - d * 0.2);
        group.add(tank);
      }
      colliders.push({ x: cx, z: cz, hx: w / 2, hz: d / 2 });
      buildings.push({ x: cx, z: cz, w, d, h });
    }
  }

  // Parks: trees and benches on the open blocks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4e8a3f });
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x3f7d44 });
  function tree(x, z, palm) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, palm ? 5 : 3.4, 6), trunkMat);
    trunk.position.set(x, palm ? 2.5 : 1.7, z);
    trunk.castShadow = true;
    group.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(palm ? 1.7 : 2.2, 8, 6), palm ? palmMat : leafMat);
    top.position.set(x, palm ? 5.6 : 4.4, z);
    top.castShadow = true;
    group.add(top);
  }
  for (const key of openBlocks) {
    const [bx, bz] = key.split(',').map(Number);
    const cx = bx * CITY.block + 25; const cz = bz * CITY.block + 25;
    for (let i = 0; i < 6; i += 1) tree(cx + range(rng, -14, 14), cz + range(rng, -14, 14), false);
  }
  for (let x = -180; x <= 180; x += 24) tree(x + range(rng, -4, 4), CITY.beachZ + 6 + range(rng, -2, 6), true);

  // Streetlights along the roads.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3136 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = -3; i <= 3; i += 1) {
    for (let d = -150; d <= 150; d += 50) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(i * CITY.block + 8, 3.5, d);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
      lamp.position.set(i * CITY.block + 8, 7.1, d);
      group.add(lamp);
    }
  }

  // Landmarks: Ray's garage (mission 1), the docks (mission 3), the hideout (mission 4).
  const garage = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 16), new THREE.MeshLambertMaterial({ color: 0xc25a3a }));
  garage.position.set(-75, 3.5, -75);
  garage.castShadow = true;
  group.add(garage);
  const garageSign = new THREE.Mesh(new THREE.BoxGeometry(20, 2.4, 0.6), new THREE.MeshBasicMaterial({ color: 0xffb02e }));
  garageSign.position.set(-75, 8.2, -66.5);
  group.add(garageSign);
  colliders.push({ x: -75, z: -75, hx: 12, hz: 8 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 60), new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  pier.position.set(150, 0.6, 180);
  group.add(pier);

  // Marina: moored boats bobbing off the pier, a boardwalk along the sand,
  // and a lighthouse at the pier's end whose beam sweeps the bay at night.
  const boats = [];
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d5 });
  const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x2e6f8e });
  for (let i = 0; i < 5; i += 1) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 7), i % 2 ? hullMat : hullMat2);
    hull.position.y = 0.6; hull.castShadow = true;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2.4), new THREE.MeshLambertMaterial({ color: 0xd9c4a5 }));
    cabin.position.set(0, 1.5, -0.8);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.5, 6), poleMat);
    mast.position.set(0, 3.2, 0.6);
    boat.add(mast);
    boat.position.set(118 + i * 16, 0, 212 + (i % 2) * 12);
    boat.rotation.y = range(rng, -0.2, 0.2);
    group.add(boat);
    boats.push({ mesh: boat, phase: rng() * Math.PI * 2, baseY: 0 });
  }
  const walkMat2 = new THREE.MeshLambertMaterial({ color: 0xa9835e });
  for (let x = -170; x <= 170; x += 10) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 3.4), walkMat2);
    plank.position.set(x, 0.2, CITY.beachZ - 2);
    group.add(plank);
  }
  // Neon signs: canvas textures with glowing words for the night city.
  function neonSign(text, color, w, h) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#101418';
    g.fillRect(0, 0, 256, 64);
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    return mesh;
  }
  const neonSigns = [];
  const marinaSign = neonSign('MARINA', '#4dd8ff', 18, 4.5);
  marinaSign.position.set(150, 9, 150);
  group.add(marinaSign);
  neonSigns.push(marinaSign);
  const hotelSign = neonSign('HOTEL PALM', '#ff7ad9', 22, 5.5);
  hotelSign.position.set(25, 40, -24);
  hotelSign.rotation.y = Math.PI / 2;
  group.add(hotelSign);
  neonSigns.push(hotelSign);
  const pierSign = neonSign('PIER 9', '#ffe066', 12, 3);
  pierSign.position.set(150, 7, 196);
  group.add(pierSign);
  neonSigns.push(pierSign);
  // Lighthouse: striped tower at the pier's end, beam sweeping the water.
  const lightTower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 10), new THREE.MeshLambertMaterial({ color: 0xe8e2d5 }));
  lightTower.position.set(150, 11, 208);
  lightTower.castShadow = true;
  group.add(lightTower);
  const lightTop = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  lightTop.position.set(150, 22.5, 208);
  group.add(lightTop);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(6, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.set(150, 22, 208);
  beam.rotation.z = Math.PI / 2;
  group.add(beam);
  // Hospital helipad: a marked circle the story uses as the respawn point.
  const helipad = new THREE.Mesh(
    new THREE.CircleGeometry(9, 20),
    new THREE.MeshLambertMaterial({ color: 0x5a6a72 }),
  );
  helipad.rotation.x = -Math.PI / 2;
  helipad.position.set(0, 0.05, -100);
  group.add(helipad);
  // Ferris wheel on the sand by the pier, turning slowly over the bay.
  const wheelSpin = new THREE.Group();
  wheelSpin.position.set(172, 15, 176);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.5, 8, 28),
    new THREE.MeshLambertMaterial({ color: 0xff5a7a }),
  );
  wheelSpin.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 10), poleMat);
  hub.rotation.x = Math.PI / 2;
  wheelSpin.add(hub);
  const cabins = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2), new THREE.MeshLambertMaterial({ color: 0xffd94d }));
    cabin.position.set(Math.cos(a) * 12, Math.sin(a) * 12, 0);
    wheelSpin.add(cabin);
    cabins.push(cabin);
  }
  group.add(wheelSpin);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 17, 0.8), poleMat);
    leg.position.set(172 + s * 5, 7.5, 176);
    leg.rotation.z = s * 0.32;
    group.add(leg);
  }
  // Stadium bowl on the north-west park block, with floodlight poles.
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 11, 18), new THREE.MeshLambertMaterial({ color: 0x9aa4ae }));
  bowl.position.set(-125, 5.5, -125);
  bowl.castShadow = true;
  group.add(bowl);
  const bowlTop = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 1.5, 18), new THREE.MeshLambertMaterial({ color: 0x3a7d44 }));
  bowlTop.position.set(-125, 11.4, -125);
  group.add(bowlTop);
  for (const [fx, fz] of [[-152, -152], [-98, -152], [-152, -98], [-98, -98]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 22, 6), poleMat);
    mast.position.set(fx, 11, fz);
    group.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
    head.position.set(fx, 22.4, fz);
    group.add(head);
  }
  colliders.push({ x: -125, z: -125, hx: 26, hz: 26 });

  const points = {
    spawn: { x: -25, z: -25 },
    garage: { x: -75, z: -50 },
    docks: { x: 150, z: 150 },
    hideout: { x: 125, z: -150 },
    delivery: { x: 125, z: 100 },
    hospital: { x: 0, z: -100 },
  };
  // Per-frame life: boats ride the swell, the lighthouse beam sweeps the
  // bay, and the neon signs breathe. Cheap, and it sells the night city.
  function tick(t, night01) {
    for (const b of boats) {
      b.mesh.position.y = Math.sin(t * 0.9 + b.phase) * 0.35;
      b.mesh.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
    }
    wheelSpin.rotation.z = t * 0.09;
    for (const cabin of cabins) cabin.rotation.z = -t * 0.09;
    beam.rotation.y = t * 0.45;
    const glow = 0.75 + Math.sin(t * 2.2) * 0.25;
    for (const s of neonSigns) s.material.opacity = night01 > 0.4 ? glow : 1;
    lightTop.material.color.setHex(night01 > 0.4 ? 0xfff2b0 : 0xd8cf9a);
  }
  return { group, colliders, buildings, roads, points, rng, tick, boats };
}

// Circle-vs-AABB collision: push a circle of radius r out of every building.
export function collideCircle(colliders, x, z, r) {
  let nx = x; let nz = z;
  for (const b of colliders) {
    const cx = Math.max(b.x - b.hx, Math.min(nx, b.x + b.hx));
    const cz = Math.max(b.z - b.hz, Math.min(nz, b.z + b.hz));
    const dx = nx - cx; const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      } else {
        nx = b.x + b.hx + r;
      }
    }
  }
  return { x: nx, z: nz };
}

export function insideCity(x, z) {
  return Math.abs(x) < CITY.half - 4 && Math.abs(z) < CITY.half - 4;
}

// Named districts: the minimap and the HUD clock borrow these names, and the
// courier jobs pick destinations from them.
export const DISTRICTS = [
  { name: 'Old Town', x: -100, z: -100, r: 90 },
  { name: 'Downtown', x: 0, z: 0, r: 80 },
  { name: 'Marina', x: 125, z: 125, r: 85 },
  { name: 'Northside', x: 0, z: -150, r: 75 },
  { name: 'The Docks', x: 150, z: 150, r: 60 },
  { name: 'Beachfront', x: 0, z: 175, r: 110 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const dx = x - d.x; const dz = z - d.z;
    if (dx * dx + dz * dz < d.r * d.r) return d.name;
  }
  return 'Solara Bay';
}
