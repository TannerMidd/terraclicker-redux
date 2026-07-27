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
import {
  SITUATION_BY_ID,
  fillSituationText,
  type GroundObjectiveDef,
  type SituationDef,
} from '../content/situations';
import { PETITION_BY_ID } from '../content/petitions';
import { recordWorldEvent } from './worldRecords';
import { waypointId } from './waypoints';
import { recordCertFirst } from './certifications';
import { REGION_CROSSING_M } from './atmoflight';
import { C } from '../content/constants';
import type { GameState, SampleHaul, SimEffect } from './types';

/** Salvage paid for attending to something in person. */
export const ATTENDANCE_SALVAGE = 12;
/**
 * Salvage for answering a request with actual fieldwork (Phase 5). More than
 * showing up, because it is more than showing up; still salvage and salvage
 * only, because the seal does not bend for good deeds.
 */
export const GROUND_MISSION_SALVAGE = 18;

/** The def behind an open request, whichever queue it lives in. */
export function requestDef(id: string): SituationDef | undefined {
  return SITUATION_BY_ID[id] ?? PETITION_BY_ID[id];
}

/** Anything open that names a world you could actually fly to. */
export function attendable(state: GameState): { uid: number; world: number; name: string }[] {
  const out: { uid: number; world: number; name: string }[] = [];
  for (const inst of [...state.situations, ...state.run.petitions]) {
    if (!inst.world) continue;
    out.push({ uid: inst.uid, world: inst.world, name: inst.worldName });
  }
  return out;
}

/**
 * The open requests naming one particular world, with their titles resolved —
 * what a shore party stepping onto that world ought to know about. Feeds the
 * groundfall session so the surface can eventually answer them in person.
 */
