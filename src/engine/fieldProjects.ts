/**
 * Authored field projects, atlas completion, familiarity, and named ground routes.
 *
 * This module is intentionally deterministic and sparse. It never rolls an RNG,
 * never touches the core TU/science/aspect economy, and only stores facts that
 * cannot be reconstructed: stages reached, routes established, and what a world
 * now remembers about the player.
 */
import { C } from '../content/constants';
import {
  FIELD_PROJECTS,
  FIELD_PROJECT_BY_ID,
  PROJECT_SERVICE_BY_KIND,
  type FieldProjectDef,
} from '../content/fieldProjects';
import { certRank } from './certifications';
import { ensureGroundWorld } from './groundSites';
import { recordWorldEvent } from './worldRecords';
import type {
  CompletedPlanetRecord,
  FieldProjectState,
  GameState,
  GroundProjectKind,
  GroundSiteOutcome,
  GroundWorldRecord,
  SampleHaul,
  SimEffect,
} from './types';

export const FIELD_ATLAS_TOTAL = 6;
export const FIELD_ATLAS_THRESHOLD = 5;
export const FIELD_ATLAS_SALVAGE = 24;
export const FIELD_ATLAS_REPUTATION = 1;
export const FAMILIARITY_MAX = 6;

export interface FieldAtlasSummary {
  score: number;
  total: number;
  complete: boolean;
  missing: string[];
}

export interface GroundNetworkSummary {
  beacons: number;
  stations: number;
  shelters: number;
  repairs: number;
  linked: boolean;
  services: string[];
}

export interface FieldProjectView {
  key: string;
  id: FieldProjectState['id'];
  name: string;
  stage: FieldProjectState['stage'];
  role: 'receiver' | 'source';
  brief: string;
  receiver: { lifetimeIndex: number; name: string };
  source: { lifetimeIndex: number; name: string };
  result: GroundProjectKind;
  service: string;
}

function worldKey(lifetimeIndex: number): string {
  return `w${lifetimeIndex}`;
}

function worldName(state: GameState, lifetimeIndex: number): string {
  return (
    state.run.completedPlanets.find((world) => world.lifetimeIndex === lifetimeIndex)?.name
    ?? state.operations.heritageWorlds.find((world) => world.lifetimeIndex === lifetimeIndex)?.name
    ?? state.worldRecords[String(lifetimeIndex)]?.name
    ?? `World ${lifetimeIndex}`
  );
}

function currentSystemWorlds(state: GameState, systemIndex: number): CompletedPlanetRecord[] {
  const start = systemIndex * C.PLANETS_PER_SYSTEM;
  return state.run.completedPlanets.slice(start, start + C.PLANETS_PER_SYSTEM);
}

function rotatedProjects(systemIndex: number): readonly FieldProjectDef[] {
  const offset = systemIndex % FIELD_PROJECTS.length;
  return [...FIELD_PROJECTS.slice(offset), ...FIELD_PROJECTS.slice(0, offset)];
}

/**
 * Give each newly formed system one project that its actual world types can
 * support. The run number is part of the key because system indices restart at
 * prestige while expedition history does not.
 */
export function ensureFieldProjects(state: GameState, effects?: SimEffect[]): void {
  for (let systemIndex = 0; systemIndex < state.run.systems; systemIndex++) {
    const prefix = `r${state.run.number}:s${systemIndex}:`;
    if (Object.keys(state.expedition.fieldProjects).some((key) => key.startsWith(prefix))) continue;

    const worlds = currentSystemWorlds(state, systemIndex);
    if (worlds.length !== C.PLANETS_PER_SYSTEM) continue;

    let chosen: { def: FieldProjectDef; receiver: CompletedPlanetRecord; source: CompletedPlanetRecord } | null = null;
    for (const def of rotatedProjects(systemIndex)) {
      const receiver = worlds.find((world) => def.receiverTypes.includes(world.type));
      const source = worlds.find(
        (world) => world.lifetimeIndex !== receiver?.lifetimeIndex && def.sourceTypes.includes(world.type),
      );
      if (receiver && source) {
        chosen = { def, receiver, source };
        break;
      }
    }
    if (!chosen) continue;

    const key = `${prefix}${chosen.def.id}`;
    state.expedition.fieldProjects[key] = {
      key,
      id: chosen.def.id,
      systemIndex,
      receiver: chosen.receiver.lifetimeIndex,
      source: chosen.source.lifetimeIndex,
      stage: 'investigate',
      startedAtMs: state.gameTimeMs,
      updatedAtMs: state.gameTimeMs,
      completedAtMs: null,
    };
    recordWorldEvent(state, chosen.receiver.lifetimeIndex, {
      kind: 'projectStarted',
      id: key,
      atGameMs: state.gameTimeMs,
    });
    recordWorldEvent(state, chosen.source.lifetimeIndex, {
      kind: 'projectStarted',
      id: key,
      atGameMs: state.gameTimeMs,
    });
    effects?.push({
      t: 'fieldProjectAdvanced',
      key,
      id: chosen.def.id,
      stage: 'investigate',
      title: chosen.def.name,
      text: `${chosen.receiver.name}: ${chosen.def.investigate}`,
      world: chosen.receiver.name,
    });
  }
}

