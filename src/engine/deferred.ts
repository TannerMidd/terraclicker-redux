/**
 * Deferred work — the things that keep happening when nobody is watching.
 *
 * Everything else in this engine is production: it is throttled by
 * `offlineEfficiency`, capped by `offlineCapMs`, and suppressed entirely while
 * the tab is closed, because an unwatched reward is just a number going up.
 * Deferred work is the deliberate opposite. A megaproject's entire purpose is
 * to be the thing that happened while you were gone; a rig was left behind
 * precisely so it would fill without you. Both were documented as working that
 * way and neither did — `stepOffline` capped the simulated span at eight hours
 * and these rode along inside it, so an eighteen-hour monument could not be
 * finished by an eighteen-hour absence.
 *
 * ## The contract
 *
 * A creditor registered here:
 *
 * 1. Is credited in **real elapsed milliseconds**, not simulated ones. It
 *    ignores the offline cap and it ignores offline efficiency. A construction
 *    crew does not work at 50% because nobody is looking at them.
 * 2. Must be a **pure function of elapsed time** — linear, with clamping
 *    allowed. Crediting 8h once and 1h eight times must land in the same
 *    place, or engine law #1 is broken and offline parity fails.
 * 3. Must not read production, rng, or player presence. If the amount of work
 *    done depends on how rich you are, it is income, and income belongs in the
 *    ordinary simulation where the cap can reach it.
 *
 * Rule 3 is why megaproject *salvage* is not here. The structure completes on
 * wall-clock time because it is a construction contract; the salvage it yields
 * afterwards is unbounded income and stays subject to the same cap as TU.
 * Rigs are the interesting case and they qualify: a rig's yield is bounded by
 * its effective capacity, so it fills, saturates, and waits. That is a structure reaching a
 * state, not an income stream running unattended.
 */
import { stepRigs } from './freight';
import { stepMegaprojects } from './megaprojects';
import type { GameState, SimEffect } from './types';

/**
 * Credit every deferred creditor with `wallMs` of real time.
 *
 * Called twice per absence, and the split is the whole trick: the ordinary
 * tick loop credits the part of the span the simulation actually ran, and
 * `stepOffline` credits the remainder that the cap withheld. Sum is always the
 * true elapsed time, however the player chunked their absence.
 */
export function creditDeferredWork(
  state: GameState,
  wallMs: number,
  effects: SimEffect[],
): boolean {
  if (wallMs <= 0) return false;
  let changed = false;
  if (stepRigs(state, wallMs)) changed = true;
  if (stepMegaprojects(state, effects, wallMs)) changed = true;
  return changed;
}
