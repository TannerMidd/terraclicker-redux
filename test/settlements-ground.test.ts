/**
 * Phase 4 on the ground: districts that are properties of the planet, an
 * ecology derived from planet facts, and a biologger that pays through the
 * same sealed ledger as every other ground income.
 *
 * The load-bearing promise: A SETTLEMENT IS THE SAME SETTLEMENT ON EVERY
 * VISIT. The terrain's local octaves are landing-seeded by design, so the
 * mechanism is not frame-free ground — it is the divert: the snap cone
 * dwarfs the sight radius, so every approach that could see a district
 * lands on that spot's one deterministic doorstep pad, and from that shared
 * frame the spot-seeded layout rebuilds bit-identically.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import {
  buildSurfaceParams,
  bakeTierRows,
  buildNormalMap,
  localDir,
  makeTier,
  smoothTier,
  type SurfaceParams,
  type SurfaceSpec,
  type SurfaceTiers,
} from '../src/ui/scene/surface/terrainField';
import {
  settlementApproach,
  settlementRoster,
  settlementSpecOf,
  type SettlementWorldSpec,
} from '../src/engine/settlements';
import {
  buildSettlementSeats,
  settlementDistricts,
  SETTLEMENT_SIGHT_M,
} from '../src/ui/scene/surface/surfaceSettlements';
import { vignetteSites } from '../src/ui/scene/surface/surfaceEcology';
import { SPECIES_BY_ID, speciesPresent } from '../src/content/groundSpecies';
import { bankGroundSamples, groundReturnValue } from '../src/engine/groundfall';
import { newGame } from '../src/engine/sim';
import { C } from '../src/content/constants';
import type { GroundfallSession } from '../src/ui/fx/uiBus';
import type { SimEffect } from '../src/engine/types';

const ONES = { thermal: 1, atmo: 1, hydro: 1, bio: 1 };
const RADIUS_MEDIUM = 320_000;

function bake(spec: SurfaceSpec): { p: SurfaceParams; tiers: SurfaceTiers } {
  const p = buildSurfaceParams(spec);
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

function sessionFor(
  seed: number,
  dir: [number, number, number],
  over: Partial<GroundfallSession> = {},
): GroundfallSession {
  return {
    worldKey: 'w7',
    name: 'Testworld',
    seed,
    type: 'terrestrial',
    size: 'medium',
    hero: false,
    aspects: ONES,
    dir,
    sunLocal: [0.3, 0.8, 0.2],
    starHex: 0xfff2dc,
    returnPos: [0, 0, 0],
    returnYaw: 0,
    returnPitch: 0,
    lifetimeIndex: 7,
    completed: true,
    gameTimeMs: 0,
    standing: 1,
    traits: [],
    installations: ['seedProbe', 'atmoProcessor', 'researchLab'],
    quirks: [],
    openRequests: [],
    certs: {},
    ...over,
  };
}

function worldSpec(seed: number): SettlementWorldSpec {
  return settlementSpecOf({
    seed,
    type: 'terrestrial',
    size: 'medium',
    lifetimeIndex: 7,
    installations: ['seedProbe', 'atmoProcessor', 'researchLab'],
    quirks: [],
  });
}

/** A seed whose roster is non-empty, plus its first spot's doorstep pad. */
function landableSpot(): { seed: number; pad: [number, number, number] } {
  for (let seed = 9100; seed < 9130; seed++) {
    const roster = settlementRoster(worldSpec(seed));
    if (roster.length === 0) continue;
    const app = settlementApproach(worldSpec(seed), roster[0]!.dir, RADIUS_MEDIUM);
    if (!app) continue;
    // Skip the shoal-fallback case: the invariance test wants a dry doorstep.
    const fell =
      app.pad[0] === roster[0]!.dir[0]
      && app.pad[1] === roster[0]!.dir[1]
      && app.pad[2] === roster[0]!.dir[2];
    if (!fell) return { seed, pad: app.pad };
  }
  throw new Error('no landable settlement in the seed range — suspicious');
}

/** Seat positions of one family, projected back to planet-space dirs. */
function familyDirs(
  p: SurfaceParams,
  seats: { elements: number[] }[],
): [number, number, number][] {
  const D = new Vector3();
  return seats.map((m) => {
    const x = m.elements[12]!;
    const z = m.elements[14]!;
    localDir(p, x, z, D);
    return [D.x, D.y, D.z] as [number, number, number];
  });
}

