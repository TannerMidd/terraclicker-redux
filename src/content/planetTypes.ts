import type { AspectId, PlanetType } from '../engine/types';

export interface PlanetTypeDef {
  id: PlanetType;
  label: string;
  weight: number;
  /** Multiplier on gauge TARGETS (bigger = harder wall). */
  targetBias: Record<AspectId, number>;
  /** Multiplier on aspect PRODUCTION while on this planet. */
  prodBias: Record<AspectId, number>;
  guide: string;
}

export const PLANET_TYPES: readonly PlanetTypeDef[] = [
  {
    id: 'terrestrial',
    label: 'Terrestrial',
    weight: 24,
    targetBias: { thermal: 1.0, atmo: 1.0, hydro: 1.0, bio: 1.0 },
    prodBias: { thermal: 1.0, atmo: 1.0, hydro: 1.0, bio: 1.0 },
    guide: 'A balanced world. The Guide rates these "a good first planet", with the caveat that so was Earth.',
  },
  {
    id: 'ice',
    label: 'Ice World',
    weight: 18,
    targetBias: { thermal: 2.5, atmo: 1.0, hydro: 0.6, bio: 1.2 },
    prodBias: { thermal: 1.0, atmo: 1.0, hydro: 1.3, bio: 1.0 },
    guide: 'Melt it first. The water is pre-installed, which the brochure describes as "a feature".',
  },
  {
    id: 'desert',
    label: 'Desert World',
    weight: 18,
    targetBias: { thermal: 0.7, atmo: 1.2, hydro: 2.2, bio: 1.3 },
    prodBias: { thermal: 1.2, atmo: 1.0, hydro: 1.0, bio: 1.0 },
    guide: 'Water is everything here, mostly because there is none of it. Bring a towel.',
  },
  {
    id: 'volcanic',
    label: 'Volcanic World',
    weight: 14,
    targetBias: { thermal: 0.4, atmo: 1.8, hydro: 1.6, bio: 1.4 },
    prodBias: { thermal: 1.5, atmo: 1.0, hydro: 1.0, bio: 1.0 },
    guide: 'Already warm, in the way that a burning building is already lit. Needs air and rain, urgently.',
  },
  {
    id: 'ocean',
    label: 'Ocean World',
    weight: 14,
    targetBias: { thermal: 0.8, atmo: 1.0, hydro: 0.3, bio: 2.0 },
    prodBias: { thermal: 1.0, atmo: 1.0, hydro: 1.0, bio: 1.2 },
    guide: 'Seed the seas. Local wildlife is expected to evolve, grow legs, and complain about it.',
  },
  {
    id: 'gasgiant',
    label: 'Gas Giant (moons)',
    weight: 12,
    targetBias: { thermal: 1.2, atmo: 2.0, hydro: 1.0, bio: 1.5 },
    prodBias: { thermal: 1.0, atmo: 1.2, hydro: 1.0, bio: 1.0 },
    guide: 'You terraform its moons; the giant itself declined to comment. The atmospheric paperwork is immense.',
  },
];

export const PLANET_TYPE_BY_ID: Record<string, PlanetTypeDef> = Object.fromEntries(
  PLANET_TYPES.map((t) => [t.id, t]),
);
