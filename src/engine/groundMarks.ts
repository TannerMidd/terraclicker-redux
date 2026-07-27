/**
 * GroundMarks — the things you leave standing (Phase 5).
 *
 * A mark is a planet-space direction and a kind: beacon, station, shelter,
 * repair. The scene decides where the walker was pointing; this module
 * decides whether the mark may stand — certification, count, spacing, and
 * for repairs, the presence of an actual settlement to mend — and what the
 * record keeps. Directions, never landing coordinates: a landing frame is
 * not a coordinate system, and a mark must survive being approached from
 * any sky (EXPEDITIONS.md spine §3).
 *
 * Marks are the first Expansion-law-2 objects the ground produces: each one
 * writes a `WorldRecordEvent`, shows in the biography, and is visible from
 * orbit as a pin of light that was not there before you walked.
 */
import { MARK_CERT, markCertRefusal } from '../content/certifications';
import { recordCertFirst } from './certifications';
import { settlementRoster, settlementSpecOf } from './settlements';
import { recordWorldEvent } from './worldRecords';
import { raiseStanding } from './situations';
import type {
  GameState,
  GroundMark,
  GroundWorldRecord,
  PlanetSize,
  SimEffect,
} from './types';

// ————— Planet-space law —————

/**
 * Physical radius of a landed world by catalogue size, metres. Engine truth:
 * the surface renderer derives from THIS table (terrainField re-exports it),
 * because mark spacing and repair reach are ledger questions, not shader
 * questions.
 */
export const PLANET_RADIUS_BY_SIZE: Record<PlanetSize, number> = {
  small: 260_000,
  medium: 320_000,
  large: 380_000,
  huge: 440_000,
};

/** Marks one world will hold. Enough to matter; bounded so saves stay saves. */
export const MARKS_PER_WORLD_MAX = 10;
/** Two marks of one kind closer than this are one mark and a mistake. */
export const MARK_SPACING_M = 30;
/** A repair must stand within this of a settlement's heart. */
export const REPAIR_REACH_M = 160;
/** A standing station keeps the charts this far around itself (Survey II). */
export const STATION_CHART_M = 300;
/** Standing a repair restores, once per stay. Real, modest, recoverable-scale. */
export const REPAIR_STANDING = 0.08;
/** Standing a certified civic call pays, once per stay (Liaison II). */
export const CIVIC_CALL_STANDING = 0.03;

/** Great-circle distance between two unit directions, metres. */
export function markDistanceM(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  radiusM: number,
): number {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return radiusM * Math.acos(dot);
}

// ————— The world under the mark —————

export interface MarkWorldFacts {
  lifetimeIndex: number;
  seed: number;
  type: GameState['planet']['type'];
  size: PlanetSize;
  quirks: readonly string[];
  installations: readonly string[];
  /** Delivered (settlements exist) vs a commission still in progress. */
  completed: boolean;
}

/** What the engine knows about the world a key names, or null if unwalkable. */
export function markWorldFacts(state: GameState, worldKey: string): MarkWorldFacts | null {
  const lifetimeIndex = Number(worldKey.slice(1));
  if (!Number.isFinite(lifetimeIndex)) return null;
  if (state.planet.lifetimeIndex === lifetimeIndex) {
    const p = state.planet;
    return {
      lifetimeIndex,
      seed: p.seed,
      type: p.type,
      size: p.size,
      quirks: p.quirks,
      installations: [],
      completed: false,
    };
  }
  const record =
    state.run.completedPlanets.find((w) => w.lifetimeIndex === lifetimeIndex)
    ?? state.operations.heritageWorlds.find((w) => w.lifetimeIndex === lifetimeIndex);
  if (!record) return null;
  return {
    lifetimeIndex,
    seed: record.seed,
    type: record.type,
    size: record.size,
    quirks: record.quirks,
    installations: record.installations,
    completed: true,
  };
}

/** The settlement hearts a repair could mean, in planet space. */
export function repairSpots(facts: MarkWorldFacts): readonly [number, number, number][] {
  if (!facts.completed || facts.type === 'gasgiant') return [];
  return settlementRoster(
    settlementSpecOf({
      seed: facts.seed,
      type: facts.type,
      size: facts.size,
      lifetimeIndex: facts.lifetimeIndex,
      installations: facts.installations,
      quirks: facts.quirks,
    }),
  ).map((s) => s.dir);
}

