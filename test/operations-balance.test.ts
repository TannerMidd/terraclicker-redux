import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { computeDerived, prestigeBpFor } from '../src/engine/economy';
import { BOTS, OPTS, TICK } from '../balance/bots';
import type { GameState } from '../src/engine/types';

/**
 * Operations is meant to be an engagement layer, not a replacement economy.
 * DESIGN.md §3.10 states the two constraints this file exists to keep honest:
 * contracts pay "modest BP and faction reputation", and dispatch bonuses are
 * "intentionally smaller than the system ladder so dispatch changes strategy
 * without replacing it".
 *
 * Both were violated at once. An operations bot reached 659M TU/s against a
 * comparable bot's 5.34M — 123x — and minted more Blueprints from the contract
 * board than the portfolio sale the whole prestige layer is built on.
 */

function play(botName: keyof typeof BOTS, minutes: number): GameState {
  const bot = BOTS[botName];
  if (!bot) throw new Error(`no bot named ${botName}`);
  const state = newGame(20260723, 0);
  const totalTicks = (minutes * 60_000) / TICK;
  for (let tick = 0; tick < totalTicks; tick++) {
    step(state, TICK, bot(state, tick), OPTS);
  }
  return state;
}

describe('Operations stays an engagement layer (DESIGN.md §3.10)', () => {
  it('does not out-produce ordinary play by more than a strategy-sized margin', () => {
    const ops = play('operations-manager', 90);
    const ordinary = play('aspect-optimizer', 90);

    const opsRate = computeDerived(ops, OPTS).tuPerSec.toNumber();
    const ordinaryRate = computeDerived(ordinary, OPTS).tuPerSec.toNumber();
    const premium = opsRate / ordinaryRate;

    // Lower bound: running the board actively has to be worth doing at all.
    expect(premium).toBeGreaterThan(1.2);
    // Upper bound: it must not replace the game it sits on top of. The number
    // to beat is 123x, which is what this looked like when the BP loop was
    // compounding an early Operations lead for ninety minutes.
    expect(premium).toBeLessThan(8);
  }, 180_000);

  it('mints fewer Blueprints from the board than from the portfolio sale', () => {
    const ops = play('operations-manager', 90);

    const fromContracts = ops.prestige.bpEarned;
    const fromAppraisal = prestigeBpFor(ops);

    expect(fromContracts).toBeGreaterThan(0); // the board still pays something
    expect(fromContracts).toBeLessThan(fromAppraisal);
  }, 180_000);

  it('pays the routine objectives in reputation rather than Blueprints', () => {
    const ops = play('operations-manager', 90);
    const totalReputation = Object.values(ops.operations.reputation)
      .reduce((a, v) => a + v, 0);

    expect(ops.operations.completed.length).toBeGreaterThan(5);
    // Reputation is the primary contract currency: it gates megaprojects and
    // feeds the capped endorsement path back to BP.
    expect(totalReputation).toBeGreaterThan(ops.prestige.bpEarned);
  }, 180_000);
});
