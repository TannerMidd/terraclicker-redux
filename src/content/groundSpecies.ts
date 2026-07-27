/**
 * The living catalogue — what a world can be alive WITH.
 *
 * Ecology arrives in three levels, per the Phase 4 spec: AMBIENT life is
 * instanced background biology (drifting grazers, flocks, shoals — the
 * ground plainly inhabited); VIGNETTES are authored set-pieces on a coarse
 * lattice (a nesting colony, a herd circling a spring — worth walking to);
 * CIVIC life lives where people do, and is catalogued by standing in a lit
 * settlement long enough to notice it.
 *
 * Presence is derived from planet facts only — type, the Bio gauge, the
 * shoreline — never from the landing frame, exactly as sample identity is.
 * A hero commission grows life as it grows Biotic, which is the entire
 * point of the gauge; a delivered world hums with all of it.
 *
 * Cataloguing pays a one-time bonus per species per world, through the same
 * seal every other ground income honours: salvage, on boarding, capped by
 * the world's lifetime yield. The Guide notes that most field biology is
 * standing quietly near something until it stops pretending you left.
 */
import type { PlanetType } from '../engine/types';

export type SpeciesLevel = 'ambient' | 'vignette' | 'civic';

export interface GroundSpeciesDef {
  id: string;
  name: string;
  level: SpeciesLevel;
  types: readonly PlanetType[];
  /** Minimum Bio gauge fraction for the species to exist. */
  minBio: number;
  /** Lives at the waterline (vignette placement probes the shore band). */
  shore?: boolean;
  /** Which voice it uses when the biologger first notices it. */
  register: 'chirp' | 'call' | 'drone';
  /** Weight on the vignette lattice's kind roll. */
  weight: number;
  /** The Guide's one line, for the catalogue toast. */
  blurb: string;
}

