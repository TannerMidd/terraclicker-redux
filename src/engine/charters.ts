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
 * Two articles, drawn from the pool this system's history opened plus the
 * neutral pool, without replacement.
 */
export function charterOffersFor(state: GameState, index: number): string[] {
  const character = systemCharacter(state, index);
  const pool = CHARTERS
    .filter((c) => c.when === 'always' || c.when === character)
    // A weighting rather than a filter: an article the history specifically
    // opened should usually be on the table, without ever being the only
    // thing on it.
    .map((c) => ({ c, weight: c.when === character ? 3 : 1 }));

  const offered: string[] = [];
  for (let i = 0; i < CHARTER_OFFER_COUNT && pool.length > 0; i++) {
    const picked = pickWeighted(state.rng, 'situations', pool);
    offered.push(picked.c.id);
    pool.splice(pool.indexOf(picked), 1);
  }
  return offered;
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
