/**
 * The Sub-Etha channel: generation, storage, and the one thing it does that
 * isn't flavour.
 *
 * Design notes worth keeping:
 *
 * - Broadcasts are generated **in the tick loop, online and offline alike**.
 *   Bubbles, events and Vogons are suppressed while you are away ("the
 *   universe waits for an audience") because they are rewards. The Sub-Etha
 *   is not a reward, it is a record — the Guide keeps filing whether or not
 *   anybody is listening, and coming back to read what happened is the whole
 *   point of the feature.
 * - Everything is drawn from the save's `subetha` rng stream, so a given
 *   universe produces a given feed, and any chunking of the same elapsed time
 *   produces the same log (engine law #1).
 * - The log is a ring buffer. An eight-hour absence at this cadence would
 *   otherwise file several hundred entries into localStorage.
 * - RUMOURS are load-bearing: a rumour names an undiscovered Deep Field
 *   landmark and roughly where it is, and a rumoured landmark is detectable
 *   at extended sensor range. Reading the feed is therefore worth something.
 */
import { C } from '../content/constants';
import {
  BROADCASTS,
  RUMOUR_LINES,
  pickFrom,
  type BroadcastTemplate,
  type SubEthaKind,
} from '../content/subEtha';
import { DEEP_FIELD_BY_ID } from '../content/deepField';
import { deepFieldSites } from './deepField';
import { LEAD_ODDS, maybeSpawnLead } from './leads';
import { rand } from './rng';
import type { GameState, SubEthaEntry, SubEthaState } from './types';

export function createSubEthaState(): SubEthaState {
  return { log: [], nextBroadcastMs: C.SUBETHA_FIRST_MS, recent: [] };
}

/** How many recent template ids to keep out of the running. */
const NO_REPEAT_WINDOW = 4;

// ————— Writing to the log —————

/**
 * Append an entry, trimming the oldest. Callers pass `site` only for
 * rumours; it is what makes the entry actionable.
 */
export function fileBroadcast(
  state: GameState,
  kind: SubEthaKind,
  text: string,
  site?: string,
): SubEthaEntry {
  const entry: SubEthaEntry = {
    id: state.timers.nextIdCounter++,
    atMs: state.gameTimeMs,
    kind,
    text,
  };
  if (site) entry.site = site;
  const log = state.subEtha.log;
  log.push(entry);
  if (log.length > C.SUBETHA_LOG_MAX) log.splice(0, log.length - C.SUBETHA_LOG_MAX);
  return entry;
}

// ————— Rumours —————

/**
 * Landmarks the feed has already pointed at, from the log itself.
 *
 * Cached on the log's identity: the helm asks for this every frame, and
 * rebuilding a Set sixty times a second was measurably enough garbage to
 * show up as GC hitches in flight (p99 50ms, worst frame 166ms).
 */
let rumourCache: { log: SubEthaEntry[]; length: number; lastId: number; set: Set<string> } | null =
  null;

export function rumouredSites(state: GameState): ReadonlySet<string> {
  const log = state.subEtha.log;
  const lastId = log.length > 0 ? log[log.length - 1]!.id : -1;
  if (
    rumourCache &&
    rumourCache.log === log &&
    rumourCache.length === log.length &&
    rumourCache.lastId === lastId
  ) {
    return rumourCache.set;
  }
  const set = new Set<string>();
  for (const entry of log) if (entry.site) set.add(entry.site);
  rumourCache = { log, length: log.length, lastId, set };
  return set;
}

export function isRumoured(state: GameState, id: string): boolean {
  for (const entry of state.subEtha.log) if (entry.site === id) return true;
  return false;
}

/** Shipping-lane bearing for a position. `-z` is coreward; `+x` is spinward. */
export function bearingOf(pos: readonly [number, number, number]): string {
  const [x, y, z] = pos;
  const horizontal = Math.abs(x) >= Math.abs(z)
    ? x >= 0
      ? 'spinward'
      : 'trailing'
    : z <= 0
      ? 'coreward'
      : 'rimward';
  const dist = Math.hypot(x, y, z) || 1;
  if (Math.abs(y) / dist > 0.34) return `${horizontal} and ${y > 0 ? 'high' : 'low'}`;
  return horizontal;
}

