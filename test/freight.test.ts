import { describe, expect, it } from 'vitest';
import { FREIGHT_BY_ID } from '../src/content/freight';
import {
  acceptJob,
  deliverManifest,
  freightRouteMatch,
  freightWorldProfile,
  pickUpManifest,
  refreshJobBoard,
  type FreightWorldProfile,
} from '../src/engine/freight';
import { newGame } from '../src/engine/sim';
import { createWorldRecord } from '../src/engine/worldRecords';
import type {
  CompletedPlanetRecord,
  GameState,
  PlanetType,
  SimEffect,
} from '../src/engine/types';

function completedWorld(
  lifetimeIndex: number,
  type: PlanetType,
  bottleneck: CompletedPlanetRecord['bottleneck'],
  installations: string[] = [],
  survey: string | null = null,
): CompletedPlanetRecord {
  return {
    lifetimeIndex,
    seed: lifetimeIndex * 101,
    type,
    size: 'medium',
    name: `World ${lifetimeIndex}`,
    quirks: [],
    survey,
    completionMs: 60_000,
    bottleneck,
    installations,
  };
}

function routeWorld(overrides: Partial<FreightWorldProfile> = {}): FreightWorldProfile {
  return {
    type: 'terrestrial',
    bottleneck: 'atmo',
    installations: [],
    traits: [],
    history: [],
    surveyed: false,
    ...overrides,
  };
}

function routeBoard(seed: number): GameState {
  const state = newGame(seed, 0);
  const volcanic = completedWorld(
    1,
    'volcanic',
    'bio',
    ['geoTap', 'stellarForge', 'magratheanWorkshop', 'seedProbe', 'researchLab', 'deepThought'],
  );
  const ice = completedWorld(2, 'ice', 'thermal', ['atmoProcessor']);
  state.run.completedPlanets = [volcanic, ice];
  state.worldRecords['1'] = createWorldRecord(volcanic, 1, 0);
  const iceRecord = createWorldRecord(ice, 1, 0);
  iceRecord.history.push({ kind: 'repairMade', id: 'heat-grid', atGameMs: 1 });
  state.worldRecords['2'] = iceRecord;
  refreshJobBoard(state);
  return state;
}

