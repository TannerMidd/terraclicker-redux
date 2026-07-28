/**
 * Manual flight: take the helm of the company runabout and fly the universe
 * you built, first person. Mirrors navControl.ts — mutable module state,
 * written by input handlers, integrated by CameraRig's flight branch every
 * frame. Purely a camera mode: nothing here touches the save, and every
 * landmark it names is derived from the same seeded layout as the scene.
 *
 * The physics is deliberately arcade: velocity chases a desired vector
 * (exponential approach — stable at any dt, no tuning drag against thrust),
 * the speed cap grows with distance from home so the planet feels like a
 * place and the cosmic web feels like a commute, and turning banks the hull
 * because it is more fun when turning banks the hull.
 */
import { Euler, Quaternion, Vector3, type Camera, type PerspectiveCamera } from 'three/webgpu';
import { useUiBus } from '../fx/uiBus';
import { actions, useGame } from '../../state/store';
import {
  BAND_DISTANCES,
  BAND_STOPS,
  CURRENT_SYSTEM_ANCHOR,
  GALAXY_REVEAL_FAR,
  GALAXY_REVEAL_NEAR,
  GALAXY_R,
  SYSTEM_ORBIT_Y,
  SYSTEM_ORBIT_Z,
  SYSTEM_REVEAL_FAR,
  SYSTEM_REVEAL_NEAR,
  SYSTEM_DETAIL_R,
  SYSTEM_STAR_SHELL,
  WEB_R,
  bandAt,
  detailWorldRadius,
  detailWorldShell,
  focusSeat,
  galaxyPosition,
  heroMoons,
  heroWorldRadius,
  heroWorldShell,
  orbitSlot,
  systemOrbitOffset,
} from './universeLayout';
import {
  boardRange,
  deepFieldSites,
  hasJumpDrive,
  hullShell,
  isBoarded,
  isDiscovered,
  jumpStandoff,
  scanSecondsFor,
  sensorRange,
  sitePositionAt,
  thrustMult,
  type DeepFieldSite,
} from '../../engine/deepField';
import {
  deterrentPower,
  isCarrying,
  isProspected,
  isSeamId,
  massFactor,
  rigLimit,
  rigsStanding,
  seamAsLandmark,
  seamSites,
} from '../../engine/freight';
import { SEAM_BY_ID } from '../../content/freight';
import { rumouredSites } from '../../engine/subEtha';
import { pinnedWaypoint, waypointId, waypoints, type WaypointRef } from '../../engine/waypoints';
import { handlingFor } from '../../engine/handling';
import { loadoutEffects } from '../../engine/loadouts';
import { autopilotCommand, type AutopilotCommand, type AutopilotPhase } from '../../engine/autopilot';
import { solveNav, type NavSolution } from '../../engine/navigation';
import {
  flightPrefs,
  readAxes,
  readPad,
  saveFlightPrefs,
  type FlightAction,
  type FlightCameraMode,
} from './flightBindings';
import { C } from '../../content/constants';
import { SORTIE_FLAG } from '../../content/firstSortie';
import { attendable } from '../../engine/bridge';
import type { PlanetType } from '../../engine/types';
import type { WorldSize } from './universeLayout';
import { starColor } from './universeLayout';
import { SUN_DIR } from './Planet';
import { isLandableType, landingRefusal } from '../../engine/groundfall';
import { weatherAt, WEATHER_LABEL } from '../../engine/weather';
import { openRequestsAt } from '../../engine/bridge';
import { standingOf } from '../../engine/situations';
import { worldRecord, worldTraits } from '../../engine/worldRecords';
import { beginGroundfall, entryProgress, stepSurface, surfaceLive } from './surface/surfaceControl';
import {
  SETTLEMENT_CLOSEUP_MULT,
  settlementApproach,
  settlementCharacter,
  settlementRoster,
  settlementShownCount,
  settlementSpecOf,
} from '../../engine/settlements';
import { PLANET_RADIUS_M } from './surface/terrainField';
import { worldSpins } from './navControl';
import type { GroundfallSession } from '../fx/uiBus';

// ————— Tuning —————

/**
 * Journey camera distances at each band stop. Derived from the layout rather
 * than copied, so retuning the scale hierarchy cannot leave the helm mapping
 * range onto the wrong band.
 */
const DIST_STOPS = BAND_DISTANCES;

const BASE_CAP = 1.15; // u/s at the planet's doorstep
const DIST_K = 0.16; // cap growth per unit of distance from origin
const CAP_MAX = 90;
const BOOST_MULT = 3.1;
const BOOST_CAP = 260;
const RESP_THRUST = 2.4; // velocity approach rates (1/s)
const RESP_BRAKE = 4.2;
const RESP_COAST = 0.33; // release the keys and the runabout coasts
/**
 * Station-keeping, which is slower than a brake and much faster than a coast:
 * the console steadying the ship while it works, not the pilot standing on
 * the pedal. See the hold in stepFlight for why it exists at all.
 */
const RESP_HOLD = 1.8;
/**
 * Comfort tuning. Manual flight made a tester motion-sick, and three things
 * were doing it:
 *
 *  - The pointer's POSITION set a permanent turn rate, so unless the mouse
 *    sat exactly at screen centre the ship rotated forever and there was no
 *    way to simply fly straight. That is fixed in the input layer: steering
 *    is now hold-to-steer with the stick centred where you pressed.
 *  - The camera banked hard into every turn. A rolling horizon is one of the
 *    most reliable ways to make somebody ill; the bank is now a hint.
 *  - Turn rates were fast enough to whip the whole starfield across the view.
 */
const YAW_RATE_MAX = 0.85; // rad/s at full deflection (was 1.5)
const PITCH_RATE_MAX = 0.6; // (was 1.05)
const RATE_RESP = 5;
const PITCH_LIMIT = 1.32; // arcade: no loops, no gimbal regret
const ROLL_BANK = 0.1; // visual roll per rad/s of yaw (was 0.42)
const ROLL_RESP = 3.4; // slower in, and it self-levels the moment you let go
const STEER_DEADZONE = 0.1;
const SOFT_WALL = WEB_R * 1.35; // beyond this, space politely pushes back
const HARD_WALL = WEB_R * 1.7;
const SCAN_EVERY = 0.2; // landmark + modal sweep cadence (s)
const REVEAL_HANDOFF_MARGIN = 0.08;
/** How long a lock may flicker out before the sweep it held is written off. */
const SCAN_GRACE = 0.7;

export const FLIGHT_FOV_BASE = 42;

// ————— The Deep Field: sensors, scanning, boarding —————

// ————— Solid bodies (the things you must not fly through) —————

/**
 * Flying straight through your own planet is the single loudest way to tell
 * the player they are the size of a planet. These are the shells the
 * runabout respects — the world at origin, the star its current system is
 * assembling around, and every formed system's star.
 *
 * Galaxies are deliberately absent: they are mostly empty space and flying
 * through one is correct.
 */
/** Collision shell of a moon, as a multiple of its actual rendered radius. */
const MOON_SHELL = 1.12;

/**
 * The approach governor, and the single biggest lever on how big a planet
 * feels.
 *
 * Nothing communicates "you are the size of this thing" faster than crossing
 * it in a second. At the old surface floor of 1.15 u/s you circled an entire
 * world in under five seconds, which is a speed that makes sense only if the
 * ship is a moon. A solo runabout should take a minute or so to cross a
 * hemisphere, so the floor at the surface is now a crawl and the ceiling
 * opens up quickly with height — you are back to commuting speed a couple of
 * radii out, and nothing about long-distance travel gets slower.
 */
const SURFACE_CAP = 0.085;
/**
 * The comfort limit that actually matters near a body is not linear speed —
 * it is how fast the surface sweeps across the view. Bound the ANGULAR rate
 * about whatever you are closest to and the optical flow stays calm at every
 * altitude automatically: creeping over a surface, unhurried in low orbit,
 * and back to commuting speed once the body is far enough away to be small.
 */
const OMEGA_MAX = 0.16; // rad/s about the nearest body

/** What the surface needs to know about a world you could stand on. */
export interface LandableWorld {
  key: string;
  name: string;
  seed: number;
  type: PlanetType;
  size: WorldSize;
  hero: boolean;
  /** Unique across every commission — the key into the world's records. */
  lifetimeIndex: number;
  /** Seed of the system's first world — the star's colour convention. */
  starSeed: number;
  /** The star this world orbits, or null for the hero (global sun). */
  starSeat: Vector3 | null;
}

export interface FlightBody {
  label: string;
  /** Fixed seat, or the anchor an orbiting world circles. */
  pos: Vector3;
  radius: number;
  /**
   * Present for anything that orbits. General enough for both shapes in the
   * scene: settled worlds (a tilted circle) and the hero planet's moons
   * (a circle with a slow vertical wobble).
   */
  orbit: {
    xAmp: number;
    yAmp: number;
    zAmp: number;
    /** Vertical cycles per horizontal one — moons wobble at 0.7. */
    yFreq: number;
    phase: number;
    speed: number;
  } | null;
  /** Set for worlds a shore party could visit; absent for moons and stars. */
  land?: LandableWorld;
}

/** The tilted circle every settled world rides. */
function worldOrbit(r: number, phase: number, speed: number): FlightBody['orbit'] {
  return { xAmp: r, yAmp: r * SYSTEM_ORBIT_Y, zAmp: r * SYSTEM_ORBIT_Z, yFreq: 1, phase, speed };
}

const bodies: FlightBody[] = [];

function pushBody(
  i: number,
  label: string,
  p: Vector3,
  radius: number,
  orbit: FlightBody['orbit'] = null,
  land?: LandableWorld,
): void {
  const slot = bodies[i];
  if (slot) {
    slot.label = label;
    slot.pos.copy(p);
    slot.radius = radius;
    slot.orbit = orbit;
    slot.land = land;
  } else {
    bodies[i] = { label, pos: p.clone(), radius, orbit, land };
  }
}

/** The solids the helm is currently respecting (tests and the dev hook). */
export function flightBodies(): readonly FlightBody[] {
  return bodies;
}

/** Where a body actually is at scene time `t`. */
export function bodyPosition(body: FlightBody, t: number, out: Vector3): Vector3 {
  if (!body.orbit) return out.copy(body.pos);
  const o = body.orbit;
  const a = o.phase + t * o.speed;
  return out.set(
    body.pos.x + Math.cos(a) * o.xAmp,
    body.pos.y + Math.sin(a * o.yFreq) * o.yAmp,
    body.pos.z + Math.sin(a) * o.zAmp,
  );
}

/** Half-angle off boresight within which a contact can be locked (rad). */
const LOCK_CONE = 0.3;
/**
 * How much wider the cone gets for a contact you are already scanning.
 *
 * Acquiring a lock should take aim; KEEPING one should not take a steady
 * hand for the whole sweep. Without this the hull settling under you — the
 * last of an approach bleeding off, which is the state you are always in when
 * you arrive somewhere — walks the target out of a 0.3 cone in well under a
 * second and takes the sweep with it. Same hysteresis as the near-system
 * reveal, for the same reason: a border you are sitting on must not flicker.
 */
const LOCK_STICK = 0.22;
/** Hold still-ish to board: above this speed the airlock declines. */
const BOARD_SPEED = 4.5;

// ————— Live state —————

export interface FlightNearest {
  label: string;
  kind: 'planet' | 'assembling' | 'system' | 'galaxy';
  d: number;
}

/** One Deep Field landmark as the sensors currently see it. */
export interface FlightContact {
  id: string;
  /** The Sub-Etha pointed at this one — it reads at extended range. */
  rumoured: boolean;
  /** The authored contact used by the induction. */
  training: boolean;
  /** Resolved name, or the catalogue's pre-scan description. */
  label: string;
  kind: string;
  d: number;
  /** Unsigned radians off boresight, used for lock scoring. */
  off: number;
  /** Signed horizontal and vertical errors from the current heading. */
  bearing: number;
  elevation: number;
  scanned: boolean;
  boarded: boolean;
  /** Within the boarding envelope right now. */
  inRange: boolean;
  unreachable: boolean;
}

export interface FlightPrompt {
  verb: 'scan' | 'board' | 'jump' | 'land';
  /** The verb shown after the real bound control. */
  label: string;
  /** Holding is meaningful for scans; boarding and jump are deliberate presses. */
  hold: boolean;
  /** Present when no input can currently complete the verb. */
  blocked?: string;
}

export const flightLive = {
  /** True once the rig has captured a starting pose. */
  active: false,
  pos: new Vector3(),
  vel: new Vector3(),
  yaw: 0,
  pitch: 0,
  /** Visual bank, eased from the turn rate. */
  roll: 0,
  yawRate: 0,
  pitchRate: 0,
  /** Current |vel| and the no-boost cap at this range, for the HUD gauges. */
  speed: 0,
  cap: BASE_CAP,
  /** 0–1 blend of how engaged the boost is (drives FOV + streaks). */
  boostBlend: 0,
  /** Control authority ramps in over the first half second. */
  ramp: 0,
  /** A modal is open — inputs idle, the runabout holds station. */
  paused: false,
  /** Wall-clock of the last landmark sweep. */
  scanAt: -1,
  nearest: null as FlightNearest | null,
  /** Past the soft wall, the Guide has opinions. */
  beyond: false,

  // — Deep Field —
  /** Everything the sensors hold right now, nearest first. */
  contacts: [] as FlightContact[],
  /** The contact currently under the reticle, if any. */
  locked: null as FlightContact | null,
  /** 0–1 progress of the held scan on `locked`. */
  scanProgress: 0,
  /** The id `scanProgress` belongs to — a new lock restarts the sweep. */
  scanId: null as string | null,
  /** What holding the engage key would do right now. */
  prompt: null as FlightPrompt | null,
  /** The console has the helm and is holding the ship still (drives the HUD). */
  station: false,
  /** Wall-clock of the last jump, for the FX flash. */
  jumpNonce: 0,
  /** Sensor reach this frame (refit-derived), for the HUD. */
  range: 22,
  /** Nearest solid body and height above its surface — scale, made legible. */
  altitude: Infinity,
  altitudeOf: '' as string,
  /** Radius of the body `altitude` is measured against — the angular cap. */
  nearRadius: 0,
  /** Scene clock, for evaluating orbiting bodies where they actually are. */
  clock: 0,
  /** Whether the pilot is seated under the canopy or following the hull. */
  cameraMode: 'cockpit' as FlightCameraMode,

  // — Civil Navigation, Provisional —
  /**
   * The pinned waypoint solved against the current pose, or null when nothing
   * is pinned (or the pin has gone stale, which the registry handles by
   * resolving to nothing rather than by pointing at a hole).
   */
  nav: null as NavSolution | null,
  /** Label of whatever `nav` refers to, for the cockpit readout. */
  navLabel: '',
  /** Compatibility name for the destination autopilot's engaged state. */
  courseHold: false,
  /** What the destination computer is doing right now. */
  autopilotPhase: 'off' as AutopilotPhase | 'off',
  /** Arrival envelope of the resolved waypoint, in world units. */
  navArrivalRadius: 5,
};

