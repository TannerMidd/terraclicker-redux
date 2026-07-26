import { C } from '../content/constants';
import { randInt, sample } from './rng';
import {
  ASPECTS,
  type ActiveContract,
  type CompletedPlanetRecord,
  type ContractOffer,
  type ContractObjective,
  type ContractTemplateId,
  type FactionId,
  type GameState,
  type OperationsState,
  type SimEffect,
  type SystemSpecialty,
} from './types';

export const CONTRACT_TEMPLATE_IDS: readonly ContractTemplateId[] = [
  'delivery',
  'system',
  'bottleneck',
  'survey',
  'lean',
  'timed',
];

export const SYSTEM_SPECIALTIES: readonly SystemSpecialty[] = [
  ...ASPECTS,
  'science',
  'production',
];

/** Routes justified by the five delivered worlds that formed a system. */
export function specialtiesForSystem(state: GameState, systemIndex: number): SystemSpecialty[] {
  if (!Number.isInteger(systemIndex) || systemIndex < 0 || systemIndex >= state.run.systems) {
    return [];
  }
  const start = systemIndex * C.PLANETS_PER_SYSTEM;
  const worlds = state.run.completedPlanets.slice(start, start + C.PLANETS_PER_SYSTEM);
  const lifetimeIndices = new Set(worlds.map((world) => world.lifetimeIndex));
  const trustworthy =
    worlds.length === C.PLANETS_PER_SYSTEM
    && lifetimeIndices.size === C.PLANETS_PER_SYSTEM
    && worlds.every(
      (world) => world.completionMs > 0 && ASPECTS.includes(world.bottleneck),
    );

  // Old saves did not retain enough biography to justify a restriction.
  if (!trustworthy) return [...SYSTEM_SPECIALTIES];

  const eligible: SystemSpecialty[] = ASPECTS.filter((aspect) =>
    worlds.some((world) => world.bottleneck === aspect),
  );
  if (worlds.filter((world) => world.survey !== null).length >= 2) {
    eligible.push('science');
  }
  eligible.push('production');
  return eligible;
}

const FACTION_BY_TEMPLATE: Record<ContractTemplateId, FactionId> = {
  delivery: 'magrathea',
  system: 'magrathea',
  bottleneck: 'mice',
  survey: 'mice',
  lean: 'vogon',
  timed: 'vogon',
};

/**
 * DESIGN.md §3.10: contracts pay "modest BP and faction reputation". Modest per
 * contract was always true — nothing here has ever paid more than 1 — but the
 * board files offers continuously, and twenty-five of them out-minted the
 * portfolio sale that the entire prestige layer is built around. Magrathea is
 * supposed to be where Blueprints come from; the Guide is supposed to be where
 * standing comes from.
 *
 * So BP is now reserved for the two objectives that genuinely constrain a
 * build: forming a system on request, and delivering a world under a lean
 * filing. Routine work — deliveries, surveys, bottlenecks, beating a clock —
 * pays reputation instead, which is not a lesser currency: it gates the
 * megaprojects and it raises the endorsement in `standingRewardBpBonus`, which
 * remains the capped path from good standing back to Blueprints.
 */
const REWARD_BY_TEMPLATE: Record<
  ContractTemplateId,
  { rewardBp: number; rewardReputation: number }
> = {
  delivery: { rewardBp: 0, rewardReputation: 2 },
  system: { rewardBp: 1, rewardReputation: 3 },
  bottleneck: { rewardBp: 0, rewardReputation: 3 },
  survey: { rewardBp: 0, rewardReputation: 2 },
  lean: { rewardBp: 1, rewardReputation: 3 },
  timed: { rewardBp: 0, rewardReputation: 4 },
};

export function standingRewardBpBonus(reputation: number): number {
  return Math.min(
    C.CONTRACT_REPUTATION_BP_CAP,
    Math.floor(Math.max(0, reputation) / C.CONTRACT_REPUTATION_PER_BP),
  );
}

