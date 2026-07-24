import { describe, expect, it } from 'vitest';
import { newGame, step, computeDerived } from '../src/engine/sim';
import { buildingCost, bulkCost, maxAffordable } from '../src/engine/economy';
import { D } from '../src/engine/num';
import { format } from '../src/engine/num';

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
