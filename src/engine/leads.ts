/**
 * Leads — the mysteries that span scales (Phase 5).
 *
 * The shape the spec promised, built exactly once and reusable forever:
 * **rumour → orbit → landing → another world → a Guide entry.** The channel
 * names a delivered world whose ground is humming; landing there and putting
 * an instrument on it names a SECOND world; the second world closes the file
 * — salvage, a chronicle line, and an achievement the Guide is smug about.
 *
 * Machinery notes:
 *  - State rides in `state.flags` (engine-known ids only, like the other
 *    narrative flags). No new save fields; the schema never noticed.
 *  - A lead names only LANDABLE delivered worlds, and dies with the
 *    commission that raised it — the portfolio sells, the trail goes cold.
 *    `doPrestige` calls `clearLead`.
 *  - The resonator itself is the surface's business: it stands a short walk
 *    from wherever the party lands, because the signal is in the ground, and
 *    the ground, on a planet, is famously everywhere.
 */
import { LEAD_CLOSE_LINES, LEAD_FINDING_LINES, LEAD_RUMOUR_LINES, pickFrom } from '../content/subEtha';
import { recordCertFirst } from './certifications';
import type { GameState, SimEffect } from './types';

/** Salvage for closing a lead. The Guide entry is the actual payment. */
export const LEAD_SALVAGE = 40;
/** Odds per ambient broadcast that the channel starts one (no lead open). */
export const LEAD_ODDS = 0.08;
/** Delivered, landable worlds required before the channel bothers. */
export const LEAD_MIN_WORLDS = 3;

const STAGE = 'leadStage';
const WORLD = 'leadWorld';
const WORLD2 = 'leadWorld2';
const SEED = 'leadSeed';
/** Lifetime count of closed leads — the achievement reads it. */
export const LEADS_RESOLVED_FLAG = 'leadsResolved';

export interface LeadState {
  /** 1: the first world is humming. 2: the second world holds the answer. */
  stage: 1 | 2;
  world: number;
  world2: number | null;
  seed: number;
}

export function leadState(state: GameState): LeadState | null {
  const stage = state.flags[STAGE];
  if (stage !== 1 && stage !== 2) return null;
  return {
    stage,
    world: Number(state.flags[WORLD] ?? 0),
    world2: state.flags[WORLD2] !== undefined ? Number(state.flags[WORLD2]) : null,
    seed: Number(state.flags[SEED] ?? 0),
  };
}

/** Is this world the lead's CURRENT question? Returns the stage it answers. */
export function leadTargetAt(state: GameState, lifetimeIndex: number): 1 | 2 | null {
  const lead = leadState(state);
  if (!lead) return null;
  if (lead.stage === 1 && lead.world === lifetimeIndex) return 1;
  if (lead.stage === 2 && lead.world2 === lifetimeIndex) return 2;
  return null;
}

/** The trail goes cold with the portfolio. Called from doPrestige. */
export function clearLead(state: GameState): void {
  delete state.flags[STAGE];
  delete state.flags[WORLD];
  delete state.flags[WORLD2];
  delete state.flags[SEED];
}

function candidates(state: GameState): { lifetimeIndex: number; name: string }[] {
  return state.run.completedPlanets
    .filter((w) => w.type !== 'gasgiant')
    .map((w) => ({ lifetimeIndex: w.lifetimeIndex, name: w.name }));
}

function worldName(state: GameState, lifetimeIndex: number): string {
  return (
    state.run.completedPlanets.find((w) => w.lifetimeIndex === lifetimeIndex)?.name
    ?? `world #${lifetimeIndex}`
  );
}

/**
 * Maybe start a lead. Called by the Sub-Etha's broadcast draw with the
 * channel's own rng; returns the rumour line to file, or null. Sets the
 * flags itself so the rumour and the state can never disagree.
 */
export function maybeSpawnLead(state: GameState, r: () => number): string | null {
  if (leadState(state)) return null;
  const pool = candidates(state);
  if (pool.length < LEAD_MIN_WORLDS) return null;
  const chosen = pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))]!;
  const seed = Math.floor(r() * 0xffffffff);
  state.flags[STAGE] = 1;
  state.flags[WORLD] = chosen.lifetimeIndex;
  state.flags[SEED] = seed;
  return pickFrom(r, LEAD_RUMOUR_LINES)(chosen.name);
}

/**
 * The stay answered the resonator. Stage 1 names the counterpart world;
 * stage 2 closes the file. Deterministic: the counterpart is a seeded pick
 * over the candidates as they stand, excluding the world already visited.
 */
export function advanceLead(
  state: GameState,
  effects: SimEffect[],
  lifetimeIndex: number,
): boolean {
  const lead = leadState(state);
  if (!lead) return false;

  if (lead.stage === 1 && lead.world === lifetimeIndex) {
    const pool = candidates(state).filter((w) => w.lifetimeIndex !== lead.world);
    if (pool.length === 0) return false; // nowhere to point; the hum keeps humming
    const next = pool[lead.seed % pool.length]!;
    state.flags[STAGE] = 2;
    state.flags[WORLD2] = next.lifetimeIndex;
    effects.push({
      t: 'leadAdvanced',
      stage: 2,
      world: next.name,
      text: pickFrom(() => (lead.seed % 97) / 97, LEAD_FINDING_LINES)(next.name),
    });
    return true;
  }

  if (lead.stage === 2 && lead.world2 === lifetimeIndex) {
    const firstName = worldName(state, lead.world);
    clearLead(state);
    state.flags[LEADS_RESOLVED_FLAG] = Number(state.flags[LEADS_RESOLVED_FLAG] ?? 0) + 1;
    state.expedition.salvage += LEAD_SALVAGE;
    recordCertFirst(state, effects, `survey:lead:${lead.seed}`);
    effects.push({
      t: 'leadAdvanced',
      stage: 3,
      world: worldName(state, lifetimeIndex),
      text: pickFrom(() => (lead.seed % 89) / 89, LEAD_CLOSE_LINES)(
        firstName,
        worldName(state, lifetimeIndex),
      ),
    });
    return true;
  }
  return false;
}
