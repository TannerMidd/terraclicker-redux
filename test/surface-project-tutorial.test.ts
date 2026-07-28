import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { newGame } from '../src/engine/sim';
import { deserialize, serialize } from '../src/engine/save/codec';
import { createWorldRecord } from '../src/engine/worldRecords';
import {
  settlementApproach,
  settlementRoster,
  settlementSpecOf,
} from '../src/engine/settlements';
import type {
  CompletedPlanetRecord,
  FieldProjectStage,
} from '../src/engine/types';
import type { GroundfallSession } from '../src/ui/fx/uiBus';
import {
  beginGroundfall,
  beginTakeoff,
  configureTierSpecsForTests,
  endGroundfall,
  EYE,
  fieldVerbs,
  PROJECT_CONTACT_SECONDS,
  PROJECT_READING_SECONDS,
  PROJECT_READING_SEPARATION_M,
  projectReadingGoal,
  stepSurface,
  surfaceDeposits,
  surfaceInput,
  surfaceLive,
  surfaceParams,
  surfaceSettlementList,
  surfaceTiers,
  type GroundfallPhase,
} from '../src/ui/scene/surface/surfaceControl';
import {
  heightAt,
  PLANET_RADIUS_M,
} from '../src/ui/scene/surface/terrainField';
import { useGame } from '../src/state/store';
import { useUiBus } from '../src/ui/fx/uiBus';

const WORLD_ID = 7;
const SOURCE_ID = 8;
const PROJECT_KEY = 'test:reef-memory';
const ONES = { thermal: 1, atmo: 1, hydro: 1, bio: 1 };
const INSTALLATIONS = ['seedProbe', 'atmoProcessor', 'researchLab'];

function completedWorld(seed: number): CompletedPlanetRecord {
  return {
    lifetimeIndex: WORLD_ID,
    seed,
    type: 'terrestrial',
    size: 'medium',
    name: 'Receiver Vale',
    quirks: [],
    survey: null,
    completionMs: 1,
    bottleneck: 'hydro',
    installations: [...INSTALLATIONS],
  };
}

function settlementDirection(): { seed: number; dir: [number, number, number] } {
  for (let seed = 9100; seed < 9140; seed++) {
    const roster = settlementRoster(settlementSpecOf({
      seed,
      type: 'terrestrial',
      size: 'medium',
      lifetimeIndex: WORLD_ID,
      installations: INSTALLATIONS,
      quirks: [],
    }));
    const spot = roster[0];
    if (spot) return { seed, dir: [...spot.dir] as [number, number, number] };
  }
  throw new Error('no deterministic settlement found for the tutorial test');
}

/**
 * Pick a nearby wilderness frame outside every settlement snap cone. The old
 * readings remain on the facing hemisphere, so recovery must reproject their
 * planet directions instead of accidentally treating old local metres as new.
 */
function wildernessDirection(
  seed: number,
  from: readonly [number, number, number],
): [number, number, number] {
  const base = new Vector3(...from).normalize();
  const reference = Math.abs(base.y) < 0.9
    ? new Vector3(0, 1, 0)
    : new Vector3(1, 0, 0);
  const tangent = new Vector3().crossVectors(reference, base).normalize();
  const bitangent = new Vector3().crossVectors(base, tangent).normalize();
  const spec = settlementSpecOf({
    seed,
    type: 'terrestrial',
    size: 'medium',
    lifetimeIndex: WORLD_ID,
    installations: INSTALLATIONS,
    quirks: [],
  });

  for (const angle of [0.205, 0.23, 0.27, 0.32, 0.4]) {
    for (let spoke = 0; spoke < 24; spoke++) {
      const azimuth = (spoke / 24) * Math.PI * 2;
      const candidate = base.clone()
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(tangent, Math.sin(angle) * Math.cos(azimuth))
        .addScaledVector(bitangent, Math.sin(angle) * Math.sin(azimuth))
        .normalize();
      const dir: [number, number, number] = [candidate.x, candidate.y, candidate.z];
      if (!settlementApproach(spec, dir, PLANET_RADIUS_M.medium)) return dir;
    }
  }
  throw new Error('no nearby wilderness landing frame found');
}

