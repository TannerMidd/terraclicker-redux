import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import { runMigrations } from '../src/engine/save/migrate';
import {
  WORLD_HISTORY_LIMIT,
  allWorldRecords,
  activeWorldRecords,
  createWorldRecord,
  recordWorldEvent,
  worldBiography,
  worldRecord,
  worldTraits,
} from '../src/engine/worldRecords';
import { C } from '../src/content/constants';
import { PETITIONS } from '../src/content/petitions';
import { SITUATIONS } from '../src/content/situations';
import { D } from '../src/engine/num';
import { createGroundWorldRecord } from '../src/engine/groundSites';
import { BOTS, OPTS, TICK } from '../balance/bots';
import type { CompletedPlanetRecord, GameState } from '../src/engine/types';

/** Play until at least `n` worlds have been delivered. */
function withWorlds(n: number, seed = 20260723): GameState {
  const bot = BOTS['greedy-clicker']!;
  const s = newGame(seed, 0);
  for (let tick = 0; tick < (30 * 60_000) / TICK; tick++) {
    step(s, TICK, bot(s, tick), OPTS);
    if (s.lifetime.planetsCompleted >= n) break;
  }
  return s;
}

const sampleWorld = (over: Partial<CompletedPlanetRecord> = {}): CompletedPlanetRecord => ({
  lifetimeIndex: 7,
  seed: 1,
  type: 'ocean',
  size: 'small',
  name: 'Umbra Bequest',
  quirks: ['q1'],
  survey: null,
  completionMs: 1000,
  bottleneck: 'bio',
  installations: ['seedProbe', 'atmoProcessor'],
  ...over,
});

