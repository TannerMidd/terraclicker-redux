import type { AspectId } from '../engine/types';
import { BUILDINGS } from './buildings';

export type UpgradeEffect =
  | { kind: 'clickAdd'; v: number }
  | { kind: 'clickMult'; v: number }
  | { kind: 'clickTupsPct'; v: number }
  | { kind: 'buildingMult'; building: string; v: number }
  | { kind: 'allMult'; v: number }
  | { kind: 'aspectMult'; aspect: AspectId; v: number };

export interface UpgradeDef {
  id: string;
  name: string;
  cost: number;
  guide: string;
  effects: UpgradeEffect[];
  requiresUpgrade?: string;
  requiresBuilding?: Record<string, number>;
  requiresTotalBuildings?: number;
  unlockAtTu?: number;
}

// ————— Click line: manual terraforming never becomes pointless —————
const CLICK_LINE: UpgradeDef[] = [
  {
    id: 'terraforming-gloves',
    name: 'Terraforming Gloves',
    cost: 100,
    unlockAtTu: 40,
    effects: [{ kind: 'clickAdd', v: 4 }],
    guide: 'Sturdy gloves for hands-on planetary work. +4 TU per manual terraform.',
  },
  {
    id: 'reinforced-gauntlets',
    name: 'Reinforced Gauntlets',
    cost: 1_000,
    requiresUpgrade: 'terraforming-gloves',
    effects: [{ kind: 'clickMult', v: 2 }],
    guide: 'Twice the grip, twice the results. Manual terraforming ×2.',
  },
  {
    id: 'hydraulic-servos',
    name: 'Hydraulic Servos',
    cost: 12_000,
    requiresUpgrade: 'reinforced-gauntlets',
    effects: [{ kind: 'clickMult', v: 2 }],
    guide: 'Your handshake is now legally a construction vehicle. Manual terraforming ×2.',
  },
  {
    id: 'neural-lace',
    name: 'Neural Terraforming Lace',
    cost: 400_000,
    requiresUpgrade: 'hydraulic-servos',
    effects: [{ kind: 'clickMult', v: 3 }],
    guide: 'Think at the ground until it improves. Manual terraforming ×3.',
  },
  {
    id: 'stellar-conductor',
    name: 'Stellar Conductor Batons',
    cost: 20_000_000,
    requiresUpgrade: 'neural-lace',
    effects: [{ kind: 'clickMult', v: 5 }],
    guide: 'Conduct sunlight like an orchestra with one very bright instrument. ×5.',
  },
  {
    id: 'electronic-thumb',
    name: 'Electronic Thumb',
    cost: 2_000_000_000,
    requiresUpgrade: 'stellar-conductor',
    effects: [{ kind: 'clickTupsPct', v: 0.01 }],
    guide: 'Flags down passing productivity. Each manual terraform also gains 1% of your TU/s.',
  },
  {
    id: 'improbable-digits',
    name: 'Improbable Digits',
    cost: 800_000_000_000,
    requiresUpgrade: 'electronic-thumb',
    effects: [{ kind: 'clickMult', v: 10 }, { kind: 'clickTupsPct', v: 0.02 }],
    guide: 'Your fingers now exist in several helpful places at once. ×10, and +2% of TU/s per terraform.',
  },
];

// ————— Auto-generated per-building efficiency tiers —————
const EFF_THRESHOLDS = [10, 25, 50, 100, 200] as const;
const EFF_MULTS = [2, 2, 2, 5, 10] as const;
const EFF_COST_FACTORS = [8, 40, 400, 8_000, 200_000] as const;
const EFF_NAMES = ['Calibration', 'Optimization', 'Overhaul', 'Apotheosis', 'Transcendence'] as const;

const EFFICIENCY_TIERS: UpgradeDef[] = BUILDINGS.filter((b) => !b.unique).flatMap((b) =>
  EFF_THRESHOLDS.map((threshold, i) => ({
    id: `${b.id}-eff-${i + 1}`,
    name: `${b.name} ${EFF_NAMES[i]}`,
    cost: b.baseCost * EFF_COST_FACTORS[i]!,
    requiresBuilding: { [b.id]: threshold },
    effects: [{ kind: 'buildingMult', building: b.id, v: EFF_MULTS[i]! } as UpgradeEffect],
    guide: `${b.name} output ×${EFF_MULTS[i]}. The manual calls this "the ${EFF_NAMES[i]!.toLowerCase()} setting" and advises against reading further.`,
  })),
);

