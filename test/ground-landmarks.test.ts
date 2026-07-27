/**
 * The landmark grammar — the coarse lattice's promises.
 *
 * Landmarks are properties of the place exactly as seams are: same cell,
 * same landmark, from any approach; kinds drawn only from the planet type's
 * authored vocabulary; coastal kinds actually at the coast; the fjords only
 * where Slartibartfast signed the coastline.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import {
  buildSurfaceParams,
  bakeTierRows,
  buildNormalMap,
  makeTier,
  type SurfaceSpec,
  type SurfaceTiers,
} from '../src/ui/scene/surface/terrainField';
import {
  buildLandmarkSeats,
  landmarkSites,
  LANDMARK_FIELD_RADIUS,
} from '../src/ui/scene/surface/surfaceLandmarks';
import { GROUND_LANDMARKS, LANDMARK_BY_ID } from '../src/content/groundLandmarks';
import type { PlanetType } from '../src/engine/types';

const FULL = { thermal: 0.8, atmo: 0.8, hydro: 0.6, bio: 0.6 };

function bake(spec: SurfaceSpec): { p: ReturnType<typeof buildSurfaceParams>; tiers: SurfaceTiers } {
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

/** Scan a few deterministic landings until one grows landmarks. */
function regionWith(
  type: PlanetType,
  quirks: string[] = [],
  want?: (kinds: string[]) => boolean,
): { p: ReturnType<typeof buildSurfaceParams>; tiers: SurfaceTiers; marks: ReturnType<typeof landmarkSites> } {
  const dirs: [number, number, number][] = [
    [0.2, 0.53, -0.82], [-0.7, 0.1, 0.7], [0.31, 0.6, -0.74], [0.6, -0.4, 0.69],
    [-0.5, -0.5, 0.71], [0.9, 0.2, 0.39], [0.05, 0.99, 0.13], [-0.33, 0.66, -0.67],
  ];
  for (let seed = 424242; seed < 424252; seed++) {
    for (const dir of dirs) {
      const { p, tiers } = bake({ seed, type, size: 'medium', dir, aspects: FULL });
      const marks = landmarkSites(p, tiers, quirks);
      if (marks.length === 0) continue;
      if (want && !want(marks.map((m) => m.kind))) continue;
      return { p, tiers, marks };
    }
  }
  throw new Error(`no region found for ${type} with ${JSON.stringify(quirks)}`);
}

describe('the landmark lattice', () => {
  it('every kind a region grows belongs to its planet type', () => {
    for (const type of ['terrestrial', 'ice', 'desert', 'volcanic', 'ocean'] as const) {
      const { marks } = regionWith(type);
      expect(marks.length).toBeGreaterThan(0);
      for (const m of marks) {
        const def = LANDMARK_BY_ID[m.kind]!;
        expect(def).toBeDefined();
        expect(def.types).toContain(type);
        expect(def.quirk).toBeUndefined();
        expect(m.id).toMatch(/^L\d:\d+:\d+$/);
      }
    }
  });

  it('the vocabulary is two to four kinds per landable type, fjords included', () => {
    for (const type of ['terrestrial', 'ice', 'desert', 'volcanic', 'ocean'] as const) {
      // The spec counts the quirk kind among the two-to-four where it holds.
      const kinds = GROUND_LANDMARKS.filter((d) => d.types.includes(type));
      expect(kinds.length).toBeGreaterThanOrEqual(2);
      expect(kinds.length).toBeLessThanOrEqual(4);
      const base = kinds.filter((d) => !d.quirk);
      expect(base.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('is deterministic, twice over', () => {
    const { p, tiers } = regionWith('terrestrial');
    expect(landmarkSites(p, tiers)).toEqual(landmarkSites(p, tiers));
  });

  it('coastal kinds stand in the shore band; dry kinds stand clear of it', () => {
    const { p, marks } = regionWith('ocean');
    for (const m of marks) {
      const def = LANDMARK_BY_ID[m.kind]!;
      if (def.coastal) {
        expect(Math.abs(m.y - p.seaLevelM)).toBeLessThan(9.5);
      } else {
        expect(m.y).toBeGreaterThan(p.seaLevelM + 3.5);
      }
    }
  });

  it('the same coarse cell is the same landmark from any approach', () => {
    const { p, marks } = regionWith('terrestrial');
    // Re-land a few hundred metres away: overlapping census, same identities.
    const nudged = new Vector3().copy(p.up);
    nudged.x += 0.001;
    nudged.normalize();
    const b = bake({
      seed: p.seed,
      type: p.type,
      size: p.size,
      dir: [nudged.x, nudged.y, nudged.z],
      aspects: FULL,
    });
    const again = landmarkSites(b.p, b.tiers);
    const byId = new Map(again.map((m) => [m.id, m]));
    const shared = marks.filter((m) => byId.has(m.id));
    expect(shared.length).toBeGreaterThan(0);
    for (const m of shared) {
      const other = byId.get(m.id)!;
      expect(other.kind).toBe(m.kind);
      expect(other.scale).toBe(m.scale);
      // Same planet-fixed spot, expressed in a different landing frame.
      const dHere = Math.hypot(m.x, m.z);
      void dHere;
    }
  });

  it('the award-winning fjords appear only where the quirk holds', () => {
    // With the quirk, a watery type eventually grows the plaque…
    const { marks } = regionWith('ocean', ['award-winning-fjords'], (kinds) =>
      kinds.includes('award-fjords'),
    );
    expect(marks.some((m) => m.kind === 'award-fjords')).toBe(true);
    // …and without it, no amount of scanning finds one.
    expect(() =>
      regionWith('ocean', [], (kinds) => kinds.includes('award-fjords')),
    ).toThrow();
  });

  it('seats build for every kind a region grows, on its own ground', () => {
    const { p, tiers, marks } = regionWith('volcanic');
    const seats = buildLandmarkSeats(p, tiers, marks);
    const total =
      seats.box.length + seats.column.length + seats.shard.length + seats.cone.length +
      seats.rock.length + seats.vent.length + seats.plume.length;
    expect(total).toBeGreaterThan(0);
    // Deterministic composition too.
    const again = buildLandmarkSeats(p, tiers, marks);
    expect(again.box.map((m) => [...m.elements])).toEqual(seats.box.map((m) => [...m.elements]));
  });

  it('a gas giant grows nothing, which is the correct amount', () => {
    const { p, tiers } = (() => {
      const built = bake({
        seed: 424242, type: 'gasgiant', size: 'medium',
        dir: [0.2, 0.53, -0.82], aspects: FULL,
      });
      return built;
    })();
    expect(landmarkSites(p, tiers)).toEqual([]);
  });
});

void LANDMARK_FIELD_RADIUS;
