/**
 * Megaproject programmes — three phases, and a question at each one.
 *
 * A megaproject is currently a binary wait. You sign, and eighteen hours later
 * a thing exists. Coming back to 73% is not a story; coming back to scaffolding
 * that has become a dispute that has become a finished object is.
 *
 * So each project is now a programme of three phases. Every phase completing
 * asks one question, and answering it does two things: it grants a partial
 * benefit immediately, and it constrains what the final object can be. The
 * final phase is the module choice, and the modules are mutually exclusive —
 * two players who both built the Orbital Gantry should not have the same
 * Orbital Gantry.
 *
 * Phases divide the existing `buildMs` rather than extending it: a programme
 * takes exactly as long as the project always took. What changes is that you
 * are consulted three times on the way.
 *
 * A phase left unanswered simply holds. Construction does not stall — the crew
 * carry on with what they can do without you — but the benefit waits and the
 * final module stays open. Nothing here is a timer you can lose.
 */
import type { AspectId } from '../engine/types';

export type PhaseEffect =
  | { kind: 'prodMult'; v: number }
  | { kind: 'scienceMult'; v: number }
  | { kind: 'aspectMult'; aspect: AspectId; v: number }
  | { kind: 'offlineCapAddMs'; v: number }
  | { kind: 'salvagePerHour'; v: number };

export interface PhaseOption {
  id: string;
  label: string;
  /** What the crew do differently from here. */
  text: string;
  /** Granted the moment it is chosen — the partial benefit. */
  effect: PhaseEffect;
}

export interface ProgrammePhase {
  id: string;
  /** What is standing there when this phase completes. */
  name: string;
  /** The question. */
  text: string;
  options: readonly PhaseOption[];
}

export interface ProgrammeDef {
  /** Megaproject id this belongs to. */
  megaproject: string;
  phases: readonly [ProgrammePhase, ProgrammePhase, ProgrammePhase];
}

const HOUR = 3_600_000;

export const PROGRAMMES: readonly ProgrammeDef[] = [
  {
    megaproject: 'orbital-gantry',
    phases: [
      {
        id: 'footings',
        name: 'Footings and Anchors',
        text:
          'The anchors are in and the crew would like to know what they are anchoring. '
          + 'They have their own view, which they have expressed by already starting.',
        options: [
          {
            id: 'wide',
            label: 'Build wide',
            text: 'A broader frame. More can be worked on at once, and it looks like something.',
            effect: { kind: 'prodMult', v: 1.06 },
          },
          {
            id: 'deep',
            label: 'Build deep',
            text: 'A narrower frame that reaches further down the gravity well.',
            effect: { kind: 'aspectMult', aspect: 'thermal', v: 1.12 },
          },
        ],
      },
      {
        id: 'spine',
        name: 'The Spine',
        text:
          'The main spar is up. There is an argument about whether the scaffold should '
          + 'also be a place people can live. Both sides have made posters.',
        options: [
          {
            id: 'quarters',
            label: 'Fit quarters',
            text: 'Somewhere to sleep. Shifts get longer and considerably better tempered.',
            effect: { kind: 'prodMult', v: 1.08 },
          },
          {
            id: 'automate',
            label: 'Leave it to the machines',
            text: 'Nobody lives there. It runs perfectly and nobody enjoys it.',
            effect: { kind: 'offlineCapAddMs', v: 2 * HOUR },
          },
        ],
      },
      {
        id: 'crown',
        name: 'The Crown',
        text:
          'One structure remains to be hung at the top, and it can only be one of them. '
          + 'The department notes that this is the decision people will remember.',
        options: [
          {
            id: 'foundry',
            label: 'A foundry',
            text: 'It makes things. Loudly, constantly, and rather well.',
            effect: { kind: 'prodMult', v: 1.18 },
          },
          {
            id: 'yard',
            label: 'A breaking yard',
            text: 'It takes things apart. The salvage has to go somewhere and it goes to you.',
            effect: { kind: 'salvagePerHour', v: 20 },
          },
        ],
      },
    ],
  },
  {
    megaproject: 'deep-archive',
    phases: [
      {
        id: 'stacks',
        name: 'The Stacks',
        text:
          'Shelving is in. The mice would like to know the indexing scheme and have '
          + 'offered three, each of which is a trap in a different way.',
        options: [
          {
            id: 'by-subject',
            label: 'By subject',
            text: 'Sensible. Findable. Everyone can use it, which is the problem.',
            effect: { kind: 'scienceMult', v: 1.15 },
          },
          {
            id: 'by-arrival',
            label: 'By order of arrival',
            text: 'Unusable by anyone but the archivist, who is therefore now indispensable.',
            effect: { kind: 'prodMult', v: 1.07 },
          },
        ],
      },
      {
        id: 'reading-room',
        name: 'The Reading Room',
        text:
          'There is a room. There is a question of whether anyone outside the department '
          + 'may sit in it. Opinions are strong and entirely unrelated to the room.',
        options: [
          {
            id: 'open',
            label: 'Open to all',
            text: 'Scholars arrive. Some of them are useful and all of them are loud.',
            effect: { kind: 'scienceMult', v: 1.2 },
          },
          {
            id: 'closed',
            label: 'Departmental use only',
            text: 'Silence. Enormous, productive, faintly disappointed silence.',
            effect: { kind: 'offlineCapAddMs', v: 3 * HOUR },
          },
        ],
      },
      {
        id: 'catalogue',
        name: 'The Catalogue',
        text:
          'What the archive is finally FOR. It can be one thing exceptionally well and '
          + 'the mice have stopped pretending otherwise.',
        options: [
          {
            id: 'theory',
            label: 'A theoretical collection',
            text: 'Nothing in it is useful yet. All of it will be.',
            effect: { kind: 'scienceMult', v: 1.45 },
          },
          {
            id: 'practice',
            label: 'A working manual',
            text: 'Every page is something somebody needed at three in the morning.',
            effect: { kind: 'prodMult', v: 1.15 },
          },
        ],
      },
    ],
  },
];

export const PROGRAMME_BY_MEGAPROJECT: Record<string, ProgrammeDef> = Object.fromEntries(
  PROGRAMMES.map((p) => [p.megaproject, p]),
);

export const PHASES_PER_PROGRAMME = 3;
