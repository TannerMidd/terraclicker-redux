import type { AspectId } from '../engine/types';

export interface EventDef {
  id: string;
  name: string;
  text: string;
  emoji: string;
  weight: number;
  durationMs: number;
  /** Production multiplier (TU + science). */
  prodMult?: number;
  /** Aspect-specific production multipliers. */
  aspectMult?: Partial<Record<AspectId, number>>;
  clickMult?: number;
  /** Instant payout in seconds of current TU/s. */
  instantSeconds?: number;
}

/** Buff events only — tension belongs to the Vogons (PROGRESSION.md §6). */
export const EVENTS: readonly EventDef[] = [
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    text: 'The local star shows off. Thermal systems apply sunscreen and get to work.',
    emoji: '☀️',
    weight: 8,
    durationMs: 45_000,
    prodMult: 1.5,
    aspectMult: { thermal: 2 },
  },
  {
    id: 'comet-delivery',
    name: 'Comet Delivery',
    text: 'An ice-rich comet arrives, technically on time by cometary standards.',
    emoji: '☄️',
    weight: 7,
    durationMs: 30_000,
    aspectMult: { hydro: 2.5, bio: 1.5 },
    instantSeconds: 30,
  },
  {
    id: 'aurora-storm',
    name: 'Aurora Storm',
    text: 'Electromagnetic curtains supercharge the upper atmosphere. Very photogenic.',
    emoji: '🌌',
    weight: 6,
    durationMs: 60_000,
    aspectMult: { atmo: 2 },
    prodMult: 1.25,
  },
  {
    id: 'meteor-shower',
    name: 'Meteor Shower',
    text: 'Manual terraforming becomes briefly, absurdly effective. Make a wish; bill it.',
    emoji: '🌠',
    weight: 5,
    durationMs: 20_000,
    clickMult: 5,
    prodMult: 1.3,
  },
  {
    id: 'whale-migration',
    name: 'Space Whale Migration',
    text: 'Vast gentle shapes pass by, shedding bio-rich material and existential questions.',
    emoji: '🐋',
    weight: 4,
    durationMs: 40_000,
    aspectMult: { bio: 3 },
    instantSeconds: 40,
  },
  {
    id: 'probability-squall',
    name: 'Probability Squall',
    text: 'For a short while, everything that could go right, does.',
    emoji: '⚡',
    weight: 2,
    durationMs: 15_000,
    prodMult: 2.5,
    clickMult: 2.5,
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e]),
);
