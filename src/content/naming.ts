import type { RngState } from '../engine/rng';
import { pick, rand } from '../engine/rng';

const PREFIXES = [
  'Terra', 'Gaia', 'Nova', 'Eden', 'Aurora', 'Vesper', 'Halcyon', 'Meridian',
  'Cascade', 'Umbra', 'Solace', 'Lumina', 'Verdant', 'Cinder', 'Pelagia', 'Boreas',
] as const;

const SUFFIXES = [
  'Prime', 'Minor', 'Major', 'Secundus', 'Tertius', 'Ultima', 'Reach', 'Landing',
  'Promise', 'Folly', 'Bequest', 'Prospect',
] as const;

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'] as const;

/**
 * Deterministic planet names from the planets stream.
 * Planet 1 of every run is Terra Prima; lifetime #42 is Earth (handled by caller).
 */
export function generatePlanetName(rng: RngState): string {
  const prefix = pick(rng, 'planets', PREFIXES);
  const style = rand(rng, 'planets');
  if (style < 0.45) return `${prefix} ${pick(rng, 'planets', ROMANS)}`;
  if (style < 0.85) return `${prefix} ${pick(rng, 'planets', SUFFIXES)}`;
  return `New ${prefix}`;
}

export const FIRST_PLANET_NAME = 'Terra Prima';
export const EARTH_NAME = 'Earth';
