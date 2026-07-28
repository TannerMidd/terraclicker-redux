/**
 * Groundfall: the state machine between the helm and your boots.
 *
 * Mirrors flightControl.ts — mutable module state written by input handlers,
 * integrated once per frame by the scene. Phases:
 *
 *   entry    scripted dive through the atmosphere (flight scene, plasma up)
 *   descent  scripted glide from 3 km to the landing site (surface scene)
 *   walk     the player has legs; physics is a capsule on the height field
 *   skim     the Survey Skimmer, a cushion on the same height field
 *   fly      the runabout in air, low over the same landing's own ground
 *   takeoff  scripted ascent back to the swap altitude, then the helm
 *
 * Nothing here touches the save directly: samples ride in module state and
 * are banked through a sim input when the walker boards the runabout, the
 * same seal the rest of the flight economy honours.
 */
import { Euler, Quaternion, Vector3, type Camera, type PerspectiveCamera } from 'three/webgpu';
import { useUiBus, type GroundfallSession } from '../../fx/uiBus';
import { EXPEDITION_ART } from '../../assets';
import { actions, useGame } from '../../../state/store';
import { flightPrefs } from '../flightBindings';
import {
  analyticHeight,
  buildSurfaceParams,
  bakeTierRows,
  buildNormalMap,
  curvatureDrop,
  dirToLocal,
  findDrySite,
  heightAt,
  groundNormalAt,
  localToDir,
  makeTier,
  makeTierStream,
  PLANET_RADIUS_M,
  smoothTier,
  streamBegin,
  streamCommit,
  streamStep,
  TIER_FAR,
  TIER_NEAR,
  type HeightTier,
  type SurfaceParams,
  type SurfaceTiers,
  type TierStream,
} from './terrainField';
import {
  findSetdownSite,
  SETDOWN_REFUSAL_TEXT,
  type SetdownRefusal,
} from './terrainField';
import { depositSites, SITE_FIELD_RADIUS_SKIM, type DepositSpec } from './surfaceSites';
import { landmarkSites, type LandmarkSpec } from './surfaceLandmarks';
import {
  settlementApproach,
  settlementPadCandidates,
  settlementSpecOf,
} from '../../../engine/settlements';
import { settlementDistricts, type DistrictSpec } from './surfaceSettlements';
import {
  vignetteSites,
  VIGNETTE_CATALOG_M,
  type VignetteSpec,
} from './surfaceEcology';
import {
  SPECIES_BY_ID,
  speciesPresent,
  type GroundSpeciesDef,
} from '../../../content/groundSpecies';
import { SAMPLE_BY_ID } from '../../../content/groundSamples';
import { atmoRank, skimmerRank, surfaceScanRange } from '../../../engine/deepField';
import {
  SKIM_BOOST_M_S,
  SKIM_CRUISE_M_S,
  SKIM_STABILISED_RANK,
  SKIM_WATER_LIMIT_M,
} from '../../../content/refit';
import {
  atmoEnvelope,
  HOVER_ALT_M,
  LIFT_SECONDS,
  ORBIT_HOLD_SECONDS,
  SETDOWN_ARM_M,
  SETDOWN_DISTRICT_CLEAR_M,
  SETDOWN_DIVERT_M,
  SETDOWN_DRY_MARGIN_M,
  SETDOWN_SECONDS,
  sweepRadius,
  type AtmoEnvelope,
} from '../../../engine/atmoflight';
import { handlingFor } from '../../../engine/handling';
import { siteMinable } from '../../../engine/groundSites';
import {
  markWorldFacts,
  validateMark,
  STATION_CHART_M,
} from '../../../engine/groundMarks';
import { leadTargetAt } from '../../../engine/leads';
import { mulberry } from '../../../engine/rng';
import {
  stormFlash,
  syntheticWeather,
  tremorPulse,
  weatherAt,
  weatherOutlook,
  type LocalWeather,
  type WeatherKind,
} from '../../../engine/weather';
import type { GroundEvidence, GroundMark, GroundSiteOutcome, SampleHaul } from '../../../engine/types';
import * as audio from '../../audio/audio';

export type { GroundfallSession };
export type { DepositSpec };

export type GroundfallPhase = 'entry' | 'descent' | 'walk' | 'skim' | 'fly' | 'takeoff';

/**
 * What the pick can mean, once a seam has been scanned. `break` is the old
 * hold-to-swing; the others are the decision the scan buys you.
 */
export type MiningVerb = 'break' | 'core' | 'prospect' | 'preserve';
export const MINING_VERBS: readonly MiningVerb[] = ['break', 'core', 'prospect', 'preserve'];

/**
 * What the engage key can mean with NOTHING in reach (Phase 5): the field
 * pulse always, and — as certification opens the verbs — the marks. The
 * wheel chooses, exactly as it does at a seam.
 */
export type FieldVerb = 'pulse' | 'beacon' | 'station' | 'shelter' | 'repair';
/** Holding engage this long plants the selected mark at your feet. */
export const MARK_PLANT_SECONDS = 1.6;
/** Standing this close to a named landmark counts as having reached it. */
export const LANDMARK_REACH_M = 60;
/** Geology I: unscanned seams inside this stand on the rail, unlabelled. */
export const SEAM_SENSE_M = 46;
/** Prior marks further than this from the landing stay off the ground. */
const MARK_REGION_M = 30_000;
/** The resonator answers a held read from this close (Phase 5 leads). */
const RESONATOR_RANGE = 7;
/** Reading the resonance is deliberate work — twice a seam's dwell. */
const RESONATOR_READ_SECONDS = 1.8;

// ————— Tuning —————

const ENTRY_SECONDS = 6.2; // flight-scene dive under plasma
const DESCENT_START_ALT = 3000;
const DESCENT_SECONDS = 9.5;
export const TAKEOFF_SECONDS = 7.0;
const TAKEOFF_TOP_ALT = 2600;
export const EYE = 1.7;
const WALK_SPEED = 4.4; // m/s
const RUN_MULT = 2.1;
const AIR_CONTROL = 0.22;
const JUMP_SPEED = 5.2;
const GROUND_ACCEL = 11; // 1/s velocity approach
const SLOPE_STAND = 0.6; // ground normal y below this and you slide
const MINE_RANGE = 4.2;
/** One full pick swing: wind-up, strike, recover. */
export const SWING_SECONDS = 0.72;
/** Fraction of the swing at which the head actually lands. */
export const SWING_IMPACT = 0.58;
/** Identifying one seam under the scanner: a short, attended dwell. */
export const SEAM_SCAN_SECONDS = 0.9;
/** Charging the field pulse that sweeps every site in range onto the compass. */
export const FIELD_SCAN_SECONDS = 1.4;
/** Swings a seam takes before it gives: modest ones crack fast. */
export function hitsNeeded(richness: number): number {
  return 2 + richness;
}
/** Swings by verb: a precision core is careful work; a prospect is a taste. */
export function verbHits(verb: MiningVerb, richness: number): number {
  switch (verb) {
    case 'core':
      return Math.round((2 + richness) * 1.8);
    case 'prospect':
      return 2;
    default:
      return hitsNeeded(richness);
  }
}
/**
 * Swings needed RIGHT NOW, weather included — hard tremors rattle a seam
 * loose and one swing comes free. Control and scene both read this, so the
 * crack on the crystal and the moment it gives can never disagree.
 */
export function verbHitsNow(verb: MiningVerb, richness: number): number {
  return Math.max(1, verbHits(verb, richness) - surfaceLive.weather.hitsBonus);
}
/** Samples a completed verb hands the suit. */
export function verbYield(verb: MiningVerb, richness: number): number {
  switch (verb) {
    case 'core':
      return Math.max(1, Math.ceil(richness / 2));
    case 'prospect':
      return 1;
    default:
      return richness;
  }
}
const BOARD_RANGE = 6.5;
/**
 * Where the runabout parks on ARRIVAL, metres from the touchdown point.
 *
 * From Phase 6 this is the first pad, not the only one: the live position
 * lives in `surfaceLive.shipAt`, which a set-down moves. Everything that
 * wants to know where the ship is must read that — this constant only says
 * where a landing begins.
 */
export const SHIP_PARK: { x: number; z: number } = { x: 11, z: -7 };
/**
 * Water deeper than this and the suit declines to continue. It is not a
 * wall any more: up to here you wade, slower with depth, and past it a firm
 * buoyant shove walks you back toward the shallows. A skimmer (Phase 3)
 * will renegotiate this figure. Lava never negotiates.
 */
export const WADE_MAX_M = 1.2;
const LAVA_WADE_M = 0.12;

// ————— The Survey Skimmer (Phase 3) —————

/** Velocity approach rate, 1/s — a sled leans into speed, it does not snap. */
const SKIM_ACCEL = 1.5;
/** Deck clearance above the surface line (ground, or water it can cross). */
const SKIM_HOVER_M = 1.15;
/** Eyes above the deck; standing tall on a running board. */
export const SKIM_EYE = 1.35;
/** Walk-up remount reach around a parked skimmer, metres. */
export const SKIM_MOUNT_RANGE = 6;
/** Deploy reach around the parked runabout, metres. */
export const SKIM_DEPLOY_RANGE = 10;
/** Vertical rates the cushion permits, m/s: it climbs hills, it is not a lift. */
const SKIM_CLIMB_MAX = 26;
const SKIM_FALL_MAX = 13;
/** Ground-normal Y below which the cushion sheds you down the fall line. */
const SKIM_SLOPE_STAND = 0.5;

// ————— Low flight (Phase 6) —————

/**
 * Height the cushion refuses to go below outside a committed set-down. There
 * is no damage model in this game and there is not about to be one: the ship
 * declines to arrive at the ground quickly, and says so.
 */
const FLY_FLOOR_M = 7;
/** Velocity approach rate, 1/s. An airframe leans into speed even more slowly. */
const FLY_ACCEL = 0.9;
/** Climb and sink rates on the vertical keys, m/s. */
const FLY_CLIMB_M_S = 34;
const FLY_SINK_M_S = 26;
/** Peak cosmetic bank, radians. Small on purpose — see flightBindings.ts. */
const FLY_BANK = 0.12;
/** Frame budget for the rolling re-bake while airborne, ms. */
const FLY_STREAM_MS_BUDGET = 5;
/** How long the descend key must be held over good ground before the flare. */
const SETDOWN_HOLD_SECONDS = 0.4;
/** Re-run the autoland's spiral at most this often, seconds. */
const SETDOWN_POLL_SECONDS = 0.15;
/** Where the walker steps out: metres behind the parked ship, and to one side. */
const AIRLOCK_OFFSET_M = 10;
const AIRLOCK_SIDE_M = 9.5;

export const surfaceLive = {
  phase: 'entry' as GroundfallPhase,
  /** Seconds inside the current phase. */
  t: 0,
  /** 0–1 plasma sheath intensity (entry + takeoff drive it; FX read it). */
  plasma: 0,
  /** 0–1 white-out used to hide the scene swap. */
  blackout: 0,
  /** Camera shake amplitude, metres. */
  shake: 0,
  /** Generation progress 0–1 while tiers bake behind the plasma. */
  genProgress: 0,
  ready: false,

  // — the walker —
  pos: new Vector3(0, 2, 0),
  vel: new Vector3(),
  yaw: 0,
  pitch: 0,
  grounded: false,
  /** Head-bob phase, advanced by ground travel. */
  bobPhase: 0,
  bob: 0,
  /** Altitude above terrain during scripted phases (HUD readout). */
  alt: DESCENT_START_ALT,

  // — work —
  samples: 0,
  /** Survey credit banked so far this stay (cores double, preserves count). */
  surveyCredit: 0,
  /** What the suit is carrying, by kind and extraction method. */
  haul: [] as SampleHaul[],
  /** Site id → what happened there this stay; banked on boarding. */
  outcomes: new Map<string, GroundSiteOutcome>(),
  /** Deposit currently in reach + view, or null. */
  target: null as DepositSpec | null,
  /** 0–1 toward the current seam giving way (hits landed / hits needed). */
  mineProgress: 0,
  /** Deposit ids spent this stay (worked or prospected). */
  mined: new Set<string>(),
  /** What the engage key would do right now, for the HUD. */
  prompt: null as { verb: 'mine' | 'board' | 'scan'; label: string; blocked?: string } | null,
  /** Sun elevation −1…1 (sin of altitude angle); negative is night. */
  sunUp: 0,

  // — the scanner —
  /** Site ids identified this stay: composition readable, verbs unlocked. */
  scanned: new Set<string>(),
  /** 0–1 progress of whichever scan is charging. */
  scanCharge: 0,
  /** A field pulse is charging (engage held with nothing in reach). */
  scanning: false,
  /** Bumped when a pulse resolves; FX and audio key off it. */
  scanNonce: 0,
  /** Metres the field pulse reaches — refit-gated, frozen at landing. */
  scanRange: 90,
  /** Selected mining verb (index into MINING_VERBS); the wheel cycles it. */
  verbIdx: 0,

  // — the pick —
  /** 0–1 phase of the current swing; 0 is the pick at rest. */
  swing: 0,
  /** Engage held with a seam in reach: the arm is working. */
  swinging: false,
  /** Bumped every time the head lands; FX and audio key off it. */
  hitNonce: 0,
  /** Where the last hit landed, for sparks. */
  hitAt: { x: 0, y: 0, z: 0 },
  /** Hits landed per seam this stay (visual cracking reads it too). */
  hits: new Map<string, number>(),
  /** Camera dip from the last impact, decays fast. */
  kick: 0,
  /** Bumped whenever a deposit finishes, for FX. */
  mineNonce: 0,
  /** Bumped at touchdown, for the dust kick. */
  touchdownNonce: 0,

  // — the sky (engine/weather.ts, evaluated fresh each frame) —
  /** The weather standing at this landing right now. */
  weather: syntheticWeather('clear') as LocalWeather,
  /** The next change worth planning around, refreshed on a slow cadence. */
  outlook: null as { kind: WeatherKind; inMs: number } | null,
  /** Tremor ground-shake envelope 0–1 (walk camera and audio ride it). */
  groundShake: 0,
  /** Lightning flash envelope 0–1 — sky, lamp and thunder all ride this. */
  skyFlash: 0,
  /** Effective field-pulse reach after the weather has its say, metres. */
  scanRangeNow: 90,
  /** This stay has seen the dust move: buried seams stand revealed. */
  buriedRevealed: false,
  /** Bumped when buried seams join the field; the scene reseats crystals. */
  revealNonce: 0,

  // — the water —
  /** 0–1 wade depth fraction (0 dry, 1 at the suit's limit). */
  wade: 0,
  /** The suit is actively declining to swim this frame. */
  wadeRefused: false,

  // — the skimmer —
  /** Skimmer refit rank, frozen at landing like the scan range. */
  skimRank: 0,
  /** Where the sled stands parked, or null (stowed aboard, or under you). */
  skimmerAt: null as { x: number; z: number; yaw: number } | null,
  /** Ground speed while skimming, m/s — the HUD's readout. */
  skimSpeed: 0,
  /** Rank ≥2 aboard: the mast holds the scanner and rail through weather. */
  stabilised: false,
  /** The second, dimmer prompt line: deploy/mount/dismount, or a refusal. */
  skimPrompt: null as string | null,
  /** Until this live.t, skimPrompt is a refusal note and must not be recomputed. */
  skimNoteUntil: 0,

  // — the biologger (Phase 4) —
  /** Species ids catalogued this stay; banked with the samples on boarding. */
  speciesSeen: new Set<string>(),
  /** Bumped when the catalogue grows; HUD and FX key off it. */
  speciesNonce: 0,

  // — the field kit (Phase 5) —
  /** Selected field verb (index into the certified list); the wheel cycles it. */
  fieldIdx: 0,
  /** Marks planted this stay, in local metres AND planet space. */
  marksPlaced: [] as { kind: GroundMark['kind']; dir: [number, number, number]; x: number; z: number }[],
  /** Bumped when a mark plants; the scene seats a new object on it. */
  markNonce: 0,
  /** A field-kit refusal holding the prompt line, and until when. */
  fieldNote: null as string | null,
  fieldNoteUntil: 0,
  /** Landmark KINDS stood at this stay (within reach, not merely sighted). */
  landmarksStood: new Set<string>(),
  /** Weather kinds stood in at moderate strength this stay. */
  weathered: new Set<string>(),
  /** The walker entered a settlement's heart this stay. */
  civicStood: false,
  /** A buried seam was worked this stay (a Geology first). */
  buriedWorked: false,

  // — the lead (Phase 5) —
  /** Which lead stage this world answers (0 = not the lead's world). */
  leadStage: 0 as 0 | 1 | 2,
  /** Where the resonator stands, in landing-local metres, or null. */
  leadAt: null as { x: number; z: number } | null,
  /** The resonance was read this stay. */
  leadDone: false,
  /** Bumped when the read completes; FX and audio key off it. */
  leadNonce: 0,

  // — the runabout in air (Phase 6) —
  /** Atmospheric Handling rank, frozen at landing like the others. */
  atmoRank: 0,
  /** Where the ship stands right now, in landing-local metres. It moves. */
  shipAt: { x: SHIP_PARK.x, z: SHIP_PARK.z, yaw: 0 },
  /** Cosmetic bank while airborne; the canopy and the hull both read it. */
  roll: 0,
  /** Ground speed in the air, m/s — the cockpit's readout. */
  airSpeed: 0,
  /** Ceiling in force right now, metres above the ground underneath. */
  ceilingM: 0,
  /** Seconds engage has been held; ORBIT_HOLD_SECONDS of it means orbit. */
  orbitHold: 0,
  /** 0–1 through the scripted lift or flare, or null in free flight. */
  flyScript: null as { kind: 'lift' | 'setdown'; k: number; fromY: number; fromX: number; fromZ: number; toX: number; toZ: number } | null,
  /** The chase camera, swapped with the helm's own view key. */
  chaseView: false,
  /** Ids the belly sweep has charted this stay — seams, landmarks, districts. */
  charted: new Set<string>(),
  /** Bumped when the sweep charts something; the scene pings the ground. */
  sweepNonce: 0,
  /** Sweep radius on the ground this frame, metres (0 when it cannot resolve). */
  sweepM: 0,
  /** Furthest this stay has been from the pad it first touched down on, metres. */
  rangeM: 0,
  /** The ship left the ground under its own power this stay. */
  flew: false,
  /** Secondary landings made this stay — a second place, on the same visit. */
  setdowns: 0,
  /** What the gear would do if you kept holding descend, and where. */
  setdown: null as { x: number; z: number; ok: boolean; divertM: number; refused: SetdownRefusal | null } | null,
  /** The cockpit's second line: the set-down, the ceiling, or a refusal. */
  flyPrompt: null as string | null,

  // — the rolling ground —
  /** Bumped when a tier re-centre commits; the scene re-seats and re-uploads. */
  terrainEpoch: 0,
  /** Which tier the latest epoch moved. */
  terrainEpochTier: 'near' as 'near' | 'far',
};

