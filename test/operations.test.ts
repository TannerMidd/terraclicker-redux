import { describe, expect, it } from 'vitest';
import { C } from '../src/content/constants';
import { computeDerived } from '../src/engine/economy';
import {
  acceptContract,
  dispatchSlotsFor,
  progressContractOnPlanet,
  progressContractOnSystem,
  refreshContractBoard,
  standingRewardBpBonus,
  specialtiesForSystem,
  SYSTEM_SPECIALTIES,
} from '../src/engine/operations';
import { deserialize, serialize, toSave } from '../src/engine/save/codec';
import { newGame, step, stepOffline } from '../src/engine/sim';
import type {
  CompletedPlanetRecord,
  ContractHistoryEntry,
  ContractObjective,
  ContractOffer,
  ContractTemplateId,
  FactionId,
  GameState,
  SimEffect,
} from '../src/engine/types';

const OPTS = { utcDay: 3 };

function offer(
  id: string,
  templateId: ContractTemplateId,
  faction: FactionId,
  objective: ContractObjective,
  rewardBp = 2,
  rewardReputation = 3,
): ContractOffer {
  return { id, templateId, faction, objective, rewardBp, rewardReputation };
}

function installOffer(state: GameState, contract: ContractOffer): void {
  const fillers = state.operations.offers.filter((candidate) => candidate.id !== contract.id).slice(0, 2);
  state.operations.active = null;
  state.operations.offers = [contract, ...fillers];
  expect(state.operations.offers).toHaveLength(C.CONTRACT_OFFER_COUNT);
}

function completedWorld(
  overrides: Partial<CompletedPlanetRecord> = {},
): CompletedPlanetRecord {
  return {
    lifetimeIndex: 1,
    seed: 101,
    type: 'terrestrial',
    size: 'medium',
    name: 'Test Prospect',
    quirks: [],
    survey: null,
    completionMs: 1_000,
    bottleneck: 'thermal',
    installations: ['seedProbe', 'geoTap'],
    ...overrides,
  };
}

function history(index: number): ContractHistoryEntry {
  return {
    id: `history-${index}`,
    templateId: 'delivery',
    faction: 'magrathea',
    completedAtGameMs: index,
    rewardBp: 1,
    rewardReputation: 1,
  };
}