/** Player intent, written by input handlers (or tests), read by stepFlight. */
export const flightInput = {
  thrust: 0, // 0..1
  brake: 0,
  strafe: 0, // -1..1, +right
  vert: 0, // -1..1, +up
  boost: false,
  /** Steering deflection, -1..1 each axis, +right / +down (screen space). */
  steerX: 0,
  steerY: 0,
  /** Wheel-set cruise throttle: a floor under `thrust`. */
  cruise: 0,
  /** Holding the engage key: scans, then boards. */
  engage: false,
  /** Tapped the jump key this frame (consumed by stepFlight). */
  jump: false,
  /** Holding the dispersal field key. */
  deter: false,
  /** Which way the steering keys are pressed, -1..1. Ramped by stepFlight. */
  keyYaw: 0,
  keyPitch: 0,
};

/**
 * Keyboard steering, smoothed.
 *
 * A key that instantly commands the maximum turn rate is the difference
 * between flying and being thrown, so the deflection ramps in — and ramps
 * back out on release, which self-levels the ship without the pilot doing
 * anything about it. 4/s reaches useful authority in a quarter second and
 * full deflection in about one, which reads as a ship rather than a switch.
 */
const KEY_STEER_RATE = 4;
let keySteerX = 0;
let keySteerY = 0;

const EUL = new Euler(0, 0, 0, 'YXZ');
const Q = new Quaternion();
const FWD = new Vector3();
const RIGHT = new Vector3();
const DESIRED = new Vector3();
const TMP = new Vector3();
const HIERARCHY_GALAXY_SEAT = new Vector3();
const HIERARCHY_SYSTEM_SEAT = new Vector3();
let hierarchyGalaxySeatValid = false;
let hierarchySystemSeatValid = false;
const CAMERA_DESIRED = new Vector3();
const CAMERA_BODY = new Vector3();
const CAMERA_NORMAL = new Vector3();
const CAMERA_TANGENT = new Vector3();
const CAMERA_LOOK = new Vector3();
const CHASE_PULLBACK = 0.8;
const UP = new Vector3(0, 1, 0);

/** Map camera distance from origin onto the journey's 0–1 zoom, so every
 * zoom-keyed fade (stars, cosmic web, captions) behaves in flight. */
export function zoomForDistance(dist: number): number {
  if (dist <= DIST_STOPS[0]!) return 0;
  if (dist >= DIST_STOPS[DIST_STOPS.length - 1]!) return 1;
  let i = 0;
  while (i < DIST_STOPS.length - 2 && dist > DIST_STOPS[i + 1]!) i++;
  const a = DIST_STOPS[i]!;
  const b = DIST_STOPS[i + 1]!;
  return BAND_STOPS[i]! + ((dist - a) / (b - a)) * (BAND_STOPS[i + 1]! - BAND_STOPS[i]!);
}

/** Speed cap at a given distance from home (before boost). */
export function speedCapAt(dist: number): number {
  return Math.min(CAP_MAX, BASE_CAP + dist * DIST_K);
}

/**
 * Select the nearest reveal while retaining enter/exit hysteresis.
 *
 * The current target remains mounted inside its wider exit volume, but an
 * overlapping target may take over once it is nearer by a small margin. That
 * margin prevents boundary noise without making the first target sticky.
 */
export function selectRevealCandidate(
  current: number | null,
  currentDistance: number,
  currentFar: number,
  nearest: number | null,
  nearestDistance: number,
  nearestNear: number,
  marginRatio = REVEAL_HANDOFF_MARGIN,
): number | null {
  const currentValid = current !== null && currentDistance <= currentFar;
  const nearestValid = nearest !== null && nearestDistance <= nearestNear;
  if (!currentValid) return nearestValid ? nearest : null;
  if (!nearestValid || nearest === current) return current;
  const margin = Math.max(0, Math.min(currentFar, nearestNear) * marginRatio);
  return nearestDistance + margin < currentDistance ? nearest : current;
}

/**
 * A revealed member system owns the galaxy context. Sensor volumes overlap,
 * so an independently nearer galaxy must not mount around the wrong system.
 */
export function parentGalaxyReveal(
  systemIndex: number | null,
  galaxyCount: number,
  fallback: number | null,
): number | null {
  if (systemIndex === null || systemIndex < 0) return fallback;
  if (systemIndex >= galaxyCount * C.SYSTEMS_PER_GALAXY) return fallback;
  return Math.floor(systemIndex / C.SYSTEMS_PER_GALAXY);
}

/**
 * Smoothly lowers the cruise ceiling while large hierarchy layers resolve.
 * Candidate seats are refreshed by the 5 Hz surroundings scan; the 60 Hz
 * physics path only measures two preallocated vectors.
 */
function hierarchyApproachCap(): number {
  let cap = Infinity;
  const easedCap = (distance: number, inner: number, outer: number, innerCap: number, outerCap: number) => {
    if (distance >= outer) return Infinity;
    const u = Math.max(0, Math.min(1, (distance - inner) / Math.max(1e-3, outer - inner)));
    const smooth = u * u * (3 - 2 * u);
    return innerCap + (outerCap - innerCap) * smooth;
  };
  if (hierarchyGalaxySeatValid) {
    const distance = flightLive.pos.distanceTo(HIERARCHY_GALAXY_SEAT);
    cap = Math.min(cap, easedCap(distance, GALAXY_R * 1.4, GALAXY_R * 3.2, 32, 80));
  }
  if (hierarchySystemSeatValid) {
    const distance = flightLive.pos.distanceTo(HIERARCHY_SYSTEM_SEAT);
    cap = Math.min(cap, easedCap(distance, SYSTEM_DETAIL_R * 1.1, SYSTEM_REVEAL_FAR, 6, 18));
  }
  return cap;
}

/** Steering curve: dead zone, then quadratic response for fine aim. */
function steerCurve(v: number): number {
  const a = Math.abs(v);
  if (a <= STEER_DEADZONE) return 0;
  const k = Math.min(1, (a - STEER_DEADZONE) / (1 - STEER_DEADZONE));
  return Math.sign(v) * k * k;
}

const TUTORIAL_LAUNCH_RADIUS = 3.2;
const TUTORIAL_DIR = new Vector3();

/** One deterministic, reachable landmark used by every induction step. */
export function firstSortieTargetId(): string | null {
  const seed = useGame.getState().s.seed;
  let nearest: DeepFieldSite | null = null;
  let distance = Infinity;
  for (const site of sitesForSeed(seed)) {
    if (isSeamId(site.def.id) || site.def.unreachable) continue;
    const d = Math.hypot(site.pos[0], site.pos[1], site.pos[2]);
    if (d < distance) {
      nearest = site;
      distance = d;
    }
  }
  return nearest?.def.id ?? null;
}

/** Put a new pilot outside the collision shell with home behind and the lesson ahead. */
export function restartFirstSortieFlight(): boolean {
  const id = firstSortieTargetId();
  const site = id ? sitesForSeed(useGame.getState().s.seed).find((candidate) => candidate.def.id === id) : null;
  if (!site) return false;
  TUTORIAL_DIR.set(site.pos[0], site.pos[1], site.pos[2]).normalize();
  const start = TUTORIAL_DIR.clone().multiplyScalar(TUTORIAL_LAUNCH_RADIUS);
  const toward = new Vector3(site.pos[0], site.pos[1], site.pos[2]).sub(start).normalize();
  beginFlightAt(
    start,
    Math.atan2(-toward.x, -toward.z),
    Math.asin(Math.max(-1, Math.min(1, toward.y))),
  );
  return true;
}

/** Begin flight from the camera, except for the authored first launch. */
export function beginFlightFromCamera(camera: Camera): void {
  if (!useGame.getState().s.flags[SORTIE_FLAG] && restartFirstSortieFlight()) return;
  // A journey camera at the galaxy or cosmic-web bands is an observation
  // platform, not a plausible place to have parked the runabout. Launch from
  // home instead of materialising hundreds of units into empty space.
  const broadView = camera.position.length() > BAND_DISTANCES[1]! * 1.55;
  if (broadView) {
    const st = useGame.getState().s;
    const pin = pinnedWaypoint(st);
    if (pin && resolveWaypoint(st, pin.ref, TMP) && TMP.lengthSq() > 1e-5) {
      TUTORIAL_DIR.copy(TMP).normalize();
      const start = TUTORIAL_DIR.clone().multiplyScalar(TUTORIAL_LAUNCH_RADIUS);
      const toward = TMP.clone().sub(start).normalize();
      beginFlightAt(
        start,
        Math.atan2(-toward.x, -toward.z),
        Math.asin(Math.max(-1, Math.min(1, toward.y))),
      );
      return;
    }
    // The built universe lies predominantly down -Z. Start on that side of
    // home and face outward, clear of the hero world's collision shell.
    beginFlightAt(TMP.set(0, 0, -TUTORIAL_LAUNCH_RADIUS), 0, 0);
    return;
  }
  camera.getWorldDirection(FWD);
  beginFlightAt(camera.position, Math.atan2(-FWD.x, -FWD.z), Math.asin(Math.max(-1, Math.min(1, FWD.y))));
}

/** Begin flight from an explicit pose (tests, dev hook). */
export function beginFlightAt(pos: Vector3, yaw: number, pitch: number): void {
  const f = flightLive;
  f.active = true;
  f.pos.copy(pos);
  f.vel.set(0, 0, 0);
  f.yaw = yaw;
  f.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  f.roll = 0;
  f.yawRate = 0;
  f.pitchRate = 0;
  f.speed = 0;
  f.boostBlend = 0;
  f.ramp = 0;
  f.paused = false;
  f.scanAt = -1;
  f.nearest = null;
  f.beyond = false;
  f.contacts = [];
  f.locked = null;
  f.scanProgress = 0;
  f.scanId = null;
  f.prompt = null;
  f.station = false;
  f.cameraMode = flightPrefs().cameraMode;
  f.courseHold = false;
  f.autopilotPhase = 'off';
  autopilotTargetKey = '';
  scanLostFor = 0;
  entryArm = 0;
  hierarchyGalaxySeatValid = false;
  hierarchySystemSeatValid = false;
  f.altitude = Infinity;
  f.altitudeOf = '';
  f.nearRadius = 0;
  flightInput.cruise = 0;
  flightInput.engage = false;
  flightInput.jump = false;
  engageWasDown = false;
}

export function endFlight(): void {
  flightLive.active = false;
  flightInput.cruise = 0;
}

/**
 * One physics step. `t` is the scene clock (seconds); dt is already clamped
 * by the caller. Writes pos/orientation into flightLive; the rig copies them
 * onto the camera.
 */
