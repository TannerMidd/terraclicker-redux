/**
 * Settlements — one truth for both scales.
 *
 * A delivered world's lights used to be drawn straight out of a seeded
 * stream in the orbit component, which was fine while they were decoration.
 * Phase 4 makes them places, and a place needs an address: this module owns
 * the roster of settlement spots as planet-space directions, and everything
 * else — the orbital sprites, the landing divert, the walkable district —
 * reads the same list. The lights you saw from orbit are the settlement you
 * walk into, because they are literally the same coordinates.
 *
 * Two laws, inherited and honoured:
 *
 *  - The draw order is sacred. Each candidate consumes the same rolls from
 *    the same stream (`seed ^ 0x11f5`) the orbit always used, so every spot
 *    that stood on dry land before this module existed is standing in
 *    exactly the same place now.
 *  - The sea owns what the sea owns. The old stream was happy to drop a
 *    city into the ocean, which nobody noticed while the lights were paint.
 *    A candidate is now accepted against the same macro field the ground
 *    bakes (the analytic water veto, Phase 3's law) — inland spots stand
 *    clear of the sea, shore-band spots become HARBOURS and get stilts.
 *
 * Pure and cached; no rng stream is consumed from the game. The macro
 * arithmetic is transcribed from planetGeometry/terrainField — test
 * `settlements.test.ts` locks the copies together, same standard as the
 * terrain's own transcription law.
 */
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { mulberry } from './rng';
import type { PlanetType } from './types';

export type SettlementWorldSize = 'small' | 'medium' | 'large' | 'huge';

/** What the roster derives from — civic facts frozen at delivery. */
export interface SettlementWorldSpec {
  seed: number;
  type: PlanetType;
  size: SettlementWorldSize;
  /** 1-based commission count; later deliveries carry denser settlement. */
  lifetimeIndex: number;
  /** A science quarter glows cooler — and consumes a stream roll, so it is
   * part of the world's identity, not a display choice. */
  hasLab: boolean;
  /** `award-winning-fjords` crinkles the coast band; the veto must agree. */
  fjords: boolean;
}

export interface SettlementSpot {
  /** Roster index — the settlement's identity. Never reordered. */
  index: number;
  /** Unit direction in the planet's own (record) frame. */
  dir: [number, number, number];
  /** 0–1 size roll: the orbit scales its glow from it, the ground its town. */
  sizeRoll: number;
  /** The science quarter (researchLab worlds only). */
  cool: boolean;
  /** Standing in the macro shore band: a stilt town at the waterline. */
  harbor: boolean;
  name: string;
}

/** Base light counts by size — the orbit's original table, now shared. */
export const SETTLEMENT_BASE: Record<SettlementWorldSize, number> = {
  small: 6,
  medium: 9,
  large: 12,
  huge: 16,
};

/** The most generous presentation multiplier any view uses ('closeup'). */
export const SETTLEMENT_CLOSEUP_MULT = 1.25;

/** Settlement light colours, shared so a window on the ground glows the
 * exact hex the orbit promised. */
export const SETTLEMENT_WARM_HEX = 0xffd9a0;
export const SETTLEMENT_COOL_HEX = 0x9fdcff;

/** Career maturity of a world: later deliveries carry denser settlement. */
export function settlementMaturity(lifetimeIndex: number): number {
  return 0.5 + 0.5 * Math.min(1, lifetimeIndex / 30);
}

/** What the world has become shows up as how built-up it looks. */
export function settlementCharacter(traits: readonly string[]): number {
  return traits.includes('engineered') ? 1.25 : traits.includes('austere') ? 0.75 : 1;
}

/**
 * How many roster spots a presentation shows, standing included. Standing
 * truncates the SAME prefix everywhere: a neglected world's lights go out a
 * few at a time in the places they always were, and a recovered world lights
 * up exactly the settlements it used to have. Never all the way dark —
 * somebody is always still there.
 */
export function settlementShownCount(
  rosterLength: number,
  spec: Pick<SettlementWorldSpec, 'size' | 'lifetimeIndex'>,
  variantMult: number,
  character: number,
  standing: number,
): number {
  if (rosterLength <= 0) return 0;
  const full = Math.round(
    SETTLEMENT_BASE[spec.size] * settlementMaturity(spec.lifetimeIndex) * variantMult * character,
  );
  const count = Math.max(full > 0 ? 1 : 0, Math.round(full * standing));
  return Math.min(rosterLength, count);
}

