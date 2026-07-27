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
import type { GameState, PlanetType, SimEffect } from './types';

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
  return state.expedition.ground[worldKey] !== undefined;
}

/** Salvage a returning shore party is owed, before it is paid. */
export function groundReturnValue(
  state: Pick<GameState, 'expedition'>,
  worldKey: string,
  samples: number,
): { salvage: number; firstSurvey: boolean } {
  // A survey is a real piece of work: enough samples to say something about
  // the world, banked in one landing. Fewer still pay per sample.
  const firstSurvey =
    samples >= C.GROUND_SURVEY_SAMPLES && !isGroundSurveyed(state, worldKey);
  return {
    salvage: samples * C.GROUND_SAMPLE_SALVAGE + (firstSurvey ? C.GROUND_SURVEY_BONUS : 0),
    firstSurvey,
  };
}

/**
 * Bank a shore party's samples. Zero samples still records nothing and pays
 * nothing — boarding empty-handed is allowed to be uneventful.
 */
export function bankGroundSamples(
  state: GameState,
  effects: SimEffect[],
  worldKey: string,
  worldName: string,
  samples: number,
): void {
  const n = Math.max(0, Math.floor(samples));
  if (n <= 0) return;
  const value = groundReturnValue(state, worldKey, n);
  state.expedition.salvage += value.salvage;
  if (value.firstSurvey) {
    state.expedition.ground[worldKey] = state.gameTimeMs;
  }
  effects.push({
    t: 'groundReturn',
    worldKey,
    name: worldName,
    samples: n,
    salvage: value.salvage,
    firstSurvey: value.firstSurvey,
  });
}
