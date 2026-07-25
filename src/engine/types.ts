import type { Decimal } from './num';
import type { RngState } from './rng';
import type { SituationInstance } from './situations';
import type { SubEthaKind } from '../content/subEtha';

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
  /**
   * The installations actually owned at delivery (building ids, most-built
   * first, capped) — the working hardware this world keeps forever. Pre-v5
   * worlds carry a biography-derived loadout from migration.
   */
  installations: string[];
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

/** Something that happened to a world after it was delivered. */
export interface WorldRecordEvent {
  kind:
    | 'petitionAnswered'
    | 'petitionIgnored'
    | 'situationResolved'
    | 'visited'
    | 'charter';
  /** Content id of whatever caused it, where there is one. */
  id: string;
  atGameMs: number;
}

/**
 * A world's life after delivery. Keyed by `lifetimeIndex`, which is unique
 * across every commission and never reset, and stored outside `run` so that
 * selling a portfolio loses the worlds without un-remembering them.
 * See engine/worldRecords.ts.
 */
export interface WorldRecord {
  lifetimeIndex: number;
  name: string;
  type: PlanetType;
  bottleneck: AspectId;
  /** Which commission delivered it. */
  commissionNumber: number;
  deliveredAtGameMs: number;
  /** Delivery facts that traits are derived from, kept so traits stay pure. */
  installationCount: number;
  quirkCount: number;
  survey: string | null;
  history: WorldRecordEvent[];
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

/**
 * The Deep Field logbook. Lifetime state: it survives prestige, because the
 * things out there were never part of the portfolio Magrathea buys.
 */
export interface ExpeditionState {
  /** Landmark id → gameTimeMs the scan resolved. */
  discovered: Record<string, number>;
  /** Landmark id → gameTimeMs it was boarded. */
  boarded: Record<string, number>;
  /** Spent only on the runabout. Never on production. */
  salvage: number;
  /** Refit id → rank owned. */
  refits: Record<string, number>;
  /** What is in the hold right now, or nothing. */
  manifest: ManifestState | null;
  /** The job board, as currently offered. */
  jobs: JobOffer[];
  /** Seam id → when it was prospected. Placement-eligible thereafter. */
  seams: Record<string, number>;
  /** Seam id → the rig standing on it. */
  rigs: Record<string, RigState>;
  /** Lifetime count, for the Guide and the achievements. */
  interdictions: number;
  /** Lifetime deliveries, freight and passengers alike. */
  deliveries: number;
  nextJobMs: number;
  /**
   * Waypoint id the helm is currently pointed at, or null. Resolved through
   * the live registry every read, so an expired job or a collected rig leaves
   * a pin that quietly forgets itself. See engine/waypoints.ts.
   */
  pinned: string | null;
  /**
   * Waypoint id → gameTimeMs of first arrival. Course hold is only offered for
   * somewhere you have actually been, so the helm flies the commute and never
   * the discovery.
   */
  visited: Record<string, number>;
}

/** One job as offered on the board. */
export interface JobOffer {
  /** Unique per offer, so accepting the right one is unambiguous. */
  uid: number;
  /** FreightDef id. */
  id: string;
  /** Origin and destination, as world lifetimeIndex (0 = the home planet). */
  from: number;
  to: number;
  fromName: string;
  toName: string;
  /** Straight-line distance between the two seats, for the distance pay. */
  distance: number;
  /** Salvage on delivery, already including the distance component. */
  salvage: number;
  /** Sim time this offer leaves the board. */
  expiresAtMs: number;
}

/** The accepted job, once it is in the hold. */
export interface ManifestState extends JobOffer {
  acceptedAtMs: number;
}

export interface RigState {
  placedAtMs: number;
  /** Salvage waiting to be collected, capped by the seam. */
  banked: number;
  /** Sim time the bank was last advanced. */
  lastTickMs: number;
}

/** A megaproject under construction, or standing. */
export interface MegaprojectState {
  /** Sim time the commission was signed. */
  startedAtMs: number;
  /** Ms of construction credited so far — advances offline too. */
  builtMs: number;
  done: boolean;
}

/** One line on the Sub-Etha. `site` marks a rumour and makes it actionable. */
export interface SubEthaEntry {
  id: number;
  atMs: number;
  kind: SubEthaKind;
  text: string;
  /** Deep Field landmark this entry points at (rumours only). */
  site?: string;
}

export interface SubEthaState {
  /** Ring buffer, oldest first. Capped at C.SUBETHA_LOG_MAX. */
  log: SubEthaEntry[];
  nextBroadcastMs: number;
  /**
   * Template ids of the last few ambient lines. The channel is small enough
   * that unguarded weighted picks visibly repeat themselves within a session.
   */
  recent: string[];
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
    /**
     * World lifetimeIndex → standing, 0.35…1. Absent means 1, which is why
     * this is empty for anybody who has never neglected anything. A world
     * below 1 has visibly dimmed and contributes less; it can always recover.
     */
    standing: Record<string, number>;
    /** Requests from delivered worlds, queued. Sold with the portfolio. */
    petitions: SituationInstance[];
  };