export function stepFlight(dt: number, t: number): void {
  // Keyboard events update immediately; pads and HOTAS devices must be sampled
  // every frame or every control stays frozen until an unrelated key is used.
  pollGamepad();
  const f = flightLive;
  const input = flightInput;
  f.clock = t;
  f.ramp = Math.min(1, f.ramp + dt * 2);
  // Equipment, chart, and modal overlays are real pauses. Derive this every
  // frame so opening one cannot leave up to a sensor-sweep of silent drift.
  f.paused = flightUiPaused();

  // Housekeeping sweep: landmarks and near-system reveal.
  if (f.scanAt < 0 || t - f.scanAt >= SCAN_EVERY) {
    f.scanAt = t;
    scanSurroundings();
  }
  solveNavThisFrame();
  if (f.paused) {
    f.station = false;
    // Consume press-like actions while an overlay owns the controls.
    engageWasDown = input.engage;
    input.jump = false;
    return;
  }
  // Any actual helm command takes the ship back immediately. Engage/jump and
  // the dispersal field are deliberately absent: a passenger can operate a
  // console while the navigator keeps flying.
  if (f.courseHold && manualOverrideRequested()) {
    disengageAutopilot('manual');
  }
  const autopilot = commandAutopilot();
  applyKeySteering(dt);

  const authority = f.ramp;

  // Steering → turn rates → orientation. Roll is cosmetic bank.
  const expeditionNow = useGame.getState().s.expedition;
  const turn = handlingFor(expeditionNow).turnMult * loadoutEffects(expeditionNow).agility;
  const steerX = autopilot?.steerX ?? input.steerX;
  const steerY = autopilot?.steerY ?? input.steerY;
  // A physical stick needs its fine-aim dead zone; a closed-loop controller
  // does not. Feeding autopilot corrections through the quadratic stick curve
  // made it asymptote at the dead-zone edge and spend minutes "aligning".
  const yawSteer = autopilot ? steerX : steerCurve(steerX);
  const pitchSteer = autopilot ? steerY : steerCurve(steerY);
  const yawTarget = -yawSteer * YAW_RATE_MAX * authority * turn;
  const pitchTarget = -pitchSteer * PITCH_RATE_MAX * authority * turn;
  const rateK = 1 - Math.exp(-dt * RATE_RESP);
  f.yawRate += (yawTarget - f.yawRate) * rateK;
  f.pitchRate += (pitchTarget - f.pitchRate) * rateK;
  f.yaw += f.yawRate * dt;
  f.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, f.pitch + f.pitchRate * dt));
  // Horizon lock: the bank is cosmetic, and a rolling horizon is one of the
  // most reliable ways to make somebody motion-sick. Anyone who still finds
  // the reduced bank unpleasant can have none of it at all.
  const bank = flightPrefs().horizonLock ? 0 : 1;
  const rollTarget = bank * (-f.yawRate * ROLL_BANK - input.strafe * authority * 0.1);
  f.roll += (rollTarget - f.roll) * (1 - Math.exp(-dt * ROLL_RESP));

  // Thrust: velocity chases the desired vector; the cap breathes with range.
  EUL.set(f.pitch, f.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  RIGHT.set(1, 0, 0).applyQuaternion(Q);
  const dist = f.pos.length();
  const gameState = useGame.getState().s;
  const expedition = gameState.expedition;
  const rangeCap = speedCapAt(dist) * thrustMult(expedition);
  const hierarchyCap = hierarchyApproachCap();
  /**
   * The approach governor. Range alone set the ceiling before, so a star
   * fifteen units from home was approached at the same speed as open space
   * and went past in a blink — which is precisely how a planet stops feeling
   * like a planet. Tie the ceiling to height above the nearest SURFACE and
   * arriving somewhere becomes an arrival: you slow as it fills the glass.
   * Boost cannot buy its way out of this one; it only lifts the range cap.
   */
  /**
   * The angular limit has to RELEASE with range, or it throttles open space:
   * a planet forty units astern is a dot, sweeping past it says nothing to
   * the inner ear, and yet a plain `ω × distance` cap would still be holding
   * the throttle down out there. So it only bites inside ten radii of
   * whatever you are near, and relaxes sharply across that span — a crawl on
   * the surface, unhurried in low orbit, and gone by the time the body is
   * small in the window.
   */
  const bodyDist = Math.max(0, f.altitude) + f.nearRadius;
  const vicinity = Math.max(1e-3, f.nearRadius * 10);
  const near01 = Math.min(1, bodyDist / vicinity);
  const relax = 1 + near01 * near01 * near01 * near01 * 40;
  const approachCap = Math.max(SURFACE_CAP, OMEGA_MAX * bodyDist * relax);
  f.cap = Math.min(rangeCap, approachCap, hierarchyCap);
  const boosting = (autopilot?.boost ?? input.boost) && authority > 0;
  f.boostBlend += ((boosting ? 1 : 0) - f.boostBlend) * (1 - Math.exp(-dt * 4));
  const cap = Math.min(
    (boosting ? Math.min(rangeCap * BOOST_MULT, BOOST_CAP) : rangeCap)
      // A courier is stripped for speed; a hauler is not. The role never
      // touches the approach governor, so nothing here can make a body easier
      // to fly into.
      * loadoutEffects(useGame.getState().s.expedition).speed,
    approachCap,
    hierarchyCap,
  );

  /**
   * Station-keeping, and the reason the engage key stopped fighting the ship.
   *
   * A scan is a held gesture and the runabout coasts, so "hold engage on that
   * contact" used to mean "hold engage, and brake, and hope": whatever drift
   * you carried in kept running underneath you — sideways out of the lock
   * cone, or downward away from the thing you were pointed at — until a sweep
   * three seconds deep was simply gone. Two controls for one intention, which
   * is one too many.
   *
   * So the console takes the helm while it works. It only does so with your
   * hands off, which is what keeps this a convenience rather than a fight:
   * command anything at all — thrust, slide, rise, brake — and the pilot wins
   * outright and the hold does not exist.
   */
  const commandedThrust = autopilot?.thrust ?? input.thrust;
  const commandedBrake = autopilot?.brake ?? input.brake;
  const commanding =
    commandedThrust > 0 || input.strafe !== 0 || input.vert !== 0 || commandedBrake > 0;
  // A sweep in progress keeps the helm held even in the instant the lock has
  // flickered out — that instant is exactly when letting go would cost it.
  const working = f.prompt !== null || f.scanProgress > 0;
  const station = input.engage && !commanding && authority > 0 && working;
  // Asking for a scan takes the throttle floor off, exactly as braking does —
  // otherwise cruise trim quietly holds the ship away from its own station.
  if (station) input.cruise = 0;
  f.station = station;

  const thrust = Math.max(commandedThrust, autopilot ? 0 : input.cruise) * authority;
  const braking = commandedBrake * authority;
  DESIRED.set(0, 0, 0)
    .addScaledVector(FWD, thrust)
    .addScaledVector(RIGHT, input.strafe * authority * 0.5)
    .addScaledVector(UP, input.vert * authority * 0.45);
  const engaged = DESIRED.lengthSq() > 1e-6;
  if (engaged) DESIRED.multiplyScalar(cap);

  // Cargo is mass, and mass is the whole hauling mechanic: a loaded hold
  // does not cap your speed, it slows how fast you reach or shed it. The
  // proximity governor consequently needs more room to save you, which is
  // exactly the tension a freight run is supposed to have. An empty ship
  // divides by 1 and flies as it always did.
  const heft = massFactor(useGame.getState().s.expedition);
  // Special Handling: the hold is felt through the stick, not read in a panel.
  // A fragile load resists being hurried in BOTH directions, which is why this
  // multiplies the response rather than the speed cap.
  const hold = handlingFor(useGame.getState().s.expedition);
  const resp =
    ((braking > 0 ? RESP_BRAKE : engaged ? RESP_THRUST : station ? RESP_HOLD : RESP_COAST) / heft)
    * hold.responseMult;
  if (braking > 0) DESIRED.set(0, 0, 0);
  f.vel.lerp(DESIRED, 1 - Math.exp(-dt * resp));

  // The soft wall: outward momentum fades, so the edge feels like tar, not glass.
  f.beyond = dist > SOFT_WALL;
  if (f.beyond && dist > 1e-6) {
    TMP.copy(f.pos).divideScalar(dist);
    const outward = f.vel.dot(TMP);
    if (outward > 0) {
      const squash = Math.min(1, (dist - SOFT_WALL) / (HARD_WALL - SOFT_WALL));
      f.vel.addScaledVector(TMP, -outward * squash * Math.min(1, dt * 6));
    }
  }

  // Where the hull was before this frame's travel — the swept collision test
  // needs the whole path, not just the endpoint.
  PREV.copy(f.pos);
  f.pos.addScaledVector(f.vel, dt);
  if (f.pos.length() > HARD_WALL) f.pos.setLength(HARD_WALL);
  f.speed = f.vel.length();

  stepDeepField(dt, FWD, authority > 0);
  stepInterdiction(useGame.getState().s, dt);
}

// ————— The Deep Field: lock, scan, board, jump —————

let sitesCache: { seed: number; sites: DeepFieldSite[] } | null = null;

/**
 * Everything out there the sensors can hold: the Deep Field catalogue AND the
 * mining seams, which are dressed as landmarks precisely so they inherit this
 * pipeline rather than growing a second one beside it (see seamAsLandmark).
 */
function sitesForSeed(seed: number): DeepFieldSite[] {
  if (!sitesCache || sitesCache.seed !== seed) {
    const seams: DeepFieldSite[] = seamSites(seed).map((s2) => ({
      def: seamAsLandmark(SEAM_BY_ID[s2.id]!),
      pos: s2.pos,
    }));
    sitesCache = { seed, sites: [...deepFieldSites(seed), ...seams] };
  }
  return sitesCache.sites;
}

const SITE_POS: [number, number, number] = [0, 0, 0];
const TO_SITE = new Vector3();
/** Seconds the current sweep has been without its lock (see SCAN_GRACE). */
let scanLostFor = 0;
/** Boarding, rigging, and contextual jumps require a fresh deliberate press. */
let engageWasDown = false;
/** Hull position at the start of this frame, for the swept collision test. */
const PREV = new Vector3();

/** Where a site is right now, from the runabout's point of view. */
function siteVector(site: DeepFieldSite, out: Vector3): Vector3 {
  const f = flightLive;
  sitePositionAt(site, f.pos.x, f.pos.y, f.pos.z, SITE_POS);
  return out.set(SITE_POS[0], SITE_POS[1], SITE_POS[2]);
}

function writeContact(
  out: FlightContact,
  site: DeepFieldSite,
  d: number,
  off: number,
  expedition: ReturnType<typeof useGame.getState>['s']['expedition'],
  rumoured: boolean,
): FlightContact {
  // A seam's "scanned" is its prospecting record, not the Guide catalogue.
  const seam = isSeamId(site.def.id);
  const scanned = seam
    ? isProspected(expedition, site.def.id)
    : isDiscovered(expedition, site.def.id);
  out.id = site.def.id;
  out.rumoured = rumoured;
  out.label = scanned ? site.def.name : site.def.contact;
  out.kind = site.def.kind;
  out.d = d;
  out.off = off;
  out.bearing = 0;
  out.elevation = 0;
  out.training = false;
  out.scanned = scanned;
  // A seam is never 'boarded' — you can work it again every time you come back.
  out.boarded = seam ? false : isBoarded(expedition, site.def.id);
  out.inRange = d <= boardRange(site.def.radius);
  out.unreachable = Boolean(site.def.unreachable);
  return out;
}

function blankContact(): FlightContact {
  return {
    id: '',
    rumoured: false,
    training: false,
    label: '',
    kind: '',
    d: 0,
    off: 0,
    bearing: 0,
    elevation: 0,
    scanned: false,
    boarded: false,
    inRange: false,
    unreachable: false,
  };
}

/**
 * The lock is rewritten every frame, so it gets a persistent object rather
 * than a fresh one — sixty allocations a second is exactly the kind of thing
 * that shows up later as a GC hitch and nowhere as a slow frame.
 */
const LOCKED = blankContact();

/**
 * One frame of sensor work. The contact LIST refreshes on the housekeeping
 * cadence (it only feeds a DOM readout), but the LOCK is recomputed every
 * frame — the reticle has to feel welded to the thing you are pointing at.
 */
function stepDeepField(dt: number, forward: Vector3, live: boolean): void {
  const f = flightLive;
  const st = useGame.getState().s;
  const expedition = st.expedition;
  const sites = sitesForSeed(st.seed);
  const handling = handlingFor(expedition);
  const noise = handling.sensorNoise > 0
    ? Math.sin(f.clock * 2.7 + st.seed * 0.001) * handling.sensorNoise
    : 0;
  const range = sensorRange(expedition) * (1 + noise);
  const engagePressed = flightInput.engage && !engageWasDown;
  engageWasDown = flightInput.engage;
  f.range = range;
  // Reading the channel is worth something: a landmark the Sub-Etha has
  // gossiped about is detectable from considerably further out, because you
  // know roughly what you are looking for.
  const rumoured = rumouredSites(st);
  const rangeFor = (id: string) =>
    rumoured.has(id) ? range * C.SUBETHA_RUMOUR_RANGE_MULT : range;

  cushion(sites, dt);

  // Lock: nearest contact inside the cone, preferring the one you are most
  // squarely aimed at rather than merely the closest.
  let best: DeepFieldSite | null = null;
  let bestScore = Infinity;
  let bestD = 0;
  let bestOff = 0;
  for (const site of sites) {
    siteVector(site, TO_SITE).sub(f.pos);
    const d = TO_SITE.length();
    if (d > rangeFor(site.def.id)) continue;
    TO_SITE.divideScalar(d || 1);
    const off = Math.acos(Math.max(-1, Math.min(1, TO_SITE.dot(forward))));
    // Big things forgive sloppy aim; a teapot does not. And a sweep already
    // under way holds on through a wider cone than it needed to acquire.
    const sticky = f.scanProgress > 0 && f.scanId === site.def.id ? LOCK_STICK : 0;
    const cone = LOCK_CONE + sticky + Math.atan2(site.def.radius, Math.max(d, 0.001));
    if (off > cone) continue;
    const score = off * 4 + d / range;
    if (score < bestScore) {
      bestScore = score;
      best = site;
      bestD = d;
      bestOff = off;
    }
  }

  f.locked = best
    ? writeContact(LOCKED, best, bestD, bestOff, expedition, rumoured.has(best.def.id))
    : null;
  if (f.locked) {
    f.locked.training = !st.flags[SORTIE_FLAG] && f.locked.id === firstSortieTargetId();
  }

  // Scan progress belongs to one lock — but not to the frame. A contact
  // clipping the edge of the cone for an instant, which is precisely what a
  // drifting hull does to a sweep, used to erase the whole thing with no way
  // to tell it had happened. A brief loss is now forgiven; look at something
  // else, or away for longer than the grace, and the sweep is genuinely lost.
  if (best) {
    if (f.scanId !== best.def.id) {
      f.scanId = best.def.id;
      f.scanProgress = 0;
    }
    scanLostFor = 0;
  } else if (f.scanId !== null) {
    scanLostFor += dt;
    if (scanLostFor > SCAN_GRACE) {
      f.scanId = null;
      f.scanProgress = 0;
    }
  }

  const locked = f.locked;
  if (locked && !locked.scanned && live && flightInput.engage && !f.paused) {
    const seconds = Math.max(0.25, scanSecondsFor(expedition, locked.id));
    f.scanProgress = Math.min(1, f.scanProgress + dt / seconds);
    if (f.scanProgress >= 1) {
      // Prospecting a seam and cataloguing a derelict are the same gesture
      // with different paperwork behind it.
      if (isSeamId(locked.id)) actions.prospectSeam(locked.id);
      else actions.scanSite(locked.id);
      f.scanProgress = 0;
    }
  } else if (!flightInput.engage) {
    // Release and the sweep decays rather than snapping to zero — the console
    // is meant to feel like it was working on something.
    f.scanProgress = Math.max(0, f.scanProgress - dt * 0.6);
  }

  // Boarding: close, slow, and already resolved.
  if (
    locked &&
    locked.scanned &&
    !locked.boarded &&
    !locked.unreachable &&
    locked.inRange &&
    live &&
    engagePressed &&
    !f.paused &&
    f.speed <= BOARD_SPEED
  ) {
    if (isSeamId(locked.id)) {
      // Parked on a seam: collect what the rig banked, or plant one.
      if (st.expedition.rigs[locked.id]) actions.collectRig(locked.id);
      else actions.placeRig(locked.id);
    } else {
      actions.boardSite(locked.id);
    }
  }

  // Action, status, and blocked reason are separate so the HUD never prints a
  // key beside something the key cannot do.
  f.prompt = null;
  if (locked) {
    if (!locked.scanned) {
      f.prompt = { verb: 'scan', label: 'scan', hold: true };
    } else if (!locked.unreachable && isSeamId(locked.id)) {
      const rig = expedition.rigs[locked.id];
      const seam = SEAM_BY_ID[locked.id];
      if (!locked.inRange) {
        f.prompt = hasJumpDrive(expedition)
          ? { verb: 'jump', label: 'jump to it', hold: false }
          : null;
      } else if (f.speed > BOARD_SPEED) {
        f.prompt = { verb: 'board', label: 'work it', hold: false, blocked: 'slow down to work it' };
      } else if (rig) {
        f.prompt = rig.banked >= 1
          ? { verb: 'board', label: `collect ${Math.floor(rig.banked)} salvage`, hold: false }
          : { verb: 'board', label: 'collect rig', hold: false, blocked: 'rig working — nothing banked yet' };
      } else if (rigsStanding(expedition) >= rigLimit(expedition)) {
        f.prompt = { verb: 'board', label: 'place a rig', hold: false, blocked: 'no rig bay free' };
      } else if (seam && expedition.salvage < seam.rigCost) {
        f.prompt = {
          verb: 'board',
          label: 'place a rig',
          hold: false,
          blocked: `needs ${seam.rigCost} salvage to rig`,
        };
      } else {
        f.prompt = { verb: 'board', label: `place a rig (${seam?.rigCost} salvage)`, hold: false };
      }
    } else if (!locked.unreachable && !locked.boarded) {
      f.prompt = locked.inRange
        ? f.speed > BOARD_SPEED
          ? { verb: 'board', label: 'board', hold: false, blocked: 'slow down to board' }
          : { verb: 'board', label: 'board', hold: false }
        : hasJumpDrive(expedition)
          ? { verb: 'jump', label: 'jump to it', hold: false }
          : null;
    }
  }

  // — Groundfall. A world filling the glass outranks any distant contact. —
  //
  // The envelope is generous on purpose: the approach governor has already
  // made you slow here, and the offer should arrive while the surface is a
  // landscape in the window, not a wall.
  const landBody = nearBodyRef;
  if (landBody?.land && f.altitude < landBody.radius * 0.55 + 0.3) {
    const refusal = landingRefusal(landBody.land.type);
    if (refusal) {
      f.prompt = { verb: 'land', label: `make groundfall on ${landBody.land.name}`, hold: false, blocked: refusal };
      entryArm = 0;
    } else {
      /**
       * A pilot pointing the nose at the ground and holding it there has
       * already answered the question. The dive must be DELIBERATE — most of
       * the velocity carrying inward, inside the envelope, sustained for
       * most of a second — and the console announces the commitment with
       * time to pull up, because an aborted landing should always be one
       * stick-pull away. Hovering, orbiting and sightseeing never trigger
       * it; they keep the polite engage offer instead. New pilots keep the
       * offer too: the induction flies close to home, and its first lesson
       * should not end with an unplanned continent.
       */
      bodyPosition(landBody, f.clock, TO_SITE);
      TMP.copy(f.pos).sub(TO_SITE);
      const up = TMP.length();
      if (up > 1e-6) TMP.divideScalar(up);
      const closing = -f.vel.dot(TMP);
      const diving =
        Boolean(st.flags[SORTIE_FLAG])
        && f.speed > 0.05
        && closing > f.speed * 0.55
        && f.altitude < landBody.radius * 0.5 + 0.25;
      entryArm = diving ? entryArm + dt : 0;

      // The same weather function the ground runs, asked about the ground
      // under the nose — a front over the site is worth a word on the offer,
      // because a pilot who can see the storm can choose it. Delivered
      // worlds spin on screen, so the question is asked in the RECORD frame
      // (the ground that is actually under the nose), not the world frame.
      const land = landBody.land;
      const spinNow = land.hero ? 0 : (worldSpins.get(land.lifetimeIndex) ?? 0);
      OFFER_DIR.copy(TMP).applyAxisAngle(Y_AXIS, -spinNow);
      const wAspects = land.hero
        ? {
            thermal: Math.min(1, st.planet.gauges.thermal.div(st.planet.targets.thermal).toNumber()),
            atmo: Math.min(1, st.planet.gauges.atmo.div(st.planet.targets.atmo).toNumber()),
            hydro: Math.min(1, st.planet.gauges.hydro.div(st.planet.targets.hydro).toNumber()),
            bio: Math.min(1, st.planet.gauges.bio.div(st.planet.targets.bio).toNumber()),
          }
        : { thermal: 1, atmo: 1, hydro: 1, bio: 1 };
      const siteWx = weatherAt(
        { seed: land.seed, type: land.type, aspects: wAspects, dir: [OFFER_DIR.x, OFFER_DIR.y, OFFER_DIR.z] },
        st.gameTimeMs,
      );
      const wxNote =
        siteWx.kind !== 'clear' && siteWx.intensity >= 0.3
          ? ` · ${WEATHER_LABEL[siteWx.kind]} below`
          : '';

      // An approach aimed at a settlement says so on the offer — the same
      // snap cone the autoland will honour, so the console never advertises
      // a doorstep the descent then declines to find. The offer LATCHES
      // (see doorstepOffer): the world turns faster than anybody reads, so
      // the note names the town for a grace window and the commit keeps
      // that promise however far the lights have swept on.
      let setNote = '';
      if (!land.hero) {
        const record = st.run.completedPlanets.find(
          (w) => w.lifetimeIndex === land.lifetimeIndex,
        );
        if (record) {
          const app = settlementApproach(
            settlementSpecOf(record),
            [OFFER_DIR.x, OFFER_DIR.y, OFFER_DIR.z],
            PLANET_RADIUS_M[land.size],
          );
          if (app) {
            const standing = standingOf(st, land.lifetimeIndex);
            const life = worldRecord(st, land.lifetimeIndex);
            const roster = settlementRoster(settlementSpecOf(record));
            const lit =
              app.spot.index
              < settlementShownCount(
                roster.length,
                record,
                SETTLEMENT_CLOSEUP_MULT,
                settlementCharacter(life ? worldTraits(life, standing) : []),
                standing,
              );
            doorstepOffer = {
              lifetimeIndex: land.lifetimeIndex,
              name: app.spot.name,
              dir: [app.spot.dir[0], app.spot.dir[1], app.spot.dir[2]],
              lit,
              untilClock: f.clock + OFFER_GRACE_S,
            };
          } else if (
            doorstepOffer
            && (doorstepOffer.lifetimeIndex !== land.lifetimeIndex
              || f.clock >= doorstepOffer.untilClock)
          ) {
            doorstepOffer = null;
          }
          if (doorstepOffer && doorstepOffer.lifetimeIndex === land.lifetimeIndex) {
            setNote = doorstepOffer.lit
              ? ` · the lights of ${doorstepOffer.name} below`
              : ` · ${doorstepOffer.name}, dark, below`;
          }
        }
      }

      if (entryArm > 0) {
        f.prompt = {
          verb: 'land',
          label: `atmospheric entry: ${landBody.land.name} — pull up to abort`,
          hold: false,
        };
      } else {
        f.prompt = {
          verb: 'land',
          label: `make groundfall on ${landBody.land.name}${setNote}${wxNote}`,
          hold: false,
        };
      }
      if (!f.paused && (engagePressed || entryArm >= ENTRY_ARM_SECONDS)) {
        entryArm = 0;
        commitGroundfall(landBody);
        return;
      }
    }
  } else {
    entryArm = 0;
  }

  // Jump has a dedicated binding, and contextual Engage performs the verb the
  // prompt advertises. Either path is edge-triggered.
  const wantsJump = flightInput.jump || (engagePressed && f.prompt?.verb === 'jump' && !f.prompt.blocked);
  flightInput.jump = false;
  if (wantsJump && locked && locked.scanned && hasJumpDrive(expedition) && !f.paused) {
    const target = sites.find((site) => site.def.id === locked.id);
    if (target) jumpTo(target);
  }
}

