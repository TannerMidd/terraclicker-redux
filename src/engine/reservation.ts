/**
 * The Reservation — engine side. See content/reservation.ts.
 *
 * Checked rather than granted: every clause is a fact about what has already
 * happened, so there is no "claim" step and nothing to miss. When the last one
 * resolves, the booking is found to have been made all along — which is both
 * the joke and the only ending this game could honestly have.
 *
 * It is the one place that requires BOTH halves of the game. Everywhere else
 * flight is optional and says so; here, at the very end, it is not. That is
 * deliberate, and it is last because that is the only place it is fair.
 */
import { RESERVATION, RESERVATION_FLAG, type ReservationClause } from '../content/reservation';
import type { GameState, SimEffect } from './types';

export interface ReservationStatus {
  clauses: { clause: ReservationClause; met: boolean; progress: number }[];
  /** 0–1 across every clause, for the one readout that shows it. */
  progress: number;
  booked: boolean;
}

export function reservationStatus(state: GameState): ReservationStatus {
  const clauses = RESERVATION.map((clause) => ({
    clause,
    met: clause.met(state),
    progress: clause.progress(state),
  }));
  const progress = clauses.reduce((a, c) => a + c.progress, 0) / Math.max(1, clauses.length);
  return { clauses, progress, booked: clauses.every((c) => c.met) };
}

/**
 * Resolve the booking if every clause has already been satisfied.
 *
 * Called from the tick. Idempotent — the flag is set once, and the ending does
 * not re-fire every frame for the rest of the universe.
 */
export function checkReservation(state: GameState, effects: SimEffect[]): boolean {
  // `!== undefined`, not truthiness: the flag stores gameTimeMs, and a
  // universe that qualifies on its very first tick stores 0 — which is falsy,
  // and would re-fire the ending every frame forever after.
  if (state.flags[RESERVATION_FLAG] !== undefined) return false;
  if (!reservationStatus(state).booked) return false;
  state.flags[RESERVATION_FLAG] = state.gameTimeMs;
  effects.push({ t: 'reservationBooked' });
  return true;
}

export function hasBooked(state: GameState): boolean {
  return state.flags[RESERVATION_FLAG] !== undefined;
}
