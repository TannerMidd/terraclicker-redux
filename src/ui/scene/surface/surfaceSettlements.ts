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
}

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
): SettlementSeats {
  const seats: SettlementSeats = {
    wall: [], roof: [], windowWarm: [], windowCool: [], mast: [], dome: [],
    pad: [], stilt: [], works: [], banner: [], scaffold: [], beacons: [], drones: [],
  };
  const roster = settlementRoster(settlementSpecOf(session));
  const character = settlementCharacter(session.traits);
  const neglected = session.traits.includes('neglected');
  const attended = session.traits.includes('well-attended');
  const storied = session.traits.includes('storied');
  const peculiar = session.traits.includes('peculiar');
  const openWork = session.openRequests.length > 0;

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
          // The first machine that ever touched this world, on a plinth.
          seat(seats.works, f.x, y + 0.5, f.z, yaw, 0, 0, 1.6, 1, 1.6);
          seat(seats.mast, f.x, y + 1 + 1.3, f.z, yaw, 0, 0.06, 0.18, 2.6, 0.18);
          seat(seats.dome, f.x, y + 1 + 2.75, f.z, 0, 0, 0, 0.55, 0.5, 0.55);
          break;
        case 'atmoProcessor':
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
        seat(seats.mast, f.x + 5, y + 5.5, f.z - 4, yaw + 0.6, 0, 0, 0.3, 11, 0.3);
        seat(seats.scaffold, f.x + 5 + Math.sin(yaw + 0.6) * 2.4, y + 10.6, f.z - 4 + Math.cos(yaw + 0.6) * 2.4, yaw + 0.6, 0, 1.57, 0.24, 5, 0.24);
      }
    });

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
