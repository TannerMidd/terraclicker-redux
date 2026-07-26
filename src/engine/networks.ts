import { CHARTER_BY_ID } from '../content/charters';
import { C } from '../content/constants';
import type { AspectId, GameState } from './types';

/**
 * A formed galaxy becomes more than five systems once three of those systems
 * have signed articles. The first three signed seats in stable system order
 * are its quorum: higher-index articles may complete the record, but cannot
 * silently rewrite an accord players have already seen.
 *
 * Everything here is derived from run-scoped facts. No RNG is consumed and no
 * save field is needed, so online, offline, and migrated games read the same
 * network from the same five charter choices.
 */
export type GalaxyAccordKind =
  | 'civic-commons'
  | 'works-combine'
  | 'observatory-chorus'
  | 'elemental-exchange';

export interface GalaxyAccordMeta {
  name: string;
  shortName: string;
  color: number;
  description: string;
  bonusText: string;
}

export const GALAXY_ACCORD_META: Record<GalaxyAccordKind, GalaxyAccordMeta> = {
  'civic-commons': {
    name: 'Civic Commons Accord',
    shortName: 'Civic commons',
    color: 0x58d68a,
    description: 'Mutual-aid articles pool the useful parts of five administrations.',
    bonusText: `+${(C.NETWORK_CIVIC_PROD * 100).toFixed(1)}% all production`,
  },
  'works-combine': {
    name: 'Combined Works Accord',
    shortName: 'Works combine',
    color: 0xffb15a,
    description: 'The member systems agree that five works committees count as one large one.',
    bonusText: `+${(C.NETWORK_WORKS_PROD * 100).toFixed(1)}% all production`,
  },
  'observatory-chorus': {
    name: 'Observatory Chorus',
    shortName: 'Observatory chorus',
    color: 0xf5c84c,
    description: 'Five night sides compare notes until the notes become research.',
    bonusText: `+${(C.NETWORK_OBSERVATORY_SCIENCE * 100).toFixed(1)}% science`,
  },
  'elemental-exchange': {
    name: 'Elemental Exchange',
    shortName: 'Elemental exchange',
    color: 0x5ad7e8,
    description: 'Heat, rain, air and seed stock travel farther than departmental boundaries.',
    bonusText: `+${(C.NETWORK_ELEMENTAL_ASPECT * 100).toFixed(1)}% all aspects`,
  },
};

const ACCORD_BY_CHARTER: Record<string, GalaxyAccordKind> = {
  'mutual-aid': 'civic-commons',
  'open-correspondence': 'civic-commons',
  'quiet-clause': 'civic-commons',
  'salvage-rights': 'works-combine',
  'works-committee': 'works-combine',
  observatory: 'observatory-chorus',
  'thermal-compact': 'elemental-exchange',
  'water-board': 'elemental-exchange',
};

const ACCORD_KINDS: readonly GalaxyAccordKind[] = [
  'civic-commons',
  'works-combine',
  'observatory-chorus',
  'elemental-exchange',
];

export interface GalaxyAccord {
  galaxyIndex: number;
  firstSystemIndex: number;
  signedArticles: readonly string[];
  signedCount: number;
  totalArticles: number;
  quorum: number;
  kind: GalaxyAccordKind | null;
  /** Votes among the first quorum signatures. Useful for honest UI copy. */
  quorumVotes: Readonly<Record<GalaxyAccordKind, number>>;
}

export interface GalaxyNetworkEffects {
  prodMult: number;
  scienceMult: number;
  aspectMult: Readonly<Record<AspectId, number>>;
  diversityKinds: readonly GalaxyAccordKind[];
  diversityMult: number;
}

export interface GalaxyNetwork {
  galaxies: readonly GalaxyAccord[];
  effects: GalaxyNetworkEffects;
}

function emptyVotes(): Record<GalaxyAccordKind, number> {
  return {
    'civic-commons': 0,
    'works-combine': 0,
    'observatory-chorus': 0,
    'elemental-exchange': 0,
  };
}

/**
 * The lowest-index signed seat settles a tied quorum. System order is already
 * stable in the save, which makes the tie-break legible and deterministic.
 */