describe('world-aware freight', () => {
  it('strongly favors cargo whose ordered route facts fit, with a structured rationale', () => {
    const heat = FREIGHT_BY_ID['heat-exchangers']!;
    const volcanic = routeWorld({
      type: 'volcanic',
      installations: ['geoTap'],
      traits: ['engineered'],
    });
    const ice = routeWorld({
      type: 'ice',
      bottleneck: 'thermal',
      traits: ['austere'],
      history: ['repairMade'],
    });

    const matched = freightRouteMatch(heat, volcanic, ice);
    const reversed = freightRouteMatch(heat, ice, volcanic);

    expect(matched.weight).toBeGreaterThan(reversed.weight);
    expect(matched.multiplier).toBe(4.5);
    expect(reversed.multiplier).toBe(0.6);
    expect(matched.reasons).toEqual(expect.arrayContaining([
      { side: 'origin', signal: 'type', value: 'volcanic' },
      { side: 'origin', signal: 'installation', value: 'geoTap' },
      { side: 'destination', signal: 'bottleneck', value: 'thermal' },
      { side: 'destination', signal: 'history', value: 'repairMade' },
    ]));
  });

  it('uses civic history when present and safely falls back to delivery facts', () => {
    const state = newGame(91, 0);
    const recorded = completedWorld(
      11,
      'desert',
      'hydro',
      ['researchLab', 'seedProbe', 'atmoProcessor', 'hydroSeeder', 'geoTap', 'bioDome'],
      'survey-atmosphere',
    );
    const record = createWorldRecord(recorded, 1, 0);
    record.history.push(
      { kind: 'petitionIgnored', id: 'dry-wells', atGameMs: 1 },
      { kind: 'markPlaced', id: 'station', atGameMs: 2 },
    );
    state.worldRecords['11'] = record;
    state.run.standing['11'] = 0.6;

    expect(freightWorldProfile(state, recorded)).toEqual({
      type: 'desert',
      bottleneck: 'hydro',
      installations: recorded.installations,
      traits: ['neglected', 'waymarked', 'engineered'],
      history: ['petitionIgnored', 'markPlaced'],
      surveyed: true,
    });

    const unrecorded = completedWorld(12, 'ocean', 'bio', ['hydroSeeder']);
    expect(freightWorldProfile(state, unrecorded)).toEqual({
      type: 'ocean',
      bottleneck: 'bio',
      installations: ['hydroSeeder'],
      traits: [],
      history: [],
      surveyed: false,
    });
  });

  it('builds the same board from the same seed and keeps starter work carryable', () => {
    const first = routeBoard(404);
    const replay = routeBoard(404);

    expect(replay.expedition.jobs).toEqual(first.expedition.jobs);
    expect(replay.rng.freight).toBe(first.rng.freight);
    expect(FREIGHT_BY_ID[first.expedition.jobs[0]!.id]!.mass).toBeLessThanOrEqual(20);

    const contextual = Array.from({ length: 24 }, (_, seed) => routeBoard(seed + 1))
      .flatMap((state) => state.expedition.jobs.map((job) => {
        const from = state.run.completedPlanets.find((world) => world.lifetimeIndex === job.from)!;
        const to = state.run.completedPlanets.find((world) => world.lifetimeIndex === job.to)!;
        return freightRouteMatch(
          FREIGHT_BY_ID[job.id]!,
          freightWorldProfile(state, from),
          freightWorldProfile(state, to),
        );
      }))
      .filter((match) => match.reasons.length >= 2);
    expect(contextual.length).toBeGreaterThan(0);
  });

  it('puts a completed project route in the first open slot and counts its delivery', () => {
    const state = newGame(505, 0);
    const ocean = completedWorld(1, 'ocean', 'bio', ['hydroSeeder']);
    const terrestrial = completedWorld(2, 'terrestrial', 'hydro', ['bioDome']);
    state.run.completedPlanets = [ocean, terrestrial];
    state.worldRecords['1'] = createWorldRecord(ocean, 1, 0);
    state.worldRecords['2'] = createWorldRecord(terrestrial, 1, 0);

    const projectKey = 'r1:s0:reef-memory';
    const routeId = `project:${projectKey}`;
    state.expedition.fieldProjects[projectKey] = {
      key: projectKey,
      id: 'reef-memory',
      systemIndex: 0,
      receiver: terrestrial.lifetimeIndex,
      source: ocean.lifetimeIndex,
      stage: 'complete',
      startedAtMs: 1,
      updatedAtMs: 2,
      completedAtMs: 2,
    };
    state.expedition.routes[routeId] = {
      id: routeId,
      from: ocean.lifetimeIndex,
      to: terrestrial.lifetimeIndex,
      kind: 'reef-memory',
      name: 'Living Corridor: World 1 to World 2',
      establishedAtMs: 2,
      trips: 1,
    };
    state.expedition.refits.cargoHold = 1;

    refreshJobBoard(state);
    const first = state.expedition.jobs[0]!;
    expect([first.from, first.to]).toEqual([
      ocean.lifetimeIndex,
      terrestrial.lifetimeIndex,
    ]);

    const effects: SimEffect[] = [];
    acceptJob(state, effects, first.uid);
    expect(state.expedition.manifest?.uid).toBe(first.uid);
    expect(pickUpManifest(state, effects)).toBe(true);
    deliverManifest(state, effects);

    expect(state.expedition.manifest).toBeNull();
    expect(state.expedition.routes[routeId]!.trips).toBe(2);
  });

  it('restores an established lane when a partial board refill has no lane offer', () => {
    const state = newGame(606, 0);
    const source = completedWorld(1, 'ice', 'thermal');
    const receiver = completedWorld(2, 'desert', 'hydro');
    const elsewhere = completedWorld(3, 'terrestrial', 'bio');
    state.run.completedPlanets = [source, receiver, elsewhere];
    state.worldRecords['1'] = createWorldRecord(source, 1, 0);
    state.worldRecords['2'] = createWorldRecord(receiver, 1, 0);
    state.worldRecords['3'] = createWorldRecord(elsewhere, 1, 0);
    state.expedition.routes.cold = {
      id: 'cold',
      from: source.lifetimeIndex,
      to: receiver.lifetimeIndex,
      kind: 'cold-chain',
      name: 'Cold Chain: World 1 to World 2',
      establishedAtMs: 1,
      trips: 1,
    };
    state.expedition.jobs.push({
      uid: 41,
      id: 'ballast',
      from: receiver.lifetimeIndex,
      to: elsewhere.lifetimeIndex,
      fromName: receiver.name,
      toName: elsewhere.name,
      distance: 36,
      salvage: 5,
      expiresAtMs: 10_000,
    });

    refreshJobBoard(state);

    expect(state.expedition.jobs).toHaveLength(4);
    expect(state.expedition.jobs[0]!.uid).toBe(41);
    const laneOffer = state.expedition.jobs.find((job) =>
      job.from === source.lifetimeIndex && job.to === receiver.lifetimeIndex);
    expect(laneOffer?.id).toBe('cryobrine');
  });

  it.each([
    ['cold-chain', 'cryobrine'],
    ['heat-without-fire', 'heat-exchangers'],
    ['reef-memory', 'reef-cuttings'],
    ['glass-for-the-tide', 'solar-glass'],
    ['system-seed-bank', 'seedstock'],
    ['field-corridor', 'field-relays'],
  ] as const)(
    'selects thematic cargo for an established %s lane',
    (kind, expectedCargo) => {
      const state = newGame(707, 0);
      const source = completedWorld(1, 'ocean', 'bio');
      const receiver = completedWorld(2, 'terrestrial', 'hydro');
      state.run.completedPlanets = [source, receiver];
      state.worldRecords['1'] = createWorldRecord(source, 1, 0);
      state.worldRecords['2'] = createWorldRecord(receiver, 1, 0);
      state.expedition.routes.lane = {
        id: 'lane',
        from: source.lifetimeIndex,
        to: kind === 'field-corridor' ? source.lifetimeIndex : receiver.lifetimeIndex,
        kind,
        name: `${kind} lane`,
        establishedAtMs: 1,
        trips: 0,
      };

      refreshJobBoard(state);

      expect(state.expedition.jobs[0]).toMatchObject({
        id: expectedCargo,
        from: source.lifetimeIndex,
        to: receiver.lifetimeIndex,
      });
    },
  );
});
