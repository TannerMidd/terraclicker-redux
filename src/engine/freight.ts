/**
 * The flight economy: the hold, the board, and the rigs.
 *
 * Everything here is denominated in salvage and stays there. Nothing in this
 * file reads or writes TU, Science, aspects or planet progress, and nothing
 * in the idle game spends salvage — the seal described in docs/EXPANSION.md
 * and in content/refit.ts is the oldest rule this layer has, and it is what
 * lets a player ignore flight entirely without falling behind.
 *
 * Two things here run while you are away, and both are deliberate:
 *
 *   RIGS accrue. A rig is a structure you left behind precisely so it would
 *   work without you; making it idle while the tab is shut would defeat the
 *   only reason to place one. It banks up to a cap, so an absence is
 *   rewarded but a long absence is not infinitely rewarded, and collecting
 *   still means going back out there.
 *
 *   JOB OFFERS expire. The board is a clock, not a decision, so it may run
 *   unattended without answering anything for the player.
 *
 * The accepted manifest never expires on its own. Losing cargo is something
 * that happens because of a patrol or a choice, never because of a timer that
 * ran while nobody was looking.
 */
import {
  FREIGHT,
  FREIGHT_BY_ID,
  FREIGHT_DISTANCE_PAY,
  JOB_BOARD_SIZE,
  JOB_TTL_MS,
  SEAMS,
  SEAM_BY_ID,
  type FreightDef,
  type SeamDef,
} from '../content/freight';
import { CARGO_CAPACITY, REFIT_BY_ID, RIG_LIMIT, DETERRENT_POWER } from '../content/refit';
import type { DeepFieldDef } from '../content/deepField';
import { C } from '../content/constants';
import { loadoutEffects } from './loadouts';
import { mulberry, pickWeighted, randRange } from './rng';
import type { ExpeditionState, GameState, SimEffect } from './types';

// ————— Refit-derived capabilities —————

function rankOf(expedition: ExpeditionState, id: string): number {
  const def = REFIT_BY_ID[id];
  if (!def) return 0;
  return Math.max(0, Math.min(def.maxRank, expedition.refits[id] ?? 0));
}

/** Tonnes the hold will take. Zero until a hold is actually fitted. */
export function cargoCapacity(expedition: ExpeditionState): number {
  // The refit sets what the hold IS; the role and any depots set how much goes
  // into it today. Nothing bought is ever taken away — see engine/loadouts.ts.
  const base = CARGO_CAPACITY[rankOf(expedition, 'cargoHold')] ?? 0;
  return base * loadoutEffects(expedition).capacity;
}

/** How many rigs may stand at once. */
export function rigLimit(expedition: ExpeditionState): number {
  return RIG_LIMIT[rankOf(expedition, 'rigBay')] ?? 0;
}

/** How fast a patrol loses interest. Zero means you have no field fitted. */
export function deterrentPower(expedition: ExpeditionState): number {
  return DETERRENT_POWER[rankOf(expedition, 'deterrent')] ?? 0;
}

export function rigsStanding(expedition: ExpeditionState): number {
  return Object.keys(expedition.rigs).length;
}

/**
 * How heavy the ship is flying right now, as a multiplier on inertia. An
 * empty runabout is 1. The hold's rated capacity is the reference, so a full
 * hold always handles the same however big the hold is — upgrading buys you
 * more work per run, not a ship that ignores physics.
 */
export function massFactor(expedition: ExpeditionState): number {
  const m = expedition.manifest;
  // An accepted job weighs nothing until it is actually in the hold. The run
  // out to fetch it is flown empty, which is exactly the point of collecting
  // things where they are.
  if (!m || m.pickedUpAtMs === null) return 1;
  const def = FREIGHT_BY_ID[m.id];
  if (!def) return 1;
  const cap = Math.max(1, cargoCapacity(expedition));
  return 1 + Math.min(1.6, def.mass / cap) * C.CARGO_INERTIA;
}

// ————— The board —————

/** Distance between two seats, used for the distance component of the fee. */
export function jobPay(def: FreightDef, distance: number): number {
  return Math.max(1, Math.round(def.salvage + distance * FREIGHT_DISTANCE_PAY));
}

/**
 * How far apart two delivered worlds are, for the distance component of a
 * fee. Derived from their positions in the completion order rather than from
 * real geometry: the engine may not import the scene's layout (it is built on
 * three.js, and the engine stays free of it — engine law #3), and a synthetic
 * separation that grows with how far apart two worlds sit in the universe is
 * exactly as good for pricing a job.
 */
function routeDistance(a: number, b: number): number {
  const worlds = Math.abs(a - b);
  const systems = Math.floor(worlds / C.PLANETS_PER_SYSTEM);
  return 30 + worlds * 6 + systems * 40;
}