function sphericalDistanceM(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return PLANET_RADIUS_M.medium * Math.acos(dot);
}

function projectSession(
  seed: number,
  dir: [number, number, number],
  stage: FieldProjectStage,
): GroundfallSession {
  return {
    worldKey: `w${WORLD_ID}`,
    name: 'Receiver Vale',
    seed,
    type: 'terrestrial',
    size: 'medium',
    hero: false,
    aspects: ONES,
    dir,
    sunLocal: [0.3, 0.8, 0.2],
    starHex: 0xfff2dc,
    returnPos: [0, 0, 0],
    returnYaw: 0,
    returnPitch: 0,
    lifetimeIndex: WORLD_ID,
    completed: true,
    gameTimeMs: 0,
    standing: 1,
    traits: [],
    installations: INSTALLATIONS,
    quirks: [],
    openRequests: [],
    certs: {},
    systemIndex: 0,
    charterId: null,
    systemSpecialty: null,
    project: {
      key: PROJECT_KEY,
      id: 'reef-memory',
      name: 'Reef Memory',
      stage,
      role: 'receiver',
      brief:
        stage === 'investigate'
          ? 'Consult the conservancy terminal and compare three readings across the dry basin.'
          : 'Return with the field record and calibrate the restored waterline.',
      receiver: { lifetimeIndex: WORLD_ID, name: 'Receiver Vale' },
      source: { lifetimeIndex: SOURCE_ID, name: 'Pelagic Archive' },
      result: 'wetland',
      service: 'conservatory and biologger blind',
    },
    projectSites: [],
    familiarity: 0,
    familiarityService: null,
    atlas: { score: 0, total: 6, complete: false, missing: [] },
    network: {
      beacons: 0,
      stations: 0,
      shelters: 0,
      repairs: 0,
      linked: false,
      services: [],
    },
    routes: [],
  };
}

