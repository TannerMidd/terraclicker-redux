import type { AspectId } from '../engine/types';

export interface BuildingDef {
  id: string;
  name: string;
  baseCost: number;
  tuPerSec: number;
  /** Aspect units/sec contributed to the current planet's gauges. */
  aspects: Partial<Record<AspectId, number>>;
  sciencePerSec?: number;
  /** Only one may ever be owned. */
  unique?: boolean;
  /** Revealed once run TU-earned reaches this. */
  unlockAtTu: number;
  special?: 'marvin' | 'heartOfGold' | 'deepThought' | 'workshop';
  /** Entry in the Guide. Deadpan is mandatory. */
  guide: string;
}

export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'seedProbe',
    name: 'Seed Probe',
    baseCost: 15,
    tuPerSec: 0.1,
    aspects: { thermal: 0.05, atmo: 0.05, hydro: 0.05, bio: 0.05 },
    unlockAtTu: 0,
    guide: 'A small automated probe that begins the work of making a planet habitable. Mostly harmless.',
  },
  {
    id: 'atmoProcessor',
    name: 'Atmospheric Processor',
    baseCost: 100,
    tuPerSec: 0.6,
    aspects: { atmo: 0.45, thermal: 0.05 },
    unlockAtTu: 60,
    guide: 'Produces air of almost, but not quite, entirely breathable quality. Improves with encouragement.',
  },
  {
    id: 'hydroSeeder',
    name: 'Hydro Seeder',
    baseCost: 1_100,
    tuPerSec: 3.4,
    aspects: { hydro: 2.4, bio: 0.2 },
    unlockAtTu: 700,
    guide: 'Delivers oceans on schedule and within budget. Dolphins sold separately, and leaving anyway.',
  },
  {
    id: 'geoTap',
    name: 'Geothermal Tap',
    baseCost: 12_000,
    tuPerSec: 16,
    aspects: { thermal: 11, atmo: 0.6 },
    unlockAtTu: 8_000,
    guide: 'Warms planets from the inside, like a very slow argument. Extremely reliable; occasionally smug about it.',
  },
  {
    id: 'bioDome',
    name: 'Bio-Dome',
    baseCost: 130_000,
    tuPerSec: 78,
    aspects: { bio: 52, hydro: 4 },
    unlockAtTu: 90_000,
    guide: 'A self-sustaining ecosystem, assuming nobody opens a window. Somebody always opens a window.',
  },
  {
    id: 'researchLab',
    name: 'Research Laboratory',
    baseCost: 1_400_000,
    tuPerSec: 340,
    aspects: { bio: 30 },
    sciencePerSec: 1,
    unlockAtTu: 950_000,
    guide: 'Where hyperintelligent white mice conduct subtle experiments on the scientists. Publishes constantly.',
  },
  {
    id: 'orbitalMirror',
    name: 'Orbital Mirror Array',
    baseCost: 16_000_000,
    tuPerSec: 1_500,
    aspects: { thermal: 700, atmo: 380 },
    unlockAtTu: 11_000_000,
    guide: 'Focuses sunlight with the confidence of a species that has never once burned toast.',
  },
  {
    id: 'marvin',
    name: 'Marvin',
    baseCost: 50_000_000,
    tuPerSec: 0,
    aspects: {},
    unique: true,
    special: 'marvin',
    unlockAtTu: 30_000_000,
    guide: 'A prototype with Genuine People Personality, employed here to click a planet once per second. He has calculated exactly how beneath him this is, to eleven decimal places.',
  },
  {
    id: 'quantumExcavator',
    name: 'Quantum Excavation Core',
    baseCost: 210_000_000,
    tuPerSec: 7_200,
    aspects: { hydro: 3_300, thermal: 900 },
    sciencePerSec: 4,
    unlockAtTu: 140_000_000,
    guide: 'Digs in several dimensions at once, occasionally striking last Tuesday. Findings are filed under "geology (speculative)".',
  },
  {
    id: 'temporalCompressor',
    name: 'Temporal Compressor',
    baseCost: 2_500_000_000,
    tuPerSec: 34_000,
    aspects: { thermal: 4_200, atmo: 4_200, hydro: 4_200, bio: 4_200 },
    unlockAtTu: 1_700_000_000,
    guide: 'Terraforms now using time borrowed from later. Later has been informed and is furious.',
  },
  {
    id: 'deepThought',
    name: 'Deep Thought Node',
    baseCost: 30_000_000_000,
    tuPerSec: 150_000,
    aspects: {},
    sciencePerSec: 70,
    special: 'deepThought',
    unlockAtTu: 20_000_000_000,
    guide: 'The second greatest computer in the Universe of Time and Space, sold here in convenient node form. Currently thinking. Please do not unplug.',
  },
  {
    id: 'stellarForge',
    name: 'Stellar Forge',
    baseCost: 400_000_000_000,
    tuPerSec: 760_000,
    aspects: { thermal: 380_000, atmo: 60_000 },
    unlockAtTu: 260_000_000_000,
    guide: 'Manufactures sunlight wholesale. Enquire about bulk rates; delivery times are measured in eras.',
  },
  {
    id: 'heartOfGold',
    name: 'Heart of Gold Drive',
    baseCost: 5_500_000_000_000,
    tuPerSec: 3_800_000,
    aspects: { thermal: 500_000, atmo: 500_000, hydro: 500_000, bio: 500_000 },
    special: 'heartOfGold',
    unlockAtTu: 3_600_000_000_000,
    guide: 'Passes through every point in the universe on its way to profitability. Raises local Improbability; interesting things follow it home.',
  },
  {
    id: 'magratheanWorkshop',
    name: 'Magrathean Workshop',
    baseCost: 75_000_000_000_000,
    tuPerSec: 18_000_000,
    aspects: { thermal: 2_400_000, atmo: 2_400_000, hydro: 2_400_000, bio: 2_400_000 },
    special: 'workshop',
    unlockAtTu: 48_000_000_000_000,
    guide: 'Custom planet construction by the oldest firm in the business. Ask about our fjords; everyone does.',
  },
];

export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b]),
);
