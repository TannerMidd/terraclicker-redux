/**
 * The ground's memory — what each world records about the boots that visited.
 *
 * Pure helpers over `expedition.groundWorlds`. The scene decides what a shore
 * party did; this module decides what the world remembers and what the ledger
 * owes, and nothing here imports the renderer (the direction dependencies are
 * not allowed to run).
 *
 * Two rules with teeth:
 *
 *  - A site outcome only ever escalates. `worked` is terminal — a seam does
 *    not regrow because you landed again — and a `preserved` seam can later
 *    be worked, because preservation is a note, not a lock.
 *  - A world's ground has a lifetime salvage cap. Seams deplete permanently,
 *    but a planet has a great deal of ground; the cap is what makes farming
 *    one world forever a plan the ledger politely declines.
 */
import { C } from '../content/constants';
import { SAMPLE_BY_ID } from '../content/groundSamples';
import type {
  GameState,
  GroundSiteOutcome,
  GroundSiteState,
  GroundWorldRecord,
  SampleHaul,
} from './types';

/** An empty record: a world nobody has stood on yet. */
export function createGroundWorldRecord(): GroundWorldRecord {
  return {
    surveyedAtMs: null,
    visits: 0,
    sites: {},
    samples: {},
    species: {},
    marks: [],
    salvagePaid: 0,
  };
}

export function groundWorld(
  state: Pick<GameState, 'expedition'>,
  worldKey: string,
): GroundWorldRecord | undefined {
  return state.expedition.groundWorlds[worldKey];
}

/** The record, created on first touch. */
export function ensureGroundWorld(
  state: Pick<GameState, 'expedition'>,
  worldKey: string,
): GroundWorldRecord {
  const existing = state.expedition.groundWorlds[worldKey];
  if (existing) return existing;
  const fresh = createGroundWorldRecord();
  state.expedition.groundWorlds[worldKey] = fresh;
  return fresh;
}

export function siteState(
  state: Pick<GameState, 'expedition'>,
  worldKey: string,
  siteId: string,
): GroundSiteState | undefined {
  return state.expedition.groundWorlds[worldKey]?.sites[siteId];
}

/**
 * Outcome precedence: an outcome may escalate, never retreat. Working a seam
 * you once preserved is a decision; un-working one is not on offer.
 */
const OUTCOME_RANK: Record<GroundSiteOutcome, number> = {
  visited: 0,
  preserved: 1,
  prospected: 2,
  worked: 3,
};

/** Record one site outcome, honouring precedence. Returns what now stands. */
export function recordSiteOutcome(
  record: GroundWorldRecord,
  siteId: string,
  outcome: GroundSiteOutcome,
  atMs: number,
): GroundSiteState {
  const prior = record.sites[siteId];
  if (prior && OUTCOME_RANK[prior.s] >= OUTCOME_RANK[outcome]) return prior;
  const next: GroundSiteState = { s: outcome, atMs };
  record.sites[siteId] = next;
  return next;
}

/** May the walker still swing at this site? Worked and prospected are spent. */
export function siteMinable(prior: GroundSiteState | undefined): boolean {
  return !prior || prior.s === 'preserved' || prior.s === 'visited';
}

/**
 * Survey credit in a banked haul: ordinary samples one apiece, precision
 * cores two, and each seam deliberately preserved this stay counts one —
 * a survey is attention paid, not tonnage moved.
 */
export function surveyCredit(haul: readonly SampleHaul[], preserved: number): number {
  let credit = Math.max(0, preserved);
  for (const h of haul) credit += h.n * (h.method === 'core' ? 2 : 1);
  return credit;
}

export interface GroundYield {
  /** Salvage actually payable, after the world's lifetime cap. */
  salvage: number;
  /** What it would have paid uncapped, for the effect line. */
  rawSalvage: number;
  /** Kinds this world has never produced before (catalogue bonus each). */
  newKinds: string[];
  /** Species this world has never recorded before (species bonus each). */
  newSpecies: string[];
  capped: boolean;
}

/**
 * What a haul is worth on this world: per-kind salvage plus a one-time
 * catalogue bonus per new kind, plus a one-time record bonus per new
 * species the biologger noticed, clamped to the world's remaining yield.
 * Pure — call it before mutating anything, including for the HUD.
 */
export function groundYield(
  record: GroundWorldRecord | undefined,
  haul: readonly SampleHaul[],
  surveyBonus: number,
  species: readonly string[] = [],
): GroundYield {
  let raw = surveyBonus;
  const newKinds: string[] = [];
  const catalogued = record?.samples ?? {};
  for (const h of haul) {
    if (h.n <= 0) continue;
    const def = SAMPLE_BY_ID[h.kind];
    raw += h.n * (def?.salvage ?? C.GROUND_SAMPLE_SALVAGE);
    // Membership, not truthiness: a kind first catalogued at gameTimeMs 0 is
    // still catalogued.
    if (catalogued[h.kind] === undefined && !newKinds.includes(h.kind)) newKinds.push(h.kind);
  }
  raw += newKinds.length * C.GROUND_CATALOGUE_BONUS;
  const newSpecies: string[] = [];
  const known = record?.species ?? {};
  for (const id of species) {
    if (known[id] === undefined && !newSpecies.includes(id)) newSpecies.push(id);
  }
  raw += newSpecies.length * C.GROUND_SPECIES_BONUS;
  const remaining = Math.max(0, C.GROUND_WORLD_YIELD_CAP - (record?.salvagePaid ?? 0));
  const salvage = Math.min(raw, remaining);
  return { salvage, rawSalvage: raw, newKinds, newSpecies, capped: salvage < raw };
}
