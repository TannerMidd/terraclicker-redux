/**
 * Groundfall: the descent, the ground, the ledger.
 *
 * Three layers under test. The ENGINE rules (engine/groundfall.ts) are pure
 * and tested directly. The TERRAIN (surface/terrainField.ts) is tested for
 * determinism and for agreement with planetGeometry — the whole feature's
 * promise is that the continent you saw from orbit is the one you land on.
 * The CONTROL layer is driven exactly as the frame loop drives it: park the
 * runabout over a world, press engage, bake, walk, mine, board, take off.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { newGame, step } from '../src/engine/sim';
import { bankGroundSamples, groundReturnValue, isLandableType, landingRefusal } from '../src/engine/groundfall';
import type { SampleHaul, SimEffect } from '../src/engine/types';
import { C } from '../src/content/constants';
import { SAMPLE_BY_ID } from '../src/content/groundSamples';
import {
  buildSurfaceParams,
  bakeTierRows,
  buildNormalMap,
  groundNormalAt,
  heightAt,
  macroNormAt,
  makeTier,
  type SurfaceTiers,
} from '../src/ui/scene/surface/terrainField';
import { depositSites } from '../src/ui/scene/surface/surfaceSites';
import { createPlanetGeometry } from '../src/ui/scene/planetGeometry';
import {
  beginTakeoff,
  configureTierSpecsForTests,
  endGroundfall,
  EYE,
  hitsNeeded,
  stepSurface,
  surfaceDeposits,
  surfaceInput,
  surfaceLive,
  surfaceParams,
  surfaceProspects,
  surfaceTiers,
  SWING_SECONDS,
  TAKEOFF_SECONDS,
  type GroundfallPhase,
} from '../src/ui/scene/surface/surfaceControl';
import {
  beginFlightAt,
  endFlight,
  flightInput,
  flightLive,
  stepFlight,
} from '../src/ui/scene/flightControl';
import { heroWorldShell } from '../src/ui/scene/universeLayout';
import { SORTIE_FLAG } from '../src/content/firstSortie';
import { useGame } from '../src/state/store';
import { useUiBus } from '../src/ui/fx/uiBus';

const TEST_SPEC = {
  seed: 424242,
  type: 'terrestrial' as const,
  size: 'medium' as const,
  dir: [0.2, 0.53, -0.82] as [number, number, number],
  aspects: { thermal: 0.5, atmo: 0.5, hydro: 0.5, bio: 0.5 },
};

/** A small, fast pair of tiers over the spec — the same math, less of it. */
function bakeSmall(spec = TEST_SPEC): { p: ReturnType<typeof buildSurfaceParams>; tiers: SurfaceTiers } {
  const p = buildSurfaceParams(spec);
  const tiers: SurfaceTiers = {
    near: makeTier({ texels: 64, extent: 4096 }),
    far: makeTier({ texels: 64, extent: 65536 }),
  };
  bakeTierRows(p, tiers.near, 0, 64);
  bakeTierRows(p, tiers.far, 0, 64);
  buildNormalMap(tiers.near);
  buildNormalMap(tiers.far);
  return { p, tiers };
}

