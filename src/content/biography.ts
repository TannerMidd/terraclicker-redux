/**
 * What a world is like now, in one sentence.
 *
 * The first authored set for the composer, and the first consumer of the world
 * record store. A delivered world has a type, a bottleneck it fought, some
 * number of installations left standing on it, and a history of requests you
 * answered or did not. That is enough to say something specific about it
 * without anyone writing four hundred sentences by hand.
 *
 * Tone: the Guide describing a place it has visited, in the register of a
 * survey report that has stopped pretending to be neutral. Administrative
 * first, absurd second, warm occasionally and briefly.
 *
 * Trait tags come from `worldTraits`; type tags from the planet itself. A
 * fragment that `requires: ['neglected']` only ever appears on a world that
 * has actually been neglected — the combinatorics are wide, the nonsense is
 * fenced off by tags.
 */
import type { Composition } from './composer';

export const WORLD_BIOGRAPHY: Composition = {
  id: 'world-bio',
  pattern: '{opening} {detail} {closing}',
  slots: [
    {
      id: 'opening',
      fragments: [
        { id: 'settled', text: 'Settled, and settling further.', forbids: ['neglected'] },
        { id: 'quiet', text: 'Quiet, in the way of places that have decided things.' },
        { id: 'busy', text: 'Busier than its filing suggests.', requires: ['engineered'] },
        { id: 'thin', text: 'Sparsely built and unbothered by it.', requires: ['austere'] },
        { id: 'dimming', text: 'Fewer lights each survey.', requires: ['neglected'] },
        { id: 'odd', text: 'Reported as habitable, with reservations.', requires: ['peculiar'] },
      ],
    },
    {
      id: 'detail',
      fragments: [
        {
          id: 'thermal',
          text: 'The heating works, which locally counts as a personality.',
          requires: ['bottleneck:thermal'],
        },
        {
          id: 'atmo',
          text: 'The air arrived late and has been apologising ever since.',
          requires: ['bottleneck:atmo'],
        },
        {
          id: 'hydro',
          text: 'The water came in under budget and slightly to the left.',
          requires: ['bottleneck:hydro'],
        },
        {
          id: 'bio',
          text: 'Something is growing that nobody ordered and everybody likes.',
          requires: ['bottleneck:bio'],
        },
        {
          id: 'ocean',
          text: 'Two thirds sea, and the remaining third has opinions about it.',
          requires: ['type:ocean'],
        },
        {
          id: 'ice',
          text: 'Warm now. The residents mention this to visitors, at length.',
          requires: ['type:ice'],
        },
        {
          id: 'plant',
          text: 'The installations outnumber the residents and are better maintained.',
          requires: ['engineered'],
        },
        { id: 'plain', text: 'Nothing here has yet required a form.' },
      ],
    },
    {
      id: 'closing',
      fragments: [
        {
          id: 'writes',
          text: 'It writes occasionally, and always about drainage.',
          forbids: ['neglected'],
        },
        {
          id: 'grateful',
          text: 'It has not forgotten that somebody answered.',
          requires: ['well-attended'],
        },
        {
          id: 'mended',
          text: 'Something here was mended by hand, and the residents point it out to visitors.',
          requires: ['tended'],
        },
        {
          id: 'marked',
          text: 'A mark stands on it that somebody walked out and planted, which the maps mention first.',
          requires: ['waymarked'],
        },
        {
          id: 'stopped',
          text: 'It has stopped writing, which the Guide notes without comment.',
          requires: ['neglected'],
        },
        {
          id: 'storied',
          text: 'Its file is now longer than its census.',
          requires: ['storied'],
        },
        { id: 'nothing', text: 'No further correspondence is expected.' },
      ],
    },
  ],
};

/** Tags a world contributes to its own description. */
export function worldContextTags(
  type: string,
  bottleneck: string,
  traits: readonly string[],
): string[] {
  return [`type:${type}`, `bottleneck:${bottleneck}`, ...traits];
}
