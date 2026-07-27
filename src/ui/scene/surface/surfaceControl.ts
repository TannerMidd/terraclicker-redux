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
  buildSurfaceParams,
  bakeTierRows,
  buildNormalMap,
  depositSites,
  findDrySite,
  heightAt,
  groundNormalAt,
  makeTier,
  smoothTier,
  TIER_FAR,
  TIER_NEAR,
  type DepositSpec,
  type SurfaceParams,
  type SurfaceTiers,
} from './terrainField';
import * as audio from '../../audio/audio';

export type { GroundfallSession };

export type GroundfallPhase = 'entry' | 'descent' | 'walk' | 'takeoff';

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
/** Swings a seam takes before it gives: modest ones crack fast. */
export function hitsNeeded(richness: number): number {
  return 2 + richness;
}
const BOARD_RANGE = 6.5;
/** Where the runabout parks, metres from the touchdown point. */
export const SHIP_PARK: { x: number; z: number } = { x: 11, z: -7 };

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
  /** Deposit currently in reach + view, or null. */
  target: null as DepositSpec | null,
  /** 0–1 toward the current seam giving way (hits landed / hits needed). */
  mineProgress: 0,
  /** Deposit ids already worked this stay. */
  mined: new Set<number>(),
  /** What the engage key would do right now, for the HUD. */
  prompt: null as { verb: 'mine' | 'board'; label: string; blocked?: string } | null,
  /** Sun elevation −1…1 (sin of altitude angle); negative is night. */
  sunUp: 0,

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
  hits: new Map<number, number>(),
  /** Camera dip from the last impact, decays fast. */
  kick: 0,
  /** Bumped whenever a deposit finishes, for FX. */
  mineNonce: 0,
  /** Bumped at touchdown, for the dust kick. */
  touchdownNonce: 0,
};

export const surfaceInput = {
  fwd: 0,
  strafe: 0,
  run: false,
  jump: false, // edge, consumed
  engage: false,
};

let session: GroundfallSession | null = null;
let params: SurfaceParams | null = null;
let tiers: SurfaceTiers | null = null;
let deposits: DepositSpec[] = [];
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

// ————— Entry / exit —————

/**
 * Leave the helm for the ground. Called by flightControl when the pilot
 * commits to an approach; the session captures everything the surface needs
 * so it never has to ask the flight scene a question again.
 */
export function beginGroundfall(s: GroundfallSession): void {
  const st = useGame.getState().s;
  heroLifetimeIndex = st.planet.lifetimeIndex;

  // The autoland has opinions about setting down in the sea: it diverts to
  // the nearest dry shelf, and the session records where it ACTUALLY landed
  // so the return-to-orbit sits over the right spot.
  const dry = findDrySite(
    { seed: s.seed, type: s.type, size: s.size, dir: s.dir, aspects: s.aspects },
    DRY_DIR,
  );
  session = s = { ...s, dir: [dry.x, dry.y, dry.z] };

  params = buildSurfaceParams({
    seed: s.seed,
    type: s.type,
    size: s.size,
    dir: s.dir,
    aspects: s.aspects,
  });
  tiers = { near: makeTier(tierSpecs.near), far: makeTier(tierSpecs.far) };
  bakeCursor = { near: 0, far: 0, normals: false };
  deposits = [];

  const live = surfaceLive;
  live.phase = 'entry';
  live.t = 0;
  live.plasma = 0;
  live.blackout = 0;
  live.shake = 0;
  live.genProgress = 0;
  live.ready = false;
  live.samples = 0;
  live.mined.clear();
  live.hits.clear();
  live.target = null;
  live.mineProgress = 0;
  live.swing = 0;
  live.swinging = false;
  live.kick = 0;
  live.prompt = null;
  live.alt = DESCENT_START_ALT;
  live.sunUp = s.sunLocal[1];
  surfaceInput.fwd = 0;
  surfaceInput.strafe = 0;
  surfaceInput.run = false;
  surfaceInput.jump = false;
  surfaceInput.engage = false;

  useUiBus.getState().setGroundfall(s);
  audio.entryRoarStart();
}

/** The walker boarded (or the world was delivered out from under them). */
export function beginTakeoff(): void {
  if (surfaceLive.phase !== 'walk') return;
  bankSamples();
  surfaceLive.phase = 'takeoff';
  surfaceLive.t = 0;
  releasePointer();
  audio.entryRoarStart();
}

/** Deliver what the suit is carrying to the ship's ledger. */
function bankSamples(): void {
  const s = session;
  if (!s || surfaceLive.samples <= 0) {
    if (s) actions.bankGroundSamples(s.worldKey, s.name, 0);
    return;
  }
  actions.bankGroundSamples(s.worldKey, s.name, surfaceLive.samples);
  surfaceLive.samples = 0;
}

/** Hard exit — takeoff finished, or the session must end now. */
export function endGroundfall(): { pos: Vector3; yaw: number; pitch: number } | null {
  const s = session;
  session = null;
  params = null;
  tiers = null;
  deposits = [];
  releasePointer();
  audio.entryRoarStop();
  audio.surfaceWindStop();
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
      deposits = depositSites(params, tiers, 12);
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
  };
}