export const surfaceInput = {
  fwd: 0,
  strafe: 0,
  run: false,
  jump: false, // edge, consumed
  engage: false,
  /** Tap of the helm's descend key: deploy, mount or dismount. Edge, consumed. */
  deploy: false,
  /** Held state of the same two keys — in the air they are climb and sink. */
  rise: false,
  descend: false,
  /** Tap of the helm's view key: canopy or chase. Edge, consumed. */
  view: false,
};

let session: GroundfallSession | null = null;
let params: SurfaceParams | null = null;
let tiers: SurfaceTiers | null = null;
/** The workable field: lattice sites minus what this world remembers as spent. */
let deposits: DepositSpec[] = [];
/** Every lattice site in the region, spent, buried or not — the full census. */
let allSites: DepositSpec[] = [];
/** The coarse lattice's memorable places for this region. */
let landmarks: LandmarkSpec[] = [];
/** Settlements of a delivered world within sight of this landing. */
let settlements: DistrictSpec[] = [];
/** The biology lattice's set-pieces for this region. */
let vignettes: VignetteSpec[] = [];
/** Marks earlier stays left within this region, projected onto the landing. */
let regionMarks: RegionMark[] = [];
/** Species levels present at these gauges — ambient everywhere, civic in town. */
let ambientSpecies: GroundSpeciesDef[] = [];
let civicSpecies: GroundSpeciesDef[] = [];
/** What the world's record had already catalogued when we landed. */
let priorSpecies: Set<string> = new Set();
/** What the save already knew about these sites when we landed. */
let priorStates: Map<string, GroundSiteOutcome> = new Map();
/** DEV harness only: pin the sky to a kind for visual verification. */
let weatherOverride: WeatherKind | null = null;
/** Bake resolution. Tests shrink it; the game never touches it. */
let tierSpecs: { near: { texels: number; extent: number }; far: { texels: number; extent: number } } = {
  near: TIER_NEAR,
  far: TIER_FAR,
};

/** Test-only: a 64-texel world bakes in milliseconds instead of seconds. */
export function configureTierSpecsForTests(
  near: { texels: number; extent: number },
  far: { texels: number; extent: number },
): void {
  tierSpecs = { near, far };
}
/** Rows baked so far, per tier — generation is chunked across frames. */
let bakeCursor = { near: 0, far: 0, normals: false };
/** The hero commission this stay belongs to; if it changes, the ground goes. */
let heroLifetimeIndex = -1;
/** Rolling re-bake streams, lazily bound to the live tiers (walk + skim). */
let nearStream: TierStream | null = null;
let farStream: TierStream | null = null;

/** A standing mark with a place on this landing's ground. */
export interface RegionMark {
  kind: GroundMark['kind'];
  x: number;
  y: number;
  z: number;
  /** True for marks planted this stay — the scene fades them in. */
  fresh: boolean;
}

export function groundfallSession(): GroundfallSession | null {
  return session;
}

/**
 * Every mark standing in this region — earlier stays' and this one's — with
 * live ground heights. The scene, the compass and the HUD all read this.
 */
export function surfaceMarks(): readonly RegionMark[] {
  return regionMarks;
}

/** Where the resonator stands, if this landing is the lead's question. */
export function surfaceLead(): { x: number; z: number; stage: 1 | 2 } | null {
  if (!surfaceLive.leadAt || surfaceLive.leadStage === 0) return null;
  return { ...surfaceLive.leadAt, stage: surfaceLive.leadStage };
}

/**
 * The field verbs this walker is certified for, `pulse` always first. Repair
 * joins only within reach of a settlement — the verb exists where the town
 * does. Frozen certs (the session's) — a rank cannot advance mid-stay.
 */
export function fieldVerbs(): FieldVerb[] {
  const s = session;
  const out: FieldVerb[] = ['pulse'];
  if (!s) return out;
  const certs = s.certs;
  if ((certs['mobility'] ?? 0) >= 1) out.push('beacon');
  if ((certs['survey'] ?? 0) >= 1) out.push('station');
  if ((certs['mobility'] ?? 0) >= 2) out.push('shelter');
  if ((certs['liaison'] ?? 0) >= 1 && nearSettlementD() < REPAIR_OFFER_M) out.push('repair');
  return out;
}

/** Distance to the nearest settlement heart, or Infinity in the wilds. */
function nearSettlementD(): number {
  let best = Infinity;
  for (const sd of settlements) {
    const dd = Math.hypot(sd.x - surfaceLive.pos.x, sd.z - surfaceLive.pos.z);
    if (dd < best) best = dd;
  }
  return best;
}
/** A repair is offered a little inside its validity, so the refusal is rare. */
const REPAIR_OFFER_M = 150;
/** 0–1 progress of the entry dive (flightControl scripts the camera off it). */
export function entryProgress(): number {
  return Math.min(1, surfaceLive.t / ENTRY_SECONDS);
}
export function surfaceParams(): SurfaceParams | null {
  return params;
}
export function surfaceTiers(): SurfaceTiers | null {
  return tiers;
}
export function surfaceDeposits(): readonly DepositSpec[] {
  return deposits;
}
/**
 * Every seam a stay could conceivably work — the open field plus any buried
 * seams still under the sand. The scene sizes its crystal seats from this,
 * so a dust front can raise seams without anyone reallocating anything.
 */
export function surfaceSeamCensus(): DepositSpec[] {
  const record = priorStates;
  return allSites.filter((d) => {
    const prior = record.get(d.id);
    return prior === undefined || prior === 'preserved' || prior === 'visited';
  });
}
export function surfaceLandmarkList(): readonly LandmarkSpec[] {
  return landmarks;
}
/** The delivered world's settlements in this landing's sight, projected. */
export function surfaceSettlementList(): readonly DistrictSpec[] {
  return settlements;
}
/** The region's living set-pieces — the biologger's marks. */
export function surfaceVignetteList(): readonly VignetteSpec[] {
  return vignettes;
}
/** Ambient species alive at these gauges (the background biology). */
export function surfaceAmbientSpecies(): readonly GroundSpeciesDef[] {
  return ambientSpecies;
}
/**
 * Sites standing as prospect markers: what earlier landings staked out, plus
 * whatever this stay has staked so far. The scene plants a marker on each —
 * the first persistent, visible change a player leaves on a world.
 */
export function surfaceProspects(): DepositSpec[] {
  return allSites.filter((d) => {
    const now = surfaceLive.outcomes.get(d.id) ?? priorStates.get(d.id);
    return now === 'prospected';
  });
}

// ————— Entry / exit —————

/**
 * Leave the helm for the ground. Called by flightControl when the pilot
 * commits to an approach; the session captures everything the surface needs
 * so it never has to ask the flight scene a question again.
 */
export function beginGroundfall(s: GroundfallSession): void {
  const st = useGame.getState().s;
  heroLifetimeIndex = st.planet.lifetimeIndex;

  // The autoland has opinions, in order of strength. An approach at a
  // delivered world aimed inside a settlement's snap cone lands on that
  // settlement's doorstep — the pad the offer advertised. The engine's
  // candidates are macro-dry; the local octaves are seeded PER FRAME and
  // can still sink a district bowl, so each candidate's own countryside is
  // auditioned (analytically — no tiers exist yet) and the first frame
  // that keeps the plaza out of the sea wins. Fixed order, first accept:
  // a settlement has exactly one doorstep, forever.
  // Everything else keeps the shoreline divert: if the sub-ship point is
  // wet, spiral to the nearest dry shelf, and the session records where it
  // ACTUALLY landed so the return-to-orbit sits over the right spot.
  const fjords = s.quirks.includes('award-winning-fjords') ? 1 : 0;
  const approach = s.completed
    ? settlementApproach(settlementSpecOf(s), s.dir, PLANET_RADIUS_M[s.size])
    : null;
  if (approach) {
    const pads = settlementPadCandidates(
      settlementSpecOf(s),
      approach.spot,
      PLANET_RADIUS_M[s.size],
    );
    let chosen = pads[pads.length - 1]!;
    for (const pad of pads) {
      const audition = buildSurfaceParams({
        seed: s.seed,
        type: s.type,
        size: s.size,
        dir: pad,
        aspects: s.aspects,
        fjords,
      });
      DRY_DIR.set(approach.spot.dir[0], approach.spot.dir[1], approach.spot.dir[2]);
      dirToLocal(audition, DRY_DIR, PAD_LOCAL);
      if (!Number.isFinite(PAD_LOCAL.x)) continue;
      const ground =
        analyticHeight(audition, PAD_LOCAL.x, PAD_LOCAL.z)
        - curvatureDrop(audition, PAD_LOCAL.x, PAD_LOCAL.z);
      // Deckable counts: a plaza a stilt-deck can carry is a harbour town.
      if (ground > audition.seaLevelM - 1.2) {
        chosen = pad;
        break;
      }
    }
    session = s = { ...s, dir: chosen };
  } else {
    const dry = findDrySite(
      { seed: s.seed, type: s.type, size: s.size, dir: s.dir, aspects: s.aspects, fjords },
      DRY_DIR,
    );
    session = s = { ...s, dir: [dry.x, dry.y, dry.z] };
  }

  params = buildSurfaceParams({
    seed: s.seed,
    type: s.type,
    size: s.size,
    dir: s.dir,
    aspects: s.aspects,
    fjords,
  });
  tiers = { near: makeTier(tierSpecs.near), far: makeTier(tierSpecs.far) };
  bakeCursor = { near: 0, far: 0, normals: false };
  deposits = [];
  allSites = [];
  landmarks = [];
  settlements = [];
  vignettes = [];
  ambientSpecies = [];
  civicSpecies = [];
  priorStates = new Map();
  // The biologger arrives knowing what the world's record already holds, so
  // a species catalogued years ago is a neighbour, not a headline.
  priorSpecies = new Set(
    Object.keys(st.expedition.groundWorlds[s.worldKey]?.species ?? {}),
  );

  const live = surfaceLive;
  live.phase = 'entry';
  live.t = 0;
  live.plasma = 0;
  live.blackout = 0;
  live.shake = 0;
  live.genProgress = 0;
  live.ready = false;
  live.samples = 0;
  live.surveyCredit = 0;
  live.haul = [];
  live.outcomes.clear();
  live.mined.clear();
  live.hits.clear();
  live.scanned.clear();
  live.scanCharge = 0;
  live.scanning = false;
  live.scanRange = surfaceScanRange(st.expedition);
  live.verbIdx = 0;
  live.target = null;
  live.mineProgress = 0;
  live.swing = 0;
  live.swinging = false;
  live.kick = 0;
  live.prompt = null;
  live.alt = DESCENT_START_ALT;
  live.sunUp = s.sunLocal[1];
  live.weather = syntheticWeather('clear');
  live.outlook = null;
  live.groundShake = 0;
  live.skyFlash = 0;
  live.scanRangeNow = live.scanRange;
  live.buriedRevealed = false;
  live.revealNonce = 0;
  live.wade = 0;
  live.wadeRefused = false;
  live.speciesSeen.clear();
  live.speciesNonce = 0;
  live.fieldIdx = 0;
  live.marksPlaced = [];
  live.markNonce = 0;
  live.fieldNote = null;
  live.fieldNoteUntil = 0;
  live.landmarksStood.clear();
  live.weathered.clear();
  live.civicStood = false;
  live.buriedWorked = false;
  live.leadStage = (leadTargetAt(st, s.lifetimeIndex) ?? 0) as 0 | 1 | 2;
  live.leadAt = null;
  live.leadDone = false;
  live.leadNonce = 0;
  regionMarks = [];
  live.skimRank = skimmerRank(st.expedition);
  live.skimmerAt = null;
  live.skimSpeed = 0;
  live.stabilised = false;
  live.skimPrompt = null;
  live.skimNoteUntil = 0;
  live.atmoRank = atmoRank(st.expedition);
  live.shipAt = { x: SHIP_PARK.x, z: SHIP_PARK.z, yaw: 0 };
  live.roll = 0;
  live.airSpeed = 0;
  live.ceilingM = atmoEnvelope(live.atmoRank).ceiling;
  live.orbitHold = 0;
  live.flyScript = null;
  live.chaseView = false;
  live.charted.clear();
  live.sweepNonce = 0;
  live.sweepM = 0;
  live.rangeM = 0;
  live.flew = false;
  live.setdowns = 0;
  live.setdown = null;
  live.flyPrompt = null;
  flyPrevYaw = 0;
  flyResponse = handlingFor(st.expedition).responseMult;
  setdownHold = 0;
  setdownPollAt = -1;
  takeoffBaseAlt = 12;
  live.terrainEpoch = 0;
  nearStream = null;
  farStream = null;
  outlookAt = -100;
  surfaceInput.fwd = 0;
  surfaceInput.strafe = 0;
  surfaceInput.run = false;
  surfaceInput.jump = false;
  surfaceInput.engage = false;
  surfaceInput.deploy = false;
  surfaceInput.rise = false;
  surfaceInput.descend = false;
  surfaceInput.view = false;

  useUiBus.getState().setGroundfall(s);
  audio.entryRoarStart();
}

