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
  prestigeEligible,
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
  acceptContract,
  abandonContract,
  assignSystemSpecialty,
  createOperationsState,
  designateHeritage,
  ensureContractBoard,
  expireContract,
  prepareOperationsForPrestige,
  progressContractOnPlanet,
  progressContractOnSystem,
  refreshContractBoard,
  rerollContracts,
} from './operations';
import { deriveLegacyInstallations, snapshotInstallations } from './worldHardware';
import { createExpeditionState, isBoarded, isDiscovered, refitCost } from './deepField';
import { createSubEthaState, fileBroadcast, stepSubEtha } from './subEtha';
import { DEEP_FIELD_BY_ID } from '../content/deepField';
import { CHRONICLE } from '../content/subEtha';
import { SEAM_BY_ID } from '../content/freight';
import { MEGAPROJECT_BY_ID } from '../content/megaprojects';
import {
  answerSituation,
  createSituationsState,
  spawnPetition,
  spawnSituation,
  stepPetitions,
  stepSituations,
} from './situations';
import {
  acceptJob,
  collectRig,
  deliverManifest,
  loseManifest,
  placeRig,
  prospectSeam,
  refreshJobBoard,
  stepRigs,
} from './freight';
import {
  startMegaproject,
  stepMegaprojectSalvage,
  stepMegaprojects,
} from './megaprojects';
import { REFIT_BY_ID } from '../content/refit';
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
    planet: generatePlanet(rng, {
      runIndex: 0,
      lifetimeIndex: 1,
      startedAtGameMs: 0,
      headStart: 0,
    }),
    run: {
      number: 1,
      planetsCompleted: 0,
      systems: 0,
      galaxies: 0,
      tuEarned: DZERO,
      completedPlanets: [],
      standing: {},
      petitions: [],
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
      situationsAnswered: 0,
      situationsIgnored: 0,
      deliveries: 0,
      rigsPlaced: 0,
      megaprojectsBuilt: 0,
      prestiges: 0,
    },
    prestige: { bp: 0, bpEarned: 0, catalogue: {} },
    operations: createOperationsState(),
    expedition: createExpeditionState(),
    megaprojects: {},
    subEtha: createSubEthaState(),
    buffs: [],
    bubbles: [],
    activeEvents: [],
    situations: createSituationsState(),
    vogon: null,
    timers: {
      nextBubbleMs: C.FIRST_BUBBLE_MS,
      nextEventMs: randRange(rng, 'events', C.FIRST_EVENT_MIN_MS, C.FIRST_EVENT_MAX_MS),
      nextSituationMs: randRange(rng, 'situations', C.SITUATION_FIRST_MIN_MS, C.SITUATION_FIRST_MAX_MS),
      nextPetitionMs: randRange(rng, 'situations', C.PETITION_MIN_GAP_MS, C.PETITION_MAX_GAP_MS),
      nextVogonMs: C.VOGON_EARLIEST_MS + randRange(rng, 'vogons', 0, C.VOGON_MAX_GAP_MS - C.VOGON_MIN_GAP_MS),
      stallMs: 0,
      sinceBubbleCatchMs: 0,
      nextIdCounter: 0,
      tickCarryMs: 0,
    },
    flags: {},
  };
  refreshContractBoard(state);
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
    case 'acceptContract':
      acceptContract(state, input.id, effects);
      break;
    case 'abandonContract':
      abandonContract(state, effects);
      break;
    case 'rerollContracts':
      rerollContracts(state, effects);
      break;
    case 'assignSystemSpecialty':
      assignSystemSpecialty(state, input.systemIndex, input.specialty, effects);
      break;
    case 'designateHeritage':
      designateHeritage(state, input.lifetimeIndex, effects);
      break;
    case 'scanSite': {
      // The helm decides *when* a scan completes; the engine decides whether
      // it counts. Re-scanning an already-filed landmark is a no-op.
      const def = DEEP_FIELD_BY_ID[input.id];
      if (!def || isDiscovered(state.expedition, input.id)) return;
      state.expedition.discovered[input.id] = state.gameTimeMs;
      effects.push({ t: 'siteScanned', id: input.id });
      break;
    }
    case 'boardSite': {
      const def = DEEP_FIELD_BY_ID[input.id];
      if (!def || def.unreachable) return;
      // Boarding something you never resolved files the entry too — you have,
      // after all, now had a very good look at it.
      if (!isDiscovered(state.expedition, input.id)) {
        state.expedition.discovered[input.id] = state.gameTimeMs;
        effects.push({ t: 'siteScanned', id: input.id });
      }
      if (isBoarded(state.expedition, input.id)) return;
      state.expedition.boarded[input.id] = state.gameTimeMs;
      state.expedition.salvage += def.salvage;
      if (def.flag) state.flags[def.flag] = true;
      effects.push({ t: 'siteBoarded', id: input.id, salvage: def.salvage });
      break;
    }
    case 'buyRefit': {
      const def = REFIT_BY_ID[input.id];
      if (!def) return;
      const cost = refitCost(state.expedition, input.id);
      if (cost === null || state.expedition.salvage < cost) return;
      state.expedition.salvage -= cost;
      const rank = (state.expedition.refits[input.id] ?? 0) + 1;
      state.expedition.refits[input.id] = rank;
      effects.push({ t: 'refitInstalled', id: input.id, rank });
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
    case 'answerSituation': {
      answerSituation(state, derived, effects, input.uid, input.optionId);
      break;
    }
    case 'acceptJob': {
      acceptJob(state, effects, input.uid);
      break;
    }
    case 'abandonManifest': {
      loseManifest(state, effects, 'abandoned');
      break;
    }
    case 'deliverManifest': {
      deliverManifest(state, effects);
      break;
    }
    case 'prospectSeam': {
      prospectSeam(state, effects, input.id);
      break;
    }
    case 'placeRig': {
      placeRig(state, effects, input.id);
      break;
    }
    case 'collectRig': {
      collectRig(state, effects, input.id);
      break;
    }
    case 'startMegaproject': {
      startMegaproject(state, effects, input.id);
      break;
    }
    case 'resolveInterdiction': {
      state.expedition.interdictions += 1;
      if (input.outcome === 'complied') loseManifest(state, effects, 'complied');
      effects.push({ t: 'interdicted', outcome: input.outcome });
      break;
    }
    case 'devSpawn': {
      if (input.what === 'situation') spawnSituation(state, derived, effects);
      else if (input.what === 'vogon') spawnVogons(state, derived, effects, false, true);
      else if (input.what === 'bubble') spawnBubble(state, derived, effects);
      else if (input.what === 'broadcast') {
        // Force the channel's next line immediately (headless verification).
        state.subEtha.nextBroadcastMs = 0;
        stepSubEtha(state);
      } else spawnEvent(state, derived, effects);
      break;
    }
  }
}

