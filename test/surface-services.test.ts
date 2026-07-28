import { describe, expect, it } from 'vitest';
import { speciesPresent } from '../src/content/groundSpecies';
import {
  atmoEnvelope,
  SETDOWN_DISTRICT_CLEAR_M,
  SETDOWN_DIVERT_M,
  SETDOWN_DRY_MARGIN_M,
} from '../src/engine/atmoflight';
import { newGame } from '../src/engine/sim';
import { settlementRoster, settlementSpecOf } from '../src/engine/settlements';
import type {
  CompletedPlanetRecord,
  GroundProjectKind,
  GroundProjectSite,
} from '../src/engine/types';
import { createWorldRecord } from '../src/engine/worldRecords';
import { useGame } from '../src/state/store';
import type { GroundfallSession } from '../src/ui/fx/uiBus';
import { useUiBus } from '../src/ui/fx/uiBus';
import {
  beginGroundfall,
  configureTierSpecsForTests,
  endGroundfall,
  EYE,
  setDownNow,
  stepSurface,
  surfaceInput,
  surfaceLive,
  surfaceParams,
  surfaceSettlementList,
  surfaceTiers,
  verbHitsNow,
  type GroundfallPhase,
} from '../src/ui/scene/surface/surfaceControl';
import {
  heightAt,
  setdownRefusal,
} from '../src/ui/scene/surface/terrainField';

const WORLD_ID = 17;
const INSTALLATIONS = ['seedProbe', 'atmoProcessor', 'researchLab'];
const ASPECTS = { thermal: 1, atmo: 1, hydro: 1, bio: 1 };

function darkSettlementApproach(): { seed: number; dir: [number, number, number] } {
  for (let seed = 9200; seed < 9300; seed++) {
    const roster = settlementRoster(settlementSpecOf({
      seed,
      type: 'terrestrial',
      size: 'medium',
      lifetimeIndex: WORLD_ID,
      installations: INSTALLATIONS,
      quirks: [],
    }));
    const dark = roster.find((spot) => spot.index > 0 && !spot.harbor);
    if (dark) return { seed, dir: [...dark.dir] as [number, number, number] };
  }
  throw new Error('no deterministic dark inland district found for the service test');
}

function completedWorld(seed: number): CompletedPlanetRecord {
  return {
    lifetimeIndex: WORLD_ID,
    seed,
    type: 'terrestrial',
    size: 'medium',
    name: 'Revisit Vale',
    quirks: [],
    survey: null,
    completionMs: 1,
    bottleneck: 'bio',
    installations: [...INSTALLATIONS],
  };
}

function projectSite(kind: GroundProjectKind): GroundProjectSite {
  return {
    id: `test-${kind}`,
    kind,
    state: 'complete',
    atMs: 1,
    sourceWorld: 18,
  };
}

