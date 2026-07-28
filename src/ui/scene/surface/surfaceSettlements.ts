/**
 * The settlement, walked into.
 *
 * `engine/settlements` says WHERE a delivered world settled — planet-space
 * directions, the same roster the orbit lights and the landing divert read.
 * This module makes one of those directions a PLACE: a district of habs,
 * masts, works and windows in the current landing frame.
 *
 * The law is the seam lattice's, one construction coarser still: the
 * district is a property of the planet, not of the landing. Every structure
 * is laid out in the SPOT'S own tangent frame (a deterministic planet-space
 * frame derived from the spot direction alone) and projected into the
 * landing frame through `dirToLocal` — so two landings a week apart walk
 * the same streets past the same doors, whatever bearing they arrived on.
 * Yaws are projected the same way, as the bearing between two projected
 * points, because an angle in one tangent frame is a lie in another.
 *
 * Civic facts drive the dressing, exactly as the spec orders: standing
 * decides which windows are lit (the orbit's prefix rule, walked through),
 * traits decide character (engineered sprawls; neglected topples a mast;
 * the well-attended fly banners), installations stand as facilities, and an
 * open petition leaves scaffolding up — somebody is meant to be seeing to
 * it. Wet ground gets stilts and decks rather than refusals: a harbour spot
 * is a town that chose the waterline.
 */
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { mulberry } from '../../../engine/rng';
import {
  SETTLEMENT_CLOSEUP_MULT,
  settlementCharacter,
  settlementRoster,
  settlementShownCount,
  settlementSpecOf,
  type SettlementSpot,
} from '../../../engine/settlements';
import type { GroundfallSession } from '../../fx/uiBus';
import type { GroundProjectSite } from '../../../engine/types';
import {
  dirToLocal,
  heightAt,
  type SurfaceParams,
  type SurfaceTiers,
} from './terrainField';

/** How far out a settlement is projected, named and drawn, metres. */
export const SETTLEMENT_SIGHT_M = 6500;
/** Structures stand inside roughly this radius of the district centre. */
export const DISTRICT_RADIUS_M = 60;
/** Feet wetter than this refuse to build; shallower rides a deck on stilts. */
const STILT_MAX_DEPTH_M = 3.2;
/** Deck height over the waterline, metres — dry boots on a wet street. */
const DECK_OVER_SEA_M = 0.9;
/** The touchdown's right of way: no structure crowds the airlock. */
const PAD_CLEAR_M = 26;
/** Hard ceiling on civic project dressing per district. */
const PROJECT_SITE_CAP = 5;

/**
 * Compatibility view of the world/system facts frozen into groundfall.
 * The session producer owns these fields; keeping the view local lets the
 * renderer remain independently testable while that producer is wired.
 */
interface SurfaceCivicSignals {
  readonly projectSites?: readonly GroundProjectSite[];
  readonly charterId?: string | null;
  readonly systemSpecialty?: string | null;
}

/** Small stable hash: layout identity, never simulation randomness. */
function signalHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PROJECT_FOOTPRINT: Record<GroundProjectSite['kind'], readonly [number, number, number]> = {
  greenhouse: [9, 7, 5.5],
  'heat-exchanger': [8, 6, 7],
  wetland: [10, 8, 3.2],
  'harbour-beacon': [6, 6, 10],
  'seed-bank': [8, 6, 5.5],
};

export interface DistrictSpec {
  /** Planet-fixed id: `S{roster index}`. */
  id: string;
  index: number;
  name: string;
  /** Centre in the current landing frame (y from the live tiers). */
  x: number;
  y: number;
  z: number;
  /** Inside the standing prefix: the windows are on. */
  lit: boolean;
  harbor: boolean;
  cool: boolean;
  sizeRoll: number;
}

/**
 * Every rostered settlement within sight of this landing, projected. On a
 * hero commission there is nothing to project — nobody has delivered it yet.
 */
export function settlementDistricts(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  session: GroundfallSession,
): DistrictSpec[] {
  if (!session.completed) return [];
  const roster = settlementRoster(settlementSpecOf(session));
  if (roster.length === 0) return [];
  const lit = settlementShownCount(
    roster.length,
    session,
    SETTLEMENT_CLOSEUP_MULT,
    settlementCharacter(session.traits),
    session.standing,
  );
  const out: DistrictSpec[] = [];
  const DIR = new Vector3();
  const LOCAL = { x: 0, z: 0 };
  for (const spot of roster) {
    DIR.set(spot.dir[0], spot.dir[1], spot.dir[2]);
    dirToLocal(p, DIR, LOCAL);
    if (!Number.isFinite(LOCAL.x)) continue;
    if (LOCAL.x * LOCAL.x + LOCAL.z * LOCAL.z > SETTLEMENT_SIGHT_M * SETTLEMENT_SIGHT_M) continue;
    out.push({
      id: `S${spot.index}`,
      index: spot.index,
      name: spot.name,
      x: LOCAL.x,
      y: heightAt(p, tiers, LOCAL.x, LOCAL.z),
      z: LOCAL.z,
      lit: spot.index < lit,
      harbor: spot.harbor,
      cool: spot.cool,
      sizeRoll: spot.sizeRoll,
    });
  }
  return out;
}

