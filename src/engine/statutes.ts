/**
 * Universe statutes — the engine side. See content/statutes.ts.
 *
 * The property that makes a statute different from everything else in the
 * game: **it survives prestige.** Blueprints survive, monuments survive, the
 * archive survives — and now the law does. That is the whole reason the
 * largest scale is worth reaching, and it is why `lifetime.statutes` sits
 * outside `run` with the other permanent things.
 *
 * One statute per stage, chosen once. There is deliberately no way to repeal
 * one: a law you can undo is a menu, and the point of legislating at this
 * scale is that you have to live in the universe you voted for.
 */
import { STAGE_GALAXIES, STATUTES, STATUTE_BY_ID, type StatuteDef } from '../content/statutes';
import type { GameState, SimEffect } from './types';

/** Highest stage the universe has reached, 0 if none. */
export function universeStage(state: GameState): 0 | 1 | 2 | 3 {
  const best = state.lifetime.bestGalaxies;
  if (best >= STAGE_GALAXIES[3]) return 3;
  if (best >= STAGE_GALAXIES[2]) return 2;
  if (best >= STAGE_GALAXIES[1]) return 1;
  return 0;
}

export function enactedStatutes(state: GameState): StatuteDef[] {
  return state.lifetime.statutes
    .map((id) => STATUTE_BY_ID[id])
    .filter((d): d is StatuteDef => d !== undefined);
}

/** Which acts may be put before the house right now. */
export function statuteOffers(state: GameState): StatuteDef[] {
  const stage = universeStage(state);
  if (stage === 0) return [];
  const enacted = new Set(state.lifetime.statutes);
  // One per stage: a stage whose act has been passed offers nothing further.
  const stagesUsed = new Set(enactedStatutes(state).map((d) => d.stage));
  return STATUTES.filter(
    (d) => d.stage <= stage && !enacted.has(d.id) && !stagesUsed.has(d.stage),
  );
}

export function enactStatute(state: GameState, effects: SimEffect[], id: string): boolean {
  if (!statuteOffers(state).some((d) => d.id === id)) return false;
  state.lifetime.statutes.push(id);
  effects.push({ t: 'statuteEnacted', id });
  return true;
}

/**
 * Everything the law currently does. Neutral before anything is passed, which
 * is every universe until its first galaxy.
 */
export function statuteEffects(state: GameState): {
  situationFreq: number;
  offlineCapAddMs: number;
  headStart: number;
  appraisalEasier: number;
  sensors: number;
} {
  const out = {
    situationFreq: 1,
    offlineCapAddMs: 0,
    headStart: 0,
    appraisalEasier: 0,
    sensors: 1,
  };
  for (const def of enactedStatutes(state)) {
    switch (def.effect.kind) {
      case 'situationFreq':
        out.situationFreq *= def.effect.v;
        break;
      case 'offlineCapAddMs':
        out.offlineCapAddMs += def.effect.v;
        break;
      case 'headStart':
        out.headStart += def.effect.v;
        break;
      case 'appraisalEasier':
        out.appraisalEasier += def.effect.v;
        break;
      case 'sensors':
        out.sensors *= def.effect.v;
        break;
    }
  }
  return out;
}
