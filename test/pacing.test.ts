import { describe, expect, it } from 'vitest';
import { newGame, step, computeDerived } from '../src/engine/sim';
import { bulkCost, upgradeVisible } from '../src/engine/economy';
import { BUILDINGS } from '../src/content/buildings';
import { UPGRADES } from '../src/content/upgrades';
import type { GameState, Input } from '../src/engine/types';

const OPTS = { utcDay: 3 };

/**
 * A pragmatic greedy bot: clicks 4/s, buys the best production-per-cost
 * building every 5s, grabs any visible upgrade. Smoke-level version of the
 * harness bots (PROGRESSION.md §9).
 */
function botInputs(state: GameState, tick: number): Input[] {
  const inputs: Input[] = [];
  inputs.push({ type: 'click' }); // 4 clicks/sec at 250ms ticks
  if (tick % 20 === 0) {
    const d = computeDerived(state, OPTS);
    // Upgrades first: they are always worth it at this scale.
    for (const u of UPGRADES) {
      if (upgradeVisible(u, state, d) && state.tu.gte(u.cost)) {
        inputs.push({ type: 'buyUpgrade', id: u.id });
        break;
      }
    }
    // Best value = tuPerSec gain per TU spent, approximated by def rates.
    let bestId: string | null = null;
    let bestValue = 0;
    for (const b of BUILDINGS) {
      if (b.unique && (state.buildings[b.id] ?? 0) > 0) continue;
      const owned = state.buildings[b.id] ?? 0;
      const cost = bulkCost(b.id, owned, 1, d);
      if (state.tu.lt(cost)) continue;
      const aspectSum = Object.values(b.aspects).reduce((a, v) => a + (v ?? 0), 0);
      const value = (b.tuPerSec + aspectSum) / cost.toNumber();
      if (value > bestValue) {
        bestValue = value;
        bestId = b.id;
      }
    }
    if (bestId) inputs.push({ type: 'buyBuilding', id: bestId, qty: 'max' });
    // Catch any bubble that's up (the bot has excellent reflexes).
    for (const bub of state.bubbles) inputs.push({ type: 'catchBubble', id: bub.id });
  }
  return inputs;
}

describe('pacing smoke (harness CI bands, PROGRESSION.md §9)', () => {
  it('planet 1 completes within 4 minutes for an active player', () => {
    const s = newGame(2024, 0);
    let completedAtMs: number | null = null;
    for (let tick = 0; tick < 4 * 60 * 4; tick++) {
      const r = step(s, 250, botInputs(s, tick), OPTS);
      if (r.effects.some((e) => e.t === 'planetComplete')) {
        completedAtMs = s.gameTimeMs;
        break;
      }
    }
    expect(completedAtMs).not.toBeNull();
    expect(completedAtMs!).toBeLessThanOrEqual(4 * 60_000);
  });

  it('a 90-minute active session reaches prestige eligibility', () => {
    const s = newGame(7777, 0);
    for (let tick = 0; tick < 90 * 60 * 4; tick++) {
      step(s, 250, botInputs(s, tick), OPTS);
    }
    const d = computeDerived(s, OPTS);
    expect(d.prestigeBp).toBeGreaterThanOrEqual(1);
    expect(s.run.planetsCompleted).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('no stall over 12 minutes in the first 45 minutes of greedy play', () => {
    const s = newGame(31415, 0);
    let maxStall = 0;
    for (let tick = 0; tick < 45 * 60 * 4; tick++) {
      step(s, 250, botInputs(s, tick), OPTS);
      maxStall = Math.max(maxStall, s.timers.stallMs);
    }
    expect(maxStall).toBeLessThan(12 * 60_000);
  }, 60_000);
});
