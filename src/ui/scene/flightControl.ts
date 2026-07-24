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
import { useGame } from '../../state/store';
import {
  BAND_STOPS,
  CURRENT_SYSTEM_ANCHOR,
  bandAt,
  focusSeat,
  galaxyPosition,
} from './universeLayout';

// ————— Tuning —————

/** Journey camera distances from origin at each band stop (universeLayout). */
const DIST_STOPS = [6.57, 13.9, 27.7, 50.3, 96.5] as const;

const BASE_CAP = 1.15; // u/s at the planet's doorstep
const DIST_K = 0.16; // cap growth per unit of distance from origin
const CAP_MAX = 34;
const BOOST_MULT = 3.1;
const BOOST_CAP = 46;
const RESP_THRUST = 2.4; // velocity approach rates (1/s)
const RESP_BRAKE = 4.2;
const RESP_COAST = 0.33; // release the keys and the runabout coasts
const YAW_RATE_MAX = 1.5; // rad/s at full deflection
const PITCH_RATE_MAX = 1.05;
const RATE_RESP = 6.5;
const PITCH_LIMIT = 1.32; // arcade: no loops, no gimbal regret
const ROLL_BANK = 0.42; // visual roll per rad/s of yaw
const ROLL_RESP = 4.5;
const STEER_DEADZONE = 0.08;
const SOFT_WALL = 200; // beyond this, space politely pushes back
const HARD_WALL = 260;
const SCAN_EVERY = 0.2; // landmark + modal sweep cadence (s)
/** Fly this close to a formed system and its worlds materialize. */
const SYSTEM_NEAR = 5.5;
const SYSTEM_FAR = 7; // hysteresis so discs don't flicker at the border

export const FLIGHT_FOV_BASE = 42;

// ————— Live state —————

export interface FlightNearest {
  label: string;
  kind: 'planet' | 'assembling' | 'system' | 'galaxy';
  d: number;
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
};

const EUL = new Euler(0, 0, 0, 'YXZ');
const Q = new Quaternion();
const FWD = new Vector3();
const RIGHT = new Vector3();
const DESIRED = new Vector3();
const TMP = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Map camera distance from origin onto the journey's 0–1 zoom, so every
 * zoom-keyed fade (stars, cosmic web, captions) behaves in flight. */
export function zoomForDistance(dist: number): number {
  if (dist <= DIST_STOPS[0]) return 0;
  if (dist >= DIST_STOPS[4]) return 1;
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

/** Steering curve: dead zone, then quadratic response for fine aim. */
function steerCurve(v: number): number {
  const a = Math.abs(v);
  if (a <= STEER_DEADZONE) return 0;
  const k = Math.min(1, (a - STEER_DEADZONE) / (1 - STEER_DEADZONE));
  return Math.sign(v) * k * k;
}

/** Begin flight from wherever the camera currently is, facing the same way. */
export function beginFlightFromCamera(camera: Camera): void {
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
  flightInput.cruise = 0;
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
  const f = flightLive;
  const input = flightInput;
  f.ramp = Math.min(1, f.ramp + dt * 2);

  // Housekeeping sweep: landmarks, near-system reveal, modal pause.
  if (f.scanAt < 0 || t - f.scanAt >= SCAN_EVERY) {
    f.scanAt = t;
    scanSurroundings();
  }

  const authority = f.ramp * (f.paused ? 0 : 1);

  // Steering → turn rates → orientation. Roll is cosmetic bank.
  const yawTarget = -steerCurve(input.steerX) * YAW_RATE_MAX * authority;
  const pitchTarget = -steerCurve(input.steerY) * PITCH_RATE_MAX * authority;
  const rateK = 1 - Math.exp(-dt * RATE_RESP);
  f.yawRate += (yawTarget - f.yawRate) * rateK;
  f.pitchRate += (pitchTarget - f.pitchRate) * rateK;
  f.yaw += f.yawRate * dt;
  f.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, f.pitch + f.pitchRate * dt));
  const rollTarget = -f.yawRate * ROLL_BANK - input.strafe * authority * 0.1;
  f.roll += (rollTarget - f.roll) * (1 - Math.exp(-dt * ROLL_RESP));

  // Thrust: velocity chases the desired vector; the cap breathes with range.
  EUL.set(f.pitch, f.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  RIGHT.set(1, 0, 0).applyQuaternion(Q);
  const dist = f.pos.length();
  f.cap = speedCapAt(dist);
  const boosting = input.boost && authority > 0;
  f.boostBlend += ((boosting ? 1 : 0) - f.boostBlend) * (1 - Math.exp(-dt * 4));
  const cap = boosting ? Math.min(f.cap * BOOST_MULT, BOOST_CAP) : f.cap;

  const thrust = Math.max(input.thrust, input.cruise) * authority;
  const braking = input.brake * authority;
  DESIRED.set(0, 0, 0)
    .addScaledVector(FWD, thrust)
    .addScaledVector(RIGHT, input.strafe * authority * 0.5)
    .addScaledVector(UP, input.vert * authority * 0.45);
  const engaged = DESIRED.lengthSq() > 1e-6;
  if (engaged) DESIRED.multiplyScalar(cap);

  const resp = braking > 0 ? RESP_BRAKE : engaged ? RESP_THRUST : RESP_COAST;
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

  f.pos.addScaledVector(f.vel, dt);
  if (f.pos.length() > HARD_WALL) f.pos.setLength(HARD_WALL);
  f.speed = f.vel.length();
}