// ————————————————— Prestige —————————————————

export function doPrestige(state: GameState, effects: SimEffect[]): void {
  if (!prestigeEligible(state)) return;
  const bp = prestigeBpFor(state);

  state.prestige.bp += bp;
  state.prestige.bpEarned += bp;
  state.lifetime.prestiges += 1;
  const persistentCompleted = state.research.completed.filter(
    (id) => RESEARCH_BY_ID[id]?.survivesPrestige,
  );
  const persistentActive = state.research.active && RESEARCH_BY_ID[state.research.active.id]?.survivesPrestige
    ? { ...state.research.active } : null;
  prepareOperationsForPrestige(state, effects);

  // Reset the run; keep the lifetime.
  state.tu = DZERO;
  state.science = DZERO;
  state.buildings = {};
  state.upgrades = {};
  state.research = {
    completed: persistentCompleted,
    active: persistentActive,
  };
  state.buffs = [];
  state.bubbles = [];
  state.activeEvents = [];
  // Open questions went with the portfolio that raised them.
  state.situations = [];
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
    // A fresh portfolio: nothing is neglected yet, and nothing is owed.
    standing: {},
    // The worlds that were asking went with the sale.
    petitions: [],
  };

  // Catalogue perks that shape the new run.
  const derived = computeDerived(state);
  if (derived.startProbes > 0) state.buildings['seedProbe'] = derived.startProbes;

  state.planet = generatePlanet(state.rng, {
    runIndex: 0,
    lifetimeIndex: state.lifetime.planetsCompleted + 1,
    headStart: derived.headStart,
    startedAtGameMs: state.gameTimeMs,
  });

  state.timers.nextBubbleMs = C.FIRST_BUBBLE_MS;
  state.timers.nextEventMs = randRange(state.rng, 'events', C.FIRST_EVENT_MIN_MS, C.FIRST_EVENT_MAX_MS);
  state.timers.nextVogonMs =
    C.VOGON_EARLIEST_MS + randRange(state.rng, 'vogons', 0, C.VOGON_MAX_GAP_MS - C.VOGON_MIN_GAP_MS);
  state.timers.stallMs = 0;
  state.timers.sinceBubbleCatchMs = 0;

  refreshContractBoard(state, effects);
  effects.push({ t: 'prestiged', bp });
}

// ————————————————— Planet completion —————————————————

