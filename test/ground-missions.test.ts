/**
 * Ground missions and leads (Phase 5).
 *
 * The bridge's new law under test: a request with a ground objective is
 * settled by DOING THE THING on that world's ground and boarding — never by
 * merely arriving in orbit — and pays the desk's best standing, mission
 * salvage, and a history line. Leads: rumour → orbit → landing → another
 * world → a Guide entry, deterministic throughout, cold after prestige.
 */
import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import {
  attendInPerson,
  deliveryEvidence,
  groundObjectiveMet,
  GROUND_MISSION_SALVAGE,
  resolveGroundRequests,
  type GroundWorkEvidence,
} from '../src/engine/bridge';
import { bankGroundSamples } from '../src/engine/groundfall';
import {
  advanceLead,
  clearLead,
  leadState,
  leadTargetAt,
  LEAD_SALVAGE,
  LEADS_RESOLVED_FLAG,
  maybeSpawnLead,
} from '../src/engine/leads';
import { stepSubEtha } from '../src/engine/subEtha';
import { ALL_PETITIONS, PETITION_BY_ID, petitionsFor } from '../src/content/petitions';
import { standingOf } from '../src/engine/situations';
import { waypointId } from '../src/engine/waypoints';
import { FREIGHT } from '../src/content/freight';
import { BUILDINGS } from '../src/content/buildings';
import type { GameState, SimEffect } from '../src/engine/types';

const OPTS = { utcDay: 2 };

function withWorlds(seed: number, worlds = 6): GameState {
  const s = newGame(seed, 0);
  for (let i = 0; i < worlds; i++) {
    step(s, 0, [{ type: 'devGrant', tu: '1e12', gaugeFrac: 1 }], OPTS);
    step(s, 300, [], OPTS);
    if (s.planet.surveyOptions) {
      step(s, 0, [{ type: 'chooseSurvey', id: s.planet.surveyOptions[0]! }], OPTS);
    }
  }
  step(s, 0, [{ type: 'devGrant', tu: '1e12' }], OPTS);
  step(s, 0, [{ type: 'buyBuilding', id: BUILDINGS[0]!.id, qty: 25 }], OPTS);
  step(s, 1000, [], OPTS);
  return s;
}

function landable(s: GameState) {
  const w = s.run.completedPlanets.find((x) => x.type !== 'gasgiant');
  if (!w) throw new Error('fixture has no landable delivered world');
  return w;
}

/** Open a specific petition at a specific world, the way the spawner would. */
function openPetition(s: GameState, id: string, world: number, worldName: string): number {
  const def = PETITION_BY_ID[id]!;
  const uid = ++s.timers.nextIdCounter;
  s.run.petitions.push({ uid, id, remainingMs: def.windowMs, world, worldName });
  return uid;
}

const EMPTY: Omit<GroundWorkEvidence, 'lifetimeIndex'> = {
  surveyCredit: 0,
  haul: [],
  species: [],
  landmarks: [],
  civic: false,
  weathered: [],
  markKinds: [],
  repaired: false,
};

describe('objectives', () => {
  it('each kind verifies from evidence alone', () => {
    const ev = (over: Partial<GroundWorkEvidence>): GroundWorkEvidence => ({
      lifetimeIndex: 1,
      ...EMPTY,
      ...over,
    });
    expect(groundObjectiveMet({ kind: 'survey', n: 5, brief: '', text: '' }, ev({ surveyCredit: 5 }))).toBe(true);
    expect(groundObjectiveMet({ kind: 'survey', n: 5, brief: '', text: '' }, ev({ surveyCredit: 4 }))).toBe(false);
    expect(groundObjectiveMet({ kind: 'species', n: 2, brief: '', text: '' }, ev({ species: ['a', 'b'] }))).toBe(true);
    expect(
      groundObjectiveMet(
        { kind: 'sample', what: 'reef-chalk', n: 2, brief: '', text: '' },
        ev({ haul: [{ kind: 'reef-chalk', n: 2, method: 'quick' }] }),
      ),
    ).toBe(true);
    expect(groundObjectiveMet({ kind: 'landmark', brief: '', text: '' }, ev({ landmarks: ['stone-arch'] }))).toBe(true);
    expect(groundObjectiveMet({ kind: 'civic', brief: '', text: '' }, ev({ civic: true }))).toBe(true);
    expect(groundObjectiveMet({ kind: 'weather', what: 'rain', brief: '', text: '' }, ev({ weathered: ['rain'] }))).toBe(true);
    expect(groundObjectiveMet({ kind: 'repair', brief: '', text: '' }, ev({ repaired: true }))).toBe(true);
    expect(groundObjectiveMet({ kind: 'beacon', brief: '', text: '' }, ev({ markKinds: ['beacon'] }))).toBe(true);
    expect(groundObjectiveMet({ kind: 'logistics', brief: '', text: '' }, ev({ delivered: true }))).toBe(true);
    expect(groundObjectiveMet({ kind: 'logistics', brief: '', text: '' }, ev({}))).toBe(false);
  });
});

