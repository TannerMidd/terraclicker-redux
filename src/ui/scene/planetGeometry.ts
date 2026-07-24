import { BufferAttribute, IcosahedronGeometry, type BufferGeometry } from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D } from 'simplex-noise';
import { mulberry } from '../../engine/rng';
import type { PlanetType } from '../../engine/types';

export interface PlanetShapeParams {
  /** Vertex displacement amplitude. */
  amp: number;
  /** Base noise frequency. */
  freq: number;
  /** Extra ridged mountain factor. */
  ridge: number;
}

const SHAPE_BY_TYPE: Record<PlanetType, PlanetShapeParams> = {
  terrestrial: { amp: 0.085, freq: 1.6, ridge: 0.5 },
  ice: { amp: 0.06, freq: 1.9, ridge: 0.3 },
  desert: { amp: 0.1, freq: 1.4, ridge: 0.7 },
  volcanic: { amp: 0.12, freq: 1.8, ridge: 1.0 },
  ocean: { amp: 0.045, freq: 1.5, ridge: 0.2 },
  gasgiant: { amp: 0.02, freq: 0.8, ridge: 0 },
};

/**
 * A displaced icosphere with per-vertex `elevation` (0–1) and `latitude`
 * (0–1, poles = 1) attributes. Deterministic from the planet seed —
 * the same world always has the same mountains.
 */
export function createPlanetGeometry(
  seed: number,
  type: PlanetType,
  detail: number,
  fjordBoost = 0,
): BufferGeometry {
  // Icosahedron geometry ships non-indexed (flat shading); weld it so
  // computeVertexNormals yields a smooth sphere instead of a golf ball.
  const geo = mergeVertices(new IcosahedronGeometry(1, detail));
  const shape = SHAPE_BY_TYPE[type];
  const rand = mulberry(seed);
  const noise = createNoise3D(rand);
  const noise2 = createNoise3D(rand);

  const pos = geo.getAttribute('position');
  const count = pos.count;
  const elevation = new Float32Array(count);
  const latitude = new Float32Array(count);

  const f = shape.freq;
  const coastF = 4.2 + fjordBoost * 5; // fjords: crinklier coasts, by decree of Slartibartfast

  // Pass 1: raw FBM elevation.
  const raw = new Float32Array(count);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let e = 0;
    let a = 0.5;
    let ff = f;
    for (let o = 0; o < 4; o++) {
      e += a * noise(x * ff, y * ff, z * ff);
      a *= 0.5;
      ff *= 2.1;
    }
    if (shape.ridge > 0) {
      const r = 1 - Math.abs(noise2(x * f * 1.7, y * f * 1.7, z * f * 1.7));
      e += shape.ridge * 0.3 * r * r;
    }
    e += 0.1 * noise2(x * coastF, y * coastF, z * coastF);
    raw[i] = e;
    if (e < min) min = e;
    if (e > max) max = e;
  }

  // Pass 2: normalize so every planet actually uses its 0..1 range —
  // otherwise seas are puddles and mountains are rumors.
  const span = max - min || 1;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const en = (raw[i]! - min) / span;
    elevation[i] = en;
    latitude[i] = Math.abs(y);
    const disp = 1 + (en - 0.5) * shape.amp;
    pos.setXYZ(i, x * disp, y * disp, z * disp);
  }

  geo.setAttribute('elevation', new BufferAttribute(elevation, 1));
  geo.setAttribute('latitude', new BufferAttribute(latitude, 1));
  geo.computeVertexNormals();
  return geo;
}
