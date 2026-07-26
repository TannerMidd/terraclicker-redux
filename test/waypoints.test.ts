import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import { runMigrations } from '../src/engine/save/migrate';
import {
  findWaypoint,
  manifestWaypointId,
  pinnedWaypoint,
  waypointId,
  waypoints,
} from '../src/engine/waypoints';
import { currentManifestLeg, pickUpManifest, rigCapacity } from '../src/engine/freight';
import { C } from '../src/content/constants';
import { SEAM_BY_ID } from '../src/content/freight';
import { BOTS, OPTS, TICK } from '../balance/bots';
import type { GameState } from '../src/engine/types';

function withWorlds(n: number): GameState {
  const bot = BOTS['greedy-clicker']!;
  const s = newGame(20260723, 0);
  for (let tick = 0; tick < (30 * 60_000) / TICK; tick++) {
    step(s, TICK, bot(s, tick), OPTS);
    if (s.lifetime.planetsCompleted >= n) break;
  }
  return s;
}

describe('the waypoint registry', () => {
  it('always offers somewhere to go', () => {
    const s = newGame(1, 0);
    const list = waypoints(s);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.kind).toBe('home');
    expect(list[0]!.label).toBe(s.planet.name);
  });

  it('enumerates delivered worlds and formed systems', () => {
    const s = withWorlds(6);
    const list = waypoints(s);

    for (const [index, world] of s.run.completedPlanets.entries()) {
      const entry = list.find((w) => w.id === waypointId('world', world.lifetimeIndex));
      expect(entry, `no waypoint for ${world.name}`).toBeDefined();
      expect(entry!.label).toBe(world.name);
      // The ref is the position in this commission, which is what focusSeat
      // divides to find the parent system — not the lifetime index.
      expect(entry!.ref).toEqual({ at: 'focus', kind: 'world', index });
    }
    expect(list.filter((w) => w.kind === 'system').length).toBe(s.run.systems);
  }, 60_000);

  it('advances one stable freight pin from collection to delivery', () => {
    const s = withWorlds(2);
    const [origin, destination] = s.run.completedPlanets;
    expect(origin).toBeDefined();
    expect(destination).toBeDefined();
    if (!origin || !destination) return;

    // A second commission has lifetime ids that no longer equal local layout
    // indexes. The objective must resolve through the current run's records.
    origin.lifetimeIndex = 101;
    destination.lifetimeIndex = 205;
    s.expedition.manifest = {
      uid: 77,
      id: 'test-freight',
      from: origin.lifetimeIndex,
      to: destination.lifetimeIndex,
      fromName: origin.name,
      toName: destination.name,
      distance: 1,
      salvage: 1,
      expiresAtMs: 999,
      acceptedAtMs: 0,
      pickedUpAtMs: null,
    };

    const pin = manifestWaypointId(s.expedition.manifest);
    const collect = findWaypoint(s, pin);
    expect(currentManifestLeg(s)).toMatchObject({
      phase: 'collect',
      targetLifetimeIndex: origin.lifetimeIndex,
      targetName: origin.name,
    });
    expect(waypoints(s)[1]?.id).toBe(pin);
    expect(collect?.label).toBe(origin.name);
    expect(collect?.detail).toContain('collect');
    expect(collect?.ref).toEqual({ at: 'focus', kind: 'world', index: 0 });

    step(s, 0, [{ type: 'setWaypoint', id: pin }], OPTS);
    expect(pickUpManifest(s, [])).toBe(true);

    const deliver = findWaypoint(s, pin);
    expect(currentManifestLeg(s)).toMatchObject({
      phase: 'deliver',
      targetLifetimeIndex: destination.lifetimeIndex,
      targetName: destination.name,
    });
    expect(deliver?.id).toBe(pin);
    expect(deliver?.label).toBe(destination.name);
    expect(deliver?.detail).toContain('deliver');
    expect(deliver?.ref).toEqual({ at: 'focus', kind: 'world', index: 1 });
    expect(pinnedWaypoint(s)?.label).toBe(destination.name);
  }, 60_000);

  it('does not advertise unaccepted board offers as flight targets', () => {
    const s = newGame(1, 0);
    s.expedition.jobs = [{
      uid: 3, id: 'x', from: 0, to: 0, fromName: 'a', toName: 'b',
      distance: 1, salvage: 1, expiresAtMs: 999,
    }];
    expect(findWaypoint(s, waypointId('job', 3))).toBeNull();
    expect(waypoints(s).filter((w) => w.kind === 'job')).toHaveLength(0);
  });

  it('is a pure function of state — same universe, same list', () => {
    const s = withWorlds(3);
    expect(waypoints(s)).toEqual(waypoints(s));
    const rngBefore = { ...s.rng };
    waypoints(s);
    expect(s.rng).toEqual(rngBefore); // a chart is not a dice roll
  }, 60_000);

  it('distinguishes a seam from a rig and reports effective capacity', () => {
    const s = newGame(1, 0);
    const seamId = Object.keys(SEAM_BY_ID)[0]!;
    const seam = SEAM_BY_ID[seamId]!;
    s.expedition.seams[seamId] = 0;
    expect(waypoints(s).find((w) => w.kind === 'seam')?.detail).toContain('no rig');

    s.expedition.infrastructure['survey-station'] = 1;
    s.expedition.rigs[seamId] = { banked: seam.cap, lastTickMs: 0, placedAtMs: 0 };
    const filling = waypoints(s).find((w) => w.kind === 'rig');
    expect(filling?.detail).toBe('80% full');
    expect(waypoints(s).find((w) => w.kind === 'seam')).toBeUndefined();

    s.expedition.rigs[seamId]!.banked = rigCapacity(s.expedition, seamId);
    expect(waypoints(s).find((w) => w.kind === 'rig')?.detail).toBe('full, waiting');
  });

  it('pins only what exists, and clears on request', () => {
    const s = withWorlds(2);
    const target = waypoints(s).find((w) => w.kind === 'world')!;

    step(s, 0, [{ type: 'setWaypoint', id: 'world:99999' }], OPTS);
    expect(s.expedition.pinned).toBeNull(); // a stale id parks nothing

    const r = step(s, 0, [{ type: 'setWaypoint', id: target.id }], OPTS);
    expect(s.expedition.pinned).toBe(target.id);
    expect(r.effects.some((e) => e.t === 'waypointSet')).toBe(true);
    expect(pinnedWaypoint(s)?.label).toBe(target.label);

    step(s, 0, [{ type: 'setWaypoint', id: null }], OPTS);
    expect(s.expedition.pinned).toBeNull();
    expect(pinnedWaypoint(s)).toBeNull();
  }, 60_000);

  it('quietly forgets a pin whose subject has gone', () => {
    const s = newGame(1, 0);
    s.expedition.manifest = {
      uid: 3, id: 'x', from: 0, to: 0, fromName: 'a', toName: 'b',
      distance: 1, salvage: 1, expiresAtMs: 999,
      acceptedAtMs: 0, pickedUpAtMs: null,
    };
    const jobPin = manifestWaypointId(s.expedition.manifest);
    expect(findWaypoint(s, jobPin)).not.toBeNull();
    step(s, 0, [{ type: 'setWaypoint', id: jobPin }], OPTS);
    expect(pinnedWaypoint(s)).not.toBeNull();

    // Completing or abandoning the active job leaves a stale id. It must not
    // throw or point the helm at nothing.
    s.expedition.manifest = null;
    expect(pinnedWaypoint(s)).toBeNull();
    expect(s.expedition.pinned).toBe(jobPin); // the id survives; the target does not
  });

  it('round-trips a pin through a save', () => {
    const s = withWorlds(2);
    const target = waypoints(s).find((w) => w.kind === 'world')!;
    step(s, 0, [{ type: 'setWaypoint', id: target.id }], OPTS);

    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.expedition.pinned).toBe(target.id);
    expect(pinnedWaypoint(round.state)?.id).toBe(target.id);
  }, 60_000);
});

describe('v10 → v12 migration', () => {
  it('gives an older save a resting helm that has been nowhere', () => {
    const out = runMigrations({
      version: 10,
      expedition: { salvage: 5 },
    } as unknown as Record<string, unknown>);
    // runMigrations walks the whole chain to the current SAVE_VERSION.
    expect(out['version']).toBe(C.SAVE_VERSION);
    const expedition = out['expedition'] as Record<string, unknown>;
    expect(expedition['pinned']).toBeNull();
    expect(expedition['salvage']).toBe(5);
    // Nothing visited: course hold is withheld rather than handed out for
    // somewhere the pilot has never actually been.
    expect(expedition['visited']).toEqual({});
  });
});
