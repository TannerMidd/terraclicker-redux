/**
 * The suit's HUD: what a shore party sees.
 *
 * Reads surfaceLive imperatively on a short interval, like the rest of the
 * cockpit — the walk loop runs at frame rate and React has no business
 * rendering at it. Phase chrome:
 *
 *   entry    the canopy, a heat shimmer caption, and the Guide being calm
 *   descent  the approach readout while the ship glides itself in
 *   walk     reticle, compass, samples, and whatever the engage key means
 *   takeoff  the departure readout
 */
import { useEffect, useMemo, useState } from 'react';
import { useUiBus, type GroundfallSession } from '../fx/uiBus';
import {
  fieldVerbs,
  MINING_VERBS,
  SEAM_SENSE_M,
  surfaceDeposits,
  surfaceLandmarkList,
  surfaceLive,
  surfaceMarks,
  surfaceProspects,
  surfaceSeamCensus,
  surfaceSettlementList,
  surfaceVignetteList,
  type FieldVerb,
  type MiningVerb,
} from '../scene/surface/surfaceControl';
import { requestDef } from '../../engine/bridge';
import { REGION_CROSSING_M, SETDOWN_ARM_M } from '../../engine/atmoflight';
import type { GroundObjectiveDef } from '../../content/situations';
import { LANDMARK_SIGHT_M } from '../scene/surface/surfaceLandmarks';
import { SETTLEMENT_SIGHT_M } from '../scene/surface/surfaceSettlements';
import {
  THERMAL_SHIP_RANGE_M,
  THERMAL_SKIMMER_RANGE_M,
  THERMAL_TRAIL_RANGE_M,
  WEATHER_LABEL,
} from '../../engine/weather';
import { SAMPLE_BY_ID } from '../../content/groundSamples';
import { SPECIES_BY_ID } from '../../content/groundSpecies';
import {
  FIELD_PROJECT_BY_ID,
  type FieldProjectDef,
} from '../../content/fieldProjects';
import { CHARTER_BY_ID } from '../../content/charters';
import { FAMILIARITY_MAX, FIELD_ATLAS_THRESHOLD } from '../../engine/fieldProjects';
import { EXPEDITION_ART } from '../assets';
import { flightPrefs, keyLabel } from '../scene/flightBindings';
import { useGame } from '../../state/store';
import { isGroundSurveyed } from '../../engine/groundfall';
import { C } from '../../content/constants';
import { Canopy } from './FlightHUD';

function engageKey(): string {
  return keyLabel(flightPrefs().bindings.engage[0] ?? 'KeyE').toUpperCase();
}

/** The helm's descend key — on the ground it is the skimmer's key. */
function deployKey(): string {
  return keyLabel(flightPrefs().bindings.down[0] ?? 'KeyC').toUpperCase();
}

/** The Guide, on the subject of standing on things. */
const ENTRY_LINES: Record<string, string> = {
  terrestrial: 'The Guide notes that most air is breathable right up until it is not.',
  ice: 'The Guide recommends thick socks, and has nothing further to add.',
  desert: 'The Guide rates this landing "gritty, but character-building".',
  volcanic: 'The Guide files this world under "warm, with opinions".',
  ocean: 'The Guide reminds you that a beach is just a queue for an ocean.',
  gasgiant: 'This line should be unreachable. The Guide is thrilled.',
};

const WALK_HINT = 'move · run · jump — the helm keys, repurposed for legs';
const SKIM_HINT = 'move · fast cruise — the helm keys, repurposed for a sled';

const VERB_LABELS: Record<MiningVerb, string> = {
  break: 'quick break',
  core: 'precision core',
  prospect: 'prospect',
  preserve: 'preserve',
};

const FIELD_LABELS: Record<FieldVerb, string> = {
  pulse: 'field scan',
  reading: 'field reading',
  beacon: 'beacon',
  station: 'station',
  shelter: 'shelter',
  repair: 'repair',
};

/**
 * One open request's live progress, read from the stay so far. `null` means
 * the objective has no counter worth drawing (logistics is flown, not walked).
 */
function objectiveProgress(g: GroundObjectiveDef): { done: boolean; note: string | null } {
  const live = surfaceLive;
  switch (g.kind) {
    case 'survey': {
      const need = g.n ?? C.GROUND_SURVEY_SAMPLES;
      return { done: live.surveyCredit >= need, note: `${Math.min(need, live.surveyCredit)}/${need} credit` };
    }
    case 'species': {
      const need = g.n ?? 1;
      return { done: live.speciesSeen.size >= need, note: `${Math.min(need, live.speciesSeen.size)}/${need} recorded` };
    }
    case 'sample': {
      const need = g.n ?? 1;
      let have = 0;
      for (const h of live.haul) if (h.kind === g.what) have += h.n;
      return { done: have >= need, note: `${Math.min(need, have)}/${need} aboard` };
    }
    case 'landmark': {
      const done = g.what ? live.landmarksStood.has(g.what) : live.landmarksStood.size > 0;
      return { done, note: done ? 'stood at it' : null };
    }
    case 'civic':
      return { done: live.civicStood, note: live.civicStood ? 'call paid' : null };
    case 'weather': {
      const done = g.what ? live.weathered.has(g.what) : live.weathered.size > 0;
      return { done, note: done ? 'stood in it' : null };
    }
    case 'repair': {
      const done = live.marksPlaced.some((m) => m.kind === 'repair');
      return { done, note: done ? 'mended' : null };
    }
    case 'beacon': {
      const done = live.marksPlaced.some((m) => m.kind === 'beacon');
      return { done, note: done ? 'standing' : null };
    }
    case 'logistics':
      return { done: false, note: 'flown, not walked — bring freight' };
    case 'overflight': {
      const need = g.n ?? 12;
      const have = live.charted.size;
      return { done: have >= need, note: `${Math.min(need, have)}/${need} charted` };
    }
    case 'range': {
      const need = g.n ?? REGION_CROSSING_M;
      const have = live.rangeM;
      return {
        done: have >= need,
        note: `${(Math.min(need, have) / 1000).toFixed(1)}/${(need / 1000).toFixed(0)} km out`,
      };
    }
  }
}