// ————— Surroundings (HUD copy + the near-system reveal) —————

/** Weighted nearest landmark: bigger things announce themselves from farther. */
function scanSurroundings(): void {
  const f = flightLive;
  f.paused =
    typeof document !== 'undefined' &&
    document.querySelector('.modal-veil, .modal') !== null;

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

  let nearSystem = -1;
  let nearSystemD = Infinity;
  for (let i = 0; i < st.run.systems; i++) {
    const seat = focusSeat({ kind: 'system', index: i }, st.seed, st.run.galaxies);
    consider(seat, `system ${i + 1}`, 'system', 1.4);
    const d = f.pos.distanceTo(seat);
    if (d < nearSystemD) {
      nearSystemD = d;
      nearSystem = i;
    }
  }
  for (let i = 0; i < st.run.galaxies; i++) {
    consider(galaxyPosition(i, st.seed), `galaxy ${i + 1}`, 'galaxy', 4.5);
  }
  f.nearest = bestScore < 4 ? best : null;

  // Near-system reveal, with hysteresis: approach and the worlds come back.
  const bus = useUiBus.getState();
  const current = bus.flightNearSystem;
  let next = current;
  if (current !== null) {
    const seat = focusSeat({ kind: 'system', index: current }, st.seed, st.run.galaxies);
    if (f.pos.distanceTo(seat) > SYSTEM_FAR || current >= st.run.systems) next = null;
  }
  if (next === null && nearSystem >= 0 && nearSystemD <= SYSTEM_NEAR) next = nearSystem;
  if (next !== current) bus.setFlightNearSystem(next);
}

// ————— Camera application (called by CameraRig's flight branch) —————

/** Copy the flight pose onto the camera, with the boost FOV kick. */
export function applyFlightCamera(camera: Camera, dt: number): void {
  const f = flightLive;
  camera.position.copy(f.pos);
  EUL.set(f.pitch, f.yaw, f.roll);
  camera.quaternion.setFromEuler(EUL);
  const pcam = camera as PerspectiveCamera;
  if (typeof pcam.fov === 'number') {
    const target =
      FLIGHT_FOV_BASE + f.boostBlend * 7 + Math.min(1, f.speed / Math.max(f.cap, 1e-6)) * 1.5;
    if (Math.abs(pcam.fov - target) > 0.02) {
      pcam.fov += (target - pcam.fov) * (1 - Math.exp(-dt * 3));
      pcam.updateProjectionMatrix();
    }
  }
}

/** Restore the lens on the way out (the journey never touches FOV). */
export function restoreFov(camera: Camera): void {
  const pcam = camera as PerspectiveCamera;
  if (typeof pcam.fov === 'number' && pcam.fov !== FLIGHT_FOV_BASE) {
    pcam.fov = FLIGHT_FOV_BASE;
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

function inputFromKeys(): void {
  flightInput.thrust = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
  flightInput.brake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
  flightInput.strafe =
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
    (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  flightInput.vert = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0);
  flightInput.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (flightInput.brake > 0) flightInput.cruise = 0;
}

/** Touch: left half steers (a drag-stick), right half is the throttle. */
const touchSteer = { id: -1, x0: 0, y0: 0 };
const touchThrust = { id: -1, downAt: 0, lastTap: 0 };

function overFlightUi(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('.fh-exit, .toast-stack, .modal, .modal-veil, .dock') !== null
  );
}

/**
 * Window-level flight controls. Attached only while the mode is engaged;
 * returns the detach. The pointer steers from screen center (hover a UI
 * control and the stick recenters, so reaching for a button doesn't dive).
 */
export function attachFlightInput(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && el.closest?.('input, textarea, select, [contenteditable]')) return;
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
    inputFromKeys();
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
    if (overFlightUi(e.target)) {
      flightInput.steerX = 0;
      flightInput.steerY = 0;
      return;
    }
    flightInput.steerX = (e.clientX / window.innerWidth) * 2 - 1;
    flightInput.steerY = (e.clientY / window.innerHeight) * 2 - 1;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || overFlightUi(e.target)) return;
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
    state: () => ({
      active: flightLive.active,
      pos: flightLive.pos.toArray(),
      yaw: flightLive.yaw,
      pitch: flightLive.pitch,
      speed: flightLive.speed,
      nearest: flightLive.nearest,
      nearSystem: useUiBus.getState().flightNearSystem,
    }),
    input: flightInput,
  };
}