describe('groundfall ledger (engine rules)', () => {
  it('gas giants have no floor; everything else does', () => {
    expect(isLandableType('gasgiant')).toBe(false);
    expect(landingRefusal('gasgiant')).toMatch(/no solid surface/);
    for (const t of ['terrestrial', 'ice', 'desert', 'volcanic', 'ocean'] as const) {
      expect(isLandableType(t)).toBe(true);
      expect(landingRefusal(t)).toBeNull();
    }
  });

  it('pays per kind, pays the survey and catalogue bonuses once each', () => {
    const s = newGame(7, 0);
    const crystal = SAMPLE_BY_ID['field-crystal']!;
    // Below the survey threshold: paid per sample plus the first-kind bonus,
    // nothing filed.
    const smallHaul: SampleHaul[] = [
      { kind: 'field-crystal', n: C.GROUND_SURVEY_SAMPLES - 1, method: 'quick' },
    ];
    const small = groundReturnValue(s, 'w1', smallHaul);
    expect(small.firstSurvey).toBe(false);
    expect(small.salvage).toBe(
      (C.GROUND_SURVEY_SAMPLES - 1) * crystal.salvage + C.GROUND_CATALOGUE_BONUS,
    );

    const effects: SimEffect[] = [];
    const haul: SampleHaul[] = [{ kind: 'field-crystal', n: 6, method: 'quick' }];
    bankGroundSamples(s, effects, 'w1', 'Testworld', haul, { 'g0:1:1': 'worked' });
    expect(s.expedition.salvage).toBe(
      6 * crystal.salvage + C.GROUND_SURVEY_BONUS + C.GROUND_CATALOGUE_BONUS,
    );
    const record = s.expedition.groundWorlds['w1']!;
    expect(record.surveyedAtMs).not.toBeNull();
    expect(record.visits).toBe(1);
    expect(record.sites['g0:1:1']).toMatchObject({ s: 'worked' });
    expect(record.samples['field-crystal']).toBeDefined();
    expect(effects[0]).toMatchObject({
      t: 'groundReturn',
      firstSurvey: true,
      samples: 6,
      newKinds: ['field-crystal'],
    });

    // A second full haul of the same kind from the same world: per-sample pay
    // only — the survey is filed and the kind is already in the catalogue.
    const before = s.expedition.salvage;
    bankGroundSamples(s, effects, 'w1', 'Testworld', haul, {});
    expect(s.expedition.salvage).toBe(before + 6 * crystal.salvage);
    expect(effects[1]).toMatchObject({ firstSurvey: false, newKinds: [] });
    expect(record.visits).toBe(2);
  });

  it('precision cores count double toward the survey; preserved seams count too', () => {
    const s = newGame(8, 0);
    // Three cores at double credit clear a five-credit survey.
    const cores: SampleHaul[] = [{ kind: 'glacier-core', n: 3, method: 'core' }];
    expect(groundReturnValue(s, 'w2', cores).firstSurvey).toBe(true);

    // Two ordinary samples plus three preserved seams also clear it.
    const effects: SimEffect[] = [];
    bankGroundSamples(
      s,
      effects,
      'w4',
      'Elsewhere',
      [{ kind: 'field-crystal', n: 2, method: 'quick' }],
      { 'g1:2:3': 'preserved', 'g1:2:4': 'preserved', 'g1:2:5': 'preserved' },
    );
    expect(s.expedition.groundWorlds['w4']!.surveyedAtMs).not.toBeNull();
    expect(s.expedition.groundWorlds['w4']!.sites['g1:2:3']).toMatchObject({ s: 'preserved' });
  });

  it('banking nothing still counts the visit, quietly', () => {
    const s = newGame(8, 0);
    const effects: SimEffect[] = [];
    bankGroundSamples(s, effects, 'w1', 'Testworld', [], {});
    expect(s.expedition.salvage).toBe(0);
    expect(s.expedition.groundWorlds['w1']!.visits).toBe(1);
    expect(s.expedition.groundWorlds['w1']!.surveyedAtMs).toBeNull();
    expect(effects).toHaveLength(0);
  });

  it('a worked site never regrows, and the world yield cap holds', () => {
    const s = newGame(9, 0);
    const effects: SimEffect[] = [];
    bankGroundSamples(s, effects, 'w5', 'Quarry', [], { 'g2:7:7': 'worked' });
    // Working the same site again on a later landing cannot un-work it, and
    // a preserve arriving later cannot downgrade it either.
    bankGroundSamples(s, effects, 'w5', 'Quarry', [], { 'g2:7:7': 'preserved' });
    expect(s.expedition.groundWorlds['w5']!.sites['g2:7:7']).toMatchObject({ s: 'worked' });

    // The cap: a world nearly paid out trims the payout and says so.
    s.expedition.groundWorlds['w5']!.salvagePaid = C.GROUND_WORLD_YIELD_CAP - 3;
    const big: SampleHaul[] = [{ kind: 'field-crystal', n: 10, method: 'quick' }];
    const before = s.expedition.salvage;
    bankGroundSamples(s, effects, 'w5', 'Quarry', big, {});
    expect(s.expedition.salvage).toBe(before + 3);
    expect(effects.at(-1)).toMatchObject({ capped: true, salvage: 3 });
  });

  it('is reachable through the sim input, like every other verb', () => {
    const s = newGame(9, 0);
    step(
      s,
      0,
      [
        {
          type: 'bankGroundSamples',
          worldKey: 'w3',
          worldName: 'Elsewhere',
          haul: [{ kind: 'field-crystal', n: 5, method: 'quick' }],
          sites: {},
        },
      ],
      { utcDay: 1 },
    );
    expect(s.expedition.groundWorlds['w3']!.surveyedAtMs).not.toBeNull();
    expect(s.expedition.salvage).toBe(
      5 * SAMPLE_BY_ID['field-crystal']!.salvage + C.GROUND_SURVEY_BONUS + C.GROUND_CATALOGUE_BONUS,
    );
  });
});

