import { C } from '../content/constants';
import { BUILDINGS, BUILDING_BY_ID } from '../content/buildings';
import { UPGRADES, UPGRADE_BY_ID, type UpgradeDef } from '../content/upgrades';
import { RESEARCH_BY_ID } from '../content/research';
import { PLANET_TYPE_BY_ID } from '../content/planetTypes';
import { QUIRK_BY_ID } from '../content/quirks';
import { SURVEY_BY_ID } from '../content/surveys';
import { CATALOGUE } from '../content/catalogue';
import { EVENT_BY_ID } from '../content/events';
import { D, DZERO, Decimal } from './num';
import { ASPECTS, type AspectId, type Derived, type GameState, type StepOptions } from './types';

/** BP that a prestige right now would award. */
export function prestigeBpFor(state: GameState): number {
  const fromTu = state.run.tuEarned.div(D(C.PRESTIGE_TU_DIVISOR));
  const tuPart = fromTu.gt(0) ? Math.pow(fromTu.toNumber(), C.PRESTIGE_TU_EXP) : 0;
  const planetPart = C.PRESTIGE_PER_PLANET * state.run.planetsCompleted;
  return Math.floor(tuPart + planetPart);
}

function perkRank(state: GameState, id: string): number {
  return state.prestige.catalogue[id] ?? 0;
}