export const GROUND_SPECIES: readonly GroundSpeciesDef[] = [
  // ————— Ambient: the background biology —————
  {
    id: 'meadow-drifter',
    name: 'meadow drifter',
    level: 'ambient',
    types: ['terrestrial'],
    minBio: 0.3,
    register: 'call',
    weight: 0,
    blurb: 'A herbivore of no fixed ambition. Grazes in slow ellipses; has never been observed to hurry, or to need to.',
  },
  {
    id: 'sky-wisp',
    name: 'sky wisp',
    level: 'ambient',
    types: ['terrestrial', 'ocean'],
    minBio: 0.45,
    register: 'chirp',
    weight: 0,
    blurb: 'Flocks that navigate by consensus, which is why they keep almost landing.',
  },
  {
    id: 'glass-shoal',
    name: 'glass shoal',
    level: 'ambient',
    types: ['ocean', 'terrestrial'],
    minBio: 0.35,
    shore: true,
    register: 'chirp',
    weight: 0,
    blurb: 'Transparent, synchronized, and visible only when it disagrees with itself.',
  },
  {
    id: 'dune-skink',
    name: 'dune skink',
    level: 'ambient',
    types: ['desert'],
    minBio: 0.2,
    register: 'chirp',
    weight: 0,
    blurb: 'Runs on sand it cannot afford to stand still on. A lesson in economics.',
  },
  {
    id: 'tumbleweave',
    name: 'tumbleweave',
    level: 'ambient',
    types: ['desert'],
    minBio: 0.08,
    register: 'drone',
    weight: 0,
    blurb: 'An ambulatory plant. Botanists insist it is not going anywhere; it keeps going there anyway.',
  },
  {
    id: 'firn-burrower',
    name: 'firn burrower',
    level: 'ambient',
    types: ['ice'],
    minBio: 0.25,
    register: 'call',
    weight: 0,
    blurb: 'Known chiefly by its breathing holes and its opinion of visitors, which is the same hole, closing.',
  },
  {
    id: 'aurora-moth',
    name: 'aurora moth',
    level: 'ambient',
    types: ['ice'],
    minBio: 0.4,
    register: 'chirp',
    weight: 0,
    blurb: 'Navigates by magnetosphere. Occasionally navigates by you, which it regrets.',
  },
  {
    id: 'cinder-wren',
    name: 'cinder wren',
    level: 'ambient',
    types: ['volcanic'],
    minBio: 0.3,
    register: 'chirp',
    weight: 0,
    blurb: 'Nests downwind of fumaroles. Sings anyway. The Guide finds this instructive.',
  },
  {
    id: 'vent-lace',
    name: 'vent lace',
    level: 'ambient',
    types: ['volcanic'],
    minBio: 0.12,
    register: 'drone',
    weight: 0,
    blurb: 'A colony organism that eats heat gradients and produces, as far as anyone can tell, patience.',
  },

  // ————— Vignettes: worth walking to —————
  {
    id: 'grazer-ring',
    name: 'grazer ring',
    level: 'vignette',
    types: ['terrestrial'],
    minBio: 0.4,
    register: 'call',
    weight: 3,
    blurb: 'A herd that circles its spring by ancient habit. The spring moved a century ago. The circle has not.',
  },
  {
    id: 'nesting-colony',
    name: 'nesting colony',
    level: 'vignette',
    types: ['terrestrial', 'ocean'],
    minBio: 0.35,
    shore: true,
    register: 'chirp',
    weight: 3,
    blurb: 'Ten thousand seabirds, one opinion, expressed continuously.',
  },
  {
    id: 'spore-bloom',
    name: 'spore bloom',
    level: 'vignette',
    types: ['terrestrial', 'desert'],
    minBio: 0.5,
    register: 'drone',
    weight: 2,
    blurb: 'Once a season, the ground exhales. Downwind, other ground inhales. This is either reproduction or conversation.',
  },
  {
    id: 'tide-chorus',
    name: 'tide chorus',
    level: 'vignette',
    types: ['ocean'],
    minBio: 0.3,
    shore: true,
    register: 'call',
    weight: 3,
    blurb: 'Filter-feeders that sing the water in. The tide was coming anyway; they take the credit.',
  },
  {
    id: 'brine-garden',
    name: 'brine garden',
    level: 'vignette',
    types: ['ice'],
    minBio: 0.35,
    shore: true,
    register: 'drone',
    weight: 3,
    blurb: 'Under-ice flora at the one temperature it approves of. Blooms in colours ice has no business knowing.',
  },
  {
    id: 'ember-swarm',
    name: 'ember swarm',
    level: 'vignette',
    types: ['volcanic'],
    minBio: 0.45,
    register: 'chirp',
    weight: 3,
    blurb: 'Bioluminescent midges that mistake cooling lava for romance. Frequently correct.',
  },

  // ————— Civic: where the people are —————
  {
    id: 'settlement-swift',
    name: 'settlement swift',
    level: 'civic',
    types: ['terrestrial', 'ocean', 'desert', 'ice', 'volcanic'],
    minBio: 0.2,
    register: 'chirp',
    weight: 0,
    blurb: 'Nests in comms masts, commutes with the drones, and files no flight plans.',
  },
  {
    id: 'verge-lichen',
    name: 'verge lichen',
    level: 'civic',
    types: ['terrestrial', 'ocean', 'desert', 'ice', 'volcanic'],
    minBio: 0,
    register: 'drone',
    weight: 0,
    blurb: 'Municipal lichen, tended by nobody, thriving on exactly the attention it gets.',
  },
] as const;

export const SPECIES_BY_ID: Record<string, GroundSpeciesDef> = Object.fromEntries(
  GROUND_SPECIES.map((s) => [s.id, s]),
);

/**
 * Every species this world supports at these gauges, by level. Pure planet
 * facts in, stable list out — the same species from any approach.
 */
export function speciesPresent(
  type: PlanetType,
  bio: number,
  level?: SpeciesLevel,
): GroundSpeciesDef[] {
  return GROUND_SPECIES.filter(
    (s) => s.types.includes(type) && bio >= s.minBio && (!level || s.level === level),
  );
}