// ————— Groundfall: the handoff between the helm and the ground —————

/** Sustained-dive commitment before the entry flies itself (seconds). */
const ENTRY_ARM_SECONDS = 0.85;
/** How long the current dive has been held; any easing off resets it. */
let entryArm = 0;

/**
 * The doorstep on offer, latched. The console's settlement note is a promise
 * — the same snap cone the autoland honours — but a delivered world turns at
 * 0.35 rad/s and the cone is 0.2 rad wide, so a town crosses it in about a
 * second: less time than the dive takes to arm, let alone a pilot to read
 * the offer and act on it. (The headless rig aims and commits in the same
 * breath for exactly this reason; a person cannot.) So from the moment the
 * lights are genuinely below, the offer STANDS for a grace window, and a
 * commit inside it lands on the doorstep the console was advertising when
 * the pilot decided. Wilderness stays honest: no latch means no offer, and
 * once the grace lapses the ground under the nose is again the ground you
 * get.
 */
const OFFER_GRACE_S = 6;
let doorstepOffer: {
  lifetimeIndex: number;
  name: string;
  /** Spot direction in the RECORD frame — planet-fixed, spin-proof. */
  dir: [number, number, number];
  lit: boolean;
  untilClock: number;
} | null = null;

/** Scene context of the active descent, kept out of the serializable session. */
let entryBody: FlightBody | null = null;
const Y_AXIS = new Vector3(0, 1, 0);
const OFFER_DIR = new Vector3();
const ENTRY_DIR = new Vector3();
const ENTRY_START = new Vector3();
const ENTRY_CENTER = new Vector3();
const ENTRY_TANGENT = new Vector3();
let entryRadius = 1;

/**
 * The pilot committed. Freeze everything the surface needs into a session —
 * the landing direction, the sky, the gauges as they stand — and hand the
 * frame loop to the descent.
 */
function commitGroundfall(body: FlightBody): void {
  const f = flightLive;
  const st = useGame.getState().s;
  const land = body.land!;
  if (!isLandableType(land.type)) return;

  bodyPosition(body, f.clock, ENTRY_CENTER);
  ENTRY_DIR.copy(f.pos).sub(ENTRY_CENTER);
  if (ENTRY_DIR.lengthSq() < 1e-9) ENTRY_DIR.set(0, 1, 0);
  ENTRY_DIR.normalize();
  ENTRY_START.copy(f.pos);
  entryBody = body;
  entryRadius = body.radius;

  // A delivered world's mesh spins with its lights aboard; its record does
  // not. Un-rotate the approach (and the sun) into the record's frame, so
  // the terrain, weather and settlements the ground builds are the ones the
  // pilot was looking at when they committed. The hero world keeps Phase 2's
  // convention untouched: world-frame truth, clouds counter-rotated. The
  // dive cinematic and the return pose stay in WORLD frame (ENTRY_DIR) —
  // they belong to the scene the camera is in, not to the record.
  const spin = land.hero ? 0 : (worldSpins.get(land.lifetimeIndex) ?? 0);
  const up = new Vector3().copy(ENTRY_DIR).applyAxisAngle(Y_AXIS, -spin).normalize();

  // The latched doorstep, honoured. If the console was advertising a town
  // inside its grace window, the descent goes THERE: the record-frame spot
  // is planet-fixed, so however far the mesh has turned since the pilot
  // read the offer, the autoland delivers the doorstep it promised. The
  // whole entry frame swings with it — start, dive line and return pose —
  // so the cinematic remains the same straight descent it always was, just
  // over the town; the commit already hard-cuts to the cockpit, so the
  // vantage change lands inside an existing cut.
  if (
    !land.hero
    && doorstepOffer
    && doorstepOffer.lifetimeIndex === land.lifetimeIndex
    && f.clock < doorstepOffer.untilClock
  ) {
    up.set(doorstepOffer.dir[0], doorstepOffer.dir[1], doorstepOffer.dir[2]).normalize();
    const townDir = up.clone().applyAxisAngle(Y_AXIS, spin).normalize();
    const swing = new Quaternion().setFromUnitVectors(ENTRY_DIR, townDir);
    ENTRY_START.sub(ENTRY_CENTER).applyQuaternion(swing).add(ENTRY_CENTER);
    ENTRY_DIR.copy(townDir);
  }
  doorstepOffer = null;

  // The landing frame: east/up/north exactly as terrainField will derive it,
  // so a sun expressed here rises where the ground expects it.
  const east = new Vector3(0, 1, 0).cross(up);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0).cross(up);
  east.normalize();
  const north = new Vector3().crossVectors(up, east).normalize();

  const sunWorld = land.starSeat
    ? new Vector3().copy(land.starSeat).sub(ENTRY_CENTER).normalize()
    : new Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]).normalize();
  sunWorld.applyAxisAngle(Y_AXIS, -spin);
  const sunLocal: [number, number, number] = [
    sunWorld.dot(east),
    sunWorld.dot(up),
    -sunWorld.dot(north),
  ];

  const aspects = land.hero
    ? {
        thermal: Math.min(1, st.planet.gauges.thermal.div(st.planet.targets.thermal).toNumber()),
        atmo: Math.min(1, st.planet.gauges.atmo.div(st.planet.targets.atmo).toNumber()),
        hydro: Math.min(1, st.planet.gauges.hydro.div(st.planet.targets.hydro).toNumber()),
        bio: Math.min(1, st.planet.gauges.bio.div(st.planet.targets.bio).toNumber()),
      }
    : { thermal: 1, atmo: 1, hydro: 1, bio: 1 };

  // Where the runabout reappears: parked in low orbit over the site, facing
  // the horizon rather than the ground it just left. World frame — this is
  // a flight pose, and the flight scene never learned the record's.
  ENTRY_TANGENT.set(0, 1, 0).cross(ENTRY_DIR);
  if (ENTRY_TANGENT.lengthSq() < 1e-6) ENTRY_TANGENT.set(1, 0, 0).cross(ENTRY_DIR);
  ENTRY_TANGENT.normalize().crossVectors(ENTRY_DIR, ENTRY_TANGENT).normalize();
  const returnPos = new Vector3().copy(ENTRY_CENTER).addScaledVector(ENTRY_DIR, entryRadius + 0.55);
  const returnYaw = Math.atan2(-ENTRY_TANGENT.x, -ENTRY_TANGENT.z);
  const returnPitch = -0.08;

  // The world's civic facts, frozen now so the surface never has to ask the
  // flight scene (or the store's hot paths) a question mid-walk.
  const record = land.hero
    ? null
    : st.run.completedPlanets.find((r) => r.lifetimeIndex === land.lifetimeIndex) ?? null;
  const standing = land.hero ? 1 : standingOf(st, land.lifetimeIndex);
  const life = land.hero ? null : worldRecord(st, land.lifetimeIndex);

  const session: GroundfallSession = {
    worldKey: land.key,
    name: land.name,
    seed: land.seed,
    type: land.type,
    size: land.size,
    hero: land.hero,
    aspects,
    dir: [up.x, up.y, up.z],
    sunLocal,
    starHex: land.starSeat ? starColor(land.starSeed).getHex() : 0xfff2dc,
    returnPos: [returnPos.x, returnPos.y, returnPos.z],
    returnYaw,
    returnPitch,
    lifetimeIndex: land.lifetimeIndex,
    completed: !land.hero,
    gameTimeMs: st.gameTimeMs,
    standing,
    traits: life ? worldTraits(life, standing) : [],
    installations: record ? [...record.installations] : [],
    quirks: land.hero ? [...st.planet.quirks] : record ? [...record.quirks] : [],
    openRequests: openRequestsAt(st, land.lifetimeIndex),
    certs: { ...st.expedition.certs },
  };

  // The dive is flown from the canopy; a chase boom through a fireball is
  // nobody's idea of comfortable.
  f.cameraMode = 'cockpit';
  f.vel.set(0, 0, 0);
  flightInput.cruise = 0;
  beginGroundfall(session);
}

/**
 * The scripted dive, flown against the live universe while the surface bakes
 * behind the plasma. Advances the surface state machine, then poses the
 * camera along an accelerating plunge toward the touchdown point.
 */
