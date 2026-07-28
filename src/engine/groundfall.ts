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
import {
  advanceFieldProjects,
  updateFieldCorridor,
  updateFieldKnowledge,
} from './fieldProjects';
import {
  charterOfferSignature,
  refreshUnsignedCharterOffers,
} from './charters';
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

function mergeCheckpointHaul(
  cached: readonly SampleHaul[],
  live: readonly SampleHaul[],
): SampleHaul[] {
  const merged = new Map<string, SampleHaul>();
  for (const item of [...cached, ...live]) {
    if (item.n <= 0) continue;
    const key = `${item.kind}:${item.method}`;
    const prior = merged.get(key);
    if (!prior || item.n > prior.n) merged.set(key, { ...item, n: Math.floor(item.n) });
  }
  return [...merged.values()];
}

function mergeCheckpointEvidence(cached: GroundEvidence, live: GroundEvidence): GroundEvidence {
  const unique = (left: readonly string[] = [], right: readonly string[] = []) =>
    [...new Set([...left, ...right])];
  const marks = [...(cached.marks ?? []), ...(live.marks ?? [])];
  const seenMarks = new Set<string>();
  return {
    landmarks: unique(cached.landmarks, live.landmarks),
    civic: Boolean(cached.civic || live.civic),
    contacted: Boolean(cached.contacted || live.contacted),
    readings: Math.max(cached.readings ?? 0, live.readings ?? 0),
    readingDirs:
      (live.readingDirs?.length ?? 0) >= (cached.readingDirs?.length ?? 0)
        ? live.readingDirs?.map((dir) => [...dir] as [number, number, number])
        : cached.readingDirs?.map((dir) => [...dir] as [number, number, number]),
    chartedIds: unique(cached.chartedIds, live.chartedIds),
    weathered: unique(cached.weathered, live.weathered),
    marks: marks.filter((mark) => {
      const key = `${mark.kind}:${mark.dir.map((n) => n.toFixed(7)).join(':')}`;
      if (seenMarks.has(key)) return false;
      seenMarks.add(key);
      return true;
    }),
    buriedWorked: Boolean(cached.buriedWorked || live.buriedWorked),
    lead: Boolean(cached.lead || live.lead),
    flew: Boolean(cached.flew || live.flew),
    setdowns: Math.max(cached.setdowns ?? 0, live.setdowns ?? 0),
    charted: Math.max(cached.charted ?? 0, live.charted ?? 0),
    rangeM: Math.max(cached.rangeM ?? 0, live.rangeM ?? 0),
  };
}

/**
 * Cache the latest full shore-party report. This deliberately pays nothing and
 * advances nothing; it only gives autosave something durable to hold until the
 * player boards and the ordinary banking path verifies the work.
 */
