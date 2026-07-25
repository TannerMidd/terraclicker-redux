/**
 * The bots, extracted so that the harness and the test suite play the same
 * game. They used to exist three times over — once in `run.ts`, once in
 * `pacing.test.ts`, once more in whatever test needed a player — which meant
 * the CI bands were asserted against a bot that had quietly drifted from the
 * one the balance reports were written about.
 *
 * A Bot is a pure function from state to inputs. It never mutates; `step` does.
 */
import { bulkCost, upgradeVisible, prestigeEligible, computeDerived } from '../src/engine/economy';
import { specialtiesForSystem } from '../src/engine/operations';
import { BUILDINGS } from '../src/content/buildings';
import { CATALOGUE } from '../src/content/catalogue';
import { UPGRADES } from '../src/content/upgrades';
import { ASPECTS, type AspectId, type GameState, type Input } from '../src/engine/types';

export const OPTS = { utcDay: 3 };
export const TICK = 250;

export type Bot = (state: GameState, tick: number) => Input[];

/** Which aspect is furthest from its target right now. */
export function bottleneck(state: GameState): AspectId {
  let result: AspectId = 'thermal';
  let lowest = Number.POSITIVE_INFINITY;
  for (const aspect of ASPECTS) {
    const fraction = state.planet.gauges[aspect].div(state.planet.targets[aspect]).toNumber();
    if (fraction < lowest) {
      lowest = fraction;
      result = aspect;
    }
  }
  return result;
}

/** Best value-per-TU purchase available, plus any upgrade and any bubble. */
export function buyer(state: GameState, focusAspect?: AspectId): Input[] {
  const inputs: Input[] = [];
  const d = computeDerived(state, OPTS);
  for (const u of UPGRADES) {
    if (upgradeVisible(u, state, d) && state.tu.gte(u.cost)) {
      inputs.push({ type: 'buyUpgrade', id: u.id });
      break;
    }
  }
  let bestId: string | null = null;
  let bestValue = 0;
  for (const b of BUILDINGS) {
    if (b.unique && (state.buildings[b.id] ?? 0) > 0) continue;
    const owned = state.buildings[b.id] ?? 0;
    const cost = bulkCost(b.id, owned, 1, d);
    if (state.tu.lt(cost)) continue;
    const aspectSum = Object.values(b.aspects).reduce((a, v) => a + (v ?? 0), 0);
    const focusValue = focusAspect ? (b.aspects[focusAspect] ?? 0) * 3 : 0;
    const value = (b.tuPerSec + aspectSum + focusValue) / cost.toNumber();
    if (value > bestValue) {
      bestValue = value;
      bestId = b.id;
    }
  }
  if (bestId) inputs.push({ type: 'buyBuilding', id: bestId, qty: 'max' });
  for (const bub of state.bubbles) inputs.push({ type: 'catchBubble', id: bub.id });
  return inputs;
}

export function operationsManager(state: GameState, tick: number): Input[] {
  const inputs: Input[] = [{ type: 'click' }];
  if (tick % 20 === 0) inputs.push(...buyer(state, bottleneck(state)));

  if (!state.operations.active && state.operations.offers.length > 0) {
    const preference = ['delivery', 'timed', 'system', 'lean', 'survey', 'bottleneck'];
    const offer = preference
      .map((templateId) => state.operations.offers.find((entry) => entry.templateId === templateId))
      .find((entry) => entry !== undefined) ?? state.operations.offers[0];
    if (offer) inputs.push({ type: 'acceptContract', id: offer.id });
  } else if (
    state.operations.active
    && state.operations.active.deadlineAtGameMs === null
    && state.gameTimeMs - state.operations.active.acceptedAtGameMs > 15 * 60_000
  ) {
    inputs.push({ type: 'abandonContract' });
  }

  const derived = computeDerived(state, OPTS);
  if (state.run.systems > 0 && derived.dispatchesUsed < derived.dispatchSlots) {
    const systemIndex = Array.from({ length: state.run.systems }, (_, i) => i)
      .find((i) => state.operations.systemSpecialties[String(i)] === undefined);
    if (systemIndex !== undefined) {
      const options = specialtiesForSystem(state, systemIndex);
      const target =
        options.find((specialty) => specialty === bottleneck(state)) ?? options[0];
      if (target)
        inputs.push({ type: 'assignSystemSpecialty', systemIndex, specialty: target });
    }
  }

  const latest = state.run.completedPlanets.at(-1);
  if (latest && tick % 240 === 0 && state.operations.heritageCandidateLifetimeIndex !== latest.lifetimeIndex)
    inputs.push({ type: 'designateHeritage', lifetimeIndex: latest.lifetimeIndex });
  return inputs;
}