/** The walker boarded (or the world was delivered out from under them). */
export function beginTakeoff(): void {
  const live = surfaceLive;
  if (live.phase !== 'walk' && live.phase !== 'skim' && live.phase !== 'fly') return;
  bankSamples();
  // The skimmer stows itself, wherever it stood. It has strong feelings
  // about being left behind and expresses them by not allowing it.
  live.skimmerAt = null;
  // Leaving from the air keeps the altitude it already had; the climb-out
  // starts where the ship is, not where the pad was.
  takeoffBaseAlt = live.phase === 'fly' ? Math.max(12, live.alt) : 12;
  if (live.phase === 'fly') audio.flightHumStop();
  live.flyScript = null;
  live.orbitHold = 0;
  live.phase = 'takeoff';
  live.t = 0;
  releasePointer();
  audio.entryRoarStart();
}

/** Altitude the departure climbs from — the pad, or wherever it was hovering. */
let takeoffBaseAlt = 12;

/**
 * Take her up, but not away: the package's whole point. The lift is two
 * seconds and a hover, not a cinematic — a stay does not end because the
 * wheels left the ground, so nothing banks here. The ledger still closes
 * exactly once, when the ship leaves for orbit.
 */
export function beginLift(): void {
  const live = surfaceLive;
  if (live.phase !== 'walk' && live.phase !== 'skim') return;
  if (live.atmoRank < 1 || !params || !tiers) return;
  const ground = heightAt(params, tiers, live.shipAt.x, live.shipAt.z);
  live.phase = 'fly';
  live.t = 0;
  live.skimmerAt = null; // the sled rides in the ship, as it always has
  live.flyScript = {
    kind: 'lift',
    k: 0,
    fromY: ground + 2,
    fromX: live.shipAt.x,
    fromZ: live.shipAt.z,
    toX: live.shipAt.x,
    toZ: live.shipAt.z,
  };
  live.pos.set(live.shipAt.x, ground + 2, live.shipAt.z);
  live.vel.set(0, 0, 0);
  chaseAt.copy(live.pos); // or the chase camera flies in from the origin
  chaseAtT = 0;
  live.yaw = live.shipAt.yaw;
  live.pitch = 0;
  live.roll = 0;
  live.grounded = false;
  live.target = null;
  live.mineProgress = 0;
  live.swinging = false;
  live.scanning = false;
  live.scanCharge = 0;
  live.orbitHold = 0;
  live.setdown = null;
  live.ceilingM = atmoEnvelope(live.atmoRank).ceiling;
  live.prompt = null;
  live.skimPrompt = null;
  audio.flightHumStart();
}

/**
 * Deliver what the suit is carrying — and what it decided — to the ship's
 * ledger. Every boarding banks, even an empty-handed one: the visit itself,
 * and any seams preserved on the walk, are part of the world's record.
 */
function bankSamples(): void {
  const s = session;
  if (!s) return;
  const sites: Record<string, GroundSiteOutcome> = {};
  for (const [id, outcome] of surfaceLive.outcomes) sites[id] = outcome;
  const evidence: GroundEvidence = {
    landmarks: [...surfaceLive.landmarksStood],
    civic: surfaceLive.civicStood,
    weathered: [...surfaceLive.weathered],
    marks: surfaceLive.marksPlaced.map((m) => ({ kind: m.kind, dir: m.dir })),
    buriedWorked: surfaceLive.buriedWorked,
    lead: surfaceLive.leadDone,
    flew: surfaceLive.flew,
    setdowns: surfaceLive.setdowns,
    charted: surfaceLive.charted.size,
    rangeM: Math.round(surfaceLive.rangeM),
  };
  actions.bankGroundSamples(
    s.worldKey,
    s.name,
    [...surfaceLive.haul],
    sites,
    [...surfaceLive.speciesSeen],
    evidence,
  );
  surfaceLive.samples = 0;
  surfaceLive.surveyCredit = 0;
  surfaceLive.haul = [];
  surfaceLive.outcomes.clear();
  surfaceLive.speciesSeen.clear();
  surfaceLive.marksPlaced = [];
  surfaceLive.landmarksStood.clear();
  surfaceLive.weathered.clear();
  surfaceLive.civicStood = false;
  surfaceLive.buriedWorked = false;
  surfaceLive.leadDone = false;
  surfaceLive.flew = false;
  surfaceLive.setdowns = 0;
  surfaceLive.charted.clear();
  surfaceLive.rangeM = 0;
}

/** Hard exit — takeoff finished, or the session must end now. */
export function endGroundfall(): { pos: Vector3; yaw: number; pitch: number } | null {
  const s = session;
  session = null;
  params = null;
  tiers = null;
  deposits = [];
  allSites = [];
  landmarks = [];
  settlements = [];
  vignettes = [];
  regionMarks = [];
  ambientSpecies = [];
  civicSpecies = [];
  priorSpecies = new Set();
  priorStates = new Map();
  weatherOverride = null;
  nearStream = null;
  farStream = null;
  releasePointer();
  audio.entryRoarStop();
  audio.flightHumStop();
  audio.surfaceWindStop();
  audio.weatherPrecipStop();
  audio.tremorRumbleStop();
  useUiBus.getState().setGroundfall(null);
  if (!s) return null;
  return {
    pos: new Vector3(s.returnPos[0], s.returnPos[1], s.returnPos[2]),
    yaw: s.returnYaw,
    pitch: s.returnPitch,
  };
}

// ————— World generation (chunked behind the plasma) —————

const BAKE_MS_BUDGET = 7;

/** Advance the bake by one frame's budget; returns overall 0–1 progress. */
function stepGeneration(): number {
  if (!params || !tiers) return 0;
  const t0 = performance.now();
  const totalRows = tiers.near.texels + tiers.far.texels;
  while (performance.now() - t0 < BAKE_MS_BUDGET) {
    if (bakeCursor.far < tiers.far.texels) {
      bakeTierRows(params, tiers.far, bakeCursor.far, 16);
      bakeCursor.far += 16;
    } else if (bakeCursor.near < tiers.near.texels) {
      bakeTierRows(params, tiers.near, bakeCursor.near, 16);
      bakeCursor.near += 16;
    } else if (!bakeCursor.normals) {
      // Smooth, then normals, then placement — one gulp behind full plasma.
      smoothTier(tiers.far);
      smoothTier(tiers.near);
      buildNormalMap(tiers.far);
      buildNormalMap(tiers.near);
      // The lattice says where the seams grew; the save says which of them
      // this world still has. Worked and prospected seams are spent — the
      // ground remembers, which is the entire point of the record. Buried
      // seams ride in the census from the start; joining the workable field
      // is the dust front's job (rebuildWorkableField). The census reaches
      // skimmer range for everyone: the ground was always there.
      allSites = depositSites(params, tiers, session?.quirks ?? [], SITE_FIELD_RADIUS_SKIM, { buried: true });
      priorStates = new Map();
      const record = session
        ? useGame.getState().s.expedition.groundWorlds[session.worldKey]
        : undefined;
      if (record) {
        for (const [id, st] of Object.entries(record.sites)) priorStates.set(id, st.s);
      }
      deposits = allSites.filter(
        (d) => siteMinable(record?.sites[d.id]) && (!d.buried || surfaceLive.buriedRevealed),
      );
      // The coarse lattice: the region's memorable places.
      landmarks = landmarkSites(params, tiers, session?.quirks ?? []);
      // A delivered world's settlements, projected from the roster the
      // orbit lights read — the lights you saw are the places you get.
      settlements = session ? settlementDistricts(params, tiers, session) : [];
      // The living catalogue: what these gauges support, and where the
      // set-pieces stand. A young commission is quiet; Bio fills the air.
      const bio = session?.aspects.bio ?? 0;
      vignettes = session ? vignetteSites(params, tiers, bio) : [];
      ambientSpecies = session ? speciesPresent(session.type, bio, 'ambient') : [];
      civicSpecies = session ? speciesPresent(session.type, bio, 'civic') : [];
      // Marks earlier stays left: planet directions, projected onto THIS
      // landing. A mark beyond the region stays where it is, which is the
      // entire point of a mark.
      regionMarks = [];
      const ground = session
        ? useGame.getState().s.expedition.groundWorlds[session.worldKey]
        : undefined;
      if (ground) {
        for (const m of ground.marks) {
          DRY_DIR.set(m.dir[0], m.dir[1], m.dir[2]);
          dirToLocal(params, DRY_DIR, PAD_LOCAL);
          if (!Number.isFinite(PAD_LOCAL.x)) continue;
          if (Math.hypot(PAD_LOCAL.x, PAD_LOCAL.z) > MARK_REGION_M) continue;
          regionMarks.push({
            kind: m.kind,
            x: PAD_LOCAL.x,
            y: heightAt(params, tiers, PAD_LOCAL.x, PAD_LOCAL.z),
            z: PAD_LOCAL.z,
            fresh: false,
          });
        }
        // Survey II — kept charts: landing near a standing station arrives
        // with its neighbourhood already on the rail.
        if ((session?.certs['survey'] ?? 0) >= 2) {
          for (const rm of regionMarks) {
            if (rm.kind !== 'station') continue;
            for (const d of allSites) {
              if (d.buried) continue;
              if (Math.hypot(d.x - rm.x, d.z - rm.z) <= STATION_CHART_M) {
                surfaceLive.scanned.add(d.id);
              }
            }
          }
        }
      }
      // The resonator, where this landing is the lead's open question.
      if (surfaceLive.leadStage > 0) placeResonator();
      bakeCursor.normals = true;
      surfaceLive.ready = true;
    } else {
      break;
    }
  }
  const done = Math.min(bakeCursor.far, tiers.far.texels) + Math.min(bakeCursor.near, tiers.near.texels);
  return bakeCursor.normals ? 1 : (done / totalRows) * 0.97;
}

/**
 * Stand the resonator a short, honest walk from the pad: a ring search over
 * hashed bearings takes the first analytically dry footing, because the
 * signal is in the ground and the ground, on a planet, is famously
 * everywhere — but a resonator underwater answers nobody.
 */
function placeResonator(): void {
  const p = params;
  const s = session;
  if (!p || !s) return;
  const r = mulberry((s.seed ^ Math.imul(s.lifetimeIndex + 1, 0x51ea)) >>> 0);
  const a0 = r() * Math.PI * 2;
  for (const reach of [280, 340, 420, 520]) {
    for (let i = 0; i < 12; i++) {
      const a = a0 + (i / 12) * Math.PI * 2;
      const x = Math.cos(a) * reach;
      const z = Math.sin(a) * reach;
      const ground = analyticHeight(p, x, z) - curvatureDrop(p, x, z);
      if (ground > p.seaLevelM + 0.6) {
        surfaceLive.leadAt = { x, z };
        return;
      }
    }
  }
  surfaceLive.leadAt = { x: 300, z: 0 }; // the sea won everywhere; stand anyway
}

// ————— Input —————

let detachInput: (() => void) | null = null;
let pointerLocked = false;

function releasePointer(): void {
  if (typeof document !== 'undefined' && document.pointerLockElement) {
    document.exitPointerLock();
  }
}

/** Walk shares the helm's physical bindings: thrust is forward, and so on. */
/** Phases where the pointer steers something: boots, sled or ship. */
function underControl(): boolean {
  const ph = surfaceLive.phase;
  return ph === 'walk' || ph === 'skim' || ph === 'fly';
}

function bindingsHeld(keys: Set<string>) {
  const b = flightPrefs().bindings;
  const held = (action: keyof typeof b) => b[action].some((code) => keys.has(code));
  return {
    fwd: (held('thrust') ? 1 : 0) - (held('brake') ? 1 : 0),
    strafe: (held('strafeRight') ? 1 : 0) - (held('strafeLeft') ? 1 : 0),
    run: held('boost'),
    jump: held('up'),
    engage: held('engage'),
    // The helm's descend key has nothing to descend on foot; down here it
    // means the skimmer — deploy, mount, dismount. Back in the ship's seat
    // (Phase 6) both vertical keys mean what they always meant at the helm,
    // so the same two are read as edges AND as held.
    deploy: held('down'),
    view: held('cameraView'),
  };
}

export function attachSurfaceInput(canvas: HTMLElement): () => void {
  const keys = new Set<string>();
  let jumpHeld = false;
  let deployHeld = false;
  let viewHeld = false;

  const apply = () => {
    const h = bindingsHeld(keys);
    surfaceInput.fwd = h.fwd;
    surfaceInput.strafe = h.strafe;
    surfaceInput.run = h.run;
    surfaceInput.engage = h.engage;
    if (h.jump && !jumpHeld) surfaceInput.jump = true;
    jumpHeld = h.jump;
    surfaceInput.rise = h.jump;
    if (h.deploy && !deployHeld) surfaceInput.deploy = true;
    deployHeld = h.deploy;
    surfaceInput.descend = h.deploy;
    if (h.view && !viewHeld) surfaceInput.view = true;
    viewHeld = h.view;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
    apply();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    apply();
  };
  const onBlur = () => {
    keys.clear();
    apply();
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!pointerLocked || !underControl()) return;
    const sens = 0.0021 * flightPrefs().sensitivity;
    surfaceLive.yaw -= e.movementX * sens;
    const invert = flightPrefs().invertPitch ? 1 : -1;
    surfaceLive.pitch = Math.max(
      -1.45,
      Math.min(1.45, surfaceLive.pitch + e.movementY * sens * invert),
    );
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!underControl()) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest?.('.sh-hud, .modal, .modal-veil, .toast-stack')) return;
    if (!pointerLocked) canvas.requestPointerLock?.();
  };
  const onLockChange = () => {
    pointerLocked = document.pointerLockElement != null;
  };
  // The wheel chooses what the pick will mean at a scanned seam — and, with
  // nothing in reach, what the field kit will do (Phase 5): the pulse, or
  // whichever marks certification has opened. Anywhere else the wheel keeps
  // whatever job the browser gave it.
  const onWheel = (e: WheelEvent) => {
    if (!pointerLocked || surfaceLive.phase !== 'walk') return;
    const t = surfaceLive.target;
    if (t && surfaceLive.scanned.has(t.id)) {
      const n = MINING_VERBS.length;
      surfaceLive.verbIdx =
        (surfaceLive.verbIdx + (e.deltaY > 0 ? 1 : -1) + n) % n;
      e.preventDefault();
      return;
    }
    if (!t) {
      const kit = fieldVerbs();
      if (kit.length > 1) {
        surfaceLive.fieldIdx =
          (surfaceLive.fieldIdx + (e.deltaY > 0 ? 1 : -1) + kit.length) % kit.length;
        surfaceLive.scanCharge = 0; // a change of mind restarts the dwell
        e.preventDefault();
      }
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('pointerlockchange', onLockChange);
  const detach = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('wheel', onWheel);
    document.removeEventListener('pointerlockchange', onLockChange);
    releasePointer();
  };
  detachInput = detach;
  return detach;
}

