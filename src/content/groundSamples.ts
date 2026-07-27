/**
 * What a core sample actually is, once somebody bothers to look at it.
 *
 * v22 groundfall paid a flat rate for anonymous crystal; a sample is now a
 * named thing derived from the planet that produced it. The derivation is a
 * pure function of planet facts — type, gauges, elevation, latitude, quirks,
 * and one deterministic roll drawn from the site's own hash — so the same
 * seam on the same world always yields the same substance (engine law #1).
 *
 * Selection is first-match over an ordered list: the specific outranks the
 * general, and the final entry matches anything, which is what keeps the
 * function total across every landable world the catalogue can produce.
 *
 * Salvage values sit on a 1–5 band balanced around C.GROUND_SAMPLE_SALVAGE.
 * Rarity pays; so does standing somewhere unpleasant.
 */
import type { PlanetType } from '../engine/types';

/** The planet facts a sample identity is derived from. */
export interface SampleFacts {
  type: PlanetType;
  /** Gauge fractions 0–1 at landing (a delivered world is all ones). */
  aspects: { thermal: number; atmo: number; hydro: number; bio: number };
  /** Site elevation above the local liquid line, metres. */
  aboveSeaM: number;
  /** |landing latitude| 0–1 — the frost convention the renderer uses. */
  latitude: number;
  quirks: readonly string[];
  /** Deterministic 0–1 stream from the site hash; gates the rare kinds. */
  roll: number;
}

export interface GroundSampleDef {
  id: string;
  name: string;
  /** The Guide, on the subject of this substance. */
  guide: string;
  /** Salvage per sample of this kind. */
  salvage: number;
  /** Whether this world, at this spot, can produce it at all. */
  where: (f: SampleFacts) => boolean;
}

/**
 * Ordered most-specific first; `sampleKindAt` takes the first match. The
 * last entry accepts anything, so selection is total by construction.
 */
export const GROUND_SAMPLES: readonly GroundSampleDef[] = [
  {
    id: 'improbability-crystal',
    name: 'Improbability Crystal',
    guide:
      'A mineral that has decided, against considerable odds, to exist. Handle with statistics.',
    salvage: 5,
    where: (f) => f.quirks.includes('improbability-nexus') && f.roll < 0.2,
  },
  {
    id: 'fossil-atmosphere',
    name: 'Fossilised Atmosphere',
    guide:
      'Air that gave up waiting for the terraforming and settled into rock. Technically still breathable, once.',
    salvage: 4,
    where: (f) => f.aspects.atmo < 0.45 && f.aboveSeaM > 220,
  },
  {
    id: 'living-basalt',
    name: 'Living Basalt',
    guide:
      'Volcanic stone with a microbial tenancy agreement. The stone provides heat; nobody has established what the microbes provide.',
    salvage: 4,
    where: (f) => f.type === 'volcanic' && f.aspects.bio > 0.45,
  },
  {
    id: 'cryogenic-brine',
    name: 'Cryogenic Brine',
    guide:
      'Water that refuses to freeze out of what appears to be spite. Keeps almost anything fresh, including grudges.',
    salvage: 3,
    where: (f) => f.type === 'ice' && f.aboveSeaM < 40,
  },
  {
    id: 'tidal-glass',
    name: 'Tidal Glass',
    guide:
      'Shoreline silica polished by a sea with nothing else to do. Widely used in instruments and apologies.',
    salvage: 3,
    where: (f) => f.type === 'ocean' && f.aboveSeaM < 25,
  },
  {
    id: 'vent-sulphur',
    name: 'Vent Sulphur',
    guide:
      'Collected at source, the source being a hole that shouts. The smell is included at no extra charge.',
    salvage: 2,
    where: (f) => f.type === 'volcanic',
  },
  {
    id: 'ferrous-drift',
    name: 'Ferrous Drift',
    guide:
      'Iron-rich dune sand, endlessly rearranged by wind with strong opinions and no plan.',
    salvage: 2,
    where: (f) => f.type === 'desert',
  },
  {
    id: 'polar-firn',
    name: 'Polar Firn',
    guide:
      'Several centuries of weather, compressed into something you can stand on and, evidently, sell.',
    salvage: 2,
    where: (f) => f.latitude > 0.72,
  },
  {
    id: 'glacier-core',
    name: 'Glacier Core',
    guide:
      'Old ice with older air trapped inside it. The bubbles are the interesting part; the rest is packaging.',
    salvage: 2,
    where: (f) => f.type === 'ice',
  },
  {
    id: 'reef-chalk',
    name: 'Reef Chalk',
    guide:
      'The accumulated administrative record of several billion small lives. Surprisingly load-bearing.',
    salvage: 2,
    where: (f) => f.type === 'ocean',
  },
  {
    id: 'biotite-loam',
    name: 'Biotite Loam',
    guide:
      'Soil that has clearly been up to something. Rich, dark, and faintly smug about the vegetation.',
    salvage: 2,
    where: (f) => f.aspects.bio > 0.6,
  },
  {
    id: 'ridge-quartz',
    name: 'Ridge Quartz',
    guide:
      'Grown slowly at altitude, where the pressure is low and the views are wasted on minerals.',
    salvage: 2,
    where: (f) => f.aboveSeaM > 350,
  },
  {
    id: 'field-crystal',
    name: 'Field Crystal',
    guide:
      'The standard-issue core sample: crystalline, cooperative, and of interest to almost nobody, which is why it pays what it pays.',
    salvage: 2,
    where: () => true,
  },
];

export const SAMPLE_BY_ID: Record<string, GroundSampleDef> = Object.fromEntries(
  GROUND_SAMPLES.map((s) => [s.id, s]),
);

/** The sample kind this spot yields. Total: the catch-all always matches. */
export function sampleKindAt(f: SampleFacts): GroundSampleDef {
  for (const def of GROUND_SAMPLES) {
    if (def.where(f)) return def;
  }
  return GROUND_SAMPLES[GROUND_SAMPLES.length - 1]!;
}
