import { afterEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { autopilotCommand } from '../src/engine/autopilot';
import type { NavSolution } from '../src/engine/navigation';
import { SORTIE_FLAG } from '../src/content/firstSortie';
import { useGame } from '../src/state/store';
import {
  beginFlightAt,
  beginFlightFromCamera,
  endFlight,
  flightInput,
  flightLive,
  stepFlight,
  toggleAutopilot,
} from '../src/ui/scene/flightControl';

function nav(patch: Partial<NavSolution> = {}): NavSolution {
  return {
    distance: 200,
    bearing: 0,
    elevation: 0,
    closingSpeed: 10,
    etaSeconds: 20,
    brakingDistance: 4,
    overshooting: false,
    ...patch,
  };
}

describe('destination autopilot', () => {
  it('aligns in both axes before applying thrust', () => {
    const command = autopilotCommand({
      nav: nav({ bearing: 0.8, elevation: -0.25, closingSpeed: -2 }),
      speed: 4,
      cap: 20,
      arrivalRadius: 5,
    });
    expect(command.phase).toBe('align');
    expect(command.steerX).toBeGreaterThan(0);
    expect(command.steerY).toBeGreaterThan(0);
    expect(command.thrust).toBe(0);
    expect(command.brake).toBe(1);
  });

  it('cruises and only boosts when there is ample stopping room', () => {
    const long = autopilotCommand({
      nav: nav({ distance: 400, brakingDistance: 30 }),
      speed: 40,
      cap: 45,
      arrivalRadius: 5,
    });
    expect(long).toMatchObject({ phase: 'cruise', thrust: 1, brake: 0, boost: true });

    const shorter = autopilotCommand({
      nav: nav({ distance: 120, brakingDistance: 30 }),
      speed: 40,
      cap: 45,
      arrivalRadius: 5,
    });
    expect(shorter.phase).toBe('cruise');
    expect(shorter.boost).toBe(false);
  });

  it('brakes using the real exponential stopping distance plus margin', () => {
    const command = autopilotCommand({
      nav: nav({ distance: 34, brakingDistance: 23, closingSpeed: 30 }),
      speed: 30,
      cap: 40,
      arrivalRadius: 4,
    });
    expect(command).toMatchObject({ phase: 'brake', thrust: 0, brake: 1, boost: false });
  });

  it('holds the brake inside the arrival envelope', () => {
    const moving = autopilotCommand({
      nav: nav({ distance: 4.5, brakingDistance: 0.2 }),
      speed: 0.4,
      cap: 2,
      arrivalRadius: 5,
    });
    expect(moving).toMatchObject({ phase: 'arrived', brake: 1 });

    const stopped = autopilotCommand({
      nav: nav({ distance: 4.5, brakingDistance: 0 }),
      speed: 0.01,
      cap: 2,
      arrivalRadius: 5,
    });
    expect(stopped).toMatchObject({ phase: 'arrived', brake: 0 });
  });

  it('captures a ship that the brake settles just outside the nominal radius', () => {
    const captured = autopilotCommand({
      nav: nav({ distance: 5.3, brakingDistance: 0, closingSpeed: 0 }),
      speed: 0.01,
      cap: 2,
      arrivalRadius: 5,
    });
    expect(captured.phase).toBe('arrived');

    const approaching = autopilotCommand({
      nav: nav({ distance: 5.5, brakingDistance: 0, closingSpeed: 0 }),
      speed: 0.01,
      cap: 2,
      arrivalRadius: 5,
    });
    expect(approaching.phase).not.toBe('arrived');
  });
});


describe('autopilot flight integration', () => {
  afterEach(() => {
    flightInput.strafe = 0;
    endFlight();
  });

  it('launches near home instead of marooning the ship at a broad map camera', () => {
    const state = useGame.getState().s;
    state.flags[SORTIE_FLAG] = 1;
    state.expedition.pinned = null;
    const camera = new PerspectiveCamera(42, 1, 0.1, 4200);
    camera.position.set(600, 80, 900);

    beginFlightFromCamera(camera);

    expect(flightLive.pos.length()).toBeGreaterThan(2);
    expect(flightLive.pos.length()).toBeLessThan(6);
    expect(flightLive.pos.z).toBeLessThan(0);
  });

  it('takes the throttle for a known pin and yields immediately to manual helm input', () => {
    const state = useGame.getState().s;
    state.seed = 424242;
    state.run.completedPlanets = [];
    state.run.systems = 0;
    state.run.galaxies = 0;
    state.expedition.pinned = 'home:planet';

    beginFlightAt(new Vector3(0, 0, 32), 0, 0);
    let time = 0;
    for (let i = 0; i < 24; i++) {
      time += 1 / 60;
      stepFlight(1 / 60, time);
    }

    expect(flightLive.navLabel).toBe(state.planet.name);
    expect(toggleAutopilot()).toBe(true);
    expect(flightLive.courseHold).toBe(true);

    const start = flightLive.pos.z;
    for (let i = 0; i < 120; i++) {
      time += 1 / 60;
      stepFlight(1 / 60, time);
    }
    expect(flightLive.pos.z).toBeLessThan(start);
    expect(flightLive.autopilotPhase).toBe('cruise');

    flightInput.strafe = 1;
    stepFlight(1 / 60, time + 1 / 60);
    expect(flightLive.courseHold).toBe(false);
    expect(flightLive.autopilotPhase).toBe('off');
  });

  it('aligns, cruises, brakes, and arrives from a crosswise launch', () => {
    const state = useGame.getState().s;
    state.flags[SORTIE_FLAG] = 1;
    state.seed = 434343;
    state.run.completedPlanets = [];
    state.run.systems = 0;
    state.run.galaxies = 0;
    state.expedition.pinned = 'home:planet';

    beginFlightAt(new Vector3(0, 0, 32), Math.PI / 2, 0);
    let time = 0;
    for (let i = 0; i < 24; i++) {
      time += 1 / 60;
      stepFlight(1 / 60, time);
    }
    expect(toggleAutopilot()).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 3600 && flightLive.courseHold; i++) {
      time += 1 / 60;
      stepFlight(1 / 60, time);
      seen.add(flightLive.autopilotPhase);
    }

    expect(flightLive.courseHold).toBe(false);
    expect(flightLive.autopilotPhase).toBe('arrived');
    expect([...seen]).toEqual(expect.arrayContaining(['align', 'cruise', 'brake', 'arrived']));
    expect(flightLive.pos.length()).toBeLessThanOrEqual(5);
  });
});
