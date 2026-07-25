/**
 * System Charters — what five worlds decide to be, together.
 *
 * A system currently forms, plays a cinematic, adds +15% and is never referred
 * to again. But five worlds that were delivered by the same hand, in the same
 * commission, with a shared record of what was answered and what was left, are
 * the most specific thing in the game — and the game has been throwing that
 * specificity away at the moment it becomes available.
 *
 * A Charter is one choice, offered once, when the fifth world lands. It is
 * small on purpose: a system is not a second prestige layer, and the whole
 * value is that it is *about these five worlds* rather than about a number.
 *
 * Which charters are offered is read from the system's own history — see
 * `charterOffersFor` in engine/charters.ts. A system whose worlds were all
 * answered is offered different articles from one that was ignored, which is
 * the point: the choice is a consequence.
 */
import type { AspectId } from '../engine/types';

export type CharterEffect =
  /** Aspect production across the whole commission. */
  | { kind: 'aspectMult'; aspect: AspectId; v: number }
  /** Production across the whole commission. */
  | { kind: 'prodMult'; v: number }
  /** Science across the whole commission. */
  | { kind: 'scienceMult'; v: number }
  /** Standing floor: these worlds cannot dim below this. */
  | { kind: 'standingFloor'; v: number }
  /** Petitions from this system arrive more often, and pay more standing. */
  | { kind: 'petitionFocus'; v: number };

export interface CharterDef {
  id: string;
  name: string;
  /** The article as filed. */
  text: string;
  effect: CharterEffect;
  /**
   * When this article may be offered:
   *  - `always`     — available to any system
   *  - `attended`   — the system answered more than it ignored
   *  - `neglected`  — the system ignored more than it answered
   *  - `engineered` — heavily built
   */
  when: 'always' | 'attended' | 'neglected' | 'engineered';
}

export const CHARTERS: readonly CharterDef[] = [
  {
    id: 'mutual-aid',
    name: 'Articles of Mutual Aid',
    text:
      'The five worlds agree to answer each other first and the department second. '
      + 'Nobody consulted the department about this. It has been noted and, on '
      + 'reflection, not contested.',
    effect: { kind: 'standingFloor', v: 0.7 },
    when: 'attended',
  },
  {
    id: 'open-correspondence',
    name: 'An Open Correspondence',
    text:
      'Having been answered once, the system has formed the impression that writing to '
      + 'you works. It now does so considerably more often, and with better handwriting.',
    effect: { kind: 'petitionFocus', v: 1.6 },
    when: 'attended',
  },
  {
    id: 'salvage-rights',
    name: 'Salvage Rights, Asserted',
    text:
      'Left largely to themselves, the worlds have taken up the local industry, which is '
      + 'taking apart whatever drifts past. Output is up. Nobody has asked what they are '
      + 'taking apart.',
    effect: { kind: 'prodMult', v: 1.18 },
    when: 'neglected',
  },
  {
    id: 'quiet-clause',
    name: 'The Quiet Clause',
    text:
      'The system requests, formally and without rancour, to be left alone. It will '
      + 'continue working. It would simply prefer not to be written to about it.',
    effect: { kind: 'standingFloor', v: 0.85 },
    when: 'neglected',
  },
  {
    id: 'works-committee',
    name: 'A Standing Works Committee',
    text:
      'The installations across all five worlds have been placed under one committee, '
      + 'which meets constantly and has already improved throughput by arguing about it.',
    effect: { kind: 'prodMult', v: 1.22 },
    when: 'engineered',
  },
  {
    id: 'observatory',
    name: 'A Shared Observatory',
    text:
      'One of the five has volunteered its night side permanently. The others send data, '
      + 'sandwiches, and a great deal of unsolicited advice.',
    effect: { kind: 'scienceMult', v: 1.5 },
    when: 'always',
  },
  {
    id: 'thermal-compact',
    name: 'The Thermal Compact',
    text:
      'Heat is now pooled across the system on the grounds that it was going spare. '
      + 'The physics of this has been queried and the query has been filed.',
    effect: { kind: 'aspectMult', aspect: 'thermal', v: 1.3 },
    when: 'always',
  },
  {
    id: 'water-board',
    name: 'The Water Board',
    text:
      'Five worlds, one water board, and an agreement about who gets the rain that has '
      + 'already been described in the minutes as "durable".',
    effect: { kind: 'aspectMult', aspect: 'hydro', v: 1.3 },
    when: 'always',
  },
];

export const CHARTER_BY_ID: Record<string, CharterDef> = Object.fromEntries(
  CHARTERS.map((c) => [c.id, c]),
);

/** How many articles a system is offered. */
export const CHARTER_OFFER_COUNT = 2;
