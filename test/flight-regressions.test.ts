import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { FIRST_SORTIE, SORTIE_COMPANY_HOLD_RANK, SORTIE_FLAG, SORTIE_PROGRESS_FLAG, SORTIE_STARTER_SALVAGE } from '../src/content/firstSortie';
import { SITUATIONS } from '../src/content/situations';
import { C } from '../src/content/constants';
import { attendInPerson } from '../src/engine/bridge';
import { boardRange, deepFieldSites } from '../src/engine/deepField';
import { handlingFor, NEUTRAL_HANDLING } from '../src/engine/handling';
import { D } from '../src/engine/num';
import { newGame, step } from '../src/engine/sim';
import type { CompletedPlanetRecord, GameState, JobOffer } from '../src/engine/types';
import { createWorldRecord } from '../src/engine/worldRecords';
import { waypointId } from '../src/engine/waypoints';
import { useGame } from '../src/state/store';
import {
  beginFlightAt,
  endFlight,
  flightInput,
  flightLive,
  interdiction,
  OMEGA_MAX,
  stepFlight,
} from '../src/ui/scene/flightControl';
import { SETTLED_SPIN_RATE } from '../src/ui/scene/navControl';
import { SETTLEMENT_SNAP_RAD } from '../src/engine/settlements';

const OPTS = { utcDay: 3 };

function completedWorld(): CompletedPlanetRecord {
  return {
    lifetimeIndex: 3,
    seed: 3,
    type: 'ocean',
    size: 'small',
    name: 'Pelagia II',
    quirks: [],
    survey: null,
    completionMs: 1,
    bottleneck: 'bio',
    installations: ['a'],
  };
}

function withWorld(): GameState {
  const state = newGame(99, 0);
  const world = completedWorld();
  state.run.completedPlanets.push(world);
  state.worldRecords['3'] = createWorldRecord(world, 1, 0);
  return state;
}

function job(uid: number): JobOffer {
  return {
    uid,
    id: 'labware',
    from: 0,
    to: 3,
    fromName: 'Magrathea',
    toName: 'Pelagia II',
    distance: 10,
    salvage: 5,
    expiresAtMs: 1_000_000,
  };
}

describe('first-sortie completion', () => {
  it('tops up the starter salvage, persists completion, and cannot pay twice', () => {
    const state = newGame(42, 0);
    state.expedition.salvage = 2;

    const first = step(state, 0, [{ type: 'completeFirstSortie' }], OPTS);

    expect(state.expedition.salvage).toBe(SORTIE_STARTER_SALVAGE);
    expect(state.expedition.refits.cargoHold).toBe(SORTIE_COMPANY_HOLD_RANK);
    expect(first.effects).toContainEqual({
      t: 'refitInstalled',
      id: 'cargoHold',
      rank: SORTIE_COMPANY_HOLD_RANK,
    });
    expect(state.flags[SORTIE_FLAG]).toBe(1);
    expect(state.flags[SORTIE_PROGRESS_FLAG]).toBe(FIRST_SORTIE.length);
    expect(first.effects).toContainEqual({
      t: 'sortieCompleted',
      salvage: SORTIE_STARTER_SALVAGE - 2,
    });

    const second = step(state, 0, [{ type: 'completeFirstSortie' }], OPTS);
    expect(state.expedition.salvage).toBe(SORTIE_STARTER_SALVAGE);
    expect(state.expedition.refits.cargoHold).toBe(SORTIE_COMPANY_HOLD_RANK);
    expect(second.effects.some((effect) => effect.t === 'refitInstalled')).toBe(false);
    expect(second.effects.some((effect) => effect.t === 'sortieCompleted')).toBe(false);
  });
  it('never downgrades an existing Cargo Hold when induction is filed', () => {
    const state = newGame(43, 0);
    state.expedition.refits.cargoHold = 3;

    const result = step(state, 0, [{ type: 'completeFirstSortie' }], OPTS);

    expect(state.expedition.refits.cargoHold).toBe(3);
    expect(result.effects.some((effect) => effect.t === 'refitInstalled')).toBe(false);
  });
  it('repairs an older completed-sortie save that predates the company hold', () => {
    const state = newGame(44, 0);
    state.flags[SORTIE_FLAG] = 1;
    delete state.expedition.refits.cargoHold;

    const result = step(state, 0, [], OPTS);

    expect(state.expedition.refits.cargoHold).toBe(SORTIE_COMPANY_HOLD_RANK);
    expect(result.effects).toContainEqual({
      t: 'refitInstalled',
      id: 'cargoHold',
      rank: SORTIE_COMPANY_HOLD_RANK,
    });
  });

});

