/**
 * Phase 6: the runabout comes down to the ground.
 *
 * Four promises under test. The REFIT gates the whole layer by rank, and
 * salvage is the only price (the seal holds). The ENVELOPE is honest — the
 * ceiling is a ceiling, cruise is cruise, and the floor is a floor nobody
 * crashes through. The SET-DOWN generalises the autoland's oldest instinct
 * off the approach vector and onto any point of a landing's own ground:
 * water, lava, slope and other people's plazas are all refusals with a
 * reason and, where there is one, a divert. The SWEEP places and never
 * reads: charted seams are hunches, not scans, and nothing airborne mints
 * a single unit of anything.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { newGame } from '../src/engine/sim';
import { atmoRank } from '../src/engine/deepField';
import {
  ATMO_BOOST_M_S,
  ATMO_CEILING_M,
  ATMO_CRUISE_M_S,
  REFIT_BY_ID,
} from '../src/content/refit';
import {
  atmoEnvelope,
  HOVER_ALT_M,
  ORBIT_HOLD_SECONDS,
  REGION_CROSSING_M,
  SETDOWN_ARM_M,
  SWEEP_MAX_M,
  SWEEP_RESOLVE_CEILING_M,
  sweepRadius,
} from '../src/engine/atmoflight';
import {
  beginLift,
  configureTierSpecsForTests,
  endGroundfall,
  EYE,
  setDownNow,
  SHIP_PARK,
  stepSurface,
  surfaceInput,
  surfaceLive,
  surfaceParams,
  surfaceTiers,
  type GroundfallPhase,
} from '../src/ui/scene/surface/surfaceControl';
import {
  findSetdownSite,
  heightAt,
  setdownRefusal,
  SETDOWN_REFUSAL_TEXT,
} from '../src/ui/scene/surface/terrainField';
import { groundObjectiveMet } from '../src/engine/bridge';
import { petitionsFor } from '../src/content/petitions';
import { bankGroundSamples } from '../src/engine/groundfall';
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
    const def = REFIT_BY_ID['atmo']!;
    expect(def).toBeDefined();
    expect(def.maxRank).toBe(3);
    expect(def.costs.length).toBe(3);
    for (let i = 1; i < def.costs.length; i++) {
      expect(def.costs[i]!).toBeGreaterThan(def.costs[i - 1]!);
    }
    expect(def.effect(0)).toMatch(/not fitted/);
    expect(def.effect(1)).toMatch(/low flight/);
    expect(def.effect(2)).toMatch(/stormworthy/);
    expect(def.effect(3)).toMatch(/terrain hold/);
  });

  it('the envelope opens with rank and never closes', () => {
    for (let r = 1; r <= 3; r++) {
      expect(ATMO_CRUISE_M_S[r]!).toBeGreaterThan(ATMO_CRUISE_M_S[r - 1]!);
      expect(ATMO_BOOST_M_S[r]!).toBeGreaterThan(ATMO_CRUISE_M_S[r]!);
      expect(ATMO_CEILING_M[r]!).toBeGreaterThan(ATMO_CEILING_M[r - 1]!);
    }
    expect(atmoEnvelope(0).cruise).toBe(0);
    expect(atmoEnvelope(1).stormproof).toBe(false);
    expect(atmoEnvelope(2).stormproof).toBe(true);
    expect(atmoEnvelope(2).terrainHold).toBe(false);
    expect(atmoEnvelope(3).terrainHold).toBe(true);
    // Rough-field gear says yes to ground the early ranks refuse.
    expect(atmoEnvelope(3).setdownNormalY).toBeLessThan(atmoEnvelope(1).setdownNormalY);
    // Out-of-range ranks clamp rather than produce a ship with no numbers.
    expect(atmoEnvelope(9).ceiling).toBe(atmoEnvelope(3).ceiling);
    expect(atmoEnvelope(-3).rank).toBe(0);
  });

  it('atmoRank reads the expedition, clamped to the definition', () => {
    const s = newGame(7, 0);
    expect(atmoRank(s.expedition)).toBe(0);
    s.expedition.refits['atmo'] = 2;
    expect(atmoRank(s.expedition)).toBe(2);
    s.expedition.refits['atmo'] = 99;
    expect(atmoRank(s.expedition)).toBe(3);
  });

  it('the sweep is a cone: height buys width, and the air takes it back', () => {
    expect(sweepRadius(0)).toBe(0);
    expect(sweepRadius(120)).toBeGreaterThan(sweepRadius(60));
    expect(sweepRadius(100_000)).toBe(0); // past the resolve ceiling
    expect(sweepRadius(SWEEP_RESOLVE_CEILING_M + 1)).toBe(0);
    expect(sweepRadius(9000)).toBe(0);
    expect(sweepRadius(800)).toBeLessThanOrEqual(SWEEP_MAX_M);
    // Smeared by speed: a sensor cannot resolve what it is sprinting over.
    expect(sweepRadius(200, 400)).toBe(0);
  });
});

describe('the flight (control layer, driven like the frame loop)', () => {
  beforeEach(() => {
    endGroundfall();
    endFlight();
    configureTierSpecsForTests({ texels: 96, extent: 4096 }, { texels: 96, extent: 65536 });
    useGame.setState({ s: newGame(31337, 0) });
    useUiBus.setState({ groundfall: null, flightMode: true });
    flightInput.engage = false;
    flightInput.thrust = 0;
    surfaceInput.fwd = 0;
    surfaceInput.strafe = 0;
    surfaceInput.run = false;
    surfaceInput.engage = false;
    surfaceInput.rise = false;
    surfaceInput.descend = false;
    surfaceInput.view = false;
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
    useGame.getState().s.expedition.refits['atmo'] = rank;
    commitOverHero();
    bakeAndLand();
    expect(surfaceLive.atmoRank).toBe(rank);
  }

  /** Stand at the ramp, where the board prompt is live. */
  function standAtShip(): void {
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    const gx = surfaceLive.shipAt.x - 3;
    const gz = surfaceLive.shipAt.z;
    surfaceLive.pos.set(gx, heightAt(p, tiers, gx, gz) + EYE, gz);
    surfaceLive.vel.set(0, 0, 0);
  }

  /** Run frames until the scripted lift or flare finishes. */
  function runScript(t: number): number {
    let guard = 0;
    while (surfaceLive.flyScript && guard++ < 1200) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.flyScript).toBeNull();
    return t;
  }

  it('without the package, boarding still means orbit and nothing else', () => {
    grantAndLand(0);
    standAtShip();
    let t = 100;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.prompt?.label).toMatch(/board the runabout/);
    surfaceInput.engage = true;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.phase).toBe('takeoff');
    // And the lift refuses to exist without the fitting.
    surfaceLive.phase = 'walk';
    beginLift();
    expect(surfaceLive.phase).toBe('walk');
  });

  it('a tap takes her up; a hold breaks for orbit instead', () => {
    grantAndLand(1);
    standAtShip();
    let t = 200;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.prompt?.label).toMatch(/take her up/);

    // Held past the threshold: orbit, exactly as before the package existed.
    surfaceInput.engage = true;
    for (let i = 0; i < Math.ceil(ORBIT_HOLD_SECONDS * 60) + 4; i++) {
      stepSurface(1 / 60, (t += 1 / 60));
    }
    expect(surfaceLive.phase).toBe('takeoff');

    // Tapped and released: a hover, and the stay is still open.
    endGroundfall();
    grantAndLand(1);
    standAtShip();
    t = 300;
    surfaceInput.engage = true;
    stepSurface(1 / 60, (t += 1 / 60));
    surfaceInput.engage = false;
    stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.phase).toBe('fly');
    t = runScript(t);
    expect(useUiBus.getState().groundfall).not.toBeNull();
    const line = heightAt(surfaceParams()!, surfaceTiers()!, surfaceLive.pos.x, surfaceLive.pos.z);
    expect(surfaceLive.pos.y - line).toBeGreaterThan(HOVER_ALT_M * 0.5);
    expect(surfaceLive.flew).toBe(true);
  });

  it('flies to cruise, holds the ceiling, and never touches the ground', () => {
    grantAndLand(2);
    standAtShip();
    let t = 400;
    beginLift();
    t = runScript(t);
    const env = atmoEnvelope(2);

    surfaceInput.fwd = 1;
    for (let i = 0; i < 900; i++) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.airSpeed).toBeGreaterThan(env.cruise * 0.8);
    expect(surfaceLive.airSpeed).toBeLessThanOrEqual(env.cruise + 1);

    // The ceiling holds even with the climb key nailed down.
    surfaceInput.rise = true;
    for (let i = 0; i < 1800; i++) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.alt).toBeLessThanOrEqual(env.ceiling + 1);
    surfaceInput.rise = false;

    // And the floor holds with the sink key nailed down. No damage model,
    // no crash: the airframe simply declines to arrive.
    surfaceInput.descend = true;
    for (let i = 0; i < 2400; i++) stepSurface(1 / 60, (t += 1 / 60));
    expect(['fly', 'walk']).toContain(surfaceLive.phase);
    if (surfaceLive.phase === 'fly') expect(surfaceLive.alt).toBeGreaterThan(0);
    surfaceInput.descend = false;
  });

  it('a set-down moves the ship, puts boots outside, and keeps the stay open', () => {
    grantAndLand(3);
    standAtShip();
    let t = 600;
    beginLift();
    t = runScript(t);

    // Somewhere else entirely, at set-down height.
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    let ax = 0;
    let az = 0;
    let found = false;
    for (let r = 300; r <= 1500 && !found; r += 150) {
      for (let a = 0; a < Math.PI * 2 && !found; a += Math.PI / 6) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (!setdownRefusal(p, tiers, x, z, {
          normalY: atmoEnvelope(3).setdownNormalY,
          dryMarginM: 1.5,
          divertM: 0,
        })) {
          ax = x;
          az = z;
          found = true;
        }
      }
    }
    expect(found).toBe(true);
    surfaceLive.pos.set(ax, heightAt(p, tiers, ax, az) + SETDOWN_ARM_M * 0.5, az);
    surfaceLive.vel.set(0, 0, 0);
    stepSurface(1 / 60, (t += 1 / 60));

    const landed = setDownNow();
    expect(landed).not.toBeNull();
    expect(surfaceLive.phase).toBe('walk');
    expect(surfaceLive.setdowns).toBe(1);
    // The ship is where it set down, not on the arrival pad.
    expect(Math.hypot(surfaceLive.shipAt.x - SHIP_PARK.x, surfaceLive.shipAt.z - SHIP_PARK.z))
      .toBeGreaterThan(100);
    // The walker is beside it, on the ground, and can board it again.
    const shipD = Math.hypot(
      surfaceLive.pos.x - surfaceLive.shipAt.x,
      surfaceLive.pos.z - surfaceLive.shipAt.z,
    );
    expect(shipD).toBeGreaterThan(2);
    expect(shipD).toBeLessThan(20);
    expect(surfaceLive.grounded).toBe(true);
    expect(useUiBus.getState().groundfall).not.toBeNull(); // the stay did not end
  });

  it('the rolling ground keeps up with the ship', () => {
    // Phase 3 built the stream for a sled at 29 m/s; this is the same ground
    // under something three times faster. The promise is not that the bake
    // is instant — it is that the traveller is never outside the tier that
    // is feeding them, so the ground under the hull is always real ground.
    grantAndLand(3);
    standAtShip();
    let t = 1000;
    beginLift();
    t = runScript(t);
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;

    surfaceInput.fwd = 1;
    surfaceInput.run = true;
    let epochs = 0;
    let lastEpoch = surfaceLive.terrainEpoch;
    for (let i = 0; i < 60 * 30; i++) {
      stepSurface(1 / 60, (t += 1 / 60));
      if (surfaceLive.terrainEpoch !== lastEpoch) {
        lastEpoch = surfaceLive.terrainEpoch;
        epochs++;
      }
      // Never outside the near tier's cover, at any point of the run.
      const half = tiers.near.extent / 2;
      expect(Math.abs(surfaceLive.pos.x - tiers.near.cx)).toBeLessThan(half);
      expect(Math.abs(surfaceLive.pos.z - tiers.near.cz)).toBeLessThan(half);
      // And the ground under the hull is always a real number.
      expect(Number.isFinite(heightAt(p, tiers, surfaceLive.pos.x, surfaceLive.pos.z))).toBe(true);
    }
    surfaceInput.fwd = 0;
    surfaceInput.run = false;
    // Half a minute at boost crosses kilometres, so the ground had to move.
    expect(surfaceLive.rangeM).toBeGreaterThan(1500);
    expect(epochs).toBeGreaterThan(0);
    expect(surfaceLive.alt).toBeGreaterThan(0);
  });

  it('the sweep charts what it flies over — and never reads it', () => {
    grantAndLand(2);
    standAtShip();
    let t = 800;
    beginLift();
    t = runScript(t);
    // Park at a height the cone likes and let the sensor look.
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    const line = heightAt(p, tiers, 0, 0);
    surfaceLive.pos.set(0, line + 420, 0);
    surfaceLive.vel.set(0, 0, 0);
    for (let i = 0; i < 8; i++) stepSurface(1 / 60, (t += 1 / 60));
    expect(surfaceLive.sweepM).toBeGreaterThan(0);
    expect(surfaceLive.charted.size).toBeGreaterThan(0);
    // Charted is not scanned: the seam is a hunch until boots arrive.
    expect(surfaceLive.scanned.size).toBe(0);
    // And nothing airborne pays: the seal is not a suggestion.
    expect(useGame.getState().s.expedition.salvage).toBe(0);
    expect(surfaceLive.samples).toBe(0);
  });
});

