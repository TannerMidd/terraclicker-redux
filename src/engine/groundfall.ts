/**
 * Groundfall rules: what may be landed on, and what a shore party is worth.
 *
 * The scene owns terrain, boots and plasma; this file owns the ledger. It
 * follows the flight economy's oldest seal (see engine/freight.ts): samples
 * become salvage and salvage only, so a player who never leaves the desk
 * loses nothing, and a player who walks a world they are terraforming gets
 * paid in the currency of going outside.
 */
import { C } from '../content/constants';
import {
  ensureGroundWorld,
  groundYield,
  recordSiteOutcome,
  surveyCredit,
} from './groundSites';
import type {
  GameState,
  GroundSiteOutcome,
  PlanetType,
  SampleHaul,
  SimEffect,
} from './types';

/** Worlds you can stand on. A gas giant declines to provide a floor. */
export function isLandableType(type: PlanetType): boolean {
  return type !== 'gasgiant';
}

/** The Guide's reason, when the answer is no. */
export function landingRefusal(type: PlanetType): string | null {
  if (type === 'gasgiant') return 'no solid surface — the Guide advises against';
  return null;
}

/** Stable ground-survey key for a world across its whole career. */
export function groundKey(lifetimeIndex: number): string {
  return `w${lifetimeIndex}`;
}

export function isGroundSurveyed(state: Pick<GameState, 'expedition'>, worldKey: string): boolean {
  return state.expedition.groundWorlds[worldKey]?.surveyedAtMs != null;
}

/** What a returning shore party is owed, before it is paid. Pure. */
export function groundReturnValue(
  state: Pick<GameState, 'expedition'>,
  worldKey: string,
  haul: readonly SampleHaul[],
  preserved = 0,
): { salvage: number; firstSurvey: boolean; newKinds: string[]; capped: boolean } {
  // A survey is a real piece of work: enough attention paid to say something
  // about the world, banked in one landing. Precision cores count double;
  // a seam deliberately preserved counts too.
  const firstSurvey =
    surveyCredit(haul, preserved) >= C.GROUND_SURVEY_SAMPLES &&
    !isGroundSurveyed(state, worldKey);
  const value = groundYield(
    state.expedition.groundWorlds[worldKey],
    haul,
    firstSurvey ? C.GROUND_SURVEY_BONUS : 0,
  );
  return {
    salvage: value.salvage,
    firstSurvey,
    newKinds: value.newKinds,
    capped: value.capped,
  };
}

/**
 * Bank a shore party: the haul becomes salvage, the sites become the world's
 * memory, and the landing becomes a visit. An empty-handed boarding with
 * nothing to report is still allowed to be uneventful — the visit is counted
 * and no effect is raised.
 */
export function bankGroundSamples(
  state: GameState,
  effects: SimEffect[],
  worldKey: string,
  worldName: string,
  haul: readonly SampleHaul[],
  sites: Record<string, GroundSiteOutcome> = {},
): void {
  const record = ensureGroundWorld(state, worldKey);
  record.visits += 1;

  const cleaned = haul.filter((h) => h.n > 0);
  const outcomes = Object.entries(sites);
  const preserved = outcomes.filter(([, o]) => o === 'preserved').length;
  const value = groundReturnValue(state, worldKey, cleaned, preserved);

  for (const [siteId, outcome] of outcomes) {
    recordSiteOutcome(record, siteId, outcome, state.gameTimeMs);
  }
  for (const h of cleaned) {
    if (record.samples[h.kind] === undefined) record.samples[h.kind] = state.gameTimeMs;
  }

  const n = cleaned.reduce((sum, h) => sum + h.n, 0);
  if (n <= 0 && !value.firstSurvey && outcomes.length === 0) return;

  state.expedition.salvage += value.salvage;
  record.salvagePaid += value.salvage;
  if (value.firstSurvey) record.surveyedAtMs = state.gameTimeMs;
  if (n <= 0 && !value.firstSurvey) return;

  effects.push({
    t: 'groundReturn',
    worldKey,
    name: worldName,
    samples: n,
    salvage: value.salvage,
    firstSurvey: value.firstSurvey,
    newKinds: value.newKinds,
    capped: value.capped,
  });
}
