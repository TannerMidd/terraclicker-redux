/**
 * The Reservation — Milliways, and the end of the game as an ending.
 *
 * Milliways has been visible from everywhere and reachable from nowhere since
 * the Deep Field opened, which is exactly right for a tease and useless as a
 * finale. It is situated not elsewhere but *elsewhen*, so the joke about how
 * you get there was always sitting in the entry: **reservations are made
 * retrospectively, after you have already dined.**
 *
 * So the ending is not a boss, a wall, or a final purchase. It is a booking
 * that turns out to have already been made, on the strength of everything you
 * did before you knew you were doing it. Each requirement is a thing a player
 * who has played the whole game has already done — the finale asks you to look
 * back rather than to grind forward.
 *
 * It is deliberately reachable only by somebody who has engaged with **both**
 * halves of the game: the desk and the helm. That is the one place in the
 * design where the two are required together rather than offered as a choice,
 * and it is the last thing in the game, which is the only place that is fair.
 *
 * Nothing here pays a multiplier. The reward for finishing is the ending.
 */
import type { GameState } from '../engine/types';

export interface ReservationClause {
  id: string;
  /** As printed on the booking. */
  text: string;
  /** Has this already happened? */
  met: (s: GameState) => boolean;
  /** How far along, 0–1, for the parts that are countable. */
  progress: (s: GameState) => number;
}

const frac = (n: number, of: number): number => Math.max(0, Math.min(1, n / Math.max(1, of)));

export const RESERVATION: readonly ReservationClause[] = [
  {
    id: 'commissions',
    text: 'The party has completed five commissions to Magrathean satisfaction.',
    met: (s) => s.lifetime.prestiges >= 5,
    progress: (s) => frac(s.lifetime.prestiges, 5),
  },
  {
    id: 'cosmic-web',
    text: 'The party has seen the universe from far enough away to stop arguing with it.',
    met: (s) => s.lifetime.bestGalaxies >= 15,
    progress: (s) => frac(s.lifetime.bestGalaxies, 15),
  },
  {
    id: 'legislated',
    text: 'The party has passed at least one law it now has to live under.',
    met: (s) => s.lifetime.statutes.length >= 1,
    progress: (s) => frac(s.lifetime.statutes.length, 1),
  },
  {
    id: 'monuments',
    text: 'The party has left three things standing that outlast the commissions that built them.',
    met: (s) => s.lifetime.megaprojectsBuilt >= 3,
    progress: (s) => frac(s.lifetime.megaprojectsBuilt, 3),
  },
  {
    id: 'charted',
    text: 'The party has been out there, personally, and looked at what it found.',
    met: (s) => Object.keys(s.expedition.boarded).length >= 8,
    progress: (s) => frac(Object.keys(s.expedition.boarded).length, 8),
  },
  {
    id: 'attended',
    text: 'The party has answered when somebody wrote, more often than not.',
    met: (s) => s.lifetime.situationsAnswered >= 25,
    progress: (s) => frac(s.lifetime.situationsAnswered, 25),
  },
];

export const RESERVATION_FLAG = 'milliwaysBooked';

/** What the Guide says once the booking resolves. */
export const RESERVATION_TEXT =
  'Your table is ready. It has always been ready; the difficulty was never the table.\n\n'
  + 'Milliways is situated at the final moment of the universe, which means every '
  + 'commission you filed, every world that wrote to you, every monument you left '
  + 'standing and every law you passed is already visible from here, in one piece, as a '
  + 'single completed thing. The Guide notes that most visitors find this either the '
  + 'greatest consolation available or the Total Perspective Vortex with better lighting, '
  + 'and that the distinction is a matter of what you did with the time.\n\n'
  + 'The bill has been settled. You settled it by depositing a penny in a savings account '
  + 'at the beginning, and by the time you arrive the compound interest has covered dinner '
  + 'for everyone who has ever eaten here. Accounts has queried this once and been shown '
  + 'the arithmetic, and has not queried it since.\n\n'
  + 'There is no further work. There is a window, and it is the good window.';