describe('the ground the gear will accept', () => {
  beforeEach(() => {
    endGroundfall();
    endFlight();
    configureTierSpecsForTests({ texels: 96, extent: 4096 }, { texels: 96, extent: 65536 });
    useGame.setState({ s: newGame(4242, 0) });
    useUiBus.setState({ groundfall: null, flightMode: true });
  });

  it('refuses water, and diverts to the nearest shelf that will hold', () => {
    const st = useGame.getState().s;
    const shell = heroWorldShell(st.planet.size);
    beginFlightAt(new Vector3(0, shell + 0.2, 0), 0, 0);
    stepFlight(1 / 60, 0.02);
    flightInput.engage = true;
    stepFlight(1 / 60, 0.04);
    flightInput.engage = false;
    let t = 1;
    let guard = 0;
    while (!surfaceLive.ready && guard++ < 4000) stepSurface(1 / 60, (t += 1 / 60));
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    const opts = { normalY: 0.9, dryMarginM: 1.5, divertM: 400 };

    // Find genuinely wet ground inside the near tier, and ask to land on it.
    let wet: { x: number; z: number } | null = null;
    for (let r = 60; r <= 1800 && !wet; r += 60) {
      for (let a = 0; a < Math.PI * 2 && !wet; a += Math.PI / 12) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (heightAt(p, tiers, x, z) < p.seaLevelM - 4) wet = { x, z };
      }
    }
    if (wet) {
      expect(setdownRefusal(p, tiers, wet.x, wet.z, opts)).toBe(
        p.relief.liquid === 'lava' ? 'lava' : 'water',
      );
      const site = findSetdownSite(p, tiers, wet.x, wet.z, opts);
      expect(site.refused).not.toBeNull();
      if (site.ok) {
        // A divert is a real move to real ground, and it says why it moved.
        expect(site.divertM).toBeGreaterThan(0);
        expect(setdownRefusal(p, tiers, site.x, site.z, opts)).toBeNull();
        expect(SETDOWN_REFUSAL_TEXT[site.refused!]).toBeTruthy();
      }
    }

    // Ground the validator likes needs no divert at all.
    let dry: { x: number; z: number } | null = null;
    for (let r = 20; r <= 900 && !dry; r += 40) {
      for (let a = 0; a < Math.PI * 2 && !dry; a += Math.PI / 8) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (!setdownRefusal(p, tiers, x, z, opts)) dry = { x, z };
      }
    }
    expect(dry).not.toBeNull();
    const good = findSetdownSite(p, tiers, dry!.x, dry!.z, opts);
    expect(good.ok).toBe(true);
    expect(good.divertM).toBe(0);
    expect(good.refused).toBeNull();
  });

  it('a plaza is not a landing pad', () => {
    const st = useGame.getState().s;
    const shell = heroWorldShell(st.planet.size);
    beginFlightAt(new Vector3(0, shell + 0.2, 0), 0, 0);
    stepFlight(1 / 60, 0.02);
    flightInput.engage = true;
    stepFlight(1 / 60, 0.04);
    flightInput.engage = false;
    let t = 1;
    let guard = 0;
    while (!surfaceLive.ready && guard++ < 4000) stepSurface(1 / 60, (t += 1 / 60));
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    const blockedAt = { x: 40, z: 40 };
    const opts = {
      normalY: 0.72,
      dryMarginM: 1.5,
      divertM: 400,
      blocked: (x: number, z: number) => Math.hypot(x - blockedAt.x, z - blockedAt.z) < 70,
    };
    // Only meaningful where the ground itself would have said yes.
    if (!setdownRefusal(p, tiers, blockedAt.x, blockedAt.z, { ...opts, blocked: undefined })) {
      expect(setdownRefusal(p, tiers, blockedAt.x, blockedAt.z, opts)).toBe('occupied');
      const site = findSetdownSite(p, tiers, blockedAt.x, blockedAt.z, opts);
      if (site.ok) {
        expect(Math.hypot(site.x - blockedAt.x, site.z - blockedAt.z)).toBeGreaterThanOrEqual(70 - 1);
      }
    }
  });
});

