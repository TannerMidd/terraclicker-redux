/**
 * The settlement roster — the one truth both scales read.
 *
 * Four promises with teeth:
 *  - the macro arithmetic here is terrainField's macro arithmetic (the
 *    transcription lock, the same standard the terrain holds orbit to);
 *  - every rostered spot stands where the ground would let it (the analytic
 *    water veto — no light may promise ground the sea owns);
 *  - the candidate stream is the orbit's original stream, so a spot that was
 *    dry before Phase 4 has not moved by so much as a roll;
 *  - standing truncates a stable prefix: lights go out and come back in the
 *    same places, and nobody's town is ever rebuilt somewhere else.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { buildSurfaceParams, macroNormAt } from '../src/ui/scene/surface/terrainField';
import { mulberry } from '../src/engine/rng';
import {
  clearSettlementRosterForTests,
  nearestSettlementSpot,
  settlementApproach,
  settlementMacroNorm,
  settlementName,
  settlementRoster,
  settlementShownCount,
  settlementSpecOf,
  type SettlementWorldSpec,
} from '../src/engine/settlements';
import type { PlanetType } from '../src/engine/types';

const ONES = { thermal: 1, atmo: 1, hydro: 1, bio: 1 };

function spec(seed: number, type: PlanetType = 'terrestrial', over: Partial<SettlementWorldSpec> = {}): SettlementWorldSpec {
  return { seed, type, size: 'large', lifetimeIndex: 12, hasLab: false, fjords: false, ...over };
}

describe('the transcription lock', () => {
  it('judges elevation with terrainField’s exact arithmetic', () => {
    const D = new Vector3();
    for (const [seed, type, fjords] of [
      [1101, 'terrestrial', false],
      [2202, 'ocean', false],
      [3303, 'desert', false],
      [4404, 'volcanic', false],
      [5505, 'ice', false],
      [6606, 'terrestrial', true],
    ] as const) {
      const p = buildSurfaceParams({
        seed,
        type,
        size: 'medium',
        dir: [0.2, 0.53, -0.82],
        aspects: ONES,
        fjords: fjords ? 1 : 0,
      });
      const r = mulberry(seed ^ 0x77aa);
      for (let i = 0; i < 24; i++) {
        const z = r() * 2 - 1;
        const a = r() * Math.PI * 2;
        const k = Math.sqrt(Math.max(0, 1 - z * z));
        D.set(Math.cos(a) * k, z, Math.sin(a) * k);
        const ours = settlementMacroNorm({ seed, type, fjords }, D.x, D.y, D.z);
        expect(Math.abs(ours - macroNormAt(p, D))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('the roster', () => {
  it('is deterministic, cold cache included', () => {
    const s = spec(90210);
    const a = settlementRoster(s);
    clearSettlementRosterForTests();
    const b = settlementRoster(s);
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
  });

  it('never stands in the sea, and calls the shore band a harbour', () => {
    for (const type of ['terrestrial', 'ocean', 'desert', 'volcanic', 'ice'] as const) {
      for (let seed = 7100; seed < 7106; seed++) {
        const s = spec(seed, type);
        for (const sp of settlementRoster(s)) {
          const norm = settlementMacroNorm(s, sp.dir[0], sp.dir[1], sp.dir[2]);
          expect(norm).toBeGreaterThanOrEqual(0.48 - 0.015);
          expect(sp.harbor).toBe(norm < 0.48 + 0.015);
        }
      }
    }
  });

  it('draws candidates from the orbit’s original stream, in order', () => {
    const s = spec(3141, 'terrestrial', { hasLab: true });
    const roster = settlementRoster(s);
    expect(roster.length).toBeGreaterThan(1);
    // Replay the pre-Phase-4 stream by hand and collect its dry subsequence.
    const r = mulberry((s.seed ^ 0x11f5) >>> 0);
    const dry: { dir: [number, number, number]; sizeRoll: number; cool: boolean }[] = [];
    for (let i = 0; i < 200 && dry.length < roster.length; i++) {
      const z = (r() * 2 - 1) * 0.86;
      const a = r() * Math.PI * 2;
      const k = Math.sqrt(Math.max(0, 1 - z * z));
      const dir: [number, number, number] = [Math.cos(a) * k, z, Math.sin(a) * k];
      const sizeRoll = r();
      const cool = r() < 0.22; // hasLab: the roll is consumed
      if (settlementMacroNorm(s, dir[0], dir[1], dir[2]) < 0.48 - 0.015) continue;
      dry.push({ dir, sizeRoll, cool });
    }
    roster.forEach((sp, i) => {
      expect(sp.index).toBe(i);
      expect(sp.dir[0]).toBeCloseTo(dry[i]!.dir[0], 12);
      expect(sp.dir[1]).toBeCloseTo(dry[i]!.dir[1], 12);
      expect(sp.dir[2]).toBeCloseTo(dry[i]!.dir[2], 12);
      expect(sp.sizeRoll).toBeCloseTo(dry[i]!.sizeRoll, 12);
      expect(sp.cool).toBe(dry[i]!.cool);
    });
  });

  it('keeps names out of the position stream', () => {
    const s = spec(555);
    const withNames = settlementRoster(s).map((sp) => sp.dir);
    expect(settlementName(s.seed, 0)).toBe(settlementName(s.seed, 0));
    expect(settlementName(s.seed, 0)).not.toBe(settlementName(s.seed, 1));
    clearSettlementRosterForTests();
    expect(settlementRoster(s).map((sp) => sp.dir)).toEqual(withNames);
  });
});

describe('standing and presentation', () => {
  it('truncates a stable prefix — lights out, never lights moved', () => {
    const s = spec(808);
    const roster = settlementRoster(s);
    const dim = settlementShownCount(roster.length, s, 1.25, 1, 0.35);
    const full = settlementShownCount(roster.length, s, 1.25, 1, 1);
    expect(dim).toBeGreaterThanOrEqual(1); // somebody is always still there
    expect(dim).toBeLessThanOrEqual(full);
    // The dim world's lit spots are literally the first `dim` of the full set.
    expect(roster.slice(0, dim)).toEqual(roster.slice(0, full).slice(0, dim));
  });

  it('sprawls engineered and stays modest austere', () => {
    const s = spec(909, 'terrestrial', { size: 'huge', lifetimeIndex: 40 });
    const roster = settlementRoster(s);
    const eng = settlementShownCount(roster.length, s, 1, 1.25, 1);
    const aus = settlementShownCount(roster.length, s, 1, 0.75, 1);
    expect(eng).toBeGreaterThanOrEqual(aus);
  });
});

describe('the divert’s question', () => {
  it('finds the nearest spot by angle', () => {
    const s = spec(112);
    const roster = settlementRoster(s);
    const target = roster[roster.length - 1]!;
    const hit = nearestSettlementSpot(roster, target.dir);
    expect(hit).not.toBeNull();
    expect(hit!.spot.index).toBe(target.index);
    expect(hit!.angleRad).toBeLessThan(1e-6);
  });

  it('lands the same doorstep from the same aim, and a dry one when it can', () => {
    const RADIUS = 320_000;
    for (let seed = 6200; seed < 6210; seed++) {
      const s = spec(seed);
      const roster = settlementRoster(s);
      if (roster.length === 0) continue;
      const spot = roster[0]!;
      const a = settlementApproach(s, spot.dir, RADIUS);
      expect(a).not.toBeNull();
      expect(a!.spot.index).toBe(0);
      const b = settlementApproach(s, spot.dir, RADIUS);
      expect(b!.pad).toEqual(a!.pad);
      // The pad is on the doorstep: within ~2 pad-reaches of the centre.
      const dot =
        a!.pad[0] * spot.dir[0] + a!.pad[1] * spot.dir[1] + a!.pad[2] * spot.dir[2];
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      expect(angle).toBeLessThanOrEqual((2 * 480) / RADIUS + 1e-9);
      // And dry unless the doorstep fell back to the plaza itself.
      const fellBack =
        a!.pad[0] === spot.dir[0] && a!.pad[1] === spot.dir[1] && a!.pad[2] === spot.dir[2];
      if (!fellBack) {
        expect(
          settlementMacroNorm(s, a!.pad[0], a!.pad[1], a!.pad[2]),
        ).toBeGreaterThan(0.48 + 0.015);
      }
    }
  });

  it('offers wilderness to a pilot who aimed at it', () => {
    const s = spec(6300);
    const roster = settlementRoster(s);
    expect(roster.length).toBeGreaterThan(0);
    // A direction far from every spot: walk a fibonacci probe until one is
    // outside the snap cone of the whole roster.
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 512; i++) {
      const y = 1 - (2 * (i + 0.5)) / 512;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const dir: [number, number, number] = [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r];
      const near = nearestSettlementSpot(roster, dir)!;
      if (near.angleRad > 0.2 + 0.02) {
        expect(settlementApproach(s, dir, 320_000)).toBeNull();
        return;
      }
    }
    throw new Error('no wilderness direction found — roster suspiciously dense');
  });

  it('reads a session’s civic facts through settlementSpecOf', () => {
    const s = settlementSpecOf({
      seed: 42,
      type: 'terrestrial',
      size: 'medium',
      lifetimeIndex: 3,
      installations: ['seedProbe', 'researchLab'],
      quirks: ['award-winning-fjords'],
    });
    expect(s.hasLab).toBe(true);
    expect(s.fjords).toBe(true);
  });
});
