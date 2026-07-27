/**
 * The ground's memory, tested at its two ends: the pure engine ledger
 * (engine/groundSites.ts) and the sample identity derivation
 * (content/groundSamples.ts). The lattice itself is tested where the terrain
 * is, in groundfall.test.ts — it needs baked tiers to reject against.
 */
import { describe, expect, it } from 'vitest';
import {
  createGroundWorldRecord,
  groundYield,
  recordSiteOutcome,
  siteMinable,
  surveyCredit,
} from '../src/engine/groundSites';
import {
  GROUND_SAMPLES,
  SAMPLE_BY_ID,
  sampleKindAt,
  type SampleFacts,
} from '../src/content/groundSamples';
import { C } from '../src/content/constants';
import type { PlanetType, SampleHaul } from '../src/engine/types';

const LANDABLE: readonly PlanetType[] = ['terrestrial', 'ice', 'desert', 'volcanic', 'ocean'];

describe('site outcomes', () => {
  it('escalate and never retreat; worked is terminal', () => {
    const rec = createGroundWorldRecord();
    recordSiteOutcome(rec, 'g0:1:1', 'visited', 100);
    expect(rec.sites['g0:1:1']).toMatchObject({ s: 'visited' });
    recordSiteOutcome(rec, 'g0:1:1', 'preserved', 200);
    expect(rec.sites['g0:1:1']).toMatchObject({ s: 'preserved' });
    recordSiteOutcome(rec, 'g0:1:1', 'worked', 300);
    expect(rec.sites['g0:1:1']).toMatchObject({ s: 'worked', atMs: 300 });
    // No amount of later politeness un-works a seam.
    recordSiteOutcome(rec, 'g0:1:1', 'preserved', 400);
    recordSiteOutcome(rec, 'g0:1:1', 'visited', 500);
    expect(rec.sites['g0:1:1']).toMatchObject({ s: 'worked', atMs: 300 });
  });

  it('decide what the pick may still touch', () => {
    expect(siteMinable(undefined)).toBe(true);
    expect(siteMinable({ s: 'visited', atMs: 1 })).toBe(true);
    expect(siteMinable({ s: 'preserved', atMs: 1 })).toBe(true);
    expect(siteMinable({ s: 'prospected', atMs: 1 })).toBe(false);
    expect(siteMinable({ s: 'worked', atMs: 1 })).toBe(false);
  });
});

describe('survey credit', () => {
  it('counts ordinary samples once, cores twice, preserves once', () => {
    const haul: SampleHaul[] = [
      { kind: 'field-crystal', n: 2, method: 'quick' },
      { kind: 'glacier-core', n: 1, method: 'core' },
      { kind: 'ridge-quartz', n: 1, method: 'prospect' },
    ];
    expect(surveyCredit(haul, 2)).toBe(2 + 2 + 1 + 2);
    expect(surveyCredit([], 0)).toBe(0);
  });
});

describe('ground yield', () => {
  it('pays per kind, bonuses new kinds, and respects the world cap', () => {
    const rec = createGroundWorldRecord();
    rec.samples['field-crystal'] = 50; // already catalogued here
    const haul: SampleHaul[] = [
      { kind: 'field-crystal', n: 2, method: 'quick' },
      { kind: 'tidal-glass', n: 3, method: 'quick' },
    ];
    const y = groundYield(rec, haul, 0);
    expect(y.newKinds).toEqual(['tidal-glass']);
    expect(y.rawSalvage).toBe(
      2 * SAMPLE_BY_ID['field-crystal']!.salvage +
        3 * SAMPLE_BY_ID['tidal-glass']!.salvage +
        C.GROUND_CATALOGUE_BONUS,
    );
    expect(y.capped).toBe(false);

    // A nearly paid-out world trims the payout and flags it.
    rec.salvagePaid = C.GROUND_WORLD_YIELD_CAP - 4;
    const capped = groundYield(rec, haul, 0);
    expect(capped.salvage).toBe(4);
    expect(capped.capped).toBe(true);

    // An unknown kind still pays the fallback rate rather than nothing.
    const odd = groundYield(undefined, [{ kind: 'no-such-kind', n: 1, method: 'quick' }], 0);
    expect(odd.rawSalvage).toBe(C.GROUND_SAMPLE_SALVAGE + C.GROUND_CATALOGUE_BONUS);
  });
});

describe('sample identity', () => {
  it('is total and deterministic across every landable world and corner', () => {
    for (const type of LANDABLE) {
      for (const thermal of [0, 1]) {
        for (const atmo of [0, 1]) {
          for (const hydro of [0, 1]) {
            for (const bio of [0, 1]) {
              for (const aboveSeaM of [4, 120, 400]) {
                for (const latitude of [0.1, 0.85]) {
                  const facts: SampleFacts = {
                    type,
                    aspects: { thermal, atmo, hydro, bio },
                    aboveSeaM,
                    latitude,
                    quirks: [],
                    roll: 0.5,
                  };
                  const def = sampleKindAt(facts);
                  expect(def).toBeDefined();
                  expect(SAMPLE_BY_ID[def.id]).toBe(def);
                  expect(sampleKindAt(facts).id).toBe(def.id);
                }
              }
            }
          }
        }
      }
    }
  });

  it('reads the planet: type, gauges, elevation and quirks all matter', () => {
    const base: SampleFacts = {
      type: 'ice',
      aspects: { thermal: 0.5, atmo: 0.8, hydro: 0.5, bio: 0.2 },
      aboveSeaM: 10,
      latitude: 0.3,
      quirks: [],
      roll: 0.5,
    };
    // Ice near the waterline is brine; high ground on the same world is not.
    expect(sampleKindAt(base).id).toBe('cryogenic-brine');
    expect(sampleKindAt({ ...base, aboveSeaM: 300 }).id).not.toBe('cryogenic-brine');
    // Thin air at altitude fossilises.
    expect(
      sampleKindAt({
        ...base,
        type: 'terrestrial',
        aspects: { ...base.aspects, atmo: 0.2 },
        aboveSeaM: 300,
      }).id,
    ).toBe('fossil-atmosphere');
    // The improbability nexus pays only where the quirk holds AND the roll
    // cooperates — rarity is part of the identity.
    const nexus = { ...base, quirks: ['improbability-nexus'], roll: 0.1 };
    expect(sampleKindAt(nexus).id).toBe('improbability-crystal');
    expect(sampleKindAt({ ...nexus, roll: 0.9 }).id).not.toBe('improbability-crystal');
    expect(sampleKindAt({ ...nexus, quirks: [] }).id).not.toBe('improbability-crystal');
  });

  it('keeps salvage on the 1–5 band around the fallback mean', () => {
    for (const def of GROUND_SAMPLES) {
      expect(def.salvage).toBeGreaterThanOrEqual(1);
      expect(def.salvage).toBeLessThanOrEqual(5);
    }
  });
});