/** The stay's open field work, resolved to briefs the suit can show. */
function openGroundWork(
  session: GroundfallSession,
): { uid: number; name: string; brief: string; done: boolean; note: string | null }[] {
  const out: { uid: number; name: string; brief: string; done: boolean; note: string | null }[] = [];
  for (const req of session.openRequests) {
    const def = requestDef(req.id);
    if (!def?.ground) continue;
    const p = objectiveProgress(def.ground);
    out.push({ uid: req.uid, name: def.name, brief: def.ground.brief, done: p.done, note: p.note });
  }
  return out;
}

/** A compass marker: something with a bearing worth carrying. */
interface CompassMark {
  key: string;
  /** World bearing, degrees, 0 = north. */
  deg: number;
  distM: number;
  kind:
    | 'ship'
    | 'site'
    | 'prospect'
    | 'landmark'
    | 'thermal'
    | 'skimmer'
    | 'settlement'
    | 'life'
    | 'beacon'
    | 'mark'
    | 'sense';
}

/** Bearing (deg, 0=N, 90=E) from the walker to a ground point. */
function bearingTo(x: number, z: number): number {
  const dx = x - surfaceLive.pos.x;
  const dz = z - surfaceLive.pos.z;
  return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

function distTo(x: number, z: number): number {
  return Math.hypot(x - surfaceLive.pos.x, z - surfaceLive.pos.z);
}

/**
 * Everything the compass should be carrying right now. In a whiteout the
 * marker rail is gone — snow does not carry a signal — and heat is all that
 * shows: seams close enough to trace, and the runabout's engines while they
 * are still warm enough to find. Getting home becomes navigation.
 */
function compassMarks(certs: Readonly<Record<string, number>>): CompassMark[] {
  const live = surfaceLive;

  // A rank-two skimmer's mast holds the rail through the whiteout — that is
  // the entire meaning of the rank, and it only holds while you are ON it.
  if (live.weather.markersCut && !live.stabilised) {
    const out: CompassMark[] = [];
    const ship = surfaceLive.shipAt;
    const shipD = distTo(ship.x, ship.z);
    if (shipD <= THERMAL_SHIP_RANGE_M) {
      out.push({ key: 'ship', deg: bearingTo(ship.x, ship.z), distM: shipD, kind: 'thermal' });
    }
    if (live.skimmerAt) {
      const sd = distTo(live.skimmerAt.x, live.skimmerAt.z);
      if (sd <= THERMAL_SKIMMER_RANGE_M) {
        out.push({ key: 'skimmer', deg: bearingTo(live.skimmerAt.x, live.skimmerAt.z), distM: sd, kind: 'thermal' });
      }
    }
    for (const d of surfaceSeamCensus()) {
      if (live.mined.has(d.id) || (d.buried && !live.buriedRevealed)) continue;
      const dd = distTo(d.x, d.z);
      if (dd <= THERMAL_TRAIL_RANGE_M) {
        out.push({ key: `t:${d.id}`, deg: bearingTo(d.x, d.z), distM: dd, kind: 'thermal' });
      }
    }
    for (const m of surfaceMarks()) {
      // A beacon broadcasts — the snow cannot eat it. A shelter is warm, and
      // heat is exactly what a whiteout leaves visible.
      if (m.kind === 'beacon') {
        out.push({ key: `mk:${m.x}:${m.z}`, deg: bearingTo(m.x, m.z), distM: distTo(m.x, m.z), kind: 'beacon' });
      } else if (m.kind === 'shelter') {
        const dd = distTo(m.x, m.z);
        if (dd <= THERMAL_SHIP_RANGE_M) {
          out.push({ key: `mk:${m.x}:${m.z}`, deg: bearingTo(m.x, m.z), distM: dd, kind: 'thermal' });
        }
      }
    }
    return out;
  }

  const out: CompassMark[] = [
    {
      key: 'ship',
      deg: bearingTo(live.shipAt.x, live.shipAt.z),
      distM: distTo(live.shipAt.x, live.shipAt.z),
      kind: 'ship',
    },
  ];
  if (live.skimmerAt) {
    out.push({
      key: 'skimmer',
      deg: bearingTo(live.skimmerAt.x, live.skimmerAt.z),
      distM: distTo(live.skimmerAt.x, live.skimmerAt.z),
      kind: 'skimmer',
    });
  }
  for (const d of surfaceDeposits()) {
    if (!live.scanned.has(d.id) || live.mined.has(d.id)) continue;
    out.push({ key: d.id, deg: bearingTo(d.x, d.z), distM: distTo(d.x, d.z), kind: 'site' });
  }
  for (const d of surfaceProspects()) {
    out.push({ key: `p:${d.id}`, deg: bearingTo(d.x, d.z), distM: distTo(d.x, d.z), kind: 'prospect' });
  }
  for (const l of surfaceLandmarkList()) {
    const dd = distTo(l.x, l.z);
    // Charted from the air, or close enough to see for yourself.
    if (dd <= LANDMARK_SIGHT_M || live.charted.has(l.id)) {
      out.push({ key: l.id, deg: bearingTo(l.x, l.z), distM: dd, kind: 'landmark' });
    }
  }
  // Settlements carry far: a town is the easiest thing on a world to find.
  for (const sd of surfaceSettlementList()) {
    out.push({ key: sd.id, deg: bearingTo(sd.x, sd.z), distM: distTo(sd.x, sd.z), kind: 'settlement' });
  }
  // Vignette life in sight — the biologger's marks.
  for (const vg of surfaceVignetteList()) {
    const dd = distTo(vg.x, vg.z);
    if (dd <= LANDMARK_SIGHT_M || live.charted.has(vg.id)) {
      out.push({ key: vg.id, deg: bearingTo(vg.x, vg.z), distM: dd, kind: 'life' });
    }
  }
  // The marks you left: beacons carry from anywhere in the region, the rest
  // ride the rail like the working sites they are.
  for (const m of surfaceMarks()) {
    if (m.kind === 'repair') continue; // a repair is the town's, not the rail's
    out.push({
      key: `mk:${m.x.toFixed(0)}:${m.z.toFixed(0)}`,
      deg: bearingTo(m.x, m.z),
      distM: distTo(m.x, m.z),
      kind: m.kind === 'beacon' ? 'beacon' : 'mark',
    });
  }
  // Geology I — seam sense: unscanned ground close enough to feel stands on
  // the rail unlabelled. A hunch, drawn as a hunch.
  if ((certs['geology'] ?? 0) >= 1) {
    for (const d of surfaceDeposits()) {
      if (live.scanned.has(d.id) || live.mined.has(d.id)) continue;
      const dd = distTo(d.x, d.z);
      if (dd <= SEAM_SENSE_M) {
        out.push({ key: `sn:${d.id}`, deg: bearingTo(d.x, d.z), distM: dd, kind: 'sense' });
      }
    }
  }
  // Charted from the air (Phase 6): a seam the sweep found rides the rail at
  // any range, and stays a HUNCH — the sweep places things, it never reads
  // them. Walking over it with the field kit is still the only way to know.
  if (live.charted.size > 0) {
    for (const d of surfaceDeposits()) {
      if (!live.charted.has(d.id) || live.scanned.has(d.id) || live.mined.has(d.id)) continue;
      const dd = distTo(d.x, d.z);
      if (dd <= SEAM_SENSE_M && (certs['geology'] ?? 0) >= 1) continue; // already on
      out.push({ key: `ch:${d.id}`, deg: bearingTo(d.x, d.z), distM: dd, kind: 'sense' });
    }
  }
  return out;
}

/** The nearest named place in sight, for the line under the compass. A
 * settlement outranks scenery at equal distance — towns have addresses. */
function nearestLandmark(): { name: string; distM: number } | null {
  let best: { name: string; distM: number } | null = null;
  for (const l of surfaceLandmarkList()) {
    const dd = distTo(l.x, l.z);
    if (dd <= LANDMARK_SIGHT_M && (!best || dd < best.distM)) best = { name: l.name, distM: dd };
  }
  for (const sd of surfaceSettlementList()) {
    const dd = distTo(sd.x, sd.z);
    if (dd <= SETTLEMENT_SIGHT_M && (!best || dd <= best.distM)) {
      best = { name: sd.lit ? `the lights of ${sd.name}` : `${sd.name}, dark`, distM: dd };
    }
  }
  return best;
}

/** The weather, in one honest line. */
function weatherLine(): string | null {
  const w = surfaceLive.weather;
  const o = surfaceLive.outlook;
  const mins = (ms: number) => {
    const m = Math.max(1, Math.round(ms / 60_000));
    return `~${m} min`;
  };
  if (w.kind === 'clear') {
    if (o && o.kind !== 'clear') return `clear · ${WEATHER_LABEL[o.kind]} in ${mins(o.inMs)}`;
    return null; // clear skies with no news are not a headline
  }
  const grade = w.intensity < 0.35 ? 'light' : w.intensity < 0.7 ? 'steady' : 'heavy';
  let line = `${WEATHER_LABEL[w.kind]} · ${grade}`;
  if (o) line += o.kind === 'clear' ? ` · clearing in ${mins(o.inMs)}` : ` · ${WEATHER_LABEL[o.kind]} in ${mins(o.inMs)}`;
  if (surfaceLive.stabilised && (w.markersCut || w.scanRangeMult < 0.95)) {
    line += ' · the mast holds';
  } else if (w.markersCut) line += ' · markers lost, thermal trace only';
  else if (w.buriedRevealed) line += ' · the sand has moved';
  else if (w.scanRangeMult > 1.1) line += ' · the pulse carries further';
  return line;
}

function projectLiveProgress(): { contacted: boolean; readings: number } {
  return {
    contacted: surfaceLive.contacted,
    readings: Math.max(0, Math.floor(surfaceLive.readings)),
  };
}

function titleFromId(value: string): string {
  return value
    .split('-')
    .map((part) => part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part)
    .join(' ');
}

function readableList(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function sourceMethod(def: FieldProjectDef, source: string): string {
  const methods: string[] = [];
  if (def.sourceSamples?.length) {
    const names = def.sourceSamples.map((id) => SAMPLE_BY_ID[id]?.name ?? titleFromId(id));
    methods.push(`identify ${readableList(names)} with the field scan, then recover one documented sample`);
  }
  if (def.sourceSpecies?.length) {
    const names = def.sourceSpecies.map((id) => SPECIES_BY_ID[id]?.name ?? titleFromId(id));
    methods.push(`record ${readableList(names)} with the biologger`);
  }
  if (def.allowPreserve) methods.push('mark one viable habitat for preservation instead of extracting it');
  return methods.length > 0
    ? `On ${source}, ${readableList(methods)}. A single compatible record is enough because this leg establishes suitability, not volume.`
    : `On ${source}, document one compatible field source. The record establishes suitability; this is not a bulk-material order.`;
}

function sourceEvidence(def: FieldProjectDef): { done: boolean; note: string } {
  const sample = def.sourceSamples?.find((kind) =>
    surfaceLive.haul.some((item) => item.kind === kind && item.n > 0));
  if (sample) return { done: true, note: `${SAMPLE_BY_ID[sample]?.name ?? titleFromId(sample)} documented` };

  const species = def.sourceSpecies?.find((id) => surfaceLive.speciesSeen.has(id));
  if (species) return { done: true, note: `${SPECIES_BY_ID[species]?.name ?? titleFromId(species)} recorded` };

  if (def.allowPreserve && [...surfaceLive.outcomes.values()].some((outcome) => outcome === 'preserved')) {
    return { done: true, note: 'intact habitat preserved' };
  }
  return { done: false, note: 'no compatible source documented this stay' };
}

interface ProjectLesson {
  step: string;
  proves: string;
  method: string;
  needsTerminal: boolean;
  readingsNeeded: number;
  sourceCheck: boolean;
}

function projectLesson(session: GroundfallSession, def: FieldProjectDef): ProjectLesson {
  const project = session.project!;
  const here = project.role === 'receiver' ? project.receiver.name : project.source.name;
  switch (project.stage) {
    case 'investigate':
      if (project.role === 'receiver') {
        return {
          step: 'Diagnose the receiving world',
          proves: 'The terminal supplies the civic problem; three separated readings show that it is a district-scale pattern rather than one faulty fixture.',
          method: `Consult the settlement terminal at ${here}. Select Field Reading with the wheel, take a reading, then move to a clearly different part of the district before repeating. Separation is what makes the comparison useful.`,
          needsTerminal: true,
          readingsNeeded: 3,
          sourceCheck: false,
        };
      }
      return {
        step: 'Define the problem before choosing its answer',
        proves: `Evidence from ${project.source.name} is only useful after ${project.receiver.name} has established what must be solved. This prevents a convenient sample from becoming a solution in search of a problem.`,
        method: `The active investigation is on ${project.receiver.name}. Return there, consult its settlement terminal, and compare three district readings; this source world becomes relevant on the next leg.`,
        needsTerminal: false,
        readingsNeeded: 0,
        sourceCheck: false,
      };
    case 'source':
      if (project.role === 'source') {
        return {
          step: 'Establish a compatible source',
          proves: `A named sample, species record, or preserved habitat ties ${project.source.name}'s real conditions to the need measured on ${project.receiver.name}. The project needs provenance, not an anonymous resource counter.`,
          method: sourceMethod(def, project.source.name),
          needsTerminal: false,
          readingsNeeded: 0,
          sourceCheck: true,
        };
      }
      return {
        step: 'Follow the diagnosis to its source',
        proves: `The local readings now define the requirement. The next question is whether ${project.source.name} can satisfy it under observed field conditions.`,
        method: `Travel to ${project.source.name}. ${sourceMethod(def, project.source.name)}`,
        needsTerminal: false,
        readingsNeeded: 0,
        sourceCheck: false,
      };
    case 'return':
      if (project.role === 'receiver') {
        return {
          step: 'Test the answer where it will live',
          proves: 'The returning field evidence is not accepted on reputation alone. One local calibration reading verifies that it behaves under the receiving settlement’s actual conditions.',
          method: `Consult the terminal at ${project.receiver.name} to attach the source record, then take one Field Reading near the project scaffold. Boarding files the calibration and completes the installation.`,
          needsTerminal: true,
          readingsNeeded: 1,
          sourceCheck: false,
        };
      }
      return {
        step: 'Carry the evidence back to the receiver',
        proves: `${project.source.name}'s evidence is secured. The remaining test is local calibration on ${project.receiver.name}; source conditions alone cannot prove the installation will work there.`,
        method: `Return to ${project.receiver.name}, consult its settlement terminal, and take one Field Reading near the scaffold before boarding.`,
        needsTerminal: false,
        readingsNeeded: 0,
        sourceCheck: false,
      };
    case 'complete':
      return {
        step: 'A working relationship, not a completed checklist',
        proves: `${def.complete} The result persists because both the source evidence and receiving-world calibration are now on file.`,
        method: `Revisiting either world now reveals what the project left behind: ${def.service}, joined by the named ${def.routeNoun}.`,
        needsTerminal: false,
        readingsNeeded: 0,
        sourceCheck: false,
      };
  }
}

const PROJECT_STAGE_LABEL: Record<NonNullable<GroundfallSession['project']>['stage'], string> = {
  investigate: '1 of 3 - diagnose',
  source: '2 of 3 - establish source',
  return: '3 of 3 - calibrate',
  complete: 'result in service',
};

const SPECIALTY_LABEL: Record<string, string> = {
  thermal: 'thermal works',
  atmo: 'atmospheric works',
  hydro: 'water systems',
  bio: 'living systems',
  science: 'field science',
  production: 'civic production',
};

function BriefProgress({ done, label, note }: { done: boolean; label: string; note: string }) {
  return (
    <div className={`sh-brief-progress${done ? ' done' : ''}`}>
      <i aria-hidden>{done ? 'OK' : 'NEXT'}</i>
      <span><b>{label}</b><em>{note}</em></span>
    </div>
  );
}

/** A lesson carried into the field, plus the durable knowledge already earned here. */
function FieldNotebook({ session }: { session: GroundfallSession }) {
  const project = session.project;
  const def = project ? FIELD_PROJECT_BY_ID[project.id] : null;
  const liveProgress = projectLiveProgress();
  const lesson = project && def ? projectLesson(session, def) : null;
  const source = project && def && lesson?.sourceCheck ? sourceEvidence(def) : null;
  const projectSite = project ? session.projectSites.find((site) => site.id === project.key) : null;
  const charter = session.charterId ? CHARTER_BY_ID[session.charterId] : null;
  const systemName = session.systemIndex === null ? null : `System ${session.systemIndex + 1}`;
  const specialty = session.systemSpecialty
    ? SPECIALTY_LABEL[session.systemSpecialty] ?? titleFromId(session.systemSpecialty)
    : null;
  const atlasRequired = FIELD_ATLAS_THRESHOLD;
  const nextAtlas = session.atlas.complete
    ? session.atlas.score >= session.atlas.total
      ? 'filed; all six categories recorded'
      : `filed; optional: ${session.atlas.missing[0] ?? 'record the sixth field category'}`
    : `next required: ${session.atlas.missing[0] ?? 'one more field category'}`;
  const atlasPct = atlasRequired > 0
    ? Math.min(100, (session.atlas.score / atlasRequired) * 100)
    : 0;
  const networkName = session.routes.find((route) => route.id.startsWith('corridor:'))?.name
    ?? (session.network.linked ? `${session.name} Linked Field Circuit` : null);
  const projectRoute = project
    ? session.routes.find((route) => route.id.includes(project.key))?.name
      ?? `${def?.routeNoun ?? 'Field route'}: ${project.source.name} to ${project.receiver.name}`
    : null;
  const otherRoutes = session.routes.filter((route) => !project || !route.id.includes(project.key));
  const hasContext = Boolean(
    project
    || session.atlas.score > 0
    || session.familiarity > 0
    || session.network.services.length > 0
    || session.routes.length > 0
    || systemName,
  );
  if (!hasContext) return null;

  return (
    <aside className={`sh-field-brief${project ? '' : ' compact'}`} aria-label="field brief and atlas">
      {project && def && lesson && (
        <section className="sh-project-lesson">
          <header>
            <span className="sh-brief-kicker">FIELD CASE</span>
            <span className={`sh-brief-stage ${project.stage}`}>{PROJECT_STAGE_LABEL[project.stage]}</span>
            <h2>{def.name}</h2>
            <p className="sh-brief-route">{project.source.name} <span aria-hidden>to</span> {project.receiver.name}</p>
          </header>

          <div className="sh-brief-why">
            <b>Why this matters</b>
            <p>{def.guide}</p>
          </div>
          <div className="sh-brief-teach">
            <b>{lesson.step}</b>
            <p><strong>What it proves.</strong> {lesson.proves}</p>
            <p><strong>How the method works.</strong> {lesson.method}</p>
          </div>

          {(lesson.needsTerminal || lesson.readingsNeeded > 0 || source) && (
            <div className="sh-brief-progress-list" aria-label="live field evidence">
              {lesson.needsTerminal && (
                <BriefProgress
                  done={liveProgress.contacted}
                  label="Settlement context"
                  note={liveProgress.contacted ? 'terminal consulted this stay' : 'consult the settlement terminal'}
                />
              )}
              {lesson.readingsNeeded > 0 && (
                <BriefProgress
                  done={liveProgress.readings >= lesson.readingsNeeded}
                  label="Separated readings"
                  note={`${Math.min(lesson.readingsNeeded, liveProgress.readings)}/${lesson.readingsNeeded} recorded this stay`}
                />
              )}
              {source && (
                <BriefProgress done={source.done} label="Source provenance" note={source.note} />
              )}
            </div>
          )}

          <footer className="sh-brief-outcome">
            <span><b>{project.stage === 'complete' ? 'Result' : 'What this unlocks'}</b> {def.service}</span>
            <span><b>Route</b> {projectRoute}</span>
            <span><b>{project.stage === 'complete' ? 'Filed' : 'On completion'}</b> {def.salvage} salvage + {def.reputation} {titleFromId(def.faction)} reputation</span>
            {projectSite && <span><b>Site</b> {projectSite.state === 'complete' ? 'installation operating' : 'scaffold standing at the receiver'}</span>}
          </footer>
        </section>
      )}

      <section className="sh-field-record" aria-label="local field record">
        <div className="sh-record-heading">
          <span className="sh-brief-kicker">FIELD RECORD</span>
          {systemName && <b>{systemName}</b>}
        </div>
        {(charter || specialty) && (
          <p className="sh-system-identity">
            {charter?.name ?? titleFromId(session.charterId ?? '')}
            {specialty ? ` / ${specialty}` : ''}
          </p>
        )}
        <div className="sh-atlas-row">
          <span><b>Atlas {Math.min(session.atlas.score, atlasRequired)}/{atlasRequired}{session.atlas.complete ? ' / FILED' : ''}</b><em>{nextAtlas}</em></span>
          <i className="sh-atlas-track" role="progressbar" aria-valuenow={Math.min(session.atlas.score, atlasRequired)} aria-valuemax={atlasRequired}>
            <i style={{ width: `${atlasPct}%` }} />
          </i>
        </div>
        <div className="sh-record-grid">
          <span><b>Familiarity {session.familiarity}/{FAMILIARITY_MAX}</b><em>{session.familiarityService ?? 'learn this place through distinct field firsts'}</em></span>
          <span>
            <b>{networkName ?? 'Field network'}</b>
            <em>{session.network.services.length > 0 ? session.network.services.join(' / ') : 'beacons, stations, shelters, and repairs become local services'}</em>
          </span>
        </div>
        {otherRoutes.length > 0 && (
          <p className="sh-known-routes">
            <b>Known route</b> {otherRoutes[0]!.name}{otherRoutes.length > 1 ? ` + ${otherRoutes.length - 1} more` : ''}
          </p>
        )}
      </section>
    </aside>
  );
}

export function SurfaceHUD() {
  const session = useUiBus((b) => b.groundfall);
  if (!session) return null;
  return <SurfaceHUDInner session={session} />;
}

function SurfaceHUDInner({ session }: { session: GroundfallSession }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 120);
    return () => window.clearInterval(id);
  }, []);

  const surveyed = useGame((g) => isGroundSurveyed(g.s, session.worldKey));
  const live = surfaceLive;
  const entryLine = useMemo(
    () => ENTRY_LINES[session.type] ?? ENTRY_LINES['terrestrial']!,
    [session.type],
  );

  if (live.phase === 'entry') {
    const pct = Math.round(live.genProgress * 100);
    return (
      <div className="sh-hud" aria-live="polite">
        <Canopy />
        <div className="sh-entry">
          <div className="sh-kicker">ATMOSPHERIC INTERFACE</div>
          <div className="sh-title">{session.name}</div>
          <div className="sh-line">{entryLine}</div>
          <div className="sh-progress" role="progressbar" aria-valuenow={pct}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="sh-sub">hull temperature: reassuring shade of orange · surveying terrain {pct}%</div>
        </div>
      </div>
    );
  }

  if (live.phase === 'descent' || live.phase === 'takeoff') {
    const leaving = live.phase === 'takeoff';
    return (
      <div className="sh-hud" aria-live="polite">
        <div className="sh-entry">
          <div className="sh-kicker">{leaving ? 'DEPARTURE' : 'ON FINAL'}</div>
          <div className="sh-title">{session.name}</div>
          <div className="sh-alt">{Math.max(0, Math.round(live.alt)).toLocaleString()} m</div>
          <div className="sh-line">
            {leaving
              ? 'The runabout files the surface under "visited" and means it as a compliment.'
              : 'The autoland would like everyone to remain impressed but seated.'}
          </div>
        </div>
      </div>
    );
  }

  if (live.phase === 'fly') return <FlyingHUD session={session} />;

  // ————— On foot, or on the sled —————
  const skimming = live.phase === 'skim';
  const heading = ((-live.yaw * 180) / Math.PI % 360 + 360) % 360;
  const prompt = live.prompt;
  const mining = prompt?.verb === 'mine' && live.mineProgress > 0;
  const scanning = live.scanCharge > 0;
  const locked = typeof document !== 'undefined' && document.pointerLockElement != null;
  const surveyNeed = C.GROUND_SURVEY_SAMPLES;
  const surveyProgress = Math.min(surveyNeed, live.surveyCredit);

  // The haul, aggregated by kind for the ledger. Three lines, then "and more".
  const carried = new Map<string, number>();
  for (const h of live.haul) carried.set(h.kind, (carried.get(h.kind) ?? 0) + h.n);
  const carriedRows = [...carried.entries()].sort((a, b) => b[1] - a[1]);

  const target = live.target;
  const targetScanned = target != null && live.scanned.has(target.id);
  const targetKind = targetScanned ? SAMPLE_BY_ID[target.kind] : undefined;
  const ringProgress = scanning ? live.scanCharge : live.mineProgress;

  const wx = weatherLine();
  const lm = nearestLandmark();
  const missions = openGroundWork(session);
  const kit = fieldVerbs();
  const kitOpen = !skimming && !target && kit.length > 1 && locked && !live.prompt?.blocked;

  return (
    <div className="sh-hud">
      <Compass heading={heading} marks={compassMarks(session.certs)} />
      <FieldNotebook session={session} />
      {(wx || lm) && (
        <div className="sh-conditions">
          {wx && <span className={`sh-weather${live.weather.intensity >= 0.7 ? ' hard' : ''}`}>{wx}</span>}
          {lm && (!live.weather.markersCut || live.stabilised) && (
            <span className="sh-landmark">
              ⌖ {lm.name} · {lm.distM >= 950 ? `${(lm.distM / 1000).toFixed(1)} km` : `${Math.round(lm.distM)} m`}
            </span>
          )}
        </div>
      )}

      {skimming && (
        <div className="sh-skim" aria-label={`ground speed ${Math.round(live.skimSpeed)} metres per second`}>
          <b>{Math.round(live.skimSpeed)}</b> m/s
          {/* The badge earns its place only when there is weather to hold off. */}
          {live.stabilised && (live.weather.markersCut || live.weather.scanRangeMult < 0.95) && (
            <em>mast stabilised</em>
          )}
        </div>
      )}

      <div className={`sh-reticle${mining || scanning ? ' working' : ''}${scanning ? ' scanning' : ''}`} aria-hidden>
        <svg viewBox="0 0 48 48">
          <circle className="sh-ret-dot" cx="24" cy="24" r="1.6" />
          <circle
            className="sh-ret-ring"
            cx="24"
            cy="24"
            r="14"
            style={{
              strokeDasharray: 88,
              strokeDashoffset: 88 * (1 - ringProgress),
            }}
          />
        </svg>
      </div>

      <div className="sh-samples">
        <b>{live.samples}</b> samples
        {carriedRows.slice(0, 3).map(([kind, n]) => (
          <em key={kind}>
            {n}× {SAMPLE_BY_ID[kind]?.name ?? kind}
          </em>
        ))}
        {carriedRows.length > 3 && <em>… and {carriedRows.length - 3} more kinds</em>}
        <em>
          {surveyed
            ? 'ground survey on file'
            : `survey: ${surveyProgress}/${surveyNeed} credit to file`}
        </em>
        <em className="sh-world">{session.name} · {skimming ? 'skimming' : 'on foot'}</em>
      </div>

      {missions.length > 0 && (
        <div className="sh-missions" aria-label="open field work">
          {missions.map((m) => (
            <div key={m.uid} className={`sh-mission${m.done ? ' done' : ''}`}>
              <b>{m.done ? '✓' : '✦'} {m.name}</b>
              <em>{m.done ? 'done — settles when you board' : m.brief}{!m.done && m.note ? ` · ${m.note}` : ''}</em>
            </div>
          ))}
        </div>
      )}

      {targetScanned && targetKind && (
        <div className="sh-assay">
          {/* The assay ledger stopped being text-only (ASSET_UPLIFT.md 6.4). */}
          <img className="sh-assay-art" src={EXPEDITION_ART.sample(target.kind)} alt="" aria-hidden />
          <span className="sh-assay-kind">◈ {targetKind.name}</span>
          <span className="sh-assay-sub">seam of {target.richness} · {targetKind.salvage} salvage each</span>
          <div className="sh-verbs" role="radiogroup" aria-label="extraction method">
            {MINING_VERBS.map((v, i) => (
              <span key={v} className={`sh-verb${i === live.verbIdx ? ' on' : ''}`} aria-checked={i === live.verbIdx} role="radio">
                {VERB_LABELS[v]}
              </span>
            ))}
          </div>
          <span className="sh-assay-hint">wheel — choose method</span>
        </div>
      )}

      {kitOpen && (
        <div className="sh-assay sh-fieldkit">
          <div className="sh-verbs" role="radiogroup" aria-label="field kit">
            {kit.map((v, i) => (
              <span key={v} className={`sh-verb${i === live.fieldIdx ? ' on' : ''}`} aria-checked={i === live.fieldIdx} role="radio">
                {FIELD_LABELS[v]}
              </span>
            ))}
          </div>
          <span className="sh-assay-hint">wheel — choose field work</span>
        </div>
      )}

      {prompt && (
        <div className={`sh-prompt${prompt.blocked ? ' blocked' : ''}`}>
          {prompt.blocked ?? `${prompt.verb === 'board' ? 'press' : 'hold'} ${engageKey()} — ${prompt.label}`}
        </div>
      )}
      {!prompt && live.wadeRefused && (
        <div className="sh-prompt blocked">
          {skimming
            ? live.skimRank >= 3
              ? 'the lava declines the hull, the hull declines the lava'
              : 'the cushion declines open water — an amphibious hull remains a rumour'
            : live.skimRank >= 1
              ? 'the suit declines to swim — the skimmer has fewer objections'
              : 'the suit declines to swim — a skimmer remains, for now, a rumour'}
        </div>
      )}
      {!prompt && !live.wadeRefused && !locked && <div className="sh-prompt dim">click to look around</div>}
      {!prompt && !live.wadeRefused && locked && !scanning && (
        <div className="sh-prompt dim">
          hold {engageKey()} — field scan · {Math.round(live.scanRangeNow)} m
          {live.scanRangeNow < live.scanRange * 0.9 && !live.stabilised ? ' (the dust is eating it)' : ''}
        </div>
      )}
      {scanning && !prompt && <div className="sh-prompt">field scan charging…</div>}
      {live.skimPrompt && (
        <div className={`sh-prompt${live.t < live.skimNoteUntil ? ' blocked' : ' dim'} sh-skimline`}>
          {live.t < live.skimNoteUntil ? live.skimPrompt : `tap ${deployKey()} — ${live.skimPrompt}`}
        </div>
      )}

      <div className="sh-hint">{skimming ? SKIM_HINT : WALK_HINT}</div>
    </div>
  );
}

