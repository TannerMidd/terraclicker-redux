/**
 * Weather — a pure function of (seed, type, dir, aspects, gameTimeMs).
 *
 * Spine §4 of EXPEDITIONS.md, honoured literally: no rng streams, no stored
 * state, nothing in the save. The sky is arithmetic. Both scenes call the
 * same functions — the flight scene paints the fronts on the orbital cloud
 * shell, the surface scene stands inside them — so the storm you watched
 * from orbit is the storm you land in, to the millisecond.
 *
 * Construction: a handful of front SLOTS, each cycling on its own hashed
 * period. Within a cycle the slot may grow one front — kind drawn from the
 * planet type's table, weighted by the gauges (no air, no weather; dry
 * worlds rain dust, not water) — born at a hashed point, drifting along a
 * hashed great circle, with a smooth grow/fade envelope. Local weather at a
 * direction is the strongest front covering it, falloff included, which is
 * the "quantised into fronts with smooth interpolation" the spec ordered.
 *
 * Two laws with teeth:
 *  - Weather changes DECISIONS, never a health bar. The knobs it exports are
 *    scanner range, marker visibility, buried seams, swing counts — never
 *    damage.
 *  - Aspect-gated kinds. A commission with an empty Atmo gauge gets meteor
 *    showers through a vacuum, not rain; the weather arriving is part of the
 *    terraforming being visible.
 */
import { mulberry } from './rng';
import type { PlanetType } from './types';

export type WeatherKind =
  | 'clear'
  | 'rain'
  | 'fog'
  | 'storm' // electrical
  | 'dust' // desert front
  | 'whiteout' // ice blizzard
  | 'ash'
  | 'tremor'
  | 'meteors'; // thin-atmosphere shower

export interface WeatherAspects {
  thermal: number;
  atmo: number;
  hydro: number;
  bio: number;
}

/** What the sky needs to know about a world. A SurfaceSpec satisfies it. */
export interface WeatherSpec {
  seed: number;
  type: PlanetType;
  aspects: WeatherAspects;
}

export interface WeatherFront {
  slot: number;
  kind: Exclude<WeatherKind, 'clear'>;
  /** Unit centre direction, planet frame — the same frame landing dirs use. */
  center: [number, number, number];
  /** Angular radius (rad) of the full-strength core. */
  radius: number;
  /** Extra radians over which coverage fades to nothing. */
  falloff: number;
  /** 0–1 lifecycle envelope: born, mature, dissolving. */
  intensity: number;
  /** Unit drift direction at the centre (the way the front is going). */
  heading: [number, number, number];
}

export interface LocalWeather {
  kind: WeatherKind;
  /** 0–1: envelope × radial coverage of the dominant front at this dir. */
  intensity: number;
  /** Multiplier on the field pulse's reach. Dust chokes it; storms feed it. */
  scanRangeMult: number;
  /** 0–1 sight distance factor for fog/haze (1 = the type's normal air). */
  visibility: number;
  /** Whiteout: the compass marker rail is gone; heat is all that shows. */
  markersCut: boolean;
  /** Dust at strength: the sand moves and the buried lattice sites show. */
  buriedRevealed: boolean;
  /** Tremors at strength shake seams loose: one fewer swing to crack them. */
  hitsBonus: number;
  /** Wind in the landing frame, metres/second [east, north]. */
  wind: [number, number];
}

// ————— Tuning —————

/** Concurrent front slots planet-wide. */
export const FRONT_SLOTS = 6;
/** Below this Atmo fraction the air is too thin for airborne weather. */
export const ATMO_WEATHER_MIN = 0.22;
/** Dust must be at least this developed before it uncovers buried seams. */
export const DUST_REVEAL_MIN = 0.55;
/** Whiteout strength at which the marker rail gives up. */
export const WHITEOUT_CUT_MIN = 0.5;
/** In a whiteout, seams radiate heat this far onto the compass (m). */
export const THERMAL_TRAIL_RANGE_M = 46;
/** In a whiteout, the runabout's engines stay traceable this far (m). */
export const THERMAL_SHIP_RANGE_M = 320;
/** In a whiteout, a parked skimmer's cushion stays traceable this far (m). */
export const THERMAL_SKIMMER_RANGE_M = 240;

const CYCLE_MIN_MS = 9 * 60_000;
const CYCLE_MAX_MS = 15 * 60_000;
/** Fraction of a cycle spent growing in / fading out. */
const ENVELOPE_EDGE = 0.2;

