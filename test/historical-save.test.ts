import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deserialize } from '../src/engine/save/codec';
import { C } from '../src/content/constants';
import { ASPECT_HARDWARE } from '../src/engine/worldHardware';

const V2_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/save-v2-progressed.json', import.meta.url),
);

describe('frozen historical saves', () => {
  it('migrates an actual v2-shaped progressed save without losing progress', () => {
    const raw = readFileSync(V2_FIXTURE_PATH, 'utf8');
    const result = deserialize(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const state = result.state;
    expect(state.version).toBe(C.SAVE_VERSION);
    expect(state.seed).toBe(23063);
    expect(state.gameTimeMs).toBe(987654);
    expect(state.tu.toString()).toBe('4200000000000000000');
    expect(state.science.toString()).toBe('12345');
    expect(state.buildings).toEqual({
      seedProbe: 17,
      atmoProcessor: 9,
      hydroPump: 6,
      bioSeeder: 4,
    });
    expect(state.research.completed).toEqual(['orbital-surveying']);
    expect(state.lifetime).toMatchObject({
      clicks: 4321,
      planetsCompleted: 8,
      systems: 1,
      prestiges: 1,
    });
    expect(state.prestige).toMatchObject({
      bp: 13,
      bpEarned: 21,
      catalogue: { cheapStarts: 2 },
    });
    expect(state.run.completedPlanets).toMatchObject([
      {
        lifetimeIndex: 6,
        seed: 111,
        type: 'desert',
        size: 'small',
        name: 'Carpenter Delta',
        quirks: [],
        survey: null,
        completionMs: 0,
        bottleneck: 'hydro',
      },
      {
        lifetimeIndex: 7,
        seed: 222,
        type: 'ocean',
        size: 'large',
        name: 'Mostly Damp',
        quirks: [],
        survey: null,
        completionMs: 0,
        bottleneck: 'bio',
      },
      {
        lifetimeIndex: 8,
        seed: 333,
        type: 'gasgiant',
        size: 'huge',
        name: 'Hooloovoo Minor',
        quirks: [],
        survey: null,
        completionMs: 0,
        bottleneck: 'atmo',
      },
    ]);
    // Pre-v5 worlds carry biography-derived hardware after migration.
    for (const world of state.run.completedPlanets) {
      expect(world.installations).toContain('seedProbe');
      expect(world.installations).toContain(ASPECT_HARDWARE[world.bottleneck]);
    }
    expect(state.planet.startedAtGameMs).toBe(987654);
    expect(state.operations).toMatchObject({
      active: null,
      completed: [],
      reputation: { magrathea: 0, mice: 0, vogon: 0 },
      systemSpecialties: {},
      heritageWorlds: [],
    });
  });
});