/**
 * A landmark worth gossiping about: not yet resolved, not already rumoured.
 * Returns null once the feed has nothing new to point at, which is the
 * correct end state — the sky has been talked through.
 */
function rumourCandidate(state: GameState, r: () => number): string | null {
  const already = rumouredSites(state);
  const pool: string[] = [];
  for (const site of deepFieldSites(state.seed)) {
    const id = site.def.id;
    if (state.expedition.discovered[id] !== undefined) continue;
    if (already.has(id)) continue;
    pool.push(id);
  }
  if (pool.length === 0) return null;
  return pickFrom(r, pool);
}

function rumourText(state: GameState, id: string, r: () => number): string | null {
  const def = DEEP_FIELD_BY_ID[id];
  const site = deepFieldSites(state.seed).find((s) => s.def.id === id);
  if (!def || !site) return null;
  const line = pickFrom(r, RUMOUR_LINES);
  return line(def.contact, bearingOf(site.pos), Math.round(Math.hypot(...site.pos)));
}

// ————— The ambient channel —————

/**
 * Templates that apply right now, minus anything the channel has just said.
 * The exclusion is dropped rather than enforced if it would empty the pool —
 * a fresh commission has very few eligible lines and silence is worse.
 */
function eligible(state: GameState): BroadcastTemplate[] {
  const applicable = BROADCASTS.filter((t) => !t.when || t.when(state));
  const fresh = applicable.filter((t) => !state.subEtha.recent.includes(t.id));
  return fresh.length > 0 ? fresh : applicable;
}

/**
 * Choose and file one ambient broadcast. Rumours are rolled first and at a
 * decent rate — they are the reason to read the channel — but only while
 * there is still something unfound to point at. Leads (Phase 5) roll ahead
 * of them, rarely: a rumour names a place, a lead starts a story.
 */
function broadcast(state: GameState): SubEthaEntry | null {
  const r = () => rand(state.rng, 'subetha');

  if (r() < LEAD_ODDS) {
    const lead = maybeSpawnLead(state, r);
    if (lead) return fileBroadcast(state, 'rumour', lead);
  }

  if (r() < C.SUBETHA_RUMOUR_ODDS) {
    const id = rumourCandidate(state, r);
    if (id) {
      const text = rumourText(state, id, r);
      if (text) return fileBroadcast(state, 'rumour', text, id);
    }
  }

  const pool = eligible(state);
  if (pool.length === 0) return null;
  const total = pool.reduce((a, t) => a + t.weight, 0);
  let roll = r() * total;
  let chosen = pool[pool.length - 1]!;
  for (const t of pool) {
    roll -= t.weight;
    if (roll <= 0) {
      chosen = t;
      break;
    }
  }
  const recent = state.subEtha.recent;
  recent.push(chosen.id);
  if (recent.length > NO_REPEAT_WINDOW) recent.splice(0, recent.length - NO_REPEAT_WINDOW);
  return fileBroadcast(state, chosen.kind, chosen.text(state, r));
}

/**
 * One tick of the channel. Called from the tick loop unconditionally — see
 * the note at the top about why this one does not stop while you are away.
 */
export function stepSubEtha(state: GameState): SubEthaEntry | null {
  state.subEtha.nextBroadcastMs -= C.LOGIC_TICK_MS;
  if (state.subEtha.nextBroadcastMs > 0) return null;
  const gap =
    C.SUBETHA_MIN_GAP_MS +
    rand(state.rng, 'subetha') * (C.SUBETHA_MAX_GAP_MS - C.SUBETHA_MIN_GAP_MS);
  state.subEtha.nextBroadcastMs = gap;
  return broadcast(state);
}