describe('the surface resolution', () => {
  it('settles on banking the work: standing, salvage, history', () => {
    const s = withWorlds(1301);
    const world = landable(s);
    const uid = openPetition(s, 'ground-survey', world.lifetimeIndex, world.name);
    s.run.standing[String(world.lifetimeIndex)] = 0.6;
    const salvageBefore = s.expedition.salvage;
    const reputationBefore = s.operations.reputation.magrathea;
    const sealedBefore = {
      tu: s.tu.toString(),
      science: s.science.toString(),
      gauges: {
        thermal: s.planet.gauges.thermal.toString(),
        atmo: s.planet.gauges.atmo.toString(),
        hydro: s.planet.gauges.hydro.toString(),
        bio: s.planet.gauges.bio.toString(),
      },
    };

    const effects: SimEffect[] = [];
    bankGroundSamples(
      s,
      effects,
      `w${world.lifetimeIndex}`,
      world.name,
      [{ kind: 'field-crystal', n: 5, method: 'quick' }],
      {},
    );

    expect(s.run.petitions.some((p) => p.uid === uid)).toBe(false);
    const def = PETITION_BY_ID['ground-survey']!;
    const best = def.options.reduce((a, o) => Math.max(a, o.outcome.standing ?? 0), 0);
    expect(standingOf(s, world.lifetimeIndex)).toBeCloseTo(0.6 + best, 5);
    // The sample pay plus the mission's own fee, which the desk cannot mint.
    expect(s.operations.reputation.magrathea).toBe(reputationBefore + 1);
    expect(s.expedition.salvage - salvageBefore).toBeGreaterThanOrEqual(GROUND_MISSION_SALVAGE);
    expect({
      tu: s.tu.toString(),
      science: s.science.toString(),
      gauges: {
        thermal: s.planet.gauges.thermal.toString(),
        atmo: s.planet.gauges.atmo.toString(),
        hydro: s.planet.gauges.hydro.toString(),
        bio: s.planet.gauges.bio.toString(),
      },
    }).toEqual(sealedBefore);
    const resolved = effects.find((e) => e.t === 'situationResolved');
    expect(resolved).toMatchObject({ id: 'ground-survey' });
    const history = s.worldRecords[String(world.lifetimeIndex)]!.history;
    expect(history.some((e) => e.kind === 'petitionAnswered' && e.id === 'ground-survey')).toBe(true);
    expect(history.some((e) => e.kind === 'visited' && e.id === 'ground-survey')).toBe(true);
    expect(s.expedition.certFirsts['liaison:answered:ground-survey']).toBeDefined();
  });

  it('does not settle for work that missed the objective', () => {
    const s = withWorlds(1302);
    const world = landable(s);
    const uid = openPetition(s, 'ground-survey', world.lifetimeIndex, world.name);
    const reputationBefore = s.operations.reputation.magrathea;
    const effects: SimEffect[] = [];
    bankGroundSamples(s, effects, `w${world.lifetimeIndex}`, world.name, [
      { kind: 'field-crystal', n: 2, method: 'quick' },
    ], {});
    expect(s.run.petitions.some((p) => p.uid === uid)).toBe(true);
    expect(s.operations.reputation.magrathea).toBe(reputationBefore);
  });

  it('is never settled by merely arriving in orbit', () => {
    const s = withWorlds(1303);
    const world = landable(s);
    const uid = openPetition(s, 'ground-call', world.lifetimeIndex, world.name);
    // The old attendance path: physically there, timestamp fresh — and still
    // no, because the request names the ground, not the sky above it.
    s.expedition.visited[waypointId('world', world.lifetimeIndex)] = s.gameTimeMs + 1;
    const effects: SimEffect[] = [];
    expect(attendInPerson(s, effects, uid)).toBe(false);
    expect(s.run.petitions.some((p) => p.uid === uid)).toBe(true);
  });

  it('keeps the desk options working — the surface is an addition', () => {
    const s = withWorlds(1304);
    const world = landable(s);
    const uid = openPetition(s, 'ground-census', world.lifetimeIndex, world.name);
    const free = PETITION_BY_ID['ground-census']!.options.find((o) => !o.costSeconds)!;
    step(s, 0, [{ type: 'answerSituation', uid, optionId: free.id }], OPTS);
    expect(s.run.petitions.some((p) => p.uid === uid)).toBe(false);
  });

  it('logistics settles at the docks, through the freight path', () => {
    const s = withWorlds(1305);
    const world = landable(s);
    const uid = openPetition(s, 'ground-logistics', world.lifetimeIndex, world.name);
    s.expedition.manifest = {
      uid: 999,
      id: FREIGHT[0]!.id,
      from: 0,
      to: world.lifetimeIndex,
      fromName: 'Terra Prima',
      toName: world.name,
      distance: 10,
      salvage: 5,
      expiresAtMs: s.gameTimeMs + 1e9,
      acceptedAtMs: s.gameTimeMs,
      pickedUpAtMs: s.gameTimeMs,
    };
    step(s, 0, [{ type: 'deliverManifest' }], OPTS);
    expect(s.run.petitions.some((p) => p.uid === uid)).toBe(false);
  });

  it('resolves urgent situations by the same path', () => {
    const s = withWorlds(1306);
    const world = landable(s);
    const uid = ++s.timers.nextIdCounter;
    s.situations.push({
      uid,
      id: 'storm-watch',
      remainingMs: 600_000,
      world: world.lifetimeIndex,
      worldName: world.name,
    });
    const effects: SimEffect[] = [];
    resolveGroundRequests(s, effects, {
      lifetimeIndex: world.lifetimeIndex,
      ...EMPTY,
      weathered: ['rain'],
    });
    expect(s.situations.some((x) => x.uid === uid)).toBe(false);
  });
});