function accordFromQuorum(articleIds: readonly string[]): {
  kind: GalaxyAccordKind | null;
  votes: Record<GalaxyAccordKind, number>;
} {
  const votes = emptyVotes();
  const kinds: GalaxyAccordKind[] = [];
  for (const id of articleIds.slice(0, C.NETWORK_QUORUM_ARTICLES)) {
    const kind = ACCORD_BY_CHARTER[id];
    if (!kind) continue;
    votes[kind] += 1;
    kinds.push(kind);
  }
  if (kinds.length < C.NETWORK_QUORUM_ARTICLES) return { kind: null, votes };
  const high = Math.max(...ACCORD_KINDS.map((kind) => votes[kind]));
  return { kind: kinds.find((kind) => votes[kind] === high) ?? null, votes };
}

export function galaxyAccord(state: GameState, galaxyIndex: number): GalaxyAccord | null {
  if (
    !Number.isInteger(galaxyIndex)
    || galaxyIndex < 0
    || galaxyIndex >= state.run.galaxies
  ) {
    return null;
  }

  const firstSystemIndex = galaxyIndex * C.SYSTEMS_PER_GALAXY;
  const signedArticles: string[] = [];
  for (let slot = 0; slot < C.SYSTEMS_PER_GALAXY; slot++) {
    const id = state.run.charters[String(firstSystemIndex + slot)];
    if (id && CHARTER_BY_ID[id]) signedArticles.push(id);
  }
  const quorum = accordFromQuorum(signedArticles);
  return {
    galaxyIndex,
    firstSystemIndex,
    signedArticles,
    signedCount: signedArticles.length,
    totalArticles: C.SYSTEMS_PER_GALAXY,
    quorum: C.NETWORK_QUORUM_ARTICLES,
    kind: signedArticles.length >= C.NETWORK_QUORUM_ARTICLES ? quorum.kind : null,
    quorumVotes: quorum.votes,
  };
}

export function galaxyAccords(state: GameState): GalaxyAccord[] {
  const out: GalaxyAccord[] = [];
  for (let i = 0; i < state.run.galaxies; i++) {
    const accord = galaxyAccord(state, i);
    if (accord) out.push(accord);
  }
  return out;
}

export function galaxyNetworkEffects(
  accords: readonly GalaxyAccord[],
): GalaxyNetworkEffects {
  let prodAdd = 0;
  let scienceAdd = 0;
  let aspectAdd = 0;
  const distinct = new Set<GalaxyAccordKind>();

  for (const accord of accords) {
    if (!accord.kind) continue;
    distinct.add(accord.kind);
    switch (accord.kind) {
      case 'civic-commons':
        prodAdd += C.NETWORK_CIVIC_PROD;
        break;
      case 'works-combine':
        prodAdd += C.NETWORK_WORKS_PROD;
        break;
      case 'observatory-chorus':
        scienceAdd += C.NETWORK_OBSERVATORY_SCIENCE;
        break;
      case 'elemental-exchange':
        aspectAdd += C.NETWORK_ELEMENTAL_ASPECT;
        break;
    }
  }

  const diversityKinds = ACCORD_KINDS.filter((kind) => distinct.has(kind));
  const diversityAdd = Math.min(
    C.NETWORK_DIVERSITY_CAP,
    Math.max(0, diversityKinds.length - 1) * C.NETWORK_DIVERSITY_PER_KIND,
  );
  const diversityMult = 1 + diversityAdd;
  return {
    prodMult:
      (1 + Math.min(C.NETWORK_PROD_CAP, prodAdd))
      * diversityMult,
    scienceMult: 1 + Math.min(C.NETWORK_SCIENCE_CAP, scienceAdd),
    aspectMult: {
      thermal: 1 + Math.min(C.NETWORK_ASPECT_CAP, aspectAdd),
      atmo: 1 + Math.min(C.NETWORK_ASPECT_CAP, aspectAdd),
      hydro: 1 + Math.min(C.NETWORK_ASPECT_CAP, aspectAdd),
      bio: 1 + Math.min(C.NETWORK_ASPECT_CAP, aspectAdd),
    },
    diversityKinds,
    diversityMult,
  };
}

export function deriveGalaxyNetwork(state: GameState): GalaxyNetwork {
  const galaxies = galaxyAccords(state);
  return { galaxies, effects: galaxyNetworkEffects(galaxies) };
}
