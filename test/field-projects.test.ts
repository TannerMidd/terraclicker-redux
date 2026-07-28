import { describe, expect, it } from 'vitest';
import { FIELD_PROJECT_BY_ID } from '../src/content/fieldProjects';
import {
  FIELD_ATLAS_REPUTATION,
  FIELD_ATLAS_SALVAGE,
  FAMILIARITY_MAX,
  advanceFieldProjects,
  ensureFieldProjects,
  fieldAtlas,
  retireUnfinishedFieldProjects,
  updateFieldCorridor,
  updateFieldKnowledge,
} from '../src/engine/fieldProjects';
import {
  bankGroundSamples,
  checkpointGround,
  groundReturnValue,
} from '../src/engine/groundfall';
import { createGroundWorldRecord } from '../src/engine/groundSites';
import { deserialize, serialize } from '../src/engine/save/codec';
import { newGame } from '../src/engine/sim';
import { createWorldRecord } from '../src/engine/worldRecords';
import type {
  CompletedPlanetRecord,
  FieldProjectState,
  GameState,
  PlanetType,
  SimEffect,
} from '../src/engine/types';

const COLD_CHAIN_SYSTEM: readonly PlanetType[] = [
  'desert',
  'ice',
  'terrestrial',
  'ocean',
  'volcanic',
];
const REEF_SYSTEM: readonly PlanetType[] = [
  'terrestrial',
  'ocean',
  'terrestrial',
  'ocean',
  'gasgiant',
];

function completedWorld(lifetimeIndex: number, type: PlanetType): CompletedPlanetRecord {
  return {
    lifetimeIndex,
    seed: lifetimeIndex * 101,
    type,
    size: 'medium',
    name: `World ${lifetimeIndex}`,
    quirks: [],
    survey: null,
    completionMs: 60_000,
    bottleneck: 'thermal',
    installations: ['seedProbe'],
  };
}

function systemState(
  types: readonly PlanetType[],
  systems = 1,
  seed = 24_001,
): GameState {
  const state = newGame(seed, 0);
  state.run.completedPlanets = types.map((type, i) => completedWorld(i + 1, type));
  state.run.planetsCompleted = types.length;
  state.run.systems = systems;
  for (const world of state.run.completedPlanets) {
    state.worldRecords[String(world.lifetimeIndex)] = createWorldRecord(world, 1, 0);
  }
  return state;
}

function singleProject(
  types: readonly PlanetType[] = COLD_CHAIN_SYSTEM,
): { state: GameState; project: FieldProjectState } {
  const state = systemState(types);
  ensureFieldProjects(state);
  const project = Object.values(state.expedition.fieldProjects)[0];
  if (!project) throw new Error('fixture did not produce a compatible field project');
  return { state, project };
}

function report(
  state: GameState,
  effects: SimEffect[],
  lifetimeIndex: number,
  over: {
    haul?: Parameters<typeof advanceFieldProjects>[4];
    sites?: Parameters<typeof advanceFieldProjects>[5];
    species?: Parameters<typeof advanceFieldProjects>[6];
    contacted?: boolean;
    readings?: number;
  } = {},
): number {
  return advanceFieldProjects(
    state,
    effects,
    lifetimeIndex,
    `World ${lifetimeIndex}`,
    over.haul ?? [],
    over.sites ?? {},
    over.species ?? [],
    {
      contacted: over.contacted ?? false,
      readings: over.readings ?? 0,
    },
  );
}

