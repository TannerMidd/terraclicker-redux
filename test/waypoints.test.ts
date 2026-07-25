import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import { runMigrations } from '../src/engine/save/migrate';
import { findWaypoint, pinnedWaypoint, waypointId, waypoints } from '../src/engine/waypoints';
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

  it('is a pure function of state — same universe, same list', () => {
    const s = withWorlds(3);
    expect(waypoints(s)).toEqual(waypoints(s));
    const rngBefore = { ...s.rng };
    waypoints(s);
    expect(s.rng).toEqual(rngBefore); // a chart is not a dice roll
  }, 60_000);

  it('distinguishes a prospected seam from one with a rig on it', () => {
    const s = newGame(1, 0);
    const seamId = 'orbital-scrap';
    s.expedition.seams[seamId] = 0;
    const bare = waypoints(s).find((w) => w.kind === 'seam');
    if (bare) {
      expect(bare.detail).toContain('no rig');
      s.expedition.rigs[seamId] = { banked: 0, lastTickMs: 0, placedAtMs: 0 };
      const withRig = waypoints(s).find((w) => w.kind === 'rig');
      expect(withRig).toBeDefined();
      expect(waypoints(s).find((w) => w.kind === 'seam')).toBeUndefined();
    }
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
    s.expedition.jobs = [{
      uid: 3, id: 'x', from: 0, to: 0, fromName: 'a', toName: 'b',
      distance: 1, salvage: 1, expiresAtMs: 999,
    }];
    const jobPin = waypointId('job', 3);
    expect(findWaypoint(s, jobPin)).not.toBeNull();
    step(s, 0, [{ type: 'setWaypoint', id: jobPin }], OPTS);
    expect(pinnedWaypoint(s)).not.toBeNull();

    // The offer expires off the board. The pin is stale but must not throw or
    // point the helm at nothing.
    s.expedition.jobs = [];
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

describe('v10 → v11 migration', () => {
  it('gives an older save a resting helm', () => {
    const out = runMigrations({
      version: 10,
      expedition: { salvage: 5 },
    } as unknown as Record<string, unknown>);
    expect(out['version']).toBe(11);
    expect((out['expedition'] as Record<string, unknown>)['pinned']).toBeNull();
    expect((out['expedition'] as Record<string, unknown>)['salvage']).toBe(5);
  });
});
