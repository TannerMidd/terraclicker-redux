import type { Decimal } from './num';
import type { RngState } from './rng';

export type AspectId = 'thermal' | 'atmo' | 'hydro' | 'bio';
export const ASPECTS: readonly AspectId[] = ['thermal', 'atmo', 'hydro', 'bio'];

export type PlanetType = 'terrestrial' | 'ice' | 'desert' | 'volcanic' | 'ocean' | 'gasgiant';
export type PlanetSize = 'small' | 'medium' | 'large' | 'huge';

export type BubbleKind = 'normal' | 'golden' | 'whale' | 'petunias' | 'gargle';

export interface PlanetState {
  /** 0-based index within the current run. */
  index: number;
  /** 1-based count across all runs. #42 is always Earth. */
  lifetimeIndex: number;
  seed: number;
  type: PlanetType;
  size: PlanetSize;
  name: string;
  quirks: string[];
  /** Chosen survey id, or null. */
  survey: string | null;
  /** Pending pick-1-of-3, or null once chosen / not offered. */
  surveyOptions: string[] | null;
  gauges: Record<AspectId, Decimal>;
  targets: Record<AspectId, Decimal>;
}

export interface BuffState {
  id: string;
  label: string;
  /** Production multiplier (TU + aspects + science). */
  mult: number;
  /** Click-power multiplier. */
  clickMult: number;
  remainingMs: number;
}

export interface BubbleState {
  id: number;
  kind: BubbleKind;
  seed: number;
  remainingMs: number;
}

export interface ActiveEventState {
  id: string;
  remainingMs: number;
}

export interface VogonShip {
  id: number;
  seed: number;
  hit: boolean;
}

export interface VogonState {
  remainingMs: number;
  ships: VogonShip[];
  /** Poem line index for the UI scroll. */
  poemSeed: number;
}

/** Compact record of a finished world — enough to re-derive its look forever. */
export interface CompletedPlanetRecord {
  seed: number;
  type: PlanetType;
  size: PlanetSize;
  name: string;
}

export interface GameState {
  version: number;
  seed: number;
  rng: RngState;
  /** Total simulated milliseconds. The engine's only clock. */
  gameTimeMs: number;
  /** Wall-clock ms at creation — stats display only, never simulation. */
  createdAtWall: number;
  /** Wall-clock ms at last save — offline delta is computed from this. */
  savedAtWall: number;

  tu: Decimal;
  science: Decimal;

  buildings: Record<string, number>;
  /** Upgrade id → times purchased (1 for one-shots). */
  upgrades: Record<string, number>;
  research: {
    completed: string[];
    active: { id: string; remainingMs: number } | null;
  };
  /** Achievement id → gameTimeMs when unlocked. */
  achievements: Record<string, number>;

  planet: PlanetState;

  run: {
    /** 1-based run number. */
    number: number;
    planetsCompleted: number;
    systems: number;
    galaxies: number;
    tuEarned: Decimal;
    /** Every world finished this run, in order — the visible universe accretes from these. */
    completedPlanets: CompletedPlanetRecord[];
  };

  lifetime: {
    tuEarned: Decimal;
    clicks: number;
    planetsCompleted: number;
    systems: number;
    galaxies: number;
    bestGalaxies: number;
    bubblesCaught: number;
    petuniasCaught: number;
    vogonShipsRepelled: number;
    vogonReadingsEndured: number;
    prestiges: number;
  };

  prestige: {
    bp: number;
    bpEarned: number;
    catalogue: Record<string, number>;
  };

  buffs: BuffState[];
  bubbles: BubbleState[];
  activeEvents: ActiveEventState[];
  vogon: VogonState | null;

  timers: {
    nextBubbleMs: number;
    nextEventMs: number;
    nextVogonMs: number;
    /** ms since last acquisition (purchase/planet/upgrade) — rubber band. */
    stallMs: number;
    /** ms since last bubble catch — pity timer. */
    sinceBubbleCatchMs: number;
    nextIdCounter: number;
    /** Sub-tick remainder carried between steps (tick quantization). */
    tickCarryMs: number;
  };

  /** One-off narrative flags (Earth notice, vortex seen, …). */
  flags: Record<string, number | boolean>;
}

export type Input =
  | { type: 'click' }
  | { type: 'buyBuilding'; id: string; qty: number | 'max' }
  | { type: 'buyUpgrade'; id: string }
  | { type: 'startResearch'; id: string }
  | { type: 'chooseSurvey'; id: string }
  | { type: 'catchBubble'; id: number }
  | { type: 'hitVogonShip'; id: number }
  | { type: 'prestige' }
  | { type: 'buyPerk'; id: string }
  /** Dev/testing input: grant TU and optionally set gauge fractions. */
  | { type: 'devGrant'; tu: string; gaugeFrac?: number }
  /** Dev/testing input: force a spawn. */
  | { type: 'devSpawn'; what: 'vogon' | 'bubble' | 'event' };

export type SimEffect =
  | { t: 'planetComplete'; name: string; lifetimeIndex: number; bonus: Decimal }
  | { t: 'systemFormed'; count: number }
  | { t: 'galaxyFormed'; count: number }
  | { t: 'achievement'; id: string }
  | { t: 'eventStart'; id: string }
  | { t: 'bubbleSpawn'; id: number; kind: BubbleKind }
  | { t: 'bubbleCaught'; id: number; kind: BubbleKind; tu: Decimal }
  | { t: 'vogonStart' }
  | { t: 'vogonEnd'; cleared: boolean }
  | { t: 'shipRepelled'; id: number }
  | { t: 'researchDone'; id: string }
  | { t: 'surveyOffered' }
  | { t: 'prestiged'; bp: number }
  | { t: 'click'; power: Decimal };

/** Everything computed from state — never persisted (engine law #3). */
export interface Derived {
  tuPerSec: Decimal;
  sciencePerSec: Decimal;
  aspectPerSec: Record<AspectId, Decimal>;
  clickPower: Decimal;
  /** Marvin's automated clicks/sec (0 if unowned). */
  marvinClicksPerSec: number;
  costGrowth: number;
  costMult: number;
  buildingMults: Record<string, Decimal>;
  prodMult: Decimal;
  eventFreqMult: number;
  bubbleFreqMult: number;
  bubbleLifetimeMs: number;
  goldenOddsMult: number;
  offlineEfficiency: number;
  offlineCapMs: number;
  vogonDebuffMult: number;
  vogonsBlocked: boolean;
  researchSpeedMult: number;
  overflowRates: Record<AspectId, number>;
  headStart: number;
  startProbes: number;
  /** BP that would be earned by prestiging right now. */
  prestigeBp: number;
  totalBuildings: number;
}

export interface StepOptions {
  /** Suppress spawns and celebrations — used for offline catch-up. */
  offline?: boolean;
  /** 0=Sunday … 1=Monday … (for the Monday quirk). Injected, never read from Date. */
  utcDay?: number;
}

export interface StepResult {
  effects: SimEffect[];
}
