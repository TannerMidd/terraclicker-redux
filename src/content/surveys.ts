import type { AspectId } from '../engine/types';

export interface SurveyDef {
  id: string;
  name: string;
  text: string;
  prodMult?: Partial<Record<AspectId, number>>;
  allProdMult?: number;
  eventFreq?: number;
  noVogons?: boolean;
  /** Start the planet with this fraction of every gauge pre-filled. */
  headStart?: number;
}

/** Orbital Survey: pick 1 of 3 on arrival (from planet #4 of a run). */
export const SURVEYS: readonly SurveyDef[] = [
  {
    id: 'geothermal-seams',
    name: 'Rich Geothermal Seams',
    text: 'Thermal production +25% on this planet.',
    prodMult: { thermal: 1.25 },
  },
  {
    id: 'dense-aquifers',
    name: 'Dense Aquifers',
    text: 'Hydrologic production +25% on this planet.',
    prodMult: { hydro: 1.25 },
  },
  {
    id: 'calm-skies',
    name: 'Calm Skies',
    text: 'Atmospheric production +25% on this planet.',
    prodMult: { atmo: 1.25 },
  },
  {
    id: 'fertile-regolith',
    name: 'Fertile Regolith',
    text: 'Biotic production +25% on this planet.',
    prodMult: { bio: 1.25 },
  },
  {
    id: 'improbability-shadow',
    name: 'Improbability Shadow',
    text: 'Events 20% more frequent while here. Odd, but profitable.',
    eventFreq: 1.2,
  },
  {
    id: 'paperwork-lost',
    name: 'Vogon Paperwork Lost',
    text: 'This planet cannot be invaded. Officially, it is a filing error.',
    noVogons: true,
  },
  {
    id: 'prospectors-dream',
    name: "Prospector's Dream",
    text: 'All production +10% on this planet.',
    allProdMult: 1.1,
  },
  {
    id: 'magrathean-surplus',
    name: 'Magrathean Surplus Stock',
    text: 'Arrives 10% pre-terraformed. Slightly used; one careful owner.',
    headStart: 0.1,
  },
];

export const SURVEY_BY_ID: Record<string, SurveyDef> = Object.fromEntries(
  SURVEYS.map((s) => [s.id, s]),
);
