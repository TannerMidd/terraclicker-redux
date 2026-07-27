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
import { PETITION_BY_ID, petitionsFor } from '../content/petitions';
import { C } from '../content/constants';
import { recordWorldEvent } from './worldRecords';
import { charterStandingFloor } from './charters';
import { settlementRoster, settlementSpecOf } from './settlements';

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

/**
 * Raise a world's standing (never lowers; the ceiling clamps). The generous
 * half of setStanding, exported for the paths where showing up is the deed —
 * repairs, civic calls, requests answered on the ground (Phase 5).
 */
export function raiseStanding(state: GameState, lifetimeIndex: number, by: number): void {
  if (by <= 0) return;
  setStanding(state, lifetimeIndex, standingOf(state, lifetimeIndex) + by);
}

function setStanding(state: GameState, lifetimeIndex: number, value: number): void {
  // A system that signed Articles of Mutual Aid, or the Quiet Clause, has
  // agreed it will not think less of you than this whatever else happens.
  const floor = Math.max(STANDING_FLOOR, charterStandingFloor(state, lifetimeIndex) ?? 0);
  const clamped = Math.max(floor, Math.min(STANDING_CEIL, value));
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
function rollGapWith(rng: GameState['rng'], derived: Derived): number {
  const gap = randRange(rng, 'situations', C.SITUATION_MIN_GAP_MS, C.SITUATION_MAX_GAP_MS);
  return gap / Math.max(0.1, derived.situationFreqMult);
}

function rollGap(state: GameState, derived: Derived): number {
  return rollGapWith(state.rng, derived);
}

/** Which situations can happen right now. */
function eligible(state: GameState): SituationDef[] {
  const hasWorlds = state.run.completedPlanets.length > 0;
  return SITUATIONS.filter((s) => (s.targeted ? hasWorlds : true)) as SituationDef[];
}

/**
 * Peek at what is coming without advancing the persisted stream — the rng is
 * copied, not consumed. This is what the Sub-Etha Sens-O-Matic buys: not
 * influence over what arrives, only the discourtesy of knowing first.
 *
 * The copy has to roll the gap before it chooses, because `spawnSituation`
 * does; peeking straight at the cursor reads one draw behind the universe and
 * confidently names the wrong thing. Petitions draw from this stream too, so a
 * forecast is only good until the next one of those — which is the correct
 * amount of certainty for a machine that admits to being provisional.
 */
export function forecastSituation(state: GameState, derived: Derived): SituationDef | null {
  const pool = eligible(state);
  if (pool.length === 0) return null;
  const rng = { ...state.rng };
  rollGapWith(rng, derived);
  return pickWeighted(rng, 'situations', pool);
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
    // A situation whose answer is on the ground can only name ground that
    // exists — a gas giant's weather is a statement nobody can stand under.
    const worlds = def.ground
      ? state.run.completedPlanets.filter((w) => w.type !== 'gasgiant')
      : state.run.completedPlanets;
    if (worlds.length === 0) return;
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
    // Looking after a world is noticed by the people who commissioned it.
    // Only generosity earns trust; neglect costs standing with the world and
    // is its own punishment.
    if (outcome.standing > 0) state.operations.reputation.magrathea += 1;
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
  // A uid may belong to the urgent queue or the petition queue; they resolve
  // identically, which is the whole reason petitions reuse this shape.
  const petition = state.situations.findIndex((s) => s.uid === uid) < 0;
  const list = petition ? state.run.petitions : state.situations;
  const idx = list.findIndex((s) => s.uid === uid);
  if (idx < 0) return;
  const inst = list[idx]!;
  const def = SITUATION_BY_ID[inst.id] ?? PETITION_BY_ID[inst.id];
  if (!def) {
    list.splice(idx, 1);
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

  list.splice(idx, 1);
  state.lifetime.situationsAnswered += 1;
  // The world remembers being answered. This is what turns a completed gauge
  // into a place with a history — see engine/worldRecords.ts.
  if (inst.world) {
    recordWorldEvent(state, inst.world, {
      kind: 'petitionAnswered',
      id: inst.id,
      atGameMs: state.gameTimeMs,
    });
  }
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
      // Leaving one alone is a legitimate answer and never a free one. The
      // world files that too, and its lights dim accordingly.
      if (inst.world) {
        recordWorldEvent(state, inst.world, {
          kind: 'petitionIgnored',
          id: inst.id,
          atGameMs: state.gameTimeMs,
        });
      }
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

// ————————————————— Petitions —————————————————

/**
 * A petition is a situation a WORLD wrote, and it runs on everything above:
 * the same def shape, the same options, the same resolution and the same
 * standing. Three things differ, and all three are about tone rather than
 * mechanism — it is queued instead of interrupting, it is keyed to what that
 * world actually is, and letting one lapse only lets it slip.
 *
 * They live in `run.petitions` rather than `state.situations`, which is what
 * keeps "one question at a time" true for the urgent kind while still letting
 * three worlds be waiting on you.
 */
export function findOpen(state: GameState, uid: number): SituationInstance | null {
  return (
    state.situations.find((s) => s.uid === uid) ??
    state.run.petitions.find((p) => p.uid === uid) ??
    null
  );
}

export function spawnPetition(state: GameState, effects: SimEffect[]): void {
  state.timers.nextPetitionMs = randRange(
    state.rng,
    'situations',
    C.PETITION_MIN_GAP_MS,
    C.PETITION_MAX_GAP_MS,
  );
  if (state.run.petitions.length >= C.PETITION_QUEUE_MAX) return;
  const worlds = state.run.completedPlanets;
  if (worlds.length === 0) return;

  // A world already out of sorts is the one most likely to write again.
  const weighted = worlds.map((w) => ({
    w,
    weight: 1 + (STANDING_CEIL - standingOf(state, w.lifetimeIndex)) * 3,
  }));
  const world = pickWeighted(state.rng, 'situations', weighted).w;
  const pool = petitionsFor({
    type: world.type,
    bottleneck: world.bottleneck,
    quirks: world.quirks,
    hasInstallations: world.installations.length > 0,
    hasSettlements:
      world.type !== 'gasgiant'
      && settlementRoster(
        settlementSpecOf({
          seed: world.seed,
          type: world.type,
          size: world.size,
          lifetimeIndex: world.lifetimeIndex,
          installations: world.installations,
          quirks: world.quirks,
        }),
      ).length > 0,
    certs: state.expedition.certs,
  }).filter(
    // Never ask the same world the same thing twice while it is still waiting.
    (p) => !state.run.petitions.some((q) => q.id === p.id && q.world === world.lifetimeIndex),
  );
  if (pool.length === 0) return;

  const def = pickWeighted(state.rng, 'situations', pool);
  const uid = ++state.timers.nextIdCounter;
  state.run.petitions.push({
    uid,
    id: def.id,
    remainingMs: def.windowMs,
    world: world.lifetimeIndex,
    worldName: world.name,
  });
  effects.push({ t: 'situationOpened', uid, id: def.id, world: world.name, petition: true });
}

export function stepPetitions(
  state: GameState,
  derived: Derived,
  effects: SimEffect[],
  tickMs: number,
): boolean {
  if (state.run.petitions.length === 0) return false;
  let dirty = false;
  for (let i = state.run.petitions.length - 1; i >= 0; i--) {
    const inst = state.run.petitions[i]!;
    inst.remainingMs -= tickMs;
    if (inst.remainingMs > 0) continue;
    const def = PETITION_BY_ID[inst.id];
    state.run.petitions.splice(i, 1);
    if (def) {
      state.lifetime.situationsIgnored += 1;
      // Leaving one alone is a legitimate answer and never a free one. The
      // world files that too, and its lights dim accordingly.
      if (inst.world) {
        recordWorldEvent(state, inst.world, {
          kind: 'petitionIgnored',
          id: inst.id,
          atGameMs: state.gameTimeMs,
        });
      }
      applyOutcome(state, derived, effects, def.ignored, inst);
    }
    dirty = true;
  }
  return dirty;
}
