// Save / load: money, mission progress, player position and wanted level,
// kept in localStorage under one key. Nothing leaves the browser.
const KEY = 'solara-bay-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function hasSave() { return loadSave() !== null; }

// Lifetime stats: totals across every session, kept beside the save so the
// pause screen can show the player's career at a glance.
const STATS_KEY = 'solara-bay-stats-v1';

export function defaultStats() {
  return {
    playSeconds: 0,
    distanceDrivenM: 0,
    carsStolen: 0,
    faresDone: 0,
    couriersDone: 0,
    cashEarned: 0,
    rivalsDown: 0,
    timesBusted: 0,
  };
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return defaultStats();
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return defaultStats();
    return { ...defaultStats(), ...data };
  } catch {
    return defaultStats();
  }
}

export function writeStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    return true;
  } catch {
    return false;
  }
}

// Add n to one stat and persist the totals. Unknown keys are ignored.
export function bumpStat(stats, key, n) {
  if (typeof stats[key] !== 'number') return stats;
  stats[key] += n;
  return stats;
}

// Wipe both the save and the stats (fresh start from the menu).
export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(STATS_KEY);
    return true;
  } catch {
    return false;
  }
}