describe('commission sale cleanup', () => {
  it('discards accepted freight, stale offers, and a freight pin', () => {
    const state = newGame(17, 0);
    const accepted = job(17);
    state.run.planetsCompleted = C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS;
    state.run.systems = C.PRESTIGE_MIN_SYSTEMS;
    state.run.tuEarned = D('1e15');
    state.expedition.manifest = {
      ...accepted,
      acceptedAtMs: 0,
      pickedUpAtMs: 0,
    };
    state.expedition.jobs = [job(18)];
    state.expedition.nextJobMs = 12_345;
    state.expedition.pinned = waypointId('job', accepted.uid);

    const result = step(state, 0, [{ type: 'prestige' }], OPTS);

    expect(result.effects.some((effect) => effect.t === 'prestiged')).toBe(true);
    expect(state.expedition.manifest).toBeNull();
    expect(state.expedition.jobs).toEqual([]);
    expect(state.expedition.nextJobMs).toBe(0);
    expect(state.expedition.pinned).toBeNull();
  });
});

describe('cargo state', () => {
  it('applies handling traits only after the manifest is physically collected', () => {
    const state = withWorld();
    state.expedition.manifest = {
      ...job(1),
      acceptedAtMs: 0,
      pickedUpAtMs: null,
    };

    expect(handlingFor(state.expedition)).toEqual(NEUTRAL_HANDLING);

    step(state, 0, [{ type: 'pickUpManifest' }], OPTS);
    const loaded = handlingFor(state.expedition);
    expect(loaded.traits).toEqual(expect.arrayContaining(['fragile', 'awkward']));
    expect(loaded.responseMult).toBeLessThan(1);
    expect(loaded.turnMult).toBeLessThan(1);
  });
});

describe('in-person request timing', () => {
  it('rejects an old visit, then accepts a new arrival after the request opened', () => {
    const state = withWorld();
    const request = SITUATIONS[0]!;
    const route = waypointId('world', 3);
    state.gameTimeMs = 100_000;
    state.situations = [{
      uid: 7,
      id: request.id,
      remainingMs: request.windowMs - 10_000,
      world: 3,
      worldName: 'Pelagia II',
    }];
    state.expedition.visited[route] = 80_000;

    expect(attendInPerson(state, [], 7)).toBe(false);
    expect(state.situations).toHaveLength(1);

    step(state, 0, [{ type: 'markVisited', id: route }], OPTS);
    expect(state.expedition.visited[route]).toBe(100_000);
    expect(attendInPerson(state, [], 7)).toBe(true);
    expect(state.situations).toHaveLength(0);
  });
});

function clearFlightInput(): void {
  flightInput.thrust = 0;
  flightInput.brake = 0;
  flightInput.strafe = 0;
  flightInput.vert = 0;
  flightInput.boost = false;
  flightInput.steerX = 0;
  flightInput.steerY = 0;
  flightInput.cruise = 0;
  flightInput.engage = false;
  flightInput.jump = false;
}

function runFlight(seconds: number, from = 0): number {
  const dt = 1 / 60;
  let time = from;
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    time += dt;
    stepFlight(dt, time);
  }
  return time;
}

