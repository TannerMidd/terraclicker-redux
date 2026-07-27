import { createExpeditionState } from '../deepField';
import { createFreightState } from '../freight';
import { createSubEthaState } from '../subEtha';
import { createOperationsState } from '../operations';
import { createStandingOrders } from '../standingOrders';
import { initRng } from '../rng';
import { deriveLegacyInstallations } from '../worldHardware';
import { C } from '../../content/constants';

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
  {
    // v4 -> v5: delivered worlds keep their real installation loadout.
    // Older records predate the snapshot, so they receive the hardware their
    // biography implies (bottleneck rig, survey lab, one seeded specialty).
    from: 4,
    migrate: (raw) => {
      const ASPECTS = ['thermal', 'atmo', 'hydro', 'bio'] as const;
      const backfill = (entry: unknown): unknown => {
        if (typeof entry !== 'object' || entry === null) return entry;
        const p = entry as Record<string, unknown>;
        if (Array.isArray(p['installations'])) return p;
        const bottleneck = ASPECTS.includes(p['bottleneck'] as (typeof ASPECTS)[number])
          ? (p['bottleneck'] as (typeof ASPECTS)[number])
          : 'thermal';
        return {
          ...p,
          installations: deriveLegacyInstallations({
            seed: typeof p['seed'] === 'number' ? (p['seed'] as number) : 1,
            bottleneck,
            survey: typeof p['survey'] === 'string' ? (p['survey'] as string) : null,
          }),
        };
      };
      const run = (raw['run'] ?? {}) as Record<string, unknown>;
      const operations = (raw['operations'] ?? {}) as Record<string, unknown>;
      return {
        ...raw,
        run: {
          ...run,
          completedPlanets: Array.isArray(run['completedPlanets'])
            ? run['completedPlanets'].map(backfill)
            : [],
        },
        operations: {
          ...operations,
          heritageWorlds: Array.isArray(operations['heritageWorlds'])
            ? operations['heritageWorlds'].map(backfill)
            : [],
        },
      };
    },
  },
  {
    // v5 -> v6: the Deep Field opens. Placement is a pure function of the
    // master seed, so an existing universe gains its landmarks exactly where
    // they would always have been — nothing to reconstruct, only an empty
    // logbook to hand over. A save that somehow already carries one keeps it.
    from: 5,
    migrate: (raw) => {
      const existing = raw['expedition'];
      if (typeof existing === 'object' && existing !== null) {
        const e = existing as Record<string, unknown>;
        const rec = (v: unknown) =>
          typeof v === 'object' && v !== null ? (v as Record<string, number>) : {};
        return {
          ...raw,
          expedition: {
            discovered: rec(e['discovered']),
            boarded: rec(e['boarded']),
            salvage: typeof e['salvage'] === 'number' ? Math.max(0, e['salvage']) : 0,
            refits: rec(e['refits']),
          },
        };
      }
      return { ...raw, expedition: createExpeditionState() };
    },
  },
  {
    // v6 -> v7: the Sub-Etha opens. An existing universe gets its own
    // broadcast stream (derived from the master seed, so the feed it would
    // always have had) and an empty log — there is no honest way to invent a
    // history of things the channel never actually said.
    from: 6,
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
          subetha: typeof rng['subetha'] === 'number' ? rng['subetha'] : initRng(seed).subetha,
        },
        subEtha: createSubEthaState(),
      };
    },
  },
  {
    // v7 -> v8: situations replace the buff-only events. An existing universe
    // gets its own situations stream (from the master seed, so the sequence it
    // would always have had), no open situation, and — importantly — FULL
    // standing everywhere. Nobody is retroactively punished for neglecting
    // worlds during a version of the game that never asked them anything.
    from: 7,
    migrate: (raw) => {
      const seed = typeof raw['seed'] === 'number' ? raw['seed'] : 1;
      const rng =
        typeof raw['rng'] === 'object' && raw['rng'] !== null
          ? (raw['rng'] as Record<string, unknown>)
          : {};
      const run =
        typeof raw['run'] === 'object' && raw['run'] !== null
          ? (raw['run'] as Record<string, unknown>)
          : {};
      const lifetime =
        typeof raw['lifetime'] === 'object' && raw['lifetime'] !== null
          ? (raw['lifetime'] as Record<string, unknown>)
          : {};
      const timers =
        typeof raw['timers'] === 'object' && raw['timers'] !== null
          ? (raw['timers'] as Record<string, unknown>)
          : {};
      return {
        ...raw,
        rng: {
          ...rng,
          situations:
            typeof rng['situations'] === 'number' ? rng['situations'] : initRng(seed).situations,
        },
        run: { ...run, standing: {} },
        lifetime: { ...lifetime, situationsAnswered: 0, situationsIgnored: 0 },
        timers: {
          ...timers,
          nextSituationMs:
            typeof timers['nextSituationMs'] === 'number'
              ? timers['nextSituationMs']
              : C.SITUATION_FIRST_MIN_MS,
        },
        situations: [],
      };
    },
  },
  {
    // v8 -> v9: the expansion, in one bump (docs/EXPANSION.md). The flight
    // economy gains a hold, a board, seams and rigs; worlds gain a petition
    // queue; megaprojects get a home OUTSIDE `run`, because they survive
    // prestige. Everything arrives empty: seams are seeded from the master
    // seed and so were always where they are, but nothing was ever prospected,
    // carried or commissioned in a version that had none of it.
    from: 8,
    migrate: (raw) => {
      const seed = typeof raw['seed'] === 'number' ? raw['seed'] : 1;
      const obj = (k: string): Record<string, unknown> =>
        typeof raw[k] === 'object' && raw[k] !== null ? (raw[k] as Record<string, unknown>) : {};
      const rng = obj('rng');
      const expedition = obj('expedition');
      const timers = obj('timers');
      return {
        ...raw,
        rng: {
          ...rng,
          freight: typeof rng['freight'] === 'number' ? rng['freight'] : initRng(seed).freight,
        },
        run: { ...obj('run'), petitions: [] },
        lifetime: {
          ...obj('lifetime'),
          deliveries: 0,
          rigsPlaced: 0,
          megaprojectsBuilt: 0,
        },
        expedition: { ...expedition, ...createFreightState() },
        megaprojects: {},
        timers: {
          ...timers,
          nextPetitionMs:
            typeof timers['nextPetitionMs'] === 'number'
              ? timers['nextPetitionMs']
              : C.PETITION_MIN_GAP_MS,
        },
      };
    },
  },
  {
    // v9 → v10: worlds get a life after delivery (engine/worldRecords.ts).
    //
    // Records are reconstructed for every world this save can still see — the
    // current portfolio and the Heritage archive — because the delivery facts
    // traits are derived from are all present on those records already. Worlds
    // sold in earlier commissions are genuinely gone from the save and cannot
    // be recovered; they get no record rather than a fabricated one. The Guide
    // files this under "the archive begins today".
    //
    // Every reconstructed world starts with an empty history. Nothing has
    // happened to them yet as far as this system is concerned, which is true.
    from: 9,
    migrate: (raw) => {
      const obj = (k: string): Record<string, unknown> =>
        typeof raw[k] === 'object' && raw[k] !== null ? (raw[k] as Record<string, unknown>) : {};
      const run = obj('run');
      const operations = obj('operations');
      const arr = (v: unknown): Record<string, unknown>[] =>
        Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

      const commissionNumber = typeof run['number'] === 'number' ? (run['number'] as number) : 1;
      const worldRecords: Record<string, unknown> = {};

      const add = (world: Record<string, unknown>, commission: number) => {
        const lifetimeIndex = world['lifetimeIndex'];
        if (typeof lifetimeIndex !== 'number') return;
        const key = String(lifetimeIndex);
        if (worldRecords[key]) return;
        const installations = Array.isArray(world['installations']) ? world['installations'] : [];
        const quirks = Array.isArray(world['quirks']) ? world['quirks'] : [];
        worldRecords[key] = {
          lifetimeIndex,
          name: typeof world['name'] === 'string' ? world['name'] : `World ${lifetimeIndex}`,
          type: typeof world['type'] === 'string' ? world['type'] : 'terrestrial',
          bottleneck: typeof world['bottleneck'] === 'string' ? world['bottleneck'] : 'thermal',
          commissionNumber: commission,
          deliveredAtGameMs: 0,
          installationCount: installations.length,
          quirkCount: quirks.length,
          survey: typeof world['survey'] === 'string' ? world['survey'] : null,
          history: [],
        };
      };

      // Heritage first: it carries its own commissionNumber, which is better
      // information than the current run's.
      for (const world of arr(operations['heritageWorlds'])) {
        add(
          world,
          typeof world['commissionNumber'] === 'number'
            ? (world['commissionNumber'] as number)
            : commissionNumber,
        );
      }
      for (const world of arr(run['completedPlanets'])) add(world, commissionNumber);

      return { ...raw, worldRecords };
    },
  },
  {
    // v10 → v11: the helm can be pointed at something (engine/waypoints.ts).
    // Nobody has pinned anything yet, and a null pin is the resting state
    // rather than a missing value, so this is the whole migration.
    from: 10,
    migrate: (raw) => {
      const expedition =
        typeof raw['expedition'] === 'object' && raw['expedition'] !== null
          ? (raw['expedition'] as Record<string, unknown>)
          : {};
      return { ...raw, expedition: { ...expedition, pinned: null } };
    },
  },
  {
    // v11 → v12: the helm remembers where it has been, so course hold can be
    // offered for the commute and withheld for the discovery. Nobody has
    // arrived anywhere yet as far as this record is concerned, which is the
    // safe direction to be wrong in — it withholds a convenience rather than
    // handing out an autopilot to somewhere unseen.
    from: 11,
    migrate: (raw) => {
      const expedition =
        typeof raw['expedition'] === 'object' && raw['expedition'] !== null
          ? (raw['expedition'] as Record<string, unknown>)
          : {};
      return { ...raw, expedition: { ...expedition, visited: {} } };
    },
  },
  {
    // v12 → v13: a finished megaproject records WHEN it finished, in sim time.
    // Construction is credited in real elapsed time and ignores the offline
    // cap, so `startedAtMs + buildMs` never named that moment and the Morning
    // Circular could not tell a monument finished overnight from one that had
    // been standing for a week. Anything already done predates this record and
    // is marked 0 — long ago, and correctly not news.
    from: 12,
    migrate: (raw) => {
      const mega =
        typeof raw['megaprojects'] === 'object' && raw['megaprojects'] !== null
          ? (raw['megaprojects'] as Record<string, Record<string, unknown>>)
          : {};
      const out: Record<string, unknown> = {};
      for (const [id, m] of Object.entries(mega)) {
        out[id] = { ...m, doneAtMs: m['done'] === true ? 0 : null };
      }
      return { ...raw, megaprojects: out };
    },
  },
  {
    // v13 → v14: Standing Orders. Everything arrives off. Automation is a
    // thing the player writes down, and an existing save has written nothing
    // down yet — switching any of it on for them would be the automation
    // playing the game, which is the exact failure this system is shaped to
    // avoid.
    from: 13,
    migrate: (raw) => ({ ...raw, standingOrders: createStandingOrders() }),
  },
  {
    // v14 → v15: Commission Dossiers. A commission already under way was never
    // briefed, so it keeps running unbriefed — every dossier effect is
    // multiplicative-by-1 with no brief in force, so an existing run continues
    // exactly as it was. The next appraisal files three.
    from: 14,
    migrate: (raw) => {
      const run =
        typeof raw['run'] === 'object' && raw['run'] !== null
          ? (raw['run'] as Record<string, unknown>)
          : {};
      return { ...raw, run: { ...run, dossier: null, dossierOffers: [] } };
    },
  },
  {
    // v15 → v16: System Charters. Systems already formed were never offered
    // articles and do not get them retroactively — a Charter is read from what
    // happened to five worlds while they were being delivered, and for these
    // that moment has passed. The next system to form gets the choice.
    from: 15,
    migrate: (raw) => {
      const run =
        typeof raw['run'] === 'object' && raw['run'] !== null
          ? (raw['run'] as Record<string, unknown>)
          : {};
      return { ...raw, run: { ...run, charters: {}, charterOffers: {} } };
    },
  },
  {
    // v16 → v17: megaproject programmes. A project already under way keeps its
    // construction time exactly — phases divide buildMs rather than extending
    // it — and its already-passed phases simply show up as open questions to
    // answer, which is the correct outcome: the crew got on with it and would
    // now like a decision.
    from: 16,
    migrate: (raw) => ({ ...raw, programmes: {} }),
  },
  {
    // v17 → v18: cargo is collected physically. A job already in the hold was
    // accepted under the old rules and is treated as collected — retroactively
    // emptying somebody's hold mid-run would be a worse kind of honest.
    from: 17,
    migrate: (raw) => {
      const exp =
        typeof raw['expedition'] === 'object' && raw['expedition'] !== null
          ? (raw['expedition'] as Record<string, unknown>)
          : {};
      const manifest = exp['manifest'];
      if (typeof manifest !== 'object' || manifest === null) return raw;
      return {
        ...raw,
        expedition: {
          ...exp,
          manifest: {
            ...(manifest as Record<string, unknown>),
            pickedUpAtMs: (manifest as Record<string, unknown>)['acceptedAtMs'] ?? 0,
          },
        },
      };
    },
  },
  {
    // v18 → v19: the Unscheduled Objects Register. The objects themselves are
    // derived from the seed and the commission number and are therefore
    // already out there; all that is needed is somewhere to record which have
    // been looked into, and nobody has looked into any yet.
    from: 18,
    migrate: (raw) => {
      const exp =
        typeof raw['expedition'] === 'object' && raw['expedition'] !== null
          ? (raw['expedition'] as Record<string, unknown>)
          : {};
      return { ...raw, expedition: { ...exp, unscheduled: {} } };
    },
  },
  {
    // v19 → v20: ship roles and salvage-built infrastructure. Everyone starts
    // on General Duties with nothing standing, which is exactly the ship they
    // already had — a role is a configuration over the refits, so this changes
    // nothing about an existing runabout until somebody chooses otherwise.
    from: 19,
    migrate: (raw) => {
      const exp =
        typeof raw['expedition'] === 'object' && raw['expedition'] !== null
          ? (raw['expedition'] as Record<string, unknown>)
          : {};
      return { ...raw, expedition: { ...exp, role: 'general', infrastructure: {} } };
    },
  },
  {
    // v20 → v21: universe statutes. Nothing has been legislated in any
    // existing universe, and a statute is chosen rather than granted — handing
    // somebody a law they did not vote for would be exactly the wrong joke.
    from: 20,
    migrate: (raw) => {
      const lifetime =
        typeof raw['lifetime'] === 'object' && raw['lifetime'] !== null
          ? (raw['lifetime'] as Record<string, unknown>)
          : {};
      return { ...raw, lifetime: { ...lifetime, statutes: [] } };
    },
  },
  {
    // v21 → v22: the ground-survey ledger. Nobody has stood on anything yet.
    from: 21,
    migrate: (raw) => {
      const exp =
        typeof raw['expedition'] === 'object' && raw['expedition'] !== null
          ? (raw['expedition'] as Record<string, unknown>)
          : {};
      return { ...raw, expedition: { ...exp, ground: {} } };
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