describe('the world record store', () => {
  it('opens a record the moment a world is delivered', () => {
    const s = withWorlds(1);
    expect(s.lifetime.planetsCompleted).toBeGreaterThanOrEqual(1);

    const delivered = s.run.completedPlanets[0]!;
    const record = worldRecord(s, delivered.lifetimeIndex);

    expect(record).not.toBeNull();
    expect(record!.name).toBe(delivered.name);
    expect(record!.type).toBe(delivered.type);
    expect(record!.bottleneck).toBe(delivered.bottleneck);
    expect(record!.installationCount).toBe(delivered.installations.length);
    expect(record!.commissionNumber).toBe(s.run.number);
    expect(record!.history).toEqual([]);
  }, 60_000);

  it('keeps remembering worlds after the portfolio is sold', () => {
    const s = withWorlds(C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS);
    s.run.planetsCompleted = C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS;
    s.run.systems = C.PRESTIGE_MIN_SYSTEMS;
    s.run.tuEarned = D('1e15');

    const before = allWorldRecords(s).length;
    expect(before).toBeGreaterThan(0);

    const r = step(s, 0, [{ type: 'prestige' }], OPTS);
    expect(r.effects.some((e) => e.t === 'prestiged')).toBe(true);

    // The commission is gone. The memory of it is not — that is the point of
    // storing records outside `run`.
    expect(s.run.completedPlanets).toEqual([]);
    expect(allWorldRecords(s).length).toBe(before);
    // ...but none of those worlds is still *active*, because they were sold.
    expect(activeWorldRecords(s).length).toBe(0);
  }, 90_000);

  it('caps a world history and evicts the oldest entries', () => {
    const s = newGame(1, 0);
    s.worldRecords['7'] = createWorldRecord(sampleWorld(), 1, 0);

    for (let i = 0; i < WORLD_HISTORY_LIMIT + 5; i++) {
      recordWorldEvent(s, 7, { kind: 'visited', id: `e${i}`, atGameMs: i });
    }

    const history = worldRecord(s, 7)!.history;
    expect(history.length).toBe(WORLD_HISTORY_LIMIT);
    expect(history[0]!.id).toBe('e5'); // the first five fell off
    expect(history.at(-1)!.id).toBe(`e${WORLD_HISTORY_LIMIT + 4}`);
  });

  it('ignores events filed against a world it has never heard of', () => {
    const s = newGame(1, 0);
    expect(() => recordWorldEvent(s, 999, { kind: 'visited', id: 'x', atGameMs: 0 })).not.toThrow();
    expect(worldRecord(s, 999)).toBeNull();
  });

  it('derives traits from what actually happened, never from a roll', () => {
    const s = newGame(1, 0);
    s.worldRecords['7'] = createWorldRecord(
      sampleWorld({ installations: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], quirks: ['q1', 'q2'] }),
      1,
      0,
    );
    const record = worldRecord(s, 7)!;

    // Same inputs, same traits — twice, and after ignoring two petitions.
    expect(worldTraits(record, 1)).toEqual(worldTraits(record, 1));
    expect(worldTraits(record, 1)).toContain('engineered');
    expect(worldTraits(record, 1)).toContain('peculiar');

    recordWorldEvent(s, 7, { kind: 'petitionIgnored', id: 'p1', atGameMs: 1 });
    recordWorldEvent(s, 7, { kind: 'petitionIgnored', id: 'p2', atGameMs: 2 });
    expect(worldTraits(worldRecord(s, 7)!, 0.5)).toContain('neglected');

    // A world with nothing to say still gets one trait. Everywhere is somewhere.
    const plain = createWorldRecord(
      sampleWorld({ lifetimeIndex: 8, quirks: [], installations: ['a', 'b', 'c'] }),
      1,
      0,
    );
    expect(worldTraits(plain, 1).length).toBeGreaterThanOrEqual(1);
    expect(worldTraits(plain, 1).length).toBeLessThanOrEqual(3);
  });

  it('turns completed projects, established routes, and atlases into lived world copy', () => {
    const record = createWorldRecord(sampleWorld(), 1, 0);
    record.history.push(
      { kind: 'projectCompleted', id: 'reef-memory', atGameMs: 1 },
      { kind: 'routeEstablished', id: 'living-corridor', atGameMs: 2 },
      { kind: 'atlasCompleted', id: 'w7', atGameMs: 3 },
    );

    expect(worldTraits(record, 1)).toEqual(['restored', 'connected', 'well-known']);
    const biography = worldBiography(record, 1);
    expect(biography).toBe(worldBiography(record, 1));
    expect(biography).toContain('named route');
  });

  it('keeps physical field legacies after their rolling history entries are evicted', () => {
    const state = newGame(9, 0);
    const record = createWorldRecord(sampleWorld(), 1, 0);
    state.worldRecords['7'] = record;
    const ground = createGroundWorldRecord();
    ground.projectSites['old-project'] = {
      id: 'old-project',
      kind: 'wetland',
      state: 'complete',
      atMs: 2,
      sourceWorld: 8,
    };
    ground.atlasCompletedAtMs = 3;
    state.expedition.groundWorlds.w7 = ground;
    state.expedition.routes['living-corridor'] = {
      id: 'living-corridor',
      from: 7,
      to: 8,
      kind: 'reef-memory',
      name: 'Living Corridor',
      establishedAtMs: 2,
      trips: 1,
    };
    recordWorldEvent(state, 7, { kind: 'projectCompleted', id: 'old-project', atGameMs: 1 });
    recordWorldEvent(state, 7, { kind: 'routeEstablished', id: 'living-corridor', atGameMs: 2 });
    recordWorldEvent(state, 7, { kind: 'atlasCompleted', id: 'w7', atGameMs: 3 });
    for (let i = 0; i < WORLD_HISTORY_LIMIT; i++) {
      recordWorldEvent(state, 7, { kind: 'visited', id: `later-${i}`, atGameMs: 10 + i });
    }

    expect(record.history.every((event) => event.kind === 'visited')).toBe(true);
    expect(worldTraits(record, 0.5, state)).toEqual(['restored', 'connected', 'well-known']);
    expect(worldBiography(record, 0.5, state)).toBe(worldBiography(record, 0.5, state));
  });

  it('survives a save round-trip intact', () => {
    const s = withWorlds(2);
    recordWorldEvent(s, s.run.completedPlanets[0]!.lifetimeIndex, {
      kind: 'petitionAnswered',
      id: 'quiet-request',
      atGameMs: 123,
    });

    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.worldRecords).toEqual(s.worldRecords);
  }, 60_000);
});

