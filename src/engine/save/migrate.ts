import { createOperationsState } from '../operations';
import { initRng } from '../rng';

/**
 * Ordered save migrations. Each entry upgrades `from` → `from + 1`.
 * Pure functions over the raw (pre-zod) object; each gets its own test.
 */

export interface Migration {
  from: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

const V2_TYPES = ['terrestrial', 'ice', 'desert', 'volcanic', 'ocean'] as const;
const TYPE_BOTTLENECK: Record<string, 'thermal' | 'atmo' | 'hydro' | 'bio'> = {
  terrestrial: 'thermal',
  ice: 'thermal',
  desert: 'hydro',
  volcanic: 'atmo',
  ocean: 'bio',
  gasgiant: 'atmo',
};

export const MIGRATIONS: readonly Migration[] = [
  {
    // v1 → v2: completed planets become persisted records (the visible
    // universe). v1 kept only counters, so the worlds themselves are gone —
    // we fabricate deterministic stand-ins to match the counter. The Guide
    // files this under "reclaimed from poor archiving".
    from: 1,
    migrate: (raw) => {
      const run = (raw['run'] ?? {}) as Record<string, unknown>;
      const count =
        typeof run['planetsCompleted'] === 'number' ? (run['planetsCompleted'] as number) : 0;
      const seed = typeof raw['seed'] === 'number' ? (raw['seed'] as number) : 1;
      const completedPlanets = Array.from({ length: count }, (_, i) => ({
        seed: ((seed ^ (i * 0x9e3779b9)) >>> 0) % 2 ** 31 || 1,
        type: V2_TYPES[i % V2_TYPES.length]!,
        size: 'medium' as const,
        name: `Reclaimed World ${i + 1}`,
      }));
      return { ...raw, run: { ...run, completedPlanets } };
    },
  },
  {
    // v2 -> v3: completed worlds retain a compact Guide biography. Older
    // saves cannot reconstruct choices or delivery times, so preserve the
    // known identity and mark genuinely unavailable history conservatively.
    from: 2,
    migrate: (raw) => {
      const run = (raw['run'] ?? {}) as Record<string, unknown>;
      const lifetime = (raw['lifetime'] ?? {}) as Record<string, unknown>;
      const planet = (raw['planet'] ?? {}) as Record<string, unknown>;
      const records: unknown[] = Array.isArray(run['completedPlanets'])
        ? run['completedPlanets']
        : [];
      const lifetimeTotal =
        typeof lifetime['planetsCompleted'] === 'number'
          ? Math.max(0, Math.floor(lifetime['planetsCompleted'] as number))
          : records.length;
      const firstLifetimeIndex = Math.max(1, lifetimeTotal - records.length + 1);
      const completedPlanets = records.map((entry, i) => {
        const p =
          typeof entry === 'object' && entry !== null
            ? (entry as Record<string, unknown>)
            : {};
        const type = typeof p['type'] === 'string' ? p['type'] : 'terrestrial';
        return {
          ...p,
          lifetimeIndex:
            typeof p['lifetimeIndex'] === 'number'
              ? p['lifetimeIndex']
              : firstLifetimeIndex + i,
          quirks: Array.isArray(p['quirks']) ? p['quirks'] : [],
          survey: typeof p['survey'] === 'string' ? p['survey'] : null,
          completionMs:
            typeof p['completionMs'] === 'number' && p['completionMs'] >= 0
              ? Math.floor(p['completionMs'])
              : 0,
          bottleneck:
            typeof p['bottleneck'] === 'string'
              ? p['bottleneck']
              : (TYPE_BOTTLENECK[type] ?? 'thermal'),
        };
      });
      const gameTimeMs =
        typeof raw['gameTimeMs'] === 'number' && raw['gameTimeMs'] >= 0
          ? raw['gameTimeMs']
          : 0;
      return {
        ...raw,
        planet: {
          ...planet,
          startedAtGameMs:
            typeof planet['startedAtGameMs'] === 'number'
              ? planet['startedAtGameMs']
              : gameTimeMs,
        },
        run: { ...run, completedPlanets },
      };
    },
  },
  {
    // v3 -> v4: Operations gains its own deterministic RNG stream and
    // persistent contract, dispatch, and heritage state.
    from: 3,
    migrate: (raw) => {
      const seed = typeof raw['seed'] === 'number' ? raw['seed'] : 1;
      const rng =
        typeof raw['rng'] === 'object' && raw['rng'] !== null
          ? (raw['rng'] as Record<string, unknown>)
          : {};
      return {
        ...raw,
        rng: {
          ...rng,
          contracts: typeof rng['contracts'] === 'number' ? rng['contracts'] : initRng(seed).contracts,
        },
        operations: createOperationsState(),
      };
    },
  },
];

export function runMigrations(raw: Record<string, unknown>): Record<string, unknown> {
  let current = raw;
  let version = typeof current['version'] === 'number' ? (current['version'] as number) : 1;
  for (const m of MIGRATIONS) {
    if (m.from === version) {
      current = m.migrate(current);
      version += 1;
      current['version'] = version;
    }
  }
  return current;
}
