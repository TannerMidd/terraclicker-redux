/**
 * The landmark lattice — the seam lattice's construction at a coarser cell
 * size, exactly as the spec's spine promised it would generalise.
 *
 * A landmark's identity is its coarse cell (`L{face}:{iu}:{iv}`), hashed
 * with the planet seed into presence, kind, jitter, scale and rotation, so
 * the Standing Ring you sighted on one landing is standing in the same
 * place on every later one — including from the skimmer, eventually.
 *
 * Placement rejects what the terrain refuses (coastal kinds demand the
 * shore band; everything else demands dry, standable ground), using the
 * same baked tiers the walker reads. The renderer's seats are built here
 * too, as plain instance matrices per primitive family: the whole grammar
 * draws in about seven instanced calls.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { mulberry } from '../../../engine/rng';
import { GROUND_LANDMARKS, type GroundLandmarkDef } from '../../../content/groundLandmarks';
import {
  cellDir,
  cellOf,
  cellRand,
  cellsPerEdgeAt,
  type Cell,
} from './surfaceSites';
import {
  dirToLocal,
  groundNormalAt,
  heightAt,
  localDir,
  type SurfaceParams,
  type SurfaceTiers,
} from './terrainField';

/** Coarse cell edge, metres. The memorable-places density knob. */
export const LANDMARK_CELL_M = 1900;
/** Fraction of coarse cells that grew something, before the terrain votes. */
const LANDMARK_P = 0.34;
/** How far from the touchdown the landmark census reaches, metres. */
export const LANDMARK_FIELD_RADIUS = 6500;
/** A landmark close enough to name on the compass. */
export const LANDMARK_SIGHT_M = 2600;

export interface LandmarkSpec {
  /** Planet-fixed id: `L{face}:{iu}:{iv}`. */
  id: string;
  /** Kind id into content/groundLandmarks.ts. */
  kind: string;
  name: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  /** Per-instance variation seed for the seat builder. */
  vary: number;
}

const DIR = new Vector3();
const NORMAL = new Vector3();
const LOCAL = { x: 0, z: 0 };

function landmarkId(cell: Cell): string {
  return `L${cell.face}:${cell.iu}:${cell.iv}`;
}

/**
 * Coastal kinds want the waterline. A 1.9 km cell's jitter point usually
 * misses a shoreline that genuinely crosses the cell, so coastal placement
 * probes a fixed fan of sub-cell offsets — planet-frame offsets, so every
 * approach probes the same spots and finds the same shore.
 */
const COAST_PROBES: readonly [number, number][] = [
  [0, 0],
  [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22],
  [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3],
];

/** Shore band: close enough to the water to be OF the water. */
function inShoreBand(y: number, seaM: number): boolean {
  return y - seaM > -9 && y - seaM < 9;
}

/**
 * Every landmark the region holds, in the current landing frame, sorted by
 * id. Same draw-order law as the seams: presence, kind, jitter, scale, rot,
 * variation — a cell that grew a landmark grew the same one under every sky.
 */
