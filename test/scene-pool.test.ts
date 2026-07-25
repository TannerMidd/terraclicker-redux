import { describe, expect, it, afterEach } from 'vitest';
import {
  pooledMaterial,
  pooledMaterialCount,
  resetPooledMaterials,
} from '../src/ui/scene/universe/pool';

/**
 * The budget these tests protect, measured in docs/ROADMAP.md §0.6: a
 * 409-world scene draws 279 meshes carrying 227 distinct material graphs with
 * two instanced meshes. This renderer compiles a pipeline per graph, so a
 * feature that mints a material per object is a feature that adds a pipeline
 * compile per object — and pipeline compiles are what the 167ms hitch on
 * entering flight is made of.
 *
 * The rule is one graph per *kind*, never per instance. This is the part of
 * that rule that can be asserted without a canvas.
 */

// A stand-in for a node material — the identity behaviour is what matters,
// not the three hundred fields a real Material carries.
import type { Material } from 'three/webgpu';
const fakeMaterial = () => ({ dispose: () => {} }) as unknown as Material;

afterEach(() => resetPooledMaterials());

describe('pooled materials', () => {
  it('hands back the same graph for the same kind', () => {
    let built = 0;
    const make = () => {
      built += 1;
      return fakeMaterial();
    };

    const first = pooledMaterial('settlement-light', make);
    for (let i = 0; i < 400; i++) pooledMaterial('settlement-light', make);

    expect(built).toBe(1);
    expect(pooledMaterial('settlement-light', make)).toBe(first);
    expect(pooledMaterialCount()).toBe(1);
  });

  it('keeps four hundred worlds of lights inside a two-graph budget', () => {
    // What Phase 3 will actually do: a light and a weather layer per world,
    // across a full universe. Under the old authoring style this is 800 graphs.
    for (let world = 0; world < 400; world++) {
      pooledMaterial('settlement-light', fakeMaterial);
      pooledMaterial('world-weather', fakeMaterial);
    }
    expect(pooledMaterialCount()).toBe(2);
  });

  it('still separates genuinely different kinds', () => {
    pooledMaterial('buoy', fakeMaterial);
    pooledMaterial('depot', fakeMaterial);
    pooledMaterial('survey-station', fakeMaterial);
    expect(pooledMaterialCount()).toBe(3);
  });

  it('catches the mistake it exists to prevent', () => {
    // Keying on instance identity rather than kind. This is the failure mode:
    // it looks like pooling and behaves like minting.
    for (let i = 0; i < 50; i++) pooledMaterial(`settlement-light-${i}`, fakeMaterial);
    expect(pooledMaterialCount()).toBe(50);
    expect(pooledMaterialCount()).toBeGreaterThan(3); // over the per-feature budget
  });
});
