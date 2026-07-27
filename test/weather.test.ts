/**
 * Weather — spine §4 of EXPEDITIONS.md, held to its word.
 *
 * The promises under test: pure (same inputs, same sky, no streams
 * consumed), quantised into fronts that interpolate smoothly rather than
 * switching on, kinds gated by planet type and by the gauges (no air, no
 * rain), and decision knobs that change plans without draining anything.
 */
import { describe, expect, it } from 'vitest';
import {
  ATMO_WEATHER_MIN,
  DUST_REVEAL_MIN,
  stormFlash,
  tremorPulse,
  weatherAt,
  weatherFronts,
  weatherOutlook,
  WHITEOUT_CUT_MIN,
  type WeatherKind,
  type WeatherSpec,
} from '../src/engine/weather';
import type { PlanetType } from '../src/engine/types';

const FULL = { thermal: 1, atmo: 1, hydro: 1, bio: 1 };
const VACUUM = { thermal: 0.4, atmo: 0.05, hydro: 0.3, bio: 0 };

function spec(type: PlanetType, aspects = FULL, seed = 991177): WeatherSpec {
  return { seed, type, aspects };
}

/** Every kind a spec produces across a long stretch of sky-time. */
function kindsSeen(s: WeatherSpec, hours = 26): Set<WeatherKind> {
  const seen = new Set<WeatherKind>();
  for (let t = 0; t < hours * 3_600_000; t += 90_000) {
    for (const f of weatherFronts(s, t)) seen.add(f.kind);
  }
  return seen;
}

describe('weather is a pure function of (seed, type, dir, aspects, t)', () => {
  it('the same moment is the same sky, called twice or from either scene', () => {
    const s = spec('terrestrial');
    const t = 47_123_456;
    expect(weatherFronts(s, t)).toEqual(weatherFronts(s, t));
    const at = { ...s, dir: [0.2, 0.53, -0.82] as [number, number, number] };
    expect(weatherAt(at, t)).toEqual(weatherAt(at, t));
  });

  it('different seeds grow different skies', () => {
    const a = JSON.stringify(weatherFronts(spec('ocean', FULL, 1), 3_600_000));
    const b = JSON.stringify(weatherFronts(spec('ocean', FULL, 2), 3_600_000));
    expect(a).not.toBe(b);
  });

  it('fronts drift and breathe: no teleporting between adjacent moments', () => {
    const s = spec('ocean');
    for (let t = 0; t < 3_600_000; t += 120_000) {
      const now = weatherFronts(s, t);
      const next = weatherFronts(s, t + 1000);
      for (const f of now) {
        const twin = next.find((g) => g.slot === f.slot && g.kind === f.kind);
        if (!twin) continue; // the slot rolled over between samples
        const d = Math.hypot(
          twin.center[0] - f.center[0],
          twin.center[1] - f.center[1],
          twin.center[2] - f.center[2],
        );
        expect(d).toBeLessThan(0.002); // ≤ ~1.1 mrad/s of drift
        expect(Math.abs(twin.intensity - f.intensity)).toBeLessThan(0.02);
      }
    }
  });

  it('local weather interpolates: intensity never jumps a cliff', () => {
    const at = { ...spec('desert'), dir: [0.6, 0.4, -0.69] as [number, number, number] };
    let prev = weatherAt(at, 0).intensity;
    for (let t = 1000; t < 2 * 3_600_000; t += 1000) {
      const k = weatherAt(at, t).intensity;
      expect(Math.abs(k - prev)).toBeLessThan(0.045);
      prev = k;
    }
  });
});

describe('kinds are gated by type and gauges', () => {
  const allowed: Record<PlanetType, WeatherKind[]> = {
    terrestrial: ['rain', 'fog', 'storm'],
    ocean: ['rain', 'fog', 'storm'],
    desert: ['dust', 'storm', 'fog'],
    ice: ['whiteout', 'fog'],
    volcanic: ['ash', 'tremor', 'storm'],
    gasgiant: [],
  };

  for (const type of ['terrestrial', 'ocean', 'desert', 'ice', 'volcanic'] as const) {
    it(`${type} worlds with full gauges draw only their own kinds`, () => {
      const seen = kindsSeen(spec(type));
      expect(seen.size).toBeGreaterThan(1); // weather actually happens
      for (const k of seen) expect(allowed[type]).toContain(k);
    });
  }

  it('a gas giant declines to have local weather at all', () => {
    expect(kindsSeen(spec('gasgiant')).size).toBe(0);
  });

  it('thin atmosphere: no airborne weather, meteor showers instead', () => {
    expect(VACUUM.atmo).toBeLessThan(ATMO_WEATHER_MIN);
    for (const type of ['terrestrial', 'desert', 'ice', 'ocean'] as const) {
      const seen = kindsSeen(spec(type, VACUUM));
      for (const k of seen) expect(k).toBe('meteors');
    }
    // Volcanic tremors are geology, not weather — the vacuum keeps them.
    const volcanic = kindsSeen(spec('volcanic', VACUUM));
    for (const k of volcanic) expect(['tremor', 'meteors']).toContain(k);
    expect(volcanic.has('tremor')).toBe(true);
    expect(volcanic.has('ash')).toBe(false);
  });

  it('meteor showers fade out once the air can burn things up', () => {
    expect(kindsSeen(spec('terrestrial', { ...FULL, atmo: 0.9 })).has('meteors')).toBe(false);
  });
});

