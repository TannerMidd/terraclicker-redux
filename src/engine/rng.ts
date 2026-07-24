/**
 * Seeded, named PRNG streams (mulberry32). Stream cursors live in the save,
 * so every roll is deterministic and replayable. No Math.random() anywhere
 * in the engine — that law is what keeps offline, tests, and saves honest.
 */

export type StreamId = 'planets' | 'bubbles' | 'events' | 'vogons' | 'visuals';

export type RngState = Record<StreamId, number>;

export function initRng(seed: number): RngState {
  // Derive well-separated stream seeds from the master seed.
  const mix = (n: number) => {
    let t = (n + 0x9e3779b9) >>> 0;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
  return {
    planets: mix(seed),
    bubbles: mix(seed + 1),
    events: mix(seed + 2),
    vogons: mix(seed + 3),
    visuals: mix(seed + 4),
  };
}

/** Advance a stream and return a float in [0, 1). Mutates the cursor. */
export function rand(rng: RngState, stream: StreamId): number {
  let t = (rng[stream] = (rng[stream] + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(rng: RngState, stream: StreamId, min: number, max: number): number {
  return min + rand(rng, stream) * (max - min);
}

export function randInt(rng: RngState, stream: StreamId, min: number, maxExclusive: number): number {
  return Math.floor(randRange(rng, stream, min, maxExclusive));
}

export function pick<T>(rng: RngState, stream: StreamId, arr: readonly T[]): T {
  const v = arr[randInt(rng, stream, 0, arr.length)];
  if (v === undefined) throw new Error('pick from empty array');
  return v;
}

export function pickWeighted<T extends { weight: number }>(
  rng: RngState,
  stream: StreamId,
  arr: readonly T[],
): T {
  const total = arr.reduce((a, e) => a + e.weight, 0);
  let roll = rand(rng, stream) * total;
  for (const e of arr) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  const last = arr[arr.length - 1];
  if (last === undefined) throw new Error('pickWeighted from empty array');
  return last;
}

/** Sample `n` distinct items (order deterministic). */
export function sample<T>(rng: RngState, stream: StreamId, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const i = randInt(rng, stream, 0, pool.length);
    out.push(pool.splice(i, 1)[0]!);
  }
  return out;
}

/** A standalone generator for visuals — derived from a seed, no save cursor. */
export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