/** Signed shortest offset from the current heading, wrapped to ±180. */
function wrapOffset(deg: number, heading: number): number {
  let off = deg - heading;
  if (off > 180) off -= 360;
  if (off < -180) off += 360;
  return off;
}

const MARK_GLYPH: Record<CompassMark['kind'], string> = {
  ship: '▲',
  site: '◆',
  prospect: '▮',
  landmark: '⌖',
  thermal: '◉',
  skimmer: '▽',
  settlement: '⌂',
  life: '✳',
  beacon: '✦',
  mark: '▪',
  sense: '·',
};

/**
 * Rail kinds with a drawn icon in the compass sprite sheet (6.5). The sheet
 * covers the five STANDING-mark symbols; the rail's other kinds (ship, site,
 * life…) keep their text glyphs until the sheet grows.
 */
const MARK_ICON: Partial<Record<CompassMark['kind'], string>> = {
  beacon: 'beacon',
  prospect: 'prospect',
  mark: 'station',
};

function railGlyph(kind: CompassMark['kind']) {
  const icon = MARK_ICON[kind];
  if (!icon) return MARK_GLYPH[kind];
  return (
    <svg className="sh-mark-icon" viewBox="0 0 24 30" aria-hidden>
      <use href={`${EXPEDITION_ART.compassSprite}#mark-${icon}`} />
    </svg>
  );
}