describe('the terrain field', () => {
  it('is deterministic: the same landing is always the same valley', () => {
    const a = bakeSmall();
    const b = bakeSmall();
    expect(a.p.macro0).toBe(b.p.macro0);
    expect(a.p.seaLevelM).toBe(b.p.seaLevelM);
    for (const [x, z] of [[0, 0], [431, -212], [-1800, 950], [12000, -20000]] as const) {
      expect(heightAt(a.p, a.tiers, x, z)).toBe(heightAt(b.p, b.tiers, x, z));
    }
  });

  it('a different landing direction is a different countryside', () => {
    const a = bakeSmall();
    const b = bakeSmall({ ...TEST_SPEC, dir: [-0.7, 0.1, 0.7] });
    let differ = 0;
    for (const [x, z] of [[50, 50], [400, -300], [1500, 800]] as const) {
      if (Math.abs(heightAt(a.p, a.tiers, x, z) - heightAt(b.p, b.tiers, x, z)) > 0.5) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  });

  it('agrees with the orbital planet about where the continents are', () => {
    // The macro field must be planetGeometry's own arithmetic. Sample the
    // real geometry's vertices and evaluate the field at their directions;
    // the only permitted difference is the normalisation span (icosphere
    // vertices vs fibonacci sampling), which is a percent or two.
    const p = buildSurfaceParams(TEST_SPEC);
    // Detail 4: the geometry's own normalization span converges toward the
    // field's fibonacci estimate as its vertex count grows; detail 2's 162
    // vertices under-sample the extremes and the spans genuinely differ.
    const geo = createPlanetGeometry(TEST_SPEC.seed, TEST_SPEC.type, 4, 0);
    const pos = geo.getAttribute('position');
    const elev = geo.getAttribute('elevation');
    const v = new Vector3();
    let worst = 0;
    for (let i = 0; i < pos.count; i += 7) {
      // Displacement is radial, so normalizing recovers the sampling
      // direction the geometry itself used.
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      worst = Math.max(worst, Math.abs(macroNormAt(p, v) - elev.getX(i)));
    }
    expect(worst).toBeLessThan(0.06);
  });

  it('blends the near tier into the far tier without a step underfoot', () => {
    const { p, tiers } = bakeSmall();
    const halfNear = tiers.near.extent / 2;
    // Walk a line across the entire blend band; adjacent samples must never
    // jump more than terrain plausibly climbs in a stride.
    let prev = heightAt(p, tiers, halfNear * 0.9, 120);
    for (let x = halfNear * 0.9; x < halfNear * 1.1; x += 4) {
      const h = heightAt(p, tiers, x, 120);
      expect(Math.abs(h - prev)).toBeLessThan(12);
      prev = h;
    }
  });

  it('grows deposits on standable, dry ground, deterministically', () => {
    const { p, tiers } = bakeSmall();
    const seams = depositSites(p, tiers);
    expect(seams.length).toBeGreaterThan(3);
    const n = new Vector3();
    for (const d of seams) {
      expect(d.y).toBeGreaterThan(p.seaLevelM + 1.4);
      groundNormalAt(p, tiers, d.x, d.z, n);
      expect(n.y).toBeGreaterThan(0.8);
      expect(d.richness).toBeGreaterThanOrEqual(2);
      expect(d.richness).toBeLessThanOrEqual(5);
      expect(d.id).toMatch(/^g\d:\d+:\d+$/);
      expect(SAMPLE_BY_ID[d.kind]).toBeDefined();
    }
    // Deterministic placement, twice over.
    expect(depositSites(p, tiers)).toEqual(seams);
  });

  it('sites are properties of the place: the same ground is the same seam from any approach', () => {
    // Two landings a few dozen metres apart: overlapping ground, different
    // frames. The seams under both must agree on identity, richness and kind.
    const a = bakeSmall();
    const nudged = new Vector3(
      TEST_SPEC.dir[0] + 0.0002,
      TEST_SPEC.dir[1],
      TEST_SPEC.dir[2],
    ).normalize();
    const b = bakeSmall({ ...TEST_SPEC, dir: [nudged.x, nudged.y, nudged.z] });

    const seamsA = depositSites(a.p, a.tiers);
    const seamsB = depositSites(b.p, b.tiers);
    const byIdB = new Map(seamsB.map((d) => [d.id, d]));
    const shared = seamsA.filter((d) => byIdB.has(d.id));
    expect(shared.length).toBeGreaterThan(2);
    for (const d of shared) {
      const other = byIdB.get(d.id)!;
      expect(other.richness).toBe(d.richness);
      expect(other.kind).toBe(d.kind);
    }

    // A landing on the far side of the planet shares no ground and no seams.
    const far = bakeSmall({
      ...TEST_SPEC,
      dir: [-TEST_SPEC.dir[0], -TEST_SPEC.dir[1], -TEST_SPEC.dir[2]],
    });
    const seamsFar = depositSites(far.p, far.tiers);
    const idsA = new Set(seamsA.map((d) => d.id));
    expect(seamsFar.some((d) => idsA.has(d.id))).toBe(false);
  });
});

describe('the walk (control layer, driven like the frame loop)', () => {
  beforeEach(() => {
    endGroundfall();
    endFlight();
    configureTierSpecsForTests({ texels: 96, extent: 4096 }, { texels: 96, extent: 65536 });
    useGame.setState({ s: newGame(31337, 0) });
    useUiBus.setState({ groundfall: null, flightMode: true });
    flightInput.engage = false;
    flightInput.thrust = 0;
  });

  function commitOverHero(): void {
    const st = useGame.getState().s;
    const shell = heroWorldShell(st.planet.size);
    beginFlightAt(new Vector3(0, shell + 0.2, 0), 0, 0);
    // One sweep to populate bodies, one press to commit.
    stepFlight(1 / 60, 0.02);
    expect(flightLive.prompt?.verb).toBe('land');
    expect(flightLive.prompt?.blocked).toBeUndefined();
    flightInput.engage = true;
    stepFlight(1 / 60, 0.04);
    flightInput.engage = false;
    expect(useUiBus.getState().groundfall).not.toBeNull();
  }

  function bakeAndLand(): void {
    let t = 1;
    let guard = 0;
    while (!surfaceLive.ready && guard++ < 4000) {
      stepSurface(1 / 60, (t += 1 / 60));
    }
    expect(surfaceLive.ready).toBe(true);
    surfaceLive.phase = 'descent';
    surfaceLive.t = 1e6;
    stepSurface(1 / 60, (t += 1 / 60));
    expect((surfaceLive as { phase: GroundfallPhase }).phase).toBe('walk');
  }

  it('lands the hero world with its gauges on its face, walks, and stays on the ground', () => {
    commitOverHero();
    const session = useUiBus.getState().groundfall!;
    expect(session.hero).toBe(true);
    expect(session.worldKey).toBe(`w${useGame.getState().s.planet.lifetimeIndex}`);
    // A fresh commission has near-empty gauges; the ground must know that.
    expect(session.aspects.bio).toBeLessThan(0.5);

    bakeAndLand();
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    expect(surfaceLive.pos.y).toBeCloseTo(heightAt(p, tiers, surfaceLive.pos.x, surfaceLive.pos.z) + EYE, 3);

    // Walk forward two seconds; the walker moves and the ground holds it.
    const from = surfaceLive.pos.clone();
    surfaceInput.fwd = 1;
    let t = 2000;
    for (let i = 0; i < 120; i++) stepSurface(1 / 60, (t += 1 / 60));
    surfaceInput.fwd = 0;
    expect(surfaceLive.pos.distanceTo(from)).toBeGreaterThan(4);
    expect(surfaceLive.grounded).toBe(true);
    expect(surfaceLive.pos.y).toBeCloseTo(heightAt(p, tiers, surfaceLive.pos.x, surfaceLive.pos.z) + EYE, 2);

    // A jump leaves the ground and gravity brings it back.
    surfaceInput.jump = true;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.grounded).toBe(false);
    for (let i = 0; i < 180 && !surfaceLive.grounded; i++) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.grounded).toBe(true);
  });

  /** Stand two metres back from a seam, facing it, ready to work. */
  function standAt(seam: { x: number; y: number; z: number }): void {
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    const back = 2.2;
    const a = Math.atan2(seam.x - 0.001, seam.z - 0.001);
    const sx = seam.x - Math.sin(a) * back;
    const sz = seam.z - Math.cos(a) * back;
    surfaceLive.pos.set(sx, heightAt(p, tiers, sx, sz) + EYE, sz);
    surfaceLive.vel.set(0, 0, 0);
    const dx = seam.x - sx;
    const dz = seam.z - sz;
    surfaceLive.yaw = Math.atan2(-dx, -dz);
    surfaceLive.pitch = Math.atan2(seam.y + 0.9 - surfaceLive.pos.y, Math.hypot(dx, dz));
  }

  it('scans, mines by holding engage, banks on boarding, and files the survey', () => {
    commitOverHero();
    bakeAndLand();
    let t = 5000;

    // Work seams until the suit holds a survey's worth. The hold covers both
    // stages: the scan dwell resolves first, then the pick starts swinging.
    const seams = [...surfaceDeposits()];
    expect(seams.length).toBeGreaterThan(0);
    for (const seam of seams) {
      if (surfaceLive.samples >= C.GROUND_SURVEY_SAMPLES) break;
      standAt(seam);
      surfaceInput.engage = true;
      for (let i = 0; i < 700 && !surfaceLive.mined.has(seam.id); i++) {
        stepSurface(1 / 60, (t += 1 / 60));
      }
      surfaceInput.engage = false;
      expect(surfaceLive.scanned.has(seam.id)).toBe(true); // the scan came first
      expect(surfaceLive.mined.has(seam.id)).toBe(true);
      expect(surfaceLive.hits.has(seam.id)).toBe(false); // ledger cleaned
      expect(surfaceLive.outcomes.get(seam.id)).toBe('worked');
    }
    const carried = surfaceLive.samples;
    expect(carried).toBeGreaterThanOrEqual(C.GROUND_SURVEY_SAMPLES);
    expect(surfaceLive.haul.length).toBeGreaterThan(0);

    // Board and leave; the ledger settles on the way up. The expected pay is
    // the engine's own pure valuation of the haul the suit actually carries.
    const worldKey = useUiBus.getState().groundfall!.worldKey;
    const preState = useGame.getState().s;
    const salvageBefore = preState.expedition.salvage;
    const expected = groundReturnValue(preState, worldKey, surfaceLive.haul, 0);
    expect(expected.firstSurvey).toBe(true);
    beginTakeoff();
    expect(surfaceLive.samples).toBe(0);
    const st = useGame.getState().s;
    expect(st.expedition.salvage).toBe(salvageBefore + expected.salvage);
    const record = st.expedition.groundWorlds[worldKey]!;
    expect(record.surveyedAtMs).not.toBeNull();
    expect(record.visits).toBe(1);
    expect(Object.values(record.sites).some((s2) => s2.s === 'worked')).toBe(true);

    // Takeoff runs to completion and hands back a flight pose.
    let done: { pos: Vector3 } | null = null;
    for (let i = 0; i < TAKEOFF_SECONDS * 60 + 30 && !done; i++) {
      done = stepSurface(1 / 60, (t += 1 / 60)).done;
    }
    expect(done).not.toBeNull();
    expect(useUiBus.getState().groundfall).toBeNull();
  });

  it('the ground remembers: a worked seam is gone next landing, a prospect stands', () => {
    commitOverHero();
    bakeAndLand();
    let t = 20000;

    const seams = [...surfaceDeposits()];
    expect(seams.length).toBeGreaterThan(1);
    const workedSeam = seams[0]!;
    const prospectSeam = seams[1]!;

    // Quick-break the first seam.
    standAt(workedSeam);
    surfaceLive.scanned.add(workedSeam.id);
    surfaceInput.engage = true;
    for (let i = 0; i < 700 && !surfaceLive.mined.has(workedSeam.id); i++) {
      stepSurface(1 / 60, (t += 1 / 60));
    }
    surfaceInput.engage = false;
    expect(surfaceLive.outcomes.get(workedSeam.id)).toBe('worked');

    // Prospect the second: two swings, one sample, a stake left standing.
    standAt(prospectSeam);
    surfaceLive.scanned.add(prospectSeam.id);
    surfaceLive.verbIdx = 2; // prospect
    surfaceInput.engage = true;
    for (let i = 0; i < 400 && !surfaceLive.mined.has(prospectSeam.id); i++) {
      stepSurface(1 / 60, (t += 1 / 60));
    }
    surfaceInput.engage = false;
    expect(surfaceLive.outcomes.get(prospectSeam.id)).toBe('prospected');
    expect(surfaceProspects().map((d) => d.id)).toContain(prospectSeam.id);

    // Bank and complete the takeoff.
    beginTakeoff();
    let done: { pos: Vector3 } | null = null;
    for (let i = 0; i < TAKEOFF_SECONDS * 60 + 30 && !done; i++) {
      done = stepSurface(1 / 60, (t += 1 / 60)).done;
    }
    expect(done).not.toBeNull();
    const record = useGame.getState().s.expedition.groundWorlds[
      `w${useGame.getState().s.planet.lifetimeIndex}`
    ]!;
    expect(record.sites[workedSeam.id]).toMatchObject({ s: 'worked' });
    expect(record.sites[prospectSeam.id]).toMatchObject({ s: 'prospected' });

    // Land again on the same approach: same region, same lattice — but the
    // worked seam does not return, and the prospect stake is still standing.
    endFlight();
    commitOverHero();
    bakeAndLand();
    const idsNow = new Set(surfaceDeposits().map((d) => d.id));
    expect(idsNow.has(workedSeam.id)).toBe(false);
    expect(idsNow.has(prospectSeam.id)).toBe(false);
    expect(surfaceProspects().map((d) => d.id)).toContain(prospectSeam.id);
    // Untouched seams from the first landing are exactly where they were.
    for (const d of seams.slice(2)) expect(idsNow.has(d.id)).toBe(true);
  });

  it('lands one swing at a time: hits accumulate, then the seam gives', () => {
    commitOverHero();
    bakeAndLand();
    let t = 9000;
    const seam = [...surfaceDeposits()][0]!;
    standAt(seam);
    // Scanned already — this test is about the pick, not the instrument.
    surfaceLive.scanned.add(seam.id);

    // One full swing lands exactly one hit.
    surfaceInput.engage = true;
    const nonceBefore = surfaceLive.hitNonce;
    for (let i = 0; i < Math.ceil((SWING_SECONDS * 0.8) / (1 / 60)); i++) {
      stepSurface(1 / 60, (t += 1 / 60));
    }
    expect(surfaceLive.hitNonce).toBe(nonceBefore + 1);
    expect(surfaceLive.hits.get(seam.id)).toBe(1);
    expect(surfaceLive.mined.has(seam.id)).toBe(false);
    expect(surfaceLive.mineProgress).toBeCloseTo(1 / hitsNeeded(seam.richness), 5);

    // Let go mid-cycle: the pick recovers, the hits already landed remain.
    surfaceInput.engage = false;
    for (let i = 0; i < 60; i++) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.swing).toBe(0);
    expect(surfaceLive.hits.get(seam.id)).toBe(1);
  });

  it('flies the entry itself when the pilot commits to a dive', () => {
    const st = useGame.getState().s;
    st.flags[SORTIE_FLAG] = 1;
    const shell = heroWorldShell(st.planet.size);
    // Nose hard down over the pole, throttle open.
    beginFlightAt(new Vector3(0, shell + 0.42, 0), 0, -1.3);
    flightInput.thrust = 1;
    let t = 0;
    let sawAbortWindow = false;
    for (let i = 0; i < 300 && !useUiBus.getState().groundfall; i++) {
      stepFlight(1 / 60, (t += 1 / 60));
      if (flightLive.prompt?.label.includes('pull up to abort')) sawAbortWindow = true;
    }
    flightInput.thrust = 0;
    // The console announced the commitment before flying it.
    expect(sawAbortWindow).toBe(true);
    expect(useUiBus.getState().groundfall).not.toBeNull();
    expect(useUiBus.getState().groundfall!.hero).toBe(true);
  });

  it('never auto-enters while hovering inside the envelope', () => {
    const st = useGame.getState().s;
    st.flags[SORTIE_FLAG] = 1;
    const shell = heroWorldShell(st.planet.size);
    beginFlightAt(new Vector3(0, shell + 0.2, 0), 0, 0);
    let t = 0;
    for (let i = 0; i < 240; i++) stepFlight(1 / 60, (t += 1 / 60));
    // The polite offer stands; nothing was committed on the pilot's behalf.
    expect(flightLive.prompt?.verb).toBe('land');
    expect(flightLive.prompt?.label).toContain('make groundfall');
    expect(useUiBus.getState().groundfall).toBeNull();
  });

  it('keeps its hands off the stick during the induction', () => {
    const st = useGame.getState().s;
    expect(st.flags[SORTIE_FLAG]).toBeUndefined();
    const shell = heroWorldShell(st.planet.size);
    beginFlightAt(new Vector3(0, shell + 0.42, 0), 0, -1.3);
    flightInput.thrust = 1;
    let t = 0;
    for (let i = 0; i < 300; i++) stepFlight(1 / 60, (t += 1 / 60));
    flightInput.thrust = 0;
    // A brand-new pilot diving at home just gets cushioned, as before.
    expect(useUiBus.getState().groundfall).toBeNull();
  });

  it('declines to land on a gas giant, with a reason', () => {
    const st = useGame.getState().s;
    st.planet.type = 'gasgiant';
    const shell = heroWorldShell(st.planet.size);
    beginFlightAt(new Vector3(0, shell + 0.2, 0), 0, 0);
    stepFlight(1 / 60, 0.02);
    expect(flightLive.prompt?.verb).toBe('land');
    expect(flightLive.prompt?.blocked).toMatch(/no solid surface/);
    flightInput.engage = true;
    stepFlight(1 / 60, 0.04);
    flightInput.engage = false;
    expect(useUiBus.getState().groundfall).toBeNull();
  });
});
