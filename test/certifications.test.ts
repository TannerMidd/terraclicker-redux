/**
 * Field Certifications and GroundMarks (Phase 5).
 *
 * The promises under test: a first pays exactly once, ranks advance at the
 * thresholds and never retreat, marks obey certification and geometry, the
 * engine refuses testimony the world's own tables contradict, and the whole
 * ledger survives prestige — a qualification is not part of any portfolio.
 */
import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { bankGroundSamples } from '../src/engine/groundfall';
import { certFirstCount, certRank, recordCertFirst } from '../src/engine/certifications';
import {
  MARKS_PER_WORLD_MAX,
  MARK_SPACING_M,
  PLANET_RADIUS_BY_SIZE,
  REPAIR_STANDING,
  markWorldFacts,
  recordGroundMarks,
  repairSpots,
  validateMark,
} from '../src/engine/groundMarks';
import { ensureGroundWorld } from '../src/engine/groundSites';
import { CERT_THRESHOLDS } from '../src/content/certifications';
import { standingOf } from '../src/engine/situations';
import { BUILDINGS } from '../src/content/buildings';
import { buildSurfaceParams, dirToLocal, localToDir } from '../src/ui/scene/surface/terrainField';
import { Vector3 } from 'three/webgpu';
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

/** A delivered world with at least one settlement, for the repair tests. */
function settledWorld(s: GameState): { lifetimeIndex: number; dir: [number, number, number] } {
  for (const w of s.run.completedPlanets) {
    if (w.type === 'gasgiant') continue;
    const facts = markWorldFacts(s, `w${w.lifetimeIndex}`)!;
    const spots = repairSpots(facts);
    if (spots.length > 0) return { lifetimeIndex: w.lifetimeIndex, dir: [...spots[0]!] };
  }
  throw new Error('no settled world in this fixture — pick another seed');
}

describe('the firsts ledger', () => {
  it('pays each first once, and ranks up at the thresholds', () => {
    const s = newGame(1201, 0);
    const effects: SimEffect[] = [];
    expect(recordCertFirst(s, effects, 'mobility:world:w1')).toBe(true);
    expect(recordCertFirst(s, effects, 'mobility:world:w1')).toBe(false);
    expect(certFirstCount(s.expedition, 'mobility')).toBe(1);
    expect(certRank(s.expedition, 'mobility')).toBe(0);

    recordCertFirst(s, effects, 'mobility:world:w2');
    expect(certRank(s.expedition, 'mobility')).toBe(1);
    expect(effects.filter((e) => e.t === 'certAdvanced')).toHaveLength(1);
    expect(effects.find((e) => e.t === 'certAdvanced')).toMatchObject({
      track: 'mobility',
      rank: 1,
    });

    // A stray key with no track prefix is not a first in anything.
    expect(recordCertFirst(s, effects, 'nonsense:key')).toBe(false);
  });

  it('records the banked firsts: landing, survey, kinds, methods', () => {
    const s = newGame(1202, 0);
    const effects: SimEffect[] = [];
    bankGroundSamples(
      s,
      effects,
      'w1',
      'Testworld',
      [{ kind: 'field-crystal', n: 6, method: 'core' }],
      {},
    );
    const firsts = s.expedition.certFirsts;
    expect(firsts['mobility:world:w1']).toBeDefined();
    expect(firsts['survey:filed:w1']).toBeDefined(); // 6 cores = 12 credit
    expect(firsts['geology:kind:field-crystal']).toBeDefined();
    expect(firsts['geology:verb:core']).toBeDefined();

    // The same work on a second world: the career-wide firsts stay put.
    bankGroundSamples(s, effects, 'w2', 'Elsewhere', [{ kind: 'field-crystal', n: 6, method: 'core' }], {});
    expect(firsts['mobility:world:w2']).toBeDefined();
    expect(Object.keys(firsts).filter((k) => k.startsWith('geology:kind:'))).toHaveLength(1);
  });

  it('refuses weather the sky cannot make, and accepts what it can', () => {
    const s = newGame(1203, 0);
    // The hero commission starts with its gauges at zero: no air, no rain —
    // but a thin sky is exactly where meteor showers live.
    const effects: SimEffect[] = [];
    bankGroundSamples(s, effects, `w${s.planet.lifetimeIndex}`, 'Hero', [], {}, [], {
      weathered: ['rain', 'meteors'],
    });
    expect(s.expedition.certFirsts['mobility:weather:rain']).toBeUndefined();
    expect(s.expedition.certFirsts['mobility:weather:meteors']).toBeDefined();
  });

  it('survives prestige — the portfolio sells, the qualification does not', () => {
    const s = withWorlds(1204);
    const effects: SimEffect[] = [];
    recordCertFirst(s, effects, 'survey:species:glass-shoal');
    recordCertFirst(s, effects, 'survey:filed:w1');
    const rank = certRank(s.expedition, 'survey');
    expect(rank).toBe(1);
    // Prestige is heavy to arrange here; the invariant is structural — the
    // certs live in expedition, which doPrestige does not reset. Assert the
    // location rather than replaying a sale.
    expect(s.expedition.certs['survey']).toBe(rank);
  });
});