describe('Operations contract board', () => {
  it('is deterministic, distinct, and isolated to the contracts RNG stream', () => {
    const a = newGame(4242, 0);
    const b = newGame(4242, 0);

    expect(a.operations.offers).toEqual(b.operations.offers);
    expect(a.operations.offers).toHaveLength(C.CONTRACT_OFFER_COUNT);
    expect(new Set(a.operations.offers.map((entry) => entry.templateId)).size).toBe(3);
    expect(a.operations.offerGeneration).toBe(1);
    expect(a.operations.offers[0]).toMatchObject({
      templateId: 'delivery',
      objective: { kind: 'planets', count: 1 },
    });

    const otherStreams = {
      planets: a.rng.planets,
      bubbles: a.rng.bubbles,
      events: a.rng.events,
      vogons: a.rng.vogons,
      visuals: a.rng.visuals,
    };
    const contractsBefore = a.rng.contracts;
    step(a, 0, [{ type: 'rerollContracts' }], OPTS);
    step(b, 0, [{ type: 'rerollContracts' }], OPTS);

    expect(a.operations.offers).toEqual(b.operations.offers);
    expect(a.rng.contracts).not.toBe(contractsBefore);
    expect({
      planets: a.rng.planets,
      bubbles: a.rng.bubbles,
      events: a.rng.events,
      vogons: a.rng.vogons,
      visuals: a.rng.visuals,
    }).toEqual(otherStreams);
  });

  it('turns faction standing into a bounded BP bonus on newly generated offers', () => {
    const baseline = newGame(202, 0);
    const standing = newGame(202, 0);
    standing.operations.reputation = { magrathea: 10, mice: 10, vogon: 10 };

    refreshContractBoard(baseline);
    refreshContractBoard(standing);
    expect(standing.operations.offers).toHaveLength(baseline.operations.offers.length);
    for (let index = 0; index < baseline.operations.offers.length; index++) {
      const baseOffer = baseline.operations.offers[index]!;
      const standingOffer = standing.operations.offers[index]!;
      expect(standingOffer.id).toBe(baseOffer.id);
      expect(standingOffer.templateId).toBe(baseOffer.templateId);
      expect(standingOffer.faction).toBe(baseOffer.faction);
      expect(standingOffer.objective).toEqual(baseOffer.objective);
      expect(standingOffer.rewardBp).toBe(baseOffer.rewardBp + 1);
      expect(standingOffer.rewardReputation).toBe(baseOffer.rewardReputation);
    }

    expect(standingRewardBpBonus(0)).toBe(0);
    expect(standingRewardBpBonus(9)).toBe(0);
    expect(standingRewardBpBonus(10)).toBe(1);
    expect(standingRewardBpBonus(19)).toBe(1);
    expect(standingRewardBpBonus(20)).toBe(1);
    expect(standingRewardBpBonus(10_000)).toBe(1);

    // Blueprints are reserved for the two objectives that constrain a build:
    // forming a system to order, and delivering under a lean filing. The rest
    // pay reputation, which gates megaprojects and feeds the capped
    // endorsement path above. See REWARD_BY_TEMPLATE in engine/operations.ts.
    const expectedBase: Record<ContractTemplateId, number> = {
      delivery: 0,
      system: 1,
      bottleneck: 0,
      survey: 0,
      lean: 1,
      timed: 0,
    };
    const sampled = new Map<ContractTemplateId, number>();
    const catalogue = newGame(203, 0);
    for (let generation = 0; generation < 12; generation++) {
      for (const candidate of catalogue.operations.offers) {
        sampled.set(candidate.templateId, candidate.rewardBp);
      }
      refreshContractBoard(catalogue);
    }
    expect(Object.fromEntries(sampled)).toMatchObject(expectedBase);
    expect(sampled.size).toBe(6);
  });

  it('rejects invalid accepts, rerolls, and dispatches, but permits reassignment and abandonment', () => {
    const state = newGame(8, 0);
    const initialGeneration = state.operations.offerGeneration;

    const invalid = step(state, 0, [{ type: 'acceptContract', id: 'not-an-offer' }], OPTS);
    expect(invalid.effects).toEqual([]);
    expect(state.operations.active).toBeNull();

    const rerolls = step(
      state,
      0,
      [{ type: 'rerollContracts' }, { type: 'rerollContracts' }],
      OPTS,
    );
    expect(state.operations.offerGeneration).toBe(initialGeneration + 1);
    expect(rerolls.effects.filter((effect) => effect.t === 'contractBoardRefreshed')).toHaveLength(1);

    state.run.systems = 2;
    step(
      state,
      0,
      [
        { type: 'assignSystemSpecialty', systemIndex: -1, specialty: 'thermal' },
        { type: 'assignSystemSpecialty', systemIndex: 2, specialty: 'thermal' },
        { type: 'assignSystemSpecialty', systemIndex: 0, specialty: 'thermal' },
        { type: 'assignSystemSpecialty', systemIndex: 1, specialty: 'production' },
      ],
      OPTS,
    );
    expect(state.operations.systemSpecialties).toEqual({ 0: 'thermal' });
    step(
      state,
      0,
      [{ type: 'assignSystemSpecialty', systemIndex: 0, specialty: 'science' }],
      OPTS,
    );
    expect(state.operations.systemSpecialties).toEqual({ 0: 'science' });

    const selected = state.operations.offers[0]!;
    step(state, 0, [{ type: 'acceptContract', id: selected.id }], OPTS);
    const generationWhileActive = state.operations.offerGeneration;
    step(state, 0, [{ type: 'rerollContracts' }], OPTS);
    expect(state.operations.offerGeneration).toBe(generationWhileActive);

    const abandoned = step(state, 0, [{ type: 'abandonContract' }], OPTS);
    expect(state.operations.active).toBeNull();
    expect(state.operations.offers).toHaveLength(3);
    expect(abandoned.effects).toContainEqual({
      t: 'contractFailed',
      id: selected.id,
      templateId: selected.templateId,
      reason: 'abandoned',
    });
  });
});

