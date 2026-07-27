/**
 * Groundfall: the state machine between the helm and your boots.
 *
 * Mirrors flightControl.ts — mutable module state written by input handlers,
 * integrated once per frame by the scene. Phases:
 *
 *   entry    scripted dive through the atmosphere (flight scene, plasma up)
 *   descent  scripted glide from 3 km to the landing site (surface scene)
 *   walk     the player has legs; physics is a capsule on the height field
 *   takeoff  scripted ascent back to the swap altitude, then the helm
 *
 * Nothing here touches the save directly: samples ride in module state and
 * are banked through a sim input when the walker boards the runabout, the
 * same seal the rest of the flight economy honours.
 */
import { Euler, Quaternion, Vector3, type Camera, type PerspectiveCamera } from 'three/webgpu';
import { useUiBus, type GroundfallSession } from '../../fx/uiBus';
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
import { skimmerRank, surfaceScanRange } from '../../../engine/deepField';
import {
  SKIM_BOOST_M_S,
  SKIM_CRUISE_M_S,
  SKIM_STABILISED_RANK,
  SKIM_WATER_LIMIT_M,
} from '../../../content/refit';
import { siteMinable } from '../../../engine/groundSites';
import {
  stormFlash,
  syntheticWeather,
  tremorPulse,
  weatherAt,
  weatherOutlook,
  type LocalWeather,
  type WeatherKind,
} from '../../../engine/weather';
import type { GroundSiteOutcome, SampleHaul } from '../../../engine/types';
import * as audio from '../../audio/audio';

export type { GroundfallSession };
export type { DepositSpec };

export type GroundfallPhase = 'entry' | 'descent' | 'walk' | 'skim' | 'takeoff';

/**
 * What the pick can mean, once a seam has been scanned. `break` is the old
 * hold-to-swing; the others are the decision the scan buys you.
 */
export type MiningVerb = 'break' | 'core' | 'prospect' | 'preserve';
export const MINING_VERBS: readonly MiningVerb[] = ['break', 'core', 'prospect', 'preserve'];

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
/** Where the runabout parks, metres from the touchdown point. */
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

export function groundfallSession(): GroundfallSession | null {
  return session;
}
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
  live.skimRank = skimmerRank(st.expedition);
  live.skimmerAt = null;
  live.skimSpeed = 0;
  live.stabilised = false;
  live.skimPrompt = null;
  live.skimNoteUntil = 0;
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

  useUiBus.getState().setGroundfall(s);
  audio.entryRoarStart();
}

/** The walker boarded (or the world was delivered out from under them). */
export function beginTakeoff(): void {
  if (surfaceLive.phase !== 'walk' && surfaceLive.phase !== 'skim') return;
  bankSamples();
  // The skimmer stows itself, wherever it stood. It has strong feelings
  // about being left behind and expresses them by not allowing it.
  surfaceLive.skimmerAt = null;
  surfaceLive.phase = 'takeoff';
  surfaceLive.t = 0;
  releasePointer();
  audio.entryRoarStart();
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
  actions.bankGroundSamples(
    s.worldKey,
    s.name,
    [...surfaceLive.haul],
    sites,
    [...surfaceLive.speciesSeen],
  );
  surfaceLive.samples = 0;
  surfaceLive.surveyCredit = 0;
  surfaceLive.haul = [];
  surfaceLive.outcomes.clear();
  surfaceLive.speciesSeen.clear();
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
  ambientSpecies = [];
  civicSpecies = [];
  priorSpecies = new Set();
  priorStates = new Map();
  weatherOverride = null;
  nearStream = null;
  farStream = null;
  releasePointer();
  audio.entryRoarStop();
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
      bakeCursor.normals = true;
      surfaceLive.ready = true;
    } else {
      break;
    }
  }
  const done = Math.min(bakeCursor.far, tiers.far.texels) + Math.min(bakeCursor.near, tiers.near.texels);
  return bakeCursor.normals ? 1 : (done / totalRows) * 0.97;
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
    // means the skimmer — deploy, mount, dismount.
    deploy: held('down'),
  };
}

