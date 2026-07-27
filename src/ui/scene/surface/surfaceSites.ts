/**
 * The site lattice — where the seams are, as a fact about the PLANET.
 *
 * v22 placed deposits in the landing frame from the planet seed alone, which
 * meant the same twelve seams followed you to every landing like a well-
 * trained geology. Persistent depletion is meaningless against ground that
 * regrows wherever you set down, so placement is now planet-fixed:
 *
 *  - The sphere is quantised into cube-face cells roughly CELL_M across.
 *    A cell's coordinates ARE a site's identity — `g{face}:{iu}:{iv}` — so
 *    the same spot of ground is the same site from any approach, worked or
 *    not, this landing or next year's.
 *  - Each cell hashes (with the planet seed) into presence, jitter, richness
 *    and the sample kind. No rng stream is consumed; the lattice is the same
 *    arithmetic every time (engine law #1).
 *  - Generation enumerates the cells under the landing region and rejects
 *    sites the terrain refuses — underwater, unstandable — using the same
 *    baked tiers the walker reads. Rejection is deterministic too, because
 *    the tiers are.
 *
 * The lattice generalises: landmarks, settlements and skimmer-range POIs are
 * the same construction at coarser cell sizes.
 */
import { Vector3 } from 'three/webgpu';
import { mulberry } from '../../../engine/rng';
import { sampleKindAt } from '../../../content/groundSamples';
import {
  dirToLocal,
  groundNormalAt,
  heightAt,
  localDir,
  macroNormAt,
  MACRO_RELIEF_M,
  type SurfaceParams,
  type SurfaceTiers,
} from './terrainField';

/** Target cell edge on the ground, metres. The seam-density knob. */
const CELL_M = 110;
/** Fraction of cells that grew a seam, before the terrain has its say. */
const DEPOSIT_P = 0.42;
/** How far from the touchdown the near-field site survey reaches, metres. */
export const SITE_FIELD_RADIUS = 460;

export interface SiteSpec {
  /** Planet-fixed id: `g{face}:{iu}:{iv}`. Stable across landings by construction. */
  id: string;
  /** Local metres in the CURRENT landing frame (recovered via dirToLocal). */
  x: number;
  y: number;
  z: number;
  /** Core samples this seam holds. */
  richness: number;
  scale: number;
  rot: number;
  /** Sample kind this seam yields (content/groundSamples.ts). */
  kind: string;
}

/** Transitional alias — the scene and control layers grew up calling it this. */
export type DepositSpec = SiteSpec;

// ————— Cube-sphere quantisation —————

/** Cells per cube-face edge for this planet: one cell ≈ CELL_M at face centre. */
export function cellsPerEdge(radiusM: number): number {
  return Math.max(64, Math.round((Math.PI / 2) * radiusM / CELL_M));
}

interface Cell {
  face: number;
  iu: number;
  iv: number;
}

/** Direction → cube face and [-1,1]² face coordinates. */
function faceUv(d: Vector3): { face: number; u: number; v: number } {
  const ax = Math.abs(d.x);
  const ay = Math.abs(d.y);
  const az = Math.abs(d.z);
  if (ax >= ay && ax >= az) {
    return d.x > 0
      ? { face: 0, u: -d.z / ax, v: d.y / ax }
      : { face: 1, u: d.z / ax, v: d.y / ax };
  }
  if (ay >= ax && ay >= az) {
    return d.y > 0
      ? { face: 2, u: d.x / ay, v: -d.z / ay }
      : { face: 3, u: d.x / ay, v: d.z / ay };
  }
  return d.z > 0
    ? { face: 4, u: d.x / az, v: d.y / az }
    : { face: 5, u: -d.x / az, v: d.y / az };
}

function cellOf(d: Vector3, n: number): Cell {
  const { face, u, v } = faceUv(d);
  const clamp = (k: number) => Math.min(n - 1, Math.max(0, Math.floor(((k + 1) / 2) * n)));
  return { face, iu: clamp(u), iv: clamp(v) };
}

