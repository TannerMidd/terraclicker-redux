import { C } from '../content/constants';
import { ACHIEVEMENTS } from '../content/achievements';
import { BUILDING_BY_ID } from '../content/buildings';
import { RESEARCH_BY_ID } from '../content/research';
import { PERK_BY_ID } from '../content/catalogue';
import { SURVEY_BY_ID } from '../content/surveys';
import { D, DZERO, Decimal } from './num';
import { initRng, randRange } from './rng';
import {
  bulkCost,
  computeDerived,
  maxAffordable,
  prestigeBpFor,
  upgradeVisible,
  UPGRADE_BY_ID,
} from './economy';
import { generatePlanet, lowestGauge, planetComplete } from './planets';
import {
  catchBubble,
  endVogon,
  hitVogonShip,
  rollEventGap,
  spawnBubble,
  spawnEvent,
  spawnVogons,
} from './improbability';
import {
  ASPECTS,
  type AspectId,
  type Derived,
  type GameState,
  type Input,
  type SimEffect,
  type StepOptions,
  type StepResult,
} from './types';

const EARTH_NOTICE_DELAY_MS = 600_000; // 10 real minutes after Earth completes

// ————————————————— New game —————————————————

export function newGame(seed: number, nowWall: number): GameState {
  const rng = initRng(seed);
  const state: GameState = {
    version: C.SAVE_VERSION,
    seed,
    rng,
    gameTimeMs: 0,
    createdAtWall: nowWall,
    savedAtWall: nowWall,
    tu: DZERO,
    science: DZERO,
    buildings: {},
    upgrades: {},
    research: { completed: [], active: null },
    achievements: {},
    planet: generatePlanet(rng, { runIndex: 0, lifetimeIndex: 1, headStart: 0 }),
    run: {
      number: 1,
      planetsCompleted: 0,
      systems: 0,
      galaxies: 0,
      tuEarned: DZERO,
      completedPlanets: [],
    },
    lifetime: {
      tuEarned: DZERO,
      clicks: 0,
      planetsCompleted: 0,
      systems: 0,
      galaxies: 0,
      bestGalaxies: 0,
      bubblesCaught: 0,
      petuniasCaught: 0,
      vogonShipsRepelled: 0,
      vogonReadingsEndured: 0,
      prestiges: 0,
    },
    prestige: { bp: 0, bpEarned: 0, catalogue: {} },
    buffs: [],
    bubbles: [],
    activeEvents: [],
    vogon: null,
    timers: {
      nextBubbleMs: C.FIRST_BUBBLE_MS,
      nextEventMs: randRange(rng, 'events', C.FIRST_EVENT_MIN_MS, C.FIRST_EVENT_MAX_MS),
      nextVogonMs: C.VOGON_EARLIEST_MS + randRange(rng, 'vogons', 0, C.VOGON_MAX_GAP_MS - C.VOGON_MIN_GAP_MS),
      stallMs: 0,
      sinceBubbleCatchMs: 0,
      nextIdCounter: 0,
      tickCarryMs: 0,
    },
    flags: {},
  };
  return state;
}

// ————————————————— Input handling —————————————————

function addTu(state: GameState, gain: Decimal): void {
  state.tu = state.tu.add(gain);
  state.run.tuEarned = state.run.tuEarned.add(gain);
  state.lifetime.tuEarned = state.lifetime.tuEarned.add(gain);
}

function fillGauge(state: GameState, aspect: AspectId, amount: Decimal, overflowRate: number): void {
  const p = state.planet;
  const room = p.targets[aspect].sub(p.gauges[aspect]);
  if (room.lte(0)) {
    if (overflowRate > 0) addTu(state, amount.mul(overflowRate));
    return;
  }
  if (amount.gt(room)) {
    p.gauges[aspect] = p.targets[aspect];
    if (overflowRate > 0) addTu(state, amount.sub(room).mul(overflowRate));
  } else {
    p.gauges[aspect] = p.gauges[aspect].add(amount);
  }
}

