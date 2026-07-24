import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { serialize, deserialize, toSave } from '../src/engine/save/codec';

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
    expect(r.state.version).toBe(4);
    expect(r.state.run.completedPlanets).toHaveLength(7);
    for (const p of r.state.run.completedPlanets) {
      expect(p.seed).toBeGreaterThan(0);
      expect(p.name).toContain('Reclaimed');
      expect(p.quirks).toEqual([]);
      expect(p.survey).toBeNull();
      expect(p.completionMs).toBe(0);
      expect(['thermal', 'atmo', 'hydro', 'bio']).toContain(p.bottleneck);
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
    expect(result.state.version).toBe(4);
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
    expect(result.state.version).toBe(4);
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
