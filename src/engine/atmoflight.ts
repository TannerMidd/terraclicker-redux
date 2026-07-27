/**
 * Low-altitude flight: what the package permits, and what the air costs.
 *
 * Phase 6's numbers, kept free of three.js so the envelope can be tested
 * without a canvas — the surface layer reads these and flies them.
 *
 * The shape of the thing: a landing used to be a place, singular. With the
 * package fitted it becomes a REGION — the same landing frame, the same
 * seeded ground, reached at eighty metres a second instead of walked at
 * four. Nothing here mints anything. The sweep reveals; the boots still do
 * every piece of work, and the ledger still only pays for work.
 */
import {
  ATMO_BOOST_M_S,
  ATMO_CEILING_M,
  ATMO_CRUISE_M_S,
  ATMO_SETDOWN_NORMAL_Y,
  ATMO_STORMPROOF_RANK,
  ATMO_TERRAIN_HOLD_RANK,
} from '../content/refit';

export interface AtmoEnvelope {
  /** 0 when the package is not fitted; nothing below flies without it. */
  rank: number;
  /** Ground speed at the throttle stop, m/s. */
  cruise: number;
  /** Ground speed with the boost held, m/s. */
  boost: number;
  /** Ceiling above the ground underneath, metres. */
  ceiling: number;
  /** Shallowest ground normal the gear will set down on (1 = dead flat). */
  setdownNormalY: number;
  /** Rank 2+: the weather stops shoving the airframe. */
  stormproof: boolean;
  /** Rank 3: the altimeter holds height over terrain without being asked. */
  terrainHold: boolean;
}

export function atmoEnvelope(rank: number): AtmoEnvelope {
  const r = Math.max(0, Math.min(3, Math.floor(rank)));
  return {
    rank: r,
    cruise: ATMO_CRUISE_M_S[r] ?? 0,
    boost: ATMO_BOOST_M_S[r] ?? 0,
    ceiling: ATMO_CEILING_M[r] ?? 0,
    setdownNormalY: ATMO_SETDOWN_NORMAL_Y[r] ?? 1,
    stormproof: r >= ATMO_STORMPROOF_RANK,
    terrainHold: r >= ATMO_TERRAIN_HOLD_RANK,
  };
}

// ————— The lift, the hover, the set-down —————

/** Seconds from the pad to a hover. Short: this is a step, not a cinematic. */
export const LIFT_SECONDS = 2.2;
/** Where the lift ends, metres above the ground it left. */
export const HOVER_ALT_M = 55;
/** Seconds of held engage that mean "no, actually, orbit". */
export const ORBIT_HOLD_SECONDS = 1.1;
/** Below this height above ground, holding descend commits to a set-down. */
export const SETDOWN_ARM_M = 42;
/** Seconds of flare between committing and the gear taking the weight. */
export const SETDOWN_SECONDS = 1.9;
/** How far the autoland will spiral to find ground it likes, metres. */
export const SETDOWN_DIVERT_M = 260;
/** Clear water margin a set-down demands over the sea level, metres. */
export const SETDOWN_DRY_MARGIN_M = 1.5;
/** Nobody sets a runabout down inside somebody's plaza. */
export const SETDOWN_DISTRICT_CLEAR_M = 70;

// ————— The belly sweep —————

/**
 * The sensor looks DOWN through a cone, so altitude buys width — and the air
 * eventually takes it back. Fly low to see detail, high to cover distance,
 * and above the resolve ceiling the ground is just weather with texture.
 */
export const SWEEP_CONE = 1.45;
export const SWEEP_MAX_M = 900;
export const SWEEP_RESOLVE_CEILING_M = 1250;
/** Ground speed past which the sweep smears and stops charting, m/s. */
export const SWEEP_MAX_SPEED_M_S = 150;

/** Sweep radius on the ground right now, metres. Zero means it is not seeing. */
export function sweepRadius(altM: number, speedM_S = 0): number {
  if (!(altM > 0) || altM > SWEEP_RESOLVE_CEILING_M) return 0;
  if (speedM_S > SWEEP_MAX_SPEED_M_S) return 0;
  return Math.min(SWEEP_MAX_M, altM * SWEEP_CONE);
}

// ————— What an airborne stay can testify to —————

/**
 * Distance from the pad at which a stay counts as having crossed the region.
 * A determined skimmer pilot can reach it in about seven boosted minutes,
 * which is allowed: the package makes the trip reasonable, it does not own
 * the trip.
 */
export const REGION_CROSSING_M = 12_000;
