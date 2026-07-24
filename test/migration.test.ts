import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { serialize, deserialize, toSave } from '../src/engine/save/codec';
import { C } from '../src/content/constants';

import { initRng } from '../src/engine/rng';
const OPTS = { utcDay: 3 };

describe('save migrations', () => {
  it('v1 -> current: fabricates completed-planet records to match the counter', () => {
    // Build a real current-version save, then strip it back to v1 shape.
    const s = newGame(11, 0);
    s.run.planetsCompleted = 7;
    s.run.systems = 1;
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw['version'] = 1;
    delete (raw['run'] as Record<string, unknown>)['completedPlanets'];

    const r = deserialize(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.version).toBe(C.SAVE_VERSION);
    expect(r.state.run.completedPlanets).toHaveLength(7);
    for (const p of r.state.run.completedPlanets) {
      expect(p.seed).toBeGreaterThan(0);
      expect(p.name).toContain('Reclaimed');
      expect(p.quirks).toEqual([]);
      expect(p.survey).toBeNull();
      expect(p.completionMs).toBe(0);
      expect(['thermal', 'atmo', 'hydro', 'bio']).toContain(p.bottleneck);
      expect(p.installations.length).toBeGreaterThan(0);
    }
  });

  it('v2 -> current backfills safe biography defaults', () => {
    const current = newGame(23, 0);
    const raw = JSON.parse(serialize(current)) as Record<string, unknown>;
    raw['version'] = 2;
    raw['gameTimeMs'] = 12_345;
    delete ((raw['planet'] as Record<string, unknown>)['startedAtGameMs']);
    (raw['lifetime'] as Record<string, unknown>)['planetsCompleted'] = 1;
    const run = raw['run'] as Record<string, unknown>;
    run['planetsCompleted'] = 1;
    run['completedPlanets'] = [
      { seed: 99, type: 'desert', size: 'small', name: 'Archived Prospect' },
    ];

    const result = deserialize(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.version).toBe(C.SAVE_VERSION);
    expect(result.state.planet.startedAtGameMs).toBe(12_345);
    expect(result.state.run.completedPlanets[0]).toMatchObject({
      lifetimeIndex: 1,
      quirks: [],
      survey: null,
      completionMs: 0,
      bottleneck: 'hydro',
    });
  });

  it('v3 -> v4 adds an isolated contracts stream and default operations', () => {
    const current = newGame(77, 0);
    const raw = JSON.parse(serialize(current)) as Record<string, unknown>;
    raw['version'] = 3;
    delete raw['operations'];
    const rng = raw['rng'] as Record<string, unknown>;
    delete rng['contracts'];
    const legacyStreams = { ...rng };

    const result = deserialize(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.version).toBe(C.SAVE_VERSION);
    expect({
      planets: result.state.rng.planets,
      bubbles: result.state.rng.bubbles,
      events: result.state.rng.events,
      vogons: result.state.rng.vogons,
      visuals: result.state.rng.visuals,
    }).toEqual(legacyStreams);
    expect(result.state.rng.contracts).toBe(initRng(77).contracts);
    expect(result.state.operations).toMatchObject({
      offers: [],
      active: null,
      completed: [],
      reputation: { magrathea: 0, mice: 0, vogon: 0 },
      offerGeneration: 0,
      rerolledAtSystem: -1,
      heritageCandidateLifetimeIndex: null,
    });
  });

  it('v4 -> v5 backfills biography-derived installations; real snapshots pass through', () => {
    const current = newGame(31, 0);
    const raw = JSON.parse(serialize(current)) as Record<string, unknown>;
    raw['version'] = 4;
    const run = raw['run'] as Record<string, unknown>;
    run['planetsCompleted'] = 2;
    run['completedPlanets'] = [
      {
        lifetimeIndex: 1, seed: 41, type: 'ocean', size: 'large', name: 'Legacy Reef',
        quirks: [], survey: 'dense-aquifers', completionMs: 900, bottleneck: 'bio',
      },
      {
        lifetimeIndex: 2, seed: 55, type: 'desert', size: 'small', name: 'Kept Loadout',
        quirks: [], survey: null, completionMs: 400, bottleneck: 'hydro',
        installations: ['bioDome', 'marvin'],
      },
    ];

    const result = deserialize(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [legacy, kept] = result.state.run.completedPlanets;
    // Derived: seed probe always, the bottleneck's rig, and the survey lab.
    expect(legacy!.installations).toContain('seedProbe');
    expect(legacy!.installations).toContain('bioDome');
    expect(legacy!.installations).toContain('researchLab');
    // A record that already carries its snapshot is left untouched.
    expect(kept!.installations).toEqual(['bioDome', 'marvin']);
  });

  it('delivery snapshots the owned installations onto the record', () => {
    const s = newGame(19, 0);
    step(s, 0, [
      { type: 'devGrant', tu: '100000' },
      { type: 'buyBuilding', id: 'seedProbe', qty: 10 },
      { type: 'buyBuilding', id: 'atmoProcessor', qty: 3 },
    ], OPTS);
    step(s, 0, [{ type: 'devGrant', tu: '0', gaugeFrac: 0.999 }], OPTS);
    step(s, 60_000, [], OPTS);
    const first = s.run.completedPlanets[0]!;
    expect(first.installations[0]).toBe('seedProbe'); // most-built first
    expect(first.installations).toContain('atmoProcessor');
  });

  it('completed planets accumulate and survive round-trips', () => {
    const s = newGame(12, 0);
    // Production has to close the last 0.1% of each gauge — give it probes.
    step(s, 0, [
      { type: 'devGrant', tu: '10000' },
      { type: 'buyBuilding', id: 'seedProbe', qty: 25 },
    ]);
    s.planet.quirks = ['humming'];
    s.planet.survey = 'dense-aquifers';
    for (let n = 0; n < 6; n++) {
      step(s, 0, [{ type: 'devGrant', tu: '0', gaugeFrac: 0.999 }], OPTS);
      step(s, 60_000, [], OPTS);
    }
    expect(s.run.completedPlanets.length).toBe(s.run.planetsCompleted);
    expect(s.run.planetsCompleted).toBeGreaterThanOrEqual(6);
    expect(s.run.systems).toBe(Math.floor(s.run.planetsCompleted / 5));
    const first = s.run.completedPlanets[0]!;
    expect(first.lifetimeIndex).toBe(1);
    expect(first.quirks).toEqual(['humming']);
    expect(first.survey).toBe('dense-aquifers');
    expect(first.completionMs).toBeGreaterThan(0);
    expect(['thermal', 'atmo', 'hydro', 'bio']).toContain(first.bottleneck);

    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (round.ok) {
      expect(toSave(round.state).run.completedPlanets).toEqual(toSave(s).run.completedPlanets);
    }
  });
});