/**
 * A sliding tape compass; ticks every 15°, cardinals where they fall, and a
 * marker layer riding under the tape — the runabout always, every site the
 * scanner has resolved, every prospect stake standing.
 */
/**
 * The cockpit, at two hundred metres (Phase 6).
 *
 * Deliberately the same furniture as the walk — the compass rail, the
 * conditions line, the open requests — because it is the same stay and the
 * same region, seen from higher up. What is new is what a pilot actually
 * needs: height above the ground, speed over it, how much ceiling the
 * package has left, and what the gear thinks of the ground below.
 */
function FlyingHUD({ session }: { session: GroundfallSession }) {
  const live = surfaceLive;
  const heading = ((-live.yaw * 180) / Math.PI % 360 + 360) % 360;
  const wx = weatherLine();
  const missions = openGroundWork(session);
  const script = live.flyScript;
  const ceilK = live.ceilingM > 0 ? Math.min(1, live.alt / live.ceilingM) : 0;
  const sweeping = live.sweepM > 0;
  const setdown = live.setdown;
  return (
    <div className="sh-hud">
      {!live.chaseView && <Canopy steady />}
      <Compass heading={heading} marks={compassMarks(session.certs)} />
      <FieldNotebook session={session} />
      {wx && (
        <div className="sh-conditions">
          <span className={`sh-weather${live.weather.intensity >= 0.7 ? ' hard' : ''}`}>{wx}</span>
        </div>
      )}

      <div className="sh-fly" aria-label={`altitude ${Math.round(live.alt)} metres, ${Math.round(live.airSpeed)} metres per second`}>
        <div className="sh-fly-row">
          <b>{Math.round(live.alt).toLocaleString()}</b> m AGL
          <em>{Math.round(live.airSpeed)} m/s</em>
        </div>
        <div className={`sh-fly-ceiling${ceilK > 0.94 ? ' at-limit' : ''}`} role="progressbar" aria-valuenow={Math.round(ceilK * 100)}>
          <i style={{ width: `${Math.round(ceilK * 100)}%` }} />
        </div>
        <div className="sh-fly-sub">
          {sweeping ? (
            <span className="sh-sweep">
              ◎ sweep {Math.round(live.sweepM)} m · {live.charted.size} charted
            </span>
          ) : (
            <span className="sh-sweep dim">◎ too high to resolve ground</span>
          )}
        </div>
      </div>

      {missions.length > 0 && (
        <div className="sh-missions">
          {missions.map((m) => (
            <div key={m.uid} className={`sh-mission${m.done ? ' done' : ''}`}>
              <b>{m.name}</b>
              <span>{m.brief}</span>
              {m.note && <em>{m.note}</em>}
            </div>
          ))}
        </div>
      )}

      <div className="sh-prompt fly" aria-live="polite">
        {script ? (
          <b>{script.kind === 'lift' ? 'lifting…' : 'setting down…'}</b>
        ) : (
          <>
            <b>
              {live.orbitHold > 0.12
                ? 'breaking for orbit…'
                : `hold ${engageKey()} to break for orbit`}
            </b>
            <span className={setdown && !setdown.ok ? 'blocked' : undefined}>
              {live.flyPrompt ?? `hold ${deployKey()} below ${SETDOWN_ARM_M} m to set down`}
            </span>
          </>
        )}
      </div>
      <div className="sh-hint">
        thrust · slide · rise / descend · {viewKey()} swaps the view — the helm keys, in air
      </div>
    </div>
  );
}

