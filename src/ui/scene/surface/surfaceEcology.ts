/**
 * The vignette lattice — authored biology on the coarse cells, exactly the
 * landmark construction at its own salt. A vignette's identity is its cell
 * (`V{face}:{iu}:{iv}`), so the nesting colony you sighted on one landing
 * is raising the same ten thousand complaints on every later one.
 *
 * Placement honours both water laws: shore kinds probe the same planet-frame
 * fan the coastal landmarks use, and dry kinds beyond the near tier are
 * accepted against the ANALYTIC field — a herd must never be promised grass
 * the sea already owns (Phase 3's census law, applied to biology).
 *
 * Presence is planet truth: type and the Bio gauge decide which kinds can
 * exist at all, so a hero commission's ground fills with vignettes as the
 * Biotic gauge climbs — life arriving as the world becomes worth living on.
 */
import { Vector3 } from 'three/webgpu';
import { speciesPresent, type GroundSpeciesDef } from '../../../content/groundSpecies';
import type { PlanetType } from '../../../engine/types';
import { cellDir, cellOf, cellRand, cellsPerEdgeAt } from './surfaceSites';
import {
  analyticHeight,
  curvatureDrop,
  dirToLocal,
  groundNormalAt,
  heightAt,
  localDir,
  type SurfaceParams,
  type SurfaceTiers,
} from './terrainField';

/** Coarse cell edge, metres — biology is rarer than geology. */
export const VIGNETTE_CELL_M = 2600;
/** Fraction of coarse cells that host life, before the terrain votes. */
const VIGNETTE_P = 0.26;
/** How far from the touchdown the biologger's census reaches, metres. */
export const VIGNETTE_FIELD_RADIUS = 6500;
/** Close enough for the compass to name it. */
export const VIGNETTE_SIGHT_M = 2600;
/** Walking this close catalogues a vignette: you can plainly see it. */
export const VIGNETTE_CATALOG_M = 46;

export interface VignetteSpec {
  /** Planet-fixed id: `V{face}:{iu}:{iv}`. */
  id: string;
  /** Species id into content/groundSpecies.ts. */
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

/** The coastal landmarks' probe fan, shared spirit: planet-frame offsets. */
const SHORE_PROBES: readonly [number, number][] = [
  [0, 0],
  [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22],
  [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3],
];

function inShoreBand(y: number, seaM: number): boolean {
  return y - seaM > -9 && y - seaM < 9;
}

/**
 * Every vignette the region holds, in the current landing frame, sorted by
 * id. Same draw-order law as every lattice: presence, kind, jitter, scale,
 * rotation, variation — a cell that grew a colony grew the same colony
 * under every sky.
 */
export function vignetteSites(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  bio: number,
  radiusM: number = VIGNETTE_FIELD_RADIUS,
): VignetteSpec[] {
  const candidates = speciesPresent(p.type as PlanetType, bio, 'vignette');
  if (candidates.length === 0) return [];
  const totalW = candidates.reduce((s, d) => s + d.weight, 0);

  const n = cellsPerEdgeAt(p.radiusM, VIGNETTE_CELL_M);
  const seen = new Set<string>();
  const out: VignetteSpec[] = [];

  const step = VIGNETTE_CELL_M * 0.45;
  for (let z = -radiusM; z <= radiusM; z += step) {
    for (let x = -radiusM; x <= radiusM; x += step) {
      if (x * x + z * z > radiusM * radiusM) continue;
      localDir(p, x, z, DIR);
      const cell = cellOf(DIR, n);
      const id = `V${cell.face}:${cell.iu}:${cell.iv}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const r = cellRand((p.seed ^ 0x2b10) >>> 0, cell);
      if (r() >= VIGNETTE_P) continue;
      let roll = r() * totalW;
      let def: GroundSpeciesDef = candidates[candidates.length - 1]!;
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

      let sx = 0;
      let sz = 0;
      let sy = 0;
      let placed = false;
      const probes = def.shore ? SHORE_PROBES : SHORE_PROBES.slice(0, 1);
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
        if (def.shore) {
          if (!inShoreBand(py, p.seaLevelM)) continue;
        } else {
          if (py < p.seaLevelM + 4) continue;
          // Beyond the near tier the far samples lie about the sea; the
          // analytic field is what every tier converges to. Ask it.
          if (analyticHeight(p, px, pz) - curvatureDrop(p, px, pz) < p.seaLevelM + 1.2) continue;
          groundNormalAt(p, tiers, px, pz, NORMAL);
          if (NORMAL.y < 0.68) continue;
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