export function landmarkSites(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  quirks: readonly string[] = [],
  radiusM: number = LANDMARK_FIELD_RADIUS,
): LandmarkSpec[] {
  const candidates = GROUND_LANDMARKS.filter(
    (d) => d.types.includes(p.type) && (!d.quirk || quirks.includes(d.quirk)),
  );
  if (candidates.length === 0) return [];
  const totalW = candidates.reduce((s, d) => s + d.weight, 0);

  const n = cellsPerEdgeAt(p.radiusM, LANDMARK_CELL_M);
  const seen = new Set<string>();
  const out: LandmarkSpec[] = [];

  const step = LANDMARK_CELL_M * 0.45;
  for (let z = -radiusM; z <= radiusM; z += step) {
    for (let x = -radiusM; x <= radiusM; x += step) {
      if (x * x + z * z > radiusM * radiusM) continue;
      localDir(p, x, z, DIR);
      const cell = cellOf(DIR, n);
      const id = landmarkId(cell);
      if (seen.has(id)) continue;
      seen.add(id);

      const r = cellRand((p.seed ^ 0x1a4d) >>> 0, cell);
      if (r() >= LANDMARK_P) continue;
      let roll = r() * totalW;
      let def: GroundLandmarkDef = candidates[candidates.length - 1]!;
      for (const d of candidates) {
        roll -= d.weight;
        if (roll <= 0) {
          def = d;
          break;
        }
      }
      const ou = 0.2 + r() * 0.6;
      const ov = 0.2 + r() * 0.6;
      const scale = 0.8 + r() * 0.8;
      const rot = r() * Math.PI * 2;
      const vary = Math.floor(r() * 0xffff);

      // Find the spot the kind will accept — the jitter point for dry kinds,
      // the first probed shore point for coastal ones.
      let sx = 0;
      let sz = 0;
      let sy = 0;
      let placed = false;
      const probes = def.coastal ? COAST_PROBES : COAST_PROBES.slice(0, 1);
      for (const [du, dv] of probes) {
        const pu = Math.min(0.95, Math.max(0.05, ou + du));
        const pv = Math.min(0.95, Math.max(0.05, ov + dv));
        cellDir(cell, n, pu, pv, DIR);
        dirToLocal(p, DIR, LOCAL);
        if (!Number.isFinite(LOCAL.x)) continue;
        const px = LOCAL.x;
        const pz = LOCAL.z;
        if (px * px + pz * pz > radiusM * radiusM * 1.15) continue;
        if (px * px + pz * pz < 60 * 60) continue; // the pad stays clear
        const py = heightAt(p, tiers, px, pz);
        if (def.coastal) {
          if (!inShoreBand(py, p.seaLevelM)) continue;
        } else {
          if (py < p.seaLevelM + 4) continue;
          groundNormalAt(p, tiers, px, pz, NORMAL);
          if (NORMAL.y < 0.7) continue;
        }
        sx = px;
        sz = pz;
        sy = py;
        placed = true;
        break;
      }
      if (!placed) continue;

      out.push({ id, kind: def.id, name: def.name, x: sx, y: sy, z: sz, scale, rot, vary });
    }
  }

  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

// ————— Seats: the grammar as instance matrices —————

export interface LandmarkSeats {
  /** Monoliths, slabs, lintels, caps, the plaque. */
  box: Matrix4[];
  /** Stacks, pillars, basalt columns. */
  column: Matrix4[];
  /** Ice spires. */
  shard: Matrix4[];
  /** Cones and mounds. */
  cone: Matrix4[];
  /** Boulders and cairn stones. */
  rock: Matrix4[];
  /** Emissive vents (volcanic glow). */
  vent: Matrix4[];
  /** Translucent steam and spray columns. */
  plume: Matrix4[];
}

const POS = new Vector3();
const SCL = new Vector3();
const QUAT = new Quaternion();
const EUL = new Euler();

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
  EUL.set(tiltX, yaw, tiltZ, 'YXZ');
  QUAT.setFromEuler(EUL);
  SCL.set(sx, sy, sz);
  list.push(new Matrix4().compose(POS, QUAT, SCL));
}

/**
 * Compose every landmark in the census into per-family instance matrices.
 * Deterministic per landmark (`vary` seeds the detail stream) and conformal:
 * every foot samples its own ground height, so a ring on a hillside stands
 * on the hillside rather than in it.
 */
