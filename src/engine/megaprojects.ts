/**
 * Megaprojects — commissioned once, built over days, kept forever.
 *
 * Two behaviours here break rules that hold everywhere else in the engine,
 * and both breakages are the feature:
 *
 * 1. **They build OFFLINE, at full rate.** Every other spawn in this game is
 *    suppressed while the tab is closed, because those are rewards and an
 *    unwatched reward is just a number going up. A megaproject is the
 *    opposite: its entire purpose is to be the thing that happened while you
 *    were gone. It also ignores `offlineEfficiency` — a construction crew
 *    does not work at 60% because nobody is looking at them.
 *
 *    This was documented here long before it was true. `stepMegaprojects` ran
 *    only inside `step()`, and `stepOffline` capped the span it simulated at
 *    eight hours, so an eighteen-hour monument could not be finished by an
 *    eighteen-hour absence however patient the player was. Construction is now
 *    credited through engine/deferred.ts, which is paid in real elapsed time
 *    and answers to neither the cap nor the efficiency multiplier. The salvage
 *    a finished project yields is *not* routed there: that is unbounded income
 *    and stays capped like TU.
 *
 * 2. **They survive prestige.** `state.megaprojects` deliberately sits
 *    outside `run`. Magrathea buys the portfolio; it does not buy the
 *    monuments. This is the only permanent thing a player can build, which is
 *    what makes it worth eighteen hours.
 *
 * Construction is credited in ms of real time, so the same elapsed span
 * always yields the same progress however it is chunked (engine law #1).
 */
import { MEGAPROJECTS, MEGAPROJECT_BY_ID, type MegaprojectDef } from '../content/megaprojects';
import type { GameState, MegaprojectState, SimEffect } from './types';
import { D } from './num';

export function megaprojectState(state: GameState, id: string): MegaprojectState | null {
  return state.megaprojects[id] ?? null;
}

export function isBuilt(state: GameState, id: string): boolean {
  return state.megaprojects[id]?.done === true;
}

export function isBuilding(state: GameState, id: string): boolean {
  const m = state.megaprojects[id];
  return m !== undefined && !m.done;
}

/** 0–1 progress, for the HUD and the scene's half-built structure. */
export function buildProgress(state: GameState, id: string): number {
  const m = state.megaprojects[id];
  const def = MEGAPROJECT_BY_ID[id];
  if (!m || !def) return 0;
  if (m.done) return 1;
  return Math.max(0, Math.min(1, m.builtMs / def.buildMs));
}

/**
 * Whether the commission can be signed right now: affordable, not already
 * under way, and the faction trusts you enough. Reputation is the gate that
 * finally gives standing something to be for.
 */
export function canStart(state: GameState, def: MegaprojectDef): boolean {
  if (state.megaprojects[def.id]) return false;
  if (state.operations.reputation[def.faction] < def.reputationRequired) return false;
  return state.tu.gte(D(def.cost));
}

export function startMegaproject(state: GameState, effects: SimEffect[], id: string): void {
  const def = MEGAPROJECT_BY_ID[id];
  if (!def) return;
  if (!canStart(state, def)) return;
  state.tu = state.tu.sub(D(def.cost));
  state.megaprojects[id] = { startedAtMs: state.gameTimeMs, builtMs: 0, done: false, doneAtMs: null };
  effects.push({ t: 'megaprojectStarted', id });
}

/**
 * Credit construction. `tickMs` is real elapsed time and is NOT scaled by
 * offline efficiency — see the note at the top.
 */
export function stepMegaprojects(
  state: GameState,
  effects: SimEffect[],
  tickMs: number,
): boolean {
  let changed = false;
  for (const def of MEGAPROJECTS) {
    const m = state.megaprojects[def.id];
    if (!m || m.done) continue;
    m.builtMs += tickMs;
    changed = true;
    if (m.builtMs >= def.buildMs) {
      m.builtMs = def.buildMs;
      m.done = true;
      m.doneAtMs = state.gameTimeMs;
      state.lifetime.megaprojectsBuilt += 1;
      effects.push({ t: 'megaprojectFinished', id: def.id });
    }
  }
  return changed;
}

/** Everything standing, folded into the multipliers the economy asks for. */
export function megaprojectEffects(state: GameState): {
  prodMult: number;
  scienceMult: number;
  offlineCapAddMs: number;
  salvagePerHour: number;
} {
  let prodMult = 1;
  let scienceMult = 1;
  let offlineCapAddMs = 0;
  let salvagePerHour = 0;
  for (const def of MEGAPROJECTS) {
    if (!isBuilt(state, def.id)) continue;
    if (def.prodMult) prodMult *= def.prodMult;
    if (def.scienceMult) scienceMult *= def.scienceMult;
    if (def.offlineCapAddMs) offlineCapAddMs += def.offlineCapAddMs;
    if (def.salvagePerHour) salvagePerHour += def.salvagePerHour;
  }
  return { prodMult, scienceMult, offlineCapAddMs, salvagePerHour };
}

/**
 * The Reclamation Yard and its kin pay salvage while you are planetside.
 * This is the ONE place the idle game feeds the flight economy, and it only
 * ever goes that way — salvage still buys nothing but the ship.
 */
export function stepMegaprojectSalvage(state: GameState, tickMs: number): void {
  const rate = megaprojectEffects(state).salvagePerHour;
  if (rate <= 0) return;
  state.expedition.salvage += (rate * tickMs) / 3_600_000;
}
