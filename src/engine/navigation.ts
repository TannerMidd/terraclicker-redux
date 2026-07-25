/**
 * Civil Navigation, Provisional.
 *
 * The cockpit knows where it is and what is near it, and has never been able
 * to answer the only question a pilot actually asks: which way, and how long.
 * Everything here is the arithmetic behind that — bearing to a pinned
 * waypoint, distance, closing speed, arrival estimate, and how much room it
 * takes to stop.
 *
 * Deliberately free of three.js and of the scene: positions arrive as plain
 * tuples, so this is unit-testable with no canvas anywhere, and the flight
 * layer is responsible for turning a `WaypointRef` into coordinates. The
 * engine does not import the renderer.
 *
 * Angles follow the flight rig's convention: yaw around +Y with 0 looking down
 * −Z, pitch positive when nose-up.
 */

export type Vec3 = readonly [number, number, number];

export interface NavSolution {
  distance: number;
  /**
   * Signed yaw error in radians, wrapped to (−π, π]. **Negative is port**, so
   * the value can be used directly as a horizontal offset when drawing the
   * bearing ribbon.
   *
   * Note this is the negation of the rig's own yaw delta. `flightControl`
   * builds orientation from a YXZ Euler, which makes *increasing* yaw a turn
   * to port; a ribbon that slid right when the target was left would be worse
   * than no ribbon, so the sign is flipped here, once, rather than at every
   * call site.
   */
  bearing: number;
  /** Signed pitch error in radians, positive when the waypoint is above. */
  elevation: number;
  /** Component of velocity along the line to the waypoint. Negative = opening. */
  closingSpeed: number;
  /** Seconds to arrive at the current closing speed, or null if not closing. */
  etaSeconds: number | null;
  /**
   * Room the rig needs to shed its current speed. Exponential decay never
   * reaches zero, so this is the total distance still to be travelled while
   * stopping — which is the honest answer to "will I make the turn".
   */
  brakingDistance: number;
  /**
   * True when stopping would take more room than is left. The cockpit says so
   * plainly rather than letting the pilot discover it by sailing past.
   */
  overshooting: boolean;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Wrap to (−π, π] so a bearing never reads as "turn 350° right". */
export function wrapAngle(radians: number): number {
  let a = radians;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export interface NavInput {
  pos: Vec3;
  vel: Vec3;
  /** Radians, matching the flight rig. */
  yaw: number;
  pitch: number;
  /**
   * Exponential brake response, per second — the `resp` in flightControl's
   * `vel.lerp(0, 1 - exp(-dt * resp))`. The rig does not decelerate at a
   * constant rate, so the textbook v²/2a would quietly understate the room a
   * loaded hold needs. Velocity decays as v·e^(−kt), whose total remaining
   * distance is v/k, and that is the number the cockpit should show.
   */
  brakeRate: number;
}

/**
 * Solve the whole cockpit readout in one pass.
 *
 * Returns `null` for a waypoint that is effectively underfoot — inside
 * `arrivedWithin` there is no meaningful bearing, and drawing a wildly
 * swinging ribbon at the moment of arrival is worse than drawing nothing.
 */
export function solveNav(
  input: NavInput,
  target: Vec3,
  arrivedWithin = 0.001,
): NavSolution | null {
  const toTarget = sub(target, input.pos);
  const distance = length(toTarget);
  if (distance <= arrivedWithin) return null;

  // The yaw that would point at this, in the rig's own terms — the same
  // expression flightControl uses when a jump aims the nose at a landmark.
  const desiredYaw = Math.atan2(-toTarget[0], -toTarget[2]);
  const bearing = -wrapAngle(desiredYaw - input.yaw);

  const horizontal = Math.hypot(toTarget[0], toTarget[2]);
  const desiredPitch = Math.atan2(toTarget[1], horizontal);
  const elevation = wrapAngle(desiredPitch - input.pitch);

  const unit: Vec3 = [toTarget[0] / distance, toTarget[1] / distance, toTarget[2] / distance];
  const closingSpeed = dot(input.vel, unit);

  // Only a real approach gets an estimate. Drifting sideways past something is
  // not arriving at it, and an ETA that counts down while you miss is a lie.
  const etaSeconds = closingSpeed > 0.0001 ? distance / closingSpeed : null;

  const speed = length(input.vel);
  const brakingDistance = input.brakeRate > 0 ? speed / input.brakeRate : Infinity;

  return {
    distance,
    bearing,
    elevation,
    closingSpeed,
    etaSeconds,
    brakingDistance,
    overshooting: closingSpeed > 0 && brakingDistance > distance,
  };
}

/** "4m 12s", "18s", "—" — the ETA as the cockpit prints it. */
export function etaLabel(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  if (seconds < 1) return 'now';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Compass-ish label for a bearing, for the readout beside the ribbon. */
export function bearingLabel(bearing: number): string {
  const deg = Math.round((bearing * 180) / Math.PI);
  if (Math.abs(deg) <= 2) return 'dead ahead';
  if (Math.abs(deg) >= 178) return 'astern';
  return deg < 0 ? `${Math.abs(deg)}° port` : `${deg}° starboard`;
}