/** Face coordinates (with sub-cell offset 0–1) back to a unit direction. */
function cellDir(cell: Cell, n: number, ou: number, ov: number, out: Vector3): Vector3 {
  const u = -1 + ((cell.iu + ou) * 2) / n;
  const v = -1 + ((cell.iv + ov) * 2) / n;
  switch (cell.face) {
    case 0: out.set(1, v, -u); break;
    case 1: out.set(-1, v, u); break;
    case 2: out.set(u, 1, -v); break;
    case 3: out.set(u, -1, v); break;
    case 4: out.set(u, v, 1); break;
    default: out.set(-u, v, -1); break;
  }
  return out.normalize();
}

export function siteId(cell: Cell): string {
  return `g${cell.face}:${cell.iu}:${cell.iv}`;
}

/** The site id under any planet-space direction — the scanner's question. */
export function siteIdAt(p: SurfaceParams, dir: Vector3): string {
  return siteId(cellOf(dir, cellsPerEdge(p.radiusM)));
}

/** One deterministic stream per cell, mixed from the planet seed. */
function cellRand(seed: number, cell: Cell): () => number {
  const h =
    (seed ^
      Math.imul(cell.face + 1, 0x9e3779b9) ^
      Math.imul(cell.iu + 1, 0x85ebca6b) ^
      Math.imul(cell.iv + 1, 0xc2b2ae35)) >>>
    0;
  return mulberry(h);
}

// ————— Generation —————

const DIR = new Vector3();
const NORMAL = new Vector3();
const LOCAL = { x: 0, z: 0 };

/**
 * Every seam the landing region holds, in the current landing frame, sorted
 * by id for a stable order. The draw order per cell is fixed — presence,
 * jitter, richness, scale, rot, kind roll — so a cell that exists is the
 * same seam under every sky it has ever been approached from.
 */
export function depositSites(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  quirks: readonly string[] = [],
  radiusM: number = SITE_FIELD_RADIUS,
): SiteSpec[] {
  const n = cellsPerEdge(p.radiusM);
  const seen = new Set<string>();
  const out: SiteSpec[] = [];

  // Walk the local grid finely enough that no cell under the disc is missed;
  // the cell set (not the grid) is what decides anything.
  const step = CELL_M * 0.45;
  for (let z = -radiusM; z <= radiusM; z += step) {
    for (let x = -radiusM; x <= radiusM; x += step) {
      if (x * x + z * z > radiusM * radiusM) continue;
      localDir(p, x, z, DIR);
      const cell = cellOf(DIR, n);
      const id = siteId(cell);
      if (seen.has(id)) continue;
      seen.add(id);

      const r = cellRand(p.seed, cell);
      if (r() >= DEPOSIT_P) continue;
      const ou = 0.15 + r() * 0.7; // sub-cell jitter, strictly inside the cell
      const ov = 0.15 + r() * 0.7;
      const richness = 2 + Math.floor(r() * 4);
      const scale = 0.8 + r() * 1.1;
      const rot = r() * Math.PI * 2;
      const kindRoll = r();

      cellDir(cell, n, ou, ov, DIR);
      dirToLocal(p, DIR, LOCAL);
      if (!Number.isFinite(LOCAL.x)) continue;
      const sx = LOCAL.x;
      const sz = LOCAL.z;
      if (sx * sx + sz * sz > radiusM * radiusM * 1.15) continue;
      // The touchdown pad stays clear: nobody parks a runabout on a seam.
      if (sx * sx + sz * sz < 30 * 30) continue;

      const y = heightAt(p, tiers, sx, sz);
      if (y < p.seaLevelM + 1.5) continue; // not in the sea (or the lava)
      groundNormalAt(p, tiers, sx, sz, NORMAL);
      if (NORMAL.y < 0.82) continue; // a seam you cannot stand beside is scenery

      // Sample identity reads PLANET truth only — macro elevation over the
      // macro sea, latitude of the site's own direction — never the landing
      // frame's local height or clamped waterline. The same seam must be the
      // same substance from every approach that finds it.
      const macroAboveSeaM = (macroNormAt(p, DIR) - p.seaNorm) * MACRO_RELIEF_M;
      out.push({
        id,
        x: sx,
        y,
        z: sz,
        richness,
        scale,
        rot,
        kind: sampleKindAt({
          type: p.type,
          aspects: p.aspects,
          aboveSeaM: macroAboveSeaM,
          latitude: Math.abs(DIR.y),
          quirks,
          roll: kindRoll,
        }).id,
      });
    }
  }

  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
