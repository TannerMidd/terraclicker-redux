/**
 * The Unscheduled Objects Register — things nobody filed.
 *
 * The fifteen Deep Field landmarks are the crown jewels and stay exactly as
 * they are: handwritten, findable once, and worth the trip. But once they are
 * all charted, space stops producing anything. Exploration becomes a completed
 * checklist, and a universe you cannot be surprised by is a universe you stop
 * flying through.
 *
 * So each commission also carries a handful of unscheduled objects, assembled
 * from authored parts by `content/composer.ts`. The humour is written once and
 * recombined; the specifics are never quite the same twice. They are not
 * landmarks and do not pretend to be — they expire with the commission, they
 * are worth less, and the Guide files them under "provisional".
 *
 * Five slots, in the order the pilot meets them:
 *
 *   family      — what it appears to be
 *   condition   — what is odd about it
 *   complication— what the scan runs into
 *   choice      — what boarding offers
 *   result      — what you come away with
 *
 * Tags keep the combinations coherent: a thing that is `structure` can have
 * doors, a thing that is `swarm` cannot.
 */
import type { Composition } from './composer';

export const UNSCHEDULED: Composition = {
  id: 'unscheduled',
  pattern: '{family} {condition} {complication}',
  slots: [
    {
      id: 'family',
      fragments: [
        {
          id: 'waiting-room',
          text: 'A waiting room, without the building it belongs to.',
          tags: ['structure', 'furnished'],
        },
        {
          id: 'municipal-moon',
          text: 'A municipal moon, second-hand, one previous owner.',
          tags: ['body', 'civic'],
        },
        {
          id: 'office-park',
          text: 'An office park at absolute zero, fully let.',
          tags: ['structure', 'civic'],
        },
        {
          id: 'filing-swarm',
          text: 'A swarm of filing cabinets in loose formation.',
          tags: ['swarm', 'civic'],
        },
        {
          id: 'staircase',
          text: 'A staircase, freestanding, going up.',
          tags: ['structure'],
        },
        {
          id: 'weather-front',
          text: 'A weather front, in vacuum, holding together out of habit.',
          tags: ['diffuse'],
        },
        {
          id: 'orchard',
          text: 'An orchard in a pressure dome, unattended and fruiting.',
          tags: ['structure', 'living'],
        },
      ],
    },
    {
      id: 'condition',
      fragments: [
        {
          id: 'lit',
          text: 'The lights are on.',
          requires: ['structure'],
        },
        {
          id: 'occupied',
          text: 'The chairs are warm.',
          requires: ['furnished'],
        },
        {
          id: 'rota',
          text: 'A cleaning rota is posted, and is up to date.',
          requires: ['civic'],
        },
        {
          id: 'formation',
          text: 'It is maintaining formation to a tolerance nobody asked for.',
          requires: ['swarm'],
        },
        {
          id: 'growing',
          text: 'It is measurably larger than the last survey said.',
          requires: ['living'],
        },
        { id: 'silent', text: 'It has not transmitted in some time.' },
        { id: 'humming', text: 'It is humming, on a note the Guide declines to identify.' },
        { id: 'drifting', text: 'It is drifting in no particular hurry.' },
      ],
    },
    {
      id: 'complication',
      fragments: [
        {
          id: 'refuses',
          text: 'The scan completes and then politely revises itself downward.',
        },
        {
          id: 'doors',
          text: 'The doors open before you ask, which is either courtesy or a draught.',
          requires: ['structure'],
        },
        {
          id: 'counts',
          text: 'The count comes back different every sweep, always by one.',
          requires: ['swarm'],
        },
        {
          id: 'inventory',
          text: 'An inventory is attached. It lists you.',
          requires: ['civic'],
        },
        { id: 'echo', text: 'The return arrives before the ping, and is apologetic about it.' },
        { id: 'nothing', text: 'Nothing about it resists inspection, which is itself suspicious.' },
      ],
    },
  ],
};

/** What boarding one of these is worth. Deliberately less than a landmark. */
export const UNSCHEDULED_SALVAGE = 8;

/** How many ride along with a commission. */
export const UNSCHEDULED_PER_COMMISSION = 4;
