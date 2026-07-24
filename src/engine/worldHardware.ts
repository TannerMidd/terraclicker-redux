/**
 * The hardware a delivered world keeps. Delivery snapshots the player's real
 * installation loadout onto the record (the universe accumulates TRUTH, not
 * decoration); worlds from pre-v5 saves get a plausible loadout derived from
 * their biography. Both are deterministic, so the scene stays pure.
 */
import { mulberry } from './rng';
import type { AspectId } from './types';

/** The signature installation for each finishing bottleneck. */
export const ASPECT_HARDWARE: Record<AspectId, string> = {
  thermal: 'geoTap',
  atmo: 'atmoProcessor',
  hydro: 'hydroSeeder',
  bio: 'bioDome',
};

const SNAPSHOT_CAP = 8;

/**
 * The visible loadout recorded onto a world at delivery: owned installation
 * ids, most-built first (ties by id for determinism), capped so the record
 * stays small.
 */
export function snapshotInstallations(buildings: Record<string, number>): string[] {
  return Object.entries(buildings)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, SNAPSHOT_CAP)
    .map(([id]) => id);
}

const LEGACY_EXTRAS = ['orbitalMirror', 'atmoProcessor', 'hydroSeeder', 'geoTap', 'bioDome'];

/**
 * Pre-v5 worlds recorded no loadout. Derive the gear their biography
 * implies: every world began with a seed probe, the bottleneck names the
 * hardware that finished it, a filed survey means a lab stayed behind, and
 * the seed picks one house specialty.
 */
export function deriveLegacyInstallations(record: {
  seed: number;
  bottleneck: AspectId;
  survey: string | null;
}): string[] {
  const out = ['seedProbe', ASPECT_HARDWARE[record.bottleneck]];
  if (record.survey) out.push('researchLab');
  const r = mulberry((record.seed ^ 0x4a7d) >>> 0);
  const extra = LEGACY_EXTRAS[Math.floor(r() * LEGACY_EXTRAS.length)]!;
  if (!out.includes(extra)) out.push(extra);
  return out;
}
