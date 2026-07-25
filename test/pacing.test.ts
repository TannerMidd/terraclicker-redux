import { describe, expect, it } from 'vitest';
import { newGame, step, computeDerived } from '../src/engine/sim';
import { C } from '../src/content/constants';
import { BUILDING_BY_ID } from '../src/content/buildings';
import { BOTS, OPTS, TICK, buyer, bottleneck } from '../balance/bots';
import type { GameState, Input } from '../src/engine/types';

/**
 * The bot lives in balance/bots.ts so that the bands asserted here and the
 * numbers printed by `npm run balance` come from the same player.
 */
function botInputs(state: GameState, tick: number): Input[] {
  const inputs: Input[] = [{ type: 'click' }]; // 4 clicks/sec at 250ms ticks
  if (tick % 20 === 0) inputs.push(...buyer(state, bottleneck(state)));
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
    expect(d.prestigeEligible).toBe(true);
    expect(s.run.systems).toBeGreaterThanOrEqual(C.PRESTIGE_MIN_SYSTEMS);
  }, 60_000);

  it('earliest-prestige spam cannot sell before completing the assigned portfolio', () => {
    const s = newGame(20260723, 0);
    let soldAtPlanets: number | null = null;
    let soldAtMs: number | null = null;

    for (let tick = 0; tick < 90 * 60 * 4; tick++) {
      const inputs = botInputs(s, tick);
      inputs.push({ type: 'prestige' });
      const r = step(s, 250, inputs, OPTS);
      if (r.effects.some((e) => e.t === 'prestiged')) {
        soldAtPlanets = s.lifetime.planetsCompleted;
        soldAtMs = s.gameTimeMs;
        break;
      }
    }

    expect(soldAtPlanets).toBe(C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS);
    expect(soldAtMs).not.toBeNull();
    expect(soldAtMs!).toBeGreaterThanOrEqual(15 * 60_000);
    expect(soldAtMs!).toBeLessThanOrEqual(90 * 60_000);
    expect(s.lifetime.systems).toBeGreaterThanOrEqual(C.PRESTIGE_MIN_SYSTEMS);
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

/**
 * PROGRESSION.md §4 used to open with "the harness plays it and asserts each
 * beat's window". It did not. There were four assertions in this file, none of
 * them about the opening, and the authored sheet had drifted so far from the
 * shipped game that it described a different one: planet 1 at 3:30 where the
 * harness does 0:50, and "2 planets done" at ten minutes where the harness
 * does fourteen. It also scheduled a random buff event at 8:30, for a system
 * that had been removed.
 *
 * These are the assertions the document was claiming. The windows are wide on
 * purpose — they exist to catch the opening silently doubling or halving, not
 * to freeze a seed.
 */
describe('the authored opening (PROGRESSION.md §4)', () => {
  it('hits each authored beat inside its window', () => {
    const s = newGame(20260723, 0);
    const seen: Record<string, number> = {};
    const mark = (k: string) => {
      if (seen[k] === undefined) seen[k] = s.gameTimeMs;
    };

    for (let tick = 0; tick < (12 * 60_000) / TICK; tick++) {
      const r = step(s, TICK, botInputs(s, tick), OPTS);
      if ((s.buildings['seedProbe'] ?? 0) >= 1) mark('probe1');
      if ((s.buildings['seedProbe'] ?? 0) >= 2) mark('probe2');
      if (Object.keys(s.upgrades).length >= 1) mark('upgrade1');
      if (s.bubbles.length > 0) mark('bubble1');
      for (const e of r.effects) {
        if (e.t === 'planetComplete' && e.lifetimeIndex === 1) mark('planet1');
        if (e.t === 'systemFormed') mark('system1');
        if (e.t === 'situationOpened') mark('situation1');
      }
    }

    // The opening is meant to feel hot: something bought inside twenty seconds.
    expect(seen['probe1']).toBeLessThanOrEqual(20_000);
    expect(seen['probe2']).toBeLessThanOrEqual(45_000);
    // Planet 1 is the tutorial. §3's measured band is 50s; four minutes is the
    // ceiling the original assertion used and it stays the ceiling.
    expect(seen['planet1']).toBeGreaterThanOrEqual(20_000);
    expect(seen['planet1']).toBeLessThanOrEqual(4 * 60_000);
    expect(seen['upgrade1']).toBeLessThanOrEqual(2 * 60_000);
    // The first bubble is seeded rather than rolled, so this window is tight.
    expect(seen['bubble1']).toBeGreaterThanOrEqual(C.FIRST_BUBBLE_MS - 5_000);
    expect(seen['bubble1']).toBeLessThanOrEqual(C.FIRST_BUBBLE_MS + 30_000);
    expect(seen['system1']).toBeLessThanOrEqual(5 * 60_000);
    // The first situation teaches the mechanic and is deliberately early.
    expect(seen['situation1']).toBeGreaterThanOrEqual(C.SITUATION_FIRST_MIN_MS - 1_000);
    expect(seen['situation1']).toBeLessThanOrEqual(C.SITUATION_FIRST_MAX_MS + 60_000);
  }, 60_000);

  it('leaves a ten-minute first session well past the tutorial', () => {
    const s = newGame(20260723, 0);
    for (let tick = 0; tick < (10 * 60_000) / TICK; tick++) {
      step(s, TICK, botInputs(s, tick), OPTS);
    }
    // The authored sheet said two. Reality is fourteen, and the band exists to
    // catch the opening changing shape, not to pin the exact number.
    expect(s.lifetime.planetsCompleted).toBeGreaterThanOrEqual(8);
    expect(s.lifetime.planetsCompleted).toBeLessThanOrEqual(25);
    expect(s.run.systems).toBeGreaterThanOrEqual(1);
    // §4 claimed the Research tab opens at 6:00. It opens at 13:53 — the gate
    // is 950K lifetime TU and ten minutes of greedy play earns 317K. Asserted
    // as the fact it is, so the doc and the game cannot drift apart again.
    expect(s.lifetime.tuEarned.lt(BUILDING_BY_ID['researchLab']!.unlockAtTu)).toBe(true);
  }, 60_000);

  it('gets run 2 back to the prior peak substantially faster (DESIGN.md M3)', () => {
    const bot = BOTS['catalogue-spender']!;
    const s = newGame(20260723, 0);
    let peak = 0;
    let run1Ms = 0;

    for (let tick = 0; tick < (240 * 60_000) / TICK; tick++) {
      step(s, TICK, bot(s, tick), OPTS);
      if (tick % 40 === 0) {
        const rate = computeDerived(s, OPTS).tuPerSec.toNumber();
        if (rate > peak) peak = rate;
      }
      if (s.lifetime.prestiges >= 1) {
        run1Ms = s.gameTimeMs;
        break;
      }
    }
    expect(run1Ms).toBeGreaterThan(0);

    const start = s.gameTimeMs;
    let regainedMs = -1;
    for (let tick = 0; tick < (240 * 60_000) / TICK; tick++) {
      step(s, TICK, bot(s, tick), OPTS);
      if (tick % 40 === 0 && computeDerived(s, OPTS).tuPerSec.toNumber() >= peak) {
        regainedMs = s.gameTimeMs - start;
        break;
      }
    }

    expect(regainedMs).toBeGreaterThan(0);
    // DESIGN.md M3 asks for >=45%. The measured figure is 33.9%, with twelve
    // Blueprints spent on the three perks that help an active run. This is not
    // a regression from making the BP bonus additive — at twelve BP the old
    // compounding curve gave 1.268x against the new 1.24x, a difference far too
    // small to account for eleven points. The criterion has simply never been
    // met, and was never checked, because no bot had ever spent a Blueprint.
    //
    // 30% is a regression floor, not an endorsement. Closing the gap to 45%
    // means raising BP_PASSIVE, which is safe now that the bonus is additive
    // and cannot run away — but it is a balance decision, not a repair, so it
    // is recorded in docs/ROADMAP.md as an open one rather than taken here.
    const faster = 1 - regainedMs / run1Ms;
    expect(faster).toBeGreaterThan(0.30);
  }, 180_000);
});