function handleClick(state: GameState, derived: Derived, effects: SimEffect[]): void {
  addTu(state, derived.clickPower);
  fillGauge(state, lowestGauge(state.planet), derived.clickPower, derived.overflowRates[lowestGauge(state.planet)]);
  state.lifetime.clicks += 1;
  effects.push({ t: 'click', power: derived.clickPower });
}

function handleInput(state: GameState, input: Input, effects: SimEffect[], opts: StepOptions): void {
  const derived = computeDerived(state, opts);
  switch (input.type) {
    case 'click':
      handleClick(state, derived, effects);
      break;
    case 'buyBuilding': {
      const def = BUILDING_BY_ID[input.id];
      if (!def) return;
      const owned = state.buildings[input.id] ?? 0;
      if (def.unique && owned >= 1) return;
      let qty = input.qty === 'max' ? maxAffordable(input.id, owned, state.tu, derived) : input.qty;
      if (def.unique) qty = Math.min(qty, 1);
      if (qty <= 0) return;
      const cost = bulkCost(input.id, owned, qty, derived);
      if (state.tu.lt(cost)) return;
      state.tu = state.tu.sub(cost);
      state.buildings[input.id] = owned + qty;
      state.timers.stallMs = 0;
      break;
    }
    case 'buyUpgrade': {
      const def = UPGRADE_BY_ID[input.id];
      if (!def || !upgradeVisible(def, state, derived)) return;
      if (state.tu.lt(def.cost)) return;
      state.tu = state.tu.sub(def.cost);
      state.upgrades[input.id] = 1;
      state.timers.stallMs = 0;
      break;
    }
    case 'startResearch': {
      const def = RESEARCH_BY_ID[input.id];
      if (!def || state.research.active) return;
      if (state.research.completed.includes(input.id)) return;
      if (def.requiresResearch && !state.research.completed.includes(def.requiresResearch)) return;
      if (def.requiresBuilding) {
        for (const [bid, n] of Object.entries(def.requiresBuilding)) {
          if ((state.buildings[bid] ?? 0) < n) return;
        }
      }
      if (state.science.lt(def.costScience)) return;
      state.science = state.science.sub(def.costScience);
      state.research.active = { id: input.id, remainingMs: def.durationMs };
      state.timers.stallMs = 0;
      break;
    }
    case 'chooseSurvey': {
      const p = state.planet;
      if (!p.surveyOptions || !p.surveyOptions.includes(input.id)) return;
      p.survey = input.id;
      p.surveyOptions = null;
      const sv = SURVEY_BY_ID[input.id];
      if (sv?.headStart) {
        for (const a of ASPECTS) {
          const floor = p.targets[a].mul(sv.headStart);
          if (p.gauges[a].lt(floor)) p.gauges[a] = floor;
        }
      }
      break;
    }
    case 'catchBubble':
      catchBubble(state, derived, input.id, effects);
      break;
    case 'hitVogonShip':
      hitVogonShip(state, derived, input.id, effects);
      break;
    case 'prestige':
      doPrestige(state, effects);
      break;
    case 'buyPerk': {
      const perk = PERK_BY_ID[input.id];
      if (!perk) return;
      const rank = state.prestige.catalogue[input.id] ?? 0;
      if (rank >= perk.maxRank) return;
      const cost = perk.costs[rank];
      if (cost === undefined || state.prestige.bp < cost) return;
      state.prestige.bp -= cost;
      state.prestige.catalogue[input.id] = rank + 1;
      break;
    }
    case 'devGrant': {
      addTu(state, D(input.tu));
      if (input.gaugeFrac !== undefined) {
        for (const a of ASPECTS) {
          state.planet.gauges[a] = state.planet.targets[a].mul(Math.min(1, input.gaugeFrac));
        }
      }
      break;
    }
    case 'devSpawn': {
      if (input.what === 'vogon') spawnVogons(state, derived, effects, false, true);
      else if (input.what === 'bubble') spawnBubble(state, derived, effects);
      else spawnEvent(state, derived, effects);
      break;
    }
  }
}