describe('flight action latch', () => {
  beforeEach(() => {
    clearFlightInput();
    endFlight();
    const state = useGame.getState().s;
    state.seed = 424_242;
    state.expedition.discovered = {};
    state.expedition.boarded = {};
    state.expedition.manifest = null;
    state.expedition.refits = {};
    state.flags = {};
  });

  it('freezes the ship and customs clock while a flight overlay is open', () => {
    beginFlightAt(new Vector3(80, 4, 20), 0, 0);
    flightLive.vel.set(3, -1, 2);
    flightLive.speed = flightLive.vel.length();
    interdiction.active = true;
    interdiction.remainingMs = 12_000;
    const before = flightLive.pos.clone();
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: () => ({ className: 'fh-chart' }) },
    });

    try {
      stepFlight(1, 1);
      expect(flightLive.paused).toBe(true);
      expect(flightLive.pos.toArray()).toEqual(before.toArray());
      expect(flightLive.vel.toArray()).toEqual([3, -1, 2]);
      expect(interdiction.remainingMs).toBe(12_000);
    } finally {
      interdiction.active = false;
      if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
      else delete (globalThis as { document?: unknown }).document;
    }
  });

  it('does not turn a held scan into an automatic boarding action', () => {
    const state = useGame.getState().s;
    const site = deepFieldSites(state.seed)
      .filter((candidate) => !candidate.def.unreachable && candidate.def.kind !== 'phenomenon')
      .sort((a, b) => Math.hypot(...a.pos) - Math.hypot(...b.pos))[0]!;
    const target = new Vector3(site.pos[0], site.pos[1], site.pos[2]);
    const standoff = boardRange(site.def.radius) - 0.25;
    const start = target.clone().add(new Vector3(0, 0, standoff));
    const toward = target.clone().sub(start).normalize();
    beginFlightAt(start, Math.atan2(-toward.x, -toward.z), Math.asin(toward.y));

    flightInput.engage = true;
    let time = runFlight(site.def.scanSeconds + 0.75);

    expect(state.expedition.discovered[site.def.id]).toBeDefined();
    expect(state.expedition.boarded[site.def.id]).toBeUndefined();
    expect(flightLive.prompt?.verb).toBe('board');

    time = runFlight(0.25, time);
    expect(state.expedition.boarded[site.def.id]).toBeUndefined();

    flightInput.engage = false;
    time = runFlight(1 / 30, time);
    flightInput.engage = true;
    runFlight(1 / 30, time);

    expect(state.expedition.boarded[site.def.id]).toBeDefined();
  });
});

/**
 * The chase has to be winnable. A settled world's spin and the helm's
 * approach governor are tuned in different files, by different concerns
 * (one is set dressing, one is optical comfort) — and when the spin
 * overtook the governor, every settlement on every delivered world became
 * unreachable by construction. Nothing failed; the ground simply outran the
 * ship forever. That is the sort of bug a screenshot cannot show and a
 * playtester can only describe as "it's gone before I get there".
 */
describe('a delivered world can actually be approached', () => {
  it('turns slower than the helm is allowed to fly around it', () => {
    expect(SETTLED_SPIN_RATE).toBeLessThan(OMEGA_MAX);
  });

  it('leaves enough margin to close on a target while flying a descent', () => {
    // Pure parity would mean hovering exactly over one spot forever. The
    // pilot needs authority left over to steer AND descend, so insist on
    // real headroom rather than a hair under the cap.
    expect(SETTLED_SPIN_RATE).toBeLessThan(OMEGA_MAX / 2);
  });

  it('does not turn a town out of the cone before an approach can be flown', () => {
    // The property that actually decides whether aiming means anything.
    // Sight the lights, hold the thrust in, and the run takes the better
    // part of twenty seconds; if the town has left the autoland's cone by
    // then, the pilot arrives over empty ground no matter how well they
    // aimed. Measured against the real flight rig before this held.
    const driftDuringApproach = SETTLED_SPIN_RATE * 20;
    expect(driftDuringApproach).toBeLessThanOrEqual(SETTLEMENT_SNAP_RAD);
  });
});