describe('eligibility', () => {
  const baseFacts = {
    bottleneck: 'thermal' as const,
    quirks: [] as string[],
    hasInstallations: true,
    hasSettlements: true,
    certs: {} as Record<string, number>,
    atmoRank: 0,
  };

  it('a gas giant files only desk-answerable mail', () => {
    const pool = petitionsFor({ ...baseFacts, type: 'gasgiant' });
    expect(pool.every((p) => !p.ground)).toBe(true);
  });

  it('repair and beacon wait for their certifications', () => {
    const none = petitionsFor({ ...baseFacts, type: 'terrestrial' });
    expect(none.some((p) => p.id === 'ground-repair')).toBe(false);
    expect(none.some((p) => p.id === 'ground-beacon')).toBe(false);
    const certed = petitionsFor({
      ...baseFacts,
      type: 'terrestrial',
      certs: { liaison: 1, mobility: 1 },
    });
    expect(certed.some((p) => p.id === 'ground-repair')).toBe(true);
    expect(certed.some((p) => p.id === 'ground-beacon')).toBe(true);
  });

  it('provenance and weather are type-shaped', () => {
    const ice = petitionsFor({ ...baseFacts, type: 'ice' });
    expect(ice.some((p) => p.id === 'ground-provenance-ice')).toBe(true);
    expect(ice.some((p) => p.id === 'ground-provenance-desert')).toBe(false);
    expect(ice.some((p) => p.id === 'ground-weather-whiteout')).toBe(true);
    expect(ice.some((p) => p.id === 'ground-weather-rain')).toBe(false);
  });

  it('every ground petition still lapses gently', () => {
    for (const def of ALL_PETITIONS) {
      if (!def.ground) continue;
      expect(def.ignored.standing ?? 0).toBeLessThan(0);
      expect(def.ignored.standing ?? 0).toBeGreaterThanOrEqual(-0.12);
      expect(def.ground.brief.length).toBeGreaterThan(8);
      expect(def.ground.text).toContain('{world}');
    }
  });
});

