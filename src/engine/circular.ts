/**
 * The Morning Circular — what happened while you were away, and what it wants.
 *
 * The return report predates most of the game. It reports TU, science, worlds,
 * research, contracts and achievements, which was the whole game when it was
 * written and is now about half of it. It says nothing about the monument that
 * finished overnight, the rig that filled and is now sitting there full, the
 * rumour the channel picked up, or the two worlds that have written and are
 * waiting for an answer — which are, between them, most of the reasons to come
 * back.
 *
 * So this is the read-model over everything Phase 0 and Phase 1 built: the
 * deferred-work queue, the world record store, the waypoint registry. It
 * derives; it never stores. A briefing that needed its own save state would be
 * a briefing that could disagree with the thing it was briefing about.
 *
 * Order is deliberate and is the joke: the Circular reports in the order
 * Accounts considers appropriate, which is finished things first, then things
 * that are full, then things that want something, then rumour. It has declined
 * to itemise its reasoning.
 */
import { MEGAPROJECT_BY_ID } from '../content/megaprojects';
import { SEAM_BY_ID } from '../content/freight';
import { SITUATION_BY_ID } from '../content/situations';
import { rigCapacity } from './freight';
import { waypointId } from './waypoints';
import { openPhases } from './programmes';
import type { GameState } from './types';

export type CircularKind = 'built' | 'full' | 'asking' | 'rumour' | 'building';

export interface CircularItem {
  kind: CircularKind;
  text: string;
  /** Panel to open, if this is answerable at the desk. */
  panel?: 'Operations' | 'Chart' | 'Magrathea' | 'Guide';
  /** Waypoint to pin, if this is answerable by going there. */
  waypoint?: string;
}

/**
 * Build the briefing. Pure over state — call it whenever, get the same list.
 *
 * `sinceMs` scopes "new": pass the game time the player last saw the briefing.
 * Anything already resolved at that instant is known, and is not news.
 */
export function buildCircular(state: GameState, sinceMs: number): CircularItem[] {
  const items: CircularItem[] = [];

  // 1. Finished monuments. The whole point of being away.
  for (const [id, m] of Object.entries(state.megaprojects)) {
    const def = MEGAPROJECT_BY_ID[id];
    if (!def || !m.done) continue;
    // `<=`, not `<`. Deferred work is credited after the sim loop, so a
    // monument that completes during an absence is stamped with the instant
    // that absence ENDED — which is exactly the moment the player next leaves.
    // Strict `<` would report it a second time, every time.
    if (m.doneAtMs === null || m.doneAtMs <= sinceMs) continue;
    items.push({
      kind: 'built',
      text: `${def.name} is finished, and is now legally taller than it was.`,
      panel: 'Operations',
    });
  }

  // 2. Still building, with something honest about how far along.
  for (const [id, m] of Object.entries(state.megaprojects)) {
    const def = MEGAPROJECT_BY_ID[id];
    if (!def || m.done) continue;
    const pct = Math.floor((m.builtMs / def.buildMs) * 100);
    items.push({
      kind: 'building',
      text: `${def.name} stands at ${pct}%. The crew report no difficulties worth the form.`,
      panel: 'Operations',
    });
  }

  // 2b. Programmes waiting on a decision. The crew carried on without you and
  //     would now like an answer; this is the thing most worth coming back for.
  for (const open of openPhases(state)) {
    const def = MEGAPROJECT_BY_ID[open.id];
    items.push({
      kind: 'asking',
      text: `${def?.name ?? open.id}: ${open.phase.name} is standing, and the crew want a decision.`,
      panel: 'Operations',
    });
  }

  // 3. Rigs that filled and stopped. A full rig is a reason to fly.
  for (const [id, rig] of Object.entries(state.expedition.rigs)) {
    const def = SEAM_BY_ID[id];
    if (!def || rig.banked < rigCapacity(state.expedition, id)) continue;
    items.push({
      kind: 'full',
      text: `The rig on ${def.name} is full and has stopped, politely, mid-shift.`,
      waypoint: waypointId('rig', id),
    });
  }

  // 4. Worlds waiting on an answer. These are people, and they go above rumour.
  for (const petition of state.run.petitions) {
    const def = SITUATION_BY_ID[petition.id];
    const who = petition.worldName || 'A world';
    items.push({
      kind: 'asking',
      text: `${who} has written${def ? ` about ${def.name.toLowerCase()}` : ''}, and is waiting.`,
      waypoint: petition.world ? waypointId('world', petition.world) : undefined,
    });
  }

  // 5. Rumour, last, as rumour should be.
  for (const entry of state.subEtha.log) {
    if (entry.kind !== 'rumour' || entry.atMs < sinceMs) continue;
    items.push({ kind: 'rumour', text: entry.text, panel: 'Guide' });
  }

  return items;
}

/**
 * The opening line. Counts what is actually in the list rather than promising
 * a shape the list may not have — a briefing that says "two worlds wrote" when
 * none did is worse than no briefing.
 */
export function circularSummary(items: readonly CircularItem[]): string {
  if (items.length === 0) {
    return 'Nothing happened that Accounts is prepared to describe as an event.';
  }
  const n = (kind: CircularKind) => items.filter((i) => i.kind === kind).length;
  const parts: string[] = [];
  const built = n('built');
  const full = n('full');
  const asking = n('asking');
  const rumour = n('rumour');

  if (built > 0) parts.push(built === 1 ? 'a monument finished' : `${built} monuments finished`);
  if (full > 0) parts.push(full === 1 ? 'a rig filled' : `${full} rigs filled`);
  if (asking > 0) parts.push(asking === 1 ? 'one world wrote' : `${asking} worlds wrote`);
  if (rumour > 0) parts.push(rumour === 1 ? 'a rumour arrived' : `${rumour} rumours arrived`);

  if (parts.length === 0) return 'Work continues. The Circular has nothing to add.';
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `During your absence, ${list}. Accounts recommends dealing with them in that order, for reasons it has declined to itemise.`;
}
