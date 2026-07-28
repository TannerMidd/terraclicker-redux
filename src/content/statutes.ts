/**
 * Universe statutes — laws you enact about everything.
 *
 * "Early Galaxy", "Cluster" and "Cosmic Web" are currently labels on a
 * progress readout. Reaching one changes what the Vortex says and nothing
 * else, which makes the largest scale in the game also the emptiest.
 *
 * A statute is one law, enacted once per stage, that applies to every
 * commission from then on. It is the only thing in the game with that reach,
 * which is why there are so few of them and why each is a single sentence.
 *
 * Two rules, both load-bearing:
 *
 * 1. **A statute changes rules and story pools, never currency.** There is no
 *    fourth resource here and there is not going to be one. What a statute
 *    alters is how the existing game behaves.
 * 2. **Permanent, and permanently visible.** Statutes survive prestige — they
 *    are the one thing that does besides the monuments and the archive — and
 *    the Vortex lists every one you have ever enacted, because a law you
 *    cannot see is indistinguishable from a bug.
 *
 * Tone: legislation drafted by people who have stopped being surprised by
 * anything and have kept the forms anyway.
 */

export type StatuteEffect =
  /** Situations arrive this much more often (petitions keep their own
   * clock, and the cadence cap in constants.ts has the last word). */
  | { kind: 'situationFreq'; v: number }
  /** Offline cap, in ms. */
  | { kind: 'offlineCapAddMs'; v: number }
  /** Every world arrives this fraction pre-terraformed. */
  | { kind: 'headStart'; v: number }
  /** Appraisal accepts this many fewer systems. */
  | { kind: 'appraisalEasier'; v: number }
  /** Deep Field sensor reach. */
  | { kind: 'sensors'; v: number };

export interface StatuteDef {
  id: string;
  name: string;
  /** The act, as passed. */
  text: string;
  /** What it does, plainly, because the act will not say. */
  terms: string;
  /** Universe stage at which it may be enacted: 1 = galaxy, 2, 3. */
  stage: 1 | 2 | 3;
  effect: StatuteEffect;
}

export const STATUTES: readonly StatuteDef[] = [
  // — Stage 1: the first galaxy —
  {
    id: 'gravity-mandatory',
    name: 'Gravity Remains Mandatory',
    text:
      'Following representations from several parties who would prefer otherwise, it is '
      + 'confirmed that gravity is not optional and will not be made optional, whatever '
      + 'the second appendix appears to say.',
    terms: 'Worlds arrive 8% pre-settled. Things fall towards them faster.',
    stage: 1,
    effect: { kind: 'headStart', v: 0.08 },
  },
  {
    id: 'tuesdays',
    name: 'Tuesdays Are Under Review',
    text:
      'The status of Tuesday is suspended pending an inquiry, the terms of which are '
      + 'themselves under review. Work continues. Nobody has been told which day it is.',
    terms: 'The offline cap extends by four hours, on a technicality.',
    stage: 1,
    effect: { kind: 'offlineCapAddMs', v: 4 * 3_600_000 },
  },
  // — Stage 2: the cluster —
  {
    id: 'oceans-receipts',
    name: 'All Oceans Require Receipts',
    text:
      'No body of water above a threshold volume may exist without documentation of its '
      + 'origin. Enforcement is retroactive. The paperwork is, in most cases, longer than '
      + 'the coastline.',
    terms: 'Worlds write far more often, having a great deal to file.',
    stage: 2,
    effect: { kind: 'situationFreq', v: 1.5 },
  },
  {
    id: 'plain-language',
    name: 'The Plain Language Act',
    text:
      'All departmental correspondence must henceforth be comprehensible on first '
      + 'reading. The Act itself is exempt, for reasons set out in Schedule 9.',
    terms: 'Appraisal accepts one system fewer, forever.',
    stage: 2,
    effect: { kind: 'appraisalEasier', v: 1 },
  },
  // — Stage 3: the cosmic web —
  {
    id: 'right-to-roam',
    name: 'A General Right to Roam',
    text:
      'Every registered vessel may go anywhere, look at anything, and be asked to leave '
      + 'politely. The third clause was added at the insistence of customs and has been '
      + 'described by them as "the only part that works".',
    terms: 'Sensors reach 35% further, everywhere, permanently.',
    stage: 3,
    effect: { kind: 'sensors', v: 1.35 },
  },
  {
    id: 'universal-postal',
    name: 'The Universal Postal Union',
    text:
      'Every world is now entitled to write to every other world, and to you. The volume '
      + 'was anticipated. The tone was not.',
    terms: 'Worlds write twice as often. All of them. About everything.',
    stage: 3,
    effect: { kind: 'situationFreq', v: 2 },
  },
];

export const STATUTE_BY_ID: Record<string, StatuteDef> = Object.fromEntries(
  STATUTES.map((s) => [s.id, s]),
);

/** Galaxies needed to reach each stage. */
export const STAGE_GALAXIES: Record<1 | 2 | 3, number> = { 1: 1, 2: 5, 3: 15 };