export function createOperationsState(): OperationsState {
  return {
    offers: [],
    active: null,
    completed: [],
    reputation: { magrathea: 0, mice: 0, vogon: 0 },
    offerGeneration: 0,
    rerolledAtSystem: -1,
    systemSpecialties: {},
    heritageCandidateLifetimeIndex: null,
    heritageWorlds: [],
  };
}

export function dispatchSlotsFor(state: GameState): number {
  return Math.min(
    C.CONTRACT_DISPATCH_MAX,
    C.CONTRACT_DISPATCH_BASE
      + Math.floor(state.operations.completed.length / C.CONTRACTS_PER_DISPATCH_SLOT),
  );
}

/** Canonical, formed-system assignments in stable system order, capped by earned slots. */
export function appliedSystemSpecialties(state: GameState): SystemSpecialty[] {
  return Object.entries(state.operations.systemSpecialties)
    .filter(([key, specialty]) => {
      if (!/^(0|[1-9]\d*)$/.test(key) || !SYSTEM_SPECIALTIES.includes(specialty)) return false;
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= state.run.systems) return false;
      return specialtiesForSystem(state, index).includes(specialty);
    })
    .sort(([left], [right]) => Number(left) - Number(right))
    .slice(0, dispatchSlotsFor(state))
    .map(([, specialty]) => specialty);
}

export function dispatchesUsedBy(state: GameState): number {
  return appliedSystemSpecialties(state).length;
}

function currentBuildingCount(state: GameState): number {
  return Object.values(state.buildings).reduce((sum, count) => sum + Math.max(0, count), 0);
}

function objectiveFor(state: GameState, templateId: ContractTemplateId): ContractObjective {
  switch (templateId) {
    case 'delivery':
      return { kind: 'planets', count: randInt(state.rng, 'contracts', 2, 4) };
    case 'system':
      return { kind: 'systems', count: 1 };
    case 'bottleneck':
      return {
        kind: 'bottleneck',
        aspect: ASPECTS[randInt(state.rng, 'contracts', 0, ASPECTS.length)]!,
        count: randInt(state.rng, 'contracts', 1, 3),
      };
    case 'survey':
      return { kind: 'surveyed', count: randInt(state.rng, 'contracts', 1, 3) };
    case 'lean':
      return {
        kind: 'lean',
        maxBuildings: currentBuildingCount(state) + randInt(state.rng, 'contracts', 8, 13),
        count: 1,
      };
    case 'timed':
      return {
        kind: 'timed',
        count: 1,
        durationMs: randInt(state.rng, 'contracts', 8, 13) * 60_000,
      };
  }
}

function makeOffer(
  state: GameState,
  templateId: ContractTemplateId,
  generation: number,
  slot: number,
): ContractOffer {
  const nonce = randInt(state.rng, 'contracts', 0, 0x1000000).toString(36).padStart(5, '0');
  const faction = FACTION_BY_TEMPLATE[templateId];
  const baseReward = REWARD_BY_TEMPLATE[templateId];
  return {
    id: `contract-r${state.run.number}-g${generation}-s${slot}-${nonce}`,
    templateId,
    faction,
    objective: objectiveFor(state, templateId),
    rewardBp: baseReward.rewardBp + standingRewardBpBonus(state.operations.reputation[faction]),
    rewardReputation: baseReward.rewardReputation,
  };
}

