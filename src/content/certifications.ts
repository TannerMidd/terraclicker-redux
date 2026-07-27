/**
 * Field Certifications — rank earned on firsts, costing nothing.
 *
 * The refit console sells equipment for salvage; this file sells nothing.
 * A certification advances when you do something for the FIRST time — land
 * on a world nobody had walked, stand in weather you had only read about,
 * catalogue a substance the ledger had no name for — and each first pays
 * exactly once, forever, into `expedition.certFirsts` (`${track}:${key}`).
 *
 * Ranks unlock VERBS, never percentages (EXPEDITIONS.md spine §5): the
 * beacon, the shelter, the station, the repair, and a handful of trained
 * habits — reading buried ground without waiting for the dust, keeping the
 * charts a station drew, paying a call on a town and having it count.
 *
 * The Guide notes that these are the only qualifications in the galaxy
 * that cannot be purchased, and that several institutions have written in
 * to complain.
 */
import type { GroundMark } from '../engine/types';

export type CertTrack = 'mobility' | 'survey' | 'geology' | 'liaison';
export const CERT_TRACKS: readonly CertTrack[] = [
  'mobility',
  'survey',
  'geology',
  'liaison',
];

/** Distinct firsts required for ranks 1, 2, 3 — uniform across tracks. */
export const CERT_THRESHOLDS = [2, 6, 12] as const;
export const CERT_MAX_RANK = CERT_THRESHOLDS.length;

export interface CertRankDef {
  /** The title the rank confers. Printed on nothing, honoured everywhere. */
  title: string;
  /** What the rank unlocks, in one line. */
  unlock: string;
}

export interface CertTrackDef {
  id: CertTrack;
  name: string;
  /** The Guide, on what this track measures. */
  guide: string;
  /** What counts as a first here, for the console's small print. */
  earns: string;
  ranks: readonly [CertRankDef, CertRankDef, CertRankDef];
}

export const CERTIFICATIONS: readonly CertTrackDef[] = [
  {
    id: 'mobility',
    name: 'Mobility',
    guide:
      'Certifies that you go places, including places that were a bad idea at the time. Advances on new ground, new weather, and new things found by walking toward them.',
    earns: 'first landings · first weather stood in · first landmarks reached · beacons raised',
    ranks: [
      {
        title: 'Rambler',
        unlock: 'the BEACON — a mast the compass never loses, whatever the sky is doing',
      },
      {
        title: 'Pathfinder',
        unlock:
          'the SHELTER — a warm camp the whiteout can be survived from — and the sled deploys wherever you stand',
      },
      { title: 'Longwalker', unlock: 'a title, and the Guide’s quiet respect' },
    ],
  },
  {
    id: 'survey',
    name: 'Survey',
    guide:
      'Certifies attention paid. Advances on surveys filed, species first entered into the record, and stations raised to keep watching after you leave.',
    earns: 'surveys filed · species first recorded · stations raised',
    ranks: [
      {
        title: 'Enumerator',
        unlock: 'the STATION — an instrument post that keeps working the ground you left',
      },
      {
        title: 'Cartographer',
        unlock: 'kept charts — landing near a standing station arrives with its neighbourhood already scanned',
      },
      {
        title: 'Chronicler',
        unlock: 'the long forecast — the outlook reads twice as far ahead',
      },
    ],
  },
  {
    id: 'geology',
    name: 'Geology',
    guide:
      'Certifies a professional relationship with rock. Advances on substances catalogued for the first time anywhere, methods tried, and ground the sand was hiding.',
    earns: 'sample kinds first catalogued · extraction methods first used · buried seams worked',
    ranks: [
      {
        title: 'Prospector',
        unlock: 'seam sense — unscanned seams inside 46 m stand on the rail, unlabelled',
      },
      {
        title: 'Assayer',
        unlock: 'reading the sand — the field pulse raises buried seams without waiting for a dust front',
      },
      { title: 'Deep-Reader', unlock: 'a title the rocks would respect, if they could' },
    ],
  },
  {
    id: 'liaison',
    name: 'Liaison',
    guide:
      'Certifies that you show up. Advances on towns walked into, requests answered with boots rather than budget, and things mended where they stood.',
    earns: 'settlements attended · requests answered on the ground · repairs made',
    ranks: [
      {
        title: 'Caller',
        unlock: 'the REPAIR — mend a facility where it stands, and be seen doing it',
      },
      {
        title: 'Consul',
        unlock: 'the civic call — attending a settlement in person lifts its standing, once a stay',
      },
      { title: 'Neighbour', unlock: 'a title, and a standing invitation nobody wrote down' },
    ],
  },
];

export const CERT_BY_ID: Record<string, CertTrackDef> = Object.fromEntries(
  CERTIFICATIONS.map((t) => [t.id, t]),
);

/** The certification each mark kind demands before the verb exists. */
export const MARK_CERT: Record<GroundMark['kind'], { track: CertTrack; rank: number }> = {
  beacon: { track: 'mobility', rank: 1 },
  shelter: { track: 'mobility', rank: 2 },
  station: { track: 'survey', rank: 1 },
  repair: { track: 'liaison', rank: 1 },
};

/** Rank a count of distinct firsts confers. */
export function certRankFor(firsts: number): number {
  let rank = 0;
  for (const need of CERT_THRESHOLDS) {
    if (firsts >= need) rank++;
  }
  return rank;
}

/** The track a `certFirsts` key belongs to, or null for a stray. */
export function trackOfFirst(key: string): CertTrack | null {
  const head = key.slice(0, key.indexOf(':'));
  return (CERT_TRACKS as readonly string[]).includes(head) ? (head as CertTrack) : null;
}

/** Human line for a mark verb the walker is not yet certified for. */
export function markCertRefusal(kind: GroundMark['kind']): string {
  const need = MARK_CERT[kind];
  const def = CERT_BY_ID[need.track]!;
  return `${def.name} ${'I'.repeat(need.rank)} required — ${def.earns}`;
}
