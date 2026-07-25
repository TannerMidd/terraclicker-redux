/**
 * Commission Dossiers — the engine side. See content/dossiers.ts for what they
 * are and why every run needed one.
 *
 * Three rules this file keeps:
 *
 * 1. **Deterministic.** Which three briefs are filed comes from the `planets`
 *    stream at the moment of the sale, so the same universe always offers the
 *    same choice (engine law #1).
 * 2. **One at a time, for a whole commission.** A dossier is accepted once and
 *    holds until the portfolio is sold. It lives in `run`, and goes with it.
 * 3. **Exactly the four effects it advertises.** A brief that quietly did a
 *    fifth thing would make the difference between commissions a fog rather
 *    than a decision, which is the problem dossiers exist to solve.
 */
import { DOSSIERS, DOSSIER_BY_ID, DOSSIER_OFFER_COUNT, type DossierDef } from '../content/dossiers';
import { pickWeighted } from './rng';
import type { GameState, PlanetType } from './types';

/** The brief currently in force, or null before one has been accepted. */
export function activeDossier(state: GameState): DossierDef | null {
  const id = state.run.dossier;
  return id === null ? null : (DOSSIER_BY_ID[id] ?? null);
}

/**
 * File three briefs. Drawn without replacement so the choice is always between
 * three genuinely different commissions rather than the same one twice.
 */
export function offerDossiers(state: GameState): string[] {
  const pool = DOSSIERS.map((d) => ({ d, weight: 1 }));
  const offered: string[] = [];
  for (let i = 0; i < DOSSIER_OFFER_COUNT && pool.length > 0; i++) {
    const picked = pickWeighted(state.rng, 'planets', pool);
    offered.push(picked.d.id);
    pool.splice(pool.indexOf(picked), 1);
  }
  return offered;
}

/** Accept a brief. Only one of the three actually on offer, and only once. */
export function acceptDossier(state: GameState, id: string): boolean {
  if (state.run.dossier !== null) return false;
  if (!state.run.dossierOffers.includes(id)) return false;
  if (!DOSSIER_BY_ID[id]) return false;
  state.run.dossier = id;
  state.run.dossierOffers = [];
  return true;
}

/**
 * Planet type weighting for this commission.
 *
 * Multiplies the base weights rather than replacing them, so a dossier shifts
 * the odds without ever making a type impossible — a "luxury ocean portfolio"
 * that could never produce anything but oceans stops being a portfolio.
 */
export function dossierPlanetWeight(state: GameState, type: PlanetType): number {
  const def = activeDossier(state);
  return def?.planetWeights?.[type] ?? 1;
}

/** Multipliers the economy folds in. All 1 when no brief is in force. */
export function dossierEffects(state: GameState): {
  prodMult: number;
  scienceMult: number;
  costMult: number;
  headStart: number;
  completionMult: number;
} {
  const none = { prodMult: 1, scienceMult: 1, costMult: 1, headStart: 0, completionMult: 1 };
  const def = activeDossier(state);
  if (!def) return none;
  switch (def.rule.kind) {
    case 'prodMult':
      return { ...none, prodMult: def.rule.v };
    case 'scienceMult':
      return { ...none, scienceMult: def.rule.v };
    case 'costMult':
      return { ...none, costMult: def.rule.v };
    case 'headStart':
      return { ...none, headStart: def.rule.v };
    case 'completionMult':
      return { ...none, completionMult: def.rule.v };
  }
}

/**
 * How the brief changes the terms of the sale.
 *
 * Clamped so no combination of dossier and commission count can ever ask for
 * fewer than one system — an appraisal that accepts nothing is not a terms
 * change, it is a broken game.
 */
export function dossierSystemsDelta(state: GameState): number {
  return activeDossier(state)?.systemsDelta ?? 0;
}

/** Whether a contract template is one this commission's board favours. */
export function dossierFavours(state: GameState, templateId: string): boolean {
  const def = activeDossier(state);
  return def?.contractBias?.includes(templateId as never) ?? false;
}