// ————— Milestones on total building count —————
const MILESTONES: UpgradeDef[] = [
  {
    id: 'milestone-25',
    name: 'A Going Concern',
    cost: 5_000,
    requiresTotalBuildings: 25,
    effects: [{ kind: 'allMult', v: 1.25 }],
    guide: '25 installations. The operation is now large enough to have a stationery budget. All production +25%.',
  },
  {
    id: 'milestone-75',
    name: 'Planetary Works Department',
    cost: 400_000,
    requiresTotalBuildings: 75,
    effects: [{ kind: 'allMult', v: 1.5 }],
    guide: '75 installations. You have been assigned a department, a motto, and an enemy in accounting. All production +50%.',
  },
  {
    id: 'milestone-150',
    name: 'Sector-Scale Operations',
    cost: 60_000_000,
    requiresTotalBuildings: 150,
    effects: [{ kind: 'allMult', v: 2 }],
    guide: '150 installations. Neighboring sectors have begun to describe you as "a phase the galaxy is going through". All production ×2.',
  },
  {
    id: 'milestone-300',
    name: 'Cosmically Significant',
    cost: 9_000_000_000,
    requiresTotalBuildings: 300,
    effects: [{ kind: 'allMult', v: 3 }],
    guide: '300 installations. You now appear in other civilizations\' horoscopes. All production ×3.',
  },
];

// ————— Curated synergy pairs —————
const SYNERGIES: UpgradeDef[] = [
  {
    id: 'syn-thermal-chain',
    name: 'Thermal Production Chain',
    cost: 60_000,
    requiresBuilding: { geoTap: 5, orbitalMirror: 0 },
    effects: [{ kind: 'buildingMult', building: 'geoTap', v: 2 }],
    guide: 'Geothermal Taps coordinate their smugness. Output ×2.',
  },
  {
    id: 'syn-mirror-tap',
    name: 'Above/Below Accord',
    cost: 90_000_000,
    requiresBuilding: { geoTap: 25, orbitalMirror: 10 },
    effects: [
      { kind: 'buildingMult', building: 'orbitalMirror', v: 2 },
      { kind: 'buildingMult', building: 'geoTap', v: 2 },
    ],
    guide: 'Heat from above and below, meeting politely in the middle. Both ×2.',
  },
  {
    id: 'syn-lab-excavator',
    name: 'Peer-Reviewed Digging',
    cost: 1_500_000_000,
    requiresBuilding: { researchLab: 25, quantumExcavator: 10 },
    effects: [
      { kind: 'buildingMult', building: 'researchLab', v: 2 },
      { kind: 'buildingMult', building: 'quantumExcavator', v: 2 },
    ],
    guide: 'The labs cite the holes; the holes cite the labs. Both ×2.',
  },
  {
    id: 'syn-dome-seeder',
    name: 'Closed-Loop Ecology',
    cost: 30_000_000,
    requiresBuilding: { bioDome: 15, hydroSeeder: 25 },
    effects: [
      { kind: 'buildingMult', building: 'bioDome', v: 2.5 },
      { kind: 'buildingMult', building: 'hydroSeeder', v: 2.5 },
    ],
    guide: 'Water grows life; life politely returns the water. Both ×2.5.',
  },
  {
    id: 'syn-forge-compressor',
    name: 'Scheduled Sunrise',
    cost: 40_000_000_000_000,
    requiresBuilding: { stellarForge: 10, temporalCompressor: 25 },
    effects: [
      { kind: 'buildingMult', building: 'stellarForge', v: 3 },
      { kind: 'buildingMult', building: 'temporalCompressor', v: 3 },
    ],
    guide: 'Sunlight, delivered yesterday. Both ×3.',
  },
];

export const UPGRADES: readonly UpgradeDef[] = [
  ...CLICK_LINE,
  ...EFFICIENCY_TIERS,
  ...MILESTONES,
  ...SYNERGIES,
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);
