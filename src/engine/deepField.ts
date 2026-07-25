/**
 * Where the Deep Field is, and what happens when you reach it.
 *
 * Placement is a pure function of the master seed and nothing else — not
 * progress, not run number, not prestige count. These objects were already
 * there before the first commission and they do not move, which is the whole
 * point: a universe's sky is fixed for its lifetime, and coordinates you
 * learned at ten planets are still good at four hundred.
 *
 * The engine stays free of three.js (law: the scene is derived state), so
 * positions come back as plain tuples and the scene layer lifts them into
 * vectors.
 */
import { mulberry } from './rng';
import {
  DEEP_FIELD,
  DEEP_FIELD_BY_ID,
  type DeepFieldDef,
  type DeepFieldShell,
} from '../content/deepField';
import {
  ANALYSIS_RATE,
  REFIT_BY_ID,
  SENSOR_RANGE,
  THRUST_MULT,
} from '../content/refit';
import type { ExpeditionState } from './types';

/** Distance-from-home band for each shell. The soft wall sits at 200u. */
const SHELL_RANGE: Record<DeepFieldShell, readonly [number, number]> = {
  near: [9, 26],
  mid: [40, 130],
  far: [200, 520],
  deep: [700, 1400],
};

/** A quarter of the catalogue sits behind you, where nobody thinks to look. */
const BEHIND_ODDS = 0.25;
/** Minimum separation between two landmarks, so nothing shares a berth. */
const MIN_SEPARATION = 12;

export interface DeepFieldSite {
  def: DeepFieldDef;
  /** Fixed world position. */
  pos: readonly [number, number, number];
}

function placeOne(def: DeepFieldDef, r: () => number): [number, number, number] {
  const [lo, hi] = SHELL_RANGE[def.shell];
  const dist = lo + r() * (hi - lo);
  // az = 0 points behind the camera (+z); az = π is the way the universe is
  // built. Elevation is squashed so the catalogue stays near the ecliptic
  // rather than hiding directly overhead.
  const behind = r() < BEHIND_ODDS;
  const az = behind ? (r() - 0.5) * 1.6 : Math.PI + (r() - 0.5) * 2.4;
  const el = (r() - 0.5) * 0.9;
  const flat = Math.cos(el);
  return [
    Math.sin(az) * flat * dist,
    Math.sin(el) * dist * 0.55,
    Math.cos(az) * flat * dist,
  ];
}

function farEnough(a: readonly number[], b: readonly number[]): boolean {
  const dx = a[0]! - b[0]!;
  const dy = a[1]! - b[1]!;
  const dz = a[2]! - b[2]!;
  return dx * dx + dy * dy + dz * dz >= MIN_SEPARATION * MIN_SEPARATION;
}

/**
 * The whole Deep Field for a universe, in catalogue order. Pure, cheap, and
 * stable — callers memoize on the seed rather than caching here.
 */
export function deepFieldSites(masterSeed: number): DeepFieldSite[] {
  const out: DeepFieldSite[] = [];
  for (let i = 0; i < DEEP_FIELD.length; i++) {
    const def = DEEP_FIELD[i]!;
    const r = mulberry((masterSeed ^ Math.imul(0x0dfd, i + 1)) >>> 0);
    let pos = placeOne(def, r);
    // Re-roll a berth that crowds one already taken. Bounded, so placement
    // stays a pure function even in a pathologically tight seed.
    for (let attempt = 0; attempt < 8; attempt++) {
      if (out.every((s) => farEnough(s.pos, pos))) break;
      pos = placeOne(def, r);
    }
    out.push({ def, pos });
  }
  return out;
}

/** Look up one site without building the rest (tests, jump targeting). */
export function deepFieldSite(id: string, masterSeed: number): DeepFieldSite | null {
  return deepFieldSites(masterSeed).find((s) => s.def.id === id) ?? null;
}

/**
 * Milliways stays this far ahead of you along its own bearing. It is not
 * elsewhere, it is elsewhen, and the practical consequence is that sensors
 * can reach it (at full refit) and the runabout never will.
 */
export const UNREACHABLE_HOLD = 210;

