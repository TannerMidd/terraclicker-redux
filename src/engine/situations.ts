/**
 * Situations — the engine side. See content/situations.ts for what they are
 * and why they replaced the old buff-only events.
 *
 * Three rules this file exists to keep:
 *
 * 1. **Deterministic.** Which situation arrives, which world it names, and
 *    when the next one is due all come from the `situations` stream. Same
 *    seed, same sequence, offline or on.
 * 2. **Only while somebody is watching.** Situations spawn — and count down —
 *    only when the game is being played, the same rule bubbles, events and
 *    Vogons follow. A situation asks the player a question, so running the
 *    clock down on it while the tab is closed would answer it for them, which
 *    is precisely what "ignoring it has a consequence" must not mean.
 * 3. **Standing is recoverable.** A neglected world dims; it is never lost.
 *    Every drop here can be undone by a later choice, and the value is
 *    clamped to a floor so no amount of neglect can zero a world out.
 */
import Decimal from 'break_infinity.js';
import type { Derived, GameState, SimEffect } from './types';
import { randRange, pickWeighted } from './rng';
import {
  SITUATIONS,
  SITUATION_BY_ID,
  fillSituationText,
  type SituationDef,
  type SituationOutcome,
} from '../content/situations';
import { EVENT_BY_ID } from '../content/events';
import { C } from '../content/constants';

/** One situation, open and waiting for an answer. */
export interface SituationInstance {
  uid: number;
  /** SituationDef id. */
  id: string;
  remainingMs: number;
  /** lifetimeIndex of the world it names, or 0 when untargeted. */
  world: number;
  /** Captured at spawn so the prose reads the same after a prestige. */
  worldName: string;
}

/**
 * How far a world's standing can fall. A world at the floor is dark and
 * disappointed, not gone — there is always a way back.
 */
export const STANDING_FLOOR = 0.35;
export const STANDING_CEIL = 1;

export function standingOf(state: GameState, lifetimeIndex: number): number {
  const v = state.run.standing[String(lifetimeIndex)];
  return typeof v === 'number' ? v : STANDING_CEIL;
}

/**
 * The empire-wide effect of neglect: the mean standing of everything you have
 * delivered. Every world starts at 1, so this is exactly 1 until something is
 * actually neglected, and the production chain is unchanged for a player who
 * never sees a situation.
 */
export function standingFactor(state: GameState): number {
  const worlds = state.run.completedPlanets;
  if (worlds.length === 0) return 1;
  let sum = 0;
  for (const w of worlds) sum += standingOf(state, w.lifetimeIndex);
  return sum / worlds.length;
}

function setStanding(state: GameState, lifetimeIndex: number, value: number): void {
  const clamped = Math.max(STANDING_FLOOR, Math.min(STANDING_CEIL, value));
  const key = String(lifetimeIndex);
  // Full standing is the default — don't persist rows that say "fine".
  if (clamped >= STANDING_CEIL) delete state.run.standing[key];
  else state.run.standing[key] = clamped;
}

/** Cost of an option in TU, as seconds of current production (never zero). */
export function situationTuCost(derived: Derived, seconds: number): Decimal {
  return derived.tuPerSec.mul(seconds).max(new Decimal(10));
}

export function situationScienceCost(derived: Derived, seconds: number): Decimal {
  return derived.sciencePerSec.mul(seconds).max(new Decimal(1));
}

/**
 * How long until the next one. Everything that used to make EVENTS more
 * frequent — the research line, the catalogue perks, a Heart of Gold on the
 * books, a quirky planet — now makes situations more frequent instead, which
 * is the same promise ("things happen to you more often") pointed at the
 * layer that is worth having things happen in.
 */
function rollGap(state: GameState, derived: Derived): number {
  const gap = randRange(state.rng, 'situations', C.SITUATION_MIN_GAP_MS, C.SITUATION_MAX_GAP_MS);
  return gap / Math.max(0.1, derived.eventFreqMult);
}

/** Which situations can happen right now. */
function eligible(state: GameState): SituationDef[] {
  const hasWorlds = state.run.completedPlanets.length > 0;
  return SITUATIONS.filter((s) => (s.targeted ? hasWorlds : true)) as SituationDef[];
}

export function spawnSituation(
  state: GameState,
  derived: Derived,
  effects: SimEffect[],
): void {
  state.timers.nextSituationMs = rollGap(state, derived);
  // One at a time. A queue of demands is a chore list, not a decision.
  if (state.situations.length > 0) return;

  const pool = eligible(state);
  if (pool.length === 0) return;
  const def = pickWeighted(state.rng, 'situations', pool);

  let world = 0;
  let worldName = '';
  if (def.targeted) {
    const worlds = state.run.completedPlanets;
    // Weight toward worlds already in trouble — a neglected world is exactly
    // the one that keeps writing to you.
    const weighted = worlds.map((w) => ({
      w,
      weight: 1 + (STANDING_CEIL - standingOf(state, w.lifetimeIndex)) * 3,
    }));
    const chosen = pickWeighted(state.rng, 'situations', weighted).w;
    world = chosen.lifetimeIndex;
    worldName = chosen.name;
  }

  const uid = ++state.timers.nextIdCounter;
  state.situations.push({ uid, id: def.id, remainingMs: def.windowMs, world, worldName });
  effects.push({ t: 'situationOpened', uid, id: def.id, world: worldName });
}

