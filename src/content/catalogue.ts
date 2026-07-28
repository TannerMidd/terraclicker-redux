export type PerkBranch = 'construction' | 'improbability' | 'bureaucracy';

export type PerkEffect =
  | { kind: 'startProbes'; perRank: number }
  | { kind: 'costMultPerRank'; v: number }
  | { kind: 'headStartPerRank'; v: number }
  | { kind: 'situationFreqPerRank'; v: number }
  | { kind: 'bubbleLifetimePerRankMs'; v: number }
  | { kind: 'goldenOddsPerRank'; v: number }
  | { kind: 'offlineCapPerRankMs'; v: number }
  | { kind: 'offlineEffPerRank'; v: number }
  | { kind: 'marvinMultPerRank'; v: number };

export interface PerkDef {
  id: string;
  branch: PerkBranch;
  name: string;
  guide: string;
  maxRank: number;
  /** BP cost by rank index. */
  costs: number[];
  effect: PerkEffect;
}

export const BRANCH_LABELS: Record<PerkBranch, string> = {
  construction: 'Construction (Magrathea Proper)',
  improbability: 'Improbability (Heart of Gold Division)',
  bureaucracy: 'Bureaucracy (Vogon Dept. of Works)',
};

export const CATALOGUE: readonly PerkDef[] = [
  // — Construction —
  {
    id: 'surplus-stock',
    branch: 'construction',
    name: 'Surplus Stock',
    guide: 'Begin each commission with 5 Seed Probes per rank, gently used.',
    maxRank: 5,
    costs: [1, 2, 4, 8, 16],
    effect: { kind: 'startProbes', perRank: 5 },
  },
  {
    id: 'bulk-discount',
    branch: 'construction',
    name: 'Trade Account',
    guide: 'All building costs ×0.98 per rank. Magrathea appreciates repeat custom.',
    maxRank: 5,
    costs: [1, 2, 4, 8, 16],
    effect: { kind: 'costMultPerRank', v: 0.98 },
  },
  {
    id: 'fjord-certification',
    branch: 'construction',
    name: 'Fjord Certification',
    guide: 'Every planet arrives 3% pre-terraformed per rank, with noticeably better coastlines.',
    maxRank: 5,
    costs: [2, 4, 8, 16, 32],
    effect: { kind: 'headStartPerRank', v: 0.03 },
  },
  // — Improbability —
  {
    id: 'drive-tuning',
    branch: 'improbability',
    name: 'Drive Tuning',
    guide: 'Situations 10% more frequent per rank, subject to a universal speed limit on being interesting. The universe becomes easier to surprise.',
    maxRank: 5,
    costs: [1, 2, 4, 8, 16],
    effect: { kind: 'situationFreqPerRank', v: 1.1 },
  },
  {
    id: 'bubble-lens',
    branch: 'improbability',
    name: 'Probability Lensing',
    guide: 'Improbability Bubbles last 4 seconds longer per rank.',
    maxRank: 3,
    costs: [1, 3, 9],
    effect: { kind: 'bubbleLifetimePerRankMs', v: 4_000 },
  },
  {
    id: 'golden-ratio',
    branch: 'improbability',
    name: 'The Golden Ratio',
    guide: 'Golden bubbles 1.5× as likely per rank. Not the mathematical one. A better one.',
    maxRank: 3,
    costs: [2, 4, 8],
    effect: { kind: 'goldenOddsPerRank', v: 1.5 },
  },
  // — Bureaucracy —
  {
    id: 'extended-forms',
    branch: 'bureaucracy',
    name: 'Extended Absence Forms',
    guide: 'Offline cap +4 hours per rank. Filed in triplicate, honored in full.',
    maxRank: 4,
    costs: [1, 2, 4, 8],
    effect: { kind: 'offlineCapPerRankMs', v: 4 * 3_600_000 },
  },
  {
    id: 'efficient-filing',
    branch: 'bureaucracy',
    name: 'Efficient Filing',
    guide: 'Offline efficiency +10% per rank. The paperwork works while you don\'t.',
    maxRank: 5,
    costs: [1, 2, 4, 8, 16],
    effect: { kind: 'offlineEffPerRank', v: 0.1 },
  },
  {
    id: 'marvins-patience',
    branch: 'bureaucracy',
    name: "Marvin's Patience",
    guide: 'Marvin clicks twice as fast per rank, against his will and better judgment.',
    maxRank: 3,
    costs: [2, 4, 8],
    effect: { kind: 'marvinMultPerRank', v: 2 },
  },
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(
  CATALOGUE.map((p) => [p.id, p]),
);