/**
 * Refill the board. Origins and destinations are drawn from worlds the player
 * has actually delivered, so every job is a route between two real places.
 */
export function refreshJobBoard(state: GameState): void {
  const exp = state.expedition;
  const worlds = state.run.completedPlanets;
  exp.jobs = exp.jobs.filter((j) => j.expiresAtMs > state.gameTimeMs);
  if (worlds.length < 2) return;

  while (exp.jobs.length < JOB_BOARD_SIZE) {
    const def = pickWeighted(state.rng, 'freight', FREIGHT);
    const a = Math.floor(randRange(state.rng, 'freight', 0, worlds.length));
    let b = Math.floor(randRange(state.rng, 'freight', 0, worlds.length));
    if (b === a) b = (b + 1) % worlds.length;
    const from = worlds[a]!;
    const to = worlds[b]!;
    const distance = routeDistance(a, b);
    exp.jobs.push({
      uid: ++state.timers.nextIdCounter,
      id: def.id,
      from: from.lifetimeIndex,
      to: to.lifetimeIndex,
      fromName: from.name,
      toName: to.name,
      distance,
      salvage: jobPay(def, distance),
      expiresAtMs: state.gameTimeMs + JOB_TTL_MS,
    });
  }
}

export function acceptJob(state: GameState, effects: SimEffect[], uid: number): void {
  const exp = state.expedition;
  if (exp.manifest) return; // one hold, one job
  const idx = exp.jobs.findIndex((j) => j.uid === uid);
  if (idx < 0) return;
  const job = exp.jobs[idx]!;
  const def = FREIGHT_BY_ID[job.id];
  if (!def) return;
  // The hold has to be able to take it. A passenger needs a seat, which the
  // smallest hold counts as.
  if (def.mass > cargoCapacity(exp)) return;

  exp.jobs.splice(idx, 1);
  // Accepted, not collected. The cargo is still sitting at its origin, and
  // fetching it is the first half of the job.
  exp.manifest = { ...job, acceptedAtMs: state.gameTimeMs, pickedUpAtMs: null };
  effects.push({ t: 'jobAccepted', uid, id: job.id, to: job.toName });
}

export function deliverManifest(state: GameState, effects: SimEffect[]): void {
  const exp = state.expedition;
  const m = exp.manifest;
  if (!m) return;
  const def = FREIGHT_BY_ID[m.id];
  exp.manifest = null;
  exp.deliveries += 1;
  state.lifetime.deliveries += 1;
  exp.salvage += m.salvage;
  // Reputation is the one thing that crosses the seal, and only in this
  // direction: flying for somebody makes them trust you, which unlocks
  // contracts and megaprojects. No TU, no Science — trust is not currency.
  if (def) {
    state.operations.reputation[def.faction] += def.kind === 'passenger' ? 2 : 1;
  }
  effects.push({
    t: 'manifestDelivered',
    id: m.id,
    salvage: m.salvage,
    to: m.toName,
    passenger: def?.kind === 'passenger',
  });
}

export function loseManifest(
  state: GameState,
  effects: SimEffect[],
  reason: 'complied' | 'abandoned',
): void {
  const m = state.expedition.manifest;
  if (!m) return;
  state.expedition.manifest = null;
  effects.push({ t: 'manifestLost', id: m.id, reason });
}

// ————— Seams and rigs —————

/**
 * Where the seams are. Seeded from the master seed alone, exactly like the
 * Deep Field: they were always out there, and a universe's map of them never
 * changes. Returned as plain tuples — the engine stays free of three.js.
 */
export interface SeamSite {
  id: string;
  pos: readonly [number, number, number];
}

const SHELL_RANGE: Record<string, readonly [number, number]> = {
  near: [30, 70],
  mid: [90, 180],
  far: [230, 480],
};

export function seamSites(masterSeed: number): SeamSite[] {
  return SEAMS.map((def, i) => {
    const r = mulberry((masterSeed ^ Math.imul(0x5ea3, i + 1)) >>> 0);
    const [lo, hi] = SHELL_RANGE[def.shell] ?? [40, 120];
    const dist = lo + r() * (hi - lo);
    const az = r() * Math.PI * 2;
    const el = (r() - 0.5) * 0.8;
    const flat = Math.cos(el);
    return {
      id: def.id,
      pos: [
        Math.sin(az) * flat * dist,
        Math.sin(el) * dist * 0.5,
        Math.cos(az) * flat * dist,
      ] as const,
    };
  });
}

/**
 * A seam, dressed as a Deep Field landmark.
 *
 * The helm already has a whole tested pipeline for "an object out there you
 * can lock, scan and park against" — sensor range, the aim cone, the
 * proximity governor, the one-verb prompt. A seam is exactly that object, so
 * it becomes one rather than growing a second parallel system beside it.
 * `seam-` ids are the only thing that distinguishes them, and the two places
 * that must care (what a completed scan means, what parking on it offers)
 * check for that prefix.
 */