// ————— The macro field, transcribed (planetGeometry → terrainField → here) —————
// Any edit to the shapes there must land here too; settlements.test.ts locks
// this copy to terrainField's the way terrain-field.test.ts locks terrainField
// to orbit. Three copies is two more than ideal, but the direction law is
// firm: the engine imports no renderer, and the renderer already pays a span
// sample per landing without complaint.

const MACRO_SHAPE: Record<PlanetType, { freq: number; ridge: number }> = {
  terrestrial: { freq: 1.6, ridge: 0.5 },
  ice: { freq: 1.9, ridge: 0.3 },
  desert: { freq: 1.4, ridge: 0.7 },
  volcanic: { freq: 1.8, ridge: 1.0 },
  ocean: { freq: 1.5, ridge: 0.2 },
  gasgiant: { freq: 0.8, ridge: 0 },
};

/** A delivered world's sea sits at hydro = 1: 0.3 + 1 · 0.18. */
const SEA_NORM_DELIVERED = 0.48;
/** Above the sea by this much and the ground is confidently dry. */
const DRY_MARGIN = 0.015;

function macroRaw(
  noise: NoiseFunction3D,
  noise2: NoiseFunction3D,
  type: PlanetType,
  coastF: number,
  x: number,
  y: number,
  z: number,
): number {
  const shape = MACRO_SHAPE[type];
  const f = shape.freq;
  let e = 0;
  let a = 0.5;
  let ff = f;
  for (let o = 0; o < 4; o++) {
    e += a * noise(x * ff, y * ff, z * ff);
    a *= 0.5;
    ff *= 2.1;
  }
  if (shape.ridge > 0) {
    const r = 1 - Math.abs(noise2(x * f * 1.7, y * f * 1.7, z * f * 1.7));
    e += shape.ridge * 0.3 * r * r;
  }
  e += 0.1 * noise2(x * coastF, y * coastF, z * coastF);
  return e;
}

interface MacroSampler {
  /** Normalized macro elevation 0–1 at a unit direction. */
  normAt: (x: number, y: number, z: number) => number;
}

const samplerCache = new Map<string, MacroSampler>();

/**
 * The normalized macro sampler exactly as terrainField builds it: one
 * mulberry stream, two noises drawn in order, span over a fibonacci sphere.
 * Cached per (seed, type, coast) — worlds are immutable and a span sample
 * is 2048 noise calls nobody needs twice.
 */
function macroSampler(seed: number, type: PlanetType, coastF: number): MacroSampler {
  const key = `${seed}:${type}:${coastF}`;
  const hit = samplerCache.get(key);
  if (hit) return hit;
  const built = buildMacroSampler(seed, type, coastF);
  samplerCache.set(key, built);
  return built;
}

function buildMacroSampler(seed: number, type: PlanetType, coastF: number): MacroSampler {
  const rand = mulberry(seed);
  const noise = createNoise3D(rand);
  const noise2 = createNoise3D(rand);
  const N = 2048;
  const golden = Math.PI * (3 - Math.sqrt(5));
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = golden * i;
    const e = macroRaw(noise, noise2, type, coastF, Math.cos(a) * r, y, Math.sin(a) * r);
    if (e < min) min = e;
    if (e > max) max = e;
  }
  const span = max - min || 1;
  return {
    normAt: (x, y, z) => (macroRaw(noise, noise2, type, coastF, x, y, z) - min) / span,
  };
}

// ————— Names —————
// A separate stream per spot: names must never move a light by consuming a
// position roll. The register is the Guide's — municipal optimism, filed
// under "mostly harmless".

const NAME_PREFIX = [
  'Port', 'Fort', 'New', 'Lesser', 'Greater', 'Outer', 'Upper', 'Mostly',
] as const;
const NAME_BODY = [
  'Consequence', 'Prudence', 'Diligence', 'Contingency', 'Sufficiency',
  'Perspective', 'Preamble', 'Margin', 'Providence', 'Latitude',
  'Correction', 'Solace', 'Ballast', 'Meridian', 'Fortune', 'Practicality',
] as const;
const NAME_SOLO = [
  'The Depot', 'The Anchorage', 'The Allotments', 'The Overlook', 'The Works',
  'Halfway', 'Landfall', 'First Light', 'The Long Weekend',
] as const;