describe('Operations progress and deadlines', () => {
  it('completes delivery, system, and conditional objectives with BP and reputation rewards', () => {
    const delivery = newGame(10, 0);
    const deliveryOffer = offer(
      'delivery-test',
      'delivery',
      'magrathea',
      { kind: 'planets', count: 1 },
      4,
      5,
    );
    installOffer(delivery, deliveryOffer);
    const deliveryEffects: SimEffect[] = [];
    expect(acceptContract(delivery, deliveryOffer.id, deliveryEffects)).toBe(true);
    expect(progressContractOnPlanet(delivery, completedWorld(), 0, deliveryEffects)).toBe(true);
    expect(delivery.prestige.bp).toBe(4);
    expect(delivery.prestige.bpEarned).toBe(4);
    expect(delivery.operations.reputation.magrathea).toBe(5);
    expect(delivery.operations.completed[0]).toMatchObject({
      id: deliveryOffer.id,
      rewardBp: 4,
      rewardReputation: 5,
    });
    expect(delivery.operations.offers).toHaveLength(3);

    const system = newGame(11, 0);
    const systemOffer = offer(
      'system-test',
      'system',
      'magrathea',
      { kind: 'systems', count: 1 },
    );
    installOffer(system, systemOffer);
    const systemEffects: SimEffect[] = [];
    acceptContract(system, systemOffer.id, systemEffects);
    expect(progressContractOnSystem(system, systemEffects)).toBe(true);
    expect(system.operations.completed[0]?.templateId).toBe('system');

    const condition = newGame(12, 0);
    const conditionOffer = offer(
      'condition-test',
      'bottleneck',
      'mice',
      { kind: 'bottleneck', aspect: 'hydro', count: 1 },
    );
    installOffer(condition, conditionOffer);
    const conditionEffects: SimEffect[] = [];
    acceptContract(condition, conditionOffer.id, conditionEffects);
    expect(
      progressContractOnPlanet(
        condition,
        completedWorld({ bottleneck: 'thermal' }),
        0,
        conditionEffects,
      ),
    ).toBe(false);
    expect(condition.operations.active?.progress).toBe(0);
    expect(
      progressContractOnPlanet(
        condition,
        completedWorld({ bottleneck: 'hydro' }),
        0,
        conditionEffects,
      ),
    ).toBe(true);
    expect(condition.operations.reputation.mice).toBe(3);
  });

  it('expires timed work at the same simulated deadline online and offline', () => {
    const online = newGame(70, 0);
    const offline = newGame(70, 0);
    const timed = offer(
      'timed-test',
      'timed',
      'vogon',
      { kind: 'timed', count: 1, durationMs: 500 },
    );
    installOffer(online, timed);
    installOffer(offline, timed);
    step(online, 0, [{ type: 'acceptContract', id: timed.id }], OPTS);
    step(offline, 0, [{ type: 'acceptContract', id: timed.id }], OPTS);

    const onlineResult = step(online, 500, [], OPTS);
    const offlineResult = stepOffline(offline, 500, OPTS);
    const isDeadline = (effect: SimEffect) =>
      effect.t === 'contractFailed' && effect.reason === 'deadline';

    expect(onlineResult.effects.some(isDeadline)).toBe(true);
    expect(offlineResult.effects.some(isDeadline)).toBe(true);
    expect(online.gameTimeMs).toBe(offline.gameTimeMs);
    expect(online.operations.active).toBeNull();
    expect(offline.operations.active).toBeNull();
    expect(online.operations.offers).toEqual(offline.operations.offers);
  });
});

