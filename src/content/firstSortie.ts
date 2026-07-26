/**
 * The first sortie.
 *
 * A control legend says which key does what; it does not teach what flight is
 * for. The first time a pilot takes the helm, the Guide therefore assigns one
 * seeded, reachable contact and walks them through a complete round trip.
 * Every step refers to the same object, progress survives leaving the helm,
 * and the induction ends with enough salvage for a first refit decision.
 */

export interface SortieStep {
  id: string;
  /** What the Guide says while this step is outstanding. */
  text: string;
  /** The short instruction under it. */
  hint: string;
  /** A real state transition rather than a dismissible explanation. */
  goal:
    | { kind: 'moveAway'; distance: number }
    | { kind: 'lockTrainingContact' }
    | { kind: 'scanTrainingContact' }
    | { kind: 'approachTrainingContact' }
    | { kind: 'boardTrainingContact' }
    | { kind: 'returnHome'; within: number };
}

export const FIRST_SORTIE: readonly SortieStep[] = [
  {
    id: 'launch',
    text:
      'The runabout is yours for the afternoon. It has been signed for, which is the '
      + 'binding part. The launch computer has put a training contact dead ahead.',
    hint: 'Thrust forward. The planet is already behind you.',
    goal: { kind: 'moveAway', distance: 5 },
  },
  {
    id: 'acquire',
    text:
      'The sensor slate gives direction as well as range. Bring the highlighted contact '
      + 'under the centre reticle until the console names it as your target.',
    hint: 'Turn toward the TRAINING contact and centre it in the reticle.',
    goal: { kind: 'lockTrainingContact' },
  },
  {
    id: 'scan',
    text:
      'Hold the engage control while the contact stays under the reticle. The console will '
      + 'hold station while it works. Release engage once the sweep is filed.',
    hint: 'Hold ENGAGE to scan, then release it.',
    goal: { kind: 'scanTrainingContact' },
  },
  {
    id: 'approach',
    text:
      'The contact is now pinned and the bearing ribbon points at it. Approach until the '
      + 'boarding prompt appears, then brake. Arriving slowly is still arriving.',
    hint: 'Follow the ribbon and brake inside the boarding envelope.',
    goal: { kind: 'approachTrainingContact' },
  },
  {
    id: 'board',
    text:
      'The scan and the visit are separate filings. Now press engage once to board and '
      + 'recover what the previous owner no longer appears to need.',
    hint: 'Release ENGAGE, then press it once to board.',
    goal: { kind: 'boardTrainingContact' },
  },
  {
    id: 'home',
    text:
      'The home world is pinned. Follow the ribbon back until the planet fills the glass. '
      + 'The form is already complete; it was completed before you left.',
    hint: 'Return within 5u of home. Brake before the scenery becomes paperwork.',
    goal: { kind: 'returnHome', within: 5 },
  },
];

export const SORTIE_COMPLETE_TEXT =
  'Sortie logged. You are now, in the only sense the department recognises, a pilot. '
  + 'The runabout is yours whenever the desk becomes unbearable. The refit bay now has '
  + 'enough salvage for your first practical decision.';

/** Flag on the save marking the induction as done. */
export const SORTIE_FLAG = 'firstSortieDone';
/** Saved zero-based checklist index. Kept separate for old saves where `done = 1`. */
export const SORTIE_PROGRESS_FLAG = 'firstSortieStep';
/** The induction guarantees at least this much salvage after the recovered object pays. */
export const SORTIE_STARTER_SALVAGE = 5;