export function openRequestsAt(
  state: GameState,
  lifetimeIndex: number,
): { uid: number; id: string; name: string }[] {
  const out: { uid: number; id: string; name: string }[] = [];
  for (const inst of [...state.situations, ...state.run.petitions]) {
    if (inst.world !== lifetimeIndex) continue;
    const def = SITUATION_BY_ID[inst.id] ?? PETITION_BY_ID[inst.id];
    out.push({ uid: inst.uid, id: inst.id, name: def?.name ?? inst.id });
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

  const list = state.situations.some((s) => s.uid === uid)
    ? state.situations
    : state.run.petitions;
  const idx = list.findIndex((s) => s.uid === uid);
  if (idx < 0) return false;
  const inst = list[idx]!;
  const def = requestDef(inst.id);
  if (!def) return false;
  // A request with a ground objective is not answered by parking over it —
  // the work is DOWN THERE, and orbit is merely the queue for it.
  if (def.ground) return false;

  const visitedAt = state.expedition.visited[waypointId('world', match.world)];
  const openedAt = state.gameTimeMs - Math.max(0, def.windowMs - inst.remainingMs);
  if (visitedAt === undefined || visitedAt < openedAt) return false;

  list.splice(idx, 1);
  state.lifetime.situationsAnswered += 1;

  // Standing: exactly what attending at the desk would have paid. The reward
  // for flying is not a bigger number.
  payStandingBest(state, def, match.world);

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

/** The desk's best standing offer, paid in full. Never a bigger number. */
function payStandingBest(state: GameState, def: SituationDef, world: number): void {
  const best = def.options.reduce((a, o) => Math.max(a, o.outcome.standing ?? 0), 0);
  if (best <= 0 || world <= 0) return;
  const key = String(world);
  const current = state.run.standing[key];
  const next = Math.min(1, (typeof current === 'number' ? current : 1) + best);
  if (next >= 1) delete state.run.standing[key];
  else state.run.standing[key] = next;
}

// ————— The surface resolution (Phase 5) —————

/**
 * What one stay can testify to, in the engine's own terms — assembled by the
 * banking path from things it verified itself, never passed through raw from
 * the scene. `delivered` is the odd one out: it arrives from the freight
 * path, because logistics is answered at the docks rather than on foot.
 */
export interface GroundWorkEvidence {
  lifetimeIndex: number;
  surveyCredit: number;
  haul: readonly SampleHaul[];
  species: readonly string[];
  landmarks: readonly string[];
  civic: boolean;
  weathered: readonly string[];
  /** Mark kinds that actually stood (post-validation). */
  markKinds: readonly string[];
  repaired: boolean;
  delivered?: boolean;
  /** Sites, landmarks and towns the belly sweep charted from the air. */
  charted?: number;
  /** Furthest the stay got from its first pad, metres. */
  rangeM?: number;
}

/** Evidence for the freight path: a manifest arrived at this world's docks. */
export function deliveryEvidence(lifetimeIndex: number): GroundWorkEvidence {
  return {
    lifetimeIndex,
    surveyCredit: 0,
    haul: [],
    species: [],
    landmarks: [],
    civic: false,
    weathered: [],
    markKinds: [],
    repaired: false,
    delivered: true,
  };
}

/** Does the banked stay satisfy this objective? Pure. */
export function groundObjectiveMet(
  def: GroundObjectiveDef,
  ev: GroundWorkEvidence,
): boolean {
  switch (def.kind) {
    case 'survey':
      return ev.surveyCredit >= (def.n ?? C.GROUND_SURVEY_SAMPLES);
    case 'species':
      return ev.species.length >= (def.n ?? 1);
    case 'sample': {
      if (!def.what) return false;
      let n = 0;
      for (const h of ev.haul) if (h.kind === def.what) n += h.n;
      return n >= (def.n ?? 1);
    }
    case 'landmark':
      return def.what ? ev.landmarks.includes(def.what) : ev.landmarks.length > 0;
    case 'civic':
      return ev.civic;
    case 'weather':
      return def.what ? ev.weathered.includes(def.what) : ev.weathered.length > 0;
    case 'repair':
      return ev.repaired;
    case 'beacon':
      return ev.markKinds.includes('beacon');
    case 'logistics':
      return ev.delivered === true;
    case 'overflight':
      return (ev.charted ?? 0) >= (def.n ?? 12);
    case 'range':
      return (ev.rangeM ?? 0) >= (def.n ?? REGION_CROSSING_M);
  }
}

/**
 * Settle every open request this stay's work answers. The bridge's law
 * holds: the desk's best standing, salvage the desk cannot mint, and a
 * history line that says you came — plus the objective's own report, which
 * is the sentence the whole trip was for.
 */
export function resolveGroundRequests(
  state: GameState,
  effects: SimEffect[],
  ev: GroundWorkEvidence,
): number {
  let resolved = 0;
  for (const list of [state.situations, state.run.petitions]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const inst = list[i]!;
      if (inst.world !== ev.lifetimeIndex) continue;
      const def = requestDef(inst.id);
      if (!def?.ground) continue;
      if (!groundObjectiveMet(def.ground, ev)) continue;

      list.splice(i, 1);
      resolved++;
      state.lifetime.situationsAnswered += 1;
      payStandingBest(state, def, inst.world);
      state.expedition.salvage += GROUND_MISSION_SALVAGE;
      recordWorldEvent(state, inst.world, {
        kind: 'visited',
        id: inst.id,
        atGameMs: state.gameTimeMs,
      });
      recordWorldEvent(state, inst.world, {
        kind: 'petitionAnswered',
        id: inst.id,
        atGameMs: state.gameTimeMs,
      });
      recordCertFirst(state, effects, `liaison:answered:${inst.id}`);
      const best = def.options.reduce((a, o) => Math.max(a, o.outcome.standing ?? 0), 0);
      effects.push({
        t: 'situationResolved',
        uid: inst.uid,
        id: inst.id,
        text: fillSituationText(def.ground.text, inst.worldName),
        world: inst.worldName,
        standing: best,
      });
    }
  }
  return resolved;
}