// ————————————————— Prestige —————————————————

export function doPrestige(state: GameState, effects: SimEffect[]): void {
  const bp = prestigeBpFor(state);
  if (bp < 1) return;

  state.prestige.bp += bp;
  state.prestige.bpEarned += bp;
  state.lifetime.prestiges += 1;

  // Reset the run; keep the lifetime.
  state.tu = DZERO;
  state.science = DZERO;
  state.buildings = {};
  state.upgrades = {};
  state.research = {
    completed: state.research.completed.filter((id) => id === 'the-answer'),
    active: null,
  };
  state.buffs = [];
  state.bubbles = [];
  state.activeEvents = [];
  state.vogon = null;
  delete state.flags['earthNoticeAtMs'];
  delete state.flags['earthDefenseActive'];

  state.run = {
    number: state.run.number + 1,
    planetsCompleted: 0,
    systems: 0,
    galaxies: 0,
    tuEarned: DZERO,
    completedPlanets: [],
  };

  // Catalogue perks that shape the new run.
  const derived = computeDerived(state);
  if (derived.startProbes > 0) state.buildings['seedProbe'] = derived.startProbes;

  state.planet = generatePlanet(state.rng, {
    runIndex: 0,
    lifetimeIndex: state.lifetime.planetsCompleted + 1,
    headStart: derived.headStart,
  });

  state.timers.nextBubbleMs = C.FIRST_BUBBLE_MS;
  state.timers.nextEventMs = randRange(state.rng, 'events', C.FIRST_EVENT_MIN_MS, C.FIRST_EVENT_MAX_MS);
  state.timers.nextVogonMs =
    C.VOGON_EARLIEST_MS + randRange(state.rng, 'vogons', 0, C.VOGON_MAX_GAP_MS - C.VOGON_MIN_GAP_MS);
  state.timers.stallMs = 0;
  state.timers.sinceBubbleCatchMs = 0;

  effects.push({ t: 'prestiged', bp });
}

// ————————————————— Planet completion —————————————————

function completePlanet(state: GameState, derived: Derived, effects: SimEffect[]): void {
  const finished = state.planet;
  const bonus = derived.tuPerSec.mul(C.PLANET_BONUS_SECONDS).max(D(C.PLANET_BONUS_MIN));
  addTu(state, bonus);

  state.run.planetsCompleted += 1;
  state.lifetime.planetsCompleted += 1;
  state.run.completedPlanets.push({
    seed: finished.seed,
    type: finished.type,
    size: finished.size,
    name: finished.name,
  });
  state.timers.stallMs = 0;

  effects.push({
    t: 'planetComplete',
    name: finished.name,
    lifetimeIndex: finished.lifetimeIndex,
    bonus,
  });

  // Earth setpiece: ten minutes after Earth completes, a demolition notice arrives.
  if (finished.lifetimeIndex === 42) {
    state.flags['earthCompleted'] = state.gameTimeMs;
    state.flags['earthNoticeAtMs'] = state.gameTimeMs + EARTH_NOTICE_DELAY_MS;
  }

  // Meta ladder: 5 planets → system, 5 systems → galaxy (per run).
  if (state.run.planetsCompleted % C.PLANETS_PER_SYSTEM === 0) {
    state.run.systems += 1;
    state.lifetime.systems += 1;
    effects.push({ t: 'systemFormed', count: state.run.systems });
    if (state.run.systems % C.SYSTEMS_PER_GALAXY === 0) {
      state.run.galaxies += 1;
      state.lifetime.galaxies += 1;
      state.lifetime.bestGalaxies = Math.max(state.lifetime.bestGalaxies, state.run.galaxies);
      effects.push({ t: 'galaxyFormed', count: state.run.galaxies });
    }
  }

  state.planet = generatePlanet(state.rng, {
    runIndex: finished.index + 1,
    lifetimeIndex: state.lifetime.planetsCompleted + 1,
    headStart: derived.headStart,
  });
  if (state.planet.surveyOptions) effects.push({ t: 'surveyOffered' });
}