function applyOutcome(
  state: GameState,
  derived: Derived,
  effects: SimEffect[],
  outcome: SituationOutcome,
  inst: SituationInstance,
): void {
  if (outcome.gainSeconds) {
    const gain = derived.tuPerSec.mul(outcome.gainSeconds).max(new Decimal(15));
    state.tu = state.tu.add(gain);
    state.run.tuEarned = state.run.tuEarned.add(gain);
    state.lifetime.tuEarned = state.lifetime.tuEarned.add(gain);
  }
  if (outcome.scienceSeconds) {
    state.science = state.science.add(
      derived.sciencePerSec.mul(outcome.scienceSeconds).max(new Decimal(2)),
    );
  }
  if (outcome.buff) {
    const def = EVENT_BY_ID[outcome.buff];
    // A buff is now something you were given for choosing well, rather than
    // something that happened at you.
    if (def) {
      state.activeEvents.push({ id: def.id, remainingMs: def.durationMs });
      effects.push({ t: 'eventStart', id: def.id });
    }
  }
  if (outcome.standing && inst.world > 0) {
    setStanding(state, inst.world, standingOf(state, inst.world) + outcome.standing);
  }
  effects.push({
    t: 'situationResolved',
    uid: inst.uid,
    id: inst.id,
    text: fillSituationText(outcome.text, inst.worldName),
    world: inst.worldName,
    standing: outcome.standing ?? 0,
  });
}

/**
 * Answer an open situation. Refuses silently if the option is unknown or
 * unaffordable — the UI disables those, and the engine does not trust it.
 */
export function answerSituation(
  state: GameState,
  derived: Derived,
  effects: SimEffect[],
  uid: number,
  optionId: string,
): void {
  const idx = state.situations.findIndex((s) => s.uid === uid);
  if (idx < 0) return;
  const inst = state.situations[idx]!;
  const def = SITUATION_BY_ID[inst.id];
  if (!def) {
    state.situations.splice(idx, 1);
    return;
  }
  const option = def.options.find((o) => o.id === optionId);
  if (!option) return;

  const tuCost = option.costSeconds ? situationTuCost(derived, option.costSeconds) : null;
  const sciCost = option.costScienceSeconds
    ? situationScienceCost(derived, option.costScienceSeconds)
    : null;
  if (tuCost && state.tu.lt(tuCost)) return;
  if (sciCost && state.science.lt(sciCost)) return;
  if (tuCost) state.tu = state.tu.sub(tuCost);
  if (sciCost) state.science = state.science.sub(sciCost);

  state.situations.splice(idx, 1);
  state.lifetime.situationsAnswered += 1;
  applyOutcome(state, derived, effects, option.outcome, inst);
}

/**
 * Tick the open situations. Only ever called with the game in the foreground
 * (see rule 2 at the top) — an unattended clock must not answer for anybody.
 */
export function stepSituations(
  state: GameState,
  derived: Derived,
  effects: SimEffect[],
  tickMs: number,
): boolean {
  if (state.situations.length === 0) return false;
  let dirty = false;
  for (let i = state.situations.length - 1; i >= 0; i--) {
    const inst = state.situations[i]!;
    inst.remainingMs -= tickMs;
    if (inst.remainingMs > 0) continue;
    const def = SITUATION_BY_ID[inst.id];
    state.situations.splice(i, 1);
    if (def) {
      state.lifetime.situationsIgnored += 1;
      applyOutcome(state, derived, effects, def.ignored, inst);
    }
    dirty = true;
  }
  return dirty;
}

/** Random-ish seed helper for the visuals — kept out of the sim streams. */
export function createSituationTimers(state: GameState): number {
  return randRange(state.rng, 'situations', C.SITUATION_FIRST_MIN_MS, C.SITUATION_FIRST_MAX_MS);
}

/** Used by the UI to show what an option would cost before committing. */
export function situationCosts(
  derived: Derived,
  option: { costSeconds?: number; costScienceSeconds?: number },
): { tu: Decimal | null; science: Decimal | null } {
  return {
    tu: option.costSeconds ? situationTuCost(derived, option.costSeconds) : null,
    science: option.costScienceSeconds
      ? situationScienceCost(derived, option.costScienceSeconds)
      : null,
  };
}

/** Kept for parity with the other subsystems' factory style. */
export function createSituationsState(): SituationInstance[] {
  return [];
}