describe('districts are properties of the planet', () => {
  it('projects the landed spot into walking range, lit by standing', () => {
    const { seed, pad } = landableSpot();
    const { p, tiers } = bake({ seed, type: 'terrestrial', size: 'medium', dir: pad, aspects: ONES });
    const session = sessionFor(seed, pad);
    const districts = settlementDistricts(p, tiers, session);
    expect(districts.length).toBeGreaterThan(0);
    const d0 = districts.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b));
    // The doorstep pad stands within a couple of pad-reaches of the plaza.
    expect(Math.hypot(d0.x, d0.z)).toBeLessThan(1000);
    expect(d0.index).toBe(0);
    expect(d0.lit).toBe(true); // standing 1: the lights are on
    expect(d0.name.length).toBeGreaterThan(2);
  });

  it('walks the same streets on every visit, because the divert IS the frame', () => {
    // The local terrain octaves are landing-seeded on purpose ("two landings
    // a hemisphere apart are different countrysides"), so per-hab ground can
    // never be frame-free. What makes the settlement the same place anyway:
    // the snap cone (0.2 rad ≈ 64 km here) dwarfs the sight radius (6.5 km),
    // so ANY approach that could see a district is diverted to that spot's
    // one deterministic doorstep — same frame, same countryside, same doors.
    const { seed, pad } = landableSpot();
    const spec = worldSpec(seed);
    const spotDir = settlementRoster(spec)[0]!.dir;

    // Aim from two quite different directions inside the cone…
    const east = new Vector3(0, 1, 0).cross(new Vector3(...spotDir)).normalize();
    const north = new Vector3().crossVectors(new Vector3(...spotDir), east).normalize();
    const aimA = new Vector3(...spotDir).multiplyScalar(RADIUS_MEDIUM).addScaledVector(east, 40_000).normalize();
    const aimB = new Vector3(...spotDir).multiplyScalar(RADIUS_MEDIUM).addScaledVector(north, -35_000).normalize();
    const appA = settlementApproach(spec, [aimA.x, aimA.y, aimA.z], RADIUS_MEDIUM);
    const appB = settlementApproach(spec, [aimB.x, aimB.y, aimB.z], RADIUS_MEDIUM);
    // …and the autoland answers with the same pad, both times.
    expect(appA?.spot.index).toBe(0);
    expect(appB?.pad).toEqual(appA?.pad);
    expect(appA?.pad).toEqual(pad);

    // From that shared frame, the streets are bit-identical.
    const { p, tiers } = bake({ seed, type: 'terrestrial', size: 'medium', dir: pad, aspects: ONES });
    const session = sessionFor(seed, pad);
    const seats1 = buildSettlementSeats(p, tiers, settlementDistricts(p, tiers, session), session);
    const seats2 = buildSettlementSeats(p, tiers, settlementDistricts(p, tiers, session), session);
    expect(seats1.wall.length).toBeGreaterThan(3);
    expect(familyDirs(p, seats2.wall)).toEqual(familyDirs(p, seats1.wall));
    expect(seats2.works.length).toBe(seats1.works.length);
  });

  it('gives a hero commission no settlements and a dark world one lamp', () => {
    const { seed, pad } = landableSpot();
    const { p, tiers } = bake({ seed, type: 'terrestrial', size: 'medium', dir: pad, aspects: ONES });
    expect(settlementDistricts(p, tiers, sessionFor(seed, pad, { hero: true, completed: false }))).toHaveLength(0);

    // Standing 0: the town is dark, but somebody is always still there.
    const dark = sessionFor(seed, pad, { standing: 0 });
    const districts = settlementDistricts(p, tiers, dark);
    const nearest = districts.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b));
    // Index 0 stays lit (the shown-count floor of one); the rest go dark.
    expect(districts.filter((d) => d.lit).length).toBeLessThanOrEqual(1);
    const seats = buildSettlementSeats(p, tiers, [{ ...nearest, lit: false }], dark);
    expect(seats.windowWarm.length + seats.windowCool.length).toBe(1);
    expect(seats.beacons).toHaveLength(0);
  });

  it('dresses the record: facilities, petitions, and a neglected mast', () => {
    const { seed, pad } = landableSpot();
    const { p, tiers } = bake({ seed, type: 'terrestrial', size: 'medium', dir: pad, aspects: ONES });
    const plain = sessionFor(seed, pad, { installations: [] });
    const dressed = sessionFor(seed, pad, {
      openRequests: [{ uid: 1, id: 'pet', name: 'A Petition' }],
      traits: ['neglected', 'storied'],
    });
    const dPlain = settlementDistricts(p, tiers, plain);
    const sPlain = buildSettlementSeats(p, tiers, dPlain, plain);
    const sDressed = buildSettlementSeats(p, tiers, settlementDistricts(p, tiers, dressed), dressed);
    // Installations stand as works; an open petition adds scaffolding.
    expect(sDressed.scaffold.length).toBeGreaterThan(0);
    expect(sPlain.scaffold.length).toBe(0);
    const sFacilities = buildSettlementSeats(p, tiers, dPlain, sessionFor(seed, pad));
    expect(sFacilities.works.length).toBeGreaterThan(sPlain.works.length);
  });

  it('keeps every district inside sight range', () => {
    const { seed, pad } = landableSpot();
    const { p, tiers } = bake({ seed, type: 'terrestrial', size: 'medium', dir: pad, aspects: ONES });
    for (const d of settlementDistricts(p, tiers, sessionFor(seed, pad))) {
      expect(Math.hypot(d.x, d.z)).toBeLessThanOrEqual(SETTLEMENT_SIGHT_M);
    }
  });
});