export function stepEntryDive(camera: Camera, dt: number, t: number): void {
  stepSurface(dt, t);
  const body = entryBody;
  if (!body) return;
  const k = entryProgress();
  bodyPosition(body, t, ENTRY_CENTER);

  // Accelerating plunge: hold height early (plasma building), dive late.
  const ease = k * k * (0.35 + k * 0.65);
  TMP.copy(ENTRY_CENTER).addScaledVector(ENTRY_DIR, entryRadius * 1.015);
  CAMERA_DESIRED.copy(ENTRY_START).lerp(TMP, Math.min(1, ease * 1.04));
  camera.position.copy(CAMERA_DESIRED);
  flightLive.pos.copy(CAMERA_DESIRED);

  // The view slides from "planet in the glass" to "horizon rushing up".
  CAMERA_LOOK
    .copy(ENTRY_CENTER)
    .addScaledVector(ENTRY_DIR, entryRadius * (0.2 + k * 0.78))
    .addScaledVector(ENTRY_TANGENT, entryRadius * 0.85 * k * k);
  camera.up.copy(UP);
  camera.lookAt(CAMERA_LOOK);
  if (surfaceLive.shake > 0.001) {
    camera.rotateZ(Math.sin(t * 23.7) * surfaceLive.shake * 0.02);
    camera.position.x += Math.sin(t * 31.7) * surfaceLive.shake * 0.01;
    camera.position.y += Math.sin(t * 27.3) * surfaceLive.shake * 0.008;
  }

  const pcam = camera as PerspectiveCamera;
  if (typeof pcam.fov === 'number') {
    const target = FLIGHT_FOV_BASE + k * 9;
    if (Math.abs(pcam.fov - target) > 0.02) {
      pcam.fov = target;
      pcam.updateProjectionMatrix();
    }
  }
}

/**
 * Takeoff finished: put the runabout back over the site — over where the
 * world has ORBITED TO during the stay, not where it was — and resume flight.
 */
export function restoreFlightAfterGroundfall(
  fallback: Vector3,
  yaw: number,
  pitch: number,
  t?: number,
): void {
  const body = entryBody;
  entryBody = null;
  if (body) {
    bodyPosition(body, t ?? flightLive.clock, ENTRY_CENTER);
    TMP.copy(ENTRY_CENTER).addScaledVector(ENTRY_DIR, body.radius + 0.55);
    beginFlightAt(TMP, yaw, pitch);
    return;
  }
  beginFlightAt(fallback, yaw, pitch);
}

/**
 * The proximity governor.
 *
 * Flying through a nine-hundred-year-old hull would make it scenery, so the
 * runabout refuses. Approach and it sheds the inward speed over a cushion,
 * then holds station at the hull line — which conveniently leaves you slow
 * enough and close enough to board. Phenomena are not solid and let you in,
 * because being inside one is the entire point of an improbability shadow.
 */
const SEG = new Vector3();
const CLOSEST = new Vector3();
const OUT = new Vector3();

/**
 * One solid. Two jobs, and they are not the same job.
 *
 * The CUSHION bleeds an approach off smoothly so arriving somewhere feels
 * like arriving. That alone is not a collision: a point test only sees where
 * the ship is at the end of a frame, and at boost a frame covers 0.4 units
 * while a settled world's shell is 0.2 — so the ship simply appeared on the
 * far side, having never once been recorded as inside anything.
 *
 * So the second job is a SWEPT test against the whole path travelled this
 * frame. Closest-approach rather than true entry point: it is stable, it is
 * cheap, and it cannot be outrun at any speed the drive can produce.
 *
 * `centre` is the body's live position. Returns height above this surface.
 */
function repel(centre: Vector3, prev: Vector3, hull: number, dt: number): number {
  const f = flightLive;

  // — Swept: did the path this frame pass through the shell? —
  SEG.copy(f.pos).sub(prev);
  const segLen2 = SEG.lengthSq();
  if (segLen2 > 1e-12) {
    const t = Math.max(0, Math.min(1, OUT.copy(centre).sub(prev).dot(SEG) / segLen2));
    CLOSEST.copy(prev).addScaledVector(SEG, t);
    OUT.copy(CLOSEST).sub(centre);
    const near = OUT.length();
    if (near < hull) {
      // Put the ship on the shell at its closest approach and stop the dive.
      if (near > 1e-5) OUT.divideScalar(near);
      else OUT.copy(SEG).normalize().negate();
      f.pos.copy(centre).addScaledVector(OUT, hull);
      const inward = f.vel.dot(OUT);
      if (inward < 0) f.vel.addScaledVector(OUT, -inward);
    }
  }

  // — Cushion: the soft deceleration that makes an approach feel like one. —
  OUT.copy(centre).sub(f.pos);
  const d = OUT.length();
  if (d < 1e-5) return Infinity;
  const soft = hull * 2.2 + 1.2;
  if (d > soft) return d - hull;
  OUT.divideScalar(d); // unit vector pointing at the surface
  const closing = f.vel.dot(OUT);
  if (closing > 0) {
    const bite = 1 - Math.max(0, (d - hull) / (soft - hull));
    f.vel.addScaledVector(OUT, -closing * bite * Math.min(1, dt * 7));
  }
  if (d < hull) {
    f.pos.addScaledVector(OUT, d - hull);
    const inward = f.vel.dot(OUT);
    if (inward > 0) f.vel.addScaledVector(OUT, -inward);
    return 0;
  }
  return d - hull;
}

/** The solid the hull is currently lowest over — the landing candidate. */
let nearBodyRef: FlightBody | null = null;

function cushion(sites: readonly DeepFieldSite[], dt: number): void {
  const f = flightLive;
  let lowest = Infinity;
  let lowestOf = '';
  let lowestRadius = 0;
  let lowestBody: FlightBody | null = null;

  // Worlds and stars first — these are the ones whose scale you are meant to
  // feel, and the ones it is most absurd to pass through. Orbiting worlds
  // resolve their live position here rather than at sweep cadence, so a
  // moving planet cannot slide through the hull between sweeps.
  for (const body of bodies) {
    bodyPosition(body, f.clock, TO_SITE);
    const h = repel(TO_SITE, PREV, body.radius, dt);
    if (h < lowest) {
      lowest = h;
      lowestOf = body.label;
      lowestRadius = body.radius;
      lowestBody = body;
    }
  }
  nearBodyRef = lowestBody;

  for (const site of sites) {
    if (site.def.unreachable || site.def.kind === 'phenomenon') continue;
    siteVector(site, TO_SITE);
    repel(TO_SITE, PREV, hullShell(site.def.radius), dt);
  }

  f.altitude = lowest;
  f.altitudeOf = lowestOf;
  f.nearRadius = lowestRadius;
  f.speed = f.vel.length();
}

/** Arrive. The journey passed through every other point on the way. */
function jumpTo(site: DeepFieldSite): void {
  const f = flightLive;
  siteVector(site, TO_SITE);
  const standoff = jumpStandoff(site.def.radius);
  // Come out of the jump between the target and home, so the first thing in
  // the windscreen is the landmark with your universe behind it.
  TMP.copy(TO_SITE).normalize().multiplyScalar(-standoff);
  f.pos.copy(TO_SITE).add(TMP);
  f.vel.set(0, 0, 0);
  TMP.copy(TO_SITE).sub(f.pos).normalize();
  f.yaw = Math.atan2(-TMP.x, -TMP.z);
  f.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.asin(TMP.y)));
  f.yawRate = 0;
  f.pitchRate = 0;
  f.roll = 0;
  f.scanProgress = 0;
  f.jumpNonce++;
}

/**
 * Rebuild the HUD's contact list (housekeeping cadence, not per frame).
 * Entries are recycled from a pool so a sweep costs no allocation.
 */
const CONTACT_POOL: FlightContact[] = [];
const CONTACT_LIST: FlightContact[] = [];

