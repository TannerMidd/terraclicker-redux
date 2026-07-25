/**
 * Situations — things that happen and want an answer.
 *
 * What replaced what, and why: the old events were seven objects of the same
 * shape, a duration and a multiplier, differing only in numbers and flavour
 * text. A solar flare and a space whale migration were mechanically the same
 * thing. Nothing was ever asked of the player, nothing was ever at risk, and
 * nothing about the universe was different afterwards — which made the whole
 * layer indistinguishable from the number going up on its own, which the game
 * already does very well without help.
 *
 * A situation instead: names something you actually built, offers options that
 * COST something, and leaves a mark whichever way it goes — including if you
 * leave it alone, which is always allowed and never free.
 *
 * Three severities, because not everything can be a crisis:
 *
 *   opportunity — ignoring it costs you nothing but the opportunity
 *   nuisance    — ignoring it dents the world's standing a little
 *   hazard      — ignoring it really does dim a world, and gets a long window
 *
 * Standing is the stakes model, and it is deliberately gentle: a neglected
 * world loses its lights and some of its contribution, and can always be put
 * right again. Nothing is ever destroyed. This is still an idle game, and
 * people are away for days.
 *
 * Costs are in SECONDS OF CURRENT PRODUCTION, not flat numbers, so a choice
 * costs the same fraction of your afternoon at every stage of the game.
 *
 * Nothing here touches salvage in either direction. The Deep Field's economy
 * stays sealed off from this one — exploration improves the ship, and that is
 * still all it does.
 */

export type SituationSeverity = 'opportunity' | 'nuisance' | 'hazard';

export interface SituationOutcome {
  /** What the Guide reports happened. `{world}` is substituted. */
  text: string;
  /** Apply this buff by EventDef id — the old events, now earned. */
  buff?: string;
  /** Instant TU, in seconds of current production. */
  gainSeconds?: number;
  /** Instant Science, in seconds of current science production. */
  scienceSeconds?: number;
  /** Change to the named world's standing (−1…+1). Needs a targeted def. */
  standing?: number;
}

export interface SituationOptionDef {
  id: string;
  /** Button text. Short and verby. */
  label: string;
  /** The small print under it — say what it costs and what it buys. */
  detail: string;
  /** TU cost, in seconds of current production. */
  costSeconds?: number;
  /** Science cost, in seconds of current science production. */
  costScienceSeconds?: number;
  outcome: SituationOutcome;
}

export interface SituationDef {
  id: string;
  name: string;
  /** The situation. `{world}` is substituted with a real delivered world. */
  text: string;
  emoji: string;
  weight: number;
  severity: SituationSeverity;
  /** True if this one needs a delivered world to happen TO. */
  targeted: boolean;
  /** How long the player has, in ms of played time. */
  windowMs: number;
  options: readonly SituationOptionDef[];
  /** What happens when the window closes with no answer. */
  ignored: SituationOutcome;
}

