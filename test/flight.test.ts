import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import {
  beginFlightAt,
  bodyPosition,
  endFlight,
  flightBodies,
  flightInput,
  flightLive,
  speedCapAt,
  stepFlight,
  zoomForDistance,
} from '../src/ui/scene/flightControl';
import { BAND_DISTANCES, BAND_STOPS, WEB_R } from '../src/ui/scene/universeLayout';
import { useGame } from '../src/state/store';
import { deepFieldSites, sensorRange } from '../src/engine/deepField';
import { createSubEthaState, fileBroadcast } from '../src/engine/subEtha';
import { C } from '../src/content/constants';

/** Drive the sim for `seconds` at a fixed 60 Hz, like a well-behaved frame loop. */
function run(seconds: number, from = 0): number {
  const dt = 1 / 60;
  let t = from;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    t += dt;
    stepFlight(dt, t);
  }
  return t;
}

function clearInput(): void {
  flightInput.thrust = 0;
  flightInput.brake = 0;
  flightInput.strafe = 0;
  flightInput.vert = 0;
  flightInput.boost = false;
  flightInput.steerX = 0;
  flightInput.steerY = 0;
  flightInput.cruise = 0;
}

describe('flight mode (the company runabout)', () => {
  beforeEach(() => {
    clearInput();
    endFlight();
    // Pin the universe. A fresh store seeds itself from the clock, so the
    // Deep Field landed somewhere different every run — and since the helm
    // now steers around solids, a landmark that happened to sit in a test's
    // flight path would nudge the ship and fail an assertion perhaps one run
    // in five. Determinism is not optional once the scene pushes back.
    const st = useGame.getState().s;
    st.seed = 424242;
    st.planet.seed = 77;
    st.planet.lifetimeIndex = 1;
    st.run.completedPlanets = [];
    st.run.systems = 0;
    st.run.galaxies = 0;
    st.subEtha = createSubEthaState();
  });

  it('maps camera distance onto the journey zoom, monotonically', () => {
    // Derived from the scale hierarchy, never hardcoded — a re-scale of the
    // universe must not silently leave the helm mapping the wrong bands.
    expect(zoomForDistance(0)).toBe(0);
    expect(zoomForDistance(BAND_DISTANCES[0]!)).toBe(0);
    expect(zoomForDistance(BAND_DISTANCES[4]!)).toBe(1);
    expect(zoomForDistance(BAND_DISTANCES[4]! * 5)).toBe(1);
    for (let i = 1; i <= 3; i++) {
      expect(zoomForDistance(BAND_DISTANCES[i]!)).toBeCloseTo(BAND_STOPS[i]!, 5);
    }
    let prev = 0;
    for (let d = 0; d <= BAND_DISTANCES[4]! * 1.2; d += BAND_DISTANCES[4]! / 400) {
      const z = zoomForDistance(d);
      expect(z).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = z;
    }
  });

  it('speed cap grows with range and stays finite', () => {
    expect(speedCapAt(0)).toBeGreaterThan(0);
    expect(speedCapAt(50)).toBeGreaterThan(speedCapAt(5));
    expect(speedCapAt(10_000)).toBeLessThanOrEqual(90);
  });

  // These two run in OPEN SPACE, well off to one side. Flown at the planet
  // they now decelerate and park on its surface, which is the approach
  // governor doing its job — covered separately below.
  it('thrust accelerates along the nose and respects the cap', () => {
    beginFlightAt(new Vector3(150, 0, 40), 0, 0); // facing -Z, nothing ahead
    flightInput.thrust = 1;
    run(6);
    expect(flightLive.speed).toBeGreaterThan(0.5);
    expect(flightLive.speed).toBeLessThanOrEqual(flightLive.cap + 1e-6);
    expect(flightLive.pos.z).toBeLessThan(8); // it went where the nose pointed
    expect(Math.abs(flightLive.pos.x - 150)).toBeLessThan(0.5);
  });

  it('boost exceeds the cruise cap but never the boost ceiling', () => {
    beginFlightAt(new Vector3(150, 0, 90), 0, 0);
    flightInput.thrust = 1;
    flightInput.boost = true;
    run(8);
    expect(flightLive.speed).toBeGreaterThan(flightLive.cap);
    expect(flightLive.speed).toBeLessThanOrEqual(260 + 1e-6);
  });

  it('will not fly through the world it is standing on', () => {
    // Straight at the planet, full boost, for long enough to cross it twice.
    beginFlightAt(new Vector3(0, 0, 8), 0, 0);
    flightInput.thrust = 1;
    flightInput.boost = true;
    run(14);
    // Parked on the hull shell, not inside it and not out the far side.
    expect(flightLive.pos.length()).toBeGreaterThan(1.05);
    expect(flightLive.pos.z).toBeGreaterThan(0);
    // Held against the shell with the throttle still open, so it creeps at
    // the surface cap rather than stopping dead. Anything faster than that
    // would mean the governor had let go.
    expect(flightLive.speed).toBeLessThanOrEqual(0.12);
  });

  it('cannot tunnel through a settled world, at any speed the drive can make', () => {
    // Give the current system some delivered worlds to orbit it.
    const s = useGame.getState().s;
    const saved = s.run.completedPlanets;
    s.run.completedPlanets = [0, 1, 2, 3].map((i) => ({
      lifetimeIndex: i + 1,
      seed: 1000 + i,
      type: 'terrestrial' as const,
      size: 'medium' as const,
      name: `Test World ${i + 1}`,
      quirks: [],
      survey: null,
      completionMs: 1,
      bottleneck: 'thermal' as const,
      installations: ['seedProbe'],
    }));

    try {
      // One step to build the body list, then find a world to aim at.
      beginFlightAt(new Vector3(0, 0, 40), 0, 0);
      stepFlight(1 / 60, 0);
      const world = flightBodies().find((b) => b.orbit !== null);
      expect(world).toBeDefined();
      if (!world) return;

      const at = new Vector3();
      const from = new Vector3();
      bodyPosition(world, 0, at);
      // Start FAR out on a collision course, so the ship arrives at speed.
      // Close in, the approach governor alone is enough and this proves
      // nothing — the tunneling case is the one that comes in hot.
      from.copy(at).add(new Vector3(0, 0, 60));
      const to = at.clone().sub(from).normalize();
      beginFlightAt(from, Math.atan2(-to.x, -to.z), Math.asin(to.y));
      flightInput.thrust = 1;
      flightInput.boost = true;

      // Check the invariant EVERY step: a point test would see the ship
      // outside on both sides of a frame it spent entirely inside.
      let worst = Infinity;
      let t = 0;
      for (let i = 0; i < 60 * 20; i++) {
        t += 1 / 60;
        stepFlight(1 / 60, t);
        bodyPosition(world, t, at);
        worst = Math.min(worst, flightLive.pos.distanceTo(at));
      }
      expect(worst).toBeGreaterThan(world.radius - 0.02);
    } finally {
      s.run.completedPlanets = saved;
    }
  });

  it('treats the hero planet’s moons as solid, wherever they have got to', () => {
    // Seed 202 gives this world two moons; seed 77 (the default here) gives
    // none, which is exactly the sort of thing that hides a bug.
    const s = useGame.getState().s;
    s.planet.seed = 202;

    beginFlightAt(new Vector3(0, 0, 12), 0, 0);
    stepFlight(1 / 60, 0);
    const moons = flightBodies().filter((b) => b.label === 'the moon');
    expect(moons).toHaveLength(2);

    const moon = moons[0]!;
    const at = new Vector3();
    bodyPosition(moon, 0, at);
    // Come at it from outside the system, hard.
    const from = at.clone().setLength(at.length() + 30);
    const to = at.clone().sub(from).normalize();
    beginFlightAt(from, Math.atan2(-to.x, -to.z), Math.asin(to.y));
    flightInput.thrust = 1;
    flightInput.boost = true;

    let worst = Infinity;
    let t = 0;
    for (let i = 0; i < 60 * 30; i++) {
      t += 1 / 60;
      stepFlight(1 / 60, t);
      bodyPosition(moon, t, at);
      worst = Math.min(worst, flightLive.pos.distanceTo(at));
    }
    expect(worst).toBeGreaterThan(moon.radius - 0.02);
  });

  it('holds its heading when nobody is steering, and self-levels', () => {
    // The comfort guarantee. The old scheme mapped pointer POSITION to turn
    // rate, so the ship rotated forever unless the mouse sat exactly at
    // screen centre — there was no way to express "fly straight". Neutral
    // input must now mean neutral, and the bank must come back to level.
    beginFlightAt(new Vector3(150, 0, 40), 0.4, 0.2);
    flightInput.thrust = 1;
    flightInput.steerX = 0.9; // bank it over first
    run(2);
    expect(Math.abs(flightLive.roll)).toBeGreaterThan(0.01);

    flightInput.steerX = 0;
    flightInput.steerY = 0;
    run(4);
    const yaw = flightLive.yaw;
    const pitch = flightLive.pitch;
    run(6);
    expect(Math.abs(flightLive.yaw - yaw)).toBeLessThan(1e-3);
    expect(Math.abs(flightLive.pitch - pitch)).toBeLessThan(1e-3);
    expect(Math.abs(flightLive.roll)).toBeLessThan(1e-3); // wings level again
  });

  it('keeps the optical flow calm at every altitude', () => {
    // What makes a close pass sickening is angular rate, not speed. Whatever
    // the altitude, the surface must not sweep past faster than this.
    for (const alt of [0.05, 0.3, 1, 2, 4, 9, 20]) {
      beginFlightAt(new Vector3(0, 0, 1.14 + alt), Math.PI, 0);
      flightInput.thrust = 1;
      run(0.5);
      const omega = flightLive.cap / flightLive.pos.length();
      expect(omega).toBeLessThan(0.45);
    }
  });

  it('governs speed by height above the nearest surface, boost included', () => {
    // Far from everything: the range cap is what limits you.
    beginFlightAt(new Vector3(0, 0, 420), 0, 0);
    flightInput.thrust = 1;
    run(6);
    const openSpace = flightLive.cap;

    // Close in: the ceiling collapses toward the base cap no matter the range.
    beginFlightAt(new Vector3(0, 0, 1.6), 0, 0);
    flightInput.thrust = 1;
    flightInput.boost = true;
    run(6);
    expect(flightLive.cap).toBeLessThan(openSpace);
    expect(flightLive.speed).toBeLessThan(3);
    expect(flightLive.altitude).toBeLessThan(0.6);
    expect(flightLive.altitudeOf).toBeTruthy();
  });

  it('braking brings the runabout to a stop', () => {
    beginFlightAt(new Vector3(0, 0, 12), 0, 0);
    flightInput.thrust = 1;
    const t = run(4);
    flightInput.thrust = 0;
    flightInput.brake = 1;
    run(3, t);
    expect(flightLive.speed).toBeLessThan(0.05);
  });

  it('steering turns the nose (right deflection yaws right, banks the hull)', () => {
    beginFlightAt(new Vector3(0, 0, 10), 0, 0);
    flightInput.steerX = 1;
    run(1.5);
    expect(flightLive.yaw).toBeLessThan(-0.3); // clockwise from above
    expect(flightLive.roll).toBeGreaterThan(0.05); // banked into the turn
    // Pitch never escapes the arcade clamp, whatever the input does.
    flightInput.steerX = 0;
    flightInput.steerY = -1;
    run(6, 1.5);
    expect(flightLive.pitch).toBeLessThanOrEqual(1.32 + 1e-6);
  });

  it('the soft wall keeps the ship inside the neighbourhood of everything', () => {
    beginFlightAt(new Vector3(0, 0, WEB_R * 1.4), 0, Math.PI / 64); // nose out into nothing
    flightLive.yaw = Math.PI; // face +Z, straight away from home
    flightInput.thrust = 1;
    flightInput.boost = true;
    run(30);
    expect(flightLive.pos.length()).toBeLessThanOrEqual(WEB_R * 1.7 + 1e-6);
  });

  it('cruise trim holds speed without a key held', () => {
    beginFlightAt(new Vector3(0, 0, 14), 0, 0);
    flightInput.cruise = 0.6;
    run(5);
    expect(flightLive.speed).toBeGreaterThan(flightLive.cap * 0.35);
  });

  it('a landmark the Sub-Etha named reads at extended sensor range', () => {
    const s = useGame.getState().s;
    s.subEtha = createSubEthaState();
    // Nearest reachable landmark, so the standoff stays well inside the walls.
    const site = deepFieldSites(s.seed)
      .filter((x) => !x.def.unreachable)
      .sort((a, b) => Math.hypot(...a.pos) - Math.hypot(...b.pos))[0]!;
    const base = sensorRange(s.expedition);
    // Park in the gap: past ordinary sensors, inside the rumoured reach.
    const gap = base * ((1 + C.SUBETHA_RUMOUR_RANGE_MULT) / 2);
    const pos = new Vector3(site.pos[0], site.pos[1] + gap, site.pos[2]);

    beginFlightAt(pos, 0, 0);
    run(0.5);
    expect(flightLive.contacts.find((c) => c.id === site.def.id)).toBeUndefined();

    // Now the channel points at it, and the same spot is close enough.
    fileBroadcast(s, 'rumour', 'something out that way, apparently', site.def.id);
    beginFlightAt(pos, 0, 0);
    run(0.5);
    const contact = flightLive.contacts.find((c) => c.id === site.def.id);
    expect(contact).toBeDefined();
    expect(contact?.rumoured).toBe(true);

    s.subEtha = createSubEthaState();
  });
});