/** Deterministic settlement name for a (world, roster index) pair. */
export function settlementName(seed: number, index: number): string {
  const r = mulberry((seed ^ Math.imul(index + 1, 0x9e3779b9) ^ 0x5e77) >>> 0);
  if (r() < 0.18) return NAME_SOLO[Math.floor(r() * NAME_SOLO.length)]!;
  const p = NAME_PREFIX[Math.floor(r() * NAME_PREFIX.length)]!;
  const b = NAME_BODY[Math.floor(r() * NAME_BODY.length)]!;
  return `${p} ${b}`;
}

// ————— The roster —————

const rosterCache = new Map<string, SettlementSpot[]>();

function cacheKey(spec: SettlementWorldSpec): string {
  return `${spec.seed}:${spec.type}:${spec.size}:${spec.lifetimeIndex}:${spec.hasLab ? 1 : 0}:${spec.fjords ? 1 : 0}`;
}

/**
 * Every settlement the world has, as planet-space truth. The candidate
 * stream is the orbit's original arithmetic; acceptance is the water veto.
 * Generation aims for the largest count any presentation can ask for
 * (closeup × engineered), so every view truncates the same stable list.
 */
export function settlementRoster(spec: SettlementWorldSpec): SettlementSpot[] {
  const key = cacheKey(spec);
  const hit = rosterCache.get(key);
  if (hit) return hit;

  const r = mulberry((spec.seed ^ 0x11f5) >>> 0);
  const wanted = Math.max(
    1,
    Math.round(
      SETTLEMENT_BASE[spec.size] * settlementMaturity(spec.lifetimeIndex)
        * SETTLEMENT_CLOSEUP_MULT * 1.25,
    ),
  );
  const coastF = 4.2 + (spec.fjords ? 1 : 0) * 5;
  const macro = macroSampler(spec.seed, spec.type, coastF);

  const spots: SettlementSpot[] = [];
  // Bounded attempts keep a mostly-ocean world deterministic AND finite;
  // a world where nowhere is dry simply settled less, which is the truth.
  const attempts = wanted * 5;
  for (let i = 0; i < attempts && spots.length < wanted; i++) {
    // The orbit's exact candidate rolls, in the orbit's exact order.
    const z = (r() * 2 - 1) * 0.86;
    const a = r() * Math.PI * 2;
    const k = Math.sqrt(Math.max(0, 1 - z * z));
    const x = Math.cos(a) * k;
    const y = z;
    const zz = Math.sin(a) * k;
    const sizeRoll = r();
    const cool = spec.hasLab && r() < 0.22;

    const norm = macro.normAt(x, y, zz);
    if (norm < SEA_NORM_DELIVERED - DRY_MARGIN) continue; // the sea's, entirely
    const harbor = norm < SEA_NORM_DELIVERED + DRY_MARGIN;
    spots.push({
      index: spots.length,
      dir: [x, y, zz],
      sizeRoll,
      cool,
      harbor,
      name: settlementName(spec.seed, spots.length),
    });
  }

  rosterCache.set(key, spots);
  return spots;
}

/** Test-only: a cold cache, for determinism checks that mean it. */
export function clearSettlementRosterForTests(): void {
  rosterCache.clear();
}

/**
 * The normalized macro elevation this module judges water by, exposed so the
 * transcription can be LOCKED to terrainField's rather than asserted in a
 * comment — the same standard terrain-field.test.ts holds orbit to.
 */
export function settlementMacroNorm(
  spec: Pick<SettlementWorldSpec, 'seed' | 'type' | 'fjords'>,
  x: number,
  y: number,
  z: number,
): number {
  const coastF = 4.2 + (spec.fjords ? 1 : 0) * 5;
  return macroSampler(spec.seed, spec.type, coastF).normAt(x, y, z);
}

/**
 * The roster spot nearest a unit direction, with the angle between them —
 * the landing divert's question, and the offer line's.
 */
export function nearestSettlementSpot(
  roster: readonly SettlementSpot[],
  dir: readonly [number, number, number],
): { spot: SettlementSpot; angleRad: number } | null {
  let best: SettlementSpot | null = null;
  let bestDot = -2;
  for (const s of roster) {
    const d = s.dir[0] * dir[0] + s.dir[1] * dir[1] + s.dir[2] * dir[2];
    if (d > bestDot) {
      bestDot = d;
      best = s;
    }
  }
  if (!best) return null;
  return { spot: best, angleRad: Math.acos(Math.max(-1, Math.min(1, bestDot))) };
}

// ————— The landing divert —————

