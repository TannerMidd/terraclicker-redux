import { describe, expect, it } from 'vitest';
import { computeDerived } from '../src/engine/economy';
import { D } from '../src/engine/num';
import { newGame } from '../src/engine/sim';
import { buildAttentionItems } from '../src/ui/mk2/Shell';

const OPTS = { utcDay: 3 };

describe('Mk II priority queue', () => {
  it('puts an expiring answer ahead of a deadline-bound contract', () => {
    const state = newGame(20260725, 0);
    state.situations = [{
      uid: 1,
      id: 'unknown-test-decision',
      remainingMs: 12_000,
      world: 0,
      worldName: state.planet.name,
    }];
    state.operations.active = {
      offer: {
        id: 'timed-test',
        templateId: 'timed',
        faction: 'mice',
        objective: { kind: 'timed', count: 2, durationMs: 60_000 },
        rewardBp: 1,
        rewardReputation: 1,
      },
      acceptedAtGameMs: 0,
      startPlanets: 0,
      startSystems: 0,
      progress: 1,
      deadlineAtGameMs: 30_000,
    };

    const items = buildAttentionItems(state, computeDerived(state, OPTS));

    expect(items.slice(0, 2).map((item) => item.kind)).toEqual(['answer', 'contract']);
    expect(items[0]?.detail).toContain('12s left');
    expect(items[1]?.detail).toContain('30s left');
  });

  it('states the physical freight leg instead of always naming the destination', () => {
    const state = newGame(20260725, 0);
    state.operations.offers = [];
    state.expedition.manifest = {
      uid: 4,
      id: 'small-machines',
      from: 0,
      to: 1,
      fromName: 'Origin',
      toName: 'Destination',
      distance: 12,
      salvage: 8,
      expiresAtMs: 90_000,
      acceptedAtMs: 0,
      pickedUpAtMs: null,
    };

    let manifest = buildAttentionItems(state, computeDerived(state, OPTS))
      .find((item) => item.kind === 'manifest');
    expect(manifest?.title).toBe('Collect at Origin');

    state.expedition.manifest.pickedUpAtMs = 1;
    manifest = buildAttentionItems(state, computeDerived(state, OPTS))
      .find((item) => item.kind === 'manifest');
    expect(manifest?.title).toBe('Deliver to Destination');
  });

  it('covers idle research, permanent decisions, ready rigs, and prestige', () => {
    const state = newGame(20260725, 0);
    state.buildings.researchLab = 1;
    state.science = D(1e9);
    state.run.dossierOffers = ['brief-a', 'brief-b'];
    state.run.charterOffers = { '0': ['charter-a', 'charter-b'] };
    state.lifetime.bestGalaxies = 1;
    state.expedition.rigs['seam-test'] = { placedAtMs: 0, banked: 4.8, lastTickMs: 0 };
    const derived = computeDerived(state, OPTS);
    derived.prestigeEligible = true;
    derived.prestigeBp = 7;

    const items = buildAttentionItems(state, derived);
    const kinds = new Set(items.map((item) => item.kind));

    for (const kind of ['research', 'dossier', 'charter', 'statute', 'rig', 'prestige'] as const) {
      expect(kinds.has(kind)).toBe(true);
    }
    expect(items.find((item) => item.kind === 'rig')?.detail).toContain('4 salvage');
    expect(items.find((item) => item.kind === 'statute')?.detail).toContain('1 stage');
  });
});