describe('leads', () => {
  it('will not start without an audience of worlds', () => {
    const s = withWorlds(1307, 2);
    expect(maybeSpawnLead(s, () => 0.5)).toBeNull();
  });

  it('runs the whole arc: rumour, first ground, second ground, the entry', () => {
    const s = withWorlds(1308);
    const line = maybeSpawnLead(s, () => 0.4);
    expect(line).toBeTruthy();
    const lead = leadState(s)!;
    expect(lead.stage).toBe(1);
    const first = s.run.completedPlanets.find((w) => w.lifetimeIndex === lead.world)!;
    expect(line).toContain(first.name);
    expect(leadTargetAt(s, lead.world)).toBe(1);

    // The wrong world's ground answers nothing.
    const wrong = s.run.completedPlanets.find(
      (w) => w.lifetimeIndex !== lead.world && w.type !== 'gasgiant',
    )!;
    const effects: SimEffect[] = [];
    expect(advanceLead(s, effects, wrong.lifetimeIndex)).toBe(false);

    // The right one names a counterpart, deterministically.
    expect(advanceLead(s, effects, lead.world)).toBe(true);
    const stage2 = leadState(s)!;
    expect(stage2.stage).toBe(2);
    expect(stage2.world2).not.toBeNull();
    expect(stage2.world2).not.toBe(lead.world);
    expect(effects.find((e) => e.t === 'leadAdvanced')).toMatchObject({ stage: 2 });

    // And the counterpart closes the file.
    const before = s.expedition.salvage;
    expect(advanceLead(s, effects, stage2.world2!)).toBe(true);
    expect(leadState(s)).toBeNull();
    expect(s.expedition.salvage - before).toBe(LEAD_SALVAGE);
    expect(Number(s.flags[LEADS_RESOLVED_FLAG])).toBe(1);
    expect(effects.find((e) => e.t === 'leadAdvanced' && e.stage === 3)).toBeTruthy();
  });

  it('spawns from the channel, eventually and deterministically', () => {
    const s = withWorlds(1309);
    let spawned = false;
    for (let i = 0; i < 400 && !spawned; i++) {
      s.subEtha.nextBroadcastMs = 0;
      stepSubEtha(s);
      spawned = leadState(s) !== null;
    }
    expect(spawned).toBe(true);
    // The rumour is IN the log — the Circular and the Guide read it there.
    expect(s.subEtha.log.some((e) => e.kind === 'rumour')).toBe(true);
  });

  it('advances through the bank path when the stay read the resonator', () => {
    const s = withWorlds(1310);
    maybeSpawnLead(s, () => 0.3);
    const lead = leadState(s)!;
    const world = s.run.completedPlanets.find((w) => w.lifetimeIndex === lead.world)!;
    const effects: SimEffect[] = [];
    bankGroundSamples(s, effects, `w${lead.world}`, world.name, [], {}, [], { lead: true });
    expect(leadState(s)!.stage).toBe(2);
  });

  it('goes cold when cleared — the prestige contract', () => {
    const s = withWorlds(1311);
    maybeSpawnLead(s, () => 0.6);
    expect(leadState(s)).not.toBeNull();
    clearLead(s);
    expect(leadState(s)).toBeNull();
  });

  it('settles the delivery evidence shape for the freight path', () => {
    const ev = deliveryEvidence(7);
    expect(ev.lifetimeIndex).toBe(7);
    expect(ev.delivered).toBe(true);
    expect(groundObjectiveMet({ kind: 'logistics', brief: '', text: '' }, ev)).toBe(true);
  });
});