function briefFor(
  project: FieldProjectState,
  def: FieldProjectDef,
  role: FieldProjectView['role'],
  receiverName: string,
  sourceName: string,
): string {
  switch (project.stage) {
    case 'investigate':
      return role === 'receiver'
        ? def.investigate
        : `${receiverName} must be investigated before ${sourceName}'s field evidence can be used.`;
    case 'source':
      return role === 'source'
        ? def.sourceBrief
        : `The local readings are filed. Travel to ${sourceName}: ${def.sourceBrief}`;
    case 'return':
      return role === 'receiver'
        ? def.returnBrief
        : `The source evidence is secured. Return it to ${receiverName}.`;
    case 'complete':
      return role === 'receiver'
        ? `${def.complete} Service: ${def.service}.`
        : `Your evidence now travels the ${def.routeNoun} to ${receiverName}.`;
  }
}

/** The most immediately relevant project at a world, active work first. */
export function fieldProjectAt(state: GameState, lifetimeIndex: number): FieldProjectView | null {
  const projects = Object.values(state.expedition.fieldProjects)
    .filter((project) => project.receiver === lifetimeIndex || project.source === lifetimeIndex)
    .sort((a, b) => {
      const activeA = a.stage === 'complete' ? 1 : 0;
      const activeB = b.stage === 'complete' ? 1 : 0;
      return activeA - activeB || b.updatedAtMs - a.updatedAtMs || a.key.localeCompare(b.key);
    });
  const project = projects[0];
  if (!project) return null;
  const def = FIELD_PROJECT_BY_ID[project.id];
  const receiverName = worldName(state, project.receiver);
  const sourceName = worldName(state, project.source);
  const role = project.receiver === lifetimeIndex ? 'receiver' : 'source';
  return {
    key: project.key,
    id: project.id,
    name: def.name,
    stage: project.stage,
    role,
    brief: briefFor(project, def, role, receiverName, sourceName),
    receiver: { lifetimeIndex: project.receiver, name: receiverName },
    source: { lifetimeIndex: project.source, name: sourceName },
    result: def.result,
    service: def.service,
  };
}

function sourceEvidenceMet(
  def: FieldProjectDef,
  haul: readonly SampleHaul[],
  sites: Record<string, GroundSiteOutcome>,
  species: readonly string[],
): boolean {
  const samples = new Set(haul.filter((item) => item.n > 0).map((item) => item.kind));
  if (def.sourceSamples?.some((kind) => samples.has(kind))) return true;
  const catalogued = new Set(species);
  if (def.sourceSpecies?.some((id) => catalogued.has(id))) return true;
  return Boolean(def.allowPreserve) && Object.values(sites).some((outcome) => outcome === 'preserved');
}

function advance(
  state: GameState,
  effects: SimEffect[],
  project: FieldProjectState,
  stage: FieldProjectState['stage'],
  text: string,
  world: string,
): void {
  const def = FIELD_PROJECT_BY_ID[project.id];
  project.stage = stage;
  project.updatedAtMs = state.gameTimeMs;
  effects.push({
    t: 'fieldProjectAdvanced',
    key: project.key,
    id: project.id,
    stage,
    title: def.name,
    text,
    world,
  });
}

/**
 * Test one boarding report against every active project touching that world.
 * A stage moves at most once per report, which keeps the chain legible and
 * makes each trip a real chapter rather than three flags collapsing together.
 */
