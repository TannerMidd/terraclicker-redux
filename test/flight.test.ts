import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import {
  beginFlightAt,
  endFlight,
  flightInput,
  flightLive,
  speedCapAt,
  stepFlight,
  zoomForDistance,
} from '../src/ui/scene/flightControl';
import { BAND_STOPS } from '../src/ui/scene/universeLayout';

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
  });

  it('maps camera distance onto the journey zoom, monotonically', () => {
    expect(zoomForDistance(0)).toBe(0);
    expect(zoomForDistance(6.57)).toBe(0);
    expect(zoomForDistance(96.5)).toBe(1);
    expect(zoomForDistance(500)).toBe(1);
    // Band stops land where the journey parked its camera.
    expect(zoomForDistance(13.9)).toBeCloseTo(BAND_STOPS[1], 5);
    expect(zoomForDistance(27.7)).toBeCloseTo(BAND_STOPS[2], 5);
    expect(zoomForDistance(50.3)).toBeCloseTo(BAND_STOPS[3], 5);
    let prev = 0;
    for (let d = 0; d <= 120; d += 0.5) {
      const z = zoomForDistance(d);
      expect(z).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = z;
    }
  });

  it('speed cap grows with range and stays finite', () => {
    expect(speedCapAt(0)).toBeGreaterThan(0);
    expect(speedCapAt(50)).toBeGreaterThan(speedCapAt(5));
    expect(speedCapAt(10_000)).toBeLessThanOrEqual(34);
  });

  it('thrust accelerates along the nose and respects the cap', () => {
    beginFlightAt(new Vector3(0, 0, 8), 0, 0); // facing -Z, parked off the planet
    flightInput.thrust = 1;
    run(6);
    expect(flightLive.speed).toBeGreaterThan(0.5);
    expect(flightLive.speed).toBeLessThanOrEqual(flightLive.cap + 1e-6);
    expect(flightLive.pos.z).toBeLessThan(8); // it went where the nose pointed
    expect(Math.abs(flightLive.pos.x)).toBeLessThan(0.5);
  });

  it('boost exceeds the cruise cap but never the boost ceiling', () => {
    beginFlightAt(new Vector3(0, 0, 30), 0, 0);
    flightInput.thrust = 1;
    flightInput.boost = true;
    run(8);
    expect(flightLive.speed).toBeGreaterThan(flightLive.cap);
    expect(flightLive.speed).toBeLessThanOrEqual(46 + 1e-6);
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
    beginFlightAt(new Vector3(0, 0, 205), 0, Math.PI / 64); // nose out into nothing
    flightLive.yaw = Math.PI; // face +Z, straight away from home
    flightInput.thrust = 1;
    flightInput.boost = true;
    run(30);
    expect(flightLive.pos.length()).toBeLessThanOrEqual(260 + 1e-6);
  });

  it('cruise trim holds speed without a key held', () => {
    beginFlightAt(new Vector3(0, 0, 14), 0, 0);
    flightInput.cruise = 0.6;
    run(5);
    expect(flightLive.speed).toBeGreaterThan(flightLive.cap * 0.35);
  });
});