/** Replace the idle board with three distinct deterministic templates. */
export function refreshContractBoard(state: GameState, effects?: SimEffect[]): boolean {
  if (state.operations.active) return false;
  const generation = state.operations.offerGeneration + 1;
  // A new player needs one promise they can understand immediately. The
  // remaining two slots retain the seeded variety, but the first filing is
  // always one current-loop delivery rather than a survey or whole system.
  const firstBoard = state.operations.offerGeneration === 0
    && state.lifetime.planetsCompleted === 0;
  const templates: ContractTemplateId[] = firstBoard
    ? [
        'delivery',
        ...sample(
          state.rng,
          'contracts',
          CONTRACT_TEMPLATE_IDS.filter((id) => id !== 'delivery'),
          C.CONTRACT_OFFER_COUNT - 1,
        ),
      ]
    : sample(state.rng, 'contracts', CONTRACT_TEMPLATE_IDS, C.CONTRACT_OFFER_COUNT);
  state.operations.offerGeneration = generation;
  state.operations.offers = templates.map((templateId, slot) => {
    const offer = makeOffer(state, templateId, generation, slot);
    if (firstBoard && slot === 0) offer.objective = { kind: 'planets', count: 1 };
    return offer;
  });
  effects?.push({ t: 'contractBoardRefreshed', generation });
  return true;
}

export function ensureContractBoard(state: GameState): void {
  if (!state.operations.active && state.operations.offers.length !== C.CONTRACT_OFFER_COUNT) {
    refreshContractBoard(state);
  }
}

export function contractTarget(active: ActiveContract): number {
  return active.offer.objective.count;
}

export function acceptContract(state: GameState, id: string, effects: SimEffect[]): boolean {
  if (state.operations.active) return false;
  const offer = state.operations.offers.find((candidate) => candidate.id === id);
  if (!offer) return false;
  const objective = offer.objective;
  state.operations.active = {
    offer: {
      ...offer,
      objective: { ...objective },
    },
    acceptedAtGameMs: state.gameTimeMs,
    startPlanets: state.run.planetsCompleted,
    startSystems: state.run.systems,
    progress: 0,
    deadlineAtGameMs:
      objective.kind === 'timed' ? state.gameTimeMs + objective.durationMs : null,
  };
  state.operations.offers = [];
  effects.push({ t: 'contractAccepted', id });
  return true;
}

export function rerollContracts(state: GameState, effects: SimEffect[]): boolean {
  if (state.operations.active) return false;
  if (state.operations.rerolledAtSystem === state.run.systems) return false;
  state.operations.rerolledAtSystem = state.run.systems;
  return refreshContractBoard(state, effects);
}

function finishActiveContract(state: GameState, effects: SimEffect[]): void {
  const active = state.operations.active;
  if (!active) return;
  const { offer } = active;
  state.prestige.bp += offer.rewardBp;
  state.prestige.bpEarned += offer.rewardBp;
  state.operations.reputation[offer.faction] += offer.rewardReputation;
  state.operations.completed.push({
    id: offer.id,
    templateId: offer.templateId,
    faction: offer.faction,
    completedAtGameMs: state.gameTimeMs,
    rewardBp: offer.rewardBp,
    rewardReputation: offer.rewardReputation,
  });
  state.operations.active = null;
  effects.push({
    t: 'contractCompleted',
    id: offer.id,
    templateId: offer.templateId,
    faction: offer.faction,
    rewardBp: offer.rewardBp,
    rewardReputation: offer.rewardReputation,
  });
  refreshContractBoard(state, effects);
}

function failActiveContract(
  state: GameState,
  effects: SimEffect[],
  reason: 'deadline' | 'prestige' | 'abandoned',
  refresh: boolean,
): void {
  const active = state.operations.active;
  if (!active) return;
  effects.push({
    t: 'contractFailed',
    id: active.offer.id,
    templateId: active.offer.templateId,
    reason,
  });
  state.operations.active = null;
  if (refresh) refreshContractBoard(state, effects);
}

export function abandonContract(state: GameState, effects: SimEffect[]): boolean {
  if (!state.operations.active) return false;
  failActiveContract(state, effects, 'abandoned', true);
  return true;
}

/** Deadline checks use simulated time, so this behaves identically online and offline. */
export function expireContract(state: GameState, effects: SimEffect[]): boolean {
  const active = state.operations.active;
  if (
    !active
    || active.deadlineAtGameMs === null
    || state.gameTimeMs < active.deadlineAtGameMs
  ) {
    return false;
  }
  failActiveContract(state, effects, 'deadline', true);
  return true;
}