export function seamAsLandmark(def: SeamDef): DeepFieldDef {
  return {
    id: def.id,
    contact: 'dense return, diffuse',
    name: def.name,
    kind: 'phenomenon',
    shell: def.shell,
    // Big enough to fly up to and park against without threading a needle.
    radius: 3.2,
    scanSeconds: def.scanSeconds,
    salvage: 0,
    entry: def.guide,
    boarding: '',
  };
}

export function isSeamId(id: string): boolean {
  return id.startsWith('seam-');
}

export function isProspected(expedition: ExpeditionState, id: string): boolean {
  return expedition.seams[id] !== undefined;
}

export function prospectSeam(state: GameState, effects: SimEffect[], id: string): void {
  if (!SEAM_BY_ID[id]) return;
  if (state.expedition.seams[id] !== undefined) return;
  state.expedition.seams[id] = state.gameTimeMs;
  effects.push({ t: 'seamProspected', id });
}

export function placeRig(state: GameState, effects: SimEffect[], id: string): void {
  const exp = state.expedition;
  const def = SEAM_BY_ID[id];
  if (!def) return;
  if (!isProspected(exp, id)) return;
  if (exp.rigs[id]) return;
  if (rigsStanding(exp) >= rigLimit(exp)) return;
  if (exp.salvage < def.rigCost) return;

  exp.salvage -= def.rigCost;
  exp.rigs[id] = { placedAtMs: state.gameTimeMs, banked: 0, lastTickMs: state.gameTimeMs };
  state.lifetime.rigsPlaced += 1;
  effects.push({ t: 'rigPlaced', id });
}

export function collectRig(state: GameState, effects: SimEffect[], id: string): void {
  const rig = state.expedition.rigs[id];
  if (!rig || rig.banked <= 0) return;
  const got = Math.floor(rig.banked);
  if (got <= 0) return;
  rig.banked -= got;
  state.expedition.salvage += got;
  effects.push({ t: 'rigCollected', id, salvage: got });
}

/**
 * Advance every rig's bank. Called from the tick ONLINE AND OFFLINE alike —
 * a rig that stopped working while the tab was shut would have no reason to
 * exist. Each is capped by its seam, so the reward for coming back scales
 * with absence up to a point and then politely waits.
 */
export function stepRigs(state: GameState, tickMs: number): boolean {
  const rigs = state.expedition.rigs;
  let changed = false;
  for (const id of Object.keys(rigs)) {
    const rig = rigs[id]!;
    const def = SEAM_BY_ID[id];
    if (!def) continue;
    // A survey station tells the seam to keep going a while longer.
    const cap = def.cap * loadoutEffects(state.expedition).rigCap;
    if (rig.banked >= cap) continue;
    rig.banked = Math.min(cap, rig.banked + (def.yieldPerHour * tickMs) / 3_600_000);
    rig.lastTickMs = state.gameTimeMs;
    changed = true;
  }
  return changed;
}

/**
 * Collect the cargo. Called by the flight layer on arrival at the origin.
 *
 * Idempotent: arriving twice does not re-collect, and a manifest already in
 * the hold is unaffected.
 */
export function pickUpManifest(state: GameState, effects: SimEffect[]): boolean {
  const m = state.expedition.manifest;
  if (!m || m.pickedUpAtMs !== null) return false;
  m.pickedUpAtMs = state.gameTimeMs;
  effects.push({ t: 'manifestPickedUp', id: m.id, from: m.fromName });
  return true;
}

/** Is the hold actually carrying anything? Mass only counts once collected. */
export function isCarrying(expedition: ExpeditionState): boolean {
  return expedition.manifest?.pickedUpAtMs !== null && expedition.manifest !== null;
}

/** Total waiting to be collected — the HUD's reason to fly back out. */
export function bankedTotal(expedition: ExpeditionState): number {
  let sum = 0;
  for (const id of Object.keys(expedition.rigs)) sum += expedition.rigs[id]!.banked;
  return sum;
}

/** Fresh flight-economy state, for a new game and for the v8 → v9 migration. */
export function createFreightState(): Pick<
  ExpeditionState,
  | 'manifest' | 'jobs' | 'seams' | 'rigs' | 'interdictions' | 'deliveries' | 'nextJobMs'
  | 'pinned' | 'visited' | 'unscheduled' | 'role' | 'infrastructure'
> {
  return {
    manifest: null,
    jobs: [],
    seams: {},
    rigs: {},
    interdictions: 0,
    deliveries: 0,
    nextJobMs: 0,
    pinned: null,
    visited: {},
    unscheduled: {},
    role: 'general',
    infrastructure: {},
  };
}
