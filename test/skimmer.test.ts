/**
 * Phase 3: the Survey Skimmer, and ground that extends to meet it.
 *
 * Three promises under test. The REFIT gates verbs by rank — deploy, then a
 * stabilised mast, then an amphibious hull — and salvage is the only price
 * (the seal holds). The SKIM is the walk's own contract at speed: the same
 * heightAt is the one truth, water follows the rank, lava follows nobody.
 * The ROLLING GROUND is the phase's real cost: a tier re-centre must be
 * invisible arithmetic — snapped centres, identical heights where covers
 * overlap, seams re-seated, the walker still standing.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { newGame } from '../src/engine/sim';
import { skimmerRank } from '../src/engine/deepField';
import { REFIT_BY_ID, SKIM_BOOST_M_S, SKIM_CRUISE_M_S, SKIM_WATER_LIMIT_M } from '../src/content/refit';
import {
  configureTierSpecsForTests,
  endGroundfall,
  EYE,
  SKIM_DEPLOY_RANGE,
  SKIM_MOUNT_RANGE,
  stepSurface,
  surfaceInput,
  surfaceLive,
  surfaceParams,
  surfaceTiers,
  SHIP_PARK,
  WADE_MAX_M,
  type GroundfallPhase,
} from '../src/ui/scene/surface/surfaceControl';
import {
  bakeTierRows,
  buildNormalMap,
  buildSurfaceParams,
  heightAt,
  makeTier,
  makeTierStream,
  scatterChunk,
  smoothTier,
  snapTierCenter,
  streamBegin,
  streamCommit,
  streamStep,
  type SurfaceTiers,
} from '../src/ui/scene/surface/terrainField';
import { weatherAt } from '../src/engine/weather';
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

describe('the refit line', () => {
  it('three ranks, ascending prices, capability per rank', () => {
    const def = REFIT_BY_ID['skimmer']!;
    expect(def).toBeDefined();
    expect(def.maxRank).toBe(3);
    expect(def.costs.length).toBe(3);
    for (let i = 1; i < def.costs.length; i++) {
      expect(def.costs[i]!).toBeGreaterThan(def.costs[i - 1]!);
    }
    expect(def.effect(0)).toMatch(/not fitted/);
    expect(def.effect(1)).toMatch(/deploys/);
    expect(def.effect(2)).toMatch(/stabilised/);
    expect(def.effect(3)).toMatch(/amphibious/);
    // The speed the spec promised: 20–30 m/s.
    expect(SKIM_CRUISE_M_S).toBeGreaterThanOrEqual(20);
    expect(SKIM_BOOST_M_S).toBeLessThanOrEqual(30);
    // Water tolerance is a ladder that ends in "the question stops applying".
    expect(SKIM_WATER_LIMIT_M[1]).toBeGreaterThan(WADE_MAX_M);
    expect(SKIM_WATER_LIMIT_M[3]).toBe(Infinity);
  });

  it('skimmerRank reads the expedition, clamped to the definition', () => {
    const s = newGame(4, 0);
    expect(skimmerRank(s.expedition)).toBe(0);
    s.expedition.refits['skimmer'] = 2;
    expect(skimmerRank(s.expedition)).toBe(2);
    s.expedition.refits['skimmer'] = 99;
    expect(skimmerRank(s.expedition)).toBe(3);
  });
});

describe('the skim (control layer, driven like the frame loop)', () => {
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
    stepFlight(1 / 60, 0.02);
    expect(flightLive.prompt?.verb).toBe('land');
    flightInput.engage = true;
    stepFlight(1 / 60, 0.04);
    flightInput.engage = false;
    expect(useUiBus.getState().groundfall).not.toBeNull();
  }

  function bakeAndLand(): void {
    let t = 1;
    let guard = 0;
    while (!surfaceLive.ready && guard++ < 4000) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.ready).toBe(true);
    surfaceLive.phase = 'descent';
    surfaceLive.t = 1e6;
    stepSurface(1 / 60, (t += 1 / 60));
    expect((surfaceLive as { phase: GroundfallPhase }).phase).toBe('walk');
  }

  function grantAndLand(rank: number): void {
    useGame.getState().s.expedition.refits['skimmer'] = rank;
    commitOverHero();
    bakeAndLand();
    expect(surfaceLive.skimRank).toBe(rank);
  }

  /** Stand beside the runabout and tap the deploy key. */
  function deployAtShip(t: number): number {
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    const gx = SHIP_PARK.x - SKIM_DEPLOY_RANGE * 0.5;
    const gz = SHIP_PARK.z;
    surfaceLive.pos.set(gx, heightAt(p, tiers, gx, gz) + EYE, gz);
    surfaceLive.vel.set(0, 0, 0);
    surfaceInput.deploy = true;
    stepSurface(1 / 60, (t += 1 / 60));
    return t;
  }

  it('no rank, no sled: the tap does nothing anywhere', () => {
    grantAndLand(0);
    let t = deployAtShip(1000);
    expect(surfaceLive.phase).toBe('walk');
    expect(surfaceLive.skimPrompt).toBeNull();
    void t;
  });

  it('rank 1 deploys at the runabout — and only at the runabout', () => {
    grantAndLand(1);
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    // Far from the pad: the tap is a polite no-op.
    const fx = SHIP_PARK.x + 200;
    surfaceLive.pos.set(fx, heightAt(p, tiers, fx, 0) + EYE, 0);
    surfaceInput.deploy = true;
    let t = 500;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.phase).toBe('walk');
    // At the pad: aboard.
    t = deployAtShip(t);
    expect(surfaceLive.phase).toBe('skim');
    expect(surfaceLive.skimmerAt).toBeNull(); // it is under you, not parked
  });

  it('reaches cruise, and fast cruise, over open ground', () => {
    grantAndLand(1);
    let t = deployAtShip(2000);
    expect(surfaceLive.phase).toBe('skim');

    // Pick the driest heading from the pad so the sea does not referee.
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    let bestYaw = 0;
    let bestMin = -Infinity;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      let minH = Infinity;
      for (let d = 40; d <= 900; d += 40) {
        const h = heightAt(p, tiers, surfaceLive.pos.x - Math.sin(a) * d, surfaceLive.pos.z - Math.cos(a) * d);
        minH = Math.min(minH, h - p.seaLevelM);
      }
      if (minH > bestMin) {
        bestMin = minH;
        bestYaw = a;
      }
    }
    surfaceLive.yaw = bestYaw;

    surfaceInput.fwd = 1;
    for (let i = 0; i < 200; i++) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.skimSpeed).toBeGreaterThan(SKIM_CRUISE_M_S * 0.85);
    expect(surfaceLive.skimSpeed).toBeLessThanOrEqual(SKIM_CRUISE_M_S + 0.5);

    surfaceInput.run = true;
    for (let i = 0; i < 200; i++) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.skimSpeed).toBeGreaterThan(SKIM_BOOST_M_S * 0.85);
    surfaceInput.run = false;
    surfaceInput.fwd = 0;

    // The cushion kept its hover through all of it.
    const ground = heightAt(p, tiers, surfaceLive.pos.x, surfaceLive.pos.z);
    expect(surfaceLive.pos.y).toBeGreaterThan(ground + 1);
    expect(surfaceLive.pos.y).toBeLessThan(ground + 6);
  });

  it('dismount parks the sled; walking back into range remounts it', () => {
    grantAndLand(1);
    let t = deployAtShip(3000);
    expect(surfaceLive.phase).toBe('skim');

    surfaceInput.deploy = true;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.phase).toBe('walk');
    const at = surfaceLive.skimmerAt;
    expect(at).not.toBeNull();
    const d = Math.hypot(at!.x - surfaceLive.pos.x, at!.z - surfaceLive.pos.z);
    expect(d).toBeLessThan(SKIM_MOUNT_RANGE);

    surfaceInput.deploy = true;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.phase).toBe('skim');
    expect(surfaceLive.skimmerAt).toBeNull();
  });

  it('boarding the runabout from the saddle stows the sled and leaves', () => {
    grantAndLand(1);
    let t = deployAtShip(4000);
    expect(surfaceLive.phase).toBe('skim');
    surfaceLive.pos.set(SHIP_PARK.x + 2, surfaceLive.pos.y, SHIP_PARK.z + 2);
    surfaceInput.engage = true;
    stepSurface(1 / 60, (t += 1 / 60));
    surfaceInput.engage = false;
    expect(surfaceLive.phase).toBe('takeoff');
    expect(surfaceLive.skimmerAt).toBeNull();
  });

  function landOnOcean(rank: number): void {
    const st = useGame.getState().s;
    st.planet.type = 'ocean';
    st.planet.gauges.hydro = st.planet.targets.hydro;
    st.expedition.refits['skimmer'] = rank;
    commitOverHero();
    bakeAndLand();
  }

  /** Outward scan for a shelf deeper than the given metres of water. */
  function findDeep(minDepth: number): { x: number; z: number } | null {
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    for (let r = 40; r < 3000; r += 16) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (p.seaLevelM - heightAt(p, tiers, x, z) > minDepth) return { x, z };
      }
    }
    return null;
  }

  it('ranks 1–2: shallows are ground with opinions, open water is refused', () => {
    landOnOcean(1);
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    const deep = findDeep(SKIM_WATER_LIMIT_M[1]! + 2);
    expect(deep).not.toBeNull();

    // Mount, then shove the sled out over the deep shelf.
    let t = 6000;
    t = deployAtShip(t);
    expect(surfaceLive.phase).toBe('skim');
    surfaceLive.pos.set(deep!.x, p.seaLevelM + 3, deep!.z);
    surfaceLive.vel.set(0, 0, 0);
    let refused = false;
    for (let i = 0; i < 300; i++) {
      stepSurface(1 / 60, (t += 1 / 60));
      refused = refused || surfaceLive.wadeRefused;
    }
    expect(refused).toBe(true);
    const endDepth = p.seaLevelM - heightAt(p, tiers, surfaceLive.pos.x, surfaceLive.pos.z);
    const startDepth = p.seaLevelM - heightAt(p, tiers, deep!.x, deep!.z);
    expect(endDepth).toBeLessThan(startDepth); // walked back up the seabed

    // And dismounting over even wading-deep water is refused with a note.
    const wet = findDeep(WADE_MAX_M + 0.4);
    if (wet) {
      surfaceLive.pos.set(wet.x, p.seaLevelM + 3, wet.z);
      surfaceLive.vel.set(0, 0, 0);
      surfaceInput.deploy = true;
      stepSurface(1 / 60, (t += 1 / 60));
      expect(surfaceLive.phase).toBe('skim'); // still aboard
      expect(surfaceLive.skimPrompt).toMatch(/declines to swim/);
    }
  });

  it('rank 3 is amphibious: open water is scenery, ridden at the surface', () => {
    landOnOcean(3);
    const p = surfaceParams()!;
    const deep = findDeep(8);
    expect(deep).not.toBeNull();

    let t = 8000;
    t = deployAtShip(t);
    expect(surfaceLive.phase).toBe('skim');
    surfaceLive.pos.set(deep!.x, p.seaLevelM + 3, deep!.z);
    surfaceLive.vel.set(0, 0, 0);
    let refused = false;
    for (let i = 0; i < 240; i++) {
      stepSurface(1 / 60, (t += 1 / 60));
      refused = refused || surfaceLive.wadeRefused;
    }
    expect(refused).toBe(false);
    // The hull rides the water line, not the seabed.
    expect(surfaceLive.pos.y).toBeGreaterThan(p.seaLevelM + 1);
    expect(surfaceLive.pos.y).toBeLessThan(p.seaLevelM + 5);
  });

  it('rank 2 aboard: the mast holds the pulse through a real dust front', () => {
    // Dust needs a desert with air; the schedule is pure, so ask it when.
    const st = useGame.getState().s;
    st.planet.type = 'desert';
    st.planet.gauges.atmo = st.planet.targets.atmo;
    st.expedition.refits['skimmer'] = 2;
    commitOverHero();
    bakeAndLand();
    const session = useUiBus.getState().groundfall!;
    const wSpec = { seed: session.seed, type: session.type, aspects: session.aspects, dir: session.dir };
    let dustWhen = -1;
    for (let w = 0; w < 200 * 3_600_000; w += 60_000) {
      const wx = weatherAt(wSpec, w);
      if (wx.kind === 'dust' && wx.scanRangeMult < 0.75) {
        dustWhen = w;
        break;
      }
    }
    expect(dustWhen).toBeGreaterThanOrEqual(0);
    useGame.getState().s.gameTimeMs = dustWhen;

    // On foot inside the front: the pulse is eaten, as Phase 2 promised.
    let t = 10000;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.stabilised).toBe(false);
    expect(surfaceLive.scanRangeNow).toBeLessThan(surfaceLive.scanRange * 0.75);

    // Aboard at rank 2: the same sky, the full arm.
    t = deployAtShip(t);
    expect(surfaceLive.phase).toBe('skim');
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.stabilised).toBe(true);
    expect(surfaceLive.scanRangeNow).toBeGreaterThanOrEqual(surfaceLive.scanRange);

    // A storm still FEEDS the pulse — stabilisation is a floor, not a wall.
    let stormWhen = -1;
    for (let w = 0; w < 200 * 3_600_000; w += 60_000) {
      if (weatherAt(wSpec, w).scanRangeMult > 1.05) {
        stormWhen = w;
        break;
      }
    }
    if (stormWhen >= 0) {
      useGame.getState().s.gameTimeMs = stormWhen;
      stepSurface(1 / 60, (t += 1 / 60));
      expect(surfaceLive.scanRangeNow).toBeGreaterThan(surfaceLive.scanRange);
    }
  });

  it('the ground rolls: driving far re-centres the near tier without a seam lost', () => {
    grantAndLand(1);
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    let t = deployAtShip(12000);
    expect(surfaceLive.phase).toBe('skim');
    expect(tiers.near.cx).toBe(0);
    expect(surfaceLive.terrainEpoch).toBe(0);

    // Stand the walker far off-centre; the stream must chase and commit.
    const half = tiers.near.extent / 2;
    surfaceLive.pos.set(half * 0.45, surfaceLive.pos.y, half * 0.2);
    surfaceLive.vel.set(0, 0, 0);
    const probeX = surfaceLive.pos.x + 60;
    const probeZ = surfaceLive.pos.z - 40;
    const before = heightAt(p, tiers, probeX, probeZ);

    let guard = 0;
    while (surfaceLive.terrainEpoch === 0 && guard++ < 600) {
      stepSurface(1 / 60, (t += 1 / 60));
    }
    expect(surfaceLive.terrainEpoch).toBeGreaterThan(0);
    // The tier moved to the traveller, on the texel grid.
    expect(Math.abs(tiers.near.cx - surfaceLive.pos.x)).toBeLessThan(half);
    const step = tiers.near.extent / (tiers.near.texels - 1);
    expect(Math.abs(tiers.near.cx / step - Math.round(tiers.near.cx / step))).toBeLessThan(1e-9);
    // Where old and new cover overlap, the re-centre changed NOTHING: the
    // snapped grid samples the same analytic field at the same points.
    const after = heightAt(p, tiers, probeX, probeZ);
    expect(Math.abs(after - before)).toBeLessThan(1e-6);
    // Give the cushion its settle (the teleport dropped it far from the new
    // floor; it climbs like a sled, not a lift), then: still riding.
    for (let i = 0; i < 500; i++) stepSurface(1 / 60, (t += 1 / 60));
    const ground = heightAt(p, tiers, surfaceLive.pos.x, surfaceLive.pos.z);
    expect(surfaceLive.pos.y).toBeGreaterThan(ground + 0.5);
    expect(surfaceLive.pos.y).toBeLessThan(ground + 8);
  });
});

