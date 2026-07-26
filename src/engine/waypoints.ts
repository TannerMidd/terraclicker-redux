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
import { currentManifestLeg, rigCapacity } from './freight';
import type { GameState, ManifestState } from './types';

export type WaypointKind =
  | 'home'
  | 'world'
  | 'system'
  | 'landmark'
  | 'seam'
  | 'rig'
  | 'job'
  | 'unscheduled';

/**
 * How the scene finds this thing. Deliberately structural: `focus` mirrors
 * `universeLayout.FocusRef` without importing it, `site` names something the
 * flight layer already seeds by id.
 */
export type WaypointRef =
  | { at: 'home' }
  | { at: 'focus'; kind: 'world' | 'system' | 'galaxy'; index: number }
  | { at: 'site'; id: string }
  /** A bare position — used by things that are derived rather than seeded. */
  | { at: 'point'; pos: readonly [number, number, number] };

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

export function manifestWaypointId(manifest: Pick<ManifestState, 'uid'>): string {
  return waypointId('job', manifest.uid);
}

/**
 * Everything addressable right now, in a stable order: home, the active
 * freight objective, this commission's worlds and systems, charted landmarks,
 * prospected seams, and rigs standing in the field.
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

  // Put the active objective before its underlying world so consumers that
  // match by label still select the stable job id. That one pin then advances
  // from collection to delivery without asking the pilot to pin it again.
  const leg = currentManifestLeg(state);
  if (leg) {
    const ref = worldRef(state, leg.targetLifetimeIndex);
    if (ref) {
      list.push({
        id: manifestWaypointId(leg.manifest),
        kind: 'job',
        label: leg.targetName,
        detail:
          leg.phase === 'collect'
            ? 'collect at origin · hold empty'
            : 'cargo aboard · deliver',
        ref,
        known: true,
      });
    }
  }

  // The id is keyed on lifetimeIndex, which is stable forever; the *ref* uses
  // the position within this commission, because that is what `focusSeat`
  // divides by PLANETS_PER_SYSTEM to find a world's parent system. The two
  // coincide only during run 1, which is precisely the kind of coincidence
  // that ships and then breaks on somebody's second commission.
  for (const [index, world] of state.run.completedPlanets.entries()) {
    list.push({
      id: waypointId('world', world.lifetimeIndex),
      kind: 'world',
      label: world.name,
      detail: `${world.type} · delivered`,
      ref: { at: 'focus', kind: 'world', index },
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
      const cap = rigCapacity(state.expedition, id);
      list.push({
        id: waypointId('rig', id),
        kind: 'rig',
        label: `${def.name} — rig`,
        detail: rig.banked >= cap
          ? 'full, waiting'
          : `${Math.floor((rig.banked / cap) * 100)}% full`,
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

  return list;
}

/** Resolve a stable lifetime id to this commission's local flight-layout index. */
function worldRef(state: GameState, lifetimeIndex: number): WaypointRef | null {
  if (lifetimeIndex <= 0) return { at: 'home' };
  const index = state.run.completedPlanets.findIndex(
    (world) => world.lifetimeIndex === lifetimeIndex,
  );
  if (index < 0) return null;
  return { at: 'focus', kind: 'world', index };
}

export function findWaypoint(state: GameState, id: string): Waypoint | null {
  return waypoints(state).find((w) => w.id === id) ?? null;
}

/**
 * The pinned waypoint, if it still exists. A completed job or removed rig can
 * leave a dangling pin; resolving through the live list means the cockpit
 * quietly forgets it rather than pointing at nothing.
 */
export function pinnedWaypoint(state: GameState): Waypoint | null {
  const id = state.expedition.pinned;
  return id === null ? null : findWaypoint(state, id);
}