const CLEAR: LocalWeather = {
  kind: 'clear',
  intensity: 0,
  scanRangeMult: 1,
  visibility: 1,
  markersCut: false,
  buriedRevealed: false,
  hitsBonus: 0,
  wind: [0, 0],
};

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'clear',
  rain: 'rain',
  fog: 'fog',
  storm: 'electrical storm',
  dust: 'dust front',
  whiteout: 'whiteout',
  ash: 'ashfall',
  tremor: 'tremors',
  meteors: 'meteor shower',
};

// ————— Hashing —————

function mix2(a: number, b: number): number {
  return (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 1, 0xc2b2ae35)) >>> 0;
}

/** Per-slot constants (period, phase) — stable across the world's whole life. */
function slotRand(seed: number, slot: number): () => number {
  return mulberry(mix2(seed ^ 0x5107, slot + 1));
}

/** Per-cycle draws — the front this slot grew this time around. */
function cycleRand(seed: number, slot: number, cycle: number): () => number {
  return mulberry(mix2(mix2(seed ^ 0xf407, slot + 1), cycle));
}

function smooth01(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ————— Kind tables —————

interface KindWeight {
  kind: Exclude<WeatherKind, 'clear'>;
  w: number;
}

/**
 * What this sky can produce right now, and how eagerly. `clearW` is the
 * weight of nothing happening; gauges scale everything else, so a world
 * grows weather as it grows air and water.
 */
function kindTable(type: PlanetType, a: WeatherAspects): { kinds: KindWeight[]; clearW: number } {
  const airK = clamp01((a.atmo - ATMO_WEATHER_MIN) / 0.4);
  const wetK = clamp01(a.hydro) * airK;
  // Meteor showers belong to thin skies: full weight in vacuum, gone once
  // the Atmo gauge can actually burn things up.
  const meteorW = 1.3 * clamp01(1 - a.atmo / 0.45);
  const kinds: KindWeight[] = [];
  const add = (kind: KindWeight['kind'], w: number) => {
    if (w > 0.001) kinds.push({ kind, w });
  };

  switch (type) {
    case 'terrestrial':
      add('rain', 2.4 * wetK);
      add('fog', 1.5 * clamp01(a.hydro) * airK);
      add('storm', 1.3 * airK);
      break;
    case 'ocean':
      add('rain', 2.8 * wetK);
      add('fog', 2.2 * clamp01(0.35 + a.hydro * 0.65) * airK);
      add('storm', 1.6 * airK);
      break;
    case 'desert':
      add('dust', 3.2 * airK);
      add('storm', 0.9 * airK); // dry lightning, a desert speciality
      add('fog', 0.3 * clamp01(a.hydro) * airK);
      break;
    case 'ice':
      add('whiteout', 2.9 * airK);
      add('fog', 1.5 * clamp01(0.3 + a.hydro * 0.7) * airK);
      break;
    case 'volcanic':
      // Ash needs air to hang in; a vacuum's plumes fall straight back down.
      add('ash', 2.5 * airK);
      add('tremor', 1.9); // geology does not consult the atmosphere
      add('storm', 1.1 * airK); // volcanic lightning
      break;
    case 'gasgiant':
      break; // unlandable; the table stays total anyway
  }
  add('meteors', type === 'gasgiant' ? 0 : meteorW);
  return { kinds, clearW: type === 'volcanic' ? 3 : 3.6 };
}

// ————— Fronts —————

/** Uniform point on the sphere from two rolls. */
function sphereDir(u: number, v: number): [number, number, number] {
  const y = 2 * u - 1;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = v * Math.PI * 2;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

function norm3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Rotate `v` about unit axis `k` by angle θ (Rodrigues). */
function rotate3(
  v: [number, number, number],
  k: [number, number, number],
  theta: number,
): [number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const kxv = cross3(k, v);
  const kd = dot3(k, v) * (1 - c);
  return [
    v[0] * c + kxv[0] * s + k[0] * kd,
    v[1] * c + kxv[1] * s + k[1] * kd,
    v[2] * c + kxv[2] * s + k[2] * kd,
  ];
}

/**
 * Every front alive at tMs, planet-wide. The same call from the helm and
 * from the ground; drawn in the planet frame both scenes share.
 */
export function weatherFronts(spec: WeatherSpec, tMs: number): WeatherFront[] {
  const out: WeatherFront[] = [];
  if (spec.type === 'gasgiant') return out;
  for (let slot = 0; slot < FRONT_SLOTS; slot++) {
    const sr = slotRand(spec.seed, slot);
    const period = CYCLE_MIN_MS + sr() * (CYCLE_MAX_MS - CYCLE_MIN_MS);
    const phase = sr() * period;
    const cycle = Math.floor((tMs + phase) / period);
    const u = ((tMs + phase) / period) - cycle; // 0–1 within this cycle

    const cr = cycleRand(spec.seed, slot, cycle);
    // Draw order is fixed law: kind roll, birth point, axis, rate, radius.
    const kindRoll = cr();
    const bu = cr();
    const bv = cr();
    const au = cr();
    const av = cr();
    const rateRoll = cr();
    const sizeRoll = cr();

    const { kinds, clearW } = kindTable(spec.type, spec.aspects);
    const total = kinds.reduce((s, k) => s + k.w, clearW);
    let roll = kindRoll * total - clearW;
    if (roll < 0) continue; // this slot grew nothing this cycle
    let kind: KindWeight['kind'] | null = null;
    for (const k of kinds) {
      roll -= k.w;
      if (roll < 0) {
        kind = k.kind;
        break;
      }
    }
    if (!kind) continue;

    const born = sphereDir(bu, bv);
    // Drift axis: a hashed direction pushed perpendicular to the birth point,
    // so the great circle actually carries the front somewhere.
    let axis = sphereDir(au, av);
    const along = dot3(axis, born);
    axis = norm3([
      axis[0] - born[0] * along,
      axis[1] - born[1] * along,
      axis[2] - born[2] * along,
    ]);
    const rate = (0.5 + rateRoll * 0.6) / 1000; // rad per second of game time
    const elapsedS = u * (period / 1000);
    const center = rotate3(born, axis, rate * elapsedS);
    const heading = norm3(cross3(axis, center));

    const intensity = smooth01(u / ENVELOPE_EDGE) * smooth01((1 - u) / ENVELOPE_EDGE);
    if (intensity < 0.01) continue;

    out.push({
      slot,
      kind,
      center,
      radius: 0.16 + sizeRoll * 0.2,
      falloff: 0.1 + sizeRoll * 0.12,
      intensity,
      heading,
    });
  }
  return out;
}

// ————— Local weather —————

/** Per-kind decision knobs at strength k. The whole gameplay surface. */
function knobsFor(kind: Exclude<WeatherKind, 'clear'>, k: number): Omit<LocalWeather, 'kind' | 'intensity' | 'wind'> {
  switch (kind) {
    case 'dust':
      return {
        scanRangeMult: 1 - 0.62 * k,
        visibility: 1 - 0.8 * k,
        markersCut: false,
        buriedRevealed: k >= DUST_REVEAL_MIN,
        hitsBonus: 0,
      };
    case 'whiteout':
      return {
        scanRangeMult: 1 - 0.35 * k,
        visibility: 1 - 0.88 * k,
        markersCut: k >= WHITEOUT_CUT_MIN,
        buriedRevealed: false,
        hitsBonus: 0,
      };
    case 'fog':
      return { scanRangeMult: 1, visibility: 1 - 0.82 * k, markersCut: false, buriedRevealed: false, hitsBonus: 0 };
    case 'rain':
      return { scanRangeMult: 1, visibility: 1 - 0.38 * k, markersCut: false, buriedRevealed: false, hitsBonus: 0 };
    case 'storm':
      // The ionosphere is briefly on your side: the field pulse reaches
      // further through a charged sky. Storms are good scanning weather.
      return { scanRangeMult: 1 + 0.5 * k, visibility: 1 - 0.3 * k, markersCut: false, buriedRevealed: false, hitsBonus: 0 };
    case 'ash':
      return { scanRangeMult: 1, visibility: 1 - 0.55 * k, markersCut: false, buriedRevealed: false, hitsBonus: 0 };
    case 'tremor':
      return { scanRangeMult: 1, visibility: 1, markersCut: false, buriedRevealed: false, hitsBonus: k >= 0.5 ? 1 : 0 };
    case 'meteors':
      return { scanRangeMult: 1, visibility: 1, markersCut: false, buriedRevealed: false, hitsBonus: 0 };
  }
}

/** Nominal wind speed by kind (m/s), scaled by local strength. */
const WIND_SPEED: Record<Exclude<WeatherKind, 'clear'>, number> = {
  rain: 8,
  fog: 1.5,
  storm: 12,
  dust: 17,
  whiteout: 13,
  ash: 5,
  tremor: 0,
  meteors: 0,
};

/**
 * The weather standing at one direction — spine §4's exact signature. The
 * dominant front wins; its coverage falls off smoothly at the edge, so a
 * front ARRIVES rather than switching on.
 */
export function weatherAt(
  spec: WeatherSpec & { dir: [number, number, number] },
  tMs: number,
): LocalWeather {
  const fronts = weatherFronts(spec, tMs);
  if (fronts.length === 0) return CLEAR;
  const dir = norm3(spec.dir);

  let best: WeatherFront | null = null;
  let bestK = 0;
  for (const f of fronts) {
    const ang = Math.acos(Math.max(-1, Math.min(1, dot3(dir, f.center))));
    const radial = smooth01((f.radius + f.falloff - ang) / f.falloff);
    const k = radial * f.intensity;
    if (k > bestK) {
      bestK = k;
      best = f;
    }
  }
  if (!best || bestK < 0.02) return CLEAR;

  // Wind blows the way the front is going, expressed in the landing frame's
  // east/north — the same ENU construction terrainField uses.
  let east: [number, number, number] = cross3([0, 1, 0], dir);
  if (dot3(east, east) < 1e-6) east = cross3([1, 0, 0], dir);
  east = norm3(east);
  const north = norm3(cross3(dir, east));
  const speed = WIND_SPEED[best.kind] * (0.35 + 0.65 * bestK);

  return {
    kind: best.kind,
    intensity: bestK,
    ...knobsFor(best.kind, bestK),
    wind: [dot3(best.heading, east) * speed, dot3(best.heading, north) * speed],
  };
}

/**
 * A weather state conjured at will — the DEV harness and visual tests force
 * kinds through this so the knobs stay the single source of truth. Not part
 * of the deterministic path; the game itself never calls it.
 */
export function syntheticWeather(kind: WeatherKind, intensity = 0.85): LocalWeather {
  if (kind === 'clear') return CLEAR;
  return {
    kind,
    intensity,
    ...knobsFor(kind, intensity),
    wind: [WIND_SPEED[kind] * 0.7, WIND_SPEED[kind] * 0.25],
  };
}

/**
 * When does it change? Scans forward and reports the first moment the
 * dominant kind differs, or the current kind meaningfully strengthens or
 * breaks. Pure like everything else, so the forecast is always RIGHT, which
 * the Guide considers the least weather forecasting can do.
 */
export function weatherOutlook(
  spec: WeatherSpec & { dir: [number, number, number] },
  tMs: number,
  horizonMs = 16 * 60_000,
  stepMs = 20_000,
): { kind: WeatherKind; inMs: number } | null {
  const now = weatherAt(spec, tMs);
  const band = (w: LocalWeather) =>
    w.kind === 'clear' ? 'clear' : `${w.kind}:${w.intensity >= 0.5 ? 'hard' : 'soft'}`;
  const nowBand = band(now);
  for (let dt = stepMs; dt <= horizonMs; dt += stepMs) {
    const next = weatherAt(spec, tMs + dt);
    if (band(next) !== nowBand) return { kind: next.kind, inMs: dt };
  }
  return null;
}

// ————— Deterministic texture: flashes and pulses —————

/**
 * Lightning schedule for an electrical storm: hashed per short window, so
 * every observer (scene, audio, orbit shell) agrees on when the sky fires.
 * Returns the flash envelope 0–1 at tMs.
 */
export function stormFlash(seed: number, tMs: number, intensity: number): number {
  if (intensity <= 0.05) return 0;
  const WINDOW = 1700;
  const w = Math.floor(tMs / WINDOW);
  const r = mulberry(mix2(seed ^ 0xf1a5, w));
  if (r() > 0.16 + intensity * 0.3) return 0;
  const at = r() * 0.7; // where in the window the strike lands
  const u = (tMs - w * WINDOW) / WINDOW - at;
  if (u < 0 || u > 0.22) return 0;
  // Sharp attack, double-pulse decay — the shape lightning actually has.
  const d = u / 0.22;
  return Math.max(0, (1 - d) * (0.6 + 0.4 * Math.cos(d * 19)));
}

/**
 * Tremor schedule: most windows are still; some carry a swell. Returns the
 * ground-shake envelope 0–1 at tMs — the camera and the audio both ride it.
 */
export function tremorPulse(seed: number, tMs: number, intensity: number): number {
  if (intensity <= 0.05) return 0;
  const WINDOW = 8000;
  const w = Math.floor(tMs / WINDOW);
  const r = mulberry(mix2(seed ^ 0x7e40, w));
  if (r() > 0.28 + intensity * 0.4) return 0;
  const at = 0.1 + r() * 0.4;
  const len = 0.18 + r() * 0.22;
  const u = ((tMs - w * WINDOW) / WINDOW - at) / len;
  if (u < 0 || u > 1) return 0;
  return Math.sin(u * Math.PI) * intensity;
}