describe('surface project tutorial', () => {
  let clock = 1;

  beforeEach(() => {
    endGroundfall();
    configureTierSpecsForTests(
      { texels: 96, extent: 4096 },
      { texels: 96, extent: 65536 },
    );
    surfaceInput.fwd = 0;
    surfaceInput.strafe = 0;
    surfaceInput.run = false;
    surfaceInput.jump = false;
    surfaceInput.engage = false;
    surfaceInput.deploy = false;
    clock = 1;
  });

  function setup(stage: FieldProjectStage): void {
    const { seed, dir } = settlementDirection();
    const state = newGame(4242, 0);
    const world = completedWorld(seed);
    state.run.completedPlanets.push(world);
    state.worldRecords[String(WORLD_ID)] = createWorldRecord(world, 1, 0);
    state.expedition.fieldProjects[PROJECT_KEY] = {
      key: PROJECT_KEY,
      id: 'reef-memory',
      systemIndex: 0,
      receiver: WORLD_ID,
      source: SOURCE_ID,
      stage,
      startedAtMs: 0,
      updatedAtMs: 0,
      completedAtMs: null,
    };
    useGame.setState({ s: state });
    useUiBus.setState({ groundfall: null, flightMode: true, toasts: [] });
    beginGroundfall(projectSession(seed, dir, stage));

    let guard = 0;
    while (!surfaceLive.ready && guard++ < 4000) tick();
    expect(surfaceLive.ready).toBe(true);
    surfaceLive.phase = 'descent';
    surfaceLive.t = 1e6;
    tick();
    expect((surfaceLive as { phase: GroundfallPhase }).phase).toBe('walk');
    expect(surfaceSettlementList().length).toBeGreaterThan(0);

    // The test is about project priority. Remove seams from contention so a
    // coincident lattice point cannot turn this into a geology test.
    for (const deposit of surfaceDeposits()) surfaceLive.mined.add(deposit.id);
  }

  function tick(): void {
    stepSurface(1 / 60, (clock += 1 / 60));
  }

  function hold(seconds: number): void {
    surfaceInput.engage = true;
    for (let i = 0; i < Math.ceil(seconds * 60) + 3; i++) tick();
    surfaceInput.engage = false;
    // One frame clears the deliberate release gate; the second presents the
    // next teaching prompt or spacing refusal.
    tick();
    tick();
  }

  function standAt(x: number, z: number): void {
    const p = surfaceParams()!;
    const tiers = surfaceTiers()!;
    surfaceLive.pos.set(x, heightAt(p, tiers, x, z) + EYE, z);
    surfaceLive.vel.set(0, 0, 0);
    surfaceLive.yaw = 0;
    surfaceLive.pitch = 0;
    tick();
  }

  function standAtTerminal(): { x: number; z: number } {
    const district = surfaceSettlementList().reduce((a, b) =>
      Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b,
    );
    // Stay inside terminal range but walk away from the runabout, preserving
    // the controller's higher boarding priority.
    const dx = district.x - surfaceLive.shipAt.x;
    const dz = district.z - surfaceLive.shipAt.z;
    const length = Math.hypot(dx, dz) || 1;
    const x = district.x + (dx / length) * 16;
    const z = district.z + (dz / length) * 16;
    standAt(x, z);
    return { x, z };
  }

  it('teaches consultation, rejects repeated ground, and banks three readings', () => {
    setup('investigate');
    const terminal = standAtTerminal();

    expect(projectReadingGoal()).toBe(3);
    expect(fieldVerbs()).not.toContain('reading');
    expect(surfaceLive.prompt?.label).toMatch(/consult settlement terminal/);
    expect(surfaceLive.prompt?.label).toMatch(/why three separated readings matter/);

    hold(PROJECT_CONTACT_SECONDS);
    expect(surfaceLive.contacted).toBe(true);
    expect(fieldVerbs()).toContain('reading');
    expect(fieldVerbs()[surfaceLive.fieldIdx]).toBe('reading');
    expect(surfaceLive.prompt?.label).toMatch(/0\/3/);

    hold(PROJECT_READING_SECONDS);
    expect(surfaceLive.readings).toBe(1);
    expect(surfaceLive.readingPositions).toHaveLength(1);

    standAt(terminal.x + 60, terminal.z);
    expect(surfaceLive.prompt?.blocked).toMatch(/only 60 m/);
    expect(surfaceLive.prompt?.blocked).toMatch(/new patch/);
    hold(PROJECT_READING_SECONDS);
    expect(surfaceLive.readings).toBe(1);

    standAt(terminal.x + 121, terminal.z);
    hold(PROJECT_READING_SECONDS);
    expect(surfaceLive.readings).toBe(2);

    standAt(terminal.x + 242, terminal.z);
    hold(PROJECT_READING_SECONDS);
    expect(surfaceLive.readings).toBe(3);
    expect(surfaceLive.prompt?.blocked).toMatch(/3\/3 complete/);

    const readingToasts = useUiBus.getState().toasts
      .filter((toast) => toast.kicker === 'PROJECT READING');
    expect(readingToasts.map((toast) => toast.title)).toEqual([
      'Reading 1/3 filed',
      'Reading 2/3 filed',
      'Reading 3/3 filed',
    ]);

    beginTakeoff();
    expect(useGame.getState().s.expedition.fieldProjects[PROJECT_KEY]!.stage).toBe('source');
    expect(useGame.getState().s.expedition.groundWorlds[`w${WORLD_ID}`]!
      .projectSites[PROJECT_KEY]).toMatchObject({ state: 'scaffold', kind: 'wetland' });
    expect(surfaceLive.contacted).toBe(false);
    expect(surfaceLive.readings).toBe(0);
    expect(surfaceLive.readingPositions).toEqual([]);
  });

  it('uses one local calibration reading on the return chapter', () => {
    setup('return');
    standAtTerminal();
    expect(projectReadingGoal()).toBe(1);

    hold(PROJECT_CONTACT_SECONDS);
    expect(fieldVerbs()[surfaceLive.fieldIdx]).toBe('reading');
    hold(PROJECT_READING_SECONDS);
    expect(surfaceLive.readings).toBe(1);
    expect(surfaceLive.prompt?.blocked).toMatch(/1\/1 complete/);

    beginTakeoff();
    const state = useGame.getState().s;
    expect(state.expedition.fieldProjects[PROJECT_KEY]!.stage).toBe('complete');
    expect(Object.values(state.expedition.routes)
      .some((route) => route.kind === 'reef-memory')).toBe(true);
  });

  it('recovers an automatic project checkpoint in a new landing frame, then files it once', () => {
    const { seed, dir } = settlementDirection();
    setup('investigate');
    const firstFrame = surfaceParams()!.up.clone();
    const terminal = standAtTerminal();

    hold(PROJECT_CONTACT_SECONDS);
    let state = useGame.getState().s;
    expect(state.expedition.fieldProjects[PROJECT_KEY]!.stage).toBe('investigate');
    expect(state.expedition.groundWorlds[`w${WORLD_ID}`]).toBeUndefined();
    expect(state.expedition.groundCheckpoints[`w${WORLD_ID}`]).toMatchObject({
      evidence: { civic: true, contacted: true, readings: 0, readingDirs: [] },
    });

    hold(PROJECT_READING_SECONDS);
    standAt(terminal.x + 121, terminal.z);
    hold(PROJECT_READING_SECONDS);
    standAt(terminal.x + 242, terminal.z);
    hold(PROJECT_READING_SECONDS);

    state = useGame.getState().s;
    const checkpoint = state.expedition.groundCheckpoints[`w${WORLD_ID}`]!;
    const savedDirs = checkpoint.evidence.readingDirs!;
    const firstFramePositions = surfaceLive.readingPositions.map((point) => ({ ...point }));
    expect(checkpoint.evidence).toMatchObject({
      civic: true,
      contacted: true,
      readings: 3,
    });
    expect(savedDirs).toHaveLength(3);
    expect(state.expedition.fieldProjects[PROJECT_KEY]!.stage).toBe('investigate');
    expect(state.expedition.groundWorlds[`w${WORLD_ID}`]).toBeUndefined();
    for (let i = 0; i < savedDirs.length; i++) {
      for (let j = i + 1; j < savedDirs.length; j++) {
        expect(sphericalDistanceM(savedDirs[i]!, savedDirs[j]!))
          .toBeGreaterThanOrEqual(PROJECT_READING_SEPARATION_M);
      }
    }

    const round = deserialize(serialize(state));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    endGroundfall();
    useGame.setState({ s: round.state });
    useUiBus.setState({ groundfall: null, flightMode: true, toasts: [] });

    beginGroundfall(projectSession(seed, wildernessDirection(seed, dir), 'investigate'));
    let guard = 0;
    while (!surfaceLive.ready && guard++ < 4000) tick();
    expect(surfaceLive.ready).toBe(true);
    surfaceLive.phase = 'descent';
    surfaceLive.t = 1e6;
    tick();
    expect((surfaceLive as { phase: GroundfallPhase }).phase).toBe('walk');

    const recoveredFrame = surfaceParams()!.up;
    expect(firstFrame.dot(recoveredFrame)).toBeLessThan(0.99);
    expect(surfaceLive.contacted).toBe(true);
    expect(surfaceLive.readings).toBe(3);
    expect(surfaceLive.readingDirs).toEqual(savedDirs);
    expect(surfaceLive.readingPositions).toHaveLength(3);
    expect(surfaceLive.readingPositions).not.toEqual(firstFramePositions);
    for (let i = 0; i < surfaceLive.readingDirs.length; i++) {
      for (let j = i + 1; j < surfaceLive.readingDirs.length; j++) {
        expect(sphericalDistanceM(surfaceLive.readingDirs[i]!, surfaceLive.readingDirs[j]!))
          .toBeGreaterThanOrEqual(PROJECT_READING_SEPARATION_M);
      }
    }

    beginTakeoff();
    state = useGame.getState().s;
    expect(state.expedition.groundCheckpoints[`w${WORLD_ID}`]).toBeUndefined();
    expect(state.expedition.fieldProjects[PROJECT_KEY]!.stage).toBe('source');
    expect(state.expedition.groundWorlds[`w${WORLD_ID}`]).toMatchObject({
      visits: 1,
      civicVisits: 1,
    });

    for (let i = 0; i < 480; i++) tick();
    state = useGame.getState().s;
    expect(state.expedition.groundCheckpoints[`w${WORLD_ID}`]).toBeUndefined();
    expect(state.expedition.fieldProjects[PROJECT_KEY]!.stage).toBe('source');
    expect(state.expedition.groundWorlds[`w${WORLD_ID}`]!.visits).toBe(1);
  });
});
