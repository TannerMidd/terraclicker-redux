import { describe, expect, it } from 'vitest';
import { newGame, step, computeDerived } from '../src/engine/sim';
import {
  buildingCost,
  bulkCost,
  maxAffordable,
  prestigeBpFor,
  prestigeEligible,
  prestigeRequiredSystems,
} from '../src/engine/economy';
import { forecastEvent, spawnEvent } from '../src/engine/improbability';
import type { SimEffect } from '../src/engine/types';
import { D } from '../src/engine/num';
import { format } from '../src/engine/num';
import { C } from '../src/content/constants';

const OPTS = { utcDay: 3 };

describe('economy', () => {
  it('building costs are strictly increasing in owned count', () => {
    const s = newGame(1, 0);
    const d = computeDerived(s, OPTS);
    let prev = D(0);
    for (let owned = 0; owned < 60; owned++) {
      const cost = buildingCost('seedProbe', owned, d);
      expect(cost.gt(prev)).toBe(true);
      prev = cost;
    }
  });

  it('maxAffordable is exact at the boundary', () => {
    const s = newGame(1, 0);
    const d = computeDerived(s, OPTS);
    s.tu = D(10_000);
    const n = maxAffordable('seedProbe', 0, s.tu, d);
    expect(n).toBeGreaterThan(0);
    expect(bulkCost('seedProbe', 0, n, d).lte(s.tu)).toBe(true);
    expect(bulkCost('seedProbe', 0, n + 1, d).gt(s.tu)).toBe(true);
  });

  it('buying produces TU/s; TU/s grows with more buildings', () => {
    const s = newGame(1, 0);
    s.tu = D(1e6);
    step(s, 250, [{ type: 'buyBuilding', id: 'seedProbe', qty: 10 }], OPTS);
    const d1 = computeDerived(s, OPTS);
    expect(d1.tuPerSec.gt(0)).toBe(true);
    step(s, 250, [{ type: 'buyBuilding', id: 'seedProbe', qty: 10 }], OPTS);
    const d2 = computeDerived(s, OPTS);
    expect(d2.tuPerSec.gt(d1.tuPerSec)).toBe(true);
  });

  it('unique buildings cannot be bought twice', () => {
    const s = newGame(1, 0);
    s.tu = D(1e12);
    step(s, 250, [{ type: 'buyBuilding', id: 'marvin', qty: 1 }], OPTS);
    expect(s.buildings['marvin']).toBe(1);
    step(s, 250, [{ type: 'buyBuilding', id: 'marvin', qty: 5 }], OPTS);
    expect(s.buildings['marvin']).toBe(1);
  });

  it('rejects a valuable but incomplete portfolio until the assigned depth is finished', () => {
    const s = newGame(42, 0);
    s.run.planetsCompleted = 2;
    s.run.tuEarned = D('1e15');
    expect(prestigeBpFor(s)).toBeGreaterThanOrEqual(10);
    expect(prestigeEligible(s)).toBe(false);
    expect(computeDerived(s, OPTS).prestigeEligible).toBe(false);

    const rejected = step(s, 0, [{ type: 'prestige' }], OPTS);
    expect(rejected.effects.some((e) => e.t === 'prestiged')).toBe(false);
    expect(s.run.number).toBe(1);

    s.run.planetsCompleted = C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS;
    s.run.systems = C.PRESTIGE_MIN_SYSTEMS;
    expect(prestigeEligible(s)).toBe(true);

    const accepted = step(s, 0, [{ type: 'prestige' }], OPTS);
    expect(accepted.effects.some((e) => e.t === 'prestiged')).toBe(true);
    expect(s.run.number).toBe(2);
    expect(prestigeRequiredSystems(s)).toBe(
      C.PRESTIGE_MIN_SYSTEMS + C.PRESTIGE_SYSTEMS_PER_COMMISSION,
    );
  });

  it('carries Deep Thought metaprojects across commission sales', () => {
    const s = newGame(42, 0);
    s.run.planetsCompleted = C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS;
    s.run.systems = C.PRESTIGE_MIN_SYSTEMS;
    s.research.completed = ['thermal-dynamics', 'sep-field'];
    s.research.active = { id: 'bubble-stabilization', remainingMs: 12_345 };

    const result = step(s, 0, [{ type: 'prestige' }], OPTS);

    expect(result.effects.some((effect) => effect.t === 'prestiged')).toBe(true);
    expect(s.research.completed).toEqual(['sep-field']);
    expect(s.research.active).toEqual({
      id: 'bubble-stabilization',
      remainingMs: 12_345,
    });
  });

  it('turns Heart of Gold into coherent, forecastable Improbability', () => {
    const s = newGame(7, 0);
    const baseline = computeDerived(s, OPTS);
    s.buildings['heartOfGold'] = 1;
    const derived = computeDerived(s, OPTS);

    expect(derived.improbability).toBeGreaterThan(baseline.improbability);
    expect(derived.eventFreqMult).toBeGreaterThan(baseline.eventFreqMult);
    expect(derived.bubbleFreqMult).toBeGreaterThan(baseline.bubbleFreqMult);
    expect(derived.goldenOddsMult).toBeGreaterThan(baseline.goldenOddsMult);

    const eventCursor = s.rng.events;
    const forecast = forecastEvent(s, derived);
    expect(s.rng.events).toBe(eventCursor);
    const effects: SimEffect[] = [];
    spawnEvent(s, derived, effects);
    expect(s.activeEvents[0]?.id).toBe(forecast.id);
  });

  it('no NaN/negative anywhere across extreme magnitudes', () => {
    const s = newGame(1, 0);
    s.tu = D('1e300');
    s.run.tuEarned = D('1e300');
    s.lifetime.tuEarned = D('1e300');
    const d = computeDerived(s, OPTS);
    expect(Number.isNaN(d.tuPerSec.toNumber())).toBe(false);
    expect(d.prestigeBp).toBeGreaterThan(0);
    expect(Number.isFinite(d.prestigeBp)).toBe(true);
  });
});

describe('formatting', () => {
  it('formats the ladder', () => {
    expect(format(0)).toBe('0');
    expect(format(999)).toBe('999');
    expect(format(1_500)).toBe('1.50K');
    expect(format(2_340_000)).toBe('2.34M');
    expect(format(D('1.5e12'))).toBe('1.50T');
    expect(format(D('1e100'))).toContain('e100');
  });
});
