import type { Decimal } from './num';
import type { RngState } from './rng';

export type AspectId = 'thermal' | 'atmo' | 'hydro' | 'bio';
export const ASPECTS: readonly AspectId[] = ['thermal', 'atmo', 'hydro', 'bio'];
export type FactionId = 'magrathea' | 'mice' | 'vogon';
export type ContractTemplateId = 'delivery' | 'system' | 'bottleneck' | 'survey' | 'lean' | 'timed';
export type SystemSpecialty = AspectId | 'science' | 'production';

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
  /** Simulated time when this world entered the active commission. */
  startedAtGameMs: number;
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
  /** 1-based count across every commission. */
  lifetimeIndex: number;
  seed: number;
  type: PlanetType;
  size: PlanetSize;
  name: string;
  /** Personality and survey choices preserved for the Guide atlas. */
  quirks: string[];
  survey: string | null;
  /** Simulated time from arrival to delivery. Zero means an old save lacked the record. */
  completionMs: number;
  /** The aspect furthest behind immediately before the finishing work. */
  bottleneck: AspectId;
}

export type ContractObjective =
  | { kind: 'planets'; count: number }
  | { kind: 'systems'; count: number }
  | { kind: 'bottleneck'; aspect: AspectId; count: number }
  | { kind: 'surveyed'; count: number }
  | { kind: 'lean'; maxBuildings: number; count: number }
  | { kind: 'timed'; count: number; durationMs: number };

export interface ContractOffer {
  id: string;
  templateId: ContractTemplateId;
  faction: FactionId;
  objective: ContractObjective;
  rewardBp: number;
  rewardReputation: number;
}

export interface ActiveContract {
  offer: ContractOffer;
  acceptedAtGameMs: number;
  startPlanets: number;
  startSystems: number;
  progress: number;
  deadlineAtGameMs: number | null;
}

export interface ContractHistoryEntry {
  id: string;
  templateId: ContractTemplateId;
  faction: FactionId;
  completedAtGameMs: number;
  rewardBp: number;
  rewardReputation: number;
}

export interface HeritageWorldRecord extends CompletedPlanetRecord {
  commissionNumber: number;
  preservedAtGameMs: number;
}

export interface OperationsState {
  offers: ContractOffer[];
  active: ActiveContract | null;
  completed: ContractHistoryEntry[];
  reputation: Record<FactionId, number>;
  offerGeneration: number;
  rerolledAtSystem: number;
  systemSpecialties: Record<string, SystemSpecialty>;
  heritageCandidateLifetimeIndex: number | null;
  heritageWorlds: HeritageWorldRecord[];
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


  operations: OperationsState;
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
  | { type: 'acceptContract'; id: string }
  | { type: 'abandonContract' }
  | { type: 'rerollContracts' }
  | { type: 'assignSystemSpecialty'; systemIndex: number; specialty: SystemSpecialty | null }
  | { type: 'designateHeritage'; lifetimeIndex: number }
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
  | { t: 'click'; power: Decimal }
  | { t: 'contractAccepted'; id: string }
  | {
      t: 'contractCompleted';
      id: string;
      templateId: ContractTemplateId;
      faction: FactionId;
      rewardBp: number;
      rewardReputation: number;
    }
  | { t: 'contractFailed'; id: string; templateId: ContractTemplateId; reason: 'deadline' | 'prestige' | 'abandoned' }
  | { t: 'contractBoardRefreshed'; generation: number }
  | { t: 'systemSpecialtyAssigned'; systemIndex: number; specialty: SystemSpecialty | null }
  | { t: 'heritageDesignated'; lifetimeIndex: number }
  | { t: 'heritageArchived'; lifetimeIndex: number };

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
  /** Coherent local anomaly pressure, displayed on a 0?42% Guide scale. */
  improbability: number;
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
  /** Complete systems required for the current Magrathean commission. */
  prestigeRequiredSystems: number;
  /** Whether Magrathea will currently accept the portfolio. */
  prestigeEligible: boolean;
  /** Concurrent system-specialty slots earned through completed contracts. */
  dispatchSlots: number;
  /** Slots currently occupied by formed systems with a specialty. */
  dispatchesUsed: number;
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