export function advanceFieldProjects(
  state: GameState,
  effects: SimEffect[],
  lifetimeIndex: number,
  world: string,
  haul: readonly SampleHaul[],
  sites: Record<string, GroundSiteOutcome>,
  species: readonly string[],
  evidence: { contacted: boolean; readings: number },
): number {
  ensureFieldProjects(state);
  let familiarity = 0;
  const projects = Object.values(state.expedition.fieldProjects)
    .filter((project) => project.stage !== 'complete')
    .sort((a, b) => a.key.localeCompare(b.key));

  for (const project of projects) {
    const def = FIELD_PROJECT_BY_ID[project.id];
    if (
      project.stage === 'investigate'
      && project.receiver === lifetimeIndex
      && evidence.contacted
      && evidence.readings >= 3
    ) {
      const record = ensureGroundWorld(state, worldKey(project.receiver));
      record.projectSites[project.key] = {
        id: project.key,
        kind: def.result,
        state: 'scaffold',
        atMs: state.gameTimeMs,
        sourceWorld: project.source,
      };
      advance(
        state,
        effects,
        project,
        'source',
        `${def.sourceBrief} Destination: ${worldName(state, project.source)}.`,
        world,
      );
      familiarity += 1;
      continue;
    }

    if (
      project.stage === 'source'
      && project.source === lifetimeIndex
      && sourceEvidenceMet(def, haul, sites, species)
    ) {
      advance(
        state,
        effects,
        project,
        'return',
        `Evidence secured. Return to ${worldName(state, project.receiver)}: ${def.returnBrief}`,
        world,
      );
      familiarity += 1;
      continue;
    }

    if (
      project.stage === 'return'
      && project.receiver === lifetimeIndex
      && evidence.contacted
      && evidence.readings >= 1
    ) {
      const record = ensureGroundWorld(state, worldKey(project.receiver));
      record.projectSites[project.key] = {
        id: project.key,
        kind: def.result,
        state: 'complete',
        atMs: state.gameTimeMs,
        sourceWorld: project.source,
      };
      project.stage = 'complete';
      project.updatedAtMs = state.gameTimeMs;
      project.completedAtMs = state.gameTimeMs;
      const routeId = `project:${project.key}`;
      const routeName = `${def.routeNoun}: ${worldName(state, project.source)} to ${worldName(state, project.receiver)}`;
      state.expedition.routes[routeId] = {
        id: routeId,
        from: project.source,
        to: project.receiver,
        kind: project.id,
        name: routeName,
        establishedAtMs: state.gameTimeMs,
        trips: 1,
      };
      state.expedition.salvage += def.salvage;
      state.operations.reputation[def.faction] += def.reputation;
      for (const target of [project.source, project.receiver]) {
        recordWorldEvent(state, target, {
          kind: 'projectCompleted',
          id: project.key,
          atGameMs: state.gameTimeMs,
        });
        recordWorldEvent(state, target, {
          kind: 'routeEstablished',
          id: routeId,
          atGameMs: state.gameTimeMs,
        });
      }
      effects.push({
        t: 'fieldProjectCompleted',
        key: project.key,
        id: project.id,
        title: def.name,
        text: def.complete,
        route: routeName,
        salvage: def.salvage,
        reputation: def.reputation,
      });
      familiarity += 1;
    }
  }
  return familiarity;
}

/** A compact atlas that rewards breadth without demanding every rare grammar. */
export function fieldAtlas(record: GroundWorldRecord | undefined): FieldAtlasSummary {
  const checks = [
    { label: 'file a survey', done: record?.surveyedAtMs != null },
    { label: 'catalogue a sample kind', done: Object.keys(record?.samples ?? {}).length > 0 },
    { label: 'catalogue local life', done: Object.keys(record?.species ?? {}).length > 0 },
    { label: 'reach a landmark on foot', done: Object.keys(record?.landmarks ?? {}).length > 0 },
    { label: 'record field-strength weather', done: Object.keys(record?.weather ?? {}).length > 0 },
    {
      label: 'make a civic or field-network contribution',
      done:
        (record?.civicVisits ?? 0) > 0
        || (record?.marks.length ?? 0) >= 2
        || Object.values(record?.projectSites ?? {}).some((site) => site.state === 'complete'),
    },
  ];
  const score = checks.filter((check) => check.done).length;
  return {
    score,
    total: FIELD_ATLAS_TOTAL,
    complete: record?.atlasCompletedAtMs != null || score >= FIELD_ATLAS_THRESHOLD,
    missing: checks.filter((check) => !check.done).map((check) => check.label),
  };
}

export function familiarityService(record: GroundWorldRecord | undefined): string | null {
  if (!record || record.familiarity <= 0) return null;
  const completed = Object.values(record.projectSites)
    .filter((site) => site.state === 'complete')
    .sort((a, b) => b.atMs - a.atMs)[0];
  if (completed && record.familiarity >= 4) return PROJECT_SERVICE_BY_KIND[completed.kind];
  if (record.familiarity >= 5) return 'priority landing bulletin and local field desk';
  if (record.familiarity >= 3) return 'local weather notes and marked return bearings';
  return 'return-visitor landing brief';
}

