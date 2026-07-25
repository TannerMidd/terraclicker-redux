/**
 * Finished worlds, kept: the same procedural generator as the hero planet
 * (seeded geometry, per-type palette) baked to CPU vertex colors so an
 * entire universe of unique planets renders with one cheap material.
 * Completed planets are ALIVE — full seas, spread vegetation, warm lights.
 */
import { BufferAttribute, Color, MeshStandardNodeMaterial, type BufferGeometry } from 'three/webgpu';
import {
  attribute,
  clamp,
  cross,
  float,
  mix,
  mx_fractal_noise_float,
  normalize,
  normalLocal,
  positionLocal,
  smoothstep,
  transformNormalToView,
  vec3,
} from 'three/tsl';
import { createPlanetGeometry } from './planetGeometry';
import { paletteFor } from './planetMaterial';
import type { CompletedPlanetRecord } from '../../engine/types';
import { mulberry } from '../../engine/rng';

const tmp = new Color();

export function createMiniPlanetGeometry(
  record: CompletedPlanetRecord,
  detail = 2,
): BufferGeometry {
  const geo = createPlanetGeometry(record.seed, record.type, detail);
  const pal = paletteFor(record.type, record.seed);
  const elevation = geo.getAttribute('elevation');
  const latitude = geo.getAttribute('latitude');
  const count = elevation.count;
  const colors = new Float32Array(count * 3);
  const rand = mulberry(record.seed ^ 0x600d);
  const vegNoiseOff = rand() * 10;

  // A finished world: generous sea level, living land.
  const seaLevel = 0.44;
  const capEdge = 0.9;

  for (let i = 0; i < count; i++) {
    const e = elevation.getX(i);
    const lat = latitude.getX(i);
    if (e < seaLevel) {
      const depth = Math.min(1, (seaLevel - e) / 0.3);
      tmp.copy(pal.shallowWater).lerp(pal.deepWater, depth);
    } else {
      const h = Math.min(1, (e - seaLevel) / (1 - seaLevel));
      tmp.copy(pal.low).lerp(pal.high, h);
      // Vegetation blankets the lowlands of a completed planet.
      const veg = Math.max(0, 1 - h * 1.6) * (0.55 + 0.45 * Math.sin(e * 43 + vegNoiseOff));
      tmp.lerp(pal.vegetation, Math.max(0, Math.min(0.85, veg)));
      if (e > 0.82) tmp.lerp(pal.peak, (e - 0.82) / 0.18);
    }
    if (lat > capEdge) tmp.lerp(pal.ice, Math.min(1, (lat - capEdge) / 0.08));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}

/**
 * The material every settled world wears.
 *
 * The baked vertex colours give each world its own palette, but at detail 2
 * that is 162 colour samples for a whole planet — which is exactly why a
 * finished world used to read as a blurry ball with a few colours in it, and
 * got worse the closer you looked. The geometry keeps carrying the identity;
 * this adds the frequencies above it per pixel: a modulation of the baked
 * colour so land has texture, and a derived normal so the relief is lit
 * rather than painted.
 *
 * Deliberately ONE shared instance for every settled world. Per-planet
 * materials meant a newly revealed system linked a fresh shader per world,
 * mid-flight, which profiled as the largest single source of frame hitches.
 * The relief pattern is therefore shared too — invisible at these sizes,
 * because the colours underneath are all different.
 */
function createSettledMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  const baked = attribute('color', 'vec3');
  const dir = normalize(positionLocal);

  type V = Parameters<typeof mx_fractal_noise_float>[0];
  // Landform scale, not speckle scale. These spheres are a fifth of a unit
  // across; anything much above this and the modulation stops reading as
  // terrain and starts reading as noise laid over the baked colours.
  const rock = (d: ReturnType<typeof vec3>) =>
    mx_fractal_noise_float(d.mul(13) as unknown as V, 3, 2.3, 0.55, 1)
      .mul(0.66)
      .add(mx_fractal_noise_float(d.mul(46) as unknown as V, 2, 2.4, 0.5, 1).mul(0.34));

  const eps = 0.004;
  const tanA = normalize(cross(dir, vec3(0, 1, 0)));
  const tanB = normalize(cross(dir, vec3(1, 0, 0)));
  const tan1 = normalize(mix(tanA, tanB, smoothstep(0.86, 0.99, dir.y.abs())));
  const tan2 = normalize(cross(dir, tan1));

  const hC = rock(dir as unknown as ReturnType<typeof vec3>);
  const hU = rock(normalize(dir.add(tan1.mul(eps))) as unknown as ReturnType<typeof vec3>);
  const hV = rock(normalize(dir.add(tan2.mul(eps))) as unknown as ReturnType<typeof vec3>);

  const bump = tan1.mul(hU.sub(hC)).add(tan2.mul(hV.sub(hC))).mul(-0.012 / eps);

  mat.colorNode = baked.mul(clamp(hC.mul(0.24).add(0.9), 0.6, 1.25));
  mat.normalNode = transformNormalToView(
    normalize(normalLocal.add(bump)),
  ) as unknown as typeof mat.normalNode;
  mat.roughnessNode = float(0.85) as unknown as typeof mat.roughnessNode;
  return mat;
}

/** Shared by AssemblingSystem, FocusedSystem and the formation ceremonies. */
export const SETTLED_MATERIAL = createSettledMaterial();

export { MINI_SIZE } from './universeLayout';
