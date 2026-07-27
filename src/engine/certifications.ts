/**
 * Field Certifications — the engine side of content/certifications.ts.
 *
 * `certFirsts` is the ledger: `${track}:${key}` → gameTimeMs, written once
 * and never twice, which is what makes a first a first. `certs` stores the
 * conferred rank per track — stored rather than derived so that a rank, once
 * held, is held forever even if the thresholds later change (the same
 * courtesy achievements get).
 *
 * Everything here is called from the banking path with the game state in
 * hand; nothing rolls rng, nothing reads the clock but `gameTimeMs`.
 */
import {
  CERT_BY_ID,
  certRankFor,
  trackOfFirst,
  type CertTrack,
} from '../content/certifications';
import type { ExpeditionState, GameState, SimEffect } from './types';

/** Rank currently held in a track. */
export function certRank(
  expedition: Pick<ExpeditionState, 'certs'>,
  track: CertTrack,
): number {
  return expedition.certs[track] ?? 0;
}

/** Distinct firsts recorded in a track. */
export function certFirstCount(
  expedition: Pick<ExpeditionState, 'certFirsts'>,
  track: CertTrack,
): number {
  let n = 0;
  for (const key of Object.keys(expedition.certFirsts)) {
    if (trackOfFirst(key) === track) n++;
  }
  return n;
}

/**
 * Record one first. Returns true if it was genuinely new. Rank-ups ride the
 * same call: a track that crosses a threshold advances at once, with an
 * effect for the toast and the chronicle — and never retreats.
 */
export function recordCertFirst(
  state: GameState,
  effects: SimEffect[],
  key: string,
): boolean {
  const firsts = state.expedition.certFirsts;
  if (firsts[key] !== undefined) return false;
  const track = trackOfFirst(key);
  if (!track) return false;
  firsts[key] = state.gameTimeMs;

  const rank = certRankFor(certFirstCount(state.expedition, track));
  const held = certRank(state.expedition, track);
  if (rank > held) {
    state.expedition.certs[track] = rank;
    const def = CERT_BY_ID[track]!;
    const title = def.ranks[rank - 1]?.title ?? def.name;
    effects.push({ t: 'certAdvanced', track, rank, title });
  }
  return true;
}
