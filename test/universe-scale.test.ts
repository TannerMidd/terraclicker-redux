import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { C } from '../src/content/constants';
import { useGame } from '../src/state/store';
import {
  flightLive,
  parentGalaxyReveal,
  resolveWaypoint,
  selectRevealCandidate,
} from '../src/ui/scene/flightControl';
import {
  CURRENT_SYSTEM_ANCHOR,
  GALAXY_REVEAL_FAR,
  GALAXY_REVEAL_NEAR,
  SYSTEM_REVEAL_FAR,
  SYSTEM_REVEAL_NEAR,
  SYSTEM_STAR_SHELL,
  detailWorldRadius,
  detailWorldShell,
  heroWorldRadius,
  orbitSlot,
  systemOrbitOffset,
  type WorldSize,
  visitWorldAnchor,
} from '../src/ui/scene/universeLayout';

const WORLD_SIZES: WorldSize[] = ['small', 'medium', 'large', 'huge'];
const ORBIT_SLOTS = [0, 1, 2, 3, 4] as const;

describe('canonical universe scale', () => {
  it.each(WORLD_SIZES)(
    'keeps the %s detail world at least as large as its hero counterpart',
    (size) => {
      expect(detailWorldRadius(size)).toBeGreaterThanOrEqual(heroWorldRadius(size));
    },
  );

  it.each([0, 1, 19.75, 1_000])(
    'keeps detailed worlds on their slot radius at time %s',
    (time) => {
      const offset = new Vector3();

      for (const slot of ORBIT_SLOTS) {
        systemOrbitOffset(slot, time, true, offset);
        expect(offset.length()).toBeCloseTo(orbitSlot(slot).radius, 10);
      }
    },
  );

  it('keeps the star and largest world shells clear of every orbit', () => {
    const largestWorldShell = Math.max(...WORLD_SIZES.map(detailWorldShell));
    const radii = ORBIT_SLOTS.map((slot) => orbitSlot(slot).radius);

    expect(radii[0]!).toBeGreaterThanOrEqual(SYSTEM_STAR_SHELL + largestWorldShell);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]! - radii[i - 1]!).toBeGreaterThanOrEqual(2 * largestWorldShell);
    }
  });

  it('uses ordered reveal thresholds for stable system and galaxy hysteresis', () => {
    expect(SYSTEM_REVEAL_NEAR).toBeLessThan(SYSTEM_REVEAL_FAR);
    expect(GALAXY_REVEAL_NEAR).toBeLessThan(GALAXY_REVEAL_FAR);
  });

  it('hands an overlapping reveal to a clearly nearer sibling without boundary flicker', () => {
    const current = 0;
    const near = SYSTEM_REVEAL_NEAR;
    const far = SYSTEM_REVEAL_FAR;

    expect(selectRevealCandidate(current, 30, far, 1, 27, near)).toBe(current);
    expect(selectRevealCandidate(current, 30, far, 1, 24, near)).toBe(1);
  });

  it('keeps enter/exit hysteresis when no sibling has earned the handoff', () => {
    expect(
      selectRevealCandidate(
        0,
        SYSTEM_REVEAL_NEAR + 2,
        SYSTEM_REVEAL_FAR,
        null,
        Infinity,
        SYSTEM_REVEAL_NEAR,
      ),
    ).toBe(0);
    expect(
      selectRevealCandidate(
        0,
        SYSTEM_REVEAL_FAR + 1,
        SYSTEM_REVEAL_FAR,
        1,
        SYSTEM_REVEAL_NEAR - 1,
        SYSTEM_REVEAL_NEAR,
      ),
    ).toBe(1);
  });

  it('hands overlapping world detail to a nearer planet with radius-relative hysteresis', () => {
    const shell = detailWorldShell('huge');
    const currentDistance = shell * 5;
    const currentFar = shell * 8;
    const challengerNear = shell * 6;

    expect(selectRevealCandidate(3, currentDistance, currentFar, 4, shell * 4.7, challengerNear))
      .toBe(3);
    expect(selectRevealCandidate(3, currentDistance, currentFar, 4, shell * 4.4, challengerNear))
      .toBe(4);
  });

  it('gives a revealed member system precedence over an overlapping galaxy', () => {
    expect(parentGalaxyReveal(2, 2, 1)).toBe(0);
    expect(parentGalaxyReveal(7, 2, 0)).toBe(1);
    expect(parentGalaxyReveal(10, 2, 1)).toBe(1);
  });

  it('resolves an assembling-world waypoint to its rendered canonical orbit', () => {
    const state = useGame.getState().s;
    const saved = {
      systems: state.run.systems,
      galaxies: state.run.galaxies,
      clock: flightLive.clock,
    };
    const worldIndex = 3;
    const ref = { at: 'focus' as const, kind: 'world' as const, index: worldIndex };
    const resolved = new Vector3();
    const rendered = new Vector3();

    try {
      state.run.systems = 0;
      state.run.galaxies = 0;

      for (const time of [0, 1, 19.75, 1_000]) {
        flightLive.clock = time;
        expect(resolveWaypoint(state, ref, resolved)).toBe(true);
        systemOrbitOffset(worldIndex, time, true, rendered).add(CURRENT_SYSTEM_ANCHOR);
        expect(resolved.distanceTo(rendered)).toBeLessThan(1e-10);
      }
    } finally {
      state.run.systems = saved.systems;
      state.run.galaxies = saved.galaxies;
      flightLive.clock = saved.clock;
    }
  });

  it('resolves a formed-world waypoint to the rendered world anchor', () => {
    const state = useGame.getState().s;
    const saved = {
      seed: state.seed,
      systems: state.run.systems,
      galaxies: state.run.galaxies,
      clock: flightLive.clock,
    };
    const systemIndex = 1;
    const worldIndex = systemIndex * C.PLANETS_PER_SYSTEM + 3;
    const ref = { at: 'focus' as const, kind: 'world' as const, index: worldIndex };
    const resolved = new Vector3();
    const rendered = new Vector3();

    try {
      state.seed = 424242;
      state.run.systems = C.SYSTEMS_PER_GALAXY + 1;
      state.run.galaxies = 1;

      for (const time of [0, 1, 19.75, 1_000]) {
        flightLive.clock = time;
        expect(resolveWaypoint(state, ref, resolved)).toBe(true);
        visitWorldAnchor(worldIndex, state.seed, state.run.galaxies, time, rendered);
        expect(resolved.distanceTo(rendered)).toBeLessThan(1e-10);
      }
    } finally {
      state.seed = saved.seed;
      state.run.systems = saved.systems;
      state.run.galaxies = saved.galaxies;
      flightLive.clock = saved.clock;
    }
  });
});
