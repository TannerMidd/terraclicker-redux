/**
 * The Office of Subsequent Consequences — what a world is still doing after
 * you finished it.
 *
 * A completed world currently stops being anything. `CompletedPlanetRecord`
 * preserves what it *was* at delivery — type, size, quirks, survey,
 * bottleneck, the hardware left behind — and nothing ever adds to it again.
 * The world is a gauge that reached 100% and a name in a list.
 *
 * This is the store that lets a world keep having a life. Six things read it,
 * and it is built once for all six rather than six times: world biographies,
 * System Charters, petitions that resolve two ways, the passengers and freight
 * a world generates, universe statutes that filter on what worlds have become,
 * and the Morning Circular that reports what changed while you were away.
 *
 * ## Why it sits outside `run`
 *
 * `run.completedPlanets` is sold at prestige, and that is correct: Magrathea
 * buys the portfolio, and a commission that left nothing behind would make the
 * sale meaningless. But "worlds become places you remember" cannot survive a
 * store that is emptied every few hours.
 *
 * So records are keyed by `lifetimeIndex` — unique across every commission,
 * never reset — and live at the top level. The *portfolio* still sells. What
 * survives is the archive: the Guide remembers the world, its history stays
 * readable, and if the world is a Heritage World it stays active as well.
 * Selling a commission means losing the worlds, not un-remembering them.
 *
 * ## Determinism
 *
 * Everything here is a pure function of state plus explicit arguments. Traits
 * are derived from the world's own delivery facts and its recorded history, so
 * the same universe always produces the same biography (engine law #1). No rng
 * stream is consumed: a trait is a consequence, not a roll.
 */
import { compose } from '../content/composer';
import { WORLD_BIOGRAPHY, worldContextTags } from '../content/biography';
import type {
  AspectId,
  CompletedPlanetRecord,
  GameState,
  WorldRecord,
  WorldRecordEvent,
} from './types';

/** How many events a single world keeps. Old entries fall off the bottom. */
export const WORLD_HISTORY_LIMIT = 12;

/**
 * The civic traits a world can carry. Derived, never stored as truth — storing
 * them would mean a migration every time the derivation improves.
 *
 * Kept deliberately small for now: this is the substrate landing, and the
 * authored trait set belongs to the phase that builds biographies on top.
 */
export const WORLD_TRAITS = [
  'well-attended', // answered petitions, good standing
  'neglected', // ignored requests, lights going out
  'engineered', // heavy installation loadout at delivery
  'austere', // delivered lean
  'peculiar', // quirks, or a survey that went sideways
  'storied', // simply has a lot of history
] as const;

export type WorldTrait = (typeof WORLD_TRAITS)[number];

export function createWorldRecord(
  completed: CompletedPlanetRecord,
  commissionNumber: number,
  atGameMs: number,
): WorldRecord {
  return {
    lifetimeIndex: completed.lifetimeIndex,
    name: completed.name,
    type: completed.type,
    bottleneck: completed.bottleneck,
    commissionNumber,
    deliveredAtGameMs: atGameMs,
    installationCount: completed.installations.length,
    quirkCount: completed.quirks.length,
    survey: completed.survey,
    history: [],
  };
}

export function worldRecord(state: GameState, lifetimeIndex: number): WorldRecord | null {
  return state.worldRecords[String(lifetimeIndex)] ?? null;
}

/** File something that happened to a world. Newest last; oldest evicted. */
export function recordWorldEvent(
  state: GameState,
  lifetimeIndex: number,
  event: WorldRecordEvent,
): void {
  const record = state.worldRecords[String(lifetimeIndex)];
  if (!record) return;
  record.history.push(event);
  if (record.history.length > WORLD_HISTORY_LIMIT) {
    record.history.splice(0, record.history.length - WORLD_HISTORY_LIMIT);
  }
}

/** Is this world still part of the current commission, or preserved? */
export function worldIsActive(state: GameState, lifetimeIndex: number): boolean {
  return (
    state.run.completedPlanets.some((w) => w.lifetimeIndex === lifetimeIndex)
    || state.operations.heritageWorlds.some((w) => w.lifetimeIndex === lifetimeIndex)
  );
}

/**
 * The two or three traits a world currently carries.
 *
 * Ordered by how loudly they speak, capped at three, and derived fresh every
 * time. A world with nothing to say gets one trait rather than none — every
 * place is at least somewhere.
 */
export function worldTraits(record: WorldRecord, standing: number): WorldTrait[] {
  const traits: WorldTrait[] = [];
  const answered = record.history.filter((e) => e.kind === 'petitionAnswered').length;
  const ignored = record.history.filter((e) => e.kind === 'petitionIgnored').length;

  if (ignored > answered && ignored > 0) traits.push('neglected');
  else if (answered > 0 && standing >= 1) traits.push('well-attended');

  if (record.installationCount >= 6) traits.push('engineered');
  else if (record.installationCount <= 2) traits.push('austere');

  if (record.quirkCount >= 2 || record.survey !== null) traits.push('peculiar');
  if (record.history.length >= WORLD_HISTORY_LIMIT - 2) traits.push('storied');

  if (traits.length === 0) traits.push(record.installationCount >= 4 ? 'engineered' : 'austere');
  return traits.slice(0, 3);
}

/** Every record, newest first — the shape the Guide atlas and Circular want. */
export function allWorldRecords(state: GameState): WorldRecord[] {
  return Object.values(state.worldRecords).sort((a, b) => b.lifetimeIndex - a.lifetimeIndex);
}

/** Worlds this commission still holds, for systems that only act on the live set. */
export function activeWorldRecords(state: GameState): WorldRecord[] {
  return allWorldRecords(state).filter((r) => worldIsActive(state, r.lifetimeIndex));
}

export function bottleneckOf(record: WorldRecord): AspectId {
  return record.bottleneck;
}

/**
 * One sentence about what a world is like now, assembled from authored parts.
 *
 * Seeded from the world's own lifetimeIndex and the length of its history, so
 * the line is stable for a given world in a given state and changes when
 * something actually happens to it — the description of a place should move
 * when the place does, and not otherwise.
 */
export function worldBiography(record: WorldRecord, standing: number): string {
  const traits = worldTraits(record, standing);
  return compose(
    WORLD_BIOGRAPHY,
    record.lifetimeIndex * 2654435761 + record.history.length,
    worldContextTags(record.type, record.bottleneck, traits),
  ).text;
}
