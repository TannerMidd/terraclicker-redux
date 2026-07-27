/**
 * The terrain's one mesh: a polar grid that follows the camera.
 *
 * Clipmap rings were the obvious choice and the wrong one: nested square
 * levels need snap alignment, hole margins and skirt curtains, and every one
 * of those is a seam waiting for the exact frame you look at it. A polar
 * grid has no seams to defend. Ring radii grow geometrically, so triangle
 * density is automatically spent where the eye is; the mesh slides
 * continuously under the camera and the vertex shader re-samples the baked
 * height field at whatever world position each vertex lands on.
 *
 * The cost is a little vertex swim on distant silhouettes as the lattice
 * slides across the field — bounded by field curvature over one ring
 * spacing, which the spacing schedule keeps below notice: ~5% of range,
 * against a far tier that only holds 64 m of detail per texel anyway.
 */
import { BufferAttribute, BufferGeometry } from 'three/webgpu';

export const TERRAIN_RINGS = 220;
export const TERRAIN_SPOKES = 128;
export const TERRAIN_R0 = 0.9;
export const TERRAIN_REACH = 33000;

let cached: BufferGeometry | null = null;

/** Build (once) the camera-centered polar terrain grid. */
export function terrainGeometry(): BufferGeometry {
  if (cached) return cached;
  const rings = TERRAIN_RINGS;
  const spokes = TERRAIN_SPOKES;
  const growth = Math.pow(TERRAIN_REACH / TERRAIN_R0, 1 / (rings - 1));

  // Center vertex + rings × spokes lattice.
  const count = 1 + rings * spokes;
  const pos = new Float32Array(count * 3);
  let w = 3; // vertex 0 is the center, already zeroed
  const radii: number[] = [];
  let r = TERRAIN_R0;
  for (let i = 0; i < rings; i++) {
    radii.push(r);
    for (let s = 0; s < spokes; s++) {
      const a = (s / spokes) * Math.PI * 2;
      pos[w++] = Math.cos(a) * r;
      pos[w++] = 0;
      pos[w++] = Math.sin(a) * r;
    }
    r *= growth;
  }

  const idx: number[] = [];
  // Fan from the center to ring 0.
  for (let s = 0; s < spokes; s++) {
    const a = 1 + s;
    const b = 1 + ((s + 1) % spokes);
    idx.push(0, b, a);
  }
  // Quad strips between consecutive rings.
  for (let i = 0; i < rings - 1; i++) {
    const ringA = 1 + i * spokes;
    const ringB = ringA + spokes;
    for (let s = 0; s < spokes; s++) {
      const s2 = (s + 1) % spokes;
      const a = ringA + s;
      const b = ringA + s2;
      const c = ringB + s;
      const d = ringB + s2;
      idx.push(a, d, c, a, b, d);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // The shader displaces vertically by up to a mountain range; culling by the
  // flat bounding box would blink the whole world off at the wrong angle.
  geo.boundingSphere = null;
  return (cached = geo);
}
