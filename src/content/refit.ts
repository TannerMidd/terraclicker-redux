/**
 * The runabout's refit list — the only thing salvage buys.
 *
 * Deliberately sealed off from the economy: no entry here touches TU, Science,
 * aspects, or planet progress. Exploration improves the ship, and the ship
 * makes exploring better. A player who never leaves the planet loses nothing
 * but the view.
 */

export interface RefitDef {
  id: string;
  name: string;
  /** Guide-voice description; the rank suffix is appended by the console. */
  guide: string;
  maxRank: number;
  /** Salvage cost per rank, index 0 = first rank. */
  costs: readonly number[];
  /** Short effect line, rendered per rank in the refit console. */
  effect: (rank: number) => string;
}

/** Sensor contact range in world units, by sensor rank. */
export const SENSOR_RANGE = [70, 110, 165, 250] as const;
/** Scan rate multiplier by analysis rank (higher finishes sooner). */
export const ANALYSIS_RATE = [1, 1.5, 2.25, 3.4] as const;
/** Speed-cap multiplier by nacelle rank. */
export const THRUST_MULT = [1, 1.25, 1.56, 1.95] as const;

export const REFITS: readonly RefitDef[] = [
  {
    id: 'sensors',
    name: 'Sensor Array',
    guide:
      'Detects objects at range and reports them as "unidentified", which is honest, and as "contact", which is optimistic.',
    maxRank: 3,
    costs: [5, 14, 30],
    effect: (rank) => `contacts detected within ${SENSOR_RANGE[rank]}u`,
  },
  {
    id: 'analysis',
    name: 'Analysis Suite',
    guide:
      'Resolves a contact into a name and a Guide entry. Works by comparing what it sees against everything the Guide has ever been told, most of which is wrong, but confidently so.',
    maxRank: 3,
    costs: [6, 16, 32],
    effect: (rank) => `scans complete ×${ANALYSIS_RATE[rank]!.toFixed(2)} faster`,
  },
  {
    id: 'thrusters',
    name: 'Thrust Nacelles',
    guide:
      'More thrust. The Sirius Cybernetics fitter is keen that you understand this is more thrust, and has said so four times.',
    maxRank: 3,
    costs: [8, 18, 34],
    effect: (rank) => `cruise ceiling ×${THRUST_MULT[rank]!.toFixed(2)}`,
  },
  {
    id: 'drive',
    name: 'Improbability Drive',
    guide:
      'Passes through every point in the universe on the way to the one you wanted, which makes the journey instantaneous and the paperwork enormous. Aim at a scanned contact and engage.',
    maxRank: 1,
    costs: [40],
    effect: (rank) => (rank > 0 ? 'jump to any scanned contact' : 'not fitted'),
  },
];

export const REFIT_BY_ID: Record<string, RefitDef> = Object.fromEntries(
  REFITS.map((r) => [r.id, r]),
);