// ————————————————— Time integration —————————————————

/**
 * Per-tick pre-scaled rates, recomputed only when something that changes
 * rates happens ("dirty"). Keeping the per-tick decomposition identical is
 * what makes any chunking of the same duration bit-identical.
 */
interface TickRates {
  derived: Derived;
  tuPerTick: Decimal;
  sciencePerTick: Decimal;
  aspectPerTick: Record<AspectId, Decimal>;
}

function computeTickRates(state: GameState, opts: StepOptions, offline: boolean): TickRates {
  const derived = computeDerived(state, opts);
  const sec = (C.LOGIC_TICK_MS / 1000) * (offline ? derived.offlineEfficiency : 1);
  const marvinFill = derived.clickPower.mul(derived.marvinClicksPerSec * 0.25 * sec);
  const aspectPerTick = {} as Record<AspectId, Decimal>;
  for (const a of ASPECTS) {
    let gain = derived.aspectPerSec[a].mul(sec);
    if (derived.marvinClicksPerSec > 0) gain = gain.add(marvinFill);
    aspectPerTick[a] = gain;
  }
  return {
    derived,
    tuPerTick: derived.tuPerSec.mul(sec),
    sciencePerTick: derived.sciencePerSec.mul(sec),
    aspectPerTick,
  };
}

function checkAchievements(state: GameState, derived: Derived, effects: SimEffect[]): boolean {
  let any = false;
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] !== undefined) continue;
    let unlocked = false;
    try {
      unlocked = a.cond(state, derived);
    } catch {
      unlocked = false;
    }
    if (unlocked) {
      state.achievements[a.id] = state.gameTimeMs;
      effects.push({ t: 'achievement', id: a.id });
      any = true;
    }
  }
  return any;
}

/**
 * Advance the simulation. Mutates `state`. The ONLY place time passes.
 *
 * Time is quantized into LOGIC_TICK_MS quanta with a sub-tick carry, and
 * every tick performs the identical operations in the identical order —
 * so one 8-hour call and 480 one-minute calls produce bit-identical
 * states. That property is enforced by test, not by hope.
 */
