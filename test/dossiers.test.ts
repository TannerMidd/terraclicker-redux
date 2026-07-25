import { describe, expect, it } from 'vitest';
import { newGame, step, computeDerived } from '../src/engine/sim';
import { prestigeRequiredSystems, buildingCost } from '../src/engine/economy';
import { activeDossier, dossierEffects } from '../src/engine/dossiers';
import { DOSSIERS, DOSSIER_OFFER_COUNT } from '../src/content/dossiers';
import { serialize, deserialize } from '../src/engine/save/codec';
import { C } from '../src/content/constants';
import { D } from '../src/engine/num';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };

/** A state parked at the moment of appraisal, with the sale filed. */
function sold(seed = 20260723): GameState {
  const s = newGame(seed, 0);
  s.run.planetsCompleted = C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS;
  s.run.systems = C.PRESTIGE_MIN_SYSTEMS;
  s.run.tuEarned = D('1e15');
  step(s, 0, [{ type: 'prestige' }], OPTS);
  return s;
}

describe('Commission Dossiers', () => {
  it('files three different briefs at the sale, and none before it', () => {
    const fresh = newGame(1, 0);
    // The first commission is the one that teaches you what a commission is.
    expect(fresh.run.dossierOffers).toEqual([]);
    expect(fresh.run.dossier).toBeNull();

    const s = sold();
    expect(s.run.dossierOffers.length).toBe(DOSSIER_OFFER_COUNT);
    expect(new Set(s.run.dossierOffers).size).toBe(DOSSIER_OFFER_COUNT);
  });

  it('offers the same three for the same universe', () => {
    expect(sold(4242).run.dossierOffers).toEqual(sold(4242).run.dossierOffers);
  });

  it('accepts one of the three, once, and clears the rest', () => {
    const s = sold();
    const chosen = s.run.dossierOffers[1]!;

    step(s, 0, [{ type: 'acceptDossier', id: chosen }], OPTS);
    expect(s.run.dossier).toBe(chosen);
    expect(s.run.dossierOffers).toEqual([]);

    // A second acceptance is not a re-brief.
    const other = DOSSIERS.find((d) => d.id !== chosen)!.id;
    step(s, 0, [{ type: 'acceptDossier', id: other }], OPTS);
    expect(s.run.dossier).toBe(chosen);
  });

  it('refuses a brief that was never on offer', () => {
    const s = sold();
    const notOffered = DOSSIERS.find((d) => !s.run.dossierOffers.includes(d.id))!.id;
    step(s, 0, [{ type: 'acceptDossier', id: notOffered }], OPTS);
    expect(s.run.dossier).toBeNull();
    expect(s.run.dossierOffers.length).toBe(DOSSIER_OFFER_COUNT);
  });

  it('changes exactly one economic rule, never several', () => {
    for (const def of DOSSIERS) {
      const s = newGame(7, 0);
      s.run.dossier = def.id;
      const e = dossierEffects(s);
      const changed = [
        e.prodMult !== 1,
        e.scienceMult !== 1,
        e.costMult !== 1,
        e.headStart !== 0,
        e.completionMult !== 1,
      ].filter(Boolean).length;
      expect(changed, `${def.id} changed ${changed} rules`).toBe(1);
    }
  });

  it('is neutral in every direction when no brief is in force', () => {
    const s = newGame(7, 0);
    expect(activeDossier(s)).toBeNull();
    expect(dossierEffects(s)).toEqual({
      prodMult: 1, scienceMult: 1, costMult: 1, headStart: 0, completionMult: 1,
    });
  });

  it('applies its rule to the economy it names', () => {
    const cheap = newGame(7, 0);
    cheap.run.dossier = 'vogon-minimum'; // installations 25% off
    const plain = newGame(7, 0);
    const cheapCost = buildingCost('seedProbe', 0, computeDerived(cheap, OPTS));
    const plainCost = buildingCost('seedProbe', 0, computeDerived(plain, OPTS));
    expect(cheapCost.lt(plainCost)).toBe(true);

    const sci = newGame(7, 0);
    sci.run.dossier = 'experimental-cluster'; // science doubles
    sci.buildings['researchLab'] = 2;
    plain.buildings['researchLab'] = 2;
    expect(computeDerived(sci, OPTS).sciencePerSec.gt(computeDerived(plain, OPTS).sciencePerSec))
      .toBe(true);
  });

  it('moves the terms of the sale, but never below one system', () => {
    const base = newGame(7, 0);
    const baseline = prestigeRequiredSystems(base);

    const harder = newGame(7, 0);
    harder.run.dossier = 'flagship'; // +1 system
    expect(prestigeRequiredSystems(harder)).toBe(baseline + 1);

    const easier = newGame(7, 0);
    easier.run.dossier = 'quiet-contract'; // -1 system
    expect(prestigeRequiredSystems(easier)).toBe(baseline - 1);

    // No stacking of commissions and briefs can ask for nothing.
    const absurd = newGame(7, 0);
    absurd.run.dossier = 'quiet-contract';
    absurd.lifetime.prestiges = -99; // forced far below the floor
    expect(prestigeRequiredSystems(absurd)).toBeGreaterThanOrEqual(1);
  });

  it('shifts which worlds arrive without making any type impossible', () => {
    const s = newGame(31337, 0);
    s.run.dossier = 'luxury-ocean';
    const types = new Set<string>();
    for (let i = 0; i < 120; i++) {
      s.run.planetsCompleted = i + 1;
      s.planet = { ...s.planet };
      step(s, 0, [{ type: 'devGrant', tu: '1e9', gaugeFrac: 1 }], OPTS);
      types.add(s.planet.type);
    }
    // Oceans are weighted x5, but the portfolio is still a portfolio.
    expect(types.size).toBeGreaterThan(1);
  });

  it('goes with the portfolio when it is sold', () => {
    const s = sold();
    step(s, 0, [{ type: 'acceptDossier', id: s.run.dossierOffers[0]! }], OPTS);
    expect(s.run.dossier).not.toBeNull();

    s.run.planetsCompleted = C.PLANETS_PER_SYSTEM * 20;
    s.run.systems = 20;
    s.run.tuEarned = D('1e15');
    step(s, 0, [{ type: 'prestige' }], OPTS);

    expect(s.run.dossier).toBeNull();
    expect(s.run.dossierOffers.length).toBe(DOSSIER_OFFER_COUNT);
  });

  it('survives a save round-trip', () => {
    const s = sold();
    step(s, 0, [{ type: 'acceptDossier', id: s.run.dossierOffers[0]! }], OPTS);
    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.run.dossier).toBe(s.run.dossier);
  });
});