/**
 * What a Blueprint is worth to a player who is sitting there playing. The two
 * bureaucracy perks at the bottom buy offline cap and offline efficiency,
 * which are worth real money to a human across a week and worth exactly
 * nothing to a bot measuring a continuous foreground session. A spender that
 * buys cheapest-first buys those two early — they are cheap — and then reports
 * that prestige barely helped, which is a fact about the bot rather than about
 * the game.
 */
const ACTIVE_RUN_PRIORITY = [
  'surplus-stock', // starts the next commission with probes already running
  'fjord-certification', // every planet arrives part-finished
  'bulk-discount', // compounds across every purchase after it
  'marvins-patience',
  'golden-ratio',
  'drive-tuning',
  'bubble-lens',
  'extended-forms',
  'efficient-filing',
];

/**
 * Files the sale the moment it is available, then actually spends what it was
 * paid. Every other bot banks Blueprints forever, which meant the single
 * criterion the prestige layer is judged by — DESIGN.md M3, "run 2 >=45%
 * faster to prior peak" — was never once exercised.
 */
export function catalogueSpender(state: GameState, tick: number): Input[] {
  const inputs: Input[] = [{ type: 'click' }];
  if (tick % 20 === 0) inputs.push(...buyer(state, bottleneck(state)));
  if (prestigeEligible(state)) inputs.push({ type: 'prestige' });

  if (tick % 8 === 0) {
    const affordable = CATALOGUE.map((perk) => {
      const rank = state.prestige.catalogue[perk.id] ?? 0;
      return { perk, rank, cost: perk.costs[rank] };
    })
      .filter((e) => e.rank < e.perk.maxRank && e.cost !== undefined && state.prestige.bp >= e.cost)
      .sort((a, b) => {
        const ai = ACTIVE_RUN_PRIORITY.indexOf(a.perk.id);
        const bi = ACTIVE_RUN_PRIORITY.indexOf(b.perk.id);
        if (ai !== bi) return ai - bi;
        return (a.cost as number) - (b.cost as number);
      });
    const next = affordable[0];
    if (next) inputs.push({ type: 'buyPerk', id: next.perk.id });
  }
  return inputs;
}

export const BOTS: Record<string, Bot> = {
  'greedy-clicker': (s, t) => {
    const inputs: Input[] = [{ type: 'click' }];
    if (t % 20 === 0) inputs.push(...buyer(s));
    return inputs;
  },
  idler: (s, t) => (t % 240 === 0 ? buyer(s) : []),
  'aspect-optimizer': (s, t) => {
    const inputs: Input[] = [{ type: 'click' }];
    if (t % 20 === 0) inputs.push(...buyer(s, bottleneck(s)));
    return inputs;
  },
  'afk-then-binge': (s, t) => {
    const cycleTick = t % ((12 * 60_000) / TICK);
    const active = cycleTick >= (10 * 60_000) / TICK;
    if (!active) return [];
    const inputs: Input[] = [{ type: 'click' }, { type: 'click' }];
    if (t % 20 === 0) inputs.push(...buyer(s, bottleneck(s)));
    return inputs;
  },
  'operations-manager': operationsManager,
  'catalogue-spender': catalogueSpender,
  'earliest-prestige': (s, t) => {
    const inputs: Input[] = [{ type: 'click' }];
    if (t % 20 === 0) inputs.push(...buyer(s));
    // Deliberately adversarial: file the sale on every tick and let the
    // centralized engine eligibility rule reject incomplete portfolios.
    inputs.push({ type: 'prestige' });
    return inputs;
  },
};
