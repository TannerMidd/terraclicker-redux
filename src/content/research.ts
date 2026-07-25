import type { AspectId } from '../engine/types';

export type ResearchEffect =
  | { kind: 'aspectMult'; aspect: AspectId; v: number }
  | { kind: 'allMult'; v: number }
  | { kind: 'clickMult'; v: number }
  | { kind: 'scienceMult'; v: number }
  | { kind: 'offlineEfficiency'; v: number }
  | { kind: 'offlineCapAddMs'; v: number }
  | { kind: 'vogonHalve' }
  | { kind: 'situationFreqMult'; v: number }
  | { kind: 'bubbleLifetimeAddMs'; v: number }
  | { kind: 'costGrowthDelta'; v: number }
  | { kind: 'researchSpeedMult'; v: number }
  | { kind: 'answer' };

export interface ResearchDef {
  id: string;
  name: string;
  costScience: number;
  durationMs: number;
  guide: string;
  /** Continues thinking and stays completed across Magrathean commissions. */
  survivesPrestige?: boolean;
  requiresResearch?: string;
  requiresBuilding?: Record<string, number>;
  effects: ResearchEffect[];
}

const MIN = 60_000;
const HOUR = 3_600_000;

export const RESEARCH: readonly ResearchDef[] = [
  {
    id: 'thermal-dynamics',
    name: 'Applied Thermal Dynamics',
    costScience: 15,
    durationMs: 2 * MIN,
    effects: [{ kind: 'aspectMult', aspect: 'thermal', v: 1.25 }],
    guide: 'Heat, but on purpose. Thermal output +25%.',
  },
  {
    id: 'atmo-retention',
    name: 'Atmospheric Retention Models',
    costScience: 25,
    durationMs: 3 * MIN,
    effects: [{ kind: 'aspectMult', aspect: 'atmo', v: 1.25 }],
    guide: 'Persuades air to stay. Atmospheric output +25%.',
  },
  {
    id: 'hydro-cycle',
    name: 'Stabilized Hydro Cycle',
    costScience: 40,
    durationMs: 4 * MIN,
    effects: [{ kind: 'aspectMult', aspect: 'hydro', v: 1.25 }],
    guide: 'Rain that files a flight plan. Hydrologic output +25%.',
  },
  {
    id: 'bio-protocols',
    name: 'Bio-Enhancement Protocols',
    costScience: 60,
    durationMs: 5 * MIN,
    effects: [{ kind: 'aspectMult', aspect: 'bio', v: 1.25 }],
    guide: 'Life finds a way, faster, with forms filled in. Biotic output +25%.',
  },
  {
    id: 'ergonomic-terraforming',
    name: 'Ergonomic Terraforming',
    costScience: 80,
    durationMs: 6 * MIN,
    effects: [{ kind: 'clickMult', v: 2 }],
    guide: 'Lift with the knees, terraform with the wrists. Manual terraforming ×2.',
  },
  {
    id: 'peer-review',
    name: 'Accelerated Peer Review',
    costScience: 120,
    durationMs: 8 * MIN,
    effects: [{ kind: 'scienceMult', v: 1.5 }, { kind: 'researchSpeedMult', v: 1.25 }],
    guide: 'Reviewer 2 has been made to understand. Science +50%, research 25% faster.',
  },
  {
    id: 'while-hitchhiking-1',
    name: 'While You Were Hitchhiking I',
    costScience: 200,
    durationMs: 10 * MIN,
    effects: [{ kind: 'offlineEfficiency', v: 0.75 }],
    guide: 'The operation learns to miss you productively. Offline efficiency 50% → 75%.',
  },
  {
    id: 'while-hitchhiking-2',
    name: 'While You Were Hitchhiking II',
    costScience: 1_200,
    durationMs: 45 * MIN,
    requiresResearch: 'while-hitchhiking-1',
    effects: [{ kind: 'offlineEfficiency', v: 1.0 }, { kind: 'offlineCapAddMs', v: 16 * HOUR }],
    guide: 'Absence now runs at full salary. Offline efficiency 100%, cap 8h → 24h.',
  },
  {
    id: 'babel-fish',
    name: 'Babel Fish Cultivation',
    costScience: 500,
    durationMs: 20 * MIN,
    effects: [{ kind: 'vogonHalve' }],
    guide: 'Small, yellow, leech-like. Once you understand Vogon poetry, it hurts measurably less. Poetry debuff halved.',
  },
  {
    id: 'sens-o-matic',
    name: 'Sub-Etha Sens-O-Matic',
    costScience: 900,
    durationMs: 30 * MIN,
    effects: [{ kind: 'situationFreqMult', v: 1.2 }],
    guide: 'Detects interesting weather before it detects you. Situations 20% more frequent, and the Vortex will name the next one.',
  },
  {
    id: 'sep-field',
    name: "Somebody Else's Problem Field",
    costScience: 2_000,
    durationMs: HOUR,
    survivesPrestige: true,
    requiresResearch: 'babel-fish',
    effects: [{ kind: 'allMult', v: 1.15 }],
    guide: 'Distractions become somebody else\'s. All production +15%, mostly from meetings you can no longer perceive.',
  },
  {
    id: 'bubble-stabilization',
    name: 'Improbability Containment',
    costScience: 3_000,
    durationMs: 90 * MIN,
    survivesPrestige: true,
    effects: [{ kind: 'bubbleLifetimeAddMs', v: 6_000 }],
    guide: 'Bubbles of concentrated luck now pop 6 seconds later. The luck has been notified.',
  },
  {
    id: 'bistromathics',
    name: 'Bistromathics',
    costScience: 8_000,
    durationMs: 3 * HOUR,
    survivesPrestige: true,
    effects: [{ kind: 'costGrowthDelta', v: -0.0015 }],
    guide: 'Numbers on restaurant bills obey different rules. Building cost growth 1.15 → 1.1485. This is enormous. It does not look enormous. That is bistromathics.',
  },
  {
    id: 'universal-constants',
    name: 'Negotiable Universal Constants',
    costScience: 25_000,
    durationMs: 6 * HOUR,
    survivesPrestige: true,
    requiresResearch: 'bistromathics',
    effects: [{ kind: 'allMult', v: 1.5 }],
    guide: 'The fundamental forces agree to new terms. All production +50%.',
  },
  {
    id: 'the-answer',
    name: 'The Answer',
    costScience: 42_000,
    durationMs: 42 * HOUR,
    survivesPrestige: true,
    requiresBuilding: { deepThought: 1 },
    effects: [{ kind: 'answer' }],
    guide: '42.',
  },
];

export const RESEARCH_BY_ID: Record<string, ResearchDef> = Object.fromEntries(
  RESEARCH.map((r) => [r.id, r]),
);