function addProgress(state: GameState, effects: SimEffect[]): boolean {
  const active = state.operations.active;
  if (!active) return false;
  active.progress = Math.min(contractTarget(active), active.progress + 1);
  if (active.progress < contractTarget(active)) return false;
  finishActiveContract(state, effects);
  return true;
}

export function progressContractOnPlanet(
  state: GameState,
  completed: CompletedPlanetRecord,
  totalBuildings: number,
  effects: SimEffect[],
): boolean {
  if (expireContract(state, effects)) return false;
  const active = state.operations.active;
  if (!active) return false;
  const objective = active.offer.objective;
  const qualifies =
    objective.kind === 'planets'
    || objective.kind === 'timed'
    || (objective.kind === 'bottleneck' && objective.aspect === completed.bottleneck)
    || (objective.kind === 'surveyed' && completed.survey !== null)
    || (objective.kind === 'lean' && totalBuildings <= objective.maxBuildings);
  return qualifies ? addProgress(state, effects) : false;
}

export function progressContractOnSystem(state: GameState, effects: SimEffect[]): boolean {
  const active = state.operations.active;
  if (!active || active.offer.objective.kind !== 'systems') return false;
  return addProgress(state, effects);
}

export function assignSystemSpecialty(
  state: GameState,
  systemIndex: number,
  specialty: SystemSpecialty | null,
  effects: SimEffect[],
): boolean {
  if (!Number.isInteger(systemIndex) || systemIndex < 0 || systemIndex >= state.run.systems) {
    return false;
  }
  if (specialty !== null && !specialtiesForSystem(state, systemIndex).includes(specialty)) return false;
  const key = String(systemIndex);
  const alreadyAssigned = state.operations.systemSpecialties[key] !== undefined;
  if (specialty !== null && !alreadyAssigned && dispatchesUsedBy(state) >= dispatchSlotsFor(state)) {
    return false;
  }
  if (specialty === null) delete state.operations.systemSpecialties[key];
  else state.operations.systemSpecialties[key] = specialty;
  effects.push({ t: 'systemSpecialtyAssigned', systemIndex, specialty });
  return true;
}

export function designateHeritage(
  state: GameState,
  lifetimeIndex: number,
  effects: SimEffect[],
): boolean {
  if (!Number.isInteger(lifetimeIndex)) return false;
  const completed = state.run.completedPlanets.find((world) => world.lifetimeIndex === lifetimeIndex);
  if (!completed) return false;
  if (state.operations.heritageWorlds.some((world) => world.lifetimeIndex === lifetimeIndex)) {
    return false;
  }
  state.operations.heritageCandidateLifetimeIndex = lifetimeIndex;
  effects.push({ t: 'heritageDesignated', lifetimeIndex });
  return true;
}

/** Archive the candidate and clear every run-scoped operation before a successful reset. */
export function prepareOperationsForPrestige(state: GameState, effects: SimEffect[]): void {
  if (state.operations.active) failActiveContract(state, effects, 'prestige', false);
  const candidate = state.operations.heritageCandidateLifetimeIndex;
  const completed = candidate === null
    ? undefined
    : state.run.completedPlanets.find((world) => world.lifetimeIndex === candidate);
  if (
    completed
    && !state.operations.heritageWorlds.some((world) => world.lifetimeIndex === completed.lifetimeIndex)
  ) {
    state.operations.heritageWorlds.push({
      ...completed,
      quirks: [...completed.quirks],
      installations: [...completed.installations],
      commissionNumber: state.run.number,
      preservedAtGameMs: state.gameTimeMs,
    });
    effects.push({ t: 'heritageArchived', lifetimeIndex: completed.lifetimeIndex });
  }
  state.operations.offers = [];
  state.operations.active = null;
  state.operations.rerolledAtSystem = -1;
  state.operations.systemSpecialties = {};
  state.operations.heritageCandidateLifetimeIndex = null;
}
