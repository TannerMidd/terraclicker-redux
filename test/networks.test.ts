import { describe, expect, it } from 'vitest';
import { C } from '../src/content/constants';
import {
  deriveGalaxyNetwork,
  galaxyAccord,
} from '../src/engine/networks';
import { serialize } from '../src/engine/save/codec';
import { computeDerived, newGame, stepOffline } from '../src/engine/sim';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };

function withGalaxies(
  accordArticles: readonly (readonly string[])[],
  seed = 20260725,
): GameState {
  const state = newGame(seed, 0);
  state.run.galaxies = accordArticles.length;
  state.run.systems = accordArticles.length * C.SYSTEMS_PER_GALAXY;
  accordArticles.forEach((articles, galaxyIndex) => {
    articles.forEach((id, slot) => {
      state.run.charters[String(galaxyIndex * C.SYSTEMS_PER_GALAXY + slot)] = id;
    });
  });
  return state;
}

function productionState(
  articles: readonly string[],
  formed: boolean,
  building: 'seedProbe' | 'researchLab' = 'seedProbe',
): GameState {
  const state = withGalaxies([articles]);
  state.run.galaxies = formed ? 1 : 0;
  state.buildings[building] = 20;
  return state;
}

describe('Galaxy Accord networks', () => {
  it('stays unratified until three member systems have signed articles', () => {
    const state = withGalaxies([['works-committee', 'salvage-rights']]);
    const pending = galaxyAccord(state, 0);
    expect(pending?.signedCount).toBe(2);
    expect(pending?.quorum).toBe(C.NETWORK_QUORUM_ARTICLES);
    expect(pending?.kind).toBeNull();

    state.run.charters['2'] = 'observatory';
    const ratified = galaxyAccord(state, 0);
    expect(ratified?.signedCount).toBe(3);
    expect(ratified?.kind).toBe('works-combine');
    expect(ratified?.quorumVotes['works-combine']).toBe(2);
  });

  it('uses stable system order for quorum and ignores higher seats after quorum', () => {
    const state = withGalaxies([[
      'mutual-aid',
      'observatory',
      'thermal-compact',
    ]]);
    expect(galaxyAccord(state, 0)?.kind).toBe('civic-commons');

    state.run.charters['3'] = 'observatory';
    state.run.charters['4'] = 'observatory';
    expect(galaxyAccord(state, 0)?.kind).toBe('civic-commons');
  });

  it('is a pure deterministic projection and consumes no RNG state', () => {
    const state = withGalaxies([
      ['mutual-aid', 'observatory', 'water-board'],
      ['works-committee', 'salvage-rights', 'observatory'],
    ]);
    const rngBefore = JSON.stringify(state.rng);
    const first = deriveGalaxyNetwork(state);
    const second = deriveGalaxyNetwork(state);

    expect(second).toEqual(first);
    expect(JSON.stringify(state.rng)).toBe(rngBefore);
  });

  it('caps every aggregate bonus while rewarding distinct accord traditions', () => {
    const articlesByKind: readonly (readonly string[])[] = [
      ['mutual-aid', 'open-correspondence', 'quiet-clause'],
      ['works-committee', 'salvage-rights', 'works-committee'],
      ['observatory', 'observatory', 'observatory'],
      ['thermal-compact', 'water-board', 'thermal-compact'],
    ];
    const state = withGalaxies(
      Array.from({ length: 80 }, (_, index) => articlesByKind[index % 4]!),
    );
    const effects = deriveGalaxyNetwork(state).effects;

    expect(effects.diversityKinds).toHaveLength(4);
    expect(effects.diversityMult).toBeCloseTo(1 + C.NETWORK_DIVERSITY_CAP, 12);
    expect(effects.prodMult).toBeCloseTo(
      (1 + C.NETWORK_PROD_CAP) * (1 + C.NETWORK_DIVERSITY_CAP),
      12,
    );
    expect(effects.scienceMult).toBeCloseTo(1 + C.NETWORK_SCIENCE_CAP, 12);
    expect(effects.aspectMult.bio).toBeCloseTo(1 + C.NETWORK_ASPECT_CAP, 12);
  });

  it('applies the production Accord exactly once in the economy chain', () => {
    const articles = ['works-committee', 'salvage-rights', 'works-committee'];
    const pending = productionState(articles, false);
    const formed = productionState(articles, true);
    const ratio = computeDerived(formed, OPTS).tuPerSec
      .div(computeDerived(pending, OPTS).tuPerSec)
      .toNumber();

    expect(ratio).toBeCloseTo(
      C.GALAXY_MULT * (1 + C.NETWORK_WORKS_PROD),
      12,
    );
  });

  it('applies science and all-aspect Accords to their matching derived rates', () => {
    const observatory = ['observatory', 'observatory', 'observatory'];
    const sciencePending = productionState(observatory, false, 'researchLab');
    const scienceFormed = productionState(observatory, true, 'researchLab');
    const scienceRatio = computeDerived(scienceFormed, OPTS).sciencePerSec
      .div(computeDerived(sciencePending, OPTS).sciencePerSec)
      .toNumber();
    expect(scienceRatio).toBeCloseTo(
      C.GALAXY_MULT * (1 + C.NETWORK_OBSERVATORY_SCIENCE),
      12,
    );

    const elemental = ['thermal-compact', 'water-board', 'thermal-compact'];
    const aspectPending = productionState(elemental, false);
    const aspectFormed = productionState(elemental, true);
    const aspectRatio = computeDerived(aspectFormed, OPTS).aspectPerSec.atmo
      .div(computeDerived(aspectPending, OPTS).aspectPerSec.atmo)
      .toNumber();
    expect(aspectRatio).toBeCloseTo(
      C.GALAXY_MULT * (1 + C.NETWORK_ELEMENTAL_ASPECT),
      12,
    );
  });

  it('preserves exact offline parity across different catch-up chunkings', () => {
    const articles = ['works-committee', 'salvage-rights', 'works-committee'];
    const once = productionState(articles, true);
    const split = productionState(articles, true);

    stepOffline(once, 120_000, OPTS);
    for (let i = 0; i < 4; i++) stepOffline(split, 30_000, OPTS);

    expect(serialize(split)).toEqual(serialize(once));
  });
});
