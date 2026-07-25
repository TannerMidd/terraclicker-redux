/**
 * A delivered world, rendered exactly like the hero planet.
 *
 * These used to be a second, much poorer pipeline: an icosphere at detail 2–3
 * (a few hundred vertices for a whole planet) wearing CPU-baked vertex
 * colours. Next to the hero world — detail 5 and a full procedural surface —
 * a finished planet looked like a marble of the thing it had been, and the
 * closer you flew the worse the comparison got.
 *
 * There is now one pipeline. A settled world uses the same geometry builder
 * and the same node material as the hero; the only difference is that its
 * gauges are pinned to DELIVERED rather than tracking a live commission, so
 * its seas are full, its ice caps are back where they belong, vegetation has
 * spread and the cities are lit. Which is the whole point of finishing one.
 *
 * Materials are cached per world seed. Building one is cheap, but the shader
 * link behind it is not, and a revealed system mounts five at once.
 */
import type { MeshStandardNodeMaterial } from 'three/webgpu';
import type { BufferGeometry } from 'three/webgpu';
import { createPlanetGeometry } from './planetGeometry';
import { createPlanetMaterial, paletteFor } from './planetMaterial';
import type { CompletedPlanetRecord } from '../../engine/types';

/** How much of the hero's fidelity each presentation gets. */
export type SettledDetail = 'mini' | 'visit' | 'closeup';

/**
 * Icosphere subdivision by presentation. `closeup` matches the hero's own
 * default; `mini` is the one that is genuinely a dot on screen.
 */
const DETAIL: Record<SettledDetail, number> = {
  mini: 3,
  visit: 4,
  closeup: 5,
};

/** The sun the whole scene shares (Planet.tsx owns the canonical value). */
const SUN_DIR: [number, number, number] = [4.2, 1.8, 2.6];

interface Entry {
  mat: MeshStandardNodeMaterial;
}

const matCache = new Map<number, Entry>();
const geoCache = new Map<string, BufferGeometry>();

/**
 * The material for a delivered world. Gauges are pinned full: a world that
 * shipped is a world that finished, and it should never again render as the
 * half-terraformed rock it started as.
 */
export function settledMaterial(record: CompletedPlanetRecord): MeshStandardNodeMaterial {
  const hit = matCache.get(record.seed);
  if (hit) return hit.mat;

  const pal = paletteFor(record.type, record.seed);
  const built = createPlanetMaterial(pal, record.seed, record.lifetimeIndex === 42);
  const u = built.uniforms;
  u.thermal.value = 1;
  u.atmo.value = 1;
  u.hydro.value = 1;
  u.bio.value = 1;
  u.sunDir.value.set(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);

  matCache.set(record.seed, { mat: built.mat });
  return built.mat;
}

/** Hero-grade geometry for a delivered world, cached per seed + presentation. */
export function settledGeometry(
  record: CompletedPlanetRecord,
  detail: SettledDetail,
): BufferGeometry {
  const key = `${record.seed}:${detail}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const fjords = record.quirks.includes('award-winning-fjords') ? 1 : 0;
  const geo = createPlanetGeometry(record.seed, record.type, DETAIL[detail], fjords);
  geoCache.set(key, geo);
  return geo;
}
