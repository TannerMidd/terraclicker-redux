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
import type { SimEffect } from '../src/engine/types';
import { C } from '../src/content/constants';
import {
  buildSurfaceParams,
  bakeTierRows,
  buildNormalMap,
  depositSites,
  groundNormalAt,
  heightAt,
  macroNormAt,
  makeTier,
  type SurfaceTiers,
} from '../src/ui/scene/surface/terrainField';
import { createPlanetGeometry } from '../src/ui/scene/planetGeometry';
import {
  beginTakeoff,
  configureTierSpecsForTests,
  endGroundfall,
  EYE,
  stepSurface,
  surfaceDeposits,
  surfaceInput,
  surfaceLive,
  surfaceParams,
  surfaceTiers,
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

  it('pays per sample, pays the survey bonus once, and only for a real survey', () => {
    const s = newGame(7, 0);
    // Below the survey threshold: paid per sample, nothing filed.
    const small = groundReturnValue(s, 'w1', C.GROUND_SURVEY_SAMPLES - 1);
    expect(small.firstSurvey).toBe(false);
    expect(small.salvage).toBe((C.GROUND_SURVEY_SAMPLES - 1) * C.GROUND_SAMPLE_SALVAGE);

    const effects: SimEffect[] = [];
    bankGroundSamples(s, effects, 'w1', 'Testworld', 6);
    expect(s.expedition.salvage).toBe(6 * C.GROUND_SAMPLE_SALVAGE + C.GROUND_SURVEY_BONUS);
    expect(s.expedition.ground['w1']).toBeDefined();
    expect(effects[0]).toMatchObject({ t: 'groundReturn', firstSurvey: true, samples: 6 });

    // A second full haul from the same world: per-sample pay only.
    const before = s.expedition.salvage;
    bankGroundSamples(s, effects, 'w1', 'Testworld', 6);
    expect(s.expedition.salvage).toBe(before + 6 * C.GROUND_SAMPLE_SALVAGE);
    expect(effects[1]).toMatchObject({ firstSurvey: false });
  });

  it('banking nothing records nothing', () => {
    const s = newGame(8, 0);
    const effects: SimEffect[] = [];
    bankGroundSamples(s, effects, 'w1', 'Testworld', 0);
    expect(s.expedition.salvage).toBe(0);
    expect(s.expedition.ground['w1']).toBeUndefined();
    expect(effects).toHaveLength(0);
  });

  it('is reachable through the sim input, like every other verb', () => {
    const s = newGame(9, 0);
    step(s, 0, [{ type: 'bankGroundSamples', worldKey: 'w3', worldName: 'Elsewhere', samples: 5 }], { utcDay: 1 });
    expect(s.expedition.ground['w3']).toBeDefined();
    expect(s.expedition.salvage).toBe(5 * C.GROUND_SAMPLE_SALVAGE + C.GROUND_SURVEY_BONUS);
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

  it('grows deposits on standable, dry ground', () => {
    const { p, tiers } = bakeSmall();
    const seams = depositSites(p, tiers, 12);
    expect(seams.length).toBeGreaterThan(6);
    const n = new Vector3();
    for (const d of seams) {
      expect(d.y).toBeGreaterThan(p.seaLevelM + 1.4);
      groundNormalAt(p, tiers, d.x, d.z, n);
      expect(n.y).toBeGreaterThan(0.8);
      expect(d.richness).toBeGreaterThanOrEqual(2);
      expect(d.richness).toBeLessThanOrEqual(5);
    }
    // Deterministic placement, twice over.
    expect(depositSites(p, tiers, 12)).toEqual(seams);
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

  it('mines a seam by holding engage, banks on boarding, and files the survey', () => {
    commitOverHero();
    bakeAndLand();
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    let t = 5000;

    // Work seams until the suit holds a survey's worth.
    const seams = [...surfaceDeposits()];
    expect(seams.length).toBeGreaterThan(0);
    for (const seam of seams) {
      if (surfaceLive.samples >= C.GROUND_SURVEY_SAMPLES) break;
      // Stand two metres back from the seam, facing it.
      const back = 2.2;
      const a = Math.atan2(seam.x - 0.001, seam.z - 0.001);
      const sx = seam.x - Math.sin(a) * back;
      const sz = seam.z - Math.cos(a) * back;
      surfaceLive.pos.set(sx, heightAt(p, tiers, sx, sz) + EYE, sz);
      surfaceLive.vel.set(0, 0, 0);
      const dx = seam.x - sx;
      const dz = seam.z - sz;
      surfaceLive.yaw = Math.atan2(-dx, -dz);
      const dy = seam.y + 0.9 - surfaceLive.pos.y;
      surfaceLive.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      surfaceInput.engage = true;
      for (let i = 0; i < 240 && !surfaceLive.mined.has(seam.id); i++) {
        stepSurface(1 / 60, (t += 1 / 60));
      }
      surfaceInput.engage = false;
      expect(surfaceLive.mined.has(seam.id)).toBe(true);
    }
    const carried = surfaceLive.samples;
    expect(carried).toBeGreaterThanOrEqual(C.GROUND_SURVEY_SAMPLES);

    // Board and leave; the ledger settles on the way up.
    const worldKey = useUiBus.getState().groundfall!.worldKey;
    const salvageBefore = useGame.getState().s.expedition.salvage;
    beginTakeoff();
    expect(surfaceLive.samples).toBe(0);
    const st = useGame.getState().s;
    expect(st.expedition.salvage).toBe(
      salvageBefore + carried * C.GROUND_SAMPLE_SALVAGE + C.GROUND_SURVEY_BONUS,
    );
    expect(st.expedition.ground[worldKey]).toBeDefined();

    // Takeoff runs to completion and hands back a flight pose.
    let done: { pos: Vector3 } | null = null;
    for (let i = 0; i < TAKEOFF_SECONDS * 60 + 30 && !done; i++) {
      done = stepSurface(1 / 60, (t += 1 / 60)).done;
    }
    expect(done).not.toBeNull();
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