describe('what an airborne stay can be asked for', () => {
  const ev = {
    lifetimeIndex: 3,
    surveyCredit: 0,
    haul: [],
    species: [],
    landmarks: [],
    civic: false,
    weathered: [],
    markKinds: [],
    repaired: false,
  };

  it('overflight counts charts; range counts metres', () => {
    expect(groundObjectiveMet({ kind: 'overflight', n: 14, brief: '', text: '' }, { ...ev, charted: 13 })).toBe(false);
    expect(groundObjectiveMet({ kind: 'overflight', n: 14, brief: '', text: '' }, { ...ev, charted: 14 })).toBe(true);
    expect(groundObjectiveMet({ kind: 'overflight', brief: '', text: '' }, { ...ev })).toBe(false);
    expect(
      groundObjectiveMet({ kind: 'range', n: REGION_CROSSING_M, brief: '', text: '' }, { ...ev, rangeM: REGION_CROSSING_M - 1 }),
    ).toBe(false);
    expect(
      groundObjectiveMet({ kind: 'range', n: REGION_CROSSING_M, brief: '', text: '' }, { ...ev, rangeM: REGION_CROSSING_M }),
    ).toBe(true);
  });

  it('air work is never asked of a ship that cannot fly', () => {
    const base = {
      type: 'terrestrial' as const,
      bottleneck: 'thermal' as const,
      quirks: [] as string[],
      hasInstallations: true,
      hasSettlements: true,
      certs: {} as Record<string, number>,
    };
    const grounded = petitionsFor({ ...base, atmoRank: 0 });
    expect(grounded.some((p) => p.id === 'ground-overflight')).toBe(false);
    expect(grounded.some((p) => p.id === 'ground-range')).toBe(false);
    const fitted = petitionsFor({ ...base, atmoRank: 1 });
    expect(fitted.some((p) => p.id === 'ground-overflight')).toBe(true);
    expect(fitted.some((p) => p.id === 'ground-range')).toBe(true);
  });

  it('the firsts pay once, ever — and only to a ship with the package', () => {
    const s = newGame(11, 0);
    const effects: never[] = [];
    // No package: the testimony is discarded rather than believed.
    bankGroundSamples(s, effects, 'w0', 'Nowhere', [], {}, [], {
      flew: true,
      setdowns: 2,
      charted: 30,
      rangeM: 40_000,
    });
    expect(s.expedition.certFirsts['mobility:airborne']).toBeUndefined();

    s.expedition.refits['atmo'] = 1;
    bankGroundSamples(s, effects, 'w0', 'Nowhere', [], {}, [], {
      flew: true,
      setdowns: 1,
      charted: 6,
      rangeM: 900,
    });
    expect(s.expedition.certFirsts['mobility:airborne']).toBeDefined();
    expect(s.expedition.certFirsts['mobility:setdown']).toBeDefined();
    expect(s.expedition.certFirsts['survey:overflight']).toBeDefined();
    const at = s.expedition.certFirsts['mobility:airborne'];

    s.gameTimeMs += 60_000;
    bankGroundSamples(s, effects, 'w0', 'Nowhere', [], {}, [], { flew: true, setdowns: 1, charted: 6 });
    expect(s.expedition.certFirsts['mobility:airborne']).toBe(at); // once, ever
  });
});