/**
 * How close (radians) an approach must aim to a settlement for the autoland
 * to prefer its doorstep. Wide enough that diving at the light you can see
 * counts as aiming; narrow enough that the wilderness twenty degrees north
 * of town is still on offer.
 */
export const SETTLEMENT_SNAP_RAD = 0.2;
/** How far from the district centre the pad sits, metres. A short walk in. */
export const SETTLEMENT_PAD_M = 240;

/**
 * Every doorstep the autoland may consider for a settlement, in a fixed
 * planet-space order: the macro-dry probes on two rings of bearings, then
 * the district centre itself as the last resort. The MACRO field is all
 * this module can judge — the local terrain octaves are seeded per landing
 * frame and do not exist until a frame is chosen — so the surface control
 * layer walks this list and takes the first candidate whose own countryside
 * keeps the plaza above the waterline. Engine proposes, surface disposes;
 * both are deterministic, so a settlement still has exactly one doorstep.
 */
export function settlementPadCandidates(
  spec: SettlementWorldSpec,
  spot: SettlementSpot,
  radiusM: number,
): [number, number, number][] {
  const d = spot.dir;

  // The spot's own tangent frame — the same ŷ-cross construction the landing
  // frame uses, so it is deterministic and planet-fixed.
  let ex = -d[2];
  let ey = 0;
  let ez = d[0];
  const el = Math.hypot(ex, ez);
  if (el < 1e-6) {
    // A polar settlement (the roster nudges off the deep poles, but 0.86 of
    // the way up is still legal): any horizontal bearing serves as east.
    ex = 1;
    ey = 0;
    ez = 0;
  } else {
    ex /= el;
    ez /= el;
  }
  const nx = d[1] * ez - d[2] * ey;
  const ny = d[2] * ex - d[0] * ez;
  const nz = d[0] * ey - d[1] * ex;

  const coastF = 4.2 + (spec.fjords ? 1 : 0) * 5;
  const macro = macroSampler(spec.seed, spec.type, coastF);
  const out: [number, number, number][] = [];
  for (const reach of [SETTLEMENT_PAD_M, SETTLEMENT_PAD_M * 2]) {
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * Math.PI * 2;
      const u = Math.cos(a) * reach;
      const v = Math.sin(a) * reach;
      let px = d[0] * radiusM + ex * u + nx * v;
      let py = d[1] * radiusM + ey * u + ny * v;
      let pz = d[2] * radiusM + ez * u + nz * v;
      const pl = Math.hypot(px, py, pz) || 1;
      px /= pl;
      py /= pl;
      pz /= pl;
      if (macro.normAt(px, py, pz) > SEA_NORM_DELIVERED + DRY_MARGIN) {
        out.push([px, py, pz]);
      }
    }
  }
  out.push([d[0], d[1], d[2]]);
  return out;
}

/**
 * Where the autoland sets down when an approach aims at a settlement: the
 * first macro-dry pad on the district's doorstep (the surface layer may
 * walk further down `settlementPadCandidates` when the local octaves
 * disagree). Falls back to the district centre itself when the whole
 * doorstep is shore — the surface raises a shoal under the boots
 * (buildSurfaceParams' clamp), and a wet plaza is still the plaza the
 * pilot was promised.
 *
 * Returns null when nothing on the roster is inside the snap cone: the
 * pilot was aiming at wilderness, and gets it.
 */
export function settlementApproach(
  spec: SettlementWorldSpec,
  dir: readonly [number, number, number],
  radiusM: number,
): { spot: SettlementSpot; pad: [number, number, number] } | null {
  const roster = settlementRoster(spec);
  const near = nearestSettlementSpot(roster, dir);
  if (!near || near.angleRad > SETTLEMENT_SNAP_RAD) return null;
  const pads = settlementPadCandidates(spec, near.spot, radiusM);
  return { spot: near.spot, pad: pads[0]! };
}

/** Convenience: the spec a GroundfallSession-shaped object implies. */
export function settlementSpecOf(s: {
  seed: number;
  type: PlanetType;
  size: SettlementWorldSize;
  lifetimeIndex: number;
  installations: readonly string[];
  quirks: readonly string[];
}): SettlementWorldSpec {
  return {
    seed: s.seed,
    type: s.type,
    size: s.size,
    lifetimeIndex: s.lifetimeIndex,
    hasLab: s.installations.includes('researchLab'),
    fjords: s.quirks.includes('award-winning-fjords'),
  };
}
