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
import type { CompletedPlanetRecord, PlanetType } from '../../engine/types';

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

/**
 * The material a delivered world wears when it is a few pixels across:
 * one per planet TYPE, shared by every distant world of that type.
 *
 * Sharing the compiled shader — which planetMaterial.ts now does for every
 * planet in the game — makes a world free to DRAW. It does not make one free
 * to ASK FOR. A material instance still has to have its node graph assembled
 * in JS, and three still has to walk that graph once to hash it, inside the
 * render pass, the first time the material is used. Together that is about
 * 25ms per instance, and a visited galaxy asks for twenty-five at once: five
 * member systems, five worlds each. Measured as a 780ms freeze on entering a
 * galaxy, and no amount of shader sharing touches it.
 *
 * So at distance the instance is shared as well, and what a world loses by it
 * is the seed jitter in its palette — a few percent of hue — while it is four
 * pixels wide. What it keeps is its TYPE, which is the part you can actually
 * see: an ice world is still ice, a volcanic world still glows. Approach and
 * FocusedSystem hands it its own per-seed material with its own continents,
 * which is the point at which the difference exists.
 *
 * Building even six of these at once would hitch, so they are staged: callers
 * pass a value that is equal within a frame and different between frames
 * (`state.clock.elapsedTime`), and get null until the budget comes round.
 */
const BUILD_BUDGET_MS = 5;
let budgetFrame = -1;
let budgetSpent = 0;
const typeCache = new Map<PlanetType, MeshStandardNodeMaterial>();

export function distantMaterial(
  type: PlanetType,
  frame: number,
): MeshStandardNodeMaterial | null {
  const hit = typeCache.get(type);
  if (hit) return hit;
  if (frame !== budgetFrame) {
    budgetFrame = frame;
    budgetSpent = 0;
  }
  if (budgetSpent >= BUILD_BUDGET_MS) return null;

  const t0 = performance.now();
  // Seed 0: the canonical palette for the type, with no per-world jitter —
  // the same convention SettledAtmosphere uses for its air shells.
  const built = createPlanetMaterial(paletteFor(type, 0), 0, false);
  const u = built.uniforms;
  u.thermal.value = 1;
  u.atmo.value = 1;
  u.hydro.value = 1;
  u.bio.value = 1;
  u.sunDir.value.set(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);
  typeCache.set(type, built.mat);
  budgetSpent += performance.now() - t0;
  return built.mat;
}

/**
 * The geometry a world wears when it is a handful of pixels across.
 *
 * Real terrain is built on the CPU — four octaves of simplex per vertex, then
 * a weld — and a visited galaxy puts five member systems on screen at once.
 * Twenty-five of those builds measured as a 917ms freeze on entering a
 * galaxy, to render worlds about four pixels wide. So the distant tier shares
 * one sphere, the way it shares a material per type (`distantMaterial`).
 * Approaching hands the seat to FocusedSystem, which builds the real terrain;
 * the swap happens under a camera flight, where nobody is studying a
 * silhouette four pixels across.
 */
let distantGeo: BufferGeometry | null = null;

export function distantGeometry(): BufferGeometry {
  distantGeo ??= createPlanetGeometry(1, 'terrestrial', DETAIL.mini, 0);
  return distantGeo;
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
