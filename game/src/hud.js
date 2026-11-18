// HUD: money, health, wanted stars, objective text, speed, hints and the
// canvas minimap with player, cars, police and the mission beacon.
import { CITY } from './city.js';

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.money = document.getElementById('money');
    this.wanted = document.getElementById('wanted');
    this.healthNum = document.getElementById('health-num');
    this.healthFill = document.getElementById('health-fill');
    this.objTitle = document.getElementById('objective-title');
    this.objSub = document.getElementById('objective-sub');
    this.objDist = document.getElementById('objective-dist');
    this.speed = document.getElementById('speed');
    this.ammo = document.getElementById('ammo');
    this.crosshair = document.getElementById('crosshair');
    this.interact = document.getElementById('interact');
    this.hint = document.getElementById('hint');
    this.banner = document.getElementById('banner');
    this.toast = document.getElementById('toast');
    this.toastTitle = document.getElementById('toast-title');
    this.toastSub = document.getElementById('toast-sub');
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.radio = document.getElementById('radio');
    this.clockTime = document.getElementById('clock-time');
    this.statTime = document.getElementById('stat-time');
    this.statDrive = document.getElementById('stat-drive');
    this.statCars = document.getElementById('stat-cars');
    this.statFares = document.getElementById('stat-fares');
    this.statCash = document.getElementById('stat-cash');
    this.statBusted = document.getElementById('stat-busted');
    this.toastUntil = 0;
    this.bannerUntil = 0;
  }
  setRadio(name) { if (this.radio) this.radio.textContent = '♪ ' + name + ' — press C to change'; }
  setClock(hour, minute, label) {
    if (!this.clockTime) return;
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    this.clockTime.textContent = hh + ':' + mm + ' ' + label;
  }
  setWeather(word) {
    const sub = document.querySelector('#clock small');
    if (sub) sub.textContent = 'SOLARA BAY · ' + word;
  }
  setStats(s) {
    if (!this.statTime) return;
    const mins = Math.floor((s.playSeconds || 0) / 60);
    this.statTime.textContent = mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm';
    this.statDrive.textContent = ((s.distanceDrivenM || 0) / 1000).toFixed(1) + ' km';
    this.statCars.textContent = String(s.carsStolen || 0);
    this.statFares.textContent = String((s.faresDone || 0) + (s.couriersDone || 0));
    this.statCash.textContent = '$' + (s.cashEarned || 0).toLocaleString('en-US');
    this.statBusted.textContent = String(s.timesBusted || 0);
  }
  setWeapon(name) {
    const el = document.getElementById('weapon-name');
    if (el) el.textContent = name;
  }
  show() { this.el.hidden = false; }
  hide() { this.el.hidden = true; }
  setMoney(n) { this.money.firstChild.textContent = '$' + n.toLocaleString('en-US'); }
  setHealth(hp) {
    this.healthNum.textContent = Math.max(0, Math.ceil(hp));
    this.healthFill.style.width = Math.max(0, hp) + '%';
    this.healthFill.classList.toggle('low', hp < 35);
  }
  setWanted(stars) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < stars ? '★' : '<span class="off">★</span>';
    this.wanted.innerHTML = s;
  }
  setObjective(title, sub, dist) {
    this.objTitle.textContent = title;
    this.objSub.textContent = sub;
    this.objDist.textContent = dist;
  }
  setDriving(speedMph, inCar) {
    this.speed.hidden = !inCar;
    if (inCar) this.speed.firstChild.textContent = Math.round(Math.abs(speedMph));
    this.ammo.hidden = inCar;
    this.crosshair.hidden = inCar;
  }
  setHint(text) { this.hint.innerHTML = text; }
  setInteract(text) {
    if (text) { this.interact.innerHTML = text; this.interact.hidden = false; }
    else this.interact.hidden = true;
  }
  showToast(title, sub, ms) {
    this.toastTitle.textContent = title;
    this.toastSub.textContent = sub;
    this.toast.hidden = false;
    this.toastUntil = performance.now() + (ms || 3200);
  }
  showBanner(text, ms) {
    this.banner.textContent = text;
    this.banner.hidden = false;
    this.bannerUntil = performance.now() + (ms || 2600);
  }
  update(time) {
    const now = performance.now();
    if (now > this.toastUntil) this.toast.hidden = true;
    if (now > this.bannerUntil) this.banner.hidden = true;
  }
  drawMinimap(game) {
    const ctx = this.mm;
    const W = 180; const H = 180;
    const scale = W / (CITY.half * 2 + 40);
    const toX = (x) => (x + CITY.half + 20) * scale;
    const toY = (z) => (z + CITY.half + 20) * scale;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#12283a';
    ctx.fillRect(0, 0, W, H);
    // Water + sand on the south edge.
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, toY(CITY.waterZ - 6), W, H - toY(CITY.waterZ - 6));
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, toY(CITY.beachZ), W, toY(CITY.waterZ) - toY(CITY.beachZ));
    // Roads.
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 4;
    for (let i = -3; i <= 3; i += 1) {
      const c = i * CITY.block;
      ctx.beginPath(); ctx.moveTo(toX(-CITY.half), toY(c)); ctx.lineTo(toX(CITY.half), toY(c)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(c), toY(-CITY.half)); ctx.lineTo(toX(c), toY(CITY.half)); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#8a94a0';
    for (const b of game.city.buildings) ctx.fillRect(toX(b.x - b.w / 2), toY(b.z - b.d / 2), b.w * scale, b.d * scale);
    // Mission beacon.
    const target = game.missions.target || (game.missions.taxi && game.missions.taxi.to);
    if (target) {
      ctx.fillStyle = '#ffb02e';
      ctx.beginPath(); ctx.arc(toX(target.x), toY(target.z), 5 + Math.sin(performance.now() / 250) * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(toX(target.x), toY(target.z), 9, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic cars (white), police (blue), enemies (purple).
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2); ctx.fill();
    };
    for (const c of game.traffic.cars) dot(c.x, c.z, '#cfd6dd', 1.8);
    for (const c of game.parkedCars) dot(c.x, c.z, '#9aa4ae', 1.8);
    for (const c of game.police.cars) dot(c.x, c.z, '#4da3ff', 2.6);
    for (const e of game.combat.enemies) if (e.alive) dot(e.x, e.z, '#c26be0', 2.4);
    // Taxi rider (gold), health packs (green), SMG crates (orange), heli (ringed blue).
    if (game.taxiPed && game.taxiPed.alive) dot(game.taxiPed.x, game.taxiPed.z, '#ffd94d', 2.6);
    for (const h of game.combat.healthPacks) if (!h.taken) dot(h.x, h.z, '#2fae4e', 2.2);
    for (const c of game.combat.weaponCrates) if (!c.taken) dot(c.x, c.z, '#d97b2e', 2.2);
    if (game.police.heli) {
      dot(game.police.heli.x, game.police.heli.z, '#4da3ff', 3.4);
      ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(toX(game.police.heli.x), toY(game.police.heli.z), 6, 0, Math.PI * 2); ctx.stroke();
    }
    // North marker so the minimap reads like a map.
    ctx.fillStyle = '#e8e2d4';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', toX(0) - 3, toY(-CITY.half) + 12);
    // Player arrow, rotated by heading.
    const px = game.playerCar ? game.playerCar.x : game.player.x;
    const pz = game.playerCar ? game.playerCar.z : game.player.z;
    const heading = game.playerCar ? game.playerCar.heading : game.player.heading;
    ctx.save();
    ctx.translate(toX(px), toY(pz));
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
