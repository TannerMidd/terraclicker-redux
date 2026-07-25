/**
 * Unscheduled objects — the engine side. See content/unscheduled.ts.
 *
 * Three properties this has to have, and they pull against each other:
 *
 * 1. **Renewable.** A new set every commission, so space never runs out.
 * 2. **Deterministic.** The same universe on the same commission has the same
 *    objects in the same places (engine law #1). They are *generated*, not
 *    *random* — a distinction the whole engine is built on.
 * 3. **Cheap.** No save growth per object. Everything below is derived from
 *    `seed` and `run.number`; the only thing persisted is which ones have been
 *    boarded, and even that is a small set that clears with the commission.
 *
 * Property 3 is why these are not landmarks. A landmark is a permanent fact
 * about a universe; an unscheduled object is a rumour with coordinates that
 * expires when the portfolio is sold.
 */
import { compose } from '../content/composer';
import {
  UNSCHEDULED,
  UNSCHEDULED_PER_COMMISSION,
  UNSCHEDULED_SALVAGE,
} from '../content/unscheduled';
import { mulberry } from './rng';
import type { GameState, SimEffect } from './types';

export interface UnscheduledObject {
  /** Stable within a commission: `uns-<run>-<n>`. */
  id: string;
  /** The composed description. */
  text: string;
  /** Where it is, in the same space as the Deep Field sites. */
  pos: [number, number, number];
  /** Sensor cross-section, so bigger oddities announce themselves sooner. */
  size: number;
}

/**
 * This commission's objects. Pure and cheap enough to call freely — derived
 * from the master seed and the commission number, never stored.
 */
export function unscheduledFor(state: GameState): UnscheduledObject[] {
  const out: UnscheduledObject[] = [];
  for (let i = 0; i < UNSCHEDULED_PER_COMMISSION; i++) {
    const seed = (state.seed ^ (state.run.number * 0x9e37) ^ (i * 0x85eb)) >>> 0;
    const r = mulberry(seed);
    // Scattered through the middle distance: far enough that finding one is a
    // trip, near enough that it is not an expedition.
    const theta = r() * Math.PI * 2;
    const phi = Math.acos(r() * 2 - 1);
    const radius = 60 + r() * 220;
    out.push({
      id: `uns-${state.run.number}-${i}`,
      text: compose(UNSCHEDULED, seed).text,
      pos: [
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius * 0.4,
        Math.sin(phi) * Math.sin(theta) * radius,
      ],
      size: 0.8 + r() * 1.4,
    });
  }
  return out;
}

export function unscheduledById(state: GameState, id: string): UnscheduledObject | null {
  return unscheduledFor(state).find((o) => o.id === id) ?? null;
}

export function isUnscheduledId(id: string): boolean {
  return id.startsWith('uns-');
}

export function hasBoardedUnscheduled(state: GameState, id: string): boolean {
  return state.expedition.unscheduled[id] !== undefined;
}

/**
 * Board one. Pays salvage and a Guide line — never TU, and less than a
 * landmark, because a landmark is a permanent fact and this is a rumour with
 * coordinates.
 */
export function boardUnscheduled(
  state: GameState,
  effects: SimEffect[],
  id: string,
): boolean {
  if (!isUnscheduledId(id)) return false;
  if (hasBoardedUnscheduled(state, id)) return false;
  const object = unscheduledById(state, id);
  if (!object) return false;

  state.expedition.unscheduled[id] = state.gameTimeMs;
  state.expedition.salvage += UNSCHEDULED_SALVAGE;
  effects.push({ t: 'unscheduledBoarded', id, text: object.text });
  return true;
}

/** How many of this commission's oddities have been looked into. */
export function unscheduledFound(state: GameState): number {
  return unscheduledFor(state).filter((o) => hasBoardedUnscheduled(state, o.id)).length;
}
