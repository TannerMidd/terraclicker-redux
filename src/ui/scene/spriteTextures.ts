/**
 * Imperative, cached texture loading for in-scene sprites.
 *
 * Never use R3F's useLoader for these: suspending inside the Canvas (with the
 * async WebGPU renderer factory) detaches the pointer-event system from the
 * live canvas and every scene click dies. Textures returned here are empty
 * until the network delivers them, then pop in — fine for decorative billboards.
 */
import { SRGBColorSpace, Texture, TextureLoader } from 'three/webgpu';

const loader = new TextureLoader();
const cache = new Map<string, Texture>();

export function sceneTex(url: string): Texture {
  let tex = cache.get(url);
  if (!tex) {
    tex = loader.load(url);
    tex.colorSpace = SRGBColorSpace;
    cache.set(url, tex);
  }
  return tex;
}
