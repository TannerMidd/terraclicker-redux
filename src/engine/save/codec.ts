import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { D, Decimal } from '../num';
import { ASPECTS, type AspectId, type GameState } from '../types';
import { saveSchema, type SaveShape } from './schema';
import { runMigrations } from './migrate';

const decOut = (d: Decimal): string => d.toString();

function cloneOperations(operations: GameState['operations']): GameState['operations'] {
  const cloneOffer = (offer: GameState['operations']['offers'][number]) => ({
    ...offer,
    objective: { ...offer.objective },
  });
  return {
    ...operations,
    offers: operations.offers.map(cloneOffer),
    active: operations.active
      ? {
          ...operations.active,
          offer: cloneOffer(operations.active.offer),
        }
      : null,
    completed: operations.completed.map((entry) => ({ ...entry })),
    reputation: { ...operations.reputation },
    systemSpecialties: { ...operations.systemSpecialties },
    heritageWorlds: operations.heritageWorlds.map((world) => ({
      ...world,
      quirks: [...world.quirks],
      installations: [...world.installations],
    })),
  };
}

function cloneExpedition(expedition: GameState['expedition']): GameState['expedition'] {
  return {
    discovered: { ...expedition.discovered },
    boarded: { ...expedition.boarded },
    salvage: expedition.salvage,
    refits: { ...expedition.refits },
    manifest: expedition.manifest ? { ...expedition.manifest } : null,
    jobs: expedition.jobs.map((j) => ({ ...j })),
    seams: { ...expedition.seams },
    rigs: Object.fromEntries(
      Object.entries(expedition.rigs).map(([k, v]) => [k, { ...v }]),
    ),
    interdictions: expedition.interdictions,
    deliveries: expedition.deliveries,
    nextJobMs: expedition.nextJobMs,
    pinned: expedition.pinned,
  };
}

function cloneMegaprojects(m: GameState['megaprojects']): GameState['megaprojects'] {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));
}

/** GameState → plain JSON-safe object (Decimals as strings). */
export function toSave(state: GameState): SaveShape {
  const aspects = (rec: Record<AspectId, Decimal>) => {
    const out = {} as Record<AspectId, string>;
    for (const a of ASPECTS) out[a] = decOut(rec[a]);
    return out;
  };
  return {
    ...state,
    tu: decOut(state.tu),
    science: decOut(state.science),
    planet: {
      ...state.planet,
      gauges: aspects(state.planet.gauges),
      targets: aspects(state.planet.targets),
    },
    run: {
      ...state.run,
      tuEarned: decOut(state.run.tuEarned),
      completedPlanets: state.run.completedPlanets.map((p) => ({ ...p })),
    },
    lifetime: { ...state.lifetime, tuEarned: decOut(state.lifetime.tuEarned) },
    buffs: state.buffs.map((b) => ({ ...b })),
    bubbles: state.bubbles.map((b) => ({ ...b })),
    activeEvents: state.activeEvents.map((e) => ({ ...e })),
    vogon: state.vogon
      ? { ...state.vogon, ships: state.vogon.ships.map((sh) => ({ ...sh })) }
      : null,
    buildings: { ...state.buildings },
    upgrades: { ...state.upgrades },
    achievements: { ...state.achievements },
    research: {
      completed: [...state.research.completed],
      active: state.research.active ? { ...state.research.active } : null,
    },
    prestige: { ...state.prestige, catalogue: { ...state.prestige.catalogue } },
    operations: cloneOperations(state.operations),
    expedition: cloneExpedition(state.expedition),
    subEtha: {
      log: state.subEtha.log.map((e) => ({ ...e })),
      nextBroadcastMs: state.subEtha.nextBroadcastMs,
      recent: [...state.subEtha.recent],
    },
    rng: { ...state.rng },
    timers: { ...state.timers },
    flags: { ...state.flags },
  };
}

/** Validated plain object → GameState (Decimals revived). */
export function fromSave(shape: SaveShape): GameState {
  const aspects = (rec: Record<AspectId, string>) => {
    const out = {} as Record<AspectId, Decimal>;
    for (const a of ASPECTS) out[a] = D(rec[a]);
    return out;
  };
  return {
    ...shape,
    tu: D(shape.tu),
    science: D(shape.science),
    planet: {
      ...shape.planet,
      gauges: aspects(shape.planet.gauges),
      targets: aspects(shape.planet.targets),
    },
    run: {
      ...shape.run,
      tuEarned: D(shape.run.tuEarned),
      standing: { ...shape.run.standing },
      petitions: shape.run.petitions.map((p) => ({ ...p })),
    },
    lifetime: { ...shape.lifetime, tuEarned: D(shape.lifetime.tuEarned) },
    situations: shape.situations.map((s2) => ({ ...s2 })),
    operations: cloneOperations(shape.operations),
    expedition: cloneExpedition(shape.expedition),
    megaprojects: cloneMegaprojects(shape.megaprojects),
    subEtha: {
      log: shape.subEtha.log.map((e) => ({ ...e })),
      nextBroadcastMs: shape.subEtha.nextBroadcastMs,
      recent: [...shape.subEtha.recent],
    },
  };
}

export interface LoadResult {
  ok: true;
  state: GameState;
}
export interface LoadError {
  ok: false;
  error: string;
}

/** Parse any untrusted raw object into a GameState, migrating as needed. */
export function parseSave(raw: unknown): LoadResult | LoadError {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'not an object' };
  const migrated = runMigrations(raw as Record<string, unknown>);
  const parsed = saveSchema.safeParse(migrated);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid save' };
  }
  return { ok: true, state: fromSave(parsed.data) };
}

/** JSON string codec for storage. */
export function serialize(state: GameState): string {
  return JSON.stringify(toSave(state));
}

export function deserialize(json: string): LoadResult | LoadError {
  try {
    return parseSave(JSON.parse(json));
  } catch {
    return { ok: false, error: 'unreadable save data' };
  }
}

/** "Share and Enjoy": compressed export string for the clipboard. */
export function exportSave(state: GameState): string {
  return 'TC2:' + compressToEncodedURIComponent(serialize(state));
}

export function importSave(text: string): LoadResult | LoadError {
  const trimmed = text.trim();
  if (!trimmed.startsWith('TC2:')) return { ok: false, error: 'not a TerraClicker export' };
  const json = decompressFromEncodedURIComponent(trimmed.slice(4));
  if (!json) return { ok: false, error: 'could not decompress' };
  return deserialize(json);
}
