import { describe, expect, it } from 'vitest';
import { newGame, step, computeDerived } from '../src/engine/sim';
import {
  createStandingOrders,
  sanitizeOrders,
  standingOrderInputs,
  standingOrdersUnlocked,
} from '../src/engine/standingOrders';
import { D } from '../src/engine/num';
import type { GameState, StandingOrders } from '../src/engine/types';

const OPTS = { utcDay: 3 };

function rich(): GameState {
  const s = newGame(20260723, 0);
  s.tu = D(1e9);
  s.lifetime.tuEarned = D(1e9);
  s.lifetime.prestiges = 1;
  s.buildings['seedProbe'] = 5; // some income, so a reserve means something
  return s;
}

const orders = (over: Partial<StandingOrders> = {}): StandingOrders => ({
  ...createStandingOrders(),
  enabled: true,
  ...over,
});

describe('Standing Orders', () => {
  it('does nothing at all until switched on', () => {
    const s = rich();
    const d = computeDerived(s, OPTS);
    expect(standingOrderInputs(s, d, createStandingOrders())).toEqual([]);
    // ...and even switched on, every individual policy is still off.
    expect(standingOrderInputs(s, d, orders())).toEqual([]);
  });

  it('is earned: not configurable until a commission has been sold by hand', () => {
    const fresh = newGame(1, 0);
    expect(standingOrdersUnlocked(fresh)).toBe(false);
    step(fresh, 0, [{ type: 'setStandingOrders', orders: orders({ autoBuild: true }) }], OPTS);
    expect(fresh.standingOrders.enabled).toBe(false);

    fresh.lifetime.prestiges = 1;
    step(fresh, 0, [{ type: 'setStandingOrders', orders: orders({ autoBuild: true }) }], OPTS);
    expect(fresh.standingOrders.enabled).toBe(true);
    expect(fresh.standingOrders.autoBuild).toBe(true);
  });

  it('respects the reserve the player wrote down', () => {
    const s = rich();
    const d = computeDerived(s, OPTS);
    // A reserve larger than the bank leaves nothing spendable.
    const huge = Math.ceil(s.tu.div(d.tuPerSec).toNumber()) + 60;
    expect(standingOrderInputs(s, d, orders({ autoBuild: true, reserveSeconds: huge }))).toEqual([]);
    // With no reserve, it buys.
    const bought = standingOrderInputs(s, d, orders({ autoBuild: true, reserveSeconds: 0 }));
    expect(bought.length).toBe(1);
    expect(bought[0]!.type).toBe('buyBuilding');
  });

  it('buys in the order the player asked for, not the order it prefers', () => {
    const s = rich();
    const d = computeDerived(s, OPTS);
    const out = standingOrderInputs(s, d, orders({
      autoBuild: true,
      buildPriority: ['bioDome', 'seedProbe'],
    }));
    expect(out[0]).toEqual({ type: 'buyBuilding', id: 'bioDome', qty: 1 });
  });

  it('buys nothing outside the priority list rather than improvising', () => {
    const s = rich();
    s.tu = D(20); // affords a probe, nothing on the list
    const d = computeDerived(s, OPTS);
    const out = standingOrderInputs(s, d, orders({
      autoBuild: true,
      buildPriority: ['stellarForge'],
    }));
    expect(out).toEqual([]);
  });

  it('spends at most once per call, so it stays interruptible', () => {
    const s = rich();
    const d = computeDerived(s, OPTS);
    const out = standingOrderInputs(s, d, orders({ autoBuild: true, autoUpgrade: true }));
    expect(out.length).toBeLessThanOrEqual(1);
  });

  it('stops entirely while something is being asked of the player', () => {
    const s = rich();
    const d = computeDerived(s, OPTS);
    s.situations = [
      { uid: 1, id: 'towel-census', remainingMs: 5000, world: 0, worldName: '' },
    ];
    expect(standingOrderInputs(s, d, orders({
      autoBuild: true, autoUpgrade: true, pauseOnSituation: true,
    }))).toEqual([]);
    // The player can opt out of the pause, but not by accident — it defaults on.
    expect(createStandingOrders().pauseOnSituation).toBe(true);
  });

  it('never answers a question', () => {
    const s = rich();
    s.planet.surveyOptions = ['a', 'b', 'c'];
    s.run.petitions = [
      { uid: 2, id: 'quiet-request', remainingMs: 9000, world: 1, worldName: 'Somewhere' },
    ];
    const d = computeDerived(s, OPTS);
    const out = standingOrderInputs(s, d, orders({
      autoBuild: true, autoUpgrade: true, autoResearch: true, pauseOnSituation: false,
    }));
    // Purchases are fine. Judgement is not automatable, by design.
    for (const input of out) {
      expect(['buyBuilding', 'buyUpgrade', 'startResearch']).toContain(input.type);
    }
    expect(s.planet.survey).toBeNull();
  });

  it('works the research queue in the order given, skipping what it cannot start', () => {
    const s = rich();
    s.science = D(1e6);
    s.buildings['researchLab'] = 5;
    const d = computeDerived(s, OPTS);

    // sep-field is gated behind babel-fish and cannot be started yet; the
    // queue must step over it rather than stalling on it forever.
    const out = standingOrderInputs(s, d, orders({
      autoResearch: true,
      researchQueue: ['not-a-real-project', 'sep-field', 'thermal-dynamics'],
    }));
    expect(out).toEqual([{ type: 'startResearch', id: 'thermal-dynamics' }]);

    // And once the prerequisite is in, the earlier entry wins again — the
    // order the player wrote is the order they get.
    s.research.completed = ['babel-fish'];
    const later = standingOrderInputs(s, computeDerived(s, OPTS), orders({
      autoResearch: true,
      researchQueue: ['sep-field', 'thermal-dynamics'],
    }));
    expect(later).toEqual([{ type: 'startResearch', id: 'sep-field' }]);
  });

  it('drops ids the game does not have rather than queueing silence', () => {
    const clean = sanitizeOrders(orders({
      buildPriority: ['seedProbe', 'nonsense'],
      researchQueue: ['sep-field', 'also-nonsense'],
      reserveSeconds: -50,
    }));
    expect(clean.buildPriority).toEqual(['seedProbe']);
    expect(clean.researchQueue).toEqual(['sep-field']);
    expect(clean.reserveSeconds).toBe(0);
  });

  it('actually buys things when driven through the real loop', () => {
    const s = rich();
    s.standingOrders = orders({ autoBuild: true });
    const before = Object.values(s.buildings).reduce((a, n) => a + n, 0);
    for (let i = 0; i < 40; i++) step(s, 250, [], OPTS);
    const after = Object.values(s.buildings).reduce((a, n) => a + n, 0);
    expect(after).toBeGreaterThan(before);
  });
});