export function attachSurfaceInput(canvas: HTMLElement): () => void {
  const keys = new Set<string>();
  let jumpHeld = false;
  let deployHeld = false;

  const apply = () => {
    const h = bindingsHeld(keys);
    surfaceInput.fwd = h.fwd;
    surfaceInput.strafe = h.strafe;
    surfaceInput.run = h.run;
    surfaceInput.engage = h.engage;
    if (h.jump && !jumpHeld) surfaceInput.jump = true;
    jumpHeld = h.jump;
    if (h.deploy && !deployHeld) surfaceInput.deploy = true;
    deployHeld = h.deploy;
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
    if (!pointerLocked || (surfaceLive.phase !== 'walk' && surfaceLive.phase !== 'skim')) return;
    const sens = 0.0021 * flightPrefs().sensitivity;
    surfaceLive.yaw -= e.movementX * sens;
    const invert = flightPrefs().invertPitch ? 1 : -1;
    surfaceLive.pitch = Math.max(
      -1.45,
      Math.min(1.45, surfaceLive.pitch + e.movementY * sens * invert),
    );
  };
  const onPointerDown = (e: PointerEvent) => {
    if (surfaceLive.phase !== 'walk' && surfaceLive.phase !== 'skim') return;
    const el = e.target as HTMLElement | null;
    if (el?.closest?.('.sh-hud, .modal, .modal-veil, .toast-stack')) return;
    if (!pointerLocked) canvas.requestPointerLock?.();
  };
  const onLockChange = () => {
    pointerLocked = document.pointerLockElement != null;
  };
  // The wheel chooses what the pick will mean. Only with a scanned seam in
  // reach — everywhere else the wheel keeps whatever job the browser gave it.
  const onWheel = (e: WheelEvent) => {
    if (!pointerLocked || surfaceLive.phase !== 'walk') return;
    const t = surfaceLive.target;
    if (!t || !surfaceLive.scanned.has(t.id)) return;
    const n = MINING_VERBS.length;
    surfaceLive.verbIdx =
      (surfaceLive.verbIdx + (e.deltaY > 0 ? 1 : -1) + n) % n;
    e.preventDefault();
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
  if (civicSpecies.length > 0) {
    for (const sd of settlements) {
      if (!sd.lit) continue;
      const dd = Math.hypot(sd.x - live.pos.x, sd.z - live.pos.z);
      if (dd <= CIVIC_CATALOG_M) {
        catalogueSpecies(civicSpecies.map((s) => s.id));
        break;
      }
    }
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
    (live.phase === 'walk' || live.phase === 'skim')
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
    case 'takeoff': {
      const k = smooth01(live.t / TAKEOFF_SECONDS);
      live.alt = 12 + (TAKEOFF_TOP_ALT - 12) * k * k;
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
  if (surfaceInput.deploy) {
    surfaceInput.deploy = false;
    if (live.skimRank >= 1) {
      const shipD = Math.hypot(live.pos.x - SHIP_PARK.x, live.pos.z - SHIP_PARK.z);
      const sledD = live.skimmerAt
        ? Math.hypot(live.pos.x - live.skimmerAt.x, live.pos.z - live.skimmerAt.z)
        : Infinity;
      if (live.skimmerAt && sledD < SKIM_MOUNT_RANGE) {
        live.skimmerAt = null;
        mountSkimmer();
        return;
      }
      if (!live.skimmerAt && shipD < SKIM_DEPLOY_RANGE) {
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

  const active = nearStream.active ? nearStream : farStream.active ? farStream : null;
  if (active) {
    if (streamStep(active, p, STREAM_MS_BUDGET)) {
      streamCommit(active);
      const which = active === nearStream ? 'near' : 'far';
      for (const d of allSites) d.y = heightAt(p, tr, d.x, d.z);
      for (const l of landmarks) l.y = heightAt(p, tr, l.x, l.z);
      for (const sd of settlements) sd.y = heightAt(p, tr, sd.x, sd.z);
      for (const vg of vignettes) vg.y = heightAt(p, tr, vg.x, vg.z);
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
    const cap = half * 0.15;
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
  const shipD = Math.hypot(live.pos.x - SHIP_PARK.x, live.pos.z - SHIP_PARK.z);
  if (shipD < BOARD_RANGE + 2) {
    const cargo = live.samples > 0 ? ` · bank ${live.samples} samples` : '';
    live.prompt = { verb: 'board', label: `stow the skimmer · board the runabout${cargo}` };
    live.scanning = false;
    if (surfaceInput.engage) beginTakeoff();
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
  } else {
    live.scanning = false;
    live.scanCharge = Math.max(0, live.scanCharge - dt * 2);
  }
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
      Math.hypot(live.pos.x - SHIP_PARK.x, live.pos.z - SHIP_PARK.z) < SKIM_DEPLOY_RANGE
    ) {
      live.skimPrompt = 'deploy the survey skimmer';
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
  const shipD = Math.hypot(live.pos.x - SHIP_PARK.x, live.pos.z - SHIP_PARK.z);
  const boardable = shipD < BOARD_RANGE;

  if (boardable) {
    const cargo = live.samples > 0 ? ` · bank ${live.samples} samples` : '';
    live.prompt = { verb: 'board', label: `board the runabout${cargo}` };
    live.scanning = false;
    if (surfaceInput.engage) beginTakeoff();
    return;
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

  // Nothing in reach: the engage key charges the field pulse instead. One
  // held breath and every site within range reports to the compass. The
  // range is the weather's to bend — dust chokes it, storms feed it — and
  // buried seams answer no pulse until the dust has moved them into the sun.
  // The biologger rides the same pulse: ambient life answers wherever it
  // lives, vignettes answer from inside the radius.
  if (surfaceInput.engage) {
    live.scanning = true;
    live.scanCharge += dt / FIELD_SCAN_SECONDS;
    if (live.scanCharge >= 1) {
      live.scanCharge = 0;
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
  } else {
    live.scanning = false;
    live.scanCharge = Math.max(0, live.scanCharge - dt * 2);
  }
}

// ————— Camera —————

const CAM_EUL = new Euler(0, 0, 0, 'YXZ');
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
    camera.lookAt(SHIP_PARK.x, lookY + 6 + alt * 0.04, SHIP_PARK.z);
    camera.rotateZ(Math.sin(t * 1.7) * live.shake * 0.02);
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
    detach: () => detachInput?.(),
  };
}