/**
 * Standoff geometry. The catalogue's `radius` is a nominal half-extent — the
 * long derelicts run several times it end to end — so every approach distance
 * is derived from it here rather than being guessed at three call sites.
 *
 * The invariant that matters: `hullShell < boardRange < jumpStandoff`. Park
 * against a hull and you are always inside your own boarding envelope, and a
 * jump always leaves you outside it, with the whole thing in the windscreen.
 */
export function hullShell(radius: number): number {
  // The floor matters: a teapot has a half-extent of 0.35, and parking that
  // close puts the lens inside the glaze. Small artefacts get looked at from
  // a polite distance instead.
  return Math.max(2.2, radius * 2 + 0.5);
}

export function boardRange(radius: number): number {
  return hullShell(radius) + 1.4;
}

export function jumpStandoff(radius: number): number {
  return hullShell(radius) + 4.5;
}

/**
 * Where a site actually is, given where you are watching from. Fixed for
 * everything except the one landmark that declines to be approached — the
 * scene and the helm both resolve position through here so they never
 * disagree about how far away dinner is.
 */
export function sitePositionAt(
  site: DeepFieldSite,
  camX: number,
  camY: number,
  camZ: number,
  out: [number, number, number],
): [number, number, number] {
  const [x, y, z] = site.pos;
  if (!site.def.unreachable) {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  }
  const home = Math.hypot(x, y, z) || 1;
  const ax = x / home;
  const ay = y / home;
  const az = z / home;
  const projected = camX * ax + camY * ay + camZ * az;
  const dist = Math.max(home, projected + UNREACHABLE_HOLD);
  out[0] = ax * dist;
  out[1] = ay * dist;
  out[2] = az * dist;
  return out;
}

// ————— Fresh state —————

export function createExpeditionState(): ExpeditionState {
  return { discovered: {}, boarded: {}, salvage: 0, refits: {} };
}

// ————— Refit-derived ship capabilities —————

function rankOf(expedition: ExpeditionState, id: string): number {
  const def = REFIT_BY_ID[id];
  if (!def) return 0;
  return Math.max(0, Math.min(def.maxRank, expedition.refits[id] ?? 0));
}

/** How far the sensors see. Everything beyond this is simply not there. */
export function sensorRange(expedition: ExpeditionState): number {
  return SENSOR_RANGE[rankOf(expedition, 'sensors')] ?? SENSOR_RANGE[0];
}

/** Scan rate multiplier — divides the catalogue's scanSeconds. */
export function analysisRate(expedition: ExpeditionState): number {
  return ANALYSIS_RATE[rankOf(expedition, 'analysis')] ?? 1;
}

/** Speed-cap multiplier applied on top of the range-based cap. */
export function thrustMult(expedition: ExpeditionState): number {
  return THRUST_MULT[rankOf(expedition, 'thrusters')] ?? 1;
}

export function hasJumpDrive(expedition: ExpeditionState): boolean {
  return rankOf(expedition, 'drive') > 0;
}

/** Salvage price of the next rank, or null when the line is maxed. */
export function refitCost(expedition: ExpeditionState, id: string): number | null {
  const def = REFIT_BY_ID[id];
  if (!def) return null;
  const rank = rankOf(expedition, id);
  if (rank >= def.maxRank) return null;
  return def.costs[rank] ?? null;
}

// ————— Progress helpers (Guide, achievements, HUD) —————

export function discoveredCount(expedition: ExpeditionState): number {
  return Object.keys(expedition.discovered).length;
}

export function boardedCount(expedition: ExpeditionState): number {
  return Object.keys(expedition.boarded).length;
}

export function isDiscovered(expedition: ExpeditionState, id: string): boolean {
  return expedition.discovered[id] !== undefined;
}

export function isBoarded(expedition: ExpeditionState, id: string): boolean {
  return expedition.boarded[id] !== undefined;
}

/** Seconds of held scan for a site, after the analysis suite has its say. */
export function scanSecondsFor(expedition: ExpeditionState, id: string): number {
  const def = DEEP_FIELD_BY_ID[id];
  if (!def) return 0;
  return def.scanSeconds / analysisRate(expedition);
}
