import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { serialize, deserialize, toSave } from '../src/engine/save/codec';

const OPTS = { utcDay: 3 };

describe('save migrations', () => {
  it('v1 → v2: fabricates completed-planet records to match the counter', () => {
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
    expect(r.state.version).toBe(2);
    expect(r.state.run.completedPlanets).toHaveLength(7);
    for (const p of r.state.run.completedPlanets) {
      expect(p.seed).toBeGreaterThan(0);
      expect(p.name).toContain('Reclaimed');
    }
  });

  it('completed planets accumulate and survive round-trips', () => {
    const s = newGame(12, 0);
    // Production has to close the last 0.1% of each gauge — give it probes.
    step(s, 0, [
      { type: 'devGrant', tu: '10000' },
      { type: 'buyBuilding', id: 'seedProbe', qty: 25 },
    ]);
    for (let n = 0; n < 6; n++) {
      step(s, 0, [{ type: 'devGrant', tu: '0', gaugeFrac: 0.999 }], OPTS);
      step(s, 60_000, [], OPTS);
    }
    expect(s.run.completedPlanets.length).toBe(s.run.planetsCompleted);
    expect(s.run.planetsCompleted).toBeGreaterThanOrEqual(6);
    expect(s.run.systems).toBe(Math.floor(s.run.planetsCompleted / 5));

    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (round.ok) {
      expect(toSave(round.state).run.completedPlanets).toEqual(toSave(s).run.completedPlanets);
    }
  });
});