function completePlanet(
  state: GameState,
  derived: Derived,
  effects: SimEffect[],
  bottleneck: AspectId,
): void {
  const finished = state.planet;
  const bonus = derived.tuPerSec.mul(C.PLANET_BONUS_SECONDS).max(D(C.PLANET_BONUS_MIN));
  addTu(state, bonus);

  state.run.planetsCompleted += 1;
  state.lifetime.planetsCompleted += 1;
  // The world keeps the hardware that delivered it, forever. A delivery
  // with nothing on the books (dev grants, strange runs) still deserves
  // plausible gear — no world ships empty.
  const loadout = snapshotInstallations(state.buildings);
  const completed = {
    lifetimeIndex: finished.lifetimeIndex,
    seed: finished.seed,
    type: finished.type,
    size: finished.size,
    name: finished.name,
    quirks: [...finished.quirks],
    survey: finished.survey,
    completionMs: Math.max(0, state.gameTimeMs - finished.startedAtGameMs),
    bottleneck,
    installations:
      loadout.length > 0
        ? loadout
        : deriveLegacyInstallations({ seed: finished.seed, bottleneck, survey: finished.survey }),
  };
  state.timers.stallMs = 0;

  effects.push({
    t: 'planetComplete',
    name: finished.name,
    lifetimeIndex: finished.lifetimeIndex,
    bonus,
  });
  state.run.completedPlanets.push(completed);
  progressContractOnPlanet(state, completed, derived.totalBuildings, effects);

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
    progressContractOnSystem(state, effects);
  }

  state.planet = generatePlanet(state.rng, {
    runIndex: finished.index + 1,
    lifetimeIndex: state.lifetime.planetsCompleted + 1,
    startedAtGameMs: state.gameTimeMs,
    headStart: derived.headStart,
  });
  if (state.planet.surveyOptions) effects.push({ t: 'surveyOffered' });
}

// ————————————————— The chronicle —————————————————

/**
 * Turn a notable effect into a line on the Sub-Etha.
 *
 * Called from inside the tick loop rather than once at the end of `step`,
 * because an entry's timestamp is `gameTimeMs` — chronicling in a batch would
 * stamp every entry of a two-hour catch-up with the same moment, and one
 * 2-hour step would stop matching 120 one-minute steps (engine law #1).
 */
function chronicleEffect(state: GameState, effect: SimEffect): void {
  switch (effect.t) {
    case 'planetComplete':
      fileBroadcast(state, 'chronicle', CHRONICLE.planetDelivered(effect.name));
      break;
    case 'systemFormed':
      fileBroadcast(state, 'chronicle', CHRONICLE.systemFormed(effect.count));
      break;
    case 'galaxyFormed':
      fileBroadcast(state, 'chronicle', CHRONICLE.galaxyFormed(effect.count));
      break;
    case 'researchDone':
      fileBroadcast(
        state,
        'chronicle',
        CHRONICLE.researchDone(RESEARCH_BY_ID[effect.id]?.name ?? effect.id),
      );
      break;
    case 'contractCompleted':
      fileBroadcast(
        state,
        'chronicle',
        CHRONICLE.contractCompleted(FACTION_LABEL[effect.faction] ?? 'The client'),
      );
      break;
    case 'contractFailed':
      // An abandonment is your own doing and does not need announcing.
      if (effect.reason !== 'abandoned') {
        fileBroadcast(state, 'chronicle', CHRONICLE.contractFailed('The filing office'));
      }
      break;
    case 'siteScanned':
      fileBroadcast(
        state,
        'chronicle',
        CHRONICLE.siteScanned(DEEP_FIELD_BY_ID[effect.id]?.name ?? effect.id),
      );
      break;
    case 'siteBoarded':
      fileBroadcast(
        state,
        'chronicle',
        CHRONICLE.siteBoarded(DEEP_FIELD_BY_ID[effect.id]?.name ?? effect.id, effect.salvage),
      );
      break;
    case 'situationResolved':
      fileBroadcast(state, 'chronicle', CHRONICLE.situationResolved(effect.text));
      break;
    case 'manifestDelivered':
      fileBroadcast(
        state,
        'chronicle',
        CHRONICLE.manifestDelivered(effect.to, effect.salvage, effect.passenger),
      );
      break;
    case 'rigPlaced':
      fileBroadcast(state, 'chronicle', CHRONICLE.rigPlaced(SEAM_BY_ID[effect.id]?.name ?? effect.id));
      break;
    case 'megaprojectFinished':
      fileBroadcast(
        state,
        'chronicle',
        CHRONICLE.megaprojectFinished(MEGAPROJECT_BY_ID[effect.id]?.name ?? effect.id),
      );
      break;
    case 'interdicted':
      fileBroadcast(state, 'chronicle', CHRONICLE.interdicted(effect.outcome));
      break;
    case 'prestiged':
      fileBroadcast(state, 'chronicle', CHRONICLE.prestiged());
      break;
    case 'vogonStart':
      fileBroadcast(state, 'chronicle', CHRONICLE.vogonStart());
      break;
    default:
      break; // clicks, bubbles, achievements — the channel has standards
  }
}

