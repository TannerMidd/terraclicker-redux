/**
 * The Sub-Etha: what the universe says while you are getting on with things.
 *
 * Two kinds of traffic share the channel. **Chronicle** entries are filed by
 * the simulation when something actually happens (a world delivered, a
 * contract closed, a contact resolved) — those are written where the event is
 * raised. **Ambient** entries are the ones here: unprompted chatter from your
 * own colonies, the Guide's editors, Vogon administration, freight, and
 * hitchhikers, plus the one category that does real work — RUMOURS, which
 * name an undiscovered Deep Field landmark and roughly where it is.
 *
 * Everything is a pure function of state and one seeded draw, so the feed is
 * identical whether it was generated while you watched or while you were out.
 *
 * Tone rule, as everywhere: dry documentation. The joke is that this is all
 * being filed correctly.
 */
import type { GameState } from '../engine/types';

export type SubEthaKind =
  | 'colony'
  | 'guide'
  | 'vogon'
  | 'trade'
  | 'hitchhiker'
  | 'rumour'
  | 'chronicle';

/** A draw in [0,1) — bound to the save's `subetha` stream by the caller. */
export type Draw = () => number;

export interface BroadcastTemplate {
  id: string;
  kind: SubEthaKind;
  /** Relative frequency within the eligible set. */
  weight: number;
  /** Offered only when this holds. Absent means always eligible. */
  when?: (s: GameState) => boolean;
  /** The line. Must be deterministic given `s` and the draws taken from `r`. */
  text: (s: GameState, r: Draw) => string;
}

// ————— Small deterministic helpers —————

export function pickFrom<T>(r: Draw, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(r() * list.length))]!;
}

/** A delivered world, or null on a fresh commission. */
function someWorld(s: GameState, r: Draw): string | null {
  const worlds = s.run.completedPlanets;
  if (worlds.length === 0) return null;
  return pickFrom(r, worlds).name;
}

const hasWorlds = (s: GameState) => s.run.completedPlanets.length > 0;
const hasSystems = (s: GameState) => s.run.systems > 0;

const ASPECT_WORD = ['thermal', 'atmospheric', 'hydrological', 'biotic'] as const;
const FACTION_WORD = ['Magrathea', 'the mice', 'the Vogon clerks'] as const;

// ————— The ambient channel —————

export const BROADCASTS: readonly BroadcastTemplate[] = [
  // — Your own colonies, being alive at you —
  {
    id: 'colony-rename',
    kind: 'colony',
    weight: 3,
    when: hasWorlds,
    // One world, named twice — drawing twice would have it appeal on behalf
    // of a completely different planet, which is a worse joke.
    text: (s, r) => {
      const world = someWorld(s, r);
      return `${world} has applied to rename itself. The application has been refused, and ${world} has appealed.`;
    },
  },
  {
    id: 'colony-queue',
    kind: 'colony',
    weight: 2,
    when: hasWorlds,
    text: (s, r) =>
      `Traffic control at ${someWorld(s, r)} reports a queue. There is nothing to queue for. The queue has been there four days and is extremely well organised.`,
  },
  {
    id: 'colony-spec',
    kind: 'colony',
    weight: 3,
    when: hasWorlds,
    text: (s, r) =>
      `The ${pickFrom(r, ASPECT_WORD)} regulators on ${someWorld(s, r)} are running two percent over specification. Nobody has complained, which the engineers find sinister.`,
  },
  {
    id: 'colony-protest',
    kind: 'colony',
    weight: 2,
    when: hasWorlds,
    text: (s, r) =>
      `${someWorld(s, r)} wishes it noted that it was terraformed under protest and is, regrettably, thriving.`,
  },
  {
    id: 'colony-sunset',
    kind: 'colony',
    weight: 2,
    when: hasWorlds,
    text: (s, r) =>
      `A dispute on ${someWorld(s, r)} over whether the sunsets are "too much". Both sides have submitted photographs. Both sides are correct.`,
  },
  {
    id: 'colony-late',
    kind: 'colony',
    weight: 2,
    when: hasWorlds,
    text: (s, r) =>
      `${someWorld(s, r)} reports its first recorded instance of somebody being late for something. Civilisation is now considered established.`,
  },
  {
    id: 'colony-weather',
    kind: 'colony',
    weight: 2,
    when: hasWorlds,
    text: (s, r) =>
      `Weather on ${someWorld(s, r)}: as commissioned. The inhabitants have begun to describe this as "boring", which is the highest compliment terraforming receives.`,
  },

  // — The Guide's editorial department —
  {
    id: 'guide-revise',
    kind: 'guide',
    weight: 3,
    when: hasWorlds,
    text: (s, r) =>
      `The Guide has revised its entry on ${someWorld(s, r)} from "promising" to "adequate", citing new information and an old grudge.`,
  },
  {
    id: 'guide-outdated',
    kind: 'guide',
    weight: 2,
    text: () =>
      'The Guide notes that its entry on planetary construction is out of date, and has been since the day it was written.',
  },
  {
    id: 'guide-tense',
    kind: 'guide',
    weight: 2,
    text: () =>
      'Editorial notice: the Guide will no longer accept field reports written entirely in the future tense.',
  },
  {
    id: 'guide-company',
    kind: 'guide',
    weight: 2,
    text: () =>
      'The Guide\'s entry on your company now runs to two lines. The second is an apology for the first.',
  },
  {
    id: 'guide-mostly',
    kind: 'guide',
    weight: 1,
    text: () =>
      'A subeditor has attempted to expand the entry "mostly harmless". The expansion has been reviewed, praised, and cut.',
  },

  // — Vogon administration, grinding on —
  {
    id: 'vogon-notice',
    kind: 'vogon',
    weight: 2,
    text: () =>
      'Vogon Constructor Fleet files a routine notice of intent. The notice does not specify intent to do what.',
  },
  {
    id: 'vogon-bypass',
    kind: 'vogon',
    weight: 2,
    text: () =>
      'Shipping advisory: a hyperspace bypass survey is in progress somewhere in this sector. The survey has been in progress for eleven years.',
  },
  {
    id: 'vogon-form',
    kind: 'vogon',
    weight: 2,
    text: () =>
      'Form 27B-6 has been returned to you marked "insufficiently completed". Form 27B-6 has no fields.',
  },
  {
    id: 'vogon-recital',
    kind: 'vogon',
    weight: 1,
    text: () =>
      'A poetry recital has been scheduled, announced, and then — following representations from every species within range — rescheduled.',
  },

  // — Freight and the people you work for —
  {
    id: 'trade-rates',
    kind: 'trade',
    weight: 2,
    when: hasSystems,
    text: (s, r) =>
      `Freight rates out of system ${1 + Math.floor(r() * s.run.systems)} are down. Nobody is entirely sure what they were down from.`,
  },
  {
    id: 'trade-packaging',
    kind: 'trade',
    weight: 2,
    when: hasSystems,
    text: (_s, r) =>
      `Receipt of your last consignment is confirmed by ${pickFrom(r, FACTION_WORD)}, who would like, at some point, to discuss the packaging.`,
  },
  {
    id: 'trade-early',
    kind: 'trade',
    weight: 1,
    when: hasSystems,
    text: (s, r) =>
      `A hauler on the system ${1 + Math.floor(r() * s.run.systems)} run reports arriving before it departed. Accounts are looking into it and would rather not.`,
  },
  {
    id: 'trade-manifest',
    kind: 'trade',
    weight: 2,
    when: hasSystems,
    text: () =>
      'A manifest has been filed listing one item, described as "the usual". Customs has cleared it without comment.',
  },

  // — Hitchhikers —
  {
    id: 'hitch-sign',
    kind: 'hitchhiker',
    weight: 2,
    when: hasSystems,
    text: (s, r) =>
      `Somebody at the edge of system ${1 + Math.floor(r() * s.run.systems)} is holding up a sign. The sign says ANYWHERE.`,
  },
  {
    id: 'hitch-nowhere',
    kind: 'hitchhiker',
    weight: 2,
    text: () =>
      'A hitchhiker reports being picked up by a ship that was not going anywhere in particular, and enjoying the trip enormously.',
  },
  {
    id: 'hitch-thumb',
    kind: 'hitchhiker',
    weight: 2,
    text: () =>
      'Lost property: one electronic thumb, well used. The owner describes it as "the important one".',
  },
  {
    id: 'hitch-towel',
    kind: 'hitchhiker',
    weight: 1,
    text: () =>
      'A traveller has been refused passage for not carrying a towel. The traveller is appealing on the grounds that they did not know. This is considered to be the point.',
  },
];

