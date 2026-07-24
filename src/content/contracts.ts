import type {
  AspectId,
  ContractObjective,
  ContractTemplateId,
  FactionId,
  SystemSpecialty,
} from '../engine/types';

export interface FactionMeta {
  label: string;
  office: string;
  guide: string;
}

export const FACTION_META: Record<FactionId, FactionMeta> = {
  magrathea: {
    label: 'Magrathea',
    office: 'World Allocation Office',
    guide: 'Bespoke planets, standard forms, optional fjords.',
  },
  mice: {
    label: 'The Mice',
    office: 'Experimental Oversight Committee',
    guide: 'The observers have requested a larger sample and a smaller lunch.',
  },
  vogon: {
    label: 'Vogon Works',
    office: 'Department of Productive Administration',
    guide: 'A surprisingly legitimate contract, regrettably in triplicate.',
  },
};

export const CONTRACT_TEMPLATE_META: Record<ContractTemplateId, { name: string; brief: string }> = {
  delivery: {
    name: 'Routine World Delivery',
    brief: 'Complete the listed number of planets. Taste is appreciated but not audited.',
  },
  system: {
    name: 'System Assembly Order',
    brief: 'Complete enough worlds to form the listed number of new systems.',
  },
  bottleneck: {
    name: 'Aspect Remediation Filing',
    brief: 'Deliver worlds whose slowest finishing gauge matches the requested aspect.',
  },
  survey: {
    name: 'Survey Compliance Packet',
    brief: 'Deliver worlds with a filed orbital survey. Unexamined planets remain perfectly legal.',
  },
  lean: {
    name: 'Minimal Plant Declaration',
    brief: 'Deliver worlds under the stated total-building ceiling.',
  },
  timed: {
    name: 'Expedited Construction Notice',
    brief: 'Deliver the requested worlds before the filing window closes.',
  },
};

export const SPECIALTIES: readonly SystemSpecialty[] = [
  'thermal',
  'atmo',
  'hydro',
  'bio',
  'science',
  'production',
];

export const SPECIALTY_META: Record<
  SystemSpecialty,
  { label: string; shortBonus: string; rule: string; aspect?: AspectId }
> = {
  thermal: {
    label: 'Thermal',
    shortBonus: '+8%',
    rule: 'This system contributes +8% Thermal output.',
    aspect: 'thermal',
  },
  atmo: {
    label: 'Atmospheric',
    shortBonus: '+8%',
    rule: 'This system contributes +8% Atmospheric output.',
    aspect: 'atmo',
  },
  hydro: {
    label: 'Hydrologic',
    shortBonus: '+8%',
    rule: 'This system contributes +8% Hydrologic output.',
    aspect: 'hydro',
  },
  bio: {
    label: 'Biotic',
    shortBonus: '+8%',
    rule: 'This system contributes +8% Biotic output.',
    aspect: 'bio',
  },
  science: {
    label: 'Science',
    shortBonus: '+10%',
    rule: 'This system contributes +10% Science output.',
  },
  production: {
    label: 'Production',
    shortBonus: '+4%',
    rule: 'This system contributes +4% to all production.',
  },
};

const ASPECT_NAME: Record<AspectId, string> = {
  thermal: 'Thermal',
  atmo: 'Atmospheric',
  hydro: 'Hydrologic',
  bio: 'Biotic',
};

export function objectiveTarget(objective: ContractObjective): number {
  return objective.count;
}

export function objectiveText(objective: ContractObjective): string {
  const worlds = (count: number) => `${count} ${count === 1 ? 'world' : 'worlds'}`;
  switch (objective.kind) {
    case 'planets':
      return `Deliver ${worlds(objective.count)}.`;
    case 'systems':
      return `Form ${objective.count} new ${objective.count === 1 ? 'system' : 'systems'}.`;
    case 'bottleneck':
      return `Deliver ${worlds(objective.count)} with ${ASPECT_NAME[objective.aspect]} recorded as the primary bottleneck.`;
    case 'surveyed':
      return `Deliver ${worlds(objective.count)} with an orbital survey filed.`;
    case 'lean':
      return `Deliver ${worlds(objective.count)} while owning no more than ${objective.maxBuildings} total buildings.`;
    case 'timed':
      return `Deliver ${worlds(objective.count)} within the stated filing window.`;
  }
}

export function objectiveRule(objective: ContractObjective): string {
  switch (objective.kind) {
    case 'planets':
      return 'Every planet delivered after acceptance counts.';
    case 'systems':
      return 'Only systems formed after acceptance count.';
    case 'bottleneck':
      return 'The primary bottleneck is the least-complete gauge immediately before delivery.';
    case 'surveyed':
      return 'A world counts only when its survey choice is already filed at delivery.';
    case 'lean':
      return `The building count is checked at each delivery; ${objective.maxBuildings} or fewer qualifies.`;
    case 'timed':
      return 'The deadline uses simulation time and advances during offline catch-up.';
  }
}

export function contractRewardText(rewardBp: number, rewardReputation: number): string {
  const reputation = `+${rewardReputation} rep`;
  return rewardBp > 0 ? `+${rewardBp} BP / ${reputation}` : reputation;
}

export function contractRewardSentence(rewardBp: number, rewardReputation: number): string {
  const reputation = `+${rewardReputation} reputation`;
  return rewardBp > 0 ? `+${rewardBp} BP and ${reputation}` : reputation;
}