// ————— Validation (pure; scene preflight and engine share it) —————

export type MarkVerdict = { ok: true } | { ok: false; why: string };

/**
 * May this mark stand? Pure over its arguments so the surface can refuse
 * with the same words the engine would. `existing` includes anything the
 * stay has already planted — spacing is judged against the world as it
 * will be, not as it was at landing.
 */
export function validateMark(
  certs: Readonly<Record<string, number>>,
  existing: readonly GroundMark[],
  facts: MarkWorldFacts,
  mark: { kind: GroundMark['kind']; dir: readonly [number, number, number] },
): MarkVerdict {
  const need = MARK_CERT[mark.kind];
  if ((certs[need.track] ?? 0) < need.rank) {
    return { ok: false, why: markCertRefusal(mark.kind) };
  }
  if (existing.length >= MARKS_PER_WORLD_MAX) {
    return { ok: false, why: 'this world holds all the marks the charter allows' };
  }
  const radiusM = PLANET_RADIUS_BY_SIZE[facts.size];
  for (const m of existing) {
    if (m.kind !== mark.kind) continue;
    if (markDistanceM(m.dir, mark.dir, radiusM) < MARK_SPACING_M) {
      return { ok: false, why: `a ${mark.kind} already stands here` };
    }
  }
  if (mark.kind === 'repair') {
    const spots = repairSpots(facts);
    let near: readonly [number, number, number] | null = null;
    for (const dir of spots) {
      if (markDistanceM(dir, mark.dir, radiusM) <= REPAIR_REACH_M) {
        near = dir;
        break;
      }
    }
    if (!near) return { ok: false, why: 'nothing here to mend — repairs belong to settlements' };
    // One repair per settlement, ever: mending the same mast twice is theatre.
    for (const m of existing) {
      if (m.kind !== 'repair') continue;
      if (markDistanceM(m.dir, near, radiusM) <= REPAIR_REACH_M) {
        return { ok: false, why: 'this settlement has already been mended' };
      }
    }
  }
  return { ok: true };
}

// ————— Recording —————

/**
 * File the marks a stay planted. Validates against LIVE state (the scene
 * preflights, the engine does not trust it), appends what stands, writes
 * the world's history, restores standing for the first repair, and records
 * the certification firsts. Returns the accepted marks.
 */
export function recordGroundMarks(
  state: GameState,
  effects: SimEffect[],
  worldKey: string,
  worldName: string,
  record: GroundWorldRecord,
  marks: readonly { kind: GroundMark['kind']; dir: [number, number, number] }[],
): GroundMark[] {
  if (marks.length === 0) return [];
  const facts = markWorldFacts(state, worldKey);
  if (!facts || facts.type === 'gasgiant') return [];

  const accepted: GroundMark[] = [];
  let repaired = false;
  for (const m of marks) {
    const verdict = validateMark(state.expedition.certs, record.marks, facts, m);
    if (!verdict.ok) continue;
    const standing: GroundMark = { kind: m.kind, dir: m.dir, atMs: state.gameTimeMs };
    record.marks.push(standing);
    accepted.push(standing);
    recordWorldEvent(state, facts.lifetimeIndex, {
      kind: m.kind === 'repair' ? 'repairMade' : 'markPlaced',
      id: m.kind,
      atGameMs: state.gameTimeMs,
    });
    effects.push({ t: 'markPlaced', worldKey, world: worldName, kind: m.kind });

    if (m.kind === 'repair' && !repaired) {
      repaired = true;
      raiseStanding(state, facts.lifetimeIndex, REPAIR_STANDING);
      recordCertFirst(state, effects, `liaison:repair:${worldKey}`);
    }
    if (m.kind === 'beacon') recordCertFirst(state, effects, `mobility:beacon:${worldKey}`);
    if (m.kind === 'station') recordCertFirst(state, effects, `survey:station:${worldKey}`);
  }
  return accepted;
}

/** Marks standing on a world, oldest first. Empty for a world never marked. */
export function marksOf(state: Pick<GameState, 'expedition'>, worldKey: string): readonly GroundMark[] {
  return state.expedition.groundWorlds[worldKey]?.marks ?? [];
}