// ————— Seats —————

export interface SettlementSeats {
  /** Hab shells. */
  wall: Matrix4[];
  /** Roof slabs. */
  roof: Matrix4[];
  /** Lit windows — the orbit's warm pixels, at reading distance. */
  windowWarm: Matrix4[];
  windowCool: Matrix4[];
  /** Comms and light masts. */
  mast: Matrix4[];
  dome: Matrix4[];
  /** Plaza and apron discs. */
  pad: Matrix4[];
  /** Stilts under decked structures. */
  stilt: Matrix4[];
  /** Facility blocks, tanks, stacks, plinths. */
  works: Matrix4[];
  /** Small bright tabs strung for the well-attended. */
  banner: Matrix4[];
  /** Open-petition scaffolding and the crane seeing to it. */
  scaffold: Matrix4[];
  /** Mast-top beacon sprites (lit districts only). */
  beacons: { x: number; y: number; z: number }[];
  /** Drone patrol homes, one entry per lit district. */
  drones: { x: number; z: number; deckY: number; count: number; seed: number }[];
  /**
   * Whole-asset facility seats (ASSET_UPLIFT.md 2.5): when the caller has
   * the facility kit, the signature installations stand as authored meshes
   * instead of composed primitives. Base-origin, real scale × the seat's.
   */
  facilityKit: { kind: FacilityKitKind; matrix: Matrix4 }[];
}

export type FacilityKitKind = 'seed-probe' | 'atmo-processor' | 'deep-thought' | 'petition-crane';

const SPOT_DIR = new Vector3();
const SPOT_EAST = new Vector3();
const SPOT_NORTH = new Vector3();
const P_DIR = new Vector3();
const P_LOCAL = { x: 0, z: 0 };
const POS = new Vector3();
const SCL = new Vector3();
const QUAT = new Quaternion();
const AXIS = new Vector3();

/** The spot's own tangent frame — dir-derived, planet-fixed, approach-free. */
function spotFrame(spot: SettlementSpot): void {
  SPOT_DIR.set(spot.dir[0], spot.dir[1], spot.dir[2]);
  SPOT_EAST.set(0, 1, 0).cross(SPOT_DIR);
  if (SPOT_EAST.lengthSq() < 1e-6) SPOT_EAST.set(1, 0, 0).cross(SPOT_DIR);
  SPOT_EAST.normalize();
  SPOT_NORTH.crossVectors(SPOT_DIR, SPOT_EAST).normalize();
}

/** Project (u,v) metres in the spot frame into landing x/z. False = behind the horizon. */
function project(p: SurfaceParams, u: number, v: number, out: { x: number; z: number }): boolean {
  P_DIR
    .copy(SPOT_DIR)
    .multiplyScalar(p.radiusM)
    .addScaledVector(SPOT_EAST, u)
    .addScaledVector(SPOT_NORTH, v)
    .normalize();
  dirToLocal(p, P_DIR, P_LOCAL);
  if (!Number.isFinite(P_LOCAL.x)) return false;
  out.x = P_LOCAL.x;
  out.z = P_LOCAL.z;
  return true;
}

/**
 * The landing-frame yaw of a spot-frame bearing θ at (u,v): project the foot
 * and a point one metre along the bearing, and read the angle the landing
 * frame actually sees. Planet-fixed by construction.
 */
function projectYaw(p: SurfaceParams, u: number, v: number, theta: number, at: { x: number; z: number }): number {
  const B = { x: 0, z: 0 };
  if (!project(p, u + Math.cos(theta), v + Math.sin(theta), B)) return theta;
  return Math.atan2(B.x - at.x, B.z - at.z);
}

function seat(
  list: Matrix4[],
  x: number,
  y: number,
  z: number,
  yaw: number,
  tiltX: number,
  tiltZ: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  POS.set(x, y, z);
  QUAT.setFromAxisAngle(AXIS.set(0, 1, 0), yaw);
  if (tiltX !== 0 || tiltZ !== 0) {
    const q2 = new Quaternion().setFromAxisAngle(AXIS.set(1, 0, 0), tiltX);
    QUAT.multiply(q2);
    q2.setFromAxisAngle(AXIS.set(0, 0, 1), tiltZ);
    QUAT.multiply(q2);
  }
  SCL.set(sx, sy, sz);
  list.push(new Matrix4().compose(POS, QUAT, SCL));
}

