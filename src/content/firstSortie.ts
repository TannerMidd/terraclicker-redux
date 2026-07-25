/**
 * The first sortie.
 *
 * Taking the helm currently drops you into open space with a control legend.
 * A legend is reference material: it tells you which key does what, and
 * nothing about what any of it is *for*. Nobody has ever learned to fly from
 * one.
 *
 * So the first time a pilot takes the helm, the Guide walks them through one
 * short round trip that uses every verb the ship has and ends where it began:
 * launch, fly to something, scan it, come home. Five steps, each one satisfied
 * by doing the thing rather than by dismissing a box, and the whole thing
 * abandonable at any point by simply flying off — which is itself a lesson
 * about what kind of game this is.
 *
 * Tone: an induction pamphlet written by somebody who has done this a great
 * many times and has stopped being impressed by space.
 */

export interface SortieStep {
  id: string;
  /** What the Guide says while this step is outstanding. */
  text: string;
  /** The short instruction under it. */
  hint: string;
  /**
   * How the step is satisfied. Checked against live flight state each sweep;
   * every one of these is a thing the ship could already do.
   */
  goal:
    | { kind: 'moveAway'; distance: number }
    | { kind: 'pinAnything' }
    | { kind: 'approachPin'; within: number }
    | { kind: 'scanAnything' }
    | { kind: 'returnHome'; within: number };
}

export const FIRST_SORTIE: readonly SortieStep[] = [
  {
    id: 'launch',
    text:
      'The runabout is yours for the afternoon. It has been signed for, which is the '
      + 'binding part. Take it away from the planet before you do anything clever.',
    hint: 'Thrust forward until the planet is behind you.',
    goal: { kind: 'moveAway', distance: 14 },
  },
  {
    id: 'pin',
    text:
      'Open the chart and pin something. Anywhere will do — the department is not '
      + 'fussy about destinations, only about there being one on file.',
    hint: 'Chart panel → pin any entry.',
    goal: { kind: 'pinAnything' },
  },
  {
    id: 'fly',
    text:
      'The ribbon along the top of the canopy now points at it, with the range and an '
      + 'arrival estimate. Fly until you are alongside. Watch the estimate: if it stops '
      + 'counting down you are no longer going there, whatever the nose says.',
    hint: 'Follow the bearing marker until you arrive.',
    goal: { kind: 'approachPin', within: 10 },
  },
  {
    id: 'scan',
    text:
      'Now find something and look at it properly. Hold the engage key with a contact '
      + 'under the reticle until the sweep completes. Most of what is out here has never '
      + 'been surveyed, largely because nobody has been bored enough.',
    hint: 'Hold engage on any sensor contact.',
    goal: { kind: 'scanAnything' },
  },
  {
    id: 'home',
    text:
      'That is the whole job. Come back to the planet and the sortie is filed. The form '
      + 'is already complete; it was completed before you left.',
    hint: 'Return to the planet you started from.',
    goal: { kind: 'returnHome', within: 12 },
  },
];

export const SORTIE_COMPLETE_TEXT =
  'Sortie logged. You are now, in the only sense the department recognises, a pilot. '
  + 'The runabout is yours whenever the desk becomes unbearable.';

/** Flag on the save marking the induction as done. */
export const SORTIE_FLAG = 'firstSortieDone';
