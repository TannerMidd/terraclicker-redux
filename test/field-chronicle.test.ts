import { describe, expect, it } from 'vitest';
import { ensureFieldProjects } from '../src/engine/fieldProjects';
import { createGroundWorldRecord } from '../src/engine/groundSites';
import { createWorldRecord } from '../src/engine/worldRecords';
import { newGame, step } from '../src/engine/sim';
import type { CompletedPlanetRecord, GameState, PlanetType } from '../src/engine/types';

const OPTS = { utcDay: 3 };

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

function stateWithWorlds(types: readonly PlanetType[]): GameState {
  const state = newGame(71_001, 0);
  state.run.completedPlanets = types.map((type, i) => completedWorld(i + 1, type));
  state.run.planetsCompleted = types.length;
  state.run.systems = Math.floor(types.length / 5);
  state.planet.lifetimeIndex = types.length + 1;
  for (const world of state.run.completedPlanets) {
    state.worldRecords[String(world.lifetimeIndex)] = createWorldRecord(world, 1, 0);
  }
  return state;
}

function chronicleText(state: GameState): string {
  return state.subEtha.log
    .filter((entry) => entry.kind === 'chronicle')
    .map((entry) => entry.text)
    .join(' ');
}

describe('field work in the chronicle', () => {
  it('files project completion and the route that became useful', () => {
    const state = stateWithWorlds(['desert', 'ice', 'terrestrial', 'ocean', 'volcanic']);
    ensureFieldProjects(state);
    const project = Object.values(state.expedition.fieldProjects)[0]!;
    project.stage = 'return';
    const ground = createGroundWorldRecord();
    ground.visits = 1;
    state.expedition.groundWorlds[`w${project.receiver}`] = ground;

    const result = step(state, 0, [{
      type: 'bankGroundSamples',
      worldKey: `w${project.receiver}`,
      worldName: `World ${project.receiver}`,
      haul: [],
      sites: {},
      evidence: { civic: true, contacted: true, readings: 1 },
    }], OPTS);

    expect(result.effects.some((effect) => effect.t === 'fieldProjectCompleted')).toBe(true);
    const text = chronicleText(state);
    expect(text).toContain('complete and working');
    expect(text).toContain('entered the charts as a route somebody actually proved');
  });

  it('files Atlas, route, and familiarity milestones once when their thresholds are crossed', () => {
    const atlasState = stateWithWorlds(['terrestrial']);
    const atlas = createGroundWorldRecord();
    atlas.visits = 1;
    atlas.surveyedAtMs = 1;
    atlas.species = { 'verge-lichen': 2 };
    atlas.landmarks = { 'stone-arch': 3 };
    atlas.weather = { rain: 4 };
    atlas.familiarity = 2;
    atlasState.expedition.groundWorlds.w1 = atlas;

    step(atlasState, 0, [{
      type: 'bankGroundSamples',
      worldKey: 'w1',
      worldName: 'World 1',
      haul: [{ kind: 'field-crystal', n: 1, method: 'quick' }],
      sites: {},
    }], OPTS);

    const atlasText = chronicleText(atlasState);
    expect(atlasText).toContain("World 1's Field Atlas is filed at 5/6");
    expect(atlasText).toContain('familiarity 3');

    const routeState = stateWithWorlds(['terrestrial']);
    const routeGround = createGroundWorldRecord();
    routeGround.visits = 1;
    routeGround.familiarity = 5;
    routeGround.marks = [
      { kind: 'beacon', dir: [1, 0, 0], atMs: 1 },
      { kind: 'beacon', dir: [0, 1, 0], atMs: 2 },
      { kind: 'station', dir: [0, 0, 1], atMs: 3 },
    ];
    routeState.expedition.groundWorlds.w1 = routeGround;
    routeState.expedition.certs.mobility = 3;

    step(routeState, 0, [{
      type: 'bankGroundSamples',
      worldKey: 'w1',
      worldName: 'World 1',
      haul: [],
      sites: {},
    }], OPTS);
    step(routeState, 0, [{
      type: 'bankGroundSamples',
      worldKey: 'w1',
      worldName: 'World 1',
      haul: [],
      sites: {},
    }], OPTS);

    const routeEntries = routeState.subEtha.log.filter(
      (entry) => entry.kind === 'chronicle' && entry.text.includes('Field Circuit'),
    );
    const milestoneEntries = routeState.subEtha.log.filter(
      (entry) => entry.kind === 'chronicle' && entry.text.includes('familiarity 6'),
    );
    expect(routeEntries).toHaveLength(1);
    expect(milestoneEntries).toHaveLength(1);
  });
});