export function checkpointGround(
  state: GameState,
  worldKey: string,
  haul: readonly SampleHaul[],
  sites: Record<string, GroundSiteOutcome> = {},
  species: readonly string[] = [],
  evidence: GroundEvidence = {},
): void {
  if (!markWorldFacts(state, worldKey)) return;
  const cleanedHaul = mergeCheckpointHaul([], haul)
    .filter((item) => SAMPLE_BY_ID[item.kind] !== undefined)
    .slice(0, 32);
  const cleanedSites = Object.fromEntries(
    Object.entries(sites)
      .filter(([, outcome]) => ['worked', 'prospected', 'preserved', 'visited'].includes(outcome))
      .slice(0, 64),
  ) as Record<string, GroundSiteOutcome>;
  const cleanedSpecies = [...new Set(species.filter((id) => SPECIES_BY_ID[id] !== undefined))]
    .slice(0, 64);
  const cleanedEvidence = mergeCheckpointEvidence({}, evidence);
  cleanedEvidence.readingDirs = cleanedEvidence.readingDirs
    ?.filter((dir) => dir.length === 3 && dir.every(Number.isFinite))
    .map((dir) => {
      const length = Math.hypot(dir[0], dir[1], dir[2]);
      return length > 0
        ? [dir[0] / length, dir[1] / length, dir[2] / length] as [number, number, number]
        : null;
    })
    .filter((dir): dir is [number, number, number] => dir !== null)
    .slice(0, 3);
  cleanedEvidence.readings = Math.min(3, Math.max(0, Math.floor(cleanedEvidence.readings ?? 0)));
  cleanedEvidence.chartedIds = cleanedEvidence.chartedIds?.slice(0, 256);
  cleanedEvidence.landmarks = cleanedEvidence.landmarks?.slice(0, 32);
  cleanedEvidence.weathered = cleanedEvidence.weathered?.slice(0, 16);
  cleanedEvidence.marks = cleanedEvidence.marks?.slice(0, 10).map((mark) => ({
    kind: mark.kind,
    dir: [...mark.dir] as [number, number, number],
  }));
  state.expedition.groundCheckpoints[worldKey] = {
    savedAtMs: state.gameTimeMs,
    haul: cleanedHaul,
    sites: cleanedSites,
    species: cleanedSpecies,
    evidence: cleanedEvidence,
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
  const checkpoint = state.expedition.groundCheckpoints[worldKey];
  if (checkpoint) {
    haul = mergeCheckpointHaul(checkpoint.haul, haul);
    sites = { ...checkpoint.sites, ...sites };
    species = [...new Set([...checkpoint.species, ...species])];
    evidence = mergeCheckpointEvidence(checkpoint.evidence, evidence);
    delete state.expedition.groundCheckpoints[worldKey];
  }
  const completedPosition = state.run.completedPlanets.findIndex(
    (world) => `w${world.lifetimeIndex}` === worldKey,
  );
  const pendingSystemIndex = completedPosition >= 0
    ? Math.floor(completedPosition / C.PLANETS_PER_SYSTEM)
    : null;
  const charterSignatureBefore = pendingSystemIndex !== null
    && state.run.charterOffers[String(pendingSystemIndex)] !== undefined
    ? charterOfferSignature(state, pendingSystemIndex) : null;
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
  const contacted = civic && Boolean(evidence.contacted);
  const readings = contacted
    ? Math.max(0, Math.min(12, Math.floor(evidence.readings ?? 0)))
    : 0;
  const newLandmarks = landmarks.filter((kind) => record.landmarks[kind] === undefined);
  const newWeather = weathered.filter((kind) => record.weather[kind] === undefined);
  for (const kind of newLandmarks) record.landmarks[kind] = state.gameTimeMs;
  for (const kind of newWeather) record.weather[kind] = state.gameTimeMs;
  const firstCivicContact = contacted && record.civicVisits === 0;
  if (contacted) record.civicVisits += 1;
  const marks = recordGroundMarks(
    state, effects, worldKey, worldName, record, evidence.marks ?? [],
  );
  const projectFamiliarity = facts
    ? advanceFieldProjects(
        state, effects, facts.lifetimeIndex, worldName, cleaned, sites, species,
        { contacted, readings },
      )
    : 0;
  const linkedCorridor = updateFieldCorridor(state, effects, worldKey, worldName);

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
  if (contacted) recordCertFirst(state, effects, `liaison:call:${worldKey}`);

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
  if (contacted && facts && facts.completed && certRank(state.expedition, 'liaison') >= 2) {
    raiseStanding(state, facts.lifetimeIndex, CIVIC_CALL_STANDING);
    effects.push({ t: 'civicCalled', world: worldName, standing: CIVIC_CALL_STANDING });
  }

  const familiarityGain =
    Number(value.firstSurvey)
    + Number(value.newKinds.length > 0)
    + Number(value.newSpecies.length > 0)
    + Number(newLandmarks.length + newWeather.length > 0)
    + Number(firstCivicContact)
    + projectFamiliarity
    + Number(linkedCorridor);
  updateFieldKnowledge(state, effects, worldKey, worldName, familiarityGain);

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
  if (pendingSystemIndex !== null && charterSignatureBefore !== null) {
    refreshUnsignedCharterOffers(
      state,
      pendingSystemIndex,
      charterSignatureBefore,
    );
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