describe('authored field projects', () => {
  it('creates one deterministic project only for a formed compatible system', () => {
    const unformed = systemState(COLD_CHAIN_SYSTEM, 0);
    ensureFieldProjects(unformed);
    expect(unformed.expedition.fieldProjects).toEqual({});

    const incomplete = systemState(COLD_CHAIN_SYSTEM.slice(0, 4), 1);
    ensureFieldProjects(incomplete);
    expect(incomplete.expedition.fieldProjects).toEqual({});

    const incompatible = systemState(Array.from({ length: 5 }, () => 'terrestrial'), 1);
    ensureFieldProjects(incompatible);
    expect(incompatible.expedition.fieldProjects).toEqual({});

    const a = systemState(COLD_CHAIN_SYSTEM);
    const b = systemState(COLD_CHAIN_SYSTEM);
    ensureFieldProjects(a);
    ensureFieldProjects(b);
    expect(Object.values(a.expedition.fieldProjects)).toEqual(
      Object.values(b.expedition.fieldProjects),
    );
    expect(Object.values(a.expedition.fieldProjects)[0]).toMatchObject({
      id: 'cold-chain',
      receiver: 1,
      source: 2,
      stage: 'investigate',
    });

    ensureFieldProjects(a);
    expect(Object.keys(a.expedition.fieldProjects)).toHaveLength(1);
  });

  it('requires deliberate settlement contact and three readings to investigate', () => {
    const { state, project } = singleProject();
    const effects: SimEffect[] = [];

    expect(report(state, effects, project.receiver, { contacted: false, readings: 3 })).toBe(0);
    expect(report(state, effects, project.receiver, { contacted: true, readings: 2 })).toBe(0);
    expect(project.stage).toBe('investigate');
    expect(state.expedition.groundWorlds[`w${project.receiver}`]).toBeUndefined();

    expect(report(state, effects, project.receiver, { contacted: true, readings: 3 })).toBe(1);
    expect(project.stage).toBe('source');
    expect(
      state.expedition.groundWorlds[`w${project.receiver}`]!.projectSites[project.key],
    ).toMatchObject({
      id: project.key,
      kind: 'greenhouse',
      state: 'scaffold',
      sourceWorld: project.source,
    });
  });

  it('accepts only each project’s authored sample, species, or preservation evidence', () => {
    const cold = singleProject();
    const coldEffects: SimEffect[] = [];
    report(cold.state, coldEffects, cold.project.receiver, { contacted: true, readings: 3 });

    expect(
      report(cold.state, coldEffects, cold.project.source, {
        haul: [{ kind: 'field-crystal', n: 1, method: 'quick' }],
        sites: { ridge: 'preserved' },
        species: ['tide-chorus'],
      }),
    ).toBe(0);
    expect(cold.project.stage).toBe('source');
    expect(
      report(cold.state, coldEffects, cold.project.source, {
        haul: [{ kind: 'cryogenic-brine', n: 1, method: 'core' }],
      }),
    ).toBe(1);
    expect(cold.project.stage).toBe('return');

    const reefSpecies = singleProject(REEF_SYSTEM);
    const speciesEffects: SimEffect[] = [];
    report(reefSpecies.state, speciesEffects, reefSpecies.project.receiver, {
      contacted: true,
      readings: 3,
    });
    expect(
      report(reefSpecies.state, speciesEffects, reefSpecies.project.source, {
        species: ['verge-lichen'],
      }),
    ).toBe(0);
    expect(
      report(reefSpecies.state, speciesEffects, reefSpecies.project.source, {
        species: ['tide-chorus'],
      }),
    ).toBe(1);
    expect(reefSpecies.project.stage).toBe('return');

    const reefPreserve = singleProject(REEF_SYSTEM);
    const preserveEffects: SimEffect[] = [];
    report(reefPreserve.state, preserveEffects, reefPreserve.project.receiver, {
      contacted: true,
      readings: 3,
    });
    expect(
      report(reefPreserve.state, preserveEffects, reefPreserve.project.source, {
        sites: { shoreline: 'preserved' },
      }),
    ).toBe(1);
    expect(reefPreserve.project.stage).toBe('return');
  });

  it('completes the visible site, pays once, and records a named route on both worlds', () => {
    const { state, project } = singleProject();
    const effects: SimEffect[] = [];
    const def = FIELD_PROJECT_BY_ID[project.id];
    report(state, effects, project.receiver, { contacted: true, readings: 3 });
    report(state, effects, project.source, {
      haul: [{ kind: 'glacier-core', n: 1, method: 'core' }],
    });
    const salvageBefore = state.expedition.salvage;
    const reputationBefore = state.operations.reputation[def.faction];

    expect(report(state, effects, project.receiver, { contacted: true, readings: 1 })).toBe(1);
    expect(project.stage).toBe('complete');
    expect(project.completedAtMs).not.toBeNull();
    expect(
      state.expedition.groundWorlds[`w${project.receiver}`]!.projectSites[project.key],
    ).toMatchObject({
      state: 'complete',
      kind: def.result,
      sourceWorld: project.source,
    });
    expect(state.expedition.salvage).toBe(salvageBefore + def.salvage);
    expect(state.operations.reputation[def.faction]).toBe(reputationBefore + def.reputation);

    const route = state.expedition.routes[`project:${project.key}`]!;
    expect(route).toMatchObject({
      from: project.source,
      to: project.receiver,
      kind: project.id,
      trips: 1,
    });
    expect(route.name).toContain(def.routeNoun);
    expect(route.name).toContain(`World ${project.source}`);
    expect(route.name).toContain(`World ${project.receiver}`);
    for (const lifetimeIndex of [project.source, project.receiver]) {
      const history = state.worldRecords[String(lifetimeIndex)]!.history;
      expect(
        history.some((event) => event.kind === 'projectCompleted' && event.id === project.key),
      ).toBe(true);
      expect(
        history.some((event) => event.kind === 'routeEstablished' && event.id === route.id),
      ).toBe(true);
    }

    expect(report(state, effects, project.receiver, { contacted: true, readings: 12 })).toBe(0);
    expect(state.expedition.salvage).toBe(salvageBefore + def.salvage);
    expect(state.operations.reputation[def.faction]).toBe(reputationBefore + def.reputation);
    expect(effects.filter((effect) => effect.t === 'fieldProjectCompleted')).toHaveLength(1);
  });

  it('caches an unbanked report through reload, merges it once on boarding, then clears it', () => {
    const { state, project } = singleProject();
    // This fixture describes a formed five-world system; keep the active
    // commission on the next lifetime index so ground validation resolves
    // the receiver as the delivered world rather than the in-progress one.
    state.planet.lifetimeIndex = state.run.completedPlanets.length + 1;
    const worldKey = `w${project.receiver}`;
    const worldName = `World ${project.receiver}`;
    const cachedHaul = [{ kind: 'field-crystal', n: 5, method: 'quick' as const }];
    const salvageBefore = state.expedition.salvage;

    checkpointGround(state, worldKey, cachedHaul, {}, [], {
      civic: true,
      contacted: true,
      readings: 3,
    });

    expect(state.expedition.salvage).toBe(salvageBefore);
    expect(project.stage).toBe('investigate');
    expect(state.expedition.groundWorlds[worldKey]).toBeUndefined();
    const checkpoint = state.expedition.groundCheckpoints[worldKey];
    expect(checkpoint).toMatchObject({
      haul: cachedHaul,
      evidence: { civic: true, contacted: true, readings: 3 },
    });

    const round = deserialize(serialize(state));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.expedition.groundCheckpoints[worldKey]).toEqual(checkpoint);

    const recovered = round.state;
    const recoveredProject = recovered.expedition.fieldProjects[project.key]!;
    const owed = groundReturnValue(recovered, worldKey, cachedHaul).salvage;
    const effects: SimEffect[] = [];
    bankGroundSamples(
      recovered,
      effects,
      worldKey,
      worldName,
      [{ kind: 'field-crystal', n: 3, method: 'quick' }],
    );

    // The live report is a snapshot of the same stay. It cannot add three
    // more samples to the five already cached.
    expect(recovered.expedition.salvage).toBe(salvageBefore + owed);
    expect(recoveredProject.stage).toBe('source');
    expect(recovered.expedition.groundCheckpoints[worldKey]).toBeUndefined();
    expect(recovered.expedition.groundWorlds[worldKey]!.visits).toBe(1);
    expect(
      effects.filter(
        (effect) =>
          effect.t === 'fieldProjectAdvanced'
          && effect.key === project.key
          && effect.stage === 'source',
      ),
    ).toHaveLength(1);

    const salvageAfterBoarding = recovered.expedition.salvage;
    bankGroundSamples(recovered, effects, worldKey, worldName, []);
    expect(recovered.expedition.salvage).toBe(salvageAfterBoarding);
    expect(recoveredProject.stage).toBe('source');
    expect(recovered.expedition.groundCheckpoints[worldKey]).toBeUndefined();
    expect(
      effects.filter(
        (effect) =>
          effect.t === 'fieldProjectAdvanced'
          && effect.key === project.key
          && effect.stage === 'source',
      ),
    ).toHaveLength(1);
  });
});