/** Assemble every derived number from persisted state. Engine law #3 lives here. */
export function computeDerived(state: GameState, opts: StepOptions = {}): Derived {
  const has = (id: string) => (state.upgrades[id] ?? 0) > 0;

  // ——— per-building multipliers from upgrades ———
  const buildingMults: Record<string, Decimal> = {};
  for (const b of BUILDINGS) buildingMults[b.id] = D(1);
  let clickAdd = 0;
  let clickMult = 1;
  let clickTupsPct = 0;
  let allMult = D(1);
  const aspectMult: Record<AspectId, number> = { thermal: 1, atmo: 1, hydro: 1, bio: 1 };

  for (const u of UPGRADES) {
    if (!has(u.id)) continue;
    for (const e of u.effects) {
      switch (e.kind) {
        case 'clickAdd':
          clickAdd += e.v;
          break;
        case 'clickMult':
          clickMult *= e.v;
          break;
        case 'clickTupsPct':
          clickTupsPct += e.v;
          break;
        case 'buildingMult':
          buildingMults[e.building] = (buildingMults[e.building] ?? D(1)).mul(e.v);
          break;
        case 'allMult':
          allMult = allMult.mul(e.v);
          break;
        case 'aspectMult':
          aspectMult[e.aspect] *= e.v;
          break;
      }
    }
  }

  // ——— research effects ———
  let scienceMult = 1;
  let offlineEfficiency: number = C.OFFLINE_EFFICIENCY;
  let offlineCapMs: number = C.OFFLINE_CAP_MS;
  let vogonHalve = false;
  let eventFreqMult = 1;
  let bubbleLifetimeMs: number = C.BUBBLE_LIFETIME_MS;
  let costGrowth: number = C.COST_GROWTH;
  let researchSpeedMult = 1;
  let answer = false;

  for (const id of state.research.completed) {
    const def = RESEARCH_BY_ID[id];
    if (!def) continue;
    for (const e of def.effects) {
      switch (e.kind) {
        case 'aspectMult':
          aspectMult[e.aspect] *= e.v;
          break;
        case 'allMult':
          allMult = allMult.mul(e.v);
          break;
        case 'clickMult':
          clickMult *= e.v;
          break;
        case 'scienceMult':
          scienceMult *= e.v;
          break;
        case 'offlineEfficiency':
          offlineEfficiency = Math.max(offlineEfficiency, e.v);
          break;
        case 'offlineCapAddMs':
          offlineCapMs += e.v;
          break;
        case 'vogonHalve':
          vogonHalve = true;
          break;
        case 'eventFreqMult':
          eventFreqMult *= e.v;
          break;
        case 'bubbleLifetimeAddMs':
          bubbleLifetimeMs += e.v;
          break;
        case 'costGrowthDelta':
          costGrowth += e.v;
          break;
        case 'researchSpeedMult':
          researchSpeedMult *= e.v;
          break;
        case 'answer':
          answer = true;
          break;
      }
    }
  }

  // ——— catalogue perks ———
  let costMult = 1;
  let headStart = 0;
  let startProbes = 0;
  let goldenOddsMult = 1;
  let marvinMult = 1;
  for (const perk of CATALOGUE) {
    const rank = perkRank(state, perk.id);
    if (rank <= 0) continue;
    const e = perk.effect;
    switch (e.kind) {
      case 'startProbes':
        startProbes += e.perRank * rank;
        break;
      case 'costMultPerRank':
        costMult *= Math.pow(e.v, rank);
        break;
      case 'headStartPerRank':
        headStart += e.v * rank;
        break;
      case 'eventFreqPerRank':
        eventFreqMult *= Math.pow(e.v, rank);
        break;
      case 'bubbleLifetimePerRankMs':
        bubbleLifetimeMs += e.v * rank;
        break;
      case 'goldenOddsPerRank':
        goldenOddsMult *= Math.pow(e.v, rank);
        break;
      case 'offlineCapPerRankMs':
        offlineCapMs += e.v * rank;
        break;
      case 'offlineEffPerRank':
        offlineEfficiency = Math.min(1, offlineEfficiency + e.v * rank);
        break;
      case 'marvinMultPerRank':
        marvinMult *= Math.pow(e.v, rank);
        break;
    }
  }

  // ——— planet context: type bias, quirks, survey ———
  const planetType = PLANET_TYPE_BY_ID[state.planet.type];
  const overflowRates: Record<AspectId, number> = {
    thermal: C.OVERFLOW_RATE,
    atmo: C.OVERFLOW_RATE,
    hydro: C.OVERFLOW_RATE,
    bio: C.OVERFLOW_RATE,
  };
  let quirkEventFreq = 1;
  let quirkBubbleFreq = 1;
  let mondayMult = 1;
  let vogonsBlocked = false;

  for (const qid of state.planet.quirks) {
    const q = QUIRK_BY_ID[qid];
    if (!q) continue;
    if (q.prodMult) for (const a of ASPECTS) aspectMult[a] *= q.prodMult[a] ?? 1;
    if (q.overflowRate) for (const a of ASPECTS) overflowRates[a] = q.overflowRate[a] ?? overflowRates[a];
    if (q.eventFreq) quirkEventFreq *= q.eventFreq;
    if (q.bubbleFreq) quirkBubbleFreq *= q.bubbleFreq;
    if (q.mondayMult && opts.utcDay === 1) mondayMult *= q.mondayMult;
    if (q.noVogons) vogonsBlocked = true;
  }

  if (state.planet.survey) {
    const sv = SURVEY_BY_ID[state.planet.survey];
    if (sv) {
      if (sv.prodMult) for (const a of ASPECTS) aspectMult[a] *= sv.prodMult[a] ?? 1;
      if (sv.allProdMult) allMult = allMult.mul(sv.allProdMult);
      if (sv.eventFreq) quirkEventFreq *= sv.eventFreq;
      if (sv.noVogons) vogonsBlocked = true;
    }
  }

  if (planetType) {
    for (const a of ASPECTS) aspectMult[a] *= planetType.prodBias[a];
  }

  // ——— global production multiplier chain ———
  let prodMult = allMult
    .mul(1 + C.ACHIEVEMENT_BONUS * Object.keys(state.achievements).length)
    .mul(Decimal.pow(1 + C.BP_PASSIVE, state.prestige.bpEarned))
    .mul(1 + C.SYSTEM_BONUS * state.run.systems)
    .mul(Decimal.pow(C.GALAXY_MULT, state.run.galaxies))
    .mul(mondayMult);
  if (answer) prodMult = prodMult.mul(C.ANSWER_MULT);

  // Buffs (bubbles) and events
  let buffClickMult = 1;
  for (const buff of state.buffs) {
    prodMult = prodMult.mul(buff.mult);
    buffClickMult *= buff.clickMult;
  }
  const eventAspectMult: Record<AspectId, number> = { thermal: 1, atmo: 1, hydro: 1, bio: 1 };
  let eventClickMult = 1;
  for (const ae of state.activeEvents) {
    const def = EVENT_BY_ID[ae.id];
    if (!def) continue;
    if (def.prodMult) prodMult = prodMult.mul(def.prodMult);
    if (def.clickMult) eventClickMult *= def.clickMult;
    if (def.aspectMult) for (const a of ASPECTS) eventAspectMult[a] *= def.aspectMult[a] ?? 1;
  }

  // Vogon reading debuff
  const vogonDebuffMult = state.vogon ? 1 - C.VOGON_DEBUFF * (vogonHalve ? 0.5 : 1) : 1;
  prodMult = prodMult.mul(vogonDebuffMult);

  // Workshop: +2% aspect fill per workshop
  const workshopCount = state.buildings['magratheanWorkshop'] ?? 0;
  const workshopAspect = Math.pow(1 + C.WORKSHOP_ASPECT_BONUS, workshopCount);

  // ——— production sums ———
  let tuPerSec = DZERO;
  let sciencePerSec = DZERO;
  const aspectPerSec: Record<AspectId, Decimal> = {
    thermal: DZERO,
    atmo: DZERO,
    hydro: DZERO,
    bio: DZERO,
  };

  let totalBuildings = 0;
  for (const b of BUILDINGS) {
    const count = state.buildings[b.id] ?? 0;
    if (count <= 0) continue;
    totalBuildings += count;
    const bMult = (buildingMults[b.id] ?? D(1)).mul(prodMult);
    if (b.tuPerSec > 0) tuPerSec = tuPerSec.add(bMult.mul(b.tuPerSec * count));
    if (b.sciencePerSec) sciencePerSec = sciencePerSec.add(bMult.mul(b.sciencePerSec * count * scienceMult));
    for (const a of ASPECTS) {
      const rate = b.aspects[a];
      if (rate) {
        aspectPerSec[a] = aspectPerSec[a].add(bMult.mul(rate * count * aspectMult[a] * workshopAspect));
      }
    }
  }

  // ——— click power ———
  let clickPower = D(C.CLICK_BASE + clickAdd)
    .mul(clickMult)
    .mul(buffClickMult)
    .mul(eventClickMult)
    .mul(prodMult);
  if (clickTupsPct > 0) clickPower = clickPower.add(tuPerSec.mul(clickTupsPct));

  // Marvin: automated clicking, against his will
  const marvinClicksPerSec =
    (state.buildings['marvin'] ?? 0) > 0 ? C.MARVIN_CLICKS_PER_SEC * marvinMult : 0;
  if (marvinClicksPerSec > 0) tuPerSec = tuPerSec.add(clickPower.mul(marvinClicksPerSec));

  // Towel: +42% offline cap
  if (state.achievements['towel'] !== undefined) offlineCapMs = Math.round(offlineCapMs * 1.42);

  return {
    tuPerSec,
    sciencePerSec,
    aspectPerSec,
    clickPower,
    marvinClicksPerSec,
    costGrowth,
    costMult,
    buildingMults,
    prodMult,
    eventFreqMult: eventFreqMult * quirkEventFreq,
    bubbleFreqMult: quirkBubbleFreq,
    bubbleLifetimeMs,
    goldenOddsMult,
    offlineEfficiency,
    offlineCapMs,
    vogonDebuffMult,
    vogonsBlocked,
    researchSpeedMult,
    overflowRates,
    headStart,
    startProbes,
    prestigeBp: prestigeBpFor(state),
    totalBuildings,
  };
}

