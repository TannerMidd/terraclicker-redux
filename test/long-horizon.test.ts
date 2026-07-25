import { describe, expect, it } from 'vitest';
import { newGame, step, stepOffline, computeDerived } from '../src/engine/sim';
import { prestigeBpFor, bulkCost, upgradeVisible } from '../src/engine/economy';
import { BUILDINGS } from '../src/content/buildings';
import { UPGRADES } from '../src/content/upgrades';
import { C } from '../src/content/constants';
import { D } from '../src/engine/num';
import { ASPECTS, type AspectId, type GameState, type Input } from '../src/engine/types';

const OPTS = { utcDay: 3 };
const TICK = 250;

/**
 * These tests exist because the game used to stop being a game after about
 * three hours of determined play. `prodMult` compounded BP (1.02^bpEarned)
 * while `prestigeBpFor` took a cube root of production — a closed loop, doubly
 * exponential, Infinity by prestige 19. Everything here is a guard on that
 * shape rather than on any particular number: the loop must stay broken.
 */

function bottleneck(state: GameState): AspectId {
  let result: AspectId = 'thermal';
  let lowest = Number.POSITIVE_INFINITY;
  for (const aspect of ASPECTS) {
    const fraction = state.planet.gauges[aspect].div(state.planet.targets[aspect]).toNumber();
    if (fraction < lowest) {
      lowest = fraction;
      result = aspect;
    }
  }
  return result;
}

function buyer(state: GameState): Input[] {
  const inputs: Input[] = [];
  const d = computeDerived(state, OPTS);
  for (const u of UPGRADES) {
    if (upgradeVisible(u, state, d) && state.tu.gte(u.cost)) {
      inputs.push({ type: 'buyUpgrade', id: u.id });
      break;
    }
  }
  const focus = bottleneck(state);
  let bestId: string | null = null;
  let bestValue = 0;
  for (const b of BUILDINGS) {
    if (b.unique && (state.buildings[b.id] ?? 0) > 0) continue;
    const owned = state.buildings[b.id] ?? 0;
    const cost = bulkCost(b.id, owned, 1, d);
    if (state.tu.lt(cost)) continue;
    const aspectSum = Object.values(b.aspects).reduce((a, v) => a + (v ?? 0), 0);
    const value = (b.tuPerSec + aspectSum + (b.aspects[focus] ?? 0) * 3) / cost.toNumber();
    if (value > bestValue) {
      bestValue = value;
      bestId = b.id;
    }
  }
  if (bestId) inputs.push({ type: 'buyBuilding', id: bestId, qty: 'max' });
  for (const bub of state.bubbles) inputs.push({ type: 'catchBubble', id: bub.id });
  return inputs;
}

describe('long horizons stay finite', () => {
  // Ten, not twenty. Before the fix an adversarial bot reached prestige 19 in
  // 171 minutes, because each commission funded the next one superexponentially.
  // With the loop broken, commissions cost what PROGRESSION.md says they cost
  // and six hours buys about ten of them. The lower number is the fix working;
  // the shape assertions below are what actually guard the divergence.
  it('ten prestiges of hard play do not overflow the economy', () => {
    const state = newGame(20260723, 0);
    const awards: number[] = [];
    const totalTicks = (360 * 60_000) / TICK; // six simulated hours

    for (let tick = 0; tick < totalTicks && state.lifetime.prestiges < 20; tick++) {
      const inputs: Input[] = [{ type: 'click' }];
      if (tick % 20 === 0) inputs.push(...buyer(state));
      inputs.push({ type: 'prestige' }); // adversarial: file the sale constantly
      const r = step(state, TICK, inputs, OPTS);
      for (const e of r.effects) if (e.t === 'prestiged') awards.push(e.bp);
    }

    expect(state.lifetime.prestiges).toBeGreaterThanOrEqual(10);
    for (const [i, bp] of awards.entries()) {
      expect(Number.isFinite(bp), `award ${i + 1} was ${bp}`).toBe(true);
    }
    expect(Number.isFinite(state.prestige.bp)).toBe(true);
    expect(Number.isFinite(state.prestige.bpEarned)).toBe(true);
    expect(computeDerived(state, OPTS).tuPerSec.toNumber()).toBeLessThan(Infinity);
    // The old curve reached 1.3e10 BP on award 18 alone. Nothing in twenty
    // honest prestiges should hand out more BP than a person could spend.
    expect(state.prestige.bpEarned).toBeLessThan(1e6);
  }, 120_000);

  it('BP stays finite even when a run out-earns what a JS number can hold', () => {
    const state = newGame(20260723, 0);
    // 1e400 TU cannot be a JS number at all; it can be a Decimal.
    state.run.tuEarned = D('1e400');
    state.run.planetsCompleted = 500;
    const bp = prestigeBpFor(state);
    expect(Number.isFinite(bp)).toBe(true);
    expect(bp).toBeGreaterThan(0);
  });

  it('the BP passive bonus is additive, so production cannot compound into it', () => {
    const base = newGame(20260723, 0);
    base.buildings['seedProbe'] = 10;

    const at = (bpEarned: number) => {
      const s = newGame(20260723, 0);
      s.buildings['seedProbe'] = 10;
      s.prestige.bpEarned = bpEarned;
      return computeDerived(s, OPTS).tuPerSec.toNumber();
    };

    const zero = at(0);
    const hundred = at(100);
    const thousand = at(1000);

    // Additive: 100 BP is +200%, 1000 BP is +2000%. Ratios, not powers.
    expect(hundred / zero).toBeCloseTo(1 + C.BP_PASSIVE * 100, 4);
    expect(thousand / zero).toBeCloseTo(1 + C.BP_PASSIVE * 1000, 4);
    // The shape that broke: 1.02^1000 is about 4e8. Anything near that means
    // the loop is back.
    expect(thousand / zero).toBeLessThan(100);
  });

  it('a week of accumulated absence produces finite, ordered state', () => {
    const state = newGame(20260723, 0);
    for (let tick = 0; tick < (30 * 60_000) / TICK; tick++) {
      const inputs: Input[] = [{ type: 'click' }];
      if (tick % 20 === 0) inputs.push(...buyer(state));
      step(state, TICK, inputs, OPTS);
    }

    // Seven days, taken as the player would take them: return, collect, leave.
    for (let day = 0; day < 7; day++) {
      const before = state.tu;
      const r = stepOffline(state, C.OFFLINE_CAP_MS, OPTS);
      expect(r.simulatedMs).toBeGreaterThan(0);
      expect(state.tu.gte(before)).toBe(true);
      expect(Number.isNaN(state.tu.toNumber())).toBe(false);
    }

    expect(state.tu.gt(0)).toBe(true);
    const d = computeDerived(state, OPTS);
    expect(Number.isNaN(d.tuPerSec.toNumber())).toBe(false);
    expect(Number.isFinite(prestigeBpFor(state))).toBe(true);
  }, 60_000);
});