function sessionFor(
  seed: number,
  dir: [number, number, number],
  enriched: boolean,
): GroundfallSession {
  return {
    worldKey: `w${WORLD_ID}`,
    name: 'Revisit Vale',
    seed,
    type: 'terrestrial',
    size: 'medium',
    hero: false,
    aspects: ASPECTS,
    dir,
    sunLocal: [0.3, 0.8, 0.2],
    starHex: 0xfff2dc,
    returnPos: [0, 0, 0],
    returnYaw: 0,
    returnPitch: 0,
    lifetimeIndex: WORLD_ID,
    completed: true,
    gameTimeMs: 0,
    standing: 0,
    traits: [],
    installations: INSTALLATIONS,
    quirks: [],
    openRequests: [],
    certs: {},
    systemIndex: 0,
    charterId: null,
    systemSpecialty: null,
    project: null,
    projectSites: enriched
      ? [
          projectSite('wetland'),
          projectSite('heat-exchanger'),
          projectSite('harbour-beacon'),
        ]
      : [],
    familiarity: enriched ? 5 : 0,
    familiarityService: enriched ? 'local field desk and precise approach' : null,
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

interface RevisitSnapshot {
  scanRange: number;
  districtLit: boolean;
  species: Set<string>;
  breakHits: number;
  setdownRefusal: string | null;
  setdownDistance: number;
}

function revisit(enriched: boolean): RevisitSnapshot {
  endGroundfall();
  configureTierSpecsForTests(
    { texels: 64, extent: 4096 },
    { texels: 64, extent: 65536 },
  );
  surfaceInput.fwd = 0;
  surfaceInput.strafe = 0;
  surfaceInput.run = false;
  surfaceInput.jump = false;
  surfaceInput.engage = false;
  surfaceInput.deploy = false;

  const { seed, dir } = darkSettlementApproach();
  const state = newGame(8844, 0);
  const world = completedWorld(seed);
  state.run.completedPlanets.push(world);
  state.worldRecords[String(WORLD_ID)] = createWorldRecord(world, 1, 0);
  useGame.setState({ s: state });
  useUiBus.setState({ groundfall: null, flightMode: true, toasts: [] });
  beginGroundfall(sessionFor(seed, dir, enriched));

  let clock = 1;
  const tick = (): void => {
    stepSurface(1 / 60, (clock += 1 / 60));
  };
  let guard = 0;
  while (!surfaceLive.ready && guard++ < 4000) tick();
  expect(surfaceLive.ready).toBe(true);
  surfaceLive.phase = 'descent';
  surfaceLive.t = 1e6;
  tick();
  expect((surfaceLive as { phase: GroundfallPhase }).phase).toBe('walk');

  const district = surfaceSettlementList().find((candidate) => !candidate.lit);
  expect(district).toBeDefined();
  const p = surfaceParams()!;
  const tiers = surfaceTiers()!;
  surfaceLive.pos.set(district!.x, heightAt(p, tiers, district!.x, district!.z) + EYE, district!.z);
  surfaceLive.vel.set(0, 0, 0);
  surfaceLive.speciesSeen.clear();
  let ecologyGuard = 0;
  while (!surfaceLive.civicStood && ecologyGuard++ < 600) tick();
  expect(surfaceLive.civicStood).toBe(true);

  const scanRange = surfaceLive.scanRange;
  const species = new Set(surfaceLive.speciesSeen);
  const breakHits = verbHitsNow('break', 3);

  // Pick a naturally valid patch in the band which an unfamiliar pilot
  // considers "inside the plaza", while familiarity and the harbour beacon
  // both make it available for a precise return.
  const setdownRadius = SETDOWN_DISTRICT_CLEAR_M - 10;
  const opts = {
    normalY: atmoEnvelope(3).setdownNormalY,
    dryMarginM: SETDOWN_DRY_MARGIN_M,
    divertM: SETDOWN_DIVERT_M,
  };
  let target: { x: number; z: number } | null = null;
  for (let i = 0; i < 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    const x = district!.x + Math.cos(angle) * setdownRadius;
    const z = district!.z + Math.sin(angle) * setdownRadius;
    if (setdownRefusal(p, tiers, x, z, opts) === null) {
      target = { x, z };
      break;
    }
  }
  expect(target).not.toBeNull();
  surfaceLive.atmoRank = 3;
  surfaceLive.phase = 'fly';
  surfaceLive.pos.set(
    target!.x,
    heightAt(p, tiers, target!.x, target!.z) + 40,
    target!.z,
  );
  surfaceLive.vel.set(0, 0, 0);
  const setdown = setDownNow();
  expect(setdown).not.toBeNull();

  const snapshot = {
    scanRange,
    districtLit: district!.lit,
    species,
    breakHits,
    setdownRefusal: setdown!.refused,
    setdownDistance: Math.hypot(target!.x - district!.x, target!.z - district!.z),
  };
  endGroundfall();
  return snapshot;
}

describe('completed field-project services on a revisit', () => {
  it('turns local knowledge and civic works into concrete surface affordances', () => {
    const plain = revisit(false);
    const serviced = revisit(true);
    const civicIds = speciesPresent('terrestrial', 1, 'civic').map((species) => species.id);
    const ambientIds = speciesPresent('terrestrial', 1, 'ambient').map((species) => species.id);

    expect(serviced.scanRange).toBeCloseTo(plain.scanRange * 1.2, 8);

    expect(plain.districtLit).toBe(false);
    expect(civicIds.every((id) => !plain.species.has(id))).toBe(true);
    expect([...serviced.species]).toEqual(expect.arrayContaining(civicIds));
    expect(ambientIds.every((id) => serviced.species.has(id))).toBe(true);

    expect(serviced.breakHits).toBe(plain.breakHits - 1);

    expect(plain.setdownDistance).toBeCloseTo(60, 8);
    expect(plain.setdownRefusal).toBe('occupied');
    expect(serviced.setdownRefusal).toBeNull();
  });
});