describe('the knobs change decisions', () => {
  /** Find a moment when `kind` stands at the dir at or above strength k. */
  function findMoment(
    at: WeatherSpec & { dir: [number, number, number] },
    kind: WeatherKind,
    minK: number,
  ): number {
    for (let t = 0; t < 80 * 3_600_000; t += 45_000) {
      const w = weatherAt(at, t);
      if (w.kind === kind && w.intensity >= minK) return t;
    }
    throw new Error(`no ${kind} ≥ ${minK} found in 80 h of sky`);
  }

  it('a hard dust front chokes the scanner and uncovers the buried seams', () => {
    const at = { ...spec('desert'), dir: [0.31, 0.6, -0.74] as [number, number, number] };
    const t = findMoment(at, 'dust', DUST_REVEAL_MIN);
    const w = weatherAt(at, t);
    expect(w.scanRangeMult).toBeLessThan(0.7);
    expect(w.buriedRevealed).toBe(true);
    expect(w.visibility).toBeLessThan(0.6);
  });

  it('a whiteout erases the marker rail', () => {
    const at = { ...spec('ice'), dir: [-0.5, 0.5, 0.71] as [number, number, number] };
    const t = findMoment(at, 'whiteout', WHITEOUT_CUT_MIN);
    const w = weatherAt(at, t);
    expect(w.markersCut).toBe(true);
    expect(w.visibility).toBeLessThan(0.6);
  });

  it('an electrical storm feeds the field pulse instead of choking it', () => {
    const at = { ...spec('ocean'), dir: [0.7, 0.1, 0.7] as [number, number, number] };
    const t = findMoment(at, 'storm', 0.5);
    expect(weatherAt(at, t).scanRangeMult).toBeGreaterThan(1.15);
  });

  it('hard tremors shake seams loose: one swing on the house', () => {
    const at = { ...spec('volcanic'), dir: [0.1, 0.9, 0.42] as [number, number, number] };
    const t = findMoment(at, 'tremor', 0.55);
    expect(weatherAt(at, t).hitsBonus).toBe(1);
  });

  it('nothing ever drains: there is no damage knob to misuse', () => {
    const w = weatherAt({ ...spec('desert'), dir: [0, 1, 0] }, 1234567);
    expect(Object.keys(w).sort()).toEqual(
      ['buriedRevealed', 'hitsBonus', 'intensity', 'kind', 'markersCut', 'scanRangeMult', 'visibility', 'wind'].sort(),
    );
  });
});

describe('the outlook is honest', () => {
  it('reports a change that brute force confirms', () => {
    const at = { ...spec('terrestrial'), dir: [0.2, 0.53, -0.82] as [number, number, number] };
    // Scan for a moment with an outlook, then verify the report.
    for (let t0 = 0; t0 < 6 * 3_600_000; t0 += 240_000) {
      const o = weatherOutlook(at, t0);
      if (!o) continue;
      const then = weatherAt(at, t0 + o.inMs);
      expect(then.kind).toBe(o.kind);
      return;
    }
    throw new Error('six hours of sky with no change at all');
  });
});

describe('deterministic texture', () => {
  it('lightning and tremors fire identically for every observer', () => {
    for (let t = 0; t < 600_000; t += 700) {
      expect(stormFlash(42, t, 0.8)).toBe(stormFlash(42, t, 0.8));
      expect(tremorPulse(42, t, 0.8)).toBe(tremorPulse(42, t, 0.8));
    }
  });

  it('a storm at strength actually flashes now and then', () => {
    let flashes = 0;
    for (let t = 0; t < 300_000; t += 100) {
      if (stormFlash(7, t, 0.9) > 0.4) flashes++;
    }
    expect(flashes).toBeGreaterThan(5);
  });

  it('calm skies stay dark and still', () => {
    for (let t = 0; t < 60_000; t += 500) {
      expect(stormFlash(7, t, 0)).toBe(0);
      expect(tremorPulse(7, t, 0)).toBe(0);
    }
  });
});