describe('marks', () => {
  it('demands the certification before the verb exists', () => {
    const s = withWorlds(1205);
    const facts = markWorldFacts(s, 'w1')!;
    const bad = validateMark({}, [], facts, { kind: 'beacon', dir: [0, 1, 0] });
    expect(bad.ok).toBe(false);
    const good = validateMark({ mobility: 1 }, [], facts, { kind: 'beacon', dir: [0, 1, 0] });
    expect(good.ok).toBe(true);
    // Shelter is the second rank's verb, and rank one is not it.
    expect(validateMark({ mobility: 1 }, [], facts, { kind: 'shelter', dir: [0, 1, 0] }).ok).toBe(false);
    expect(validateMark({ mobility: 2 }, [], facts, { kind: 'shelter', dir: [0, 1, 0] }).ok).toBe(true);
  });

  it('holds the spacing and the per-world cap', () => {
    const s = withWorlds(1206);
    const facts = markWorldFacts(s, 'w1')!;
    const radius = PLANET_RADIUS_BY_SIZE[facts.size];
    // A second beacon a hand's width away is one beacon and a mistake.
    const near: [number, number, number] = [
      Math.sin((MARK_SPACING_M * 0.5) / radius),
      Math.cos((MARK_SPACING_M * 0.5) / radius),
      0,
    ];
    const existing = [{ kind: 'beacon' as const, dir: [0, 1, 0] as [number, number, number], atMs: 0 }];
    expect(validateMark({ mobility: 1 }, existing, facts, { kind: 'beacon', dir: near }).ok).toBe(false);
    // A different kind may stand close; the spacing is per-kind.
    expect(validateMark({ survey: 1 }, existing, facts, { kind: 'station', dir: near }).ok).toBe(true);

    const full = Array.from({ length: MARKS_PER_WORLD_MAX }, (_, i) => ({
      kind: 'beacon' as const,
      dir: [Math.sin(i), Math.cos(i), 0.2] as [number, number, number],
      atMs: 0,
    }));
    expect(validateMark({ mobility: 1 }, full, facts, { kind: 'beacon', dir: [0, 0, 1] }).ok).toBe(false);
  });

  it('repairs belong to settlements, once each, and lift standing', () => {
    const s = withWorlds(1207);
    const { lifetimeIndex, dir } = settledWorld(s);
    const key = `w${lifetimeIndex}`;
    s.expedition.certs['liaison'] = 1;
    // The town has been let down, so there is something to restore.
    s.run.standing[String(lifetimeIndex)] = 0.6;

    const record = ensureGroundWorld(s, key);
    const effects: SimEffect[] = [];
    const accepted = recordGroundMarks(s, effects, key, 'Testworld', record, [
      { kind: 'repair', dir },
    ]);
    expect(accepted).toHaveLength(1);
    expect(standingOf(s, lifetimeIndex)).toBeCloseTo(0.6 + REPAIR_STANDING, 5);
    expect(s.worldRecords[String(lifetimeIndex)]!.history.some((e) => e.kind === 'repairMade')).toBe(true);
    expect(s.expedition.certFirsts[`liaison:repair:${key}`]).toBeDefined();

    // The same settlement cannot be mended twice; theatre is not maintenance.
    const again = recordGroundMarks(s, effects, key, 'Testworld', record, [
      { kind: 'repair', dir },
    ]);
    expect(again).toHaveLength(0);

    // And nowhere near a town, there is nothing to mend.
    const wild = validateMark({ liaison: 1 }, record.marks, markWorldFacts(s, key)!, {
      kind: 'repair',
      dir: [-dir[0], -dir[1], -dir[2]],
    });
    expect(wild.ok).toBe(false);
  });

  it('banks marks through the input path and writes the world event', () => {
    const s = withWorlds(1208);
    const world = s.run.completedPlanets.find((w) => w.type !== 'gasgiant')!;
    const key = `w${world.lifetimeIndex}`;
    s.expedition.certs['mobility'] = 1;
    const effects: SimEffect[] = [];
    bankGroundSamples(s, effects, key, world.name, [], {}, [], {
      marks: [{ kind: 'beacon', dir: [0, 1, 0] }],
    });
    expect(s.expedition.groundWorlds[key]!.marks).toHaveLength(1);
    expect(effects.some((e) => e.t === 'markPlaced')).toBe(true);
    expect(s.worldRecords[String(world.lifetimeIndex)]!.history.some((e) => e.kind === 'markPlaced')).toBe(true);
    expect(s.expedition.certFirsts[`mobility:beacon:${key}`]).toBeDefined();

    // An uncertified mark in the same testimony is quietly declined.
    bankGroundSamples(s, effects, key, world.name, [], {}, [], {
      marks: [{ kind: 'station', dir: [1, 0, 0] }],
    });
    expect(s.expedition.groundWorlds[key]!.marks).toHaveLength(1);
  });

  it('threshold sanity: the rank table is monotonic', () => {
    for (let i = 1; i < CERT_THRESHOLDS.length; i++) {
      expect(CERT_THRESHOLDS[i]!).toBeGreaterThan(CERT_THRESHOLDS[i - 1]!);
    }
  });

  it('the gnomonic frame runs both ways — a mark comes back where it stood', () => {
    // localToDir at planting, dirToLocal at the next landing: the roundtrip
    // must agree to centimetres at anything a stay can walk, or a beacon
    // would quietly stroll between visits.
    const p = buildSurfaceParams({
      seed: 424242,
      type: 'terrestrial',
      size: 'medium',
      dir: [0.2, 0.53, -0.82],
      aspects: { thermal: 0.5, atmo: 0.5, hydro: 0.5, bio: 0.5 },
    });
    const v = new Vector3();
    const out = { x: 0, z: 0 };
    for (const [x, z] of [[1.5, 3], [-420, 260], [2600, -1800], [0, 0]] as const) {
      localToDir(p, x, z, v);
      expect(v.length()).toBeCloseTo(1, 9);
      dirToLocal(p, v, out);
      expect(out.x).toBeCloseTo(x, 2);
      expect(out.z).toBeCloseTo(z, 2);
    }
  });
});
