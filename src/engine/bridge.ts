/**
 * The bridge between the desk and the helm.
 *
 * A world writes asking for something. Today the only answer is at the desk:
 * spend TU, spend Science, or let it lapse. But the world is a real place with
 * real coordinates, and the ship is parked outside — so "take it there
 * yourself" ought to be an answer, and it is the one that makes the two halves
 * of the game one game.
 *
 * ## The law this obeys (ROADMAP law 4)
 *
 * **Flight pays in what the desk cannot buy.** Not parity — parity would be
 * worse than nothing. If flying a petition paid the same standing as paying
 * for it, then flying costs ten times the real time for the same result and
 * nobody flies twice; and if it paid *more*, the idle game becomes a chore you
 * do between flights. So personal attention pays:
 *
 *   - the same standing the desk would have paid, and
 *   - salvage, which the desk can never produce, and
 *   - a line in that world's history that says you came.
 *
 * The last one is the actual reward and the reason this exists. A world that
 * was paid for and a world that was visited are different places afterwards,
 * and the Office of Subsequent Consequences knows the difference.
 *
 * The sealed economy is untouched: this hands out salvage, never TU.
 */
import { SITUATION_BY_ID } from '../content/situations';
import { PETITION_BY_ID } from '../content/petitions';
import { recordWorldEvent } from './worldRecords';
import { waypointId } from './waypoints';
import type { GameState, SimEffect } from './types';

/** Salvage paid for attending to something in person. */
export const ATTENDANCE_SALVAGE = 12;

/** Anything open that names a world you could actually fly to. */
export function attendable(state: GameState): { uid: number; world: number; name: string }[] {
  const out: { uid: number; world: number; name: string }[] = [];
  for (const inst of [...state.situations, ...state.run.petitions]) {
    if (!inst.world) continue;
    out.push({ uid: inst.uid, world: inst.world, name: inst.worldName });
  }
  return out;
}

/** Is the helm currently pointed at the world this request came from? */
export function pinnedAtRequest(state: GameState, uid: number): boolean {
  const match = attendable(state).find((a) => a.uid === uid);
  if (!match) return false;
  return state.expedition.pinned === waypointId('world', match.world);
}

/**
 * Resolve a request by having gone there.
 *
 * Requires that the world has actually been visited — the same `visited`
 * record course-hold uses. You cannot attend to somewhere in person from the
 * desk, which is the entire distinction being drawn.
 */
export function attendInPerson(
  state: GameState,
  effects: SimEffect[],
  uid: number,
): boolean {
  const match = attendable(state).find((a) => a.uid === uid);
  if (!match) return false;
  if (state.expedition.visited[waypointId('world', match.world)] === undefined) return false;

  const list = state.situations.some((s) => s.uid === uid)
    ? state.situations
    : state.run.petitions;
  const idx = list.findIndex((s) => s.uid === uid);
  if (idx < 0) return false;
  const inst = list[idx]!;
  const def = SITUATION_BY_ID[inst.id] ?? PETITION_BY_ID[inst.id];
  if (!def) return false;

  list.splice(idx, 1);
  state.lifetime.situationsAnswered += 1;

  // Standing: exactly what attending at the desk would have paid. The reward
  // for flying is not a bigger number.
  const best = def.options.reduce(
    (a, o) => Math.max(a, o.outcome.standing ?? 0),
    0,
  );
  if (best > 0) {
    const key = String(match.world);
    const current = state.run.standing[key];
    const next = Math.min(1, (typeof current === 'number' ? current : 1) + best);
    if (next >= 1) delete state.run.standing[key];
    else state.run.standing[key] = next;
  }

  // Salvage: something the desk cannot produce at any price.
  state.expedition.salvage += ATTENDANCE_SALVAGE;

  // And the part that actually matters — the world remembers that you came.
  recordWorldEvent(state, match.world, {
    kind: 'visited',
    id: inst.id,
    atGameMs: state.gameTimeMs,
  });
  recordWorldEvent(state, match.world, {
    kind: 'petitionAnswered',
    id: inst.id,
    atGameMs: state.gameTimeMs,
  });

  effects.push({ t: 'attendedInPerson', world: match.name, id: inst.id });
  return true;
}