describe('field atlas and ground networks', () => {
  it('completes from breadth, rewards once, and caps familiarity', () => {
    const state = systemState(['terrestrial'], 0);
    const record = createGroundWorldRecord();
    state.expedition.groundWorlds.w1 = record;
    record.samples = { crystal: 1, basalt: 2, loam: 3 };
    expect(fieldAtlas(record)).toMatchObject({ score: 1, complete: false });

    record.surveyedAtMs = 10;
    record.species = { 'verge-lichen': 11 };
    record.landmarks = { 'stone-arch': 12 };
    record.weather = { rain: 13 };
    expect(fieldAtlas(record)).toMatchObject({ score: 5, total: 6, complete: true });

    const effects: SimEffect[] = [];
    const salvageBefore = state.expedition.salvage;
    const reputationBefore = state.operations.reputation.magrathea;
    state.gameTimeMs = 500;
    updateFieldKnowledge(state, effects, 'w1', 'World 1', 99);
    expect(record.familiarity).toBe(FAMILIARITY_MAX);
    expect(record.atlasCompletedAtMs).toBe(500);
    expect(state.expedition.salvage).toBe(salvageBefore + FIELD_ATLAS_SALVAGE);
    expect(state.operations.reputation.magrathea).toBe(
      reputationBefore + FIELD_ATLAS_REPUTATION,
    );

    state.gameTimeMs = 900;
    updateFieldKnowledge(state, effects, 'w1', 'World 1', 5);
    expect(record.familiarity).toBe(FAMILIARITY_MAX);
    expect(record.atlasCompletedAtMs).toBe(500);
    expect(state.expedition.salvage).toBe(salvageBefore + FIELD_ATLAS_SALVAGE);
    expect(state.operations.reputation.magrathea).toBe(
      reputationBefore + FIELD_ATLAS_REPUTATION,
    );
    expect(effects.filter((effect) => effect.t === 'fieldAtlasCompleted')).toHaveLength(1);
    expect(
      state.worldRecords['1']!.history.filter((event) => event.kind === 'atlasCompleted'),
    ).toHaveLength(1);
  });

  it('turns Mobility III, two beacons, and a station into one field corridor', () => {
    const state = systemState(['terrestrial'], 0);
    const record = createGroundWorldRecord();
    record.marks = [
      { kind: 'beacon', dir: [1, 0, 0], atMs: 1 },
      { kind: 'beacon', dir: [0, 1, 0], atMs: 2 },
      { kind: 'station', dir: [0, 0, 1], atMs: 3 },
    ];
    state.expedition.groundWorlds.w1 = record;
    const effects: SimEffect[] = [];

    expect(updateFieldCorridor(state, effects, 'w1', 'World 1')).toBe(false);
    state.expedition.certs.mobility = 3;
    expect(updateFieldCorridor(state, effects, 'w1', 'World 1')).toBe(true);
    expect(updateFieldCorridor(state, effects, 'w1', 'World 1')).toBe(false);
    expect(state.expedition.routes).toEqual({
      'corridor:w1': {
        id: 'corridor:w1',
        from: 1,
        to: 1,
        kind: 'field-corridor',
        name: 'World 1 Field Circuit',
        establishedAtMs: state.gameTimeMs,
        trips: 0,
      },
    });
    expect(effects.filter((effect) => effect.t === 'fieldRouteEstablished')).toHaveLength(1);
    expect(
      state.worldRecords['1']!.history.filter(
        (event) => event.kind === 'routeEstablished' && event.id === 'corridor:w1',
      ),
    ).toHaveLength(1);
  });

  it('retires unfinished projects and their scaffolds while keeping completed work', () => {
    const { state, project } = singleProject();
    const unfinished = { ...project, stage: 'return' as const };
    const completed: FieldProjectState = {
      ...project,
      key: `${project.key}:complete`,
      id: 'reef-memory',
      stage: 'complete',
      completedAtMs: 100,
    };
    state.expedition.fieldProjects = {
      [unfinished.key]: unfinished,
      [completed.key]: completed,
    };
    const ground = createGroundWorldRecord();
    ground.projectSites[unfinished.key] = {
      id: unfinished.key,
      kind: 'greenhouse',
      state: 'scaffold',
      atMs: 10,
      sourceWorld: unfinished.source,
    };
    ground.projectSites[completed.key] = {
      id: completed.key,
      kind: 'wetland',
      state: 'complete',
      atMs: 100,
      sourceWorld: completed.source,
    };
    state.expedition.groundWorlds[`w${unfinished.receiver}`] = ground;

    retireUnfinishedFieldProjects(state);
    expect(state.expedition.fieldProjects).toEqual({ [completed.key]: completed });
    expect(ground.projectSites[unfinished.key]).toBeUndefined();
    expect(ground.projectSites[completed.key]).toMatchObject({ state: 'complete' });
  });
});