function refreshContacts(): void {
  const f = flightLive;
  const st = useGame.getState().s;
  const sites = sitesForSeed(st.seed);
  const range = Math.max(1, f.range || sensorRange(st.expedition));
  const rumoured = rumouredSites(st);
  const trainingId = st.flags[SORTIE_FLAG] ? null : firstSortieTargetId();
  EUL.set(f.pitch, f.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  CONTACT_LIST.length = 0;
  for (const site of sites) {
    siteVector(site, TO_SITE).sub(f.pos);
    const d = TO_SITE.length();
    const gossiped = rumoured.has(site.def.id);
    if (d > range * (gossiped ? C.SUBETHA_RUMOUR_RANGE_MULT : 1)) continue;
    const targetYaw = Math.atan2(-TO_SITE.x, -TO_SITE.z);
    const targetPitch = Math.atan2(TO_SITE.y, Math.hypot(TO_SITE.x, TO_SITE.z));
    const bearing = Math.atan2(Math.sin(targetYaw - f.yaw), Math.cos(targetYaw - f.yaw));
    const elevation = targetPitch - f.pitch;
    TO_SITE.divideScalar(d || 1);
    const off = Math.acos(Math.max(-1, Math.min(1, TO_SITE.dot(FWD))));
    const slot = CONTACT_POOL[CONTACT_LIST.length] ?? blankContact();
    CONTACT_POOL[CONTACT_LIST.length] = slot;
    const contact = writeContact(slot, site, d, off, st.expedition, gossiped);
    contact.bearing = bearing;
    contact.elevation = elevation;
    contact.training = site.def.id === trainingId;
    CONTACT_LIST.push(contact);
  }
  CONTACT_LIST.sort((a, b) => {
    if (a.training !== b.training) return a.training ? -1 : 1;
    if (a.rumoured !== b.rumoured) return a.rumoured ? -1 : 1;
    return a.off * 8 + a.d / range - (b.off * 8 + b.d / range);
  });
  f.contacts = CONTACT_LIST;
}

// ————— Surroundings (HUD copy + the near-system reveal) —————

/** Weighted nearest landmark: bigger things announce themselves from farther. */
function flightUiPaused(): boolean {
  return typeof document !== 'undefined'
    && document.querySelector('.modal-veil, .modal, .fh-refit, .fh-chart, .fh-controls') !== null;
}

function scanSurroundings(): void {
  const f = flightLive;
  const st = useGame.getState().s;
  let bestScore = Infinity;
  let best: FlightNearest | null = null;
  const consider = (p: Vector3, label: string, kind: FlightNearest['kind'], reach: number) => {
    const d = f.pos.distanceTo(p);
    const score = d / reach;
    if (score < bestScore) {
      bestScore = score;
      best = { label, kind, d };
    }
  };

  consider(TMP.set(0, 0, 0), st.planet.name, 'planet', 1.6);
  consider(CURRENT_SYSTEM_ANCHOR, `system ${st.run.systems + 1}, assembling`, 'assembling', 1.4);

  const bus = useUiBus.getState();
  const currentSystem = bus.flightNearSystem;
  const currentGalaxy = bus.flightNearGalaxy;
  let nearSystem = -1;
  let nearSystemD = Infinity;
  let currentSystemD = Infinity;
  hierarchySystemSeatValid = false;
  for (let i = 0; i < st.run.systems; i++) {
    const seat = focusSeat({ kind: 'system', index: i }, st.seed, st.run.galaxies);
    consider(seat, `system ${i + 1}`, 'system', 1.4);
    const d = f.pos.distanceTo(seat);
    if (i === currentSystem) currentSystemD = d;
    if (d < nearSystemD) {
      nearSystemD = d;
      nearSystem = i;
      HIERARCHY_SYSTEM_SEAT.copy(seat);
      hierarchySystemSeatValid = true;
    }
  }
  let nearGalaxy = -1;
  let nearGalaxyD = Infinity;
  let currentGalaxyD = Infinity;
  hierarchyGalaxySeatValid = false;
  for (let i = 0; i < st.run.galaxies; i++) {
    const seat = galaxyPosition(i, st.seed);
    consider(seat, `galaxy ${i + 1}`, 'galaxy', 4.5);
    const d = f.pos.distanceTo(seat);
    if (i === currentGalaxy) currentGalaxyD = d;
    if (d < nearGalaxyD) {
      nearGalaxyD = d;
      nearGalaxy = i;
      HIERARCHY_GALAXY_SEAT.copy(seat);
      hierarchyGalaxySeatValid = true;
    }
  }
  f.nearest = bestScore < 4 ? best : null;

  // Hysteretic LOD handoffs with an overlap margin. The current hierarchy
  // remains stable at a boundary, but cannot hold a clearly nearer sibling.
  const nextSystem = selectRevealCandidate(
    currentSystem,
    currentSystemD,
    SYSTEM_REVEAL_FAR,
    nearSystem >= 0 ? nearSystem : null,
    nearSystemD,
    SYSTEM_REVEAL_NEAR,
  );
  if (nextSystem !== currentSystem) bus.setFlightNearSystem(nextSystem);

  const independentGalaxy = selectRevealCandidate(
    currentGalaxy,
    currentGalaxyD,
    GALAXY_REVEAL_FAR,
    nearGalaxy >= 0 ? nearGalaxy : null,
    nearGalaxyD,
    GALAXY_REVEAL_NEAR,
  );
  const nextGalaxy = parentGalaxyReveal(nextSystem, st.run.galaxies, independentGalaxy);
  if (nextGalaxy !== currentGalaxy) bus.setFlightNearGalaxy(nextGalaxy);

  // Planet detail has its own radius-relative hysteresis. It is deliberately
  // keyed to the canonical orbit, so surface life appears where navigation
  // and collision already say the world is.
  const currentWorld = bus.flightNearWorld;
  let nextWorld: number | null = null;
  if (nextSystem !== null) {
    const first = nextSystem * C.PLANETS_PER_SYSTEM;
    const seat = focusSeat({ kind: 'system', index: nextSystem }, st.seed, st.run.galaxies);
    let currentWorldD = Infinity;
    let currentWorldFar = 0;
    let nearestWorld: number | null = null;
    let nearestWorldD = Infinity;
    let nearestWorldNear = 0;
    for (let slot = 0; slot < C.PLANETS_PER_SYSTEM; slot++) {
      const worldIndex = first + slot;
      const record = st.run.completedPlanets[worldIndex];
      if (!record) continue;
      systemOrbitOffset(slot, f.clock, true, TMP);
      const distance = f.pos.distanceTo(TMP.add(seat));
      const shell = detailWorldShell(record.size);
      if (worldIndex === currentWorld) {
        currentWorldD = distance;
        currentWorldFar = shell * 8;
      }
      const enter = shell * 6;
      if (distance <= enter && distance < nearestWorldD) {
        nearestWorld = worldIndex;
        nearestWorldD = distance;
        nearestWorldNear = enter;
      }
    }
    nextWorld = selectRevealCandidate(
      currentWorld,
      currentWorldD,
      currentWorldFar,
      nearestWorld,
      nearestWorldD,
      nearestWorldNear,
    );
  }
  if (nextWorld !== currentWorld) bus.setFlightNearWorld(nextWorld);

  // The solid bodies. Seats are rebuilt on the housekeeping cadence; anything
  // that orbits carries its orbit definition and is evaluated per frame.
  //
  // EVERY WORLD BELONGS HERE, not just the stars. Covering the hero planet
  // and the system stars alone left the actual planets — the ones orbiting
  // your assembling system, the ones in a system you have flown up to —
  // as ghosts you sailed straight through.
  let n = 0;
  const heroScale = heroWorldRadius(st.planet.size);
  pushBody(n++, st.planet.name, TMP.set(0, 0, 0), heroWorldShell(st.planet.size), null, {
    key: `w${st.planet.lifetimeIndex}`,
    name: st.planet.name,
    seed: st.planet.seed,
    type: st.planet.type,
    size: st.planet.size,
    hero: true,
    lifetimeIndex: st.planet.lifetimeIndex,
    starSeed: st.planet.seed,
    starSeat: null,
  });

  // The moon meshes inherit the hero world's scale; their physical orbits and
  // shells must inherit it too.
  for (const m of heroMoons(st.planet.seed, st.planet.lifetimeIndex === 42)) {
    pushBody(n++, 'the moon', TMP.set(0, 0, 0), m.size * heroScale * MOON_SHELL, {
      xAmp: m.orbit * heroScale,
      yAmp: m.tilt * heroScale,
      zAmp: m.orbit * heroScale,
      yFreq: 0.7,
      phase: m.phase,
      speed: m.speed,
    });
  }

  pushBody(n++, `system ${st.run.systems + 1}`, CURRENT_SYSTEM_ANCHOR, SYSTEM_STAR_SHELL);

  const inSystem = st.run.completedPlanets.slice(st.run.systems * C.PLANETS_PER_SYSTEM);
  for (let i = 0; i < inSystem.length; i++) {
    const record = inSystem[i]!;
    const o = orbitSlot(i);
    pushBody(
      n++,
      record.name,
      CURRENT_SYSTEM_ANCHOR,
      detailWorldShell(record.size),
      worldOrbit(o.radius, o.phase, o.speed),
      {
        key: `w${record.lifetimeIndex}`,
        name: record.name,
        seed: record.seed,
        type: record.type,
        size: record.size,
        hero: false,
        lifetimeIndex: record.lifetimeIndex,
        starSeed: inSystem[0]!.seed,
        starSeat: CURRENT_SYSTEM_ANCHOR,
      },
    );
  }

  for (let i = 0; i < st.run.systems; i++) {
    pushBody(
      n++,
      `system ${i + 1}`,
      focusSeat({ kind: 'system', index: i }, st.seed, st.run.galaxies),
      SYSTEM_STAR_SHELL,
    );
  }

  const uiBus = useUiBus.getState();
  const focused = uiBus.focus;
  const revealed =
    uiBus.flightNearSystem ??
    (focused && focused.kind !== 'galaxy'
      ? focused.kind === 'world'
        ? Math.floor(focused.index / C.PLANETS_PER_SYSTEM)
        : focused.index
      : null);
  if (revealed !== null) {
    const seat = focusSeat({ kind: 'system', index: revealed }, st.seed, st.run.galaxies);
    const first = revealed * C.PLANETS_PER_SYSTEM;
    const worlds = st.run.completedPlanets.slice(first, first + C.PLANETS_PER_SYSTEM);
    for (let i = 0; i < worlds.length; i++) {
      const record = worlds[i]!;
      const o = orbitSlot(i);
      pushBody(
        n++,
        record.name,
        seat,
        detailWorldShell(record.size),
        worldOrbit(o.radius, o.phase, o.speed),
        {
          key: `w${record.lifetimeIndex}`,
          name: record.name,
          seed: record.seed,
          type: record.type,
          size: record.size,
          hero: false,
          lifetimeIndex: record.lifetimeIndex,
          starSeed: worlds[0]!.seed,
          starSeat: seat,
        },
      );
    }
  }
  bodies.length = n;

  refreshContacts();
  stepManifest(st);
  resolveNavTarget(st);
}

const NAV_POS = new Vector3();
/** Reused tuples so a per-frame solve allocates nothing. */
const NAV_POS_T: [number, number, number] = [0, 0, 0];
const NAV_SELF_POS: [number, number, number] = [0, 0, 0];
const NAV_SELF_VEL: [number, number, number] = [0, 0, 0];
let navTargetValid = false;
let navBrakeRate = RESP_BRAKE;
/** Route identity at engagement, including the current leg of a stable job pin. */
let autopilotTargetKey = '';
/** One visit record per physical approach, released after flying away. */
let arrivalLatch: string | null = null;

/**
 * Where the pinned waypoint currently is, refreshed on the housekeeping sweep.
 *
 * The registry says *what* is addressable; this is the half that knows where
 * things are, which is why it lives in the scene and not in the engine. A ref
 * that cannot be placed — a world in a system this commission no longer holds,
 * a landmark from another seed — resolves to nothing and the ribbon simply
 * does not draw, which is the correct behaviour for a chart that is honest
 * about being provisional.
 *
 * Route identity refreshes on the 5Hz sweep. Moving positions and bearing are
 * resolved every frame, so the ribbon and autopilot share the world on screen.
 */
function resolveNavTarget(st: ReturnType<typeof useGame.getState>['s']): void {
  const f = flightLive;
  const pin = pinnedWaypoint(st);
  if (!pin || !resolveWaypoint(st, pin.ref, NAV_POS)) {
    navTargetValid = false;
    f.navLabel = '';
    f.nav = null;
    if (f.courseHold) disengageAutopilot('missing');
    return;
  }
  const routeKey = `${pin.id}:${pin.label}`;
  // A freight pin is stable across both legs, but its physical destination is
  // not. Stop at collection instead of silently departing for delivery.
  if (f.courseHold && autopilotTargetKey && autopilotTargetKey !== routeKey) {
    disengageAutopilot('arrived');
  }
  navTargetValid = true;
  f.navLabel = pin.label;
  f.navArrivalRadius = arrivalRadiusFor(st, pin.ref);
  navBrakeRate = RESP_BRAKE / massFactor(st.expedition);
}

/** Solve the cockpit readout against the cached target. Called every frame. */
function solveNavThisFrame(): void {
  const f = flightLive;
  if (!navTargetValid) {
    f.nav = null;
    return;
  }
  // Worlds orbit continuously. Resolve the pinned address every frame so the
  // ribbon and course hold pursue the world that is actually on screen.
  const st = useGame.getState().s;
  const livePin = pinnedWaypoint(st);
  if (!livePin || !resolveWaypoint(st, livePin.ref, NAV_POS)) {
    navTargetValid = false;
    f.nav = null;
    if (f.courseHold) disengageAutopilot('missing');
    return;
  }
  NAV_POS_T[0] = NAV_POS.x;
  NAV_POS_T[1] = NAV_POS.y;
  NAV_POS_T[2] = NAV_POS.z;
  NAV_SELF_POS[0] = f.pos.x;
  NAV_SELF_POS[1] = f.pos.y;
  NAV_SELF_POS[2] = f.pos.z;
  NAV_SELF_VEL[0] = f.vel.x;
  NAV_SELF_VEL[1] = f.vel.y;
  NAV_SELF_VEL[2] = f.vel.z;
  f.nav = solveNav(
    {
      pos: NAV_SELF_POS,
      vel: NAV_SELF_VEL,
      yaw: f.yaw,
      pitch: f.pitch,
      // The rig sheds speed exponentially, and a loaded hold divides the
      // response — so the room needed to stop grows with the cargo, which is
      // the whole point of hauling anything.
      brakeRate: navBrakeRate,
    },
    NAV_POS_T,
  );

  if (!f.nav) {
    arrivalLatch = null;
    return;
  }

  // Arriving records the latest physical approach. The release radius prevents
  // a parked ship from rewriting the timestamp every frame.
  const pin = useGame.getState().s.expedition.pinned;
  if (f.nav.distance <= f.navArrivalRadius && pin) {
    if (arrivalLatch !== pin) {
      // A request names a real place. Reaching its pinned world is the answer:
      // refresh the physical-visit timestamp, then file every open request from
      // that world while this one arrival is latched.
      const requests = attendable(useGame.getState().s)
        .filter((request) => waypointId('world', request.world) === pin);
      actions.markVisited(pin);
      for (const request of requests) actions.attendInPerson(request.uid);
      arrivalLatch = pin;
    }
  } else if (f.nav.distance >= f.navArrivalRadius + 4) {
    arrivalLatch = null;
  }
}

function manualOverrideRequested(): boolean {
  const input = flightInput;
  return input.thrust > 0.02
    || input.brake > 0.02
    || input.strafe !== 0
    || input.vert !== 0
    || input.boost
    || input.cruise > 0.02
    || input.keyYaw !== 0
    || input.keyPitch !== 0
    || mouseSteer.active
    || touchSteer.id !== -1
    || Math.abs(input.steerX) > 0.025
    || Math.abs(input.steerY) > 0.025;
}

function commandAutopilot(): AutopilotCommand | null {
  const f = flightLive;
  if (!f.courseHold) return null;
  if (!f.nav) {
    disengageAutopilot('missing');
    return null;
  }
  const command = autopilotCommand({
    nav: f.nav,
    speed: f.speed,
    cap: f.cap,
    arrivalRadius: f.navArrivalRadius,
  });
  f.autopilotPhase = command.phase;
  if (command.phase === 'arrived' && f.speed <= 0.035) {
    disengageAutopilot('arrived');
    useUiBus.getState().addToast({
      kind: 'info',
      kicker: 'AUTOPILOT',
      title: `Arrived at ${f.navLabel}`,
      body: 'All stop. Manual helm restored.',
      ttlMs: 3600,
    });
  }
  return command;
}

type AutopilotStop = 'manual' | 'arrived' | 'missing' | 'toggle';

function disengageAutopilot(reason: AutopilotStop): void {
  const f = flightLive;
  const wasEngaged = f.courseHold;
  f.courseHold = false;
  autopilotTargetKey = '';
  f.autopilotPhase = reason === 'arrived' ? 'arrived' : 'off';
  if (reason === 'manual' && wasEngaged) {
    useUiBus.getState().addToast({
      kind: 'info',
      kicker: 'AUTOPILOT DISENGAGED',
      title: 'Manual helm',
      body: 'Your control input took priority.',
      ttlMs: 2600,
    });
  }
}

function arrivalRadiusFor(
  st: ReturnType<typeof useGame.getState>['s'],
  ref: WaypointRef,
): number {
  if (ref.at === 'home') return Math.max(3.5, heroWorldRadius(st.planet.size) * 2.2);
  if (ref.at === 'point') return 4;
  if (ref.at === 'site') {
    const site = sitesForSeed(st.seed).find((candidate) => candidate.def.id === ref.id);
    return site ? Math.max(3, boardRange(site.def.radius) - 0.2) : 4;
  }
  if (ref.kind === 'galaxy') return 24;
  if (ref.kind === 'system') return SYSTEM_STAR_SHELL + 1.5;
  const record = st.run.completedPlanets[ref.index];
  return record ? Math.max(2.4, detailWorldRadius(record.size) * 2.2) : 2.5;
}

/** Position of the currently resolved objective, for the in-scene beacon. */
export function flightNavTarget(out: Vector3): boolean {
  if (!navTargetValid) return false;
  out.copy(NAV_POS);
  return true;
}

/**
 * The arrows fly the ship.
 *
 * Runs after course hold, so a hand on the keys takes the heading back from
 * the autopilot the moment it asks for it — and after the mouse check, so
 * whichever device is actually being held wins rather than the two of them
 * arguing every frame.
 */
function applyKeySteering(dt: number): void {
  const prefsNow = flightPrefs();

  /**
   * A flight stick, if one has been wired up.
   *
   * Read every frame rather than on key events, because a stick is held —
   * there is no event when you simply keep pushing it. An analogue axis is
   * already smooth, so it goes straight to the steering channel with no ramp,
   * and it outranks the keys: if the pilot's hand is on the stick, the stick
   * is what they meant.
   */
  if (prefsNow.gamepad) {
    const ax = readAxes(prefsNow);
    if (ax.live) {
      if (ax.throttle !== null) flightInput.cruise = ax.throttle;
      if (ax.strafe !== 0) flightInput.strafe = Math.max(-1, Math.min(1, ax.strafe));
      if (ax.yaw !== 0 || ax.pitch !== 0) {
        flightInput.steerX = Math.max(-1, Math.min(1, ax.yaw * prefsNow.sensitivity));
        flightInput.steerY = Math.max(-1, Math.min(1,
          ax.pitch * prefsNow.sensitivity * (prefsNow.invertPitch ? -1 : 1)));
        keySteerX = 0;
        keySteerY = 0;
        return;
      }
      // Stick centred: it still owns the axis, so nothing is left commanded.
      if (flightInput.keyYaw === 0 && flightInput.keyPitch === 0
        && !mouseSteer.active && touchSteer.id === -1) {
        flightInput.steerX = 0;
        flightInput.steerY = 0;
      }
    }
  }

  const yaw = flightInput.keyYaw;
  const pitch = flightInput.keyPitch;
  if (yaw === 0 && pitch === 0 && keySteerX === 0 && keySteerY === 0) return;

  const k = 1 - Math.exp(-dt * KEY_STEER_RATE);
  keySteerX += (yaw - keySteerX) * k;
  keySteerY += (pitch - keySteerY) * k;
  // Snap the last sliver to zero so a released key genuinely stops the turn
  // rather than leaving a permanent hundredth of a degree per second on.
  if (yaw === 0 && Math.abs(keySteerX) < 5e-3) keySteerX = 0;
  if (pitch === 0 && Math.abs(keySteerY) < 5e-3) keySteerY = 0;

  if (mouseSteer.active || touchSteer.id !== -1) return;
  const prefs = flightPrefs();
  flightInput.steerX = Math.max(-1, Math.min(1, keySteerX * prefs.sensitivity));
  flightInput.steerY = Math.max(-1, Math.min(1,
    keySteerY * prefs.sensitivity * (prefs.invertPitch ? -1 : 1)));
}

/**
 * The chart, from the pilot's seat.
 *
 * Flying into a galaxy used to mean flying at a smear of light and hoping a
 * system turned up, because the only things the cockpit could name were the
 * nearest landmark and whatever the sensors had already resolved. The chart
 * knew where everything was the entire time — it was just on the other side
 * of disembarking.
 *
 * So the helm asks it directly: every addressable place, with a bearing and a
 * range from where the ship actually is, nearest first. Pinning one from here
 * feeds the same ribbon and the same course hold that a pin from the desk
 * does; this is a second door onto the chart, not a second chart.
 */
export interface HelmChartEntry {
  id: string;
  label: string;
  detail: string;
  kind: string;
  known: boolean;
  distance: number;
  /** Signed yaw error, negative to port — the same convention as the ribbon. */
  bearing: number;
  elevation: number;
  pinned: boolean;
}

const CHART_POS = new Vector3();
const CHART_T: [number, number, number] = [0, 0, 0];
const CHART_SELF: [number, number, number] = [0, 0, 0];
const CHART_VEL: [number, number, number] = [0, 0, 0];

export function helmChart(limit = 60): HelmChartEntry[] {
  const f = flightLive;
  const st = useGame.getState().s;
  const out: HelmChartEntry[] = [];

  CHART_SELF[0] = f.pos.x;
  CHART_SELF[1] = f.pos.y;
  CHART_SELF[2] = f.pos.z;
  CHART_VEL[0] = f.vel.x;
  CHART_VEL[1] = f.vel.y;
  CHART_VEL[2] = f.vel.z;

  for (const w of waypoints(st)) {
    if (!resolveWaypoint(st, w.ref, CHART_POS)) continue;
    CHART_T[0] = CHART_POS.x;
    CHART_T[1] = CHART_POS.y;
    CHART_T[2] = CHART_POS.z;
    const nav = solveNav(
      { pos: CHART_SELF, vel: CHART_VEL, yaw: f.yaw, pitch: f.pitch, brakeRate: RESP_BRAKE },
      CHART_T,
    );
    if (!nav) continue;
    out.push({
      id: w.id,
      label: w.label,
      detail: w.detail,
      kind: w.kind,
      known: w.known,
      distance: nav.distance,
      bearing: nav.bearing,
      elevation: nav.elevation,
      pinned: st.expedition.pinned === w.id,
    });
  }

  const activeJobId = st.expedition.manifest ? `job:${st.expedition.manifest.uid}` : null;
  out.sort((a, b) => {
    const priority = (entry: HelmChartEntry) => entry.pinned ? 0 : entry.id === activeJobId ? 1 : 2;
    return priority(a) - priority(b) || a.distance - b.distance;
  });
  return out.slice(0, limit);
}

/** Turn a structural `WaypointRef` into a position in flight space. */
export function resolveWaypoint(
  st: ReturnType<typeof useGame.getState>['s'],
  ref: WaypointRef,
  out: Vector3,
): boolean {
  if (ref.at === 'home') {
    out.set(0, 0, 0);
    return true;
  }
  if (ref.at === 'point') {
    out.set(ref.pos[0], ref.pos[1], ref.pos[2]);
    return true;
  }
  if (ref.at === 'site') {
    const site = sitesForSeed(st.seed).find((s) => s.def.id === ref.id);
    if (!site) return false;
    out.set(site.pos[0], site.pos[1], site.pos[2]);
    return true;
  }
  if (ref.kind === 'galaxy') {
    out.copy(galaxyPosition(ref.index, st.seed));
    return true;
  }
  if (ref.kind === 'system') {
    out.copy(focusSeat({ kind: 'system', index: ref.index }, st.seed, st.run.galaxies));
    return true;
  }

  // A world: its parent system's seat, plus where it is in its orbit now. The
  // orbit matters — a world half a lap away is a different bearing entirely.
  const systemIndex = Math.floor(ref.index / C.PLANETS_PER_SYSTEM);
  const slot = ref.index % C.PLANETS_PER_SYSTEM;
  if (systemIndex >= st.run.systems) {
    // Still assembling: it rides the current anchor rather than a formed seat.
    out.copy(CURRENT_SYSTEM_ANCHOR);
    const o = orbitSlot(slot);
    applyOrbit(out, worldOrbit(o.radius, o.phase, o.speed), flightLive.clock);
    return true;
  }
  out.copy(focusSeat({ kind: 'system', index: systemIndex }, st.seed, st.run.galaxies));
  const o = orbitSlot(slot);
  applyOrbit(out, worldOrbit(o.radius, o.phase, o.speed), flightLive.clock);
  return true;
}

/** Offset a seat by an orbit, matching `bodyPosition`'s own arithmetic. */
function applyOrbit(out: Vector3, orbit: FlightBody['orbit'], t: number): void {
  if (!orbit) return;
  const a = t * orbit.speed + orbit.phase;
  out.x += Math.cos(a) * orbit.xAmp;
  out.y += Math.sin(a * orbit.yFreq) * orbit.yAmp;
  out.z += Math.sin(a) * orbit.zAmp;
}

/**
 * Delivery. Fly the manifest to the world it is addressed to and it is
 * discharged on arrival — there is no dock, no menu and no button, because
 * arriving IS the verb. The destination has to be a world whose system is
 * currently revealed, which is exactly the set the collision list already
 * holds, so "close enough to deliver" and "close enough to crash into"
 * agree by construction.
 */
function stepManifest(st: ReturnType<typeof useGame.getState>['s']): void {
  const m = st.expedition.manifest;
  if (!m) return;
  const f = flightLive;
  // Before collection the job names a place to GO, not a place to arrive. Both
  // halves use the same arrival test, so "close enough to collect" and "close
  // enough to deliver" agree by construction.
  const waiting = m.pickedUpAtMs === null;
  const target = waiting ? m.fromName : m.toName;
  for (const body of bodies) {
    if (body.label !== target) continue;
    bodyPosition(body, f.clock, TMP);
    if (TMP.distanceTo(f.pos) <= Math.max(2.4, body.radius * 2)) {
      if (waiting) actions.pickUpManifest();
      else actions.deliverManifest();
      return;
    }
  }
}

// ————— Interdiction —————

/**
 * Somebody wants a word about your cargo.
 *
 * The risk exists BECAUSE you are carrying something: an empty ship is never
 * interdicted, which keeps the pressure attached to the reward rather than
 * taxing sightseeing. There is no damage model and no death — the three ways
 * out are all things the existing flight model already does.
 *
 *   outrun   put distance between you; harder loaded, which is where the
 *            mass you accepted at the board comes back for its answer
 *   comply   stop, and it takes the cargo and the fee
 *   deter    the Dispersal Field, if fitted, sends it away unharmed
 */
export const interdiction = {
  active: false,
  /** Where the patrol is, so the scene and HUD can point at it. */
  pos: new Vector3(),
  /** 0–1 how thoroughly it has lost interest. */
  dispersal: 0,
  /** Live separation and time remaining, for an honest pursuit display. */
  gap: 0,
  remainingMs: 0,
  sinceMs: 0,
  nextAtMs: 0,
};

const PATROL_SPEED = 7.5;
const PATROL_GIVE_UP = 95;
/** Active helm time; overlays and time away from the helm do not advance customs. */
let interdictionClockMs = 0;

function stepInterdiction(st: ReturnType<typeof useGame.getState>['s'], dt: number): void {
  const f = flightLive;
  interdictionClockMs += dt * 1000;
  const now = interdictionClockMs;
  const carrying = isCarrying(st.expedition);

  if (!interdiction.active) {
    interdiction.gap = 0;
    interdiction.remainingMs = 0;
    if (!carrying) {
      // Accepted work is not cargo. The clock starts only once the hold is loaded.
      const profile = handlingFor(st.expedition);
      const gapMs = C.INTERDICTION_MIN_GAP_MS / Math.max(1, profile.inspectionMult);
      interdiction.nextAtMs = Math.max(interdiction.nextAtMs, now + gapMs);
      return;
    }
    if (now < interdiction.nextAtMs) return;
    interdiction.active = true;
    interdiction.dispersal = 0;
    interdiction.sinceMs = now;
    interdiction.remainingMs = C.INTERDICTION_PURSUIT_MS;
    // It arrives behind and to one side, at the edge of comfortable.
    interdiction.pos.copy(f.pos).addScaledVector(FWD, -55);
    interdiction.pos.y += 12;
    return;
  }

  if (!carrying) {
    endInterdiction(now, st);
    return;
  }

  // It follows on the actual frame clock, not the old five-Hz sensor sweep.
  TMP.copy(f.pos).sub(interdiction.pos);
  const gap = TMP.length();
  interdiction.gap = gap;
  interdiction.remainingMs = Math.max(0, C.INTERDICTION_PURSUIT_MS - (now - interdiction.sinceMs));
  if (gap > 1e-4) interdiction.pos.addScaledVector(TMP.divideScalar(gap), PATROL_SPEED * dt);

  if (flightInput.deter) {
    const power = deterrentPower(st.expedition);
    if (power > 0) {
      interdiction.dispersal += dt * power * 0.5;
      if (interdiction.dispersal >= 1) {
        endInterdiction(now, st);
        actions.resolveInterdiction('deterred');
        return;
      }
    }
  }

  if (gap > PATROL_GIVE_UP || interdiction.remainingMs <= 0) {
    endInterdiction(now, st);
    actions.resolveInterdiction('outrun');
    return;
  }
  // Complying is simply stopping and letting it catch up.
  if (gap < 14 && f.speed < 1.2) {
    endInterdiction(now, st);
    actions.resolveInterdiction('complied');
  }
}

function endInterdiction(now: number, st: ReturnType<typeof useGame.getState>['s']): void {
  interdiction.active = false;
  interdiction.dispersal = 0;
  interdiction.gap = 0;
  interdiction.remainingMs = 0;
  const profile = handlingFor(st.expedition);
  interdiction.nextAtMs = now + C.INTERDICTION_MIN_GAP_MS / Math.max(1, profile.inspectionMult);
}

// ————— Camera application (called by CameraRig's flight branch) —————

/**
 * Flight gets its own near plane. The journey's 0.1 is fine when the closest
 * thing to the lens is six units away, but at the helm you can hold station
 * a few centimetres off a hull or skim a mountain range — at which point 0.1
 * clips the near surface away, backface culling removes the far one, and the
 * planet you are standing on appears to not exist. The wall caps travel at
 * 260, so the far plane comes in to buy the depth precision back.
 */
const FLIGHT_NEAR = 0.02;
const FLIGHT_FAR = 3200;
const JOURNEY_NEAR = 0.1;
const JOURNEY_FAR = 4200;

/** Copy the flight pose onto the camera, with the boost FOV kick. */
export function applyFlightCamera(camera: Camera, dt: number): void {
  const f = flightLive;
  EUL.set(f.pitch, f.yaw, f.cameraMode === 'cockpit' ? f.roll : 0);
  Q.setFromEuler(EUL);

  if (f.cameraMode === 'cockpit') {
    camera.position.copy(f.pos);
    camera.quaternion.copy(Q);
  } else {
    // Narrow screens need more room because horizontal FOV collapses first.
    const aspect = Math.max(0.4, (camera as PerspectiveCamera).aspect || 1);
    const pullback = CHASE_PULLBACK * Math.max(1, 0.74 / aspect);
    CAMERA_DESIRED.set(0, pullback * 0.2, pullback).applyQuaternion(Q).add(f.pos);
    let shoulderView = false;
    // A camera behind the ship must not slip through a planet when the hull
    // is skimming its collision shell. If the boom is obstructed, slide the
    // lens onto a surface-tangent shoulder rather than through the hull.
    for (const body of bodies) {
      bodyPosition(body, f.clock, CAMERA_BODY);
      const clearance = body.radius + FLIGHT_NEAR * 2.5;
      if (CAMERA_DESIRED.distanceToSquared(CAMERA_BODY) >= clearance * clearance) continue;
      shoulderView = true;

      CAMERA_NORMAL.copy(f.pos).sub(CAMERA_BODY);
      const shipRadius = CAMERA_NORMAL.length();
      if (shipRadius < 1e-8) CAMERA_NORMAL.set(0, 1, 0);
      else CAMERA_NORMAL.divideScalar(shipRadius);

      CAMERA_TANGENT.set(0, 1, 0).applyQuaternion(Q);
      CAMERA_TANGENT.addScaledVector(CAMERA_NORMAL, -CAMERA_TANGENT.dot(CAMERA_NORMAL));
      if (CAMERA_TANGENT.lengthSq() < 1e-6) {
        CAMERA_TANGENT.set(1, 0, 0).applyQuaternion(Q);
        CAMERA_TANGENT.addScaledVector(CAMERA_NORMAL, -CAMERA_TANGENT.dot(CAMERA_NORMAL));
      }
      CAMERA_TANGENT.normalize();

      const tangentClearance = Math.sqrt(Math.max(0, clearance * clearance - shipRadius * shipRadius));
      const shoulder = Math.max(0.34, tangentClearance + FLIGHT_NEAR * 3);
      CAMERA_DESIRED.copy(f.pos).addScaledVector(CAMERA_TANGENT, shoulder);
    }
    CAMERA_LOOK
      .set(0, 0, -1)
      .applyQuaternion(Q)
      .multiplyScalar(shoulderView ? 0.08 : 0.65)
      .add(f.pos);
    camera.position.copy(CAMERA_DESIRED);
    camera.up.copy(UP);
    camera.lookAt(CAMERA_LOOK);
  }

  const pcam = camera as PerspectiveCamera;
  if (typeof pcam.fov === 'number') {
    // Fixed lens. The old boost kick swung the field of view by 8 degrees,
    // which is a classic way to make somebody queasy for very little payoff.
    const target = f.cameraMode === 'cockpit' ? FLIGHT_FOV_BASE : 48;
    let dirty = false;
    if (Math.abs(pcam.fov - target) > 0.02) {
      pcam.fov += (target - pcam.fov) * (1 - Math.exp(-dt * 3));
      dirty = true;
    }
    if (pcam.near !== FLIGHT_NEAR) {
      pcam.near = FLIGHT_NEAR;
      pcam.far = FLIGHT_FAR;
      dirty = true;
    }
    if (dirty) pcam.updateProjectionMatrix();
  }
}

/** Restore the lens on the way out (the journey never touches FOV). */
export function restoreFov(camera: Camera): void {
  const pcam = camera as PerspectiveCamera;
  if (typeof pcam.fov !== 'number') return;
  if (pcam.fov !== FLIGHT_FOV_BASE || pcam.near !== JOURNEY_NEAR) {
    pcam.fov = FLIGHT_FOV_BASE;
    pcam.near = JOURNEY_NEAR;
    pcam.far = JOURNEY_FAR;
    pcam.updateProjectionMatrix();
  }
}

/** Zoom band the flight camera currently occupies (drives fades + captions). */
export function flightZoom(): { z: number; band: number } {
  const z = zoomForDistance(flightLive.pos.length());
  return { z, band: bandAt(z) };
}

// ————— Input —————

const keys = new Set<string>();

/** Is any key bound to this action currently down? */
function held(action: FlightAction): boolean {
  for (const code of flightPrefs().bindings[action]) if (keys.has(code)) return true;
  return false;
}

/** Latch so a held autopilot key toggles once rather than sixty times. */
let courseHoldLatch = false;
/** Camera switching is also a press, not a per-frame alternation. */
let cameraViewLatch = false;
/** A bound jump key is a press, not a frame-by-frame hold. */
let jumpLatch = false;
/** Whether the steering axis currently belongs to the pad, so it can let go. */
let padSteering = false;
/** True while a standard pad owns at least one control. */
let padInputActive = false;

/**
 * Pads do not emit DOM input events, so sample them on the frame clock. An idle
 * or absent pad must not overwrite touch controls, test harness input, or other
 * direct helm sources with zeroes.
 */
function pollGamepad(): void {
  const pad = flightPrefs().gamepad ? readPad() : null;
  const active = Boolean(pad?.connected && (
    pad.moveX !== 0 || pad.moveY !== 0 || pad.lookX !== 0 || pad.lookY !== 0
    || pad.thrust > 0 || pad.brake > 0 || pad.boost || pad.engage || pad.jump
    || pad.deter || pad.courseHold || pad.cameraView || pad.exit
  ));
  if (!active && !padInputActive) return;
  padInputActive = active;
  inputFromKeys(pad);
}

function inputFromKeys(padSample?: ReturnType<typeof readPad> | null): void {
  const pad = padSample !== undefined
    ? padSample
    : (flightPrefs().gamepad ? readPad() : null);

  flightInput.thrust = Math.max(held('thrust') ? 1 : 0, pad?.thrust ?? 0);
  flightInput.brake = Math.max(held('brake') ? 1 : 0, pad?.brake ?? 0);
  flightInput.strafe = Math.max(-1, Math.min(1,
    (held('strafeRight') ? 1 : 0) - (held('strafeLeft') ? 1 : 0) + (pad?.moveX ?? 0)));
  flightInput.vert = Math.max(-1, Math.min(1,
    (held('up') ? 1 : 0) - (held('down') ? 1 : 0) - (pad?.moveY ?? 0)));
  flightInput.boost = held('boost') || Boolean(pad?.boost);
  flightInput.engage = held('engage') || Boolean(pad?.engage);
  // The Dispersal Field is held, like everything else that takes nerve.
  flightInput.deter = held('deter') || Boolean(pad?.deter);

  const wantsJump = held('jump') || Boolean(pad?.jump);
  if (wantsJump && !jumpLatch) flightInput.jump = true;
  jumpLatch = wantsJump;

  // Destination autopilot is a toggle. Only real, known waypoints can be
  // pinned, so this cannot reveal an unresolved Deep Field contact.
  const wantsHold = held('courseHold') || Boolean(pad?.courseHold);
  if (wantsHold && !courseHoldLatch) toggleAutopilot();
  courseHoldLatch = wantsHold;

  const wantsView = held('cameraView') || Boolean(pad?.cameraView);
  if (wantsView && !cameraViewLatch) toggleFlightCamera();
  cameraViewLatch = wantsView;

  // Held keys are a digital axis. They only record WHICH WAY here; the frame
  // loop does the ramping, because a key event fires once and a turn has to
  // keep happening.
  flightInput.keyYaw = (held('yawRight') ? 1 : 0) - (held('yawLeft') ? 1 : 0);
  flightInput.keyPitch = (held('pitchDown') ? 1 : 0) - (held('pitchUp') ? 1 : 0);

  // The right stick steers, and shares the sensitivity and invert settings
  // with the mouse so a pilot who has tuned one has tuned both.
  if (pad?.connected && (pad.lookX !== 0 || pad.lookY !== 0)) {
    const prefs = flightPrefs();
    flightInput.steerX = Math.max(-1, Math.min(1, pad.lookX * prefs.sensitivity));
    flightInput.steerY = Math.max(-1, Math.min(1,
      pad.lookY * prefs.sensitivity * (prefs.invertPitch ? -1 : 1)));
    padSteering = true;
  } else if (padSteering && !mouseSteer.active && touchSteer.id === -1) {
    // Centre the stick and the ship stops turning. Without this the last
    // deflection the pad reported stayed commanded until something else
    // happened to write the axis, which at a helm means a ship that will not
    // fly straight. Only the pad's own contribution is released: a hand on
    // the mouse or a thumb on the glass still owns the stick.
    flightInput.steerX = 0;
    flightInput.steerY = 0;
    padSteering = false;
  }

  if (flightInput.brake > 0) flightInput.cruise = 0;
}

/** Engage or disengage destination autopilot for the current known pin. */
export function toggleAutopilot(): boolean {
  const f = flightLive;
  if (f.courseHold) {
    disengageAutopilot('toggle');
    return false;
  }
  const st = useGame.getState().s;
  const pin = pinnedWaypoint(st);
  if (!pin || !pin.known || !f.nav) {
    useUiBus.getState().addToast({
      kind: 'info',
      kicker: 'AUTOPILOT',
      title: 'Pin a known destination first',
      body: 'Open the chart, choose a world, system, landmark, rig, or active mission objective, then engage.',
      ttlMs: 4200,
    });
    return false;
  }
  f.courseHold = true;
  f.autopilotPhase = 'align';
  autopilotTargetKey = `${pin.id}:${pin.label}`;
  flightInput.cruise = 0;
  flightInput.steerX = 0;
  flightInput.steerY = 0;
  // Clear keyboard easing too. Otherwise a released key can rewrite its last
  // tiny steering value on the next frame and look like a fresh manual input.
  keySteerX = 0;
  keySteerY = 0;
  return true;
}

/** Change the camera without moving the runabout or disturbing its navigator. */
export function setFlightCameraMode(mode: FlightCameraMode): FlightCameraMode {
  const f = flightLive;
  if (f.cameraMode === mode) return mode;
  f.cameraMode = mode;
  const prefs = flightPrefs();
  if (prefs.cameraMode !== mode) saveFlightPrefs({ ...prefs, cameraMode: mode });
  return mode;
}

/** Toggle between the physical canopy and the external chase camera. */
export function toggleFlightCamera(): FlightCameraMode {
  return setFlightCameraMode(flightLive.cameraMode === 'cockpit' ? 'chase' : 'cockpit');
}

/**
 * The mouse stick. Only exists while a button is down; `x0/y0` is where the
 * press landed and `x/y` where the pointer is now, so the HUD can draw the
 * throw. Pixels of travel for full deflection.
 */
const STICK_THROW = 190;
export const mouseSteer = { active: false, x0: 0, y0: 0, x: 0, y: 0 };

/** Touch: left half steers (a drag-stick), right half is the throttle. */
const touchSteer = { id: -1, x0: 0, y0: 0 };
const touchThrust = { id: -1, downAt: 0, lastTap: 0 };

function overFlightUi(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      '.fh-exit, .fh-view-switch, .fh-autopilot-switch, .fh-sensors, .fh-refit, .fh-chart, .fh-controls, .fh-engage, .fh-touch, .fh-sortie, .toast-stack, .modal, .modal-veil, .dock',
    ) !== null
  );
}