export function attachSurfaceInput(canvas: HTMLElement): () => void {
  const keys = new Set<string>();
  let jumpHeld = false;

  const apply = () => {
    const h = bindingsHeld(keys);
    surfaceInput.fwd = h.fwd;
    surfaceInput.strafe = h.strafe;
    surfaceInput.run = h.run;
    surfaceInput.engage = h.engage;
    if (h.jump && !jumpHeld) surfaceInput.jump = true;
    jumpHeld = h.jump;
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
    if (!pointerLocked || surfaceLive.phase !== 'walk') return;
    const sens = 0.0021 * flightPrefs().sensitivity;
    surfaceLive.yaw -= e.movementX * sens;
    const invert = flightPrefs().invertPitch ? 1 : -1;
    surfaceLive.pitch = Math.max(
      -1.45,
      Math.min(1.45, surfaceLive.pitch + e.movementY * sens * invert),
    );
  };
  const onPointerDown = (e: PointerEvent) => {
    if (surfaceLive.phase !== 'walk') return;
    const el = e.target as HTMLElement | null;
    if (el?.closest?.('.sh-hud, .modal, .modal-veil, .toast-stack')) return;
    if (!pointerLocked) canvas.requestPointerLock?.();
  };
  const onLockChange = () => {
    pointerLocked = document.pointerLockElement != null;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerlockchange', onLockChange);
  const detach = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('pointerdown', onPointerDown);
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

function smooth01(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}

export interface SurfaceStepResult {
  /** Set when takeoff completes: restore this flight pose and stand down. */
  done: { pos: Vector3; yaw: number; pitch: number } | null;
}

/** One frame. Returns the flight pose when the stay is over. */
export function stepSurface(dt: number, t: number): SurfaceStepResult {
  const live = surfaceLive;
  const s = session;
  if (!s || !params || !tiers) return { done: null };

  live.t += dt;
  const st = useGame.getState().s;
  // The hero world completing while you stand on it: the world you were
  // standing on has been delivered. The runabout very sensibly leaves.
  if (s.hero && st.planet.lifetimeIndex !== heroLifetimeIndex && live.phase === 'walk') {
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

  EUL.set(0, live.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);
  RIGHT.set(1, 0, 0).applyQuaternion(Q);

  WISH.set(0, 0, 0)
    .addScaledVector(FWD, surfaceInput.fwd)
    .addScaledVector(RIGHT, surfaceInput.strafe);
  if (WISH.lengthSq() > 1) WISH.normalize();
  const speed = WALK_SPEED * (surfaceInput.run ? RUN_MULT : 1);
  WISH.multiplyScalar(speed);

  const ground = heightAt(p, tr, live.pos.x, live.pos.z);
  groundNormalAt(p, tr, live.pos.x, live.pos.z, NORMAL);

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
      live.vel.y = JUMP_SPEED;
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

  // The sea (or the lava) is not for walking in. Wading depth, then a wall.
  const liquid = p.seaLevelM;
  if (heightAt(p, tr, live.pos.x, live.pos.z) < liquid - 1.1) {
    TO_TARGET.set(live.pos.x, 0, live.pos.z).normalize();
    live.pos.x -= live.vel.x * dt * 2;
    live.pos.z -= live.vel.z * dt * 2;
    live.vel.x *= 0.4;
    live.vel.z *= 0.4;
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

let footAcc = 0;
function stepFootsteps(dt: number, planar: number): void {
  footAcc += dt * planar;
  const stride = 2.1;
  if (footAcc >= stride) {
    footAcc = 0;
    audio.footstep(false);
  }
}

/** Deposits and the runabout: what the engage key means on foot. */
function stepWork(dt: number): void {
  const live = surfaceLive;
  EUL.set(live.pitch, live.yaw, 0);
  Q.setFromEuler(EUL);
  FWD.set(0, 0, -1).applyQuaternion(Q);

  // Nearest unmined deposit in reach and roughly in view.
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
  if (live.target?.id !== best?.id) live.mineProgress = 0;
  live.target = best;

  // Boarding the runabout outranks a seam you happen to face through it.
  const shipD = Math.hypot(live.pos.x - SHIP_PARK.x, live.pos.z - SHIP_PARK.z);
  const boardable = shipD < BOARD_RANGE;

  if (boardable) {
    const cargo = live.samples > 0 ? ` · bank ${live.samples} samples` : '';
    live.prompt = { verb: 'board', label: `board the runabout${cargo}` };
    if (surfaceInput.engage) beginTakeoff();
    return;
  }

  if (best) {
    const needed = hitsNeeded(best.richness);
    const done = live.hits.get(best.id) ?? 0;
    live.prompt = { verb: 'mine', label: `mine the seam (${best.richness} samples)` };

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
        if (now >= needed) {
          live.mined.add(best.id);
          live.hits.delete(best.id);
          live.samples += best.richness;
          live.mineNonce++;
          audio.crystalShatter();
          audio.sampleChime();
        }
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
  }

  if (live.shake > 0.001 && live.phase !== 'walk') {
    camera.position.x += (Math.sin(t * 31.7) + Math.sin(t * 17.3)) * live.shake * 0.18;
    camera.position.y += (Math.sin(t * 27.1) + Math.sin(t * 41.9)) * live.shake * 0.14;
  }

  if (typeof pcam.fov === 'number') {
    const targetFov = live.phase === 'walk' && surfaceInput.run && surfaceInput.fwd > 0
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
      prompt: surfaceLive.prompt,
      target: surfaceLive.target,
      deposits: deposits.map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z, richness: d.richness })),
      mined: [...surfaceLive.mined],
      session,
      seaLevelM: params?.seaLevelM ?? null,
      sunLocal: session?.sunLocal ?? null,
    }),
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
    detach: () => detachInput?.(),
  };
}