// ————— The step —————

const EUL = new Euler(0, 0, 0, 'YXZ');
const Q = new Quaternion();
const FWD = new Vector3();
const RIGHT = new Vector3();
const WISH = new Vector3();
const NORMAL = new Vector3();
const TO_TARGET = new Vector3();
const DRY_DIR = new Vector3();
const PAD_LOCAL = { x: 0, z: 0 };

function smooth01(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}

export interface SurfaceStepResult {
  /** Set when takeoff completes: restore this flight pose and stand down. */
  done: { pos: Vector3; yaw: number; pitch: number } | null;
}

/** Recompute the workable field from the census and the stay's own ledger. */
function rebuildWorkableField(): void {
  deposits = allSites.filter(
    (d) =>
      siteMinable(
        priorStates.has(d.id) ? { s: priorStates.get(d.id)!, atMs: 0 } : undefined,
      ) && (!d.buried || surfaceLive.buriedRevealed),
  );
}

/** Seconds between outlook refreshes — a forecast is not a per-frame need. */
const OUTLOOK_EVERY_S = 5;
let outlookAt = -100;

// ————— The biologger (Phase 4) —————

/** Standing this close to a lit district catalogues its civic species. */
const CIVIC_CATALOG_M = 90;
/** Seconds between proximity sweeps — biology is patient. */
const ECOLOGY_EVERY_S = 0.5;
let ecologyAt = -100;

/**
 * Enter species into the stay's catalogue. New-to-this-world entries get a
 * word and a voice; everything else is quietly noted for the record.
 */
function catalogueSpecies(ids: readonly string[]): void {
  const live = surfaceLive;
  const fresh: string[] = [];
  for (const id of ids) {
    if (live.speciesSeen.has(id)) continue;
    live.speciesSeen.add(id);
    if (!priorSpecies.has(id)) fresh.push(id);
  }
  if (fresh.length === 0) return;
  live.speciesNonce++;
  const first = SPECIES_BY_ID[fresh[0]!];
  if (first) audio.wildlifeCall(first.register);
  useUiBus.getState().addToast({
    kind: 'info',
    kicker: 'FIELD BIOLOGY',
    title:
      fresh.length === 1
        ? `${first?.name ?? fresh[0]} · first record on this world`
        : `${fresh.length} species · first records on this world`,
    body:
      fresh.length === 1
        ? first?.blurb ?? ''
        : fresh.map((id) => SPECIES_BY_ID[id]?.name ?? id).join(' · '),
    // The biologger's plate for the record (ASSET_UPLIFT.md 6.4).
    art: EXPEDITION_ART.species(fresh[0]!),
    ttlMs: 5600,
  });
}

/**
 * The walk-up half of field biology: a vignette you can plainly see, and a
 * lit settlement you are standing in, catalogue themselves. Throttled — the
 * biologger checks its instruments twice a second, which is already keen.
 */
function stepEcology(): void {
  const live = surfaceLive;
  if (live.t - ecologyAt < ECOLOGY_EVERY_S) return;
  ecologyAt = live.t;
  for (const vg of vignettes) {
    if (live.speciesSeen.has(vg.kind)) continue;
    const dd = Math.hypot(vg.x - live.pos.x, vg.z - live.pos.z);
    if (dd <= VIGNETTE_CATALOG_M) catalogueSpecies([vg.kind]);
  }
  for (const sd of settlements) {
    const dd = Math.hypot(sd.x - live.pos.x, sd.z - live.pos.z);
    if (dd > CIVIC_CATALOG_M) continue;
    // Walking into town is a civic fact whether or not the lights are on —
    // a dark district notices visitors MORE (Phase 5). The civic species
    // still need the lights; nothing nocturnal lives on a porch.
    live.civicStood = true;
    if (sd.lit && civicSpecies.length > 0) {
      catalogueSpecies(civicSpecies.map((s) => s.id));
    }
    break;
  }
  // Reached is reached: standing at a named place is Mobility's business.
  for (const l of landmarks) {
    if (live.landmarksStood.has(l.kind)) continue;
    const dd = Math.hypot(l.x - live.pos.x, l.z - live.pos.z);
    if (dd <= LANDMARK_REACH_M) live.landmarksStood.add(l.kind);
  }
}

/** The pulse's biologger sweep: ambient life answers everywhere it exists;
 * vignettes answer from inside the pulse radius, like every other site. */
function pulseEcology(rangeM: number): void {
  const live = surfaceLive;
  const ids: string[] = ambientSpecies.map((s) => s.id);
  const r2 = rangeM * rangeM;
  for (const vg of vignettes) {
    const dx = vg.x - live.pos.x;
    const dz = vg.z - live.pos.z;
    if (dx * dx + dz * dz <= r2) ids.push(vg.kind);
  }
  catalogueSpecies(ids);
}

/** Evaluate the sky for this frame: snapshot, latch, shake, forecast. */
function stepWeather(gameTimeMs: number): void {
  const live = surfaceLive;
  const s = session!;
  const wSpec = { seed: s.seed, type: s.type, aspects: s.aspects, dir: s.dir };
  live.weather = weatherOverride
    ? syntheticWeather(weatherOverride)
    : weatherAt(wSpec, gameTimeMs);
  // Aboard a rank-2 skimmer the mast holds the instrument steady: weather
  // may still FEED the pulse (storms), it may no longer choke it. The rail
  // survives whiteouts the same way — see the HUD's compass.
  live.stabilised = live.phase === 'skim' && live.skimRank >= SKIM_STABILISED_RANK;
  live.scanRangeNow =
    live.scanRange *
    (live.stabilised ? Math.max(1, live.weather.scanRangeMult) : live.weather.scanRangeMult);
  live.groundShake =
    live.weather.kind === 'tremor'
      ? tremorPulse(s.seed, gameTimeMs, live.weather.intensity)
      : 0;
  live.skyFlash =
    live.weather.kind === 'storm'
      ? stormFlash(s.seed, gameTimeMs, live.weather.intensity)
      : 0;
  if (live.t - outlookAt > OUTLOOK_EVERY_S) {
    outlookAt = live.t;
    live.outlook = weatherOverride ? null : weatherOutlook(wSpec, gameTimeMs);
  }

  // Standing in it at strength is testimony (Phase 5) — the storm watch and
  // the Mobility track both read what a stay actually weathered. Only while
  // the boots (or the sled) are on the ground; the descent does not count.
  if (
    (live.phase === 'walk' || live.phase === 'skim')
    && live.weather.kind !== 'clear'
    && live.weather.intensity >= 0.5
  ) {
    live.weathered.add(live.weather.kind);
  }

  // The dust moved: buried seams stand for the rest of the stay. Sand is in
  // no hurry to come back, and un-revealing mid-swing would be a cruelty.
  if (live.weather.buriedRevealed && !live.buriedRevealed && live.ready) {
    live.buriedRevealed = true;
    rebuildWorkableField();
    live.revealNonce++;
    if (allSites.some((d) => d.buried)) {
      useUiBus.getState().addToast({
        kind: 'info',
        kicker: 'FIELD REPORT',
        title: 'The dust has moved',
        body: 'The front has uncovered ground the sand was sitting on. The scanner suggests a look before the weather changes its mind.',
        ttlMs: 6200,
      });
    }
  }
}

/** One frame. Returns the flight pose when the stay is over. */
export function stepSurface(dt: number, t: number): SurfaceStepResult {
  const live = surfaceLive;
  const s = session;
  if (!s || !params || !tiers) return { done: null };

  live.t += dt;
  const st = useGame.getState().s;
  stepWeather(st.gameTimeMs);
  // The hero world completing while you stand on it: the world you were
  // standing on has been delivered. The runabout very sensibly leaves.
  if (
    s.hero &&
    st.planet.lifetimeIndex !== heroLifetimeIndex &&
    (live.phase === 'walk' || live.phase === 'skim' || live.phase === 'fly')
  ) {
    useUiBus.getState().addToast({
      kind: 'info',
      kicker: 'GROUNDFALL',
      title: 'The ground was delivered',
      body: 'The world you were standing on is now a finished product. The runabout excuses itself.',
      ttlMs: 5200,
    });
    beginTakeoff();
  }

  switch (live.phase) {
    case 'entry': {
      live.genProgress = stepGeneration();
      const k = live.t / ENTRY_SECONDS;
      live.plasma = smooth01(k * 1.35);
      live.shake = live.plasma * 0.55;
      // Hold at the white-hot moment until the world exists; a slow device
      // stays in the fire a little longer rather than landing on nothing.
      if (k >= 1 && live.ready) {
        live.phase = 'descent';
        live.t = 0;
        audio.surfaceWindStart();
      }
      break;
    }
    case 'descent': {
      const k = smooth01(live.t / DESCENT_SECONDS);
      live.alt = DESCENT_START_ALT * (1 - k) * (1 - k) + 32 * (1 - Math.pow(1 - k, 2));
      live.plasma = Math.max(0, 1 - live.t * 0.55);
      live.shake = Math.max(0, 0.4 - k * 0.5) + live.plasma * 0.2;
      audio.surfaceWindSet(0.35 + (1 - k) * 0.65, live.sunUp);
      if (live.t >= DESCENT_SECONDS) {
        // Touchdown: the walker materializes at the airlock, far enough back
        // that the first thing in view is the whole ship, not a hull plate.
        live.phase = 'walk';
        live.t = 0;
        const gx = SHIP_PARK.x - 9.5;
        const gz = SHIP_PARK.z + 10;
        live.pos.set(gx, heightAt(params, tiers, gx, gz) + EYE, gz);
        live.vel.set(0, 0, 0);
        live.yaw = Math.atan2(-(SHIP_PARK.x - gx), -(SHIP_PARK.z - gz));
        live.pitch = -0.06;
        live.grounded = true;
        live.touchdownNonce++;
        live.shake = 0;
        audio.touchdownThud();
        audio.surfaceWindSet(0.5, live.sunUp);
      }
      break;
    }
    case 'walk': {
      stepWalk(dt);
      stepTierStreams();
      stepEcology();
      break;
    }
    case 'skim': {
      stepSkim(dt);
      stepTierStreams();
      stepEcology();
      break;
    }
    case 'fly': {
      stepFly(dt);
      stepTierStreams();
      stepEcology();
      break;
    }
    case 'takeoff': {
      const k = smooth01(live.t / TAKEOFF_SECONDS);
      live.alt = takeoffBaseAlt + (TAKEOFF_TOP_ALT - takeoffBaseAlt) * k * k;
      live.plasma = smooth01((live.alt - 1400) / 1000);
      live.shake = 0.25 + live.plasma * 0.35;
      audio.surfaceWindSet(Math.max(0.1, 1 - k), live.sunUp);
      if (live.t >= TAKEOFF_SECONDS) {
        const restore = endGroundfall();
        return { done: restore };
      }
      break;
    }
  }
  void t;
  return { done: null };
}