/** Native button activation belongs to the focused cockpit control, not the ship. */
function keyboardOwnedByControl(event: KeyboardEvent): boolean {
  const target = event.target as {
    closest?: (selector: string) => Element | null;
  } | null;
  if (!target?.closest) return false;
  if (target.closest('input, textarea, select, [contenteditable]')) return true;
  return (event.code === 'Space' || event.code === 'Enter')
    && Boolean(target.closest('button, [role="button"]'));
}

/**
 * Window-level flight controls. Attached only while the mode is engaged;
 * returns the detach. The pointer steers from screen center (hover a UI
 * control and the stick recenters, so reaching for a button doesn't dive).
 */
export function attachFlightInput(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (keyboardOwnedByControl(e)) return;
    if (
      e.code === 'Space' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault(); // no page scroll from the helm
    }
    keys.add(e.code);
    inputFromKeys();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    inputFromKeys();
  };
  const onBlur = () => {
    keys.clear();
    const pad = flightPrefs().gamepad ? readPad() : null;
    // Clear axes without feeding held toggle buttons back through the press
    // detector. Their latches stay armed until the physical button releases.
    inputFromKeys(null);
    jumpLatch = Boolean(pad?.jump);
    courseHoldLatch = Boolean(pad?.courseHold);
    cameraViewLatch = Boolean(pad?.cameraView);
    flightInput.jump = false;
    mouseSteer.active = false;
    flightInput.steerX = 0;
    flightInput.steerY = 0;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (e.pointerId === touchSteer.id) {
        flightInput.steerX = Math.max(-1, Math.min(1, (e.clientX - touchSteer.x0) / 110));
        flightInput.steerY = Math.max(-1, Math.min(1, (e.clientY - touchSteer.y0) / 110));
      }
      return;
    }
    // Hold to steer. The stick is centred wherever you PRESSED, not at the
    // middle of the screen, and it does not exist at all until you press —
    // so the neutral position is "not touching anything", which is the one
    // thing the old scheme could not express.
    if (!mouseSteer.active) return;
    flightInput.steerX = Math.max(-1, Math.min(1, (e.clientX - mouseSteer.x0) / STICK_THROW));
    flightInput.steerY = Math.max(-1, Math.min(1, (e.clientY - mouseSteer.y0) / STICK_THROW));
    mouseSteer.x = e.clientX;
    mouseSteer.y = e.clientY;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      if (e.button !== 0 || overFlightUi(e.target)) return;
      mouseSteer.active = true;
      mouseSteer.x0 = mouseSteer.x = e.clientX;
      mouseSteer.y0 = mouseSteer.y = e.clientY;
      flightInput.steerX = 0;
      flightInput.steerY = 0;
      return;
    }
    if (overFlightUi(e.target)) return;
    if (e.clientX < window.innerWidth * 0.45 && touchSteer.id === -1) {
      touchSteer.id = e.pointerId;
      touchSteer.x0 = e.clientX;
      touchSteer.y0 = e.clientY;
    } else if (touchThrust.id === -1) {
      const now = performance.now();
      touchThrust.id = e.pointerId;
      flightInput.thrust = 1;
      flightInput.boost = now - touchThrust.lastTap < 320;
      touchThrust.lastTap = now;
    }
  };

  const onPointerEnd = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      // Let go and the ship stops turning. Immediately, every time.
      mouseSteer.active = false;
      flightInput.steerX = 0;
      flightInput.steerY = 0;
      return;
    }
    if (e.pointerId === touchSteer.id) {
      touchSteer.id = -1;
      flightInput.steerX = 0;
      flightInput.steerY = 0;
    }
    if (e.pointerId === touchThrust.id) {
      touchThrust.id = -1;
      flightInput.thrust = 0;
      flightInput.boost = false;
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (overFlightUi(e.target)) return;
    if (e.ctrlKey) e.preventDefault();
    // Cruise trim: scroll up nudges the throttle floor open, down eases it.
    flightInput.cruise = Math.max(0, Math.min(1, flightInput.cruise - e.deltaY * 0.0011));
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
  window.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    window.removeEventListener('wheel', onWheel);
    onBlur();
    flightInput.thrust = 0;
    flightInput.brake = 0;
    flightInput.strafe = 0;
    flightInput.vert = 0;
    flightInput.boost = false;
    flightInput.engage = false;
    flightInput.jump = false;
    mouseSteer.active = false;
    touchSteer.id = -1;
    touchThrust.id = -1;
  };
}