/** The helm's camera key, which does its own job again up here. */
function viewKey(): string {
  return keyLabel(flightPrefs().bindings.cameraView[0] ?? 'KeyV').toUpperCase();
}

function Compass({ heading, marks }: { heading: number; marks: CompassMark[] }) {
  const ticks = useMemo(() => {
    const out: { deg: number; label: string | null }[] = [];
    for (let d = 0; d < 360; d += 15) {
      const label = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : null;
      out.push({ deg: d, label });
    }
    return out;
  }, []);
  const PX_PER_DEG = 2.4;
  return (
    <div className="sh-compass" aria-label={`heading ${Math.round(heading)} degrees`}>
      <div className="sh-compass-window">
        {ticks.map((t) => {
          const off = wrapOffset(t.deg, heading);
          if (Math.abs(off) > 70) return null;
          return (
            <span
              key={t.deg}
              className={`sh-tick${t.label ? ' cardinal' : ''}`}
              style={{ transform: `translateX(${off * PX_PER_DEG}px)` }}
            >
              {t.label ?? '·'}
            </span>
          );
        })}
        <i className="sh-lubber" />
      </div>
      <div className="sh-marks">
        {marks.map((m) => {
          const off = wrapOffset(m.deg, heading);
          if (Math.abs(off) > 70) return null;
          const dist = m.distM >= 950 ? `${(m.distM / 1000).toFixed(1)}k` : `${Math.round(m.distM)}m`;
          return (
            <span
              key={m.key}
              className={`sh-mark ${m.kind}`}
              style={{ transform: `translateX(${off * PX_PER_DEG}px)` }}
            >
              {railGlyph(m.kind)}
              <i>{dist}</i>
            </span>
          );
        })}
      </div>
      <div className="sh-compass-deg">{Math.round(heading).toString().padStart(3, '0')}°</div>
    </div>
  );
}