  /**
   * Megaprojects. NOT under `run`: Magrathea buys the portfolio, not the
   * monuments — a finished one keeps its effect across every commission that
   * follows, which makes it the only permanent thing the player can build.
   */
  megaprojects: Record<string, MegaprojectState>;
  /**
   * lifetimeIndex → what that world has been doing since. Outside `run`
   * deliberately: the portfolio sells, the memory does not.
   */
  worldRecords: Record<string, WorldRecord>;

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
    situationsAnswered: number;
    situationsIgnored: number;
    deliveries: number;
    rigsPlaced: number;
    megaprojectsBuilt: number;
    prestiges: number;
  };

  prestige: {
    bp: number;
    bpEarned: number;
    catalogue: Record<string, number>;
  };


  operations: OperationsState;
  /** The Deep Field logbook — discoveries, salvage, and the runabout's refit. */
  expedition: ExpeditionState;
  /** The channel: what the universe said, including while you were out. */
  subEtha: SubEthaState;
  buffs: BuffState[];
  bubbles: BubbleState[];
  activeEvents: ActiveEventState[];
  /** Open situations awaiting an answer (content/situations.ts). */
  situations: SituationInstance[];
  vogon: VogonState | null;

  timers: {
    nextBubbleMs: number;
    nextEventMs: number;
    nextSituationMs: number;
    nextPetitionMs: number;
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
  /** A held scan resolved a contact into a name and a Guide entry. */
  | { type: 'scanSite'; id: string }
  /** The runabout reached a scanned landmark and recovered what was left. */
  | { type: 'boardSite'; id: string }
  /** Spend salvage on the next rank of a refit line. */
  | { type: 'buyRefit'; id: string }
  /** Dev/testing input: grant TU and optionally set gauge fractions. */
  | { type: 'devGrant'; tu: string; gaugeFrac?: number }
  /** Dev/testing input: force a spawn. */
  | { type: 'devSpawn'; what: 'vogon' | 'bubble' | 'event' | 'broadcast' | 'situation' }
  /** Answer an open situation (or petition) with one of its options. */
  | { type: 'answerSituation'; uid: number; optionId: string }
  /** Take a job off the board and into the hold. */
  | { type: 'acceptJob'; uid: number }
  /** Drop what is in the hold, forfeiting the fee. */
  | { type: 'abandonManifest' }
  /** Deliver the manifest — the helm calls this on arrival. */
  | { type: 'deliverManifest' }
  /** A held scan resolved a seam; it can take a rig now. */
  | { type: 'prospectSeam'; id: string }
  /** Spend salvage to leave a rig on a prospected seam. */
  | { type: 'placeRig'; id: string }
  /** Collect what a rig has banked. */
  | { type: 'collectRig'; id: string }
  /** Commission a megaproject. */
  | { type: 'startMegaproject'; id: string }
  /** An interdiction resolved at the helm. */
  | { type: 'resolveInterdiction'; outcome: 'outrun' | 'complied' | 'deterred' }
  /** Point the helm at a registry waypoint, or `null` to clear it. */
  | { type: 'setWaypoint'; id: string | null }
  /** Record arrival at a waypoint — this is what earns course hold. */
  | { type: 'markVisited'; id: string }
  /**
   * Set a narrative flag. Deliberately narrow: only ids the engine already
   * knows about are accepted, so the UI cannot invent save state.
   */
  | { type: 'setFlag'; id: string; value: number };

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
  | { t: 'heritageArchived'; lifetimeIndex: number }
  | { t: 'siteScanned'; id: string }
  | { t: 'siteBoarded'; id: string; salvage: number }
  | { t: 'refitInstalled'; id: string; rank: number }
  | { t: 'situationOpened'; uid: number; id: string; world: string; petition?: boolean }
  | { t: 'jobAccepted'; uid: number; id: string; to: string }
  | { t: 'manifestDelivered'; id: string; salvage: number; to: string; passenger: boolean }
  | { t: 'manifestLost'; id: string; reason: 'complied' | 'abandoned' }
  | { t: 'seamProspected'; id: string }
  | { t: 'rigPlaced'; id: string }
  | { t: 'rigCollected'; id: string; salvage: number }
  | { t: 'megaprojectStarted'; id: string }
  | { t: 'megaprojectFinished'; id: string }
  | { t: 'interdicted'; outcome: 'outrun' | 'complied' | 'deterred' }
  | { t: 'waypointSet'; id: string }
  | {
      t: 'situationResolved';
      uid: number;
      id: string;
      text: string;
      world: string;
      /** Net standing change, for the chronicle's tone. */
      standing: number;
    };

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
  situationFreqMult: number;
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