/** Apply bounded, first-driven familiarity and settle the one-time atlas award. */
export function updateFieldKnowledge(
  state: GameState,
  effects: SimEffect[],
  worldKeyValue: string,
  world: string,
  familiarityGain: number,
): void {
  const record = ensureGroundWorld(state, worldKeyValue);
  const before = record.familiarity;
  record.familiarity = Math.min(FAMILIARITY_MAX, before + Math.max(0, Math.floor(familiarityGain)));
  if (record.familiarity > before) {
    effects.push({
      t: 'familiarityAdvanced',
      worldKey: worldKeyValue,
      world,
      from: before,
      familiarity: record.familiarity,
      service: familiarityService(record),
    });
  }

  const atlas = fieldAtlas(record);
  if (record.atlasCompletedAtMs !== null || atlas.score < FIELD_ATLAS_THRESHOLD) return;
  record.atlasCompletedAtMs = state.gameTimeMs;
  state.expedition.salvage += FIELD_ATLAS_SALVAGE;
  state.operations.reputation.magrathea += FIELD_ATLAS_REPUTATION;
  const lifetimeIndex = Number(worldKeyValue.slice(1));
  if (Number.isFinite(lifetimeIndex)) {
    recordWorldEvent(state, lifetimeIndex, {
      kind: 'atlasCompleted',
      id: worldKeyValue,
      atGameMs: state.gameTimeMs,
    });
  }
  effects.push({
    t: 'fieldAtlasCompleted',
    worldKey: worldKeyValue,
    world,
    score: atlas.score,
    total: atlas.total,
    salvage: FIELD_ATLAS_SALVAGE,
    reputation: FIELD_ATLAS_REPUTATION,
  });
}

export function groundNetwork(record: GroundWorldRecord | undefined): GroundNetworkSummary {
  const count = (kind: GroundWorldRecord['marks'][number]['kind']) =>
    record?.marks.filter((mark) => mark.kind === kind).length ?? 0;
  const beacons = count('beacon');
  const stations = count('station');
  const shelters = count('shelter');
  const repairs = count('repair');
  const services: string[] = [];
  if (beacons > 0) services.push('return beacon');
  if (stations > 0) services.push('station telemetry');
  if (shelters > 0) services.push('field refuge');
  if (repairs > 0) services.push('maintained settlement approach');
  const linked = beacons >= 2 && stations >= 1;
  if (linked) services.unshift('linked field circuit');
  return { beacons, stations, shelters, repairs, linked, services };
}

/** Mobility III turns a useful mark pattern into a named, persistent route. */
export function updateFieldCorridor(
  state: GameState,
  effects: SimEffect[],
  worldKeyValue: string,
  world: string,
): boolean {
  const record = state.expedition.groundWorlds[worldKeyValue];
  const network = groundNetwork(record);
  if (!network.linked || certRank(state.expedition, 'mobility') < 3) return false;
  const id = `corridor:${worldKeyValue}`;
  if (state.expedition.routes[id]) return false;
  const lifetimeIndex = Number(worldKeyValue.slice(1));
  if (!Number.isFinite(lifetimeIndex)) return false;
  const name = `${world} Field Circuit`;
  state.expedition.routes[id] = {
    id,
    from: lifetimeIndex,
    to: lifetimeIndex,
    kind: 'field-corridor',
    name,
    establishedAtMs: state.gameTimeMs,
    trips: 0,
  };
  recordWorldEvent(state, lifetimeIndex, {
    kind: 'routeEstablished',
    id,
    atGameMs: state.gameTimeMs,
  });
  effects.push({
    t: 'fieldRouteEstablished',
    id,
    name,
    world,
    service: network.services.join(', '),
  });
  return true;
}

/** Sold portfolios cannot retain unfinished errands to inaccessible worlds. */
export function retireUnfinishedFieldProjects(state: GameState): void {
  const unfinished = new Set(
    Object.values(state.expedition.fieldProjects)
      .filter((project) => project.stage !== 'complete')
      .map((project) => project.key),
  );
  for (const ground of Object.values(state.expedition.groundWorlds)) {
    for (const key of unfinished) {
      if (ground.projectSites[key]?.state === 'scaffold') delete ground.projectSites[key];
    }
  }
  state.expedition.fieldProjects = Object.fromEntries(
    Object.entries(state.expedition.fieldProjects).filter(([, project]) => project.stage === 'complete'),
  );
}