interface Foot {
  x: number;
  z: number;
  /** Ground under the foot. */
  ground: number;
  /** Where the floor actually sits (deck when the ground is wet). */
  deck: number;
  /** The foot needed stilts. */
  decked: boolean;
}

/** Ground truth for one structure foot, deck rule included. Null = refused. */
function foot(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  u: number,
  v: number,
): Foot | null {
  const at = { x: 0, z: 0 };
  if (!project(p, u, v, at)) return null;
  // The airlock's right of way — the one landing-frame-dependent rule, paid
  // only when the doorstep probe fell back to the plaza itself (a shoal
  // landing). A structure yielded to the pad returns on a drier approach.
  if (at.x * at.x + at.z * at.z < PAD_CLEAR_M * PAD_CLEAR_M) return null;
  const ground = heightAt(p, tiers, at.x, at.z);
  const depth = p.seaLevelM - ground;
  if (depth > STILT_MAX_DEPTH_M) return null;
  const decked = depth > -0.35;
  const deck = decked ? p.seaLevelM + DECK_OVER_SEA_M : ground;
  return { x: at.x, z: at.z, ground, deck, decked };
}

/** Stilts for a decked foot: corner posts from the seabed to the deck. */
function stiltsFor(seats: SettlementSeats, f: Foot, yaw: number, w: number, d: number): void {
  if (!f.decked) return;
  const h = Math.max(0.4, f.deck - f.ground + 0.3);
  const cx = Math.cos(yaw);
  const sx = Math.sin(yaw);
  for (const [ku, kv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const ox = (ku * w * 0.42) * cx + (kv * d * 0.42) * sx;
    const oz = -(ku * w * 0.42) * sx + (kv * d * 0.42) * cx;
    seat(seats.stilt, f.x + ox, f.ground + h * 0.5, f.z + oz, yaw, 0, 0, 0.22, h, 0.22);
  }
}

/** Offset in a projected seat frame: right across, forward along yaw. */
function offsetXZ(f: Foot, yaw: number, right: number, forward: number): { x: number; z: number } {
  return {
    x: f.x + Math.cos(yaw) * right + Math.sin(yaw) * forward,
    z: f.z - Math.sin(yaw) * right + Math.cos(yaw) * forward,
  };
}

/**
 * Find a dry/deckable project foot on the civic outer ring. The short,
 * deterministic fan means one unlucky flooded texel cannot erase a whole
 * project, while the answer remains identical on every visit.
 */
function projectRingFoot(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  bearing: number,
  reach: number,
): { f: Foot; u: number; v: number; bearing: number } | null {
  for (let attempt = 0; attempt < 9; attempt++) {
    const wave = attempt === 0 ? 0 : Math.ceil(attempt / 2) * (attempt % 2 === 1 ? 1 : -1);
    const a = bearing + wave * 0.31;
    const r = Math.max(56, reach - (attempt >= 6 ? 8 : 0));
    const u = Math.cos(a) * r;
    const v = Math.sin(a) * r;
    const f = foot(p, tiers, u, v);
    if (f) return { f, u, v, bearing: a };
  }
  return null;
}

/** A light box-frame around an unfinished project foundation. */
function projectScaffold(
  seats: SettlementSeats,
  f: Foot,
  yaw: number,
  w: number,
  d: number,
  h: number,
): void {
  for (const right of [-w * 0.44, w * 0.44]) {
    for (const forward of [-d * 0.44, d * 0.44]) {
      const at = offsetXZ(f, yaw, right, forward);
      seat(seats.scaffold, at.x, f.deck + h * 0.5, at.z, yaw, 0, 0, 0.13, h, 0.13);
    }
  }
  for (const level of [h * 0.34, h * 0.67, h * 0.96]) {
    seat(seats.scaffold, f.x, f.deck + level, f.z, yaw, 0, 0, w, 0.12, 0.12);
    seat(seats.scaffold, f.x, f.deck + level, f.z, yaw, 0, 0, 0.12, 0.12, d);
  }
}

/**
 * One field-project module, composed only from already-batched settlement
 * primitives. Scaffold and complete states deliberately have different
 * silhouettes, so returning to finish the work changes the skyline.
 */
function buildProjectModule(
  seats: SettlementSeats,
  f: Foot,
  yaw: number,
  site: GroundProjectSite,
  variant: number,
): void {
  const [w, d, h] = PROJECT_FOOTPRINT[site.kind];
  if (site.state === 'scaffold') {
    seat(seats.pad, f.x, f.deck + 0.09, f.z, yaw, 0, 0, w * 0.52, 0.18, d * 0.52);
    switch (site.kind) {
      case 'greenhouse':
        seat(seats.dome, f.x, f.deck + 0.18, f.z, yaw, 0, 0, w * 0.28, 1.2, d * 0.28);
        break;
      case 'heat-exchanger':
        for (const right of [-1.8, 1.8]) {
          const at = offsetXZ(f, yaw, right, 0);
          seat(seats.works, at.x, f.deck + 1.3, at.z, yaw, 0, 0, 1.1, 2.6, 1.1);
        }
        break;
      case 'wetland':
        for (const right of [-2.5, 2.5]) {
          const at = offsetXZ(f, yaw, right, 0);
          seat(seats.pad, at.x, f.deck + 0.14, at.z, yaw, 0, 0, 2.1, 0.16, 3.2);
        }
        break;
      case 'harbour-beacon':
        seat(seats.mast, f.x, f.deck + h * 0.28, f.z, yaw, 0, 0, 0.32, h * 0.56, 0.32);
        break;
      case 'seed-bank':
        seat(seats.works, f.x, f.deck + 0.9, f.z, yaw, 0, 0, w * 0.58, 1.8, d * 0.58);
        break;
    }
    projectScaffold(seats, f, yaw, w, d, h);
    stiltsFor(seats, f, yaw, w, d);
    return;
  }

  switch (site.kind) {
    case 'greenhouse': {
      seat(seats.pad, f.x, f.deck + 0.13, f.z, yaw, 0, 0, 4.8, 0.26, 3.8);
      seat(seats.dome, f.x, f.deck + 0.38, f.z, yaw, 0, 0, 5.3, 3.4, 4.2);
      const door = offsetXZ(f, yaw, 0, 4.25);
      seat(seats.works, door.x, f.deck + 1.1, door.z, yaw, 0, 0, 1.8, 2.2, 1.4);
      const pane = offsetXZ(f, yaw, 0, 5.01);
      seat(seats.windowWarm, pane.x, f.deck + 1.25, pane.z, yaw, 0, 0, 1, 0.72, 0.06);
      break;
    }
    case 'heat-exchanger':
      seat(seats.pad, f.x, f.deck + 0.12, f.z, yaw, 0, 0, 4.2, 0.24, 3.3);
      for (let i = 0; i < 3; i++) {
        const at = offsetXZ(f, yaw, (i - 1) * 2.4, 0);
        const towerH = 4.5 + ((variant >>> (i * 3)) & 3) * 0.5;
        seat(seats.works, at.x, f.deck + towerH * 0.5, at.z, yaw, 0, 0, 1.25, towerH, 1.25);
      }
      seat(seats.mast, f.x, f.deck + 3.1, f.z, yaw, 0, Math.PI * 0.5, 0.24, 6.2, 0.24);
      break;
    case 'wetland':
      for (let i = 0; i < 3; i++) {
        const at = offsetXZ(f, yaw, (i - 1) * 3.1, (i % 2) * 0.8);
        seat(seats.pad, at.x, f.deck + 0.1, at.z, yaw + i * 0.28, 0, 0, 2.5, 0.2, 3.5);
      }
      for (let i = 0; i < 5; i++) {
        const at = offsetXZ(f, yaw, -3.5 + i * 1.7, -2.4 + (i % 2) * 4.8);
        const reedH = 1.8 + ((variant >>> (i * 2)) & 3) * 0.3;
        seat(seats.mast, at.x, f.deck + reedH * 0.5, at.z, yaw, 0, 0, 0.09, reedH, 0.09);
      }
      break;
    case 'harbour-beacon': {
      seat(seats.pad, f.x, f.deck + 0.16, f.z, yaw, 0, 0, 3.2, 0.32, 3.2);
      seat(seats.works, f.x, f.deck + 0.9, f.z, yaw, 0, 0, 2.4, 1.8, 2.4);
      const beaconH = 11.5 + (variant & 3) * 0.5;
      seat(seats.mast, f.x, f.deck + 1.8 + beaconH * 0.5, f.z, yaw, 0, 0, 0.38, beaconH, 0.38);
      seats.beacons.push({ x: f.x, y: f.deck + 2.2 + beaconH, z: f.z });
      break;
    }
    case 'seed-bank': {
      seat(seats.pad, f.x, f.deck + 0.12, f.z, yaw, 0, 0, 4.2, 0.24, 3.2);
      seat(seats.works, f.x, f.deck + 1.35, f.z, yaw, 0, 0, 6.8, 2.7, 4.8);
      seat(seats.dome, f.x, f.deck + 2.4, f.z, yaw, 0, 0, 3.5, 2.1, 2.6);
      const pane = offsetXZ(f, yaw, 0, 2.48);
      seat(seats.windowCool, pane.x, f.deck + 1.45, pane.z, yaw, 0, 0, 2.2, 0.72, 0.06);
      break;
    }
  }
  stiltsFor(seats, f, yaw, w, d);
}

/**
 * A plaza-scale civic signature. Charter identity controls its bearing and
 * pylon rhythm; the specialty adds one restrained, readable motif.
 */
function buildCivicFingerprint(
  seats: SettlementSeats,
  p: SurfaceParams,
  plaza: Foot | null,
  charterId: string | null,
  specialty: string | null,
  seed: number,
  districtIndex: number,
): void {
  if (!plaza || (!charterId && !specialty)) return;
  const hash = signalHash([charterId ?? '', specialty ?? '', seed, districtIndex].join('|'));
  const bearing = (hash / 0x100000000) * Math.PI * 2;
  const yaw = projectYaw(p, 0, 0, bearing, plaza);
  const centre = offsetXZ(plaza, yaw, 0, 6.4);
  const f: Foot = { ...plaza, x: centre.x, z: centre.z };

  if (charterId) {
    seat(seats.works, f.x, f.deck + 0.18, f.z, yaw, 0, 0, 2.6, 0.36, 1.15);
    const pylons = 2 + (hash & 1);
    for (let i = 0; i < pylons; i++) {
      const at = offsetXZ(f, yaw, (i - (pylons - 1) * 0.5) * 0.72, 0);
      const ph = 1.1 + ((hash >>> (i * 3 + 3)) & 3) * 0.22;
      seat(seats.mast, at.x, f.deck + 0.36 + ph * 0.5, at.z, yaw, 0, 0, 0.08, ph, 0.08);
      seat(seats.banner, at.x, f.deck + 0.38 + ph, at.z, yaw, 0.1, 0, 0.34, 0.26, 0.04);
    }
  }

  switch (specialty) {
    case 'thermal':
      for (const right of [-0.75, 0, 0.75]) {
        const at = offsetXZ(f, yaw, right, -0.9);
        seat(seats.works, at.x, f.deck + 0.75, at.z, yaw, 0, 0, 0.18, 1.5, 0.72);
      }
      break;
    case 'atmo':
      seat(seats.dome, f.x, f.deck + 0.2, f.z, yaw, 0, 0, 1.15, 0.8, 1.15);
      break;
    case 'hydro':
      seat(seats.pad, f.x, f.deck + 0.2, f.z, yaw, 0, 0, 1.25, 0.12, 1.25);
      break;
    case 'bio':
      for (let i = 0; i < 3; i++) {
        const at = offsetXZ(f, yaw, (i - 1) * 0.7, -0.8);
        seat(seats.banner, at.x, f.deck + 0.8 + (i % 2) * 0.35, at.z, yaw + i * 0.35, 0.25, 0, 0.42, 0.52, 0.05);
      }
      break;
    case 'science': {
      seat(seats.works, f.x, f.deck + 0.85, f.z, yaw, 0, 0, 0.7, 1.7, 0.7);
      const pane = offsetXZ(f, yaw, 0, 0.38);
      seat(seats.windowCool, pane.x, f.deck + 1.1, pane.z, yaw, 0, 0, 0.34, 0.28, 0.04);
      break;
    }
    case 'production':
      for (const right of [-0.65, 0.65]) {
        const at = offsetXZ(f, yaw, right, -0.55);
        seat(seats.works, at.x, f.deck + 0.55, at.z, yaw, 0, 0, 0.8, 1.1, 0.8);
      }
      break;
    default:
      if (specialty) seat(seats.works, f.x, f.deck + 0.45, f.z, yaw, 0, 0, 0.6, 0.9, 0.6);
      break;
  }
}

/** Ground-suited installations, in the order they take the outer ring. */
const GROUND_FACILITIES = [
  'seedProbe',
  'atmoProcessor',
  'hydroSeeder',
  'geoTap',
  'bioDome',
  'researchLab',
  'quantumExcavator',
  'magratheanWorkshop',
  'stellarForge',
  'temporalCompressor',
  'deepThought',
  'marvin',
  'heartOfGold',
] as const;
const FACILITY_CAP = 6;

/**
 * Compose every district in the census into per-family instance matrices.
 * Deterministic per district (the layout stream is seeded from the planet
 * and the roster index, never the landing), and conformal: every foot
 * samples its own ground.
 */
export function buildSettlementSeats(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  districts: readonly DistrictSpec[],
  session: GroundfallSession,
  /** True when the facility kit is loaded: signature installations become
   * whole authored meshes rather than composed primitives. */
  kits = false,
): SettlementSeats {
  const seats: SettlementSeats = {
    wall: [], roof: [], windowWarm: [], windowCool: [], mast: [], dome: [],
    pad: [], stilt: [], works: [], banner: [], scaffold: [], beacons: [], drones: [],
    facilityKit: [],
  };
  const kitSeat = (kind: FacilityKitKind, x: number, y: number, z: number, yaw: number, s: number) => {
    POS.set(x, y, z);
    QUAT.setFromAxisAngle(AXIS.set(0, 1, 0), yaw);
    SCL.set(s, s, s);
    seats.facilityKit.push({ kind, matrix: new Matrix4().compose(POS, QUAT, SCL) });
  };
  const roster = settlementRoster(settlementSpecOf(session));
  const character = settlementCharacter(session.traits);
  const neglected = session.traits.includes('neglected');
  const attended = session.traits.includes('well-attended');
  const storied = session.traits.includes('storied');
  const peculiar = session.traits.includes('peculiar');
  const openWork = session.openRequests.length > 0;
  const civic = session as GroundfallSession & SurfaceCivicSignals;
  const projectSites = [...(civic.projectSites ?? [])]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, PROJECT_SITE_CAP);
  const charterId = civic.charterId ?? null;
  const specialty = civic.systemSpecialty ?? null;

  for (const d of districts) {
    const spot = roster[d.index];
    if (!spot) continue;
    spotFrame(spot);
    const r = mulberry(
      (session.seed ^ Math.imul(d.index + 1, 2654435761) ^ 0x0d15) >>> 0,
    );
    const windows = d.cool ? seats.windowCool : seats.windowWarm;

    // — The plaza: a disc the streets radiate from. Decked when wet. —
    const plaza = foot(p, tiers, 0, 0);
    if (plaza) {
      seat(seats.pad, plaza.x, plaza.deck + 0.06, plaza.z, 0, 0, 0, 9, 0.12, 9);
      if (plaza.decked) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const h = Math.max(0.4, plaza.deck - plaza.ground + 0.3);
          seat(
            seats.stilt,
            plaza.x + Math.cos(a) * 7.4,
            plaza.ground + h * 0.5,
            plaza.z + Math.sin(a) * 7.4,
            a, 0, 0, 0.26, h, 0.26,
          );
        }
      }
    }

    // — Habs on radial rings, doors toward the plaza. —
    const nH = Math.max(4, Math.round((9 + 15 * d.sizeRoll) * character));
    let litWindows = 0;
    for (let i = 0; i < nH; i++) {
      const ring = i < nH * 0.3 ? 14 : i < nH * 0.65 ? 26 : 40;
      const bearing = r() * Math.PI * 2;
      const reach = ring + (r() - 0.5) * 6;
      const u = Math.cos(bearing) * reach;
      const v = Math.sin(bearing) * reach;
      const w = 3.6 + r() * 2.8;
      const dep = 3.6 + r() * 2.8;
      const h = 2.8 + r() * 2.6;
      const winRoll = r();
      const f = foot(p, tiers, u, v);
      if (!f) continue;
      // Doors face the plaza; the projected yaw keeps that true from any sky.
      const facing = Math.atan2(-v, -u);
      const yaw = projectYaw(p, u, v, facing, f);
      seat(seats.wall, f.x, f.deck + h * 0.5, f.z, yaw, 0, 0, w, h, dep);
      seat(seats.roof, f.x, f.deck + h + 0.14, f.z, yaw, 0, 0, w + 0.5, 0.28, dep + 0.5);
      stiltsFor(seats, f, yaw, w, dep);
      // Windows on the street face. A dark district keeps exactly one lamp
      // burning — somebody is always still there.
      const want = d.lit ? 1 + Math.floor(winRoll * 3) : litWindows === 0 ? 1 : 0;
      for (let k = 0; k < want; k++) {
        const off = (k - (want - 1) / 2) * (w * 0.28);
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        // One step out along the facing, slid along the wall's width axis.
        seat(
          windows,
          f.x + fx * (dep * 0.5 + 0.06) + fz * off,
          f.deck + h * (0.35 + 0.3 * ((k * 41) % 7) / 7),
          f.z + fz * (dep * 0.5 + 0.06) - fx * off,
          yaw, 0, 0, 0.6, 0.5, 0.06,
        );
        litWindows++;
      }
    }

    // — Masts at the plaza edge; the second one has had a hard century on
    //   neglected worlds. Beacons only where the lights are on. —
    for (let m = 0; m < 2; m++) {
      const bearing = r() * Math.PI * 2;
      const u = Math.cos(bearing) * 11;
      const v = Math.sin(bearing) * 11;
      const h = 9 + r() * 5;
      const f = foot(p, tiers, u, v);
      if (!f) continue;
      const yaw = projectYaw(p, u, v, bearing, f);
      if (m === 1 && neglected) {
        // Toppled: lying along its bearing, roots still in the ground.
        seat(seats.mast, f.x, f.deck + 0.6, f.z, yaw, 0, 1.42, 0.3, h * 0.85, 0.3);
        continue;
      }
      seat(seats.mast, f.x, f.deck + h * 0.5, f.z, yaw, 0, 0, 0.3, h, 0.3);
      stiltsFor(seats, f, yaw, 1.2, 1.2);
      if (d.lit) seats.beacons.push({ x: f.x, y: f.deck + h + 0.5, z: f.z });
      if (attended && m === 0) {
        // Banner line: bright tabs strung from the mast toward the plaza.
        for (let b = 1; b <= 5; b++) {
          const k = b / 6;
          const bx = f.x + (plaza ? (plaza.x - f.x) * k : 0);
          const bz = f.z + (plaza ? (plaza.z - f.z) * k : 0);
          const sag = Math.sin(Math.PI * k) * 1.1;
          seat(seats.banner, bx, f.deck + h * 0.82 - sag, bz, yaw + k, 0.2, 0, 0.42, 0.3, 0.05);
        }
      }
    }

    // — The dome quarter, for towns that grew one. —
    if (d.sizeRoll > 0.55) {
      const u = Math.cos(2.3) * 30;
      const v = Math.sin(2.3) * 30;
      const f = foot(p, tiers, u, v);
      if (f) {
        const s = 4.5 + d.sizeRoll * 3;
        seat(seats.dome, f.x, f.deck + s * 0.12, f.z, 0, 0, 0, s, s * 0.72, s);
        stiltsFor(seats, f, 0, s, s);
      }
    }

    // — Facilities: the record's installations, standing on the outer ring. —
    const facs = GROUND_FACILITIES.filter((id) => session.installations.includes(id)).slice(
      0,
      FACILITY_CAP,
    );
    facs.forEach((id, fi) => {
      const bearing = (fi / Math.max(1, facs.length)) * Math.PI * 2 + 0.45;
      const u = Math.cos(bearing) * 52;
      const v = Math.sin(bearing) * 52;
      const f = foot(p, tiers, u, v);
      if (!f) return;
      const yaw = projectYaw(p, u, v, bearing + Math.PI, f);
      const y = f.deck;
      switch (id) {
        case 'seedProbe':
          if (kits) {
            // The first machine that ever touched this world — the authored
            // probe on its plinth, at the composed silhouette's height.
            kitSeat('seed-probe', f.x, y, f.z, yaw, 1.1);
            break;
          }
          seat(seats.works, f.x, y + 0.5, f.z, yaw, 0, 0, 1.6, 1, 1.6);
          seat(seats.mast, f.x, y + 1 + 1.3, f.z, yaw, 0, 0.06, 0.18, 2.6, 0.18);
          seat(seats.dome, f.x, y + 1 + 2.75, f.z, 0, 0, 0, 0.55, 0.5, 0.55);
          break;
        case 'atmoProcessor':
          if (kits) {
            kitSeat('atmo-processor', f.x, y, f.z, yaw, 2.1);
            break;
          }
          for (let s = 0; s < 3; s++) {
            seat(seats.works, f.x + (s - 1) * 2.6, y + 4.5, f.z + (s % 2) * 1.2, yaw, 0, 0, 1.8, 9, 1.8);
          }
          break;
        case 'hydroSeeder':
          seat(seats.pad, f.x, y + 0.25, f.z, yaw, 0, 0, 6, 0.5, 6);
          for (let s = 0; s < 4; s++) {
            const a = (s / 4) * Math.PI * 2;
            seat(seats.works, f.x + Math.cos(a) * 5.4, y + 0.9, f.z + Math.sin(a) * 5.4, a, 0, 0, 2.2, 1.8, 0.7);
          }
          break;
        case 'geoTap': {
          seat(seats.mast, f.x, y + 5.5, f.z, yaw, 0, 0, 0.34, 11, 0.34);
          for (let s = 0; s < 4; s++) {
            const a = (s / 4) * Math.PI * 2 + 0.4;
            seat(seats.works, f.x + Math.cos(a) * 2.2, y + 3.4, f.z + Math.sin(a) * 2.2, a, 0, 0.42, 0.5, 7.4, 0.5);
          }
          break;
        }
        case 'bioDome':
          seat(seats.dome, f.x, y + 0.8, f.z, 0, 0, 0, 7, 5, 7);
          break;
        case 'researchLab':
          seat(seats.dome, f.x, y + 0.6, f.z, 0, 0, 0, 4.5, 3.2, 4.5);
          seat(seats.mast, f.x + 3.4, y + 4, f.z, yaw, 0, 0, 0.24, 8, 0.24);
          break;
        case 'deepThought':
          // It is still thinking. Do not interrupt it.
          if (kits) {
            kitSeat('deep-thought', f.x, y, f.z, yaw, 1.8);
            break;
          }
          seat(seats.works, f.x, y + 4, f.z, yaw, 0, 0, 3, 8, 1.2);
          seat(seats.windowCool, f.x + Math.sin(yaw) * 0.66, y + 6.6, f.z + Math.cos(yaw) * 0.66, yaw, 0, 0, 0.5, 0.4, 0.06);
          break;
        case 'marvin':
          seat(seats.works, f.x, y + 0.35, f.z, yaw, 0, 0, 1, 0.7, 1);
          seat(seats.works, f.x, y + 1.2, f.z, yaw, 0.12, 0, 0.5, 1, 0.4);
          break;
        default:
          // The heavy industry: a hall and two stacks.
          seat(seats.works, f.x, y + 2, f.z, yaw, 0, 0, 5, 4, 7);
          seat(seats.works, f.x + 2.2, y + 5.5, f.z + 2.4, yaw, 0, 0, 1, 5, 1);
          seat(seats.works, f.x - 2.2, y + 5.1, f.z + 2.4, yaw, 0, 0, 1, 4.2, 1);
          break;
      }
      stiltsFor(seats, f, yaw, 4, 4);
      // An open petition keeps scaffolding on the first facility, plus the
      // crane that is allegedly seeing to it.
      if (openWork && fi === 0) {
        const sw = 6;
        for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          seat(seats.scaffold, f.x + du * sw * 0.5, y + 3, f.z + dv * sw * 0.5, yaw, 0, 0, 0.14, 6, 0.14);
        }
        for (const lvl of [2, 4, 5.8]) {
          seat(seats.scaffold, f.x, y + lvl, f.z, yaw, 0, 0, sw, 0.12, sw);
        }
        if (kits) {
          // The crane that is allegedly seeing to it, as one authored rig.
          kitSeat('petition-crane', f.x + 5, y, f.z - 4, yaw + 0.6, 1.9);
        } else {
          seat(seats.mast, f.x + 5, y + 5.5, f.z - 4, yaw + 0.6, 0, 0, 0.3, 11, 0.3);
          seat(seats.scaffold, f.x + 5 + Math.sin(yaw + 0.6) * 2.4, y + 10.6, f.z - 4 + Math.cos(yaw + 0.6) * 2.4, yaw + 0.6, 0, 1.57, 0.24, 5, 0.24);
        }
      }
    });

    // — Planetary projects: world-level civic works have no invented
    //   coordinate, so every district carries the same compact service
    //   module. Hash placement keeps each programme planet-fixed.
    for (const site of projectSites) {
      const variant = signalHash([session.seed, site.id, site.kind].join(':'));
      const bearing = (variant / 0x100000000) * Math.PI * 2;
      const reach = 64 + ((variant >>> 28) & 3) * 3;
      const placed = projectRingFoot(p, tiers, bearing, reach);
      if (!placed) continue;
      const yaw = projectYaw(p, placed.u, placed.v, placed.bearing + Math.PI, placed.f);
      buildProjectModule(seats, placed.f, yaw, site, variant);
    }

    buildCivicFingerprint(
      seats,
      p,
      plaza,
      charterId,
      specialty,
      session.seed,
      d.index,
    );

    // — Memory and oddity: the storied get an avenue, the peculiar a leaning
    //   obelisk nobody explains. —
    if (storied) {
      for (let s = 0; s < 3; s++) {
        const u = 16 + s * 7;
        const f = foot(p, tiers, u, -8);
        if (!f) continue;
        seat(seats.works, f.x, f.deck + 0.9, f.z, 0, 0, 0, 1, 1.8, 1);
      }
    }
    if (peculiar) {
      const f = foot(p, tiers, -24, 18);
      if (f) seat(seats.works, f.x, f.deck + 2.6, f.z, 0.8, 0, 0.12, 0.8, 5.2, 0.8);
    }

    // — Drones patrol where the lights are on; their number is the standing
    //   made visible, which is the entire Phase 4 sentence. —
    if (d.lit && plaza) {
      seats.drones.push({
        x: plaza.x,
        z: plaza.z,
        deckY: plaza.deck,
        count: 1 + Math.round(2 * session.standing),
        seed: (session.seed ^ Math.imul(d.index + 1, 40503)) >>> 0,
      });
    }
  }
  return seats;
}