const FACTION_LABEL: Record<string, string> = {
  magrathea: 'Magrathea',
  mice: 'The mice',
  vogon: 'The Vogon clerks',
};

/** Chronicle everything appended to `effects` since index `from`. */
function chronicleSince(state: GameState, effects: SimEffect[], from: number): void {
  const to = effects.length;
  for (let i = from; i < to; i++) chronicleEffect(state, effects[i]!);
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
  ensureContractBoard(state);
  expireContract(state, effects);

  let completionBottleneck = lowestGauge(state.planet);
  const beforeInputs = effects.length;
  for (const input of inputs) {
    if (input.type === 'click' || input.type === 'devGrant') completionBottleneck = lowestGauge(state.planet);
    handleInput(state, input, effects, opts);
  }
  if (planetComplete(state.planet)) {
    completePlanet(state, computeDerived(state, opts), effects, completionBottleneck);
  }
  chronicleSince(state, effects, beforeInputs);

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
    const beforeTick = effects.length;

    // 1) Accrue one tick of production.
    const tickBottleneck = lowestGauge(state.planet);
    if (rates.tuPerTick.gt(0)) addTu(state, rates.tuPerTick);
    if (rates.sciencePerTick.gt(0)) state.science = state.science.add(rates.sciencePerTick);
    for (const a of ASPECTS) {
      const gain = rates.aspectPerTick[a];
      if (gain.gt(0)) fillGauge(state, a, gain, derived.overflowRates[a]);
    }
    state.gameTimeMs += TICK;
    state.timers.stallMs += TICK;
    state.timers.sinceBubbleCatchMs += TICK;
    if (expireContract(state, effects)) dirty = true;

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

    // 2b) The two systems that deliberately keep working while nobody is
    //     watching. A rig was left behind precisely so it would, and a
    //     megaproject's whole point is being what happened while you were
    //     gone — see engine/megaprojects.ts for why it also ignores
    //     offline efficiency.
    if (stepRigs(state, TICK)) dirty = true;
    stepMegaprojectSalvage(state, TICK);
    if (stepMegaprojects(state, effects, TICK)) dirty = true;

    // 3) Spawns (suppressed offline; the universe waits for an audience).
    if (!offline) {
      if ((state.timers.nextBubbleMs -= TICK) <= 0) spawnBubble(state, derived, effects);
      if ((state.timers.nextVogonMs -= TICK) <= 0) {
        spawnVogons(state, derived, effects);
        dirty = true;
      }
      // Situations spawn AND count down only in the foreground: the clock on
      // a question must not run while there is nobody there to answer it.
      //
      // Note what is NOT here any more: the random buff event. Those still
      // exist as a MECHANISM — half the situation outcomes hand you one — but
      // they no longer arrive on their own, because a multiplier that turns up
      // uninvited, asks nothing and leaves nothing behind is indistinguishable
      // from the number going up by itself. Every buff is now something you
      // were given for choosing well. `state.timers.nextEventMs` survives in
      // the save so old files still load; nothing reads it.
      if ((state.timers.nextSituationMs -= TICK) <= 0) {
        spawnSituation(state, derived, effects);
        dirty = true;
      }
      if (stepSituations(state, derived, effects, TICK)) dirty = true;
      // Petitions queue instead of interrupting, so they may be more frequent.
      if ((state.timers.nextPetitionMs -= TICK) <= 0) {
        spawnPetition(state, effects);
        dirty = true;
      }
      if (stepPetitions(state, derived, effects, TICK)) dirty = true;
      // The freight board is a clock, not a decision — safe to run unattended,
      // and it only ever offers work between worlds you actually delivered.
      if ((state.expedition.nextJobMs -= TICK) <= 0) {
        state.expedition.nextJobMs = C.JOB_REFRESH_MS;
        refreshJobBoard(state);
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
      completePlanet(state, derived, effects, tickBottleneck);
      dirty = true;
    }

    // 5) Achievements each tick — their +1% bonus must land at the same
    //    tick regardless of how the caller chunks time.
    if (checkAchievements(state, derived, effects)) dirty = true;

    // 6) The Sub-Etha. Unlike spawns this runs OFFLINE TOO: it is a record,
    //    not a reward, and coming back to read what the universe said while
    //    you were out is the entire point of the channel.
    stepSubEtha(state);
    chronicleSince(state, effects, beforeTick);
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
