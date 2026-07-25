/**
 * The waypoint registry — one addressable list of everywhere you could go.
 *
 * The cockpit currently tells you a destination name and the five nearest
 * contacts, and nothing else: no bearing, no distance, no route, no way to say
 * "that one" about a world that just wrote to you. Every spatial feature still
 * to be built needs the same missing thing — a way to name a place and hand it
 * to the helm. The nav chart, fly-there petitions, procedurally generated
 * contacts, salvage-built buoys and depots, lanes worn in by repeated flight,
 * and the Morning Circular's deep links are six different features that are
 * all, underneath, this list.
 *
 * So the registry is built before the chart that displays it, and everything
 * spatial registers here rather than inventing its own addressing.
 *
 * ## Engine, not scene
 *
 * This module resolves *what* is addressable, never *where* it is in world
 * space. A `WaypointRef` is a structural description — a focus target, a
 * landmark site, the home planet — and the scene turns it into a position via
 * `universeLayout`. That split keeps the registry testable headlessly and stops
 * the engine importing the renderer, which is the direction dependencies are
 * not allowed to run.
 *
 * Enumeration is a pure function of state: same universe, same list, same
 * order (engine law #1). Nothing here consumes rng.
 */
import { DEEP_FIELD_BY_ID } from '../content/deepField';
import { SEAM_BY_ID } from '../content/freight';
import { C } from '../content/constants';
import type { GameState } from './types';

export type WaypointKind =
  | 'home'
  | 'world'
  | 'system'
  | 'landmark'
  | 'seam'
  | 'rig'
  | 'job';

/**
 * How the scene finds this thing. Deliberately structural: `focus` mirrors
 * `universeLayout.FocusRef` without importing it, `site` names something the
 * flight layer already seeds by id.
 */
export type WaypointRef =
  | { at: 'home' }
  | { at: 'focus'; kind: 'world' | 'system' | 'galaxy'; index: number }
  | { at: 'site'; id: string };

export interface Waypoint {
  /** Stable and unique across kinds: `world:42`, `landmark:sofa`, `job:17`. */
  id: string;
  kind: WaypointKind;
  label: string;
  /** The second line: what it is, or why it is on the chart today. */
  detail: string;
  ref: WaypointRef;
  /** False for a landmark that is charted but not yet scanned. */
  known: boolean;
}

export function waypointId(kind: WaypointKind, key: string | number): string {
  return `${kind}:${key}`;
}

/**
 * Everything addressable right now, in a stable order: home, the worlds of
 * this commission, their systems, charted landmarks, prospected seams, rigs
 * standing in the field, and whatever the job board is currently offering.
 */
export function waypoints(state: GameState): Waypoint[] {
  const list: Waypoint[] = [];

  list.push({
    id: waypointId('home', 'planet'),
    kind: 'home',
    label: state.planet.name,
    detail: 'the commission in hand',
    ref: { at: 'home' },
    known: true,
  });

  for (const world of state.run.completedPlanets) {
    list.push({
      id: waypointId('world', world.lifetimeIndex),
      kind: 'world',
      label: world.name,
      detail: `${world.type} · delivered`,
      ref: { at: 'focus', kind: 'world', index: world.lifetimeIndex - 1 },
      known: true,
    });
  }

  for (let i = 0; i < state.run.systems; i++) {
    list.push({
      id: waypointId('system', i),
      kind: 'system',
      label: `System ${i + 1}`,
      detail: `${C.PLANETS_PER_SYSTEM} worlds`,
      ref: { at: 'focus', kind: 'system', index: i },
      known: true,
    });
  }

  for (const id of Object.keys(state.expedition.discovered)) {
    const def = DEEP_FIELD_BY_ID[id];
    if (!def) continue;
    list.push({
      id: waypointId('landmark', id),
      kind: 'landmark',
      label: def.name,
      detail: state.expedition.boarded[id] !== undefined ? 'boarded' : def.contact,
      ref: { at: 'site', id },
      known: true,
    });
  }

  for (const id of Object.keys(state.expedition.seams)) {
    const def = SEAM_BY_ID[id];
    if (!def) continue;
    const rig = state.expedition.rigs[id];
    if (rig) {
      list.push({
        id: waypointId('rig', id),
        kind: 'rig',
        label: `${def.name} — rig`,
        detail: rig.banked >= def.cap
          ? 'full, waiting'
          : `${Math.floor((rig.banked / def.cap) * 100)}% full`,
        ref: { at: 'site', id },
        known: true,
      });
    } else {
      list.push({
        id: waypointId('seam', id),
        kind: 'seam',
        label: def.name,
        detail: 'prospected · no rig',
        ref: { at: 'site', id },
        known: true,
      });
    }
  }

  const manifest = state.expedition.manifest;
  if (manifest) {
    list.push({
      id: waypointId('job', manifest.uid),
      kind: 'job',
      label: manifest.toName,
      detail: 'in the hold — deliver',
      ref: worldRef(manifest.to),
      known: true,
    });
  }
  for (const job of state.expedition.jobs) {
    list.push({
      id: waypointId('job', job.uid),
      kind: 'job',
      label: `${job.fromName} → ${job.toName}`,
      detail: 'offered',
      ref: worldRef(job.from),
      known: true,
    });
  }

  return list;
}

/** A world lifetimeIndex as the flight layer means it — 0 is the home planet. */
function worldRef(lifetimeIndex: number): WaypointRef {
  if (lifetimeIndex <= 0) return { at: 'home' };
  return { at: 'focus', kind: 'world', index: lifetimeIndex - 1 };
}

export function findWaypoint(state: GameState, id: string): Waypoint | null {
  return waypoints(state).find((w) => w.id === id) ?? null;
}

/**
 * The pinned waypoint, if it still exists. A job that expired or a rig that
 * was collected leaves a dangling pin; resolving through the live list means
 * the cockpit quietly forgets it rather than pointing at nothing.
 */
export function pinnedWaypoint(state: GameState): Waypoint | null {
  const id = state.expedition.pinned;
  return id === null ? null : findWaypoint(state, id);
}
