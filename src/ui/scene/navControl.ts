/**
 * Live navigation state, shared between CameraRig (which owns the camera),
 * the scene's click handlers (which must ignore clicks that were really
 * drags), and the HUD (recenter affordance). Mutable module state on
 * purpose — this is per-frame data, same pattern as zoomLive.
 */
import { Vector3 } from 'three/webgpu';
import { SETTLEMENT_SNAP_RAD } from '../../engine/settlements';

/**
 * Exact world-space positions of the visited system's worlds, written by
 * FocusedSystem every frame (they orbit AND the whole system slowly spins).
 * Keyed by global completed-planet index. The camera reads these to track
 * a focused world instead of re-deriving an approximation.
 */
export const worldAnchors = new Map<number, Vector3>();

/**
 * Live spin (rotation.y, radians) of each settled world's planet mesh,
 * written by FocusedSystem beside the anchors. Keyed by LIFETIME INDEX —
 * the key a landing carries. The settlement lights ride the spinning mesh,
 * so a groundfall on a delivered world must un-spin its approach direction
 * into the record's own frame or the pilot lands beside the lights they
 * aimed at, which is the sort of thing people write in to complain about.
 */
export const worldSpins = new Map<number, number>();

/**
 * How fast a delivered world turns (rad/s) — and why this is not a free
 * aesthetic choice.
 *
 * The helm's approach governor caps how fast you may move AROUND a body at
 * `OMEGA_MAX` (flightControl.ts), because optical flow rather than linear
 * speed is what makes a planet feel large. A world that turns FASTER than
 * that cap cannot be approached at all: the ground outruns the ship by
 * construction, every point on the surface is unreachable, and the
 * settlement you aimed at is long gone before the landing envelope opens.
 * These worlds turned at 0.35 — an eighteen-second day, and more than twice
 * the rate the pilot is permitted to chase it with. Landing at a named town
 * was arithmetically impossible, not merely hard.
 *
 * Being under OMEGA_MAX is necessary but not sufficient: it only means the
 * chase is winnable in principle. What actually decides whether a pilot can
 * land where they aimed is how far the target DRIFTS during the approach.
 * Aim at a town four radii out, hold the thrust in, and the run takes the
 * better part of twenty seconds — so a world that turns a town out of the
 * autoland's snap cone inside that window is one where aiming is theatre,
 * however winnable a chase would be. (Measured: at 0.045 the town drifted
 * 39° against an 11° cone, and a straight-in approach still arrived over
 * empty ground.)
 *
 * So the rate is DERIVED rather than chosen — a world may not turn a town
 * out of the cone faster than a pilot can fly the approach to it. Change
 * either input and this follows. test/flight-regressions.test.ts holds both
 * properties, because a number that looks like set dressing is exactly the
 * kind that gets "tuned" back into impossibility.
 */
/** How long a committed approach takes, from sighting the lights to entry. */
const APPROACH_SECONDS = 20;
export const SETTLED_SPIN_RATE = SETTLEMENT_SNAP_RAD / APPROACH_SECONDS;

export const navLive = {
  /** Orbit target angles (radians), written by input, chased by the camera. */
  tYaw: 0,
  tPitch: 0,
  /** Smoothed orbit angles, written back by CameraRig every frame. */
  yaw: 0,
  pitch: 0,
  /** True while a pointer drag is steering the camera. */
  dragging: false,
  /** Wall-clock ms of the last drag end — clicks right after are ignored. */
  lastDragEndAt: 0,
  /** True while a focus-to-focus flight is in progress (HUD may calm down). */
  flying: false,
};

export const PITCH_MIN = -0.62;
export const PITCH_MAX = 0.95;

export function nudgeOrbit(dxPx: number, dyPx: number): void {
  navLive.tYaw -= dxPx * 0.0042;
  navLive.tPitch = Math.max(
    PITCH_MIN,
    Math.min(PITCH_MAX, navLive.tPitch + dyPx * 0.0034),
  );
}

export function resetOrbit(): void {
  navLive.tYaw = 0;
  navLive.tPitch = 0;
}

/** True when the orbit is meaningfully off neutral (show the recenter hint). */
export function orbitEngaged(): boolean {
  return Math.abs(navLive.yaw) > 0.04 || Math.abs(navLive.pitch) > 0.04;
}

/**
 * Click gating: a pointerup at the end of a camera drag still produces a
 * browser click. Scene click handlers call this and stand down.
 */
export function clickSuppressed(): boolean {
  return navLive.dragging || performance.now() - navLive.lastDragEndAt < 180;
}
