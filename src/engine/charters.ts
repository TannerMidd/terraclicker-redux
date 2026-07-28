/**
 * System Charters — the engine side. See content/charters.ts for what they are.
 *
 * The rule that makes a Charter worth having: **which articles are offered is
 * read from the five worlds' own histories.** A system that was answered is
 * offered different articles from one that was left alone. The choice is a
 * consequence of how the commission was played, not a menu that happens to
 * appear when a counter reaches five.
 *
 * That reading is what the world record store was built for, and it is why
 * Charters waited until after it existed rather than inventing a parallel
 * record of the same facts.
 */
import { CHARTERS, CHARTER_BY_ID, CHARTER_OFFER_COUNT, type CharterDef } from '../content/charters';
import { C } from '../content/constants';
import { pickWeighted } from './rng';
import { worldRecord } from './worldRecords';
import type { AspectId, GameState } from './types';

/** The five worlds of system `index`, as records where they exist. */
export function systemWorlds(state: GameState, index: number) {
  const first = index * C.PLANETS_PER_SYSTEM;
  return state.run.completedPlanets
    .slice(first, first + C.PLANETS_PER_SYSTEM)
    .map((w) => worldRecord(state, w.lifetimeIndex))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * The kinds of field practice that can become part of a system's identity.
 *
 * More than one may apply. That matters: a system can be carefully charted
 * and heavily prospected, and Charter offers should be able to remember both
 * facts rather than flattening five worlds into one verdict.
 */
export type SystemFieldSignal = 'charted' | 'stewarded' | 'waymarked' | 'prospected';

/**
 * Read-only field facts behind a system's Charter weighting. Exposed so the
 * Guide and tests can explain why an article was on the table without storing
 * a second, fallible summary in the save.
 */
export interface SystemFieldProfile {
  visitedWorlds: number;
  surveyedWorlds: number;
  sampleKinds: number;
  speciesKinds: number;
  preservedSites: number;
  prospectedSites: number;
  workedSites: number;
  marks: number;
  repairs: number;
  signals: readonly SystemFieldSignal[];
}

/**
 * What the five worlds remember about field work done across them.
 *
 * A single very busy landing does not define a whole system. Each signal
 * needs evidence from at least two member worlds as well as enough total
 * practice to be legible. Ground play therefore authors character without
 * becoming a prerequisite for forming or chartering a system.
 */
export function systemFieldProfile(state: GameState, index: number): SystemFieldProfile {
  const first = index * C.PLANETS_PER_SYSTEM;
  const worlds = state.run.completedPlanets.slice(first, first + C.PLANETS_PER_SYSTEM);

  let visitedWorlds = 0;
  let surveyedWorlds = 0;
  let sampleKinds = 0;
  let speciesKinds = 0;
  let preservedSites = 0;
  let prospectedSites = 0;
  let workedSites = 0;
  let marks = 0;
  let repairs = 0;

  let chartedWorlds = 0;
  let stewardedWorlds = 0;
  let waymarkedWorlds = 0;
  let prospectedWorlds = 0;

  for (const world of worlds) {
    // Ground records deliberately use this stable lifetime key. Repeating the
    // tiny format here avoids importing groundfall -> situations -> charters.
    const ground = state.expedition.groundWorlds[`w${world.lifetimeIndex}`];
    const samplesHere = Object.keys(ground?.samples ?? {}).length;
    const speciesHere = Object.keys(ground?.species ?? {}).length;
    const sites = Object.values(ground?.sites ?? {});
    const preservedHere = sites.filter((site) => site.s === 'preserved').length;
    const prospectedHere = sites.filter((site) => site.s === 'prospected').length;
    const workedHere = sites.filter((site) => site.s === 'worked').length;
    const marksHere = ground?.marks.length ?? 0;
    const repairsHere =
      worldRecord(state, world.lifetimeIndex)?.history
        .filter((event) => event.kind === 'repairMade').length ?? 0;

    if ((ground?.visits ?? 0) > 0) visitedWorlds += 1;
    if (ground?.surveyedAtMs != null) surveyedWorlds += 1;
    sampleKinds += samplesHere;
    speciesKinds += speciesHere;
    preservedSites += preservedHere;
    prospectedSites += prospectedHere;
    workedSites += workedHere;
    marks += marksHere;
    repairs += repairsHere;

    if (ground?.surveyedAtMs != null || samplesHere + speciesHere > 0) chartedWorlds += 1;
    if (preservedHere + speciesHere + repairsHere > 0) stewardedWorlds += 1;
    if (marksHere + repairsHere > 0) waymarkedWorlds += 1;
    if (prospectedHere + workedHere + samplesHere > 0) prospectedWorlds += 1;
  }

  const signals: SystemFieldSignal[] = [];
  const chartedScore = surveyedWorlds * 3 + sampleKinds + speciesKinds;
  const stewardedScore = preservedSites * 2 + speciesKinds + repairs * 2;
  const waymarkedScore = marks + repairs;
  const prospectedScore = prospectedSites * 2 + workedSites * 2 + sampleKinds;

  if (chartedWorlds >= 2 && chartedScore >= 6) signals.push('charted');
  if (stewardedWorlds >= 2 && stewardedScore >= 5) signals.push('stewarded');
  if (waymarkedWorlds >= 2 && waymarkedScore >= 3) signals.push('waymarked');
  if (prospectedWorlds >= 2 && prospectedScore >= 6) signals.push('prospected');

  return {
    visitedWorlds,
    surveyedWorlds,
    sampleKinds,
    speciesKinds,
    preservedSites,
    prospectedSites,
    workedSites,
    marks,
    repairs,
    signals,
  };
}

/**
 * What kind of system this turned out to be, from what actually happened to
 * its worlds. Ties fall to `always`, which is the neutral pool.
 */
export function systemCharacter(
  state: GameState,
  index: number,
): 'attended' | 'neglected' | 'engineered' | 'always' {
  const worlds = systemWorlds(state, index);
  if (worlds.length === 0) return 'always';

  let answered = 0;
  let ignored = 0;
  let installations = 0;
  for (const w of worlds) {
    for (const e of w.history) {
      if (e.kind === 'petitionAnswered') answered += 1;
      if (e.kind === 'petitionIgnored') ignored += 1;
    }
    installations += w.installationCount;
  }

  if (ignored > answered && ignored > 0) return 'neglected';
  if (answered > ignored && answered > 0) return 'attended';
  if (installations / worlds.length >= 6) return 'engineered';
  return 'always';
}

/**
 * Existing articles whose language and downstream Accord already fit each
 * kind of field-authored system. Reusing them keeps every Charter legible to
 * the Galaxy Network instead of creating ground-only articles that become
 * dead votes later.
 */
const FIELD_AFFINITY: Readonly<Partial<Record<string, readonly SystemFieldSignal[]>>> = {
  'mutual-aid': ['stewarded', 'waymarked'],
  'open-correspondence': ['waymarked'],
  'salvage-rights': ['prospected'],
  'works-committee': ['prospected', 'waymarked'],
  observatory: ['charted'],
  'thermal-compact': ['prospected'],
  'water-board': ['stewarded'],
};

export interface CharterOfferWeight {
  id: string;
  weight: number;
  /** The ordinary petition/build history opened this article. */
  characterMatch: boolean;
  /** Field signals that opened or strengthened this article. */
  fieldSignals: readonly SystemFieldSignal[];
}

/**
 * The complete weighted offer pool, including the reasons behind each entry.
 * Neutral articles remain in every pool. With no qualifying field practice,
 * this is exactly the pre-expedition Charter weighting.
 */
export function charterOfferWeightsFor(state: GameState, index: number): CharterOfferWeight[] {
  const character = systemCharacter(state, index);
  const activeSignals = new Set(systemFieldProfile(state, index).signals);

  return CHARTERS.flatMap((charter) => {
    const characterMatch = charter.when !== 'always' && charter.when === character;
    const fieldSignals = (FIELD_AFFINITY[charter.id] ?? [])
      .filter((signal) => activeSignals.has(signal));
    if (charter.when !== 'always' && !characterMatch && fieldSignals.length === 0) return [];

    // Preserve the original 3:1 history weighting, then let each independent
    // field signal add weight. A field-opened article starts at the same 3
    // that a history-opened one did; overlapping evidence strengthens it.
    const originalWeight = charter.when === character ? 3 : 1;
    const weight = originalWeight + fieldSignals.length * 2;
    return [{ id: charter.id, weight, characterMatch, fieldSignals }];
  });
}

/**
 * Two articles, drawn from the pool this system's history opened plus the
 * neutral pool and any field-authored affinities, without replacement.
 */
export function charterOffersFor(state: GameState, index: number): string[] {
  const pool = charterOfferWeightsFor(state, index)
    .map((entry) => ({
      c: CHARTER_BY_ID[entry.id]!,
      weight: entry.weight,
      fieldSignals: entry.fieldSignals,
    }));

  const offered: string[] = [];
  for (let i = 0; i < CHARTER_OFFER_COUNT && pool.length > 0; i++) {
    // Once a system has authored a legible field identity, put at least one
    // compatible article on the table. Weight still decides which one.
    const fieldPool = i === 0 ? pool.filter((entry) => entry.fieldSignals.length > 0) : [];
    const picked = pickWeighted(state.rng, 'situations', fieldPool.length > 0 ? fieldPool : pool);
    offered.push(picked.c.id);
    pool.splice(pool.indexOf(picked), 1);
  }
  return offered;
}

/** Compact identity used to detect a real post-formation change without churn. */
export function charterOfferSignature(state: GameState, index: number): string {
  return `${systemCharacter(state, index)}|${[...systemFieldProfile(state, index).signals].sort().join(',')}`;
}

/** Refresh an unsigned table only when verified system character actually changed. */
export function refreshUnsignedCharterOffers(
  state: GameState,
  index: number,
  previousSignature: string,
): boolean {
  const key = String(index);
  if (state.run.charters[key] !== undefined || state.run.charterOffers[key] === undefined) return false;
  if (charterOfferSignature(state, index) === previousSignature) return false;
  state.run.charterOffers[key] = charterOffersFor(state, index);
  return true;
}
/** File an article against a system. One per system, once, from its offers. */
export function signCharter(state: GameState, index: number, id: string): boolean {
  const key = String(index);
  if (state.run.charters[key] !== undefined) return false;
  if (!(state.run.charterOffers[key] ?? []).includes(id)) return false;
  if (!CHARTER_BY_ID[id]) return false;
  state.run.charters[key] = id;
  delete state.run.charterOffers[key];
  return true;
}

/** Every article currently in force across the commission. */
export function activeCharters(state: GameState): CharterDef[] {
  return Object.values(state.run.charters)
    .map((id) => CHARTER_BY_ID[id])
    .filter((c): c is CharterDef => c !== undefined);
}

/** Multipliers the economy folds in. All neutral with nothing signed. */
export function charterEffects(state: GameState): {
  prodMult: number;
  scienceMult: number;
  aspectMult: Record<AspectId, number>;
  petitionFocus: number;
} {
  const out = {
    prodMult: 1,
    scienceMult: 1,
    aspectMult: { thermal: 1, atmo: 1, hydro: 1, bio: 1 } as Record<AspectId, number>,
    petitionFocus: 1,
  };
  for (const def of activeCharters(state)) {
    switch (def.effect.kind) {
      case 'prodMult':
        out.prodMult *= def.effect.v;
        break;
      case 'scienceMult':
        out.scienceMult *= def.effect.v;
        break;
      case 'aspectMult':
        out.aspectMult[def.effect.aspect] *= def.effect.v;
        break;
      case 'petitionFocus':
        out.petitionFocus *= def.effect.v;
        break;
      case 'standingFloor':
        break; // read directly by the standing rules
    }
  }
  return out;
}

/**
 * The standing floor a world inherits from its system's charter, or null.
 *
 * This is the one Charter effect that is not a multiplier, and it is the most
 * interesting one: a system can agree that it will not be allowed to fall
 * below a certain regard for you, whatever else happens.
 */
export function charterStandingFloor(state: GameState, lifetimeIndex: number): number | null {
  const position = state.run.completedPlanets.findIndex((w) => w.lifetimeIndex === lifetimeIndex);
  if (position < 0) return null;
  const id = state.run.charters[String(Math.floor(position / C.PLANETS_PER_SYSTEM))];
  const def = id ? CHARTER_BY_ID[id] : undefined;
  return def?.effect.kind === 'standingFloor' ? def.effect.v : null;
}