describe('the rolling bake, as arithmetic', () => {
  const SPEC = {
    seed: 424242,
    type: 'terrestrial' as const,
    size: 'medium' as const,
    dir: [0.2, 0.53, -0.82] as [number, number, number],
    aspects: { thermal: 0.5, atmo: 0.5, hydro: 0.5, bio: 0.5 },
  };

  function smallTiers(): { p: ReturnType<typeof buildSurfaceParams>; tiers: SurfaceTiers } {
    const p = buildSurfaceParams(SPEC);
    const tiers: SurfaceTiers = {
      near: makeTier({ texels: 64, extent: 4096 }),
      far: makeTier({ texels: 64, extent: 65536 }),
    };
    bakeTierRows(p, tiers.near, 0, 64);
    bakeTierRows(p, tiers.far, 0, 64);
    smoothTier(tiers.near);
    smoothTier(tiers.far);
    buildNormalMap(tiers.near);
    buildNormalMap(tiers.far);
    return { p, tiers };
  }

  it('a snapped re-centre reproduces the same interior heights exactly', () => {
    const { p, tiers } = smallTiers();
    const step = tiers.near.extent / (tiers.near.texels - 1);
    const snapped = snapTierCenter(tiers.near, 517, -223);
    expect(Math.abs(snapped.cx % step)).toBe(0);
    expect(Math.abs(snapped.cz % step)).toBe(0);

    // Points interior to BOTH covers (2+ texels from every edge).
    const pts: [number, number][] = [[300, 100], [700, -400], [snapped.cx, snapped.cz]];
    const before = pts.map(([x, z]) => heightAt(p, tiers, x, z));

    const stream = makeTierStream(tiers.near);
    streamBegin(stream, 517, -223);
    let guard = 0;
    while (!streamStep(stream, p, 50) && guard++ < 200) { /* bake on */ }
    streamCommit(stream);
    expect(tiers.near.cx).toBe(snapped.cx);
    expect(tiers.near.cz).toBe(snapped.cz);

    const after = pts.map(([x, z]) => heightAt(p, tiers, x, z));
    for (let i = 0; i < pts.length; i++) {
      expect(Math.abs(after[i]! - before[i]!)).toBeLessThan(1e-6);
    }
  });

  it('the streamed pipeline equals a direct bake at the same centre', () => {
    const { p, tiers } = smallTiers();
    const stream = makeTierStream(tiers.near);
    streamBegin(stream, 1024, 2048);
    let guard = 0;
    while (!streamStep(stream, p, 50) && guard++ < 200) { /* bake on */ }
    streamCommit(stream);

    const direct = makeTier({ texels: 64, extent: 4096 });
    const snapped = snapTierCenter(direct, 1024, 2048);
    direct.cx = snapped.cx;
    direct.cz = snapped.cz;
    bakeTierRows(p, direct, 0, 64);
    smoothTier(direct);
    buildNormalMap(direct);

    expect(tiers.near.data).toEqual(direct.data);
    expect(tiers.near.normals).toEqual(direct.normals);
  });

  it('chunk scatter is a pure hash: same chunk, same rocks, forever', () => {
    const { p, tiers } = smallTiers();
    const opt = { tries: 11, maxSlopeY: 0.5, shore: 0.4, scale: [0.35, 2.4] as [number, number] };
    const a = scatterChunk(p, tiers, 0x11a, 256, 3, -2, opt);
    const b = scatterChunk(p, tiers, 0x11a, 256, 3, -2, opt);
    expect(a).toEqual(b);
    // A neighbouring chunk grew different rocks.
    const c = scatterChunk(p, tiers, 0x11a, 256, 4, -2, opt);
    expect(c).not.toEqual(a);
    // Every seat stands inside its chunk, above the shore, on its feet.
    for (let k = 0; k < a.length; k += 5) {
      expect(a[k]!).toBeGreaterThanOrEqual(3 * 256);
      expect(a[k]!).toBeLessThanOrEqual(4 * 256);
      expect(a[k + 2]!).toBeGreaterThanOrEqual(-2 * 256);
      expect(a[k + 2]!).toBeLessThanOrEqual(-1 * 256);
      expect(a[k + 1]!).toBeGreaterThanOrEqual(p.seaLevelM + 0.4);
    }
  });
});