// ————— Chronicle copy (the simulation filing its own events) —————

export const CHRONICLE = {
  planetDelivered: (name: string) =>
    `${name} is delivered and inhabited. The first complaint is expected within the hour.`,
  systemFormed: (n: number) =>
    `System ${n} has closed its final commission: five worlds, one star, and a quite extraordinary volume of paperwork.`,
  galaxyFormed: (n: number) =>
    `Galaxy ${n} has organised itself into a spiral. Gravity is taking the credit and will not be talked out of it.`,
  researchDone: (name: string) => `Research filed and shelved: ${name}.`,
  contractCompleted: (faction: string) =>
    `${faction} has accepted the work and paid without argument, which is itself worth recording.`,
  contractFailed: (faction: string) =>
    `${faction} has withdrawn the filing. No reason was given, and none is expected.`,
  siteScanned: (name: string) =>
    `Contact resolved: ${name}. The Guide has written it up and filed it under things that were already there.`,
  siteBoarded: (name: string, salvage: number) =>
    `Boarded ${name}. ${salvage} units of salvage recovered, logged, and immediately spoken for.`,
  prestiged: () =>
    'The portfolio is sold. Magrathea sends its regards, a fresh planet, and no forwarding address.',
  vogonStart: () =>
    'A Vogon vessel has begun to read aloud on an open channel. Take whatever cover is available.',
  towel: () => 'A towel has entered your possession. The Guide considers the matter settled.',
} as const;

// ————— Rumours (the category that does real work) —————

/** Shipping-lane vocabulary for a direction. Deliberately not compass points. */
export const BEARINGS = ['coreward', 'rimward', 'spinward', 'trailing'] as const;

export const RUMOUR_LINES: readonly ((
  contact: string,
  bearing: string,
  dist: number,
) => string)[] = [
  (contact, bearing, dist) =>
    `A freighter crew reports something ${bearing}, about ${dist} units out, which they describe only as "${contact}". They declined to go closer.`,
  (contact, bearing, dist) =>
    `Filed under unverified: "${contact}", roughly ${dist} units ${bearing}. The filer has asked not to be contacted again.`,
  (_contact, bearing, dist) =>
    `Navigation warns of an uncharted return ${bearing} at approximately ${dist} units. It has been there considerably longer than the chart has.`,
  (contact, bearing, dist) =>
    `Second-hand, and the Guide stresses second-hand: "${contact}", ${dist} units ${bearing}, sitting perfectly still and minding its own business.`,
];
