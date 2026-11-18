// Seeded RNG: the city, traffic and missions are identical for a given seed,
// so a screenshot scene can be replayed exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function rangeInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }

// Deterministic 2D hash: the same (x, z, seed) always yields the same
// number in [0, 1), so scattered decor never needs a stored table.
export function hash2(x, z, seed) {
  let h = (Math.floor(x) * 374761393 + Math.floor(z) * 668265263 + (seed | 0) * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth 1D value noise over the hash: gentle hills for waves and clouds.
export function smoothNoise(t, seed) {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash2(i, 0, seed);
  const b = hash2(i + 1, 0, seed);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

// Fisher-Yates shuffle that returns a fresh array, leaving the input alone.
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

// Pick n distinct entries without replacement.
export function pickN(rng, arr, n) {
  return shuffle(rng, arr).slice(0, Math.min(n, arr.length));
}

// Weighted pick: entries are { value, weight }; heavier entries win more often.
export function weightedPick(rng, entries) {
  let total = 0;
  for (const e of entries) total += e.weight;
  let roll = rng() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.value;
  }
  return entries[entries.length - 1].value;
}

// Box-Muller gaussian, mean 0, spread 1: natural-looking scatter.
export function gauss(rng) {
  const u = Math.max(rng(), 1e-9);
  const v = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// True with probability p (0..1).
export function chance(rng, p) { return rng() < p; }