describe('v9 → v10 migration', () => {
  it('reconstructs records for every world the save can still see', () => {
    const v9 = {
      version: 9,
      run: {
        number: 3,
        completedPlanets: [
          { lifetimeIndex: 11, name: 'Vesper Reach', type: 'desert', bottleneck: 'hydro',
            quirks: ['q1', 'q2'], survey: 'deep-core', installations: ['a', 'b'] },
        ],
      },
      operations: {
        heritageWorlds: [
          { lifetimeIndex: 4, name: 'Terra Prima', type: 'terrestrial', bottleneck: 'thermal',
            quirks: [], survey: null, installations: ['a', 'b', 'c'], commissionNumber: 1 },
        ],
      },
    };

    const out = runMigrations(v9 as unknown as Record<string, unknown>) as Record<string, unknown>;
    const records = out['worldRecords'] as Record<string, Record<string, unknown>>;

    // runMigrations walks the whole chain, so this lands at the current
    // SAVE_VERSION rather than stopping at 10.
    expect(out['version']).toBe(C.SAVE_VERSION);
    expect(Object.keys(records).sort()).toEqual(['11', '4']);
    // Heritage keeps the commission that actually delivered it.
    expect(records['4']!['commissionNumber']).toBe(1);
    expect(records['4']!['installationCount']).toBe(3);
    // The current portfolio inherits the run's commission number.
    expect(records['11']!['commissionNumber']).toBe(3);
    expect(records['11']!['quirkCount']).toBe(2);
    expect(records['11']!['survey']).toBe('deep-core');
    // Nothing has happened to any of them yet, which is true.
    expect(records['11']!['history']).toEqual([]);
  });

  it('produces an empty archive for a save with no worlds left', () => {
    const out = runMigrations({ version: 9, run: { number: 1 } } as Record<string, unknown>);
    // runMigrations walks the whole chain, so this lands at the current
    // SAVE_VERSION rather than stopping at 10.
    expect(out['version']).toBe(C.SAVE_VERSION);
    expect(out['worldRecords']).toEqual({});
  });
});

describe('worlds remember being answered, and being ignored', () => {
  it('files an answered petition against the world that asked', () => {
    const s = withWorlds(2);
    const world = s.run.completedPlanets[0]!;
    const def = PETITIONS[0]!;
    s.run.petitions = [{
      uid: 91, id: def.id, remainingMs: 60_000,
      world: world.lifetimeIndex, worldName: world.name,
    }];

    step(s, 0, [{ type: 'answerSituation', uid: 91, optionId: def.options[0]!.id }], OPTS);

    const history = worldRecord(s, world.lifetimeIndex)!.history;
    expect(history.length).toBe(1);
    expect(history[0]!.kind).toBe('petitionAnswered');
    expect(history[0]!.id).toBe(def.id);
  }, 60_000);

  it('files neglect when a situation runs out unanswered', () => {
    const s = withWorlds(2);
    const world = s.run.completedPlanets[0]!;
    s.situations = [{
      uid: 92, id: SITUATIONS[0]!.id, remainingMs: 200,
      world: world.lifetimeIndex, worldName: world.name,
    }];

    // Let the window close with nobody answering.
    for (let i = 0; i < 6; i++) step(s, 250, [], OPTS);

    const history = worldRecord(s, world.lifetimeIndex)!.history;
    expect(history.some((e) => e.kind === 'petitionIgnored')).toBe(true);
    // Which is exactly what the biography then says about it.
    expect(worldTraits(worldRecord(s, world.lifetimeIndex)!, 0.5)).toContain('neglected');
  }, 60_000);
});
