/**
 * Groundfall rules: what may be landed on, and what a shore party is worth.
 *
 * The scene owns terrain, boots and plasma; this file owns the ledger. It
 * follows the flight economy's oldest seal (see engine/freight.ts): samples
 * become salvage and salvage only, so a player who never leaves the desk
 * loses nothing, and a player who walks a world they are terraforming gets
 * paid in the currency of going outside.
 */
import { C } from '../content/constants';
import {
  ensureGroundWorld,
  groundYield,
  recordSiteOutcome,
  surveyCredit,
} from './groundSites';
import { resolveGroundRequests } from './bridge';
import { atmoRank } from './deepField';
import { certRank, recordCertFirst } from './certifications';
import {
  CIVIC_CALL_STANDING,
  markWorldFacts,
  recordGroundMarks,
  repairSpots,
} from './groundMarks';
import { advanceLead } from './leads';
import { raiseStanding } from './situations';
import { weatherKindsFor } from './weather';
import { LANDMARK_BY_ID } from '../content/groundLandmarks';
import { SPECIES_BY_ID } from '../content/groundSpecies';
import { SAMPLE_BY_ID } from '../content/groundSamples';
import type {
  GameState,
  GroundEvidence,
  GroundSiteOutcome,
  PlanetType,
  SampleHaul,
  SimEffect,
} from './types';

/** Worlds you can stand on. A gas giant declines to provide a floor. */
export function isLandableType(type: PlanetType): boolean {
  return type !== 'gasgiant';
}

/** The Guide's reason, when the answer is no. */
export function landingRefusal(type: PlanetType): string | null {
  if (type === 'gasgiant') return 'no solid surface — the Guide advises against';
  return null;
}

/** Stable ground-survey key for a world across its whole career. */
export function groundKey(lifetimeIndex: number): string {
  return `w${lifetimeIndex}`;
}

export function isGroundSurveyed(state: Pick<GameState, 'expedition'>, worldKey: string): boolean {
  return state.expedition.groundWorlds[worldKey]?.surveyedAtMs != null;
}

/** What a returning shore party is owed, before it is paid. Pure. */
export function groundReturnValue(
  state: Pick<GameState, 'expedition'>,
  worldKey: string,
  haul: readonly SampleHaul[],
  preserved = 0,
  species: readonly string[] = [],
): { salvage: number; firstSurvey: boolean; newKinds: string[]; newSpecies: string[]; capped: boolean } {
  // A survey is a real piece of work: enough attention paid to say something
  // about the world, banked in one landing. Precision cores count double;
  // a seam deliberately preserved counts too.
  const firstSurvey =
    surveyCredit(haul, preserved) >= C.GROUND_SURVEY_SAMPLES &&
    !isGroundSurveyed(state, worldKey);
  const value = groundYield(
    state.expedition.groundWorlds[worldKey],
    haul,
    firstSurvey ? C.GROUND_SURVEY_BONUS : 0,
    species,
  );
  return {
    salvage: value.salvage,
    firstSurvey,
    newKinds: value.newKinds,
    newSpecies: value.newSpecies,
    capped: value.capped,
  };
}

/**
 * Bank a shore party: the haul becomes salvage, the sites become the world's
 * memory, and the landing becomes a visit. An empty-handed boarding with
 * nothing to report is still allowed to be uneventful — the visit is counted
 * and no effect is raised.
 *
 * Phase 5 widened what a boarding testifies to: marks planted, weather stood
 * in, landmarks reached, a town walked into. The engine verifies what it can
 * against the world's own tables, records the certification firsts, and then
 * — with the verified evidence in hand — settles every open request this
 * stay's work answers (engine/bridge.ts).
 */
