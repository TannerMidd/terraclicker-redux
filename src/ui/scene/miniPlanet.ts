/**
 * Finished worlds, kept: the same procedural generator as the hero planet
 * (seeded geometry, per-type palette) baked to CPU vertex colors so an
 * entire universe of unique planets renders with one cheap material.
 * Completed planets are ALIVE — full seas, spread vegetation, warm lights.
 */
import { BufferAttribute, Color, type BufferGeometry } from 'three/webgpu';
import { createPlanetGeometry } from './planetGeometry';
import { paletteFor } from './planetMaterial';
import type { CompletedPlanetRecord } from '../../engine/types';
import { mulberry } from '../../engine/rng';

const tmp = new Color();

export function createMiniPlanetGeometry(record: CompletedPlanetRecord): BufferGeometry {
  const geo = createPlanetGeometry(record.seed, record.type, 2);
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

export const MINI_SIZE: Record<CompletedPlanetRecord['size'], number> = {
  small: 0.13,
  medium: 0.16,
  large: 0.2,
  huge: 0.24,
};
