/**
 * Standing Orders, Revision 3 — automation as something you earn and then
 * configure, rather than a switch that plays the game instead of you.
 *
 * The tenth commission asks for exactly the same purchasing ritual as the
 * first, and that repetition is the strongest argument against ever starting
 * an eleventh. But the obvious fix — one toggle that buys everything — deletes
 * the moment-to-moment game rather than relieving it, and it cannot be undone
 * once players have it.
 *
 * So: policies, not autopilot.
 *
 *  - Every policy is **off by default** and independently switchable.
 *  - Every policy is a rule the player wrote down, not a heuristic that
 *    guesses. `buildPriority` is *their* order; `reserveSeconds` is *their*
 *    floor. The engine executes; it does not decide.
 *  - Nothing here answers a **question**. Situations, petitions, surveys and
 *    charters are all left alone, because those are the parts of the game that
 *    are about judgement, and a machine that answers them is a machine playing
 *    a different, worse game. `pauseOnSituation` exists so the ritual stops
 *    when something is genuinely being asked of you.
 *
 * It emits `Input`s — the same ones a click produces — so automation can do
 * nothing a player could not, and every existing rule about affordability,
 * uniqueness and unlock gating applies without being restated here.
 */
import { BUILDINGS, BUILDING_BY_ID } from '../content/buildings';
import { UPGRADES } from '../content/upgrades';
import { RESEARCH_BY_ID } from '../content/research';
import { bulkCost, maxAffordable, upgradeVisible } from './economy';
import type { Derived, GameState, Input } from './types';

export interface StandingOrders {
  enabled: boolean;
  /**
   * Seconds of income to keep unspent. The single most requested idle-game
   * policy, and the one that makes the others safe: it stops automation
   * emptying the bank the instant before the player wanted to buy something.
   */
  reserveSeconds: number;
  autoBuild: boolean;
  /** Building ids in the player's preferred order. Empty means best value. */
  buildPriority: string[];
  autoUpgrade: boolean;
  autoResearch: boolean;
  /** Research ids to start, in order, as each becomes possible. */
  researchQueue: string[];
  /** Stop everything while a situation is open and waiting on an answer. */
  pauseOnSituation: boolean;
}

export function createStandingOrders(): StandingOrders {
  return {
    enabled: false,
    reserveSeconds: 0,
    autoBuild: false,
    buildPriority: [],
    autoUpgrade: false,
    autoResearch: false,
    researchQueue: [],
    pauseOnSituation: true,
  };
}

/** TU that must remain after any automated purchase. */
export function reserveFor(orders: StandingOrders, derived: Derived) {
  return derived.tuPerSec.mul(Math.max(0, orders.reserveSeconds));
}

/**
 * What the standing orders would do this tick.
 *
 * Returns at most one purchase per call. Automation that spends the whole bank
 * in a single frame is indistinguishable from a bug, and a slow hand is easier
 * to interrupt — which matters, because the player is allowed to change their
 * mind at any point without first finding an off switch.
 */
export function standingOrderInputs(
  state: GameState,
  derived: Derived,
  orders: StandingOrders,
): Input[] {
  if (!orders.enabled) return [];
  // Something is being asked. That is not a purchasing decision, and the
  // ritual waits until it has been answered.
  if (orders.pauseOnSituation && state.situations.length > 0) return [];

  const reserve = reserveFor(orders, derived);
  const spendable = state.tu.sub(reserve);
  if (spendable.lte(0)) return automationResearch(state, orders);

  // Upgrades first: they are one-off, permanent, and never the wrong buy.
  if (orders.autoUpgrade) {
    for (const u of UPGRADES) {
      if ((state.upgrades[u.id] ?? 0) > 0) continue;
      if (!upgradeVisible(u, state, derived)) continue;
      if (spendable.gte(u.cost)) return [{ type: 'buyUpgrade', id: u.id }];
    }
  }

  if (orders.autoBuild) {
    const pick = chooseBuilding(state, derived, orders, spendable);
    if (pick) return [{ type: 'buyBuilding', id: pick, qty: 1 }];
  }

  return automationResearch(state, orders);
}

/** The next research the queue wants, if it can be started right now. */
function automationResearch(state: GameState, orders: StandingOrders): Input[] {
  if (!orders.autoResearch || state.research.active) return [];
  for (const id of orders.researchQueue) {
    if (state.research.completed.includes(id)) continue;
    const def = RESEARCH_BY_ID[id];
    if (!def) continue;
    if (def.requiresResearch && !state.research.completed.includes(def.requiresResearch)) continue;
    if (state.science.lt(def.costScience)) continue;
    if (def.requiresBuilding) {
      let ready = true;
      for (const [bid, n] of Object.entries(def.requiresBuilding)) {
        if ((state.buildings[bid] ?? 0) < n) ready = false;
      }
      if (!ready) continue;
    }
    return [{ type: 'startResearch', id }];
  }
  return [];
}

/**
 * The player's order, then affordability. Where no order is given, fall back
 * to value-per-TU — which is what a careful player does anyway, and is the
 * only "decision" this module makes.
 */
function chooseBuilding(
  state: GameState,
  derived: Derived,
  orders: StandingOrders,
  spendable: ReturnType<GameState['tu']['sub']>,
): string | null {
  const affordable = (id: string): boolean => {
    const def = BUILDING_BY_ID[id];
    if (!def) return false;
    const owned = state.buildings[id] ?? 0;
    if (def.unique && owned > 0) return false;
    if (state.lifetime.tuEarned.lt(def.unlockAtTu)) return false;
    return spendable.gte(bulkCost(id, owned, 1, derived));
  };

  for (const id of orders.buildPriority) {
    if (affordable(id)) return id;
  }
  if (orders.buildPriority.length > 0) return null;

  let bestId: string | null = null;
  let bestValue = 0;
  for (const b of BUILDINGS) {
    if (!affordable(b.id)) continue;
    const owned = state.buildings[b.id] ?? 0;
    const cost = bulkCost(b.id, owned, 1, derived);
    const aspectSum = Object.values(b.aspects).reduce((a, v) => a + (v ?? 0), 0);
    const value = (b.tuPerSec + aspectSum) / cost.toNumber();
    if (value > bestValue) {
      bestValue = value;
      bestId = b.id;
    }
  }
  return bestId;
}

/** Whether the player has earned the right to configure any of this. */
export function standingOrdersUnlocked(state: GameState): boolean {
  // Automation is the reward for having demonstrably done it by hand. One
  // full commission sold is the proof.
  return state.lifetime.prestiges >= 1;
}

/** Only ids the game actually has, so a bad edit cannot brick the queue. */
export function sanitizeOrders(raw: StandingOrders): StandingOrders {
  return {
    ...raw,
    reserveSeconds: Math.max(0, Math.min(3600, raw.reserveSeconds || 0)),
    buildPriority: raw.buildPriority.filter((id) => BUILDING_BY_ID[id] !== undefined),
    researchQueue: raw.researchQueue.filter((id) => RESEARCH_BY_ID[id] !== undefined),
  };
}

export { maxAffordable };
