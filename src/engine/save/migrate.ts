/**
 * Ordered save migrations. Each entry upgrades `from` → `from + 1`.
 * Pure functions over the raw (pre-zod) object; each gets its own test.
 */

export interface Migration {
  from: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

const V2_TYPES = ['terrestrial', 'ice', 'desert', 'volcanic', 'ocean'] as const;

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