export function step(
  state: GameState,
  dtMs: number,
  inputs: readonly Input[] = [],
  opts: StepOptions = {},
): StepResult {
  const effects: SimEffect[] = [];
  const offline = Boolean(opts.offline);
  const TICK = C.LOGIC_TICK_MS;

  for (const input of inputs) handleInput(state, input, effects, opts);
  if (planetComplete(state.planet)) {
    completePlanet(state, computeDerived(state, opts), effects);
  }

  state.timers.tickCarryMs += dtMs;
  let ticks = Math.floor(state.timers.tickCarryMs / TICK);
  state.timers.tickCarryMs -= ticks * TICK;
  if (ticks > 1_000_000) ticks = 1_000_000; // safety: ~69 simulated days per call

  let rates = computeTickRates(state, opts, offline);
  let dirty = false;

  for (let t = 0; t < ticks; t++) {
    if (dirty) {
      rates = computeTickRates(state, opts, offline);
      dirty = false;
    }
    const { derived } = rates;

    // 1) Accrue one tick of production.
    if (rates.tuPerTick.gt(0)) addTu(state, rates.tuPerTick);
    if (rates.sciencePerTick.gt(0)) state.science = state.science.add(rates.sciencePerTick);
    for (const a of ASPECTS) {
      const gain = rates.aspectPerTick[a];
      if (gain.gt(0)) fillGauge(state, a, gain, derived.overflowRates[a]);
    }
    state.gameTimeMs += TICK;
    state.timers.stallMs += TICK;
    state.timers.sinceBubbleCatchMs += TICK;

    // 2) Countdowns. Expiries that change production mark rates dirty.
    if (state.buffs.length > 0) {
      const before = state.buffs.length;
      state.buffs = state.buffs.filter((b) => (b.remainingMs -= TICK) > 0);
      if (state.buffs.length !== before) dirty = true;
    }
    if (state.activeEvents.length > 0) {
      const before = state.activeEvents.length;
      state.activeEvents = state.activeEvents.filter((e) => (e.remainingMs -= TICK) > 0);
      if (state.activeEvents.length !== before) dirty = true;
    }
    if (state.bubbles.length > 0) {
      state.bubbles = state.bubbles.filter((b) => (b.remainingMs -= TICK) > 0);
    }
    if (state.vogon && (state.vogon.remainingMs -= TICK) <= 0) {
      endVogon(state, false, effects);
      dirty = true;
    }
    if (state.research.active) {
      state.research.active.remainingMs -= TICK * derived.researchSpeedMult;
      if (state.research.active.remainingMs <= 0) {
        const id = state.research.active.id;
        state.research.completed.push(id);
        state.research.active = null;
        effects.push({ t: 'researchDone', id });
        dirty = true;
      }
    }

    // 3) Spawns (suppressed offline; the universe waits for an audience).
    if (!offline) {
      if ((state.timers.nextBubbleMs -= TICK) <= 0) spawnBubble(state, derived, effects);
      if ((state.timers.nextEventMs -= TICK) <= 0) {
        spawnEvent(state, derived, effects);
        dirty = true;
      }
      if ((state.timers.nextVogonMs -= TICK) <= 0) {
        spawnVogons(state, derived, effects);
        dirty = true;
      }
      const noticeAt = state.flags['earthNoticeAtMs'];
      if (typeof noticeAt === 'number' && state.gameTimeMs >= noticeAt) {
        if (state.vogon) {
          // A reading is already in progress; the demolition fleet queues politely.
          state.flags['earthNoticeAtMs'] = state.gameTimeMs + 60_000;
        } else {
          delete state.flags['earthNoticeAtMs'];
          spawnVogons(state, derived, effects, true);
          dirty = true;
        }
      }
    }

    // 4) Planet completion at tick resolution (overshoot becomes overflow TU).
    if (planetComplete(state.planet)) {
      completePlanet(state, derived, effects);
      dirty = true;
    }

    // 5) Achievements each tick — their +1% bonus must land at the same
    //    tick regardless of how the caller chunks time.
    if (checkAchievements(state, derived, effects)) dirty = true;
  }

  // Inputs can also unlock achievements with no time passing.
  if (ticks === 0 && inputs.length > 0) {
    checkAchievements(state, computeDerived(state, opts), effects);
  }

  return { effects };
}

/**
 * Offline catch-up: same physics, chunked for responsiveness, spawns
 * suppressed, efficiency and cap applied. Returns the simulated ms.
 */
export function stepOffline(state: GameState, elapsedWallMs: number, opts: StepOptions = {}): {
  simulatedMs: number;
  tuGained: Decimal;
  effects: SimEffect[];
} {
  const derived = computeDerived(state, opts);
  const simulatedMs = Math.min(elapsedWallMs, derived.offlineCapMs);
  const tuBefore = state.tu;
  const effects: SimEffect[] = [];
  let remaining = simulatedMs;
  while (remaining > 0) {
    const chunk = Math.min(remaining, C.OFFLINE_CHUNK_MS);
    const r = step(state, chunk, [], { ...opts, offline: true });
    effects.push(...r.effects);
    remaining -= chunk;
  }
  return { simulatedMs, tuGained: state.tu.sub(tuBefore), effects };
}

export { computeDerived, rollEventGap };
