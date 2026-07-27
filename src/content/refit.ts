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
/**
 * Field-scan pulse reach on foot, metres, by field-kit rank. Rank 0 is the
 * suit's own instrument: short-armed but included in the price of the suit.
 */
export const SURFACE_SCAN_RANGE = [90, 150, 240, 380] as const;
/** Survey Skimmer cruise and fast-cruise, metres/second over the ground. */
export const SKIM_CRUISE_M_S = 21;
export const SKIM_BOOST_M_S = 29;
/**
 * Water depth the cushion tolerates, metres, by skimmer rank. Ranks 1–2 are
 * a ground-effect machine: shallows are ground with opinions, open water is
 * not ground at all. Rank 3 is a hull, and the question stops applying.
 * Lava is refused at every rank; the Guide is firm on this.
 */
export const SKIM_WATER_LIMIT_M = [0, 3, 3, Infinity] as const;
/** Rank at which the mast holds the scanner and the rail through weather. */
export const SKIM_STABILISED_RANK = 2;
/** Scan rate multiplier by analysis rank (higher finishes sooner). */
export const ANALYSIS_RATE = [1, 1.5, 2.25, 3.4] as const;
/** Speed-cap multiplier by nacelle rank. */
export const THRUST_MULT = [1, 1.25, 1.56, 1.95] as const;
/**
 * Cargo the hold will take, by rank. Rank 0 is no hold at all — hauling is
 * something you fit the ship for, not something it came with.
 */
export const CARGO_CAPACITY = [0, 20, 45, 90] as const;
/** Rigs that may stand at once, by rank. Rank 0 cannot place one. */
export const RIG_LIMIT = [0, 1, 3, 6] as const;
/**
 * Deterrent strength by rank — how quickly a patrol loses interest. It
 * disperses; it does not destroy. Rank 0 means talking your way out is the
 * only way out.
 */
export const DETERRENT_POWER = [0, 1, 1.9, 3] as const;

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
  {
    id: 'cargoHold',
    name: 'Cargo Hold',
    guide:
      'A hold, and the paperwork that lets you claim it is one. Freight is mass, and mass is a thing the ship notices in every turn you make afterwards.',
    maxRank: 3,
    costs: [10, 22, 44],
    effect: (rank) =>
      rank > 0 ? `carries ${CARGO_CAPACITY[rank]} tonnes` : 'no hold fitted',
  },
  {
    id: 'rigBay',
    name: 'Rig Bay',
    guide:
      'Carries survey rigs and the means to leave one behind. A rig, once planted, works whether or not anybody is watching, which is more than can be said for most of the crew.',
    maxRank: 3,
    costs: [12, 26, 52],
    effect: (rank) =>
      rank > 0 ? `${RIG_LIMIT[rank]} rig${RIG_LIMIT[rank] === 1 ? '' : 's'} on station` : 'no bay fitted',
  },
  {
    id: 'deterrent',
    name: 'Dispersal Field',
    guide:
      'Persuades an interested party to be interested in somewhere else. Harms nothing, damages nothing, and is deeply resented by everyone it works on.',
    maxRank: 3,
    costs: [16, 34, 68],
    effect: (rank) =>
      rank > 0 ? `disperses a patrol ×${DETERRENT_POWER[rank]!.toFixed(1)} faster` : 'not fitted',
  },
  {
    id: 'skimmer',
    name: 'Survey Skimmer',
    guide:
      'A ground-effect sled that stows in the runabout and disagrees with the ground at up to twenty-nine metres a second. The Guide notes that the horizon is mostly marketing until you have one of these.',
    maxRank: 3,
    costs: [12, 24, 48],
    effect: (rank) =>
      rank >= 3
        ? 'amphibious hull — open water is now scenery'
        : rank >= 2
          ? 'stabilised mast — the scanner and the rail hold in dust and whiteout'
          : rank >= 1
            ? `deploys from the runabout · ${SKIM_CRUISE_M_S}–${SKIM_BOOST_M_S} m/s`
            : 'not fitted',
  },
  {
    id: 'fieldKit',
    name: 'Field Survey Kit',
    guide:
      'Extends the suit scanner, which ships knowing the composition of everything within arm’s reach and the location of nothing. The kit fixes the second problem at a rate proportional to expenditure.',
    maxRank: 3,
    costs: [7, 15, 28],
    effect: (rank) => `field pulse reaches ${SURFACE_SCAN_RANGE[rank]} m`,
  },
];

export const REFIT_BY_ID: Record<string, RefitDef> = Object.fromEntries(
  REFITS.map((r) => [r.id, r]),
);