export const SITUATIONS: readonly SituationDef[] = [
  {
    id: 'ship-with-opinions',
    name: 'A Ship With Opinions',
    text: 'A Sirius Cybernetics bulk liner has developed a personality on the approach to {world} and is refusing to dock until someone acknowledges its feelings.',
    emoji: '🛳️',
    weight: 8,
    severity: 'nuisance',
    targeted: true,
    windowMs: 150_000,
    options: [
      {
        id: 'talk',
        label: 'Talk it down',
        detail: 'Four hours of somebody senior listening. It docks, and stays.',
        costSeconds: 45,
        outcome: {
          text: 'It docks. It has asked to be based at {world} permanently, and the port authority has agreed on the condition that it stops describing the sunsets.',
          standing: 0.1,
        },
      },
      {
        id: 'impound',
        label: 'Impound the cargo',
        detail: 'Faster. The crew will hear about it.',
        outcome: {
          text: 'The cargo is unloaded by people who did not make eye contact. The ship left. {world} noticed how that was handled.',
          gainSeconds: 70,
          standing: -0.12,
        },
      },
    ],
    ignored: {
      text: 'The liner is still out there. It has started a newsletter, and {world} is on the mailing list.',
      standing: -0.08,
    },
  },
  {
    id: 'vogon-reassessment',
    name: 'Reassessment Notice',
    text: 'A Prostetnic sub-committee has decided to re-examine the paperwork by which {world} exists. They have brought sandwiches, which is never a good sign.',
    emoji: '📋',
    weight: 5,
    severity: 'hazard',
    targeted: true,
    windowMs: 420_000,
    options: [
      {
        id: 'fee',
        label: 'Pay the filing fee',
        detail: 'Expensive, immediate, and entirely legal.',
        costSeconds: 130,
        outcome: {
          text: 'The fee is paid. {world} is re-approved, retroactively, in triplicate, and the sandwiches leave with them.',
          standing: 0.05,
        },
      },
      {
        id: 'counter',
        label: 'File a counter-petition',
        detail: 'Your own bureaucracy, aimed back at theirs. Costs research time.',
        costScienceSeconds: 150,
        outcome: {
          text: 'Form 4C(b) is a work of art. The sub-committee has withdrawn, and left behind a procedural loophole your legal department is very excited about.',
          standing: 0.12,
          buff: 'probability-squall',
        },
      },
    ],
    ignored: {
      text: '{world} has been downgraded to "provisionally extant" pending an appeal nobody filed. Half its settlements have gone dark while the status is clarified.',
      standing: -0.4,
    },
  },
  {
    id: 'hydrological-reconsideration',
    name: 'Hydrological Reconsideration',
    text: 'Survey reports that the sea on {world} is approximately where it was asked to be, but not where anyone actually wanted it. Both facts are documented.',
    emoji: '🌊',
    weight: 7,
    severity: 'opportunity',
    targeted: true,
    windowMs: 180_000,
    options: [
      {
        id: 'divert',
        label: 'Divert the crews',
        detail: 'Move it. Slow, correct, and appreciated locally.',
        costSeconds: 60,
        outcome: {
          text: 'The sea is now where it was wanted. The people of {world} have named a bay after nobody in particular, which is the highest honour they give.',
          standing: 0.15,
        },
      },
      {
        id: 'settle',
        label: 'Let it settle',
        detail: 'Leave it. The coastline is unusual, and unusual sells.',
        outcome: {
          text: '{world} keeps its wrong sea. Three tour operators have already filed for the exclusive rights to explain it.',
          gainSeconds: 45,
          scienceSeconds: 60,
        },
      },
    ],
    ignored: {
      text: 'The sea stayed where it was. Everyone has quietly agreed to describe it as intentional.',
    },
  },
  {
    id: 'improbability-squall',
    name: 'Improbability Squall',
    text: 'The local probability field has gone soft. For the moment, everything that could go right is going right, including several things that were not previously possible.',
    emoji: '⚡',
    weight: 6,
    severity: 'opportunity',
    targeted: false,
    windowMs: 90_000,
    options: [
      {
        id: 'ride',
        label: 'Ride it out',
        detail: 'Do nothing clever. Let the impossible happen on schedule.',
        outcome: {
          text: 'For a few minutes everything works. Nobody writes any of it down, which is the traditional response.',
          buff: 'probability-squall',
        },
      },
      {
        id: 'bottle',
        label: 'Bottle it',
        detail: 'Spend the moment measuring the moment.',
        costSeconds: 25,
        outcome: {
          text: 'Two hundred litres of unlikelihood, decanted and labelled. Research is delighted and slightly nervous.',
          scienceSeconds: 220,
        },
      },
    ],
    ignored: {
      text: 'The squall passed. Somewhere, a teacup that was going to fall did not.',
    },
  },
  {
    id: 'freight-dispute',
    name: 'A Question of Right of Way',
    text: 'Two freight consortia have discovered that the lane serving {world} is, technically, theirs. Both are correct. Neither will move.',
    emoji: '🚛',
    weight: 7,
    severity: 'nuisance',
    targeted: true,
    windowMs: 160_000,
    options: [
      {
        id: 'arbitrate',
        label: 'Arbitrate',
        detail: 'Buy a ruling. Both sides leave equally unhappy, which is how you know it worked.',
        costSeconds: 55,
        outcome: {
          text: 'The lane is redrawn with a kink in it that satisfies everyone and pleases nobody. Traffic to {world} is heavier than before.',
          standing: 0.12,
        },
      },
      {
        id: 'reroute',
        label: 'Route around it',
        detail: 'Longer, but it costs nothing but distance.',
        outcome: {
          text: 'The new route adds nine hours to every run. The consortia are still out there, still correct, still parked.',
          standing: -0.05,
        },
      },
    ],
    ignored: {
      text: 'The dispute is now in its second phase, which involves lawyers, and its third, which involves poetry. Freight to {world} has largely stopped.',
      standing: -0.15,
    },
  },
  {
    id: 'heritage-application',
    name: 'An Application for Permanence',
    text: '{world} has applied to have itself designated as being of historical interest, on the grounds that it has been there for a while and is quite nice.',
    emoji: '🏛️',
    weight: 5,
    severity: 'opportunity',
    targeted: true,
    windowMs: 240_000,
    options: [
      {
        id: 'endorse',
        label: 'Endorse the application',
        detail: 'Sponsor the paperwork. Locals will be insufferable about it.',
        costSeconds: 70,
        outcome: {
          text: '{world} is now Of Historical Interest. Every settlement has put up a small plaque explaining what it is about to do next.',
          standing: 0.25,
        },
      },
      {
        id: 'decline',
        label: 'Decline, politely',
        detail: 'A world that is a monument is a world that stops changing.',
        outcome: {
          text: 'The application is returned with a kind note. {world} goes back to work, faintly relieved.',
          gainSeconds: 30,
        },
      },
    ],
    ignored: {
      text: 'The application has expired unread. {world} has not mentioned it again, pointedly.',
      standing: -0.06,
    },
  },
  {
    id: 'stellar-indigestion',
    name: 'Stellar Indigestion',
    text: 'The star {world} orbits has begun doing something with its chromosphere that the survey team describes as "expressive". They are not smiling.',
    emoji: '☀️',
    weight: 4,
    severity: 'hazard',
    targeted: true,
    windowMs: 360_000,
    options: [
      {
        id: 'shield',
        label: 'Raise the shades',
        detail: 'Throw everything you have at the sunward side.',
        costSeconds: 110,
        outcome: {
          text: 'The shades hold. {world} watched the whole thing from underneath and has decided it was beautiful.',
          standing: 0.1,
          buff: 'solar-flare',
        },
      },
      {
        id: 'harvest',
        label: 'Point instruments at it',
        detail: 'Do not stop it. Learn from it. The surface will take the difference.',
        costSeconds: 20,
        outcome: {
          text: 'Eleven years of stellar physics in four hours. The upper settlements of {world} were evacuated and are not, at present, habitable.',
          scienceSeconds: 400,
          standing: -0.2,
        },
      },
    ],
    ignored: {
      text: 'The flare arrived unannounced. {world} is still there, but a good deal of it is dark, and will need rebuilding.',
      standing: -0.45,
    },
  },
  {
    id: 'towel-census',
    name: 'The Towel Census',
    text: 'A Guide field researcher is conducting a census of towels in the sector and would like to count yours. They have been doing this for eleven years and are very tired.',
    emoji: '🧻',
    weight: 5,
    severity: 'opportunity',
    targeted: false,
    windowMs: 150_000,
    options: [
      {
        id: 'cooperate',
        label: 'Open the linen cupboard',
        detail: 'Full access. It costs an afternoon.',
        costSeconds: 30,
        outcome: {
          text: 'Your holdings are recorded as "adequate, and in one case remarkable". The researcher has left a citation and most of a sandwich.',
          scienceSeconds: 180,
        },
      },
      {
        id: 'hospitality',
        label: 'Give them the good chair',
        detail: 'Feed them. Ask nothing. They have earned it.',
        costSeconds: 55,
        outcome: {
          text: 'They slept for fourteen hours, filed a glowing entry about the whole operation, and mentioned it on the Sub-Etha. Business is up.',
          buff: 'aurora-storm',
          gainSeconds: 90,
        },
      },
    ],
    ignored: {
      text: 'The researcher counted from the doorway and wrote "uncooperative, but clean".',
    },
  },
  {
    id: 'comet-on-approach',
    name: 'Delivery, Unscheduled',
    text: 'An ice-rich comet is inbound and, by cometary standards, punctual. Nobody ordered it. It is very large and completely indifferent to that fact.',
    emoji: '☄️',
    weight: 7,
    severity: 'opportunity',
    targeted: false,
    windowMs: 120_000,
    options: [
      {
        id: 'capture',
        label: 'Capture it',
        detail: 'Tugs, nets, and a great deal of shouting. Worth it.',
        costSeconds: 40,
        outcome: {
          text: 'Caught, cracked, and distributed. The hydrology department has not been this happy since the sea.',
          buff: 'comet-delivery',
          gainSeconds: 60,
        },
      },
      {
        id: 'divert',
        label: 'Nudge it past',
        detail: 'Cheap and safe. It goes somewhere else and is somebody else’s weather.',
        outcome: {
          text: 'It passed at a comfortable distance, spectacularly, and is now inbound on a system that has not been warned.',
          gainSeconds: 25,
        },
      },
    ],
    ignored: {
      text: 'It arrived on its own terms. The impact was survivable, photogenic, and has been added to the list of things nobody is responsible for.',
    },
  },
  {
    id: 'quiet-request',
    name: 'A Quiet Request',
    text: 'The settlements on {world} have sent a message asking, with some embarrassment, whether anyone is still reading these.',
    emoji: '📡',
    weight: 6,
    severity: 'nuisance',
    targeted: true,
    windowMs: 200_000,
    options: [
      {
        id: 'answer',
        label: 'Answer it yourself',
        detail: 'No fleet, no funding. Just a reply, from you, today.',
        outcome: {
          text: 'You answered. {world} has read it aloud in every hall it has, and the lights were on late.',
          standing: 0.2,
        },
      },
      {
        id: 'delegate',
        label: 'Have the office handle it',
        detail: 'A proper response, properly worded, next quarter.',
        costSeconds: 25,
        outcome: {
          text: 'A very professional letter arrived on {world} six weeks later. It was fine. It was filed.',
          standing: 0.04,
        },
      },
    ],
    ignored: {
      text: 'Nobody replied. The message has been repeated twice, then stopped. {world} has drawn its own conclusions.',
      standing: -0.18,
    },
  },
];

export const SITUATION_BY_ID: Record<string, SituationDef> = Object.fromEntries(
  SITUATIONS.map((s) => [s.id, s]),
);

/** Substitute the world name into situation prose. */
export function fillSituationText(text: string, world: string): string {
  return text.replace(/\{world\}/g, world);
}
