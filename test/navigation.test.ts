import { describe, expect, it } from 'vitest';
import {
  bearingLabel,
  etaLabel,
  solveNav,
  wrapAngle,
  type NavInput,
} from '../src/engine/navigation';

const rest = (over: Partial<NavInput> = {}): NavInput => ({
  pos: [0, 0, 0],
  vel: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  brakeRate: 2,
  ...over,
});

describe('civil navigation', () => {
  it('reads dead ahead when the waypoint is dead ahead', () => {
    // yaw 0 looks down -Z, which is the rig's convention.
    const nav = solveNav(rest(), [0, 0, -100])!;
    expect(nav.distance).toBeCloseTo(100, 6);
    expect(nav.bearing).toBeCloseTo(0, 6);
    expect(nav.elevation).toBeCloseTo(0, 6);
    expect(bearingLabel(nav.bearing)).toBe('dead ahead');
  });

  it('signs bearing so port is negative and starboard positive', () => {
    const port = solveNav(rest(), [-100, 0, 0])!;
    const starboard = solveNav(rest(), [100, 0, 0])!;
    expect(port.bearing).toBeLessThan(0);
    expect(starboard.bearing).toBeGreaterThan(0);
    expect(bearingLabel(port.bearing)).toContain('port');
    expect(bearingLabel(starboard.bearing)).toContain('starboard');
  });

  it('never asks for a turn the long way round', () => {
    // A waypoint just to port of a rig facing almost the other way must read
    // as a small correction, not 359 degrees.
    for (let yaw = -8; yaw <= 8; yaw += 0.37) {
      const nav = solveNav(rest({ yaw }), [30, 0, -40])!;
      expect(Math.abs(nav.bearing)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI, 6);
  });

  it('reports elevation when the waypoint is above or below', () => {
    expect(solveNav(rest(), [0, 100, -1])!.elevation).toBeGreaterThan(0);
    expect(solveNav(rest(), [0, -100, -1])!.elevation).toBeLessThan(0);
  });

  it('gives an ETA only for an approach that is actually closing', () => {
    const closing = solveNav(rest({ vel: [0, 0, -10] }), [0, 0, -100])!;
    expect(closing.closingSpeed).toBeCloseTo(10, 6);
    expect(closing.etaSeconds).toBeCloseTo(10, 6);

    // Drifting sideways past something is not arriving at it.
    const passing = solveNav(rest({ vel: [10, 0, 0] }), [0, 0, -100])!;
    expect(passing.closingSpeed).toBeCloseTo(0, 6);
    expect(passing.etaSeconds).toBeNull();

    const opening = solveNav(rest({ vel: [0, 0, 10] }), [0, 0, -100])!;
    expect(opening.closingSpeed).toBeLessThan(0);
    expect(opening.etaSeconds).toBeNull();
  });

  it('knows when there is not enough room left to stop', () => {
    // v/k = 10/2 = 5 units of travel left while stopping; 50 away is roomy.
    const roomy = solveNav(rest({ vel: [0, 0, -10] }), [0, 0, -50])!;
    expect(roomy.brakingDistance).toBeCloseTo(5, 6);
    expect(roomy.overshooting).toBe(false);

    // Same speed, 2 units away — already past the point of stopping.
    const late = solveNav(rest({ vel: [0, 0, -10] }), [0, 0, -2])!;
    expect(late.overshooting).toBe(true);
  });

  it('does not call it an overshoot when you are heading away', () => {
    const leaving = solveNav(rest({ vel: [0, 0, 40] }), [0, 0, -2])!;
    expect(leaving.overshooting).toBe(false);
  });

  it('declines to draw a bearing for something underfoot', () => {
    expect(solveNav(rest(), [0, 0, 0])).toBeNull();
    expect(solveNav(rest(), [0, 0, -0.0005])).toBeNull();
  });

  it('prints an estimate a person can read', () => {
    expect(etaLabel(null)).toBe('—');
    expect(etaLabel(Infinity)).toBe('—');
    expect(etaLabel(0.4)).toBe('now');
    expect(etaLabel(18)).toBe('18s');
    expect(etaLabel(252)).toBe('4m 12s');
    expect(etaLabel(120)).toBe('2m');
    expect(etaLabel(3_900)).toBe('1h 5m');
  });
});