/** The one switch: everything else (input, camera, HUD) follows the bus. */
export function setFlightMode(on: boolean): void {
  const bus = useUiBus.getState();
  if (bus.flightMode === on) return;
  bus.setFlightMode(on);
}

// Headless-verification hook (scripts/shot.mjs) — DEV only.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__tcFlight'] = {
    enter: () => setFlightMode(true),
    exit: () => setFlightMode(false),
    view: (mode?: FlightCameraMode) => mode ? setFlightCameraMode(mode) : toggleFlightCamera(),
    state: () => ({
      active: flightLive.active,
      cameraMode: flightLive.cameraMode,
      pos: flightLive.pos.toArray(),
      yaw: flightLive.yaw,
      pitch: flightLive.pitch,
      speed: flightLive.speed,
      nearest: flightLive.nearest,
      nearGalaxy: useUiBus.getState().flightNearGalaxy,
      nearSystem: useUiBus.getState().flightNearSystem,
      nearWorld: useUiBus.getState().flightNearWorld,
      clock: flightLive.clock,
      contacts: flightLive.contacts,
      locked: flightLive.locked,
      scanProgress: flightLive.scanProgress,
      scanId: flightLive.scanId,
      prompt: flightLive.prompt,
      station: flightLive.station,
      entryArm,
      nav: flightLive.nav,
      navTarget: navTargetValid ? NAV_POS.toArray() : null,
      navLabel: flightLive.navLabel,
      autopilot: flightLive.courseHold,
      autopilotPhase: flightLive.autopilotPhase,
      range: flightLive.range,
    }),
    input: flightInput,
    /** Set an exact pose (headless verification of approaches and walls). */
    pose: (x: number, y: number, z: number, yaw: number, pitch = 0) => {
      beginFlightAt(TMP.set(x, y, z), yaw, pitch);
      return flightLive.pos.toArray();
    },
    /**
     * Park directly over a settled world's roster spot, in the mesh's
     * CURRENT spin frame (headless verification). Returns null when the
     * body has no record or the roster is empty. Press engage in the same
     * breath — the world turns 0.35 rad/s and the snap cone is 0.2.
     */
    aimSettlement: (bodyIdx: number, spotIdx = 0) => {
      const landable = bodies.filter((b) => b.land);
      const body = landable[bodyIdx];
      if (!body?.land || body.land.hero) return null;
      const st = useGame.getState().s;
      const rec = st.run.completedPlanets.find(
        (w) => w.lifetimeIndex === body.land!.lifetimeIndex,
      );
      if (!rec) return null;
      const roster = settlementRoster(settlementSpecOf(rec));
      const spot = roster[spotIdx];
      if (!spot) return null;
      const spin = worldSpins.get(body.land.lifetimeIndex) ?? 0;
      const dir = new Vector3(spot.dir[0], spot.dir[1], spot.dir[2]).applyAxisAngle(
        Y_AXIS,
        spin,
      );
      bodyPosition(body, flightLive.clock, TMP);
      const pos = TMP.clone().addScaledVector(dir, body.radius + 0.22);
      const fwd = dir.clone().multiplyScalar(-1);
      const yaw = Math.atan2(-fwd.x, -fwd.z);
      const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      beginFlightAt(pos, yaw, pitch);
      return { name: spot.name, index: spot.index, spin };
    },
    /** Park the runabout beside a landmark (headless verification). */
    goto: (id: string) => {
      const site = sitesForSeed(useGame.getState().s.seed).find((s) => s.def.id === id);
      if (site) jumpTo(site);
      return site ? flightLive.pos.toArray() : null;
    },
    sites: () =>
      sitesForSeed(useGame.getState().s.seed).map((s) => ({ id: s.def.id, pos: s.pos })),
    /** Every solid the helm is currently respecting, where it is right now. */
    bodies: () =>
      bodies.map((b) => ({
        label: b.label,
        radius: b.radius,
        pos: bodyPosition(b, flightLive.clock, TMP).toArray(),
        land: b.land
          ? { hero: b.land.hero, name: b.land.name, lifetimeIndex: b.land.lifetimeIndex }
          : null,
      })),
  };
}