describe('Operations logistics and heritage', () => {
  it('derives eligible routes from each system five-pack and rejects unsupported choices', () => {
    const state = newGame(98, 0);
    state.run.systems = 1;
    state.run.planetsCompleted = 5;
    state.run.completedPlanets = [
      completedWorld({
        lifetimeIndex: 1,
        bottleneck: 'thermal',
        survey: 'dense-aquifers',
      }),
      completedWorld({
        lifetimeIndex: 2,
        bottleneck: 'hydro',
        survey: 'orbital-mapping',
      }),
      completedWorld({ lifetimeIndex: 3, bottleneck: 'thermal' }),
      completedWorld({ lifetimeIndex: 4, bottleneck: 'bio' }),
      completedWorld({ lifetimeIndex: 5, bottleneck: 'hydro' }),
    ];

    expect(specialtiesForSystem(state, 0)).toEqual([
      'thermal',
      'hydro',
      'bio',
      'science',
      'production',
    ]);
    expect(specialtiesForSystem(state, 1)).toEqual([]);

    const rejected = step(
      state,
      0,
      [{ type: 'assignSystemSpecialty', systemIndex: 0, specialty: 'atmo' }],
      OPTS,
    );
    expect(state.operations.systemSpecialties).toEqual({});
    expect(rejected.effects.some((effect) => effect.t === 'systemSpecialtyAssigned')).toBe(false);
    state.operations.systemSpecialties = { 0: 'atmo' };
    expect(computeDerived(state, OPTS).dispatchesUsed).toBe(0);
    state.operations.systemSpecialties = {};


    step(
      state,
      0,
      [{ type: 'assignSystemSpecialty', systemIndex: 0, specialty: 'thermal' }],
      OPTS,
    );
    step(
      state,
      0,
      [{ type: 'assignSystemSpecialty', systemIndex: 0, specialty: 'science' }],
      OPTS,
    );
    expect(state.operations.systemSpecialties).toEqual({ 0: 'science' });
    step(state, 0, [{ type: 'assignSystemSpecialty', systemIndex: 0, specialty: null }], OPTS);

    state.run.completedPlanets = state.run.completedPlanets.slice(0, 4);
    expect(specialtiesForSystem(state, 0)).toEqual(SYSTEM_SPECIALTIES);
    step(state, 0, [{ type: 'assignSystemSpecialty', systemIndex: 0, specialty: 'atmo' }], OPTS);
    expect(state.operations.systemSpecialties).toEqual({ 0: 'atmo' });
  });

  it('applies only canonical, formed, slot-capped specialties with authoritative multipliers', () => {
    const state = newGame(99, 0);
    state.run.systems = 4;
    state.operations.completed = Array.from({ length: 6 }, (_, index) => history(index));
    state.buildings['seedProbe'] = 1;
    state.buildings['researchLab'] = 1;
    const baseline = computeDerived(state, OPTS);
    expect(dispatchSlotsFor(state)).toBe(3);

    state.operations.systemSpecialties = {
      0: 'thermal',
      1: 'science',
      2: 'production',
      3: 'production',
      '03': 'production',
      99: 'production',
    };
    const derived = computeDerived(state, OPTS);

    expect(derived.dispatchSlots).toBe(3);
    expect(derived.dispatchesUsed).toBe(3);
    expect(derived.prodMult.div(baseline.prodMult).toNumber()).toBeCloseTo(
      C.SYSTEM_SPECIALTY_PRODUCTION_MULT,
      10,
    );
    expect(derived.sciencePerSec.div(baseline.sciencePerSec).toNumber()).toBeCloseTo(
      C.SYSTEM_SPECIALTY_PRODUCTION_MULT * C.SYSTEM_SPECIALTY_SCIENCE_MULT,
      10,
    );
    expect(derived.aspectPerSec.thermal.div(baseline.aspectPerSec.thermal).toNumber()).toBeCloseTo(
      C.SYSTEM_SPECIALTY_PRODUCTION_MULT * C.SYSTEM_SPECIALTY_ASPECT_MULT,
      10,
    );
    expect(derived.aspectPerSec.atmo.div(baseline.aspectPerSec.atmo).toNumber()).toBeCloseTo(
      C.SYSTEM_SPECIALTY_PRODUCTION_MULT,
      10,
    );
  });

  it('archives one validated heritage world on prestige, resets run scope, and applies its next-run bonus', () => {
    const state = newGame(123, 0);
    const invalid = step(state, 0, [{ type: 'designateHeritage', lifetimeIndex: 999 }], OPTS);
    expect(invalid.effects).toEqual([]);
    expect(state.operations.heritageCandidateLifetimeIndex).toBeNull();

    const world = completedWorld({ lifetimeIndex: 7, bottleneck: 'thermal' });
    state.run.completedPlanets = [world];
    state.run.planetsCompleted = C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS;
    state.run.systems = C.PRESTIGE_MIN_SYSTEMS;
    state.lifetime.planetsCompleted = 7;
    state.operations.completed = [history(1)];
    state.operations.reputation.mice = 9;
    state.operations.systemSpecialties = { 0: 'thermal' };
    step(state, 0, [{ type: 'designateHeritage', lifetimeIndex: 7 }], OPTS);

    const incomplete = offer(
      'incomplete-at-prestige',
      'delivery',
      'magrathea',
      { kind: 'planets', count: 9 },
    );
    installOffer(state, incomplete);
    step(state, 0, [{ type: 'acceptContract', id: incomplete.id }], OPTS);
    const generationBefore = state.operations.offerGeneration;

    const result = step(state, 0, [{ type: 'prestige' }], OPTS);
    expect(result.effects).toContainEqual({
      t: 'contractFailed',
      id: incomplete.id,
      templateId: 'delivery',
      reason: 'prestige',
    });
    expect(result.effects).toContainEqual({ t: 'heritageArchived', lifetimeIndex: 7 });
    expect(state.run.number).toBe(2);
    expect(state.operations.active).toBeNull();
    expect(state.operations.offers).toHaveLength(3);
    expect(state.operations.offerGeneration).toBe(generationBefore + 1);
    expect(state.operations.rerolledAtSystem).toBe(-1);
    expect(state.operations.systemSpecialties).toEqual({});
    expect(state.operations.heritageCandidateLifetimeIndex).toBeNull();
    expect(state.operations.completed).toEqual([history(1)]);
    expect(state.operations.reputation.mice).toBe(9);
    expect(state.operations.heritageWorlds[0]).toMatchObject({
      lifetimeIndex: 7,
      bottleneck: 'thermal',
      commissionNumber: 1,
    });

    state.buildings['seedProbe'] = 1;
    const heritage = state.operations.heritageWorlds;
    const withHeritage = computeDerived(state, OPTS);
    state.operations.heritageWorlds = [];
    const withoutHeritage = computeDerived(state, OPTS);
    state.operations.heritageWorlds = heritage;
    expect(
      withHeritage.aspectPerSec.thermal.div(withoutHeritage.aspectPerSec.thermal).toNumber(),
    ).toBeCloseTo(C.HERITAGE_ASPECT_MULT, 10);
    expect(
      withHeritage.aspectPerSec.atmo.div(withoutHeritage.aspectPerSec.atmo).toNumber(),
    ).toBeCloseTo(1, 10);
  });

  it('round-trips and deep-clones nested operations save data', () => {
    const state = newGame(5150, 10);
    state.run.systems = 1;
    state.operations.completed = [history(3)];
    state.operations.systemSpecialties = { 0: 'bio' };
    state.operations.heritageWorlds = [
      {
        ...completedWorld({ lifetimeIndex: 4, bottleneck: 'bio', quirks: ['humming'] }),
        commissionNumber: 1,
        preservedAtGameMs: 9,
      },
    ];
    const activeId = state.operations.offers[0]!.id;
    step(state, 0, [{ type: 'acceptContract', id: activeId }], OPTS);

    const plain = toSave(state);
    const plainCount = plain.operations.active!.offer.objective.count;
    state.operations.active!.offer.objective.count += 1;
    state.operations.heritageWorlds[0]!.quirks.push('mutable');
    expect(plain.operations.active!.offer.objective.count).toBe(plainCount);
    expect(plain.operations.heritageWorlds[0]!.quirks).toEqual(['humming']);

    const roundTrip = deserialize(serialize(state));
    expect(roundTrip.ok).toBe(true);
    if (!roundTrip.ok) return;
    expect(toSave(roundTrip.state).operations).toEqual(toSave(state).operations);
    state.operations.reputation.magrathea = 42;
    state.operations.heritageWorlds[0]!.quirks.push('later');
    expect(roundTrip.state.operations.reputation.magrathea).not.toBe(42);
    expect(roundTrip.state.operations.heritageWorlds[0]!.quirks).not.toContain('later');
  });
});
