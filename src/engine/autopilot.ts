import type { NavSolution } from './navigation';

export type AutopilotPhase = 'align' | 'cruise' | 'brake' | 'arrived';

export interface AutopilotInput {
  nav: NavSolution;
  speed: number;
  /** Current non-boost speed ceiling. */
  cap: number;
  /** Distance at which the destination owns the ship and the route is complete. */
  arrivalRadius: number;
}

export interface AutopilotCommand {
  phase: AutopilotPhase;
  /** Same screen-space convention as the helm: +right and +down. */
  steerX: number;
  steerY: number;
  thrust: number;
  brake: number;
  boost: boolean;
}

const ALIGN_TOLERANCE = 0.075;
const BRAKE_MARGIN = 1.35;
const ARRIVAL_CAPTURE_MARGIN = 0.4;

function clamp(v: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pure destination pilot.
 *
 * It deliberately issues the same five commands a human pilot can. The scene
 * still owns collision cushions, approach speed, cargo inertia and refits, so
 * engaging the computer cannot bypass a rule the ship obeys by hand.
 */
export function autopilotCommand(input: AutopilotInput): AutopilotCommand {
  const { nav } = input;
  const arrivalRadius = Math.max(0.25, input.arrivalRadius);
  const remaining = Math.max(0, nav.distance - arrivalRadius);
  const steerX = clamp(nav.bearing * 1.7);
  const steerY = clamp(-nav.elevation * 1.7);
  const angularError = Math.max(Math.abs(nav.bearing), Math.abs(nav.elevation));

  // Capture a ship that has settled just outside the nominal boundary. Without
  // this small berth the exponential brake can stop a few tenths short and
  // hold forever; the margin remains inside every interaction's usable range.
  if (remaining <= ARRIVAL_CAPTURE_MARGIN) {
    return {
      phase: 'arrived',
      steerX,
      steerY,
      thrust: 0,
      brake: input.speed > 0.025 ? 1 : 0,
      boost: false,
    };
  }

  // Brake for the distance the exponential brake actually consumes, plus a
  // margin for frame cadence, cargo and a destination that may be orbiting.
  const brakingRoom = Math.max(
    0.75,
    nav.brakingDistance * BRAKE_MARGIN + Math.min(4, input.speed * 0.08),
  );
  if (
    remaining <= brakingRoom
    || (nav.closingSpeed > 0 && nav.brakingDistance >= remaining)
  ) {
    return {
      phase: 'brake',
      steerX,
      steerY,
      thrust: 0,
      brake: 1,
      boost: false,
    };
  }

  // Turn first. Thrusting while the destination is behind the beam makes a
  // wide, baffling spiral; shedding an obviously wrong-way velocity makes the
  // alignment settle quickly and predictably.
  if (angularError > ALIGN_TOLERANCE) {
    const wrongWay = nav.closingSpeed < -0.05;
    return {
      phase: 'align',
      steerX,
      steerY,
      thrust: 0,
      brake: wrongWay || input.speed > Math.max(1.5, input.cap * 0.4) ? 1 : 0,
      boost: false,
    };
  }

  // Boost only on a genuinely long, settled leg. The threshold grows with the
  // current stopping room, so a loaded freighter never borrows speed it has no
  // space to return.
  const boost = remaining > Math.max(90, nav.brakingDistance * 5 + 30);
  return {
    phase: 'cruise',
    steerX,
    steerY,
    thrust: 1,
    brake: 0,
    boost,
  };
}