export function bankGroundSamples(
  state: GameState,
  effects: SimEffect[],
  worldKey: string,
  worldName: string,
  haul: readonly SampleHaul[],
  sites: Record<string, GroundSiteOutcome> = {},
  species: readonly string[] = [],
  evidence: GroundEvidence = {},
): void {
  const record = ensureGroundWorld(state, worldKey);
  const firstVisit = record.visits === 0;
  record.visits += 1;

  const cleaned = haul.filter((h) => h.n > 0);
  const outcomes = Object.entries(sites);
  const preserved = outcomes.filter(([, o]) => o === 'preserved').length;
  const value = groundReturnValue(state, worldKey, cleaned, preserved, species);

  for (const [siteId, outcome] of outcomes) {
    recordSiteOutcome(record, siteId, outcome, state.gameTimeMs);
  }
  for (const h of cleaned) {
    if (record.samples[h.kind] === undefined) record.samples[h.kind] = state.gameTimeMs;
  }
  // The catalogue remembers every species seen, paid or not — the record is
  // the point; the bonus is merely the record being worth keeping.
  for (const id of species) {
    if (record.species[id] === undefined) record.species[id] = state.gameTimeMs;
  }

  state.expedition.salvage += value.salvage;
  record.salvagePaid += value.salvage;
  if (value.firstSurvey) record.surveyedAtMs = state.gameTimeMs;

  // The return report files first — the haul is the headline, and everything
  // the testimony below adds (marks, ranks, settled requests) toasts after it.
  const n = cleaned.reduce((sum, h) => sum + h.n, 0);
  if (n > 0 || value.firstSurvey || value.newSpecies.length > 0) {
    effects.push({
      t: 'groundReturn',
      worldKey,
      name: worldName,
      samples: n,
      salvage: value.salvage,
      firstSurvey: value.firstSurvey,
      newKinds: value.newKinds,
      newSpecies: value.newSpecies,
      capped: value.capped,
    });
  }

  // — The wider testimony: verify, then record what held up. —
  const facts = markWorldFacts(state, worldKey);
  const weathered = verifyWeathered(state, worldKey, evidence.weathered ?? []);
  const landmarks = verifyLandmarks(facts?.type ?? null, facts?.quirks ?? [], evidence.landmarks ?? []);
  const civic = Boolean(evidence.civic) && facts != null && repairSpots(facts).length > 0;
  const marks = recordGroundMarks(
    state, effects, worldKey, worldName, record, evidence.marks ?? [],
  );

  // Certification firsts — each pays once, ever (engine/certifications.ts).
  if (firstVisit) recordCertFirst(state, effects, `mobility:world:${worldKey}`);
  if (value.firstSurvey) recordCertFirst(state, effects, `survey:filed:${worldKey}`);
  for (const kind of weathered) recordCertFirst(state, effects, `mobility:weather:${kind}`);
  for (const kind of landmarks) recordCertFirst(state, effects, `mobility:landmark:${kind}`);
  for (const id of species) {
    if (SPECIES_BY_ID[id]) recordCertFirst(state, effects, `survey:species:${id}`);
  }
  for (const h of cleaned) {
    if (SAMPLE_BY_ID[h.kind]) recordCertFirst(state, effects, `geology:kind:${h.kind}`);
    recordCertFirst(state, effects, `geology:verb:${h.method}`);
  }
  if (preserved > 0) recordCertFirst(state, effects, 'geology:verb:preserve');
  if (evidence.buriedWorked) recordCertFirst(state, effects, 'geology:buried');
  if (civic) recordCertFirst(state, effects, `liaison:call:${worldKey}`);

  // — What the stay did in the air (Phase 6) —
  //
  // Verified the only way it can be: the package either is fitted or it is
  // not, and nothing below is reachable without it. Each first pays once,
  // ever, like the rest — flying is a thing you learn, not a thing you do
  // repeatedly for credit.
  const airborne = atmoRank(state.expedition) >= 1;
  const charted = airborne ? Math.max(0, Math.floor(evidence.charted ?? 0)) : 0;
  const rangeM = airborne ? Math.max(0, evidence.rangeM ?? 0) : 0;
  if (airborne && evidence.flew) {
    recordCertFirst(state, effects, 'mobility:airborne');
    if ((evidence.setdowns ?? 0) > 0) recordCertFirst(state, effects, 'mobility:setdown');
    if (charted > 0) recordCertFirst(state, effects, 'survey:overflight');
  }

  // The civic call (Liaison II): attending in person lifts the town, once a
  // stay. Only where somebody actually lives, and only once certified —
  // before that, showing up is merely showing up.
  if (civic && facts && facts.completed && certRank(state.expedition, 'liaison') >= 2) {
    raiseStanding(state, facts.lifetimeIndex, CIVIC_CALL_STANDING);
    effects.push({ t: 'civicCalled', world: worldName, standing: CIVIC_CALL_STANDING });
  }

  // The stay's verified work, offered against every open request that names
  // this world. Settling them here — at boarding — is what makes "I went and
  // did it myself" one motion rather than a form filed afterwards.
  if (facts) {
    const repaired = marks.some((m) => m.kind === 'repair');
    resolveGroundRequests(state, effects, {
      lifetimeIndex: facts.lifetimeIndex,
      surveyCredit: surveyCredit(cleaned, preserved),
      haul: cleaned,
      species,
      landmarks,
      civic,
      weathered,
      markKinds: marks.map((m) => m.kind),
      repaired,
      charted,
      rangeM,
    });
    if (evidence.lead) advanceLead(state, effects, facts.lifetimeIndex);
  }
}

/** Weather testimony the world's own sky could actually have produced. */
function verifyWeathered(
  state: GameState,
  worldKey: string,
  claimed: readonly string[],
): string[] {
  if (claimed.length === 0) return [];
  const facts = markWorldFacts(state, worldKey);
  if (!facts) return [];
  // Delivered worlds stand at full gauges; the hero world at its live ones.
  const aspects = facts.completed
    ? { thermal: 1, atmo: 1, hydro: 1, bio: 1 }
    : {
        thermal: gaugeFrac(state, 'thermal'),
        atmo: gaugeFrac(state, 'atmo'),
        hydro: gaugeFrac(state, 'hydro'),
        bio: gaugeFrac(state, 'bio'),
      };
  const possible = new Set<string>(weatherKindsFor(facts.type, aspects));
  return [...new Set(claimed)].filter((k) => possible.has(k));
}

function gaugeFrac(state: GameState, aspect: 'thermal' | 'atmo' | 'hydro' | 'bio'): number {
  const target = state.planet.targets[aspect];
  if (target.lte(0)) return 1;
  return Math.max(0, Math.min(1, state.planet.gauges[aspect].div(target).toNumber()));
}

/** Landmark testimony limited to kinds this world's grammar can build. */
function verifyLandmarks(
  type: PlanetType | null,
  quirks: readonly string[],
  claimed: readonly string[],
): string[] {
  if (!type || claimed.length === 0) return [];
  return [...new Set(claimed)].filter((id) => {
    const def = LANDMARK_BY_ID[id];
    if (!def) return false;
    if (!def.types.includes(type)) return false;
    if (def.quirk && !quirks.includes(def.quirk)) return false;
    return true;
  });
}
