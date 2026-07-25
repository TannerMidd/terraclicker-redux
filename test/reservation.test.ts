import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { checkReservation, hasBooked, reservationStatus } from '../src/engine/reservation';
import { RESERVATION, RESERVATION_FLAG } from '../src/content/reservation';
import { DEEP_FIELD } from '../src/content/deepField';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };

/** A career that has, in fact, done everything. */
function complete(): GameState {
  const s = newGame(42, 0);
  s.lifetime.prestiges = 5;
  s.lifetime.bestGalaxies = 15;
  s.lifetime.statutes = ['gravity-mandatory'];
  s.lifetime.megaprojectsBuilt = 3;
  s.lifetime.situationsAnswered = 25;
  for (const d of DEEP_FIELD.slice(0, 8)) s.expedition.boarded[d.id] = 1;
  return s;
}

describe('the Reservation', () => {
  it('is not booked at the beginning of anything', () => {
    const s = newGame(1, 0);
    const status = reservationStatus(s);
    expect(status.booked).toBe(false);
    expect(status.progress).toBe(0);
    expect(hasBooked(s)).toBe(false);
  });

  it('asks only for things a player who played the whole game has done', () => {
    const status = reservationStatus(complete());
    expect(status.booked).toBe(true);
    expect(status.progress).toBe(1);
    for (const c of status.clauses) expect(c.met).toBe(true);
  });

  it('requires both halves of the game — the desk and the helm', () => {
    // Everything except ever having gone out there personally.
    const deskOnly = complete();
    deskOnly.expedition.boarded = {};
    expect(reservationStatus(deskOnly).booked).toBe(false);

    // And everything except the commissions.
    const helmOnly = complete();
    helmOnly.lifetime.prestiges = 0;
    expect(reservationStatus(helmOnly).booked).toBe(false);
  });

  it('resolves itself — there is nothing to claim and nothing to miss', () => {
    const s = complete();
    expect(checkReservation(s, [])).toBe(true);
    expect(hasBooked(s)).toBe(true);
    // Stored as gameTimeMs, which on a fresh state is 0 — hence the
    // `!== undefined` guard rather than a truthiness check.
    expect(s.flags[RESERVATION_FLAG]).toBe(0);
  });

  it('books exactly once, and not again for the rest of the universe', () => {
    const s = complete();
    expect(checkReservation(s, [])).toBe(true);
    expect(checkReservation(s, [])).toBe(false);
    expect(checkReservation(s, [])).toBe(false);
  });

  it('fires through the ordinary tick, without being asked', () => {
    const s = complete();
    let seen = false;
    for (let i = 0; i < 8 && !seen; i++) {
      const r = step(s, 250, [], OPTS);
      seen = r.effects.some((e) => e.t === 'reservationBooked');
    }
    expect(seen).toBe(true);
    expect(hasBooked(s)).toBe(true);
  });

  it('pays no multiplier — the reward for finishing is the ending', () => {
    const s = complete();
    const tuBefore = s.tu.toString();
    const salvageBefore = s.expedition.salvage;
    checkReservation(s, []);
    expect(s.tu.toString()).toBe(tuBefore);
    expect(s.expedition.salvage).toBe(salvageBefore);
  });

  it('reports honest partial progress on the way', () => {
    const s = newGame(9, 0);
    s.lifetime.prestiges = 2; // 2 of 5
    const clause = reservationStatus(s).clauses.find((c) => c.clause.id === 'commissions')!;
    expect(clause.met).toBe(false);
    expect(clause.progress).toBeCloseTo(0.4, 5);
    expect(RESERVATION.length).toBeGreaterThan(3);
  });
});
