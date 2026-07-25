import type { AspectId } from '../engine/types';

export interface QuirkDef {
  id: string;
  text: string;
  weight: number;
  /** Multiplier on gauge targets for one aspect. */
  targetMult?: Partial<Record<AspectId, number>>;
  /** Multiplier on aspect production. */
  prodMult?: Partial<Record<AspectId, number>>;
  /** Overrides the overflow→TU conversion rate for one aspect (1 = full rate). */
  overflowRate?: Partial<Record<AspectId, number>>;
  /** Event frequency multiplier while on this planet. */
  situationFreq?: number;
  /** Bubble frequency multiplier while on this planet. */
  bubbleFreq?: number;
  /** Production penalty on real-world Mondays (0.95 = −5%). */
  mondayMult?: number;
  /** Vogons skip this planet entirely. */
  noVogons?: boolean;
  /** Hint for the renderer. */
  visual?: 'fjords' | 'sentientClouds' | 'reverseSpin' | 'auroras' | 'rings';
}

export const QUIRKS: readonly QuirkDef[] = [
  {
    id: 'mostly-harmless',
    text: 'Mostly harmless.',
    weight: 0, // never rolled; reserved for Earth
  },
  {
    id: 'monday-refusal',
    text: 'Refuses to terraform on Mondays.',
    weight: 8,
    mondayMult: 0.95,
  },
  {
    id: 'award-winning-fjords',
    text: 'Coastline by Slartibartfast. The fjords have won awards.',
    weight: 8,
    prodMult: { bio: 1.1 },
    visual: 'fjords',
  },
  {
    id: 'sentient-clouds',
    text: 'Home to sentient cloud formations. They are mostly pleased with your work.',
    weight: 8,
    overflowRate: { atmo: 1.0 },
    visual: 'sentientClouds',
  },
  {
    id: 'humming',
    text: 'Emits a low, contented hum audible from orbit.',
    weight: 10,
    prodMult: { thermal: 1.05 },
  },
  {
    id: 'reverse-spin',
    text: 'Occasionally reverses its rotation when it thinks nobody is watching.',
    weight: 8,
    visual: 'reverseSpin',
  },
  {
    id: 'improbability-nexus',
    text: 'Sits in a mild improbability current. Odd things drift ashore.',
    weight: 6,
    situationFreq: 1.15,
    bubbleFreq: 1.15,
  },
  {
    id: 'geometric-fondness',
    text: 'Has an inexplicable fondness for geometric patterns.',
    weight: 10,
    prodMult: { hydro: 1.05 },
  },
  {
    id: 'time-tourists',
    text: 'Attracts time travelers, who keep leaving reviews before arriving.',
    weight: 6,
    situationFreq: 1.1,
  },
  {
    id: 'excellent-coffee',
    text: "Produces the sector's best coffee beans, pending the invention of anyone to drink them.",
    weight: 8,
    prodMult: { bio: 1.08 },
  },
  {
    id: 'aurora-habit',
    text: 'Generates celebratory auroras for minor administrative milestones.',
    weight: 8,
    prodMult: { atmo: 1.05 },
    visual: 'auroras',
  },
  {
    id: 'bureaucratic-shadow',
    text: 'Its planning paperwork was lost in transit. Vogons refuse to acknowledge it exists.',
    weight: 4,
    noVogons: true,
  },
  {
    id: 'enjoys-it',
    text: 'Seems to enjoy being terraformed. The ethics committee has been notified.',
    weight: 8,
    prodMult: { thermal: 1.03, atmo: 1.03, hydro: 1.03, bio: 1.03 },
  },
  {
    id: 'pet-asteroid',
    text: 'Has a pet asteroid that follows it around. It has a name. You are not told the name.',
    weight: 8,
    visual: 'rings',
  },
];

export const QUIRK_BY_ID: Record<string, QuirkDef> = Object.fromEntries(
  QUIRKS.map((q) => [q.id, q]),
);