export function buildLandmarkSeats(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  landmarks: readonly LandmarkSpec[],
): LandmarkSeats {
  const seats: LandmarkSeats = { box: [], column: [], shard: [], cone: [], rock: [], vent: [], plume: [] };
  const ground = (x: number, z: number) => heightAt(p, tiers, x, z);

  for (const lm of landmarks) {
    const r = mulberry((p.seed ^ (lm.vary * 2654435761)) >>> 0);
    const s = lm.scale;
    const sea = p.seaLevelM;

    switch (lm.kind) {
      case 'standing-ring': {
        const count = 6 + Math.floor(r() * 4);
        const ringR = 7 * s;
        for (let i = 0; i < count; i++) {
          const a = lm.rot + (i / count) * Math.PI * 2 + (r() - 0.5) * 0.2;
          const x = lm.x + Math.cos(a) * ringR;
          const z = lm.z + Math.sin(a) * ringR;
          const h = (3.5 + r() * 3) * s;
          seat(seats.box, x, ground(x, z) + h * 0.42, z, -a + Math.PI / 2, (r() - 0.5) * 0.12, (r() - 0.5) * 0.12, 1.4, h, 0.9);
        }
        break;
      }
      case 'stone-arch':
      case 'tide-arch': {
        const tide = lm.kind === 'tide-arch';
        const span = (tide ? 6 : 7) * s;
        const h = (tide ? 6.5 : 8) * s;
        const ax = Math.cos(lm.rot);
        const az = Math.sin(lm.rot);
        const x1 = lm.x - ax * span * 0.5;
        const z1 = lm.z - az * span * 0.5;
        const x2 = lm.x + ax * span * 0.5;
        const z2 = lm.z + az * span * 0.5;
        const y1 = ground(x1, z1);
        const y2 = ground(x2, z2);
        const lean = 0.16;
        // Legs lean toward each other; the lintel spans whatever they reach.
        seat(seats.box, x1, y1 + h * 0.45, z1, -lm.rot, 0, lean, tide ? 1.4 : 2, h, tide ? 1.4 : 2);
        seat(seats.box, x2, y2 + h * 0.45, z2, -lm.rot, 0, -lean, tide ? 1.4 : 2, h, tide ? 1.4 : 2);
        seat(seats.box, lm.x, Math.max(y1, y2) + h * 0.92, lm.z, -lm.rot, 0, 0, span + 2.4 * s, 1.5 * s, tide ? 1.6 : 2.2);
        break;
      }
      case 'perched-boulder': {
        const y = ground(lm.x, lm.z);
        seat(seats.rock, lm.x, y + 0.9 * s, lm.z, lm.rot, 0, 0, 1.7 * s, 1.5 * s, 1.7 * s);
        seat(seats.rock, lm.x + (r() - 0.5) * 0.8, y + (1.5 + 1.9) * s, lm.z + (r() - 0.5) * 0.8, r() * Math.PI * 2, 0.1, 0.07, 3.3 * s, 2.6 * s, 3.3 * s);
        break;
      }
      case 'hoodoo-court': {
        const count = 6 + Math.floor(r() * 5);
        for (let i = 0; i < count; i++) {
          const a = r() * Math.PI * 2;
          const d = 2.5 + r() * 8 * s;
          const x = lm.x + Math.cos(a) * d;
          const z = lm.z + Math.sin(a) * d;
          const y = ground(x, z);
          const h = (3 + r() * 4) * s;
          const rad = 0.7 + r() * 0.4;
          seat(seats.column, x, y + h * 0.48, z, a, 0, 0, rad, h, rad);
          seat(seats.box, x, y + h * 0.98, z, a, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1, rad * 2.6, 0.55, rad * 2.6);
        }
        break;
      }
      case 'ice-organ': {
        const count = 7 + Math.floor(r() * 4);
        const heights = Array.from({ length: count }, () => (4 + r() * 7) * s).sort((a, b) => a - b);
        const ax = Math.cos(lm.rot);
        const az = Math.sin(lm.rot);
        for (let i = 0; i < count; i++) {
          const along = (i - count / 2) * 1.9;
          const x = lm.x + ax * along + (r() - 0.5) * 0.7;
          const z = lm.z + az * along + (r() - 0.5) * 0.7;
          const h = heights[i]!;
          seat(seats.shard, x, ground(x, z) + h * 0.4, z, r() * Math.PI, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08, 0.85, h * 0.62, 0.85);
        }
        break;
      }
      case 'pressure-ridge': {
        const count = 8 + Math.floor(r() * 3);
        const ax = Math.cos(lm.rot);
        const az = Math.sin(lm.rot);
        const tilt = 0.55 + r() * 0.3;
        for (let i = 0; i < count; i++) {
          const along = (i - count / 2) * 2.7;
          const x = lm.x + ax * along + (r() - 0.5) * 0.9;
          const z = lm.z + az * along + (r() - 0.5) * 0.9;
          seat(seats.box, x, ground(x, z) + 1.6 * s, z, -lm.rot + (r() - 0.5) * 0.25, tilt + (r() - 0.5) * 0.2, 0, 3.4 * s, 4.6 * s, 0.55);
        }
        break;
      }
      case 'basalt-choir': {
        const count = 12 + Math.floor(r() * 8);
        const spread = 6 * s;
        for (let i = 0; i < count; i++) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * spread;
          const x = lm.x + Math.cos(a) * d;
          const z = lm.z + Math.sin(a) * d;
          const h = (1.5 + (1 - d / spread) * 7.5 + r() * 1.4) * s;
          seat(seats.column, x, ground(x, z) + h * 0.46, z, r() * Math.PI, 0, 0, 0.9, h, 0.9);
        }
        break;
      }
      case 'cinder-cone': {
        const y = ground(lm.x, lm.z);
        seat(seats.cone, lm.x, y + 4.2 * s, lm.z, lm.rot, 0, 0, 11 * s, 9 * s, 11 * s);
        seat(seats.vent, lm.x, y + 8.6 * s, lm.z, 0, 0, 0, 2.4 * s, 1.4 * s, 2.4 * s);
        seat(seats.plume, lm.x, y + (8.6 + 3.4) * s, lm.z, 0, 0, 0, 1.6 * s, 6 * s, 1.6 * s);
        break;
      }
      case 'fumarole-field': {
        const count = 5 + Math.floor(r() * 4);
        for (let i = 0; i < count; i++) {
          const a = r() * Math.PI * 2;
          const d = 1.5 + r() * 8 * s;
          const x = lm.x + Math.cos(a) * d;
          const z = lm.z + Math.sin(a) * d;
          const y = ground(x, z);
          seat(seats.cone, x, y + 0.55 * s, z, a, 0, 0, 1.6 * s, 1.3 * s, 1.6 * s);
          seat(seats.vent, x, y + 1.1 * s, z, 0, 0, 0, 0.5 * s, 0.35 * s, 0.5 * s);
          seat(seats.plume, x, y + (1.2 + 2.1) * s, z, 0, (r() - 0.5) * 0.12, (r() - 0.5) * 0.12, 0.55 * s, 4 * s, 0.55 * s);
        }
        break;
      }
      case 'sea-stacks': {
        const count = 3 + Math.floor(r() * 3);
        for (let i = 0; i < count; i++) {
          const a = r() * Math.PI * 2;
          const d = 2.5 + r() * 9 * s;
          const x = lm.x + Math.cos(a) * d;
          const z = lm.z + Math.sin(a) * d;
          const y = ground(x, z);
          // Feet on the seabed, heads well clear of the tide.
          const h = Math.max(5, sea - y) + (5 + r() * 8) * s;
          const rad = (1.6 + r() * 1) * s;
          seat(seats.column, x, y + h * 0.48, z, a, (r() - 0.5) * 0.06, (r() - 0.5) * 0.06, rad, h, rad * 0.8);
        }
        break;
      }
      case 'blowhole': {
        const y = ground(lm.x, lm.z);
        seat(seats.cone, lm.x, y + 0.7 * s, lm.z, lm.rot, 0, 0, 3.2 * s, 1.7 * s, 3.2 * s);
        seat(seats.plume, lm.x, y + (1.7 + 3.2) * s, lm.z, 0, 0, 0, 0.8 * s, 6.5 * s, 0.8 * s);
        for (let i = 0; i < 3; i++) {
          const a = r() * Math.PI * 2;
          const x = lm.x + Math.cos(a) * 4.4 * s;
          const z = lm.z + Math.sin(a) * 4.4 * s;
          seat(seats.rock, x, ground(x, z) + 0.4, z, a, 0, 0, 1.1 * s, 0.8 * s, 1.1 * s);
        }
        break;
      }
      case 'award-fjords': {
        // A cairn and a small plaque. The coastline does the rest.
        const y = ground(lm.x, lm.z);
        seat(seats.rock, lm.x, y + 0.5, lm.z, lm.rot, 0, 0, 1.3, 0.9, 1.3);
        seat(seats.rock, lm.x + 0.1, y + 1.25, lm.z - 0.1, lm.rot + 0.7, 0, 0, 0.95, 0.7, 0.95);
        seat(seats.rock, lm.x - 0.06, y + 1.8, lm.z + 0.08, lm.rot + 1.9, 0, 0, 0.6, 0.5, 0.6);
        const px = lm.x + Math.cos(lm.rot) * 1.9;
        const pz = lm.z + Math.sin(lm.rot) * 1.9;
        const py = ground(px, pz);
        seat(seats.box, px, py + 0.5, pz, -lm.rot, 0, 0, 0.16, 1.0, 0.16);
        seat(seats.box, px, py + 1.06, pz, -lm.rot, -0.38, 0, 0.8, 0.55, 0.07);
        break;
      }
    }
  }
  return seats;
}