describe('the ecology is planet fact', () => {
  it('derives presence from type and the Bio gauge', () => {
    expect(speciesPresent('terrestrial', 0)).toHaveLength(1); // verge lichen only
    const alive = speciesPresent('terrestrial', 1);
    expect(alive.length).toBeGreaterThan(4);
    expect(alive.some((s) => s.level === 'vignette')).toBe(true);
    for (const s of speciesPresent('volcanic', 1)) {
      expect(s.types).toContain('volcanic');
    }
  });

  it('grows the same vignettes under every sky, and none before life', () => {
    const spec: SurfaceSpec = {
      seed: 424242,
      type: 'terrestrial',
      size: 'medium',
      dir: [0.2, 0.53, -0.82],
      aspects: ONES,
    };
    const { p, tiers } = bake(spec);
    const a = vignetteSites(p, tiers, 1);
    const b = vignetteSites(p, tiers, 1);
    expect(b).toEqual(a);
    expect(vignetteSites(p, tiers, 0)).toHaveLength(0);
    for (const vg of a) {
      expect(SPECIES_BY_ID[vg.kind]?.level).toBe('vignette');
      expect(vg.id.startsWith('V')).toBe(true);
    }
  });
});

describe('the biologger pays through the seal', () => {
  it('pays once per species per world, records forever, honours the cap', () => {
    const state = newGame(1, 0);
    const effects: SimEffect[] = [];
    bankGroundSamples(state, effects, 'w7', 'Testworld', [], {}, ['meadow-drifter', 'sky-wisp']);
    const record = state.expedition.groundWorlds['w7']!;
    expect(record.species['meadow-drifter']).toBeDefined();
    expect(record.species['sky-wisp']).toBeDefined();
    const paid = effects.find((e) => e.t === 'groundReturn');
    expect(paid && paid.t === 'groundReturn' ? paid.newSpecies : []).toHaveLength(2);
    expect(state.expedition.salvage).toBe(2 * C.GROUND_SPECIES_BONUS);

    // Seen again: noted, not paid, not announced.
    const again: SimEffect[] = [];
    bankGroundSamples(state, again, 'w7', 'Testworld', [], {}, ['meadow-drifter']);
    expect(again.find((e) => e.t === 'groundReturn')).toBeUndefined();
    expect(state.expedition.salvage).toBe(2 * C.GROUND_SPECIES_BONUS);

    // The cap trims the payout but never the record.
    record.salvagePaid = C.GROUND_WORLD_YIELD_CAP;
    const capped: SimEffect[] = [];
    bankGroundSamples(state, capped, 'w7', 'Testworld', [], {}, ['dune-skink']);
    expect(record.species['dune-skink']).toBeDefined();
    const e = capped.find((x) => x.t === 'groundReturn');
    expect(e && e.t === 'groundReturn' ? e.capped : false).toBe(true);
    expect(state.expedition.salvage).toBe(2 * C.GROUND_SPECIES_BONUS);
  });

  it('values species in the pure return, for the HUD to promise honestly', () => {
    const state = newGame(1, 0);
    const v = groundReturnValue(state, 'w9', [], 0, ['cinder-wren']);
    expect(v.newSpecies).toEqual(['cinder-wren']);
    expect(v.salvage).toBe(C.GROUND_SPECIES_BONUS);
  });
});