/** Cost of the next building of `id` given `owned` already owned. */
export function buildingCost(id: string, owned: number, derived: Derived): Decimal {
  const def = BUILDING_BY_ID[id];
  if (!def) return DZERO;
  return D(def.baseCost).mul(Decimal.pow(derived.costGrowth, owned)).mul(derived.costMult);
}

/** Total cost of buying `qty` starting from `owned` (geometric series). */
export function bulkCost(id: string, owned: number, qty: number, derived: Derived): Decimal {
  const def = BUILDING_BY_ID[id];
  if (!def || qty <= 0) return DZERO;
  const g = derived.costGrowth;
  const first = buildingCost(id, owned, derived);
  // first × (g^qty − 1)/(g − 1)
  return first.mul(Decimal.pow(g, qty).sub(1)).div(g - 1);
}

/** Largest affordable purchase count for `id`. */
export function maxAffordable(id: string, owned: number, tu: Decimal, derived: Derived): number {
  const def = BUILDING_BY_ID[id];
  if (!def) return 0;
  if (def.unique) return owned === 0 && tu.gte(buildingCost(id, 0, derived)) ? 1 : 0;
  const g = derived.costGrowth;
  const first = buildingCost(id, owned, derived);
  if (tu.lt(first)) return 0;
  // qty = floor(log_g(tu(g−1)/first + 1))
  const ratio = tu.mul(g - 1).div(first).add(1);
  const qty = Math.floor(ratio.log10() / Math.log10(g));
  // Guard against float edges.
  let n = Math.max(1, qty);
  while (n > 1 && bulkCost(id, owned, n, derived).gt(tu)) n--;
  return n;
}

/** Is this upgrade visible in the shop yet? */
export function upgradeVisible(u: UpgradeDef, state: GameState, derived: Derived): boolean {
  if ((state.upgrades[u.id] ?? 0) > 0) return false;
  if (u.requiresUpgrade && !(state.upgrades[u.requiresUpgrade] ?? 0)) return false;
  if (u.unlockAtTu !== undefined && state.run.tuEarned.lt(u.unlockAtTu)) return false;
  if (u.requiresTotalBuildings !== undefined && derived.totalBuildings < u.requiresTotalBuildings)
    return false;
  if (u.requiresBuilding) {
    for (const [bid, n] of Object.entries(u.requiresBuilding)) {
      if ((state.buildings[bid] ?? 0) < n) return false;
    }
  }
  return true;
}

export { UPGRADE_BY_ID };
