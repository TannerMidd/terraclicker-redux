/**
 * Ship roles and infrastructure — the engine side. See content/loadouts.ts.
 *
 * The rule that keeps roles from being a downgrade: **a role never removes a
 * refit.** Everything bought stays bought; a role is a multiplier laid over the
 * result, freely switchable, that trades one capability for another. Switching
 * to Courier does not un-buy the cargo hold — it packs less into it today.
 *
 * The rule that keeps infrastructure from breaking the seal: **it is bought
 * with salvage and improves only navigation, storage and convenience.** Nothing
 * here touches TU, Science, aspects or planet progress. A player who never
 * leaves the planet loses nothing but the view, which is the oldest promise
 * this layer has.
 */
import {
  INFRASTRUCTURE_BY_ID,
  ROLE_BY_ID,
  SHIP_ROLES,
  type ShipRole,
} from '../content/loadouts';
import type { ExpeditionState, GameState, SimEffect } from './types';

export function activeRole(expedition: ExpeditionState): ShipRole {
  return ROLE_BY_ID[expedition.role] ?? SHIP_ROLES[0]!;
}

/** Switch role. Free, instant, and reversible — it is a decision, not a purchase. */
export function setRole(state: GameState, id: string): boolean {
  if (!ROLE_BY_ID[id]) return false;
  state.expedition.role = id;
  return true;
}

/** How many of a given structure are standing. */
export function infrastructureCount(expedition: ExpeditionState, id: string): number {
  return expedition.infrastructure[id] ?? 0;
}

export function canBuildInfrastructure(state: GameState, id: string): boolean {
  const def = INFRASTRUCTURE_BY_ID[id];
  if (!def) return false;
  if (infrastructureCount(state.expedition, id) >= def.max) return false;
  return state.expedition.salvage >= def.cost;
}

export function buildInfrastructure(
  state: GameState,
  effects: SimEffect[],
  id: string,
): boolean {
  const def = INFRASTRUCTURE_BY_ID[id];
  if (!def || !canBuildInfrastructure(state, id)) return false;
  state.expedition.salvage -= def.cost;
  state.expedition.infrastructure[id] = infrastructureCount(state.expedition, id) + 1;
  effects.push({ t: 'infrastructureBuilt', id });
  return true;
}

/**
 * Everything the loadout and the standing infrastructure do, folded.
 *
 * All four are multipliers on the FLIGHT economy only. There is deliberately no
 * production term here and there should never be one.
 */
export function loadoutEffects(expedition: ExpeditionState): {
  speed: number;
  capacity: number;
  sensors: number;
  agility: number;
  rigCap: number;
} {
  const role = activeRole(expedition);
  const out = {
    speed: role.speed,
    capacity: role.capacity,
    sensors: role.sensors,
    agility: role.agility,
    rigCap: 1,
  };
  for (const [id, n] of Object.entries(expedition.infrastructure)) {
    const def = INFRASTRUCTURE_BY_ID[id];
    if (!def || n <= 0) continue;
    const stacked = Math.pow(def.effect.v, n);
    switch (def.effect.kind) {
      case 'sensors':
        out.sensors *= stacked;
        break;
      case 'capacity':
        out.capacity *= stacked;
        break;
      case 'rigCap':
        out.rigCap *= stacked;
        break;
    }
  }
  return out;
}