/** Capsule-on-heightfield walking. */
function stepWalk(dt: number): void {
  const live = surfaceLive;
  const p = params!;
  const tr = tiers!;

  // The descend key, repurposed: deploy at the runabout, mount at the sled.
  // A Pathfinder (Mobility II) deploys wherever they stand — the sled comes
  // to the certification, not the other way round.
  if (surfaceInput.deploy) {
    surfaceInput.deploy = false;
    if (live.skimRank >= 1) {
      const shipD = Math.hypot(live.pos.x - live.shipAt.x, live.pos.z - live.shipAt.z);
      const sledD = live.skimmerAt
        ? Math.hypot(live.pos.x - live.skimmerAt.x, live.pos.z - live.skimmerAt.z)
        : Infinity;
      const fieldDeploy = (session?.certs['mobility'] ?? 0) >= 2;
      if (live.skimmerAt && sledD < SKIM_MOUNT_RANGE) {
        live.skimmerAt = null;
        mountSkimmer();
        return;
      }
      if (!live.skimmerAt && (shipD < SKIM_DEPLOY_RANGE || fieldDeploy)) {
        mountSkimmer();
        return;
      }
    }
  }

  EUL.set(0, live.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  RIGHT.set(1, 0, 0).applyQuaternion(Q);

  WISH.set(0, 0, 0)
    .addScaledVector(FWD, surfaceInput.fwd)
    .addScaledVector(RIGHT, surfaceInput.strafe);
  if (WISH.lengthSq() > 1) WISH.normalize();

  const ground = heightAt(p, tr, live.pos.x, live.pos.z);
  groundNormalAt(p, tr, live.pos.x, live.pos.z, NORMAL);

  // The water participates now. Depth of liquid over the ground underfoot:
  // up to WADE_MAX the sea is merely an opinion about your speed; past it
  // the suit declines (see below), and lava declines almost immediately.
  const lava = p.relief.liquid === 'lava';
  const wadeLimit = lava ? LAVA_WADE_M : WADE_MAX_M;
  const depth = Math.max(0, p.seaLevelM - ground);
  live.wade = lava ? 0 : Math.min(1, depth / WADE_MAX_M);

  const wadeSlow = 1 - 0.55 * Math.min(1, depth / wadeLimit) * (lava ? 0 : 1);
  const speed = WALK_SPEED * (surfaceInput.run ? RUN_MULT : 1) * wadeSlow;
  WISH.multiplyScalar(speed);

  if (live.grounded) {
    const k = 1 - Math.exp(-dt * GROUND_ACCEL);
    live.vel.x += (WISH.x - live.vel.x) * k;
    live.vel.z += (WISH.z - live.vel.z) * k;
    // Steep ground sheds you sideways along the fall line.
    if (NORMAL.y < SLOPE_STAND) {
      live.vel.x += NORMAL.x * 14 * dt;
      live.vel.z += NORMAL.z * 14 * dt;
    }
    if (surfaceInput.jump) {
      // Thigh-deep water keeps some of the jump for itself.
      live.vel.y = JUMP_SPEED * (1 - 0.4 * live.wade);
      live.grounded = false;
      audio.footstep(true);
    }
  } else {
    const k = 1 - Math.exp(-dt * GROUND_ACCEL * AIR_CONTROL);
    live.vel.x += (WISH.x - live.vel.x) * k;
    live.vel.z += (WISH.z - live.vel.z) * k;
    live.vel.y -= p.gravity * dt;
  }
  surfaceInput.jump = false;

  live.pos.addScaledVector(live.vel, dt);

  /**
   * Ground contact, with glue. A walker crossing a downhill texel is above
   * the floor for a frame; treating that as airborne turned every slope into
   * a stuttering bunny-hop with air-control drag. So while grounded and not
   * ascending, the walker steps DOWN onto ground within stride reach and
   * only genuinely falls when the floor drops further than a step.
   */
  const floor = heightAt(p, tr, live.pos.x, live.pos.z) + EYE;
  if (live.grounded && live.vel.y <= 0) {
    if (live.pos.y <= floor + 0.6) {
      live.pos.y = floor;
      live.vel.y = 0;
    } else {
      live.grounded = false; // walked off an actual ledge
    }
  } else if (live.pos.y <= floor) {
    const falling = live.vel.y < -7;
    live.pos.y = floor;
    live.grounded = true;
    live.vel.y = 0;
    audio.footstep(falling);
  }

  // Past wading depth the suit declines — not a wall, a firm buoyant shove
  // back up the depth gradient, scaling with how far past the line you are.
  // "Refuse-until-skimmer": Phase 3's amphibious ranks renegotiate this.
  const depthNow = Math.max(0, p.seaLevelM - heightAt(p, tr, live.pos.x, live.pos.z));
  live.wadeRefused = false;
  if (depthNow > wadeLimit) {
    live.wadeRefused = true;
    const e = 2.5;
    // Uphill on the seabed is the way out of the sea.
    const gx = (heightAt(p, tr, live.pos.x + e, live.pos.z) - heightAt(p, tr, live.pos.x - e, live.pos.z)) / (2 * e);
    const gz = (heightAt(p, tr, live.pos.x, live.pos.z + e) - heightAt(p, tr, live.pos.x, live.pos.z - e)) / (2 * e);
    const g = Math.hypot(gx, gz);
    const over = Math.min(1.5, (depthNow - wadeLimit) * (lava ? 8 : 1.6));
    if (g > 1e-5) {
      live.vel.x += (gx / g) * (14 + over * 22) * dt;
      live.vel.z += (gz / g) * (14 + over * 22) * dt;
    } else {
      // A flat seabed offers no gradient; back the way you came, then.
      TO_TARGET.set(-live.vel.x, 0, -live.vel.z).normalize();
      live.vel.x += TO_TARGET.x * (14 + over * 22) * dt;
      live.vel.z += TO_TARGET.z * (14 + over * 22) * dt;
    }
    const damp = Math.exp(-dt * (2.4 + over * 4));
    live.vel.x *= damp;
    live.vel.z *= damp;
  }

  // Impact recoil settles quickly; the bob math below rides on top of it.
  live.kick *= Math.exp(-dt * 7);

  // Head bob: driven by actual ground travel, subtle, none while airborne.
  const planar = Math.hypot(live.vel.x, live.vel.z);
  if (live.grounded && planar > 0.4) {
    live.bobPhase += dt * (4.6 + planar * 0.7);
    const target = Math.min(1, planar / WALK_SPEED) * 0.045;
    live.bob += (Math.sin(live.bobPhase * 2) * target - live.bob) * Math.min(1, dt * 10);
    stepFootsteps(dt, planar);
  } else {
    live.bob *= Math.exp(-dt * 8);
  }
  live.alt = live.pos.y - ground;

  stepWork(dt);
  void ground;
}

// ————— The rolling ground —————

/** Frame budget for the mid-stay re-bake, ms. The entry gets 7; play gets 3. */
const STREAM_MS_BUDGET = 3;
/** Fractions of a tier's half-extent at which it starts chasing the walker. */
const NEAR_RECENTER_FRAC = 0.3;
const FAR_RECENTER_FRAC = 0.22;
/** Seconds of current velocity to lead the new centre by. */
const STREAM_LEAD_S = 4;

/**
 * Keep the ground under a traveller. One stream bakes at a time — the near
 * tier outranks the far one — inside a strict budget, and a finished bake
 * commits in a single frame: tier arrays copied, seams and landmarks
 * re-seated on the more honest ground, and terrainEpoch bumped so the scene
 * re-uploads textures and re-seats everything it placed.
 */
function stepTierStreams(): void {
  const live = surfaceLive;
  const p = params;
  const tr = tiers;
  if (!p || !tr || !live.ready) return;
  if (!nearStream || nearStream.tier !== tr.near) nearStream = makeTierStream(tr.near);
  if (!farStream || farStream.tier !== tr.far) farStream = makeTierStream(tr.far);

  // The ship covers a near tier's chase threshold in eight seconds, so the
  // bake gets a larger slice of the frame while it is airborne — there is
  // no walker underfoot to trip over the extra millisecond, and the sled's
  // budget was never chosen for something doing ninety metres a second.
  const budget = live.phase === 'fly' ? FLY_STREAM_MS_BUDGET : STREAM_MS_BUDGET;
  const active = nearStream.active ? nearStream : farStream.active ? farStream : null;
  if (active) {
    if (streamStep(active, p, budget)) {
      streamCommit(active);
      const which = active === nearStream ? 'near' : 'far';
      for (const d of allSites) d.y = heightAt(p, tr, d.x, d.z);
      for (const l of landmarks) l.y = heightAt(p, tr, l.x, l.z);
      for (const sd of settlements) sd.y = heightAt(p, tr, sd.x, sd.z);
      for (const vg of vignettes) vg.y = heightAt(p, tr, vg.x, vg.z);
      for (const rm of regionMarks) rm.y = heightAt(p, tr, rm.x, rm.z);
      // A standing walker stays standing: where near detail arrives under
      // your boots the floor can step, and a step is worn as a step — not
      // as two seconds of surprised freefall (or a burial). Jumps keep
      // their arc; the skim cushion re-tracks on its own spring.
      if (live.phase === 'walk' && live.grounded && live.vel.y <= 0) {
        live.pos.y = heightAt(p, tr, live.pos.x, live.pos.z) + EYE;
      }
      live.terrainEpochTier = which;
      live.terrainEpoch++;
    }
    return;
  }

  const needs = (t: HeightTier, frac: number) =>
    Math.max(Math.abs(live.pos.x - t.cx), Math.abs(live.pos.z - t.cz)) > (t.extent / 2) * frac;
  const arm = (stream: TierStream) => {
    const half = stream.tier.extent / 2;
    // The lead is how far ahead of the traveller the new centre is placed.
    // A walker never needs much; a ship at cruise will have eaten the old
    // lead before the bake finishes, so it is allowed to aim further out.
    const cap = half * (live.phase === 'fly' ? 0.34 : 0.15);
    const lx = Math.max(-cap, Math.min(cap, live.vel.x * STREAM_LEAD_S));
    const lz = Math.max(-cap, Math.min(cap, live.vel.z * STREAM_LEAD_S));
    streamBegin(stream, live.pos.x + lx, live.pos.z + lz);
  };
  if (needs(tr.near, NEAR_RECENTER_FRAC)) arm(nearStream);
  else if (needs(tr.far, FAR_RECENTER_FRAC)) arm(farStream);
}

// ————— The skim —————

/** The surface line the cushion rides: ground, or water it is allowed on. */
function skimSurfaceY(p: SurfaceParams, ground: number): number {
  const lava = p.relief.liquid === 'lava';
  return !lava && p.seaLevelM > ground ? p.seaLevelM : ground;
}

/**
 * Ground-effect sled on the height field. The same capsule contract as the
 * walk — heightAt is the one truth — with speed for legs and a cushion for
 * knees. Water follows the refit: ranks 1–2 tolerate three metres of it
 * before the shove home, rank 3 stops asking. Lava never negotiates.
 */
function stepSkim(dt: number): void {
  const live = surfaceLive;
  const p = params!;
  const tr = tiers!;

  if (surfaceInput.deploy) {
    surfaceInput.deploy = false;
    tryDismount();
    if ((live as { phase: GroundfallPhase }).phase !== 'skim') return;
  }
  surfaceInput.jump = false; // the cushion has no legs to jump with

  EUL.set(0, live.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  RIGHT.set(1, 0, 0).applyQuaternion(Q);

  WISH.set(0, 0, 0)
    .addScaledVector(FWD, surfaceInput.fwd)
    .addScaledVector(RIGHT, surfaceInput.strafe);
  if (WISH.lengthSq() > 1) WISH.normalize();
  const cruise = surfaceInput.run ? SKIM_BOOST_M_S : SKIM_CRUISE_M_S;
  WISH.multiplyScalar(cruise);

  const k = 1 - Math.exp(-dt * SKIM_ACCEL);
  live.vel.x += (WISH.x - live.vel.x) * k;
  live.vel.z += (WISH.z - live.vel.z) * k;

  const ground = heightAt(p, tr, live.pos.x, live.pos.z);
  groundNormalAt(p, tr, live.pos.x, live.pos.z, NORMAL);
  // Too steep to climb: the cushion sheds you along the fall line, harder
  // than boots do, because momentum is now a quantity worth respecting.
  if (NORMAL.y < SKIM_SLOPE_STAND && ground > skimSurfaceY(p, ground) - 0.01) {
    live.vel.x += NORMAL.x * 30 * dt;
    live.vel.z += NORMAL.z * 30 * dt;
  }

  // The water rule, by rank. Depth is over the GROUND — the cushion rides
  // the surface, the refusal reads the seabed.
  const lava = p.relief.liquid === 'lava';
  const depth = Math.max(0, p.seaLevelM - ground);
  const waterLimit = lava
    ? LAVA_WADE_M
    : SKIM_WATER_LIMIT_M[Math.max(1, Math.min(3, live.skimRank))]!;
  live.wade = 0;
  live.wadeRefused = false;
  if (depth > waterLimit) {
    live.wadeRefused = true;
    const e = 4;
    const gx = (heightAt(p, tr, live.pos.x + e, live.pos.z) - heightAt(p, tr, live.pos.x - e, live.pos.z)) / (2 * e);
    const gz = (heightAt(p, tr, live.pos.x, live.pos.z + e) - heightAt(p, tr, live.pos.x, live.pos.z - e)) / (2 * e);
    const g = Math.hypot(gx, gz);
    const over = Math.min(1.5, (depth - waterLimit) * (lava ? 8 : 0.9));
    if (g > 1e-5) {
      live.vel.x += (gx / g) * (18 + over * 26) * dt;
      live.vel.z += (gz / g) * (18 + over * 26) * dt;
    } else {
      TO_TARGET.set(-live.vel.x, 0, -live.vel.z).normalize();
      live.vel.x += TO_TARGET.x * (18 + over * 26) * dt;
      live.vel.z += TO_TARGET.z * (18 + over * 26) * dt;
    }
    const damp = Math.exp(-dt * (1.8 + over * 3));
    live.vel.x *= damp;
    live.vel.z *= damp;
  }

  live.pos.x += live.vel.x * dt;
  live.pos.z += live.vel.z * dt;

  // The cushion: chase the surface line with honest limits. It climbs what
  // a sled climbs and it descends like something that would rather not fall.
  const groundNow = heightAt(p, tr, live.pos.x, live.pos.z);
  const targetY = skimSurfaceY(p, groundNow) + SKIM_HOVER_M + SKIM_EYE;
  const dy = (targetY - live.pos.y) * (1 - Math.exp(-dt * 7));
  live.pos.y += Math.max(-SKIM_FALL_MAX * dt, Math.min(SKIM_CLIMB_MAX * dt, dy));
  live.vel.y = 0;
  live.grounded = true;

  live.skimSpeed = Math.hypot(live.vel.x, live.vel.z);
  live.alt = live.pos.y - groundNow;
  live.kick *= Math.exp(-dt * 7);
  live.bob *= Math.exp(-dt * 8);
  audio.surfaceWindSet(
    Math.min(1, 0.4 + 0.55 * (live.skimSpeed / SKIM_BOOST_M_S)),
    live.sunUp,
  );

  stepSkimWork(dt);
}

/** Swing aboard: the sled is under you and the horizon is now a plan. */
function mountSkimmer(): void {
  const live = surfaceLive;
  const p = params!;
  const tr = tiers!;
  live.phase = 'skim';
  const ground = heightAt(p, tr, live.pos.x, live.pos.z);
  live.pos.y = skimSurfaceY(p, ground) + SKIM_HOVER_M + SKIM_EYE;
  live.vel.set(0, 0, 0);
  live.skimSpeed = 0;
  live.skimPrompt = 'dismount';
  live.skimNoteUntil = 0;
  live.target = null;
  live.mineProgress = 0;
  live.swinging = false;
  audio.touchdownThud();
}

/** Park the sled and put boots back on the ground — if the ground is there. */
function tryDismount(): void {
  const live = surfaceLive;
  const p = params!;
  const tr = tiers!;
  const ground = heightAt(p, tr, live.pos.x, live.pos.z);
  const depth = Math.max(0, p.seaLevelM - ground);
  if (depth > WADE_MAX_M) {
    live.skimPrompt = 'the suit declines to swim — find shallower water to dismount';
    live.skimNoteUntil = live.t + 2.2;
    return;
  }
  EUL.set(0, live.yaw, 0);
  Q.setFromEuler(EUL);
  RIGHT.set(1, 0, 0).applyQuaternion(Q);
  live.skimmerAt = {
    x: live.pos.x + RIGHT.x * 1.7,
    z: live.pos.z + RIGHT.z * 1.7,
    yaw: live.yaw,
  };
  live.phase = 'walk';
  live.pos.y = ground + EYE;
  live.vel.set(0, 0, 0);
  live.skimSpeed = 0;
  live.stabilised = false;
  audio.footstep(true);
  audio.surfaceWindSet(0.5, live.sunUp);
}

/** What the keys mean from the saddle: board, pulse, and a firm no to picks. */
function stepSkimWork(dt: number): void {
  const live = surfaceLive;
  const engageTapped = surfaceInput.engage && !engageWasHeld;
  engageWasHeld = surfaceInput.engage;
  void engageTapped;

  // Refusal notes hold the line for a couple of seconds; then normal hints.
  if (live.t >= live.skimNoteUntil) {
    live.skimPrompt = 'dismount';
  }

  // Boarding the runabout stows the sled in the same motion. Nobody has
  // ever wanted the extra step, so there is not one.
  const shipD = Math.hypot(live.pos.x - live.shipAt.x, live.pos.z - live.shipAt.z);
  if (shipD < BOARD_RANGE + 2) {
    live.scanning = false;
    stepBoardChoice(dt, ' · stow the skimmer');
    return;
  }

  // A seam under the bow is an invitation to stop, not to lean out with a
  // pick at twenty-nine metres a second.
  EUL.set(live.pitch, live.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  let near: DepositSpec | null = null;
  let nearD = MINE_RANGE + 2;
  for (const d of deposits) {
    if (live.mined.has(d.id)) continue;
    const dd = Math.hypot(d.x - live.pos.x, d.z - live.pos.z);
    if (dd < nearD) {
      nearD = dd;
      near = d;
    }
  }
  live.target = null;
  live.mineProgress = 0;
  live.swinging = false;
  live.swing = Math.max(0, live.swing - dt * 2.6);
  if (near && live.skimSpeed < 6) {
    live.prompt = {
      verb: 'mine',
      label: 'a seam under the bow',
      blocked: 'dismount to work the seam',
    };
  } else {
    live.prompt = null;
  }

  // The mast carries the field pulse; rank two keeps the weather off it.
  if (surfaceInput.engage && !near) {
    live.scanning = true;
    live.scanCharge += dt / FIELD_SCAN_SECONDS;
    if (live.scanCharge >= 1) {
      live.scanCharge = 0;
      firePulse();
    }
  } else {
    live.scanning = false;
    live.scanCharge = Math.max(0, live.scanCharge - dt * 2);
  }
}

// ————— The runabout, in air (Phase 6) —————

/**
 * The choice at the ramp, made with the key that was already there.
 *
 * Without the package, boarding is what it has always been: engage, and the
 * ship leaves. With it fitted the same key carries both verbs — a tap takes
 * her up to a hover, a HOLD breaks straight for orbit — so a pilot who only
 * wanted to leave never has to learn there was a choice, and the one who
 * wanted to go and look at that ridge does not need a new binding to say so.
 */
function stepBoardChoice(dt: number, extra: string): void {
  const live = surfaceLive;
  const cargo = live.samples > 0 ? ` · bank ${live.samples} samples` : '';
  if (live.atmoRank < 1) {
    live.prompt = { verb: 'board', label: `board the runabout${extra}${cargo}` };
    if (surfaceInput.engage) beginTakeoff();
    return;
  }
  if (surfaceInput.engage) {
    live.orbitHold += dt;
    live.prompt = {
      verb: 'board',
      label:
        live.orbitHold > 0.22
          ? 'breaking for orbit…'
          : `board${extra}${cargo} · hold to break for orbit`,
    };
    if (live.orbitHold >= ORBIT_HOLD_SECONDS) beginTakeoff();
    return;
  }
  if (live.orbitHold > 0) {
    live.orbitHold = 0;
    beginLift(); // released early: they wanted the ship, not the sky
    return;
  }
  live.prompt = {
    verb: 'board',
    label: `take her up${extra} · hold to break for orbit`,
  };
}

/** The envelope this stay is flying inside. */
function flyEnvelope(): AtmoEnvelope {
  return atmoEnvelope(surfaceLive.atmoRank);
}

/** The surface line the ship must stay above: ground, or the water on it. */
function airSurfaceY(p: SurfaceParams, ground: number): number {
  return p.relief.liquid === 'lava' || p.seaLevelM <= ground ? ground : p.seaLevelM;
}

/** Nobody sets a runabout down in somebody's plaza. */
function districtBlocked(x: number, z: number): boolean {
  for (const d of settlements) {
    if (Math.hypot(d.x - x, d.z - z) < SETDOWN_DISTRICT_CLEAR_M) return true;
  }
  return false;
}

let setdownPollAt = -1;
let setdownHold = 0;

/** Where the gear would put the ship if asked right now. Polled, not per-frame. */
function pollSetdown(force = false): void {
  const live = surfaceLive;
  if (!force && live.t - setdownPollAt < SETDOWN_POLL_SECONDS) return;
  setdownPollAt = live.t;
  live.setdown = findSetdownSite(params!, tiers!, live.pos.x, live.pos.z, {
    normalY: flyEnvelope().setdownNormalY,
    dryMarginM: SETDOWN_DRY_MARGIN_M,
    divertM: SETDOWN_DIVERT_M,
    blocked: districtBlocked,
  });
}

/**
 * Fly the runabout low over the ground it landed on.
 *
 * The frame never changes: this is the SAME landing, the same seeded local
 * octaves, the same tiers rolling under a faster traveller (Phase 3 built
 * the substrate for exactly this). Nothing re-generates because the ship
 * moved, which is why a hill you walked past is the hill you fly back over.
 */
function stepFly(dt: number): void {
  const live = surfaceLive;
  const p = params!;
  const tr = tiers!;
  const env = flyEnvelope();

  if (surfaceInput.view) {
    surfaceInput.view = false;
    live.chaseView = !live.chaseView;
  }
  surfaceInput.jump = false;
  surfaceInput.deploy = false;

  if (live.flyScript) {
    stepFlyScript(dt);
    return;
  }

  // Held engage means one thing up here, and it is the big one.
  if (surfaceInput.engage) {
    live.orbitHold += dt;
    if (live.orbitHold >= ORBIT_HOLD_SECONDS) {
      beginTakeoff();
      return;
    }
  } else {
    live.orbitHold = 0;
  }

  EUL.set(live.pitch, live.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  RIGHT.set(1, 0, 0).applyQuaternion(Q);

  WISH.set(0, 0, 0)
    .addScaledVector(FWD, surfaceInput.fwd)
    .addScaledVector(RIGHT, surfaceInput.strafe);
  if (WISH.lengthSq() > 1) WISH.normalize();
  WISH.multiplyScalar(surfaceInput.run ? env.boost : env.cruise);
  // The vertical keys are the helm's own, doing the helm's own job.
  if (surfaceInput.rise) WISH.y += FLY_CLIMB_M_S;
  if (surfaceInput.descend) WISH.y -= FLY_SINK_M_S;

  // A hold you have been told to be careful with is a hold you cannot hurry
  // — the same law the helm flies by (engine/handling.ts).
  const k = 1 - Math.exp(-dt * FLY_ACCEL * flyResponse);
  live.vel.x += (WISH.x - live.vel.x) * k;
  live.vel.y += (WISH.y - live.vel.y) * k * 2.2;
  live.vel.z += (WISH.z - live.vel.z) * k;

  // Weather, until the trim is rated for it. A front does not damage the
  // ship; it argues with it, which is worse, because you can feel it.
  if (!env.stormproof && live.weather.intensity > 0.15) {
    const gust = live.weather.intensity * (live.weather.kind === 'storm' ? 1 : 0.55);
    const ph = live.t * 0.9;
    live.vel.x += Math.sin(ph * 1.7 + 1.3) * gust * 9 * dt;
    live.vel.z += Math.cos(ph * 1.3) * gust * 9 * dt;
    live.vel.y -= Math.max(0, Math.sin(ph * 0.7)) * gust * 7 * dt;
  }

  live.pos.addScaledVector(live.vel, dt);

  // The floor and the ceiling. Neither is a wall you hit; both are a firm
  // opinion the airframe holds and expresses by not going there.
  const ground = heightAt(p, tr, live.pos.x, live.pos.z);
  const line = airSurfaceY(p, ground);
  const floorY = line + FLY_FLOOR_M;
  if (live.pos.y < floorY) {
    live.pos.y += (floorY - live.pos.y) * Math.min(1, dt * 9);
    if (live.vel.y < 0) live.vel.y *= 0.2;
  }
  live.ceilingM = env.ceiling;
  const ceilY = line + env.ceiling;
  if (live.pos.y > ceilY) {
    live.pos.y = ceilY;
    if (live.vel.y > 0) live.vel.y = 0;
  }

  live.alt = live.pos.y - line;
  live.airSpeed = Math.hypot(live.vel.x, live.vel.z);
  live.grounded = false;

  // Bank into the turn, gently, and never at all for a pilot who asked for
  // a level horizon (flightBindings.ts owns that promise).
  const wantRoll = flightPrefs().horizonLock
    ? 0
    : Math.max(-1, Math.min(1, -surfaceInput.strafe * 0.5 + (live.yaw - flyPrevYaw) / Math.max(dt, 1e-3) * 0.25)) * FLY_BANK;
  flyPrevYaw = live.yaw;
  live.roll += (wantRoll - live.roll) * Math.min(1, dt * 3.2);

  stepSweep(dt);

  // How far this stay has got from the pad it first stood on — the one
  // number a region-crossing request can be settled against.
  live.rangeM = Math.max(live.rangeM, Math.hypot(live.pos.x, live.pos.z));

  // The set-down: hold descend low over ground the gear accepts, and it
  // lands. Over ground it does not, the autoland says why — and, if you
  // keep holding, takes the nearest shelf it does accept.
  if (live.alt <= SETDOWN_ARM_M) {
    pollSetdown();
    const site = live.setdown;
    if (surfaceInput.descend && site) {
      setdownHold += dt;
      if (setdownHold >= SETDOWN_HOLD_SECONDS && site.ok) commitSetdown(site);
    } else {
      setdownHold = 0;
    }
    live.flyPrompt = setdownLine(site);
  } else {
    setdownHold = 0;
    live.setdown = null;
    live.flyPrompt =
      live.alt > env.ceiling - 25
        ? `ceiling — the package is rated to ${env.ceiling} m`
        : `descend below ${SETDOWN_ARM_M} m to set down`;
  }

  live.prompt = {
    verb: 'board',
    label: live.orbitHold > 0.12 ? 'breaking for orbit…' : 'hold engage to break for orbit',
  };

  audio.flightHumSet(
    Math.min(1, live.airSpeed / Math.max(1, env.cruise)),
    surfaceInput.run ? 1 : 0,
  );
  audio.surfaceWindSet(Math.min(1, 0.3 + 0.7 * (live.airSpeed / Math.max(1, env.boost))), live.sunUp);
}

let flyPrevYaw = 0;
/** Response multiplier from the hold, frozen at landing. */
let flyResponse = 1;

/** The cockpit's second line while the gear is deciding. */
function setdownLine(site: { ok: boolean; divertM: number; refused: SetdownRefusal | null } | null): string {
  if (!site) return 'hold descend to set down';
  if (site.ok && site.divertM === 0) return 'hold descend — the gear likes this ground';
  if (site.ok) {
    return `${SETDOWN_REFUSAL_TEXT[site.refused ?? 'water']} — autoland diverts ${Math.round(site.divertM)} m`;
  }
  return `nowhere to set down: ${SETDOWN_REFUSAL_TEXT[site.refused ?? 'slope']}`;
}

/** Commit the flare. From here the ship flies itself down; the keys wait. */
function commitSetdown(site: { x: number; z: number }): void {
  const live = surfaceLive;
  setdownHold = 0;
  live.flyScript = {
    kind: 'setdown',
    k: 0,
    fromY: live.pos.y,
    fromX: live.pos.x,
    fromZ: live.pos.z,
    toX: site.x,
    toZ: site.z,
  };
  live.vel.set(0, 0, 0);
  live.flyPrompt = 'setting down';
}

/** The lift and the flare: two seconds each, and the pilot's hands are off. */
function stepFlyScript(dt: number): void {
  const live = surfaceLive;
  const p = params!;
  const tr = tiers!;
  const script = live.flyScript!;
  const span = script.kind === 'lift' ? LIFT_SECONDS : SETDOWN_SECONDS;
  script.k = Math.min(1, script.k + dt / span);
  const e = smooth01(script.k);

  const groundAt = (x: number, z: number) =>
    airSurfaceY(p, heightAt(p, tr, x, z));

  if (script.kind === 'lift') {
    const base = groundAt(script.toX, script.toZ);
    live.pos.set(script.fromX, script.fromY + (base + HOVER_ALT_M - script.fromY) * e, script.fromZ);
    live.alt = live.pos.y - base;
    live.roll = 0;
    if (script.k >= 1) {
      live.flyScript = null;
      live.vel.set(0, 0, 0);
      live.flew = true;
    }
    audio.surfaceWindSet(0.35 + e * 0.3, live.sunUp);
    return;
  }

  const targetY = groundAt(script.toX, script.toZ) + 2;
  live.pos.set(
    script.fromX + (script.toX - script.fromX) * e,
    script.fromY + (targetY - script.fromY) * e,
    script.fromZ + (script.toZ - script.fromZ) * e,
  );
  live.roll *= 1 - Math.min(1, dt * 4);
  live.alt = live.pos.y - groundAt(live.pos.x, live.pos.z);
  if (script.k >= 1) finishSetdown(script.toX, script.toZ);
}

/** The gear takes the weight, the ramp comes down, the boots are outside. */
function finishSetdown(x: number, z: number): void {
  const live = surfaceLive;
  const p = params!;
  const tr = tiers!;
  live.flyScript = null;
  live.shipAt = { x, z, yaw: live.yaw };
  live.phase = 'walk';
  live.t = 0;
  // Out of the airlock facing the ship, framed exactly as the first landing
  // frames it: back along the hull AND off to one side, so the first thing
  // in view is the whole runabout rather than a hull plate.
  EUL.set(0, live.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  RIGHT.set(1, 0, 0).applyQuaternion(Q);
  const gx = x - FWD.x * AIRLOCK_OFFSET_M - RIGHT.x * AIRLOCK_SIDE_M;
  const gz = z - FWD.z * AIRLOCK_OFFSET_M - RIGHT.z * AIRLOCK_SIDE_M;
  live.pos.set(gx, heightAt(p, tr, gx, gz) + EYE, gz);
  live.vel.set(0, 0, 0);
  live.yaw = Math.atan2(-(x - gx), -(z - gz));
  live.pitch = -0.06;
  live.roll = 0;
  live.grounded = true;
  live.airSpeed = 0;
  live.setdown = null;
  live.flyPrompt = null;
  live.touchdownNonce++;
  live.terrainEpoch++; // the ship moved; everything seated to it re-seats
  audio.flightHumStop();
  audio.touchdownThud();
  audio.surfaceWindSet(0.5, live.sunUp);
  live.setdowns++;
}

/**
 * Set down here and now, diverting if the gear insists, and run the flare
 * out. Shared by the cockpit's own commit path and the headless harness.
 */
export function setDownNow(): { x: number; z: number; refused: SetdownRefusal | null } | null {
  const live = surfaceLive;
  if (live.phase !== 'fly' || !params || !tiers) return null;
  pollSetdown(true);
  const site = live.setdown;
  if (!site?.ok) return site ? { x: site.x, z: site.z, refused: site.refused } : null;
  commitSetdown(site);
  for (let i = 0; i < 600 && live.flyScript; i++) stepSurface(1 / 60, i / 60);
  return { x: live.shipAt.x, z: live.shipAt.z, refused: site.refused };
}

/**
 * The belly sweep. The sensor looks DOWN through a cone, so altitude buys
 * width and the air eventually takes it back (engine/atmoflight.ts owns the
 * law). What it finds is PLACED, never read: a charted seam rides the rail
 * as a hunch and stays unlabelled until somebody stands over it with the
 * field kit. Flight finds work; it has never once done any.
 */
function stepSweep(dt: number): void {
  const live = surfaceLive;
  void dt;
  const r = sweepRadius(live.alt, live.airSpeed);
  live.sweepM = r;
  if (r <= 0) return;
  const r2 = r * r;
  let found = 0;
  const add = (id: string, x: number, z: number) => {
    if (live.charted.has(id)) return;
    const dx = x - live.pos.x;
    const dz = z - live.pos.z;
    if (dx * dx + dz * dz > r2) return;
    live.charted.add(id);
    found++;
  };
  for (const d of allSites) {
    if (d.buried && !live.buriedRevealed) continue;
    add(d.id, d.x, d.z);
  }
  for (const l of landmarks) add(l.id, l.x, l.z);
  for (const sd of settlements) add(sd.id, sd.x, sd.z);
  for (const vg of vignettes) add(vg.id, vg.x, vg.z);
  if (found > 0) live.sweepNonce++;
}

let footAcc = 0;
function stepFootsteps(dt: number, planar: number): void {
  footAcc += dt * planar;
  const stride = 2.1;
  if (footAcc >= stride) {
    footAcc = 0;
    if (surfaceLive.wade > 0.06) audio.wadeSplash(surfaceLive.wade);
    else audio.footstep(false);
  }
}

/** Carry one completed extraction into the suit's ledgers. */
function collectYield(d: DepositSpec, verb: MiningVerb): void {
  const live = surfaceLive;
  if (d.buried && verb !== 'prospect') live.buriedWorked = true;
  const n = verbYield(verb, d.richness);
  const method: SampleHaul['method'] =
    verb === 'core' ? 'core' : verb === 'prospect' ? 'prospect' : 'quick';
  const slot = live.haul.find((h) => h.kind === d.kind && h.method === method);
  if (slot) slot.n += n;
  else live.haul.push({ kind: d.kind, n, method });
  live.samples += n;
  live.surveyCredit += n * (method === 'core' ? 2 : 1);
  live.outcomes.set(d.id, verb === 'prospect' ? 'prospected' : 'worked');
  live.mined.add(d.id);
  live.hits.delete(d.id);
  live.mineNonce++;
  audio.crystalShatter();
  audio.sampleChime();
}

/** The engage key's edge, for decisions that are a press rather than work. */
let engageWasHeld = false;

/** Deposits and the runabout: what the engage key means on foot. */
function stepWork(dt: number): void {
  const live = surfaceLive;
  const engageTapped = surfaceInput.engage && !engageWasHeld;
  engageWasHeld = surfaceInput.engage;

  // The dim second line: what the descend key would do from here.
  live.skimPrompt = null;
  if (live.skimRank >= 1 && live.t >= live.skimNoteUntil) {
    if (live.skimmerAt) {
      const sledD = Math.hypot(live.pos.x - live.skimmerAt.x, live.pos.z - live.skimmerAt.z);
      if (sledD < SKIM_MOUNT_RANGE) live.skimPrompt = 'mount the skimmer';
    } else if (
      Math.hypot(live.pos.x - live.shipAt.x, live.pos.z - live.shipAt.z) < SKIM_DEPLOY_RANGE
    ) {
      live.skimPrompt = 'deploy the survey skimmer';
    } else if ((session?.certs['mobility'] ?? 0) >= 2) {
      // A Pathfinder's sled deploys in the field. Quietly offered — the
      // line would otherwise never stop being true.
      live.skimPrompt = 'field-deploy the skimmer';
    }
  }

  EUL.set(live.pitch, live.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);

  // Nearest unspent deposit in reach and roughly in view.
  let best: DepositSpec | null = null;
  let bestScore = Infinity;
  for (const d of deposits) {
    if (live.mined.has(d.id)) continue;
    TO_TARGET.set(d.x - live.pos.x, d.y + 0.9 - live.pos.y, d.z - live.pos.z);
    const dist = TO_TARGET.length();
    if (dist > MINE_RANGE) continue;
    TO_TARGET.divideScalar(dist || 1);
    const off = Math.acos(Math.max(-1, Math.min(1, TO_TARGET.dot(FWD))));
    if (off > 0.6) continue;
    const score = off * 2 + dist / MINE_RANGE;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  if (live.target?.id !== best?.id) {
    live.mineProgress = 0;
    live.scanCharge = 0;
  }
  live.target = best;

  // Boarding the runabout outranks a seam you happen to face through it.
  const shipD = Math.hypot(live.pos.x - live.shipAt.x, live.pos.z - live.shipAt.z);
  const boardable = shipD < BOARD_RANGE;

  if (boardable) {
    live.scanning = false;
    stepBoardChoice(dt, '');
    return;
  }

  // The resonator outranks everything but the ship: a lead's question,
  // standing right there, humming (engine/leads.ts).
  if (live.leadAt && !live.leadDone) {
    const dd = Math.hypot(live.leadAt.x - live.pos.x, live.leadAt.z - live.pos.z);
    if (dd <= RESONATOR_RANGE) {
      live.prompt = { verb: 'scan', label: 'read the resonance' };
      live.swinging = false;
      live.swing = Math.max(0, live.swing - dt * 2.6);
      live.mineProgress = 0;
      live.scanning = false;
      if (surfaceInput.engage) {
        live.scanCharge += dt / RESONATOR_READ_SECONDS;
        if (live.scanCharge >= 1) {
          live.scanCharge = 0;
          live.leadDone = true;
          live.leadNonce++;
          audio.subEthaBlip(true);
          useUiBus.getState().addToast({
            kind: 'info',
            kicker: 'FIELD READING',
            title: 'The resonance answers',
            body:
              live.leadStage === 1
                ? 'Four notes, patient, and definitely aimed. The full analysis will be ready when the runabout files the reading.'
                : 'The other half of the conversation, mid-sentence. Board the runabout to file the reading — the Guide is waiting with the folder open.',
            ttlMs: 6000,
          });
        }
      } else {
        live.scanCharge = Math.max(0, live.scanCharge - dt * 2);
      }
      return;
    }
  }

  if (best) {
    live.scanning = false;

    // Stage one: the scan. Composition, stability, rarity — and only then
    // the decision. An unscanned seam offers nothing but the instrument.
    if (!live.scanned.has(best.id)) {
      live.prompt = { verb: 'scan', label: 'scan the seam' };
      live.swinging = false;
      live.swing = Math.max(0, live.swing - dt * 2.6);
      live.mineProgress = 0;
      if (surfaceInput.engage) {
        live.scanCharge += dt / SEAM_SCAN_SECONDS;
        if (live.scanCharge >= 1) {
          live.scanCharge = 0;
          live.scanned.add(best.id);
          live.scanNonce++;
          audio.subEthaBlip(false);
        }
      } else {
        live.scanCharge = Math.max(0, live.scanCharge - dt * 2);
      }
      return;
    }

    const verb = MINING_VERBS[live.verbIdx] ?? 'break';
    const kindName = SAMPLE_BY_ID[best.kind]?.name ?? 'core samples';

    // Preserve is a decision, not work: one press, and the seam stands.
    if (verb === 'preserve') {
      const already =
        live.outcomes.has(best.id) || priorStates.has(best.id);
      live.prompt = already
        ? { verb: 'mine', label: 'already on record', blocked: 'this seam is already on record' }
        : { verb: 'mine', label: 'preserve the seam · survey credit' };
      live.swinging = false;
      live.swing = Math.max(0, live.swing - dt * 2.6);
      live.mineProgress = 0;
      if (engageTapped && !already) {
        live.outcomes.set(best.id, 'preserved');
        live.surveyCredit += 1;
        audio.sampleChime();
      }
      return;
    }

    const needed = verbHitsNow(verb, best.richness);
    const done = live.hits.get(best.id) ?? 0;
    const label =
      verb === 'core'
        ? `precision core — ${verbYield(verb, best.richness)}× ${kindName} · double survey`
        : verb === 'prospect'
          ? `prospect — mark the seam · take 1 ${kindName}`
          : `quick break — ${verbYield(verb, best.richness)}× ${kindName}`;
    live.prompt = { verb: 'mine', label };

    if (surfaceInput.engage) {
      // The pick swings on its own cadence while the key is held; the HIT is
      // the moment the head lands, and everything — sparks, sound, the
      // camera's little dip, the seam cracking — keys off that instant.
      live.swinging = true;
      const before = live.swing;
      live.swing += dt / SWING_SECONDS;
      if (before < SWING_IMPACT && live.swing >= SWING_IMPACT) {
        const now = done + 1;
        live.hits.set(best.id, now);
        live.hitNonce++;
        live.hitAt.x = best.x;
        live.hitAt.y = best.y + 0.7;
        live.hitAt.z = best.z;
        live.kick = 1;
        audio.pickThunk();
        if (now >= needed) collectYield(best, verb);
      }
      if (live.swing >= 1) live.swing = 0;
    } else {
      live.swinging = false;
      live.swing = Math.max(0, live.swing - dt * 2.6);
    }
    live.mineProgress = live.mined.has(best.id)
      ? 0
      : Math.min(1, (live.hits.get(best.id) ?? 0) / needed);
    return;
  }

  live.swinging = false;
  live.swing = Math.max(0, live.swing - dt * 2.6);
  live.mineProgress = 0;
  live.prompt = null;

  // Nothing in reach: the engage key belongs to the FIELD KIT. The wheel
  // chooses — the pulse always, and whichever marks certification has
  // opened (Phase 5). A refusal note holds the line for a couple of
  // seconds, exactly like the sled's.
  const kit = fieldVerbs();
  if (live.fieldIdx >= kit.length) live.fieldIdx = 0; // repair walked out of reach
  const fieldVerb = kit[live.fieldIdx] ?? 'pulse';

  if (fieldVerb !== 'pulse') {
    live.prompt =
      live.t < live.fieldNoteUntil && live.fieldNote
        ? { verb: 'scan', label: live.fieldNote, blocked: live.fieldNote }
        : {
            verb: 'scan',
            label:
              fieldVerb === 'beacon'
                ? 'raise a beacon here'
                : fieldVerb === 'station'
                  ? 'raise a survey station here'
                  : fieldVerb === 'shelter'
                    ? 'make camp — raise a shelter here'
                    : 'make the repair — the settlement is watching',
          };
    if (surfaceInput.engage && !(live.t < live.fieldNoteUntil)) {
      live.scanning = false;
      live.scanCharge += dt / MARK_PLANT_SECONDS;
      if (live.scanCharge >= 1) {
        live.scanCharge = 0;
        plantMark(fieldVerb);
      }
    } else {
      live.scanCharge = Math.max(0, live.scanCharge - dt * 2);
    }
    return;
  }

  // The pulse: one held breath and every site within range reports to the
  // compass. The range is the weather's to bend — dust chokes it, storms
  // feed it — and buried seams answer no pulse until the dust has moved
  // them into the sun (or an Assayer reads the sand — Geology II). The
  // biologger rides the same pulse.
  if (surfaceInput.engage) {
    live.scanning = true;
    live.scanCharge += dt / FIELD_SCAN_SECONDS;
    if (live.scanCharge >= 1) {
      live.scanCharge = 0;
      firePulse();
    }
  } else {
    live.scanning = false;
    live.scanCharge = Math.max(0, live.scanCharge - dt * 2);
  }
}

/** One field pulse, wherever it fires from — boots or the mast. */
function firePulse(): void {
  const live = surfaceLive;
  // Geology II — reading the sand: the pulse raises the buried seams the
  // weather was hoarding, once, for the rest of the stay.
  if (
    !live.buriedRevealed
    && (session?.certs['geology'] ?? 0) >= 2
    && allSites.some((d) => d.buried)
  ) {
    live.buriedRevealed = true;
    rebuildWorkableField();
    live.revealNonce++;
    useUiBus.getState().addToast({
      kind: 'info',
      kicker: 'FIELD REPORT',
      title: 'The sand has no secrets from an Assayer',
      body: 'The pulse reads straight through the drift. Buried seams stand on the rail for the rest of the stay.',
      ttlMs: 5600,
    });
  }
  const r2 = live.scanRangeNow * live.scanRangeNow;
  for (const d of allSites) {
    if (d.buried && !live.buriedRevealed) continue;
    const dx = d.x - live.pos.x;
    const dz = d.z - live.pos.z;
    if (dx * dx + dz * dz <= r2) live.scanned.add(d.id);
  }
  pulseEcology(live.scanRangeNow);
  live.scanNonce++;
  audio.subEthaBlip(true);
}

/**
 * Plant the selected mark at the walker's feet. The engine will judge it
 * again at banking (it trusts nobody), but the preflight here uses the SAME
 * validator, so a refusal is immediate and worded identically.
 */
function plantMark(kind: GroundMark['kind']): void {
  const live = surfaceLive;
  const p = params;
  const s = session;
  if (!p || !s) return;
  const st = useGame.getState().s;
  const facts = markWorldFacts(st, s.worldKey);
  if (!facts) return;

  localToDir(p, live.pos.x, live.pos.z, DRY_DIR);
  const dir: [number, number, number] = [DRY_DIR.x, DRY_DIR.y, DRY_DIR.z];
  const existing: GroundMark[] = [
    ...(st.expedition.groundWorlds[s.worldKey]?.marks ?? []),
    ...live.marksPlaced.map((m) => ({ kind: m.kind, dir: m.dir, atMs: 0 })),
  ];
  const verdict = validateMark(s.certs, existing, facts, { kind, dir });
  if (!verdict.ok) {
    live.fieldNote = verdict.why;
    live.fieldNoteUntil = live.t + 2.4;
    return;
  }

  live.marksPlaced.push({ kind, dir, x: live.pos.x, z: live.pos.z });
  regionMarks.push({
    kind,
    x: live.pos.x,
    y: heightAt(p, tiers!, live.pos.x, live.pos.z),
    z: live.pos.z,
    fresh: true,
  });
  live.markNonce++;
  audio.sampleChime();
  useUiBus.getState().addToast({
    kind: 'info',
    kicker: 'FIELD WORKS',
    title:
      kind === 'beacon'
        ? 'Beacon raised'
        : kind === 'station'
          ? 'Survey station raised'
          : kind === 'shelter'
            ? 'Camp made'
            : 'Repair made',
    body:
      kind === 'repair'
        ? 'Mended where it stood. The record is filed when you board — the town has already noticed.'
        : 'It will be here, exactly here, every time you come back. The record is filed when you board.',
    // The mark's own plate (ASSET_UPLIFT.md 6.1).
    art: EXPEDITION_ART.mark(kind),
    ttlMs: 5200,
  });
}

// ————— Camera —————

const CAM_EUL = new Euler(0, 0, 0, 'YXZ');
/** Chase-camera seat, lagged behind the hull so the follow is not rigid. */
const chaseAt = new Vector3();
const CHASE_UP = new Vector3(0, 7, 0);
let chaseAtT = 0;
export const SURFACE_FOV = 62;
const SURFACE_NEAR = 0.08;
const SURFACE_FAR = 90_000;

/**
 * Copy the surface pose onto the camera. During scripted phases the camera
 * flies the approach; on foot it is the walker's eyes.
 */
export function applySurfaceCamera(camera: Camera, t: number): void {
  const live = surfaceLive;
  const p = params;
  const tr = tiers;
  if (!p || !tr) return;

  if (live.phase === 'entry') {
    // Still the flight scene's job; the rig keeps flying the dive. Nothing
    // to do here — the surface camera begins at the swap.
    return;
  }

  const pcam = camera as PerspectiveCamera;
  if (live.phase === 'descent' || live.phase === 'takeoff') {
    const up = live.phase === 'takeoff';
    const k = smooth01(live.t / (up ? TAKEOFF_SECONDS : DESCENT_SECONDS));
    const alt = live.alt;
    // Glide in from the north-east, banking gently onto the site.
    const reach = up ? 40 + k * 900 : 40 + (1 - k) * 2400;
    const a = up ? 0.6 + k * 0.5 : 0.6 + (1 - k) * 0.9;
    const gx = Math.cos(a) * reach;
    const gz = -Math.abs(Math.sin(a)) * reach;
    const groundY = heightAt(p, tr, gx, gz);
    camera.position.set(gx, Math.max(groundY + 16, alt), gz);
    const lookY = heightAt(p, tr, 0, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(live.shipAt.x, lookY + 6 + alt * 0.04, live.shipAt.z);
    camera.rotateZ(Math.sin(t * 1.7) * live.shake * 0.02);
  } else if (live.phase === 'fly') {
    // In the seat. The canopy is head-fixed (the frame the helm draws), so
    // the roll is the ship's and the eye rides it — but only as far as the
    // horizon-lock preference allows, which is sometimes nowhere at all.
    CAM_EUL.set(live.pitch, live.yaw, live.roll);
    camera.quaternion.setFromEuler(CAM_EUL);
    camera.position.copy(live.pos);
    if (live.chaseView) {
      // Behind and above, on a lag, so the ship you paid for is a thing in
      // the landscape rather than a rumour about where the camera is.
      FWD.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const back = 22 + Math.min(14, live.airSpeed * 0.14);
      const lag = Math.min(0.12, Math.max(1 / 240, t - chaseAtT));
      chaseAt.lerp(
        TO_TARGET.copy(live.pos).addScaledVector(FWD, -back).add(CHASE_UP),
        Math.min(1, 6 * lag),
      );
      chaseAtT = t;
      const floor = heightAt(p, tr, chaseAt.x, chaseAt.z) + 3.5;
      camera.position.set(chaseAt.x, Math.max(chaseAt.y, floor), chaseAt.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(live.pos.x, live.pos.y + 1.5, live.pos.z);
    }
  } else {
    // The walker's eyes. The kick is the pick landing — a dip, not a shake.
    CAM_EUL.set(live.pitch - live.kick * 0.012, live.yaw, 0);
    camera.quaternion.setFromEuler(CAM_EUL);
    camera.position.copy(live.pos);
    camera.position.y += live.bob - live.kick * 0.045;
    // The cushion's thrum: present, and just barely. Anything larger is a
    // boat, and boats are where the motion sickness lives.
    if (live.phase === 'skim') {
      camera.position.y +=
        Math.sin(t * 9.2) * 0.012 * Math.min(1, live.skimSpeed / SKIM_CRUISE_M_S);
    }
    // Tremors are the one thing allowed to shake a standing camera, and
    // only a little: the ground is making a point, not a health bar.
    if (live.groundShake > 0.01) {
      const g = live.groundShake * 0.05;
      camera.position.x += (Math.sin(t * 47.1) + Math.sin(t * 23.7)) * g;
      camera.position.y += Math.sin(t * 39.3) * g * 0.7;
    }
  }

  if (live.shake > 0.001 && live.phase !== 'walk') {
    camera.position.x += (Math.sin(t * 31.7) + Math.sin(t * 17.3)) * live.shake * 0.18;
    camera.position.y += (Math.sin(t * 27.1) + Math.sin(t * 41.9)) * live.shake * 0.14;
  }

  if (typeof pcam.fov === 'number') {
    const targetFov =
      live.phase === 'skim'
        ? SURFACE_FOV + 6 * Math.min(1, live.skimSpeed / SKIM_BOOST_M_S)
        : live.phase === 'walk' && surfaceInput.run && surfaceInput.fwd > 0
          ? SURFACE_FOV + 4
          : SURFACE_FOV;
    let dirty = false;
    if (Math.abs(pcam.fov - targetFov) > 0.02) {
      pcam.fov += (targetFov - pcam.fov) * 0.12;
      dirty = true;
    }
    if (pcam.near !== SURFACE_NEAR) {
      pcam.near = SURFACE_NEAR;
      pcam.far = SURFACE_FAR;
      dirty = true;
    }
    if (dirty) pcam.updateProjectionMatrix();
  }
}

// Headless-verification hook (scripts/shot.mjs) — DEV only.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__tcSurface'] = {
    state: () => ({
      phase: session ? surfaceLive.phase : null,
      ready: surfaceLive.ready,
      genProgress: surfaceLive.genProgress,
      plasma: surfaceLive.plasma,
      pos: surfaceLive.pos.toArray(),
      yaw: surfaceLive.yaw,
      pitch: surfaceLive.pitch,
      alt: surfaceLive.alt,
      grounded: surfaceLive.grounded,
      samples: surfaceLive.samples,
      surveyCredit: surfaceLive.surveyCredit,
      haul: surfaceLive.haul.map((h) => ({ ...h })),
      outcomes: Object.fromEntries(surfaceLive.outcomes),
      scanned: [...surfaceLive.scanned],
      scanCharge: surfaceLive.scanCharge,
      scanRange: surfaceLive.scanRange,
      verb: MINING_VERBS[surfaceLive.verbIdx],
      prompt: surfaceLive.prompt,
      target: surfaceLive.target,
      deposits: deposits.map((d) => ({
        id: d.id,
        x: d.x,
        y: d.y,
        z: d.z,
        richness: d.richness,
        kind: d.kind,
      })),
      prospects: surfaceProspects().map((d) => d.id),
      mined: [...surfaceLive.mined],
      session,
      seaLevelM: params?.seaLevelM ?? null,
      sunLocal: session?.sunLocal ?? null,
      weather: { ...surfaceLive.weather },
      outlook: surfaceLive.outlook,
      wade: surfaceLive.wade,
      wadeRefused: surfaceLive.wadeRefused,
      buriedRevealed: surfaceLive.buriedRevealed,
      landmarks: landmarks.map((l) => ({
        id: l.id, kind: l.kind, name: l.name, x: l.x, y: l.y, z: l.z,
      })),
      settlements: settlements.map((sd) => ({
        id: sd.id, name: sd.name, x: sd.x, y: sd.y, z: sd.z,
        lit: sd.lit, harbor: sd.harbor,
      })),
      vignettes: vignettes.map((vg) => ({
        id: vg.id, kind: vg.kind, name: vg.name, x: vg.x, y: vg.y, z: vg.z,
      })),
      ambientSpecies: ambientSpecies.map((sp) => sp.id),
      speciesSeen: [...surfaceLive.speciesSeen],
      skimRank: surfaceLive.skimRank,
      skimmerAt: surfaceLive.skimmerAt ? { ...surfaceLive.skimmerAt } : null,
      skimSpeed: surfaceLive.skimSpeed,
      skimPrompt: surfaceLive.skimPrompt,
      stabilised: surfaceLive.stabilised,
      terrainEpoch: surfaceLive.terrainEpoch,
      tierCenters: tiers
        ? { near: [tiers.near.cx, tiers.near.cz], far: [tiers.far.cx, tiers.far.cz] }
        : null,
      // — Phase 5 —
      marks: regionMarks.map((m) => ({ ...m })),
      fieldVerbs: fieldVerbs(),
      fieldVerb: fieldVerbs()[surfaceLive.fieldIdx] ?? 'pulse',
      fieldNote: surfaceLive.fieldNote,
      landmarksStood: [...surfaceLive.landmarksStood],
      weathered: [...surfaceLive.weathered],
      civicStood: surfaceLive.civicStood,
      certs: session ? { ...session.certs } : {},
      lead: {
        stage: surfaceLive.leadStage,
        at: surfaceLive.leadAt ? { ...surfaceLive.leadAt } : null,
        done: surfaceLive.leadDone,
      },
      openRequests: session?.openRequests ?? [],
      // — Phase 6 —
      atmoRank: surfaceLive.atmoRank,
      shipAt: { ...surfaceLive.shipAt },
      airSpeed: surfaceLive.airSpeed,
      ceilingM: surfaceLive.ceilingM,
      roll: surfaceLive.roll,
      chaseView: surfaceLive.chaseView,
      flyScript: surfaceLive.flyScript ? { ...surfaceLive.flyScript } : null,
      flyPrompt: surfaceLive.flyPrompt,
      setdown: surfaceLive.setdown ? { ...surfaceLive.setdown } : null,
      sweepM: surfaceLive.sweepM,
      charted: [...surfaceLive.charted],
      rangeM: surfaceLive.rangeM,
      flew: surfaceLive.flew,
      setdowns: surfaceLive.setdowns,
    }),
    /** Pin the sky to a kind ('clear' resets, null clears the pin). */
    setWeather: (kind: string | null) => {
      weatherOverride = kind && kind !== 'clear' ? (kind as WeatherKind) : null;
      return weatherOverride ?? 'clear';
    },
    /** Choose the pick's meaning by index into MINING_VERBS. */
    setVerb: (i: number) => {
      surfaceLive.verbIdx = ((i | 0) % MINING_VERBS.length + MINING_VERBS.length) % MINING_VERBS.length;
      return MINING_VERBS[surfaceLive.verbIdx];
    },
    /** Skip the dwell: identify every site in the region at once. */
    identifyAll: () => {
      for (const d of allSites) surfaceLive.scanned.add(d.id);
      return surfaceLive.scanned.size;
    },
    input: surfaceInput,
    /** Skip the cinematic: finish generation now and stand at the airlock. */
    skipToWalk: () => {
      if (!session || !params || !tiers) return false;
      while (!surfaceLive.ready) stepGeneration();
      surfaceLive.phase = 'descent';
      surfaceLive.t = DESCENT_SECONDS + 1;
      stepSurface(1 / 60, 0);
      // Read through a widened view: stepSurface just advanced the phase and
      // TS's narrowing from the assignment above has no way to know that.
      return (surfaceLive as { phase: GroundfallPhase }).phase === 'walk';
    },
    teleport: (x: number, z: number, yaw = surfaceLive.yaw) => {
      if (!params || !tiers) return null;
      surfaceLive.pos.set(x, heightAt(params, tiers, x, z) + EYE, z);
      surfaceLive.yaw = yaw;
      surfaceLive.vel.set(0, 0, 0);
      return surfaceLive.pos.toArray();
    },
    look: (yaw: number, pitch: number) => {
      surfaceLive.yaw = yaw;
      surfaceLive.pitch = pitch;
    },
    heightAt: (x: number, z: number) =>
      params && tiers ? heightAt(params, tiers, x, z) : null,
    board: () => beginTakeoff(),
    /** Grant the Atmospheric Handling Package at a rank, live (0–3). */
    setAtmo: (rank: number) => {
      const r = Math.max(0, Math.min(3, rank | 0));
      useGame.getState().s.expedition.refits['atmo'] = r;
      surfaceLive.atmoRank = r;
      surfaceLive.ceilingM = atmoEnvelope(r).ceiling;
      return r;
    },
    /** Take her up (or bring her down where she stands). */
    fly: (on: boolean) => {
      if (on && (surfaceLive.phase === 'walk' || surfaceLive.phase === 'skim')) {
        beginLift();
        // The lift is scripted; run it out so the caller lands in free flight.
        for (let i = 0; i < 240 && surfaceLive.flyScript; i++) stepSurface(1 / 60, i / 60);
      } else if (!on && surfaceLive.phase === 'fly') {
        setDownNow();
      }
      return surfaceLive.phase;
    },
    /** Commit a set-down here and run the flare out to boots on the ground. */
    setDown: () => setDownNow(),
    /** Ask the gear about the ground under any point, right now. */
    probeSetdown: (x?: number, z?: number) => {
      if (!params || !tiers) return null;
      const px = x ?? surfaceLive.pos.x;
      const pz = z ?? surfaceLive.pos.z;
      return findSetdownSite(params, tiers, px, pz, {
        normalY: atmoEnvelope(surfaceLive.atmoRank || 1).setdownNormalY,
        dryMarginM: SETDOWN_DRY_MARGIN_M,
        divertM: SETDOWN_DIVERT_M,
        blocked: districtBlocked,
      });
    },
    /** Canopy or chase, without asking the pilot to press anything. */
    setView: (chase: boolean) => {
      surfaceLive.chaseView = chase;
      return surfaceLive.chaseView;
    },
    /** Put the ship anywhere in the region, at an altitude, in free flight. */
    flyTo: (x: number, z: number, altM = 220) => {
      if (surfaceLive.phase !== 'fly' || !params || !tiers) return null;
      surfaceLive.flyScript = null;
      const line = airSurfaceY(params, heightAt(params, tiers, x, z));
      surfaceLive.pos.set(x, line + altM, z);
      surfaceLive.vel.set(0, 0, 0);
      surfaceLive.alt = altM;
      chaseAt.copy(surfaceLive.pos);
      stepSurface(1 / 60, 0);
      return surfaceLive.pos.toArray();
    },
    /** Teleport a photographer's distance from the i-th nearest settlement. */
    visitSettlement: (i = 0) => {
      if (!params || !tiers || settlements.length === 0) return null;
      const sorted = [...settlements].sort(
        (a, b) =>
          Math.hypot(a.x - surfaceLive.pos.x, a.z - surfaceLive.pos.z)
          - Math.hypot(b.x - surfaceLive.pos.x, b.z - surfaceLive.pos.z),
      );
      const sd = sorted[Math.max(0, Math.min(sorted.length - 1, i | 0))]!;
      const dx = surfaceLive.pos.x - sd.x;
      const dz = surfaceLive.pos.z - sd.z;
      const dd = Math.hypot(dx, dz) || 1;
      const px = sd.x + (dx / dd) * 70;
      const pz = sd.z + (dz / dd) * 70;
      surfaceLive.pos.set(px, heightAt(params, tiers, px, pz) + EYE, pz);
      surfaceLive.yaw = Math.atan2(-(sd.x - px), -(sd.z - pz));
      surfaceLive.pitch = -0.02;
      surfaceLive.vel.set(0, 0, 0);
      return { id: sd.id, name: sd.name, lit: sd.lit };
    },
    /** Catalogue everything the region offers, instruments be damned. */
    catalogueAll: () => {
      catalogueSpecies([
        ...ambientSpecies.map((sp) => sp.id),
        ...vignettes.map((vg) => vg.kind),
        ...(settlements.some((sd) => sd.lit) ? civicSpecies.map((sp) => sp.id) : []),
      ]);
      return [...surfaceLive.speciesSeen];
    },
    /** DEV: write a skimmer rank straight into the expedition (and the stay). */
    grantSkimmer: (rank: number) => {
      const st = useGame.getState().s;
      st.expedition.refits['skimmer'] = Math.max(0, Math.min(3, rank | 0));
      surfaceLive.skimRank = skimmerRank(st.expedition);
      return surfaceLive.skimRank;
    },
    /** DEV: mount or park the sled wherever the walker stands. */
    skim: (on: boolean) => {
      if (!params || !tiers) return null;
      if (on && surfaceLive.phase === 'walk') {
        if (surfaceLive.skimRank < 1) return null;
        surfaceLive.skimmerAt = null;
        mountSkimmer();
      } else if (!on && surfaceLive.phase === 'skim') {
        tryDismount();
      }
      return surfaceLive.phase;
    },
    /** DEV: write cert ranks straight into the expedition AND the session. */
    grantCert: (track: string, rank: number) => {
      const st = useGame.getState().s;
      st.expedition.certs[track] = Math.max(0, Math.min(3, rank | 0));
      if (session) {
        session = { ...session, certs: { ...st.expedition.certs } };
        useUiBus.getState().setGroundfall(session);
      }
      return st.expedition.certs[track];
    },
    /** DEV: plant a mark at the boots, through the same validator. */
    mark: (kind: GroundMark['kind']) => {
      const before = surfaceLive.marksPlaced.length;
      plantMark(kind);
      return surfaceLive.marksPlaced.length > before
        ? { ...surfaceLive.marksPlaced[surfaceLive.marksPlaced.length - 1]! }
        : { refused: surfaceLive.fieldNote };
    },
    /** DEV: read the resonator without walking to it. */
    readLead: () => {
      if (!surfaceLive.leadAt || surfaceLive.leadStage === 0) return false;
      surfaceLive.leadDone = true;
      surfaceLive.leadNonce++;
      return true;
    },
    /** DEV: stand a resonator in THIS region regardless of the flags. */
    forceLead: () => {
      surfaceLive.leadStage = 1;
      placeResonator();
      // The real flow places the resonator before the scene mounts; this
      // dev path arrives after, so nudge the scene to re-read it.
      surfaceLive.markNonce++;
      return surfaceLive.leadAt ? { ...surfaceLive.leadAt } : null;
    },
    detach: () => detachInput?.(),
  };
}
