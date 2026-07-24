import { describe, expect, it } from 'vitest';
import {
  bandAt,
  cosmicWeb,
  galaxyPoints,
  protoSwirlPoints,
  sampleJourney,
  starClass,
  starColor,
} from '../src/ui/scene/universeLayout';
import { Vector3 } from 'three/webgpu';

describe('universe layout (scene is derived state)', () => {
  it('cosmic web is deterministic per seed and structurally sane', () => {
    const a = cosmicWeb(12345);
    const b = cosmicWeb(12345);
    const c = cosmicWeb(54321);
    expect(a.filaments).toEqual(b.filaments);
    expect(a.order).toEqual(b.order);
    expect(a.filaments).not.toEqual(c.filaments);

    // Every order entry addresses a real node, exactly once.
    const n = a.nodes.length / 3;
    expect(a.order.length).toBe(n);
    expect(new Set(a.order).size).toBe(n);
    expect(n).toBeGreaterThan(60); // enough dark to get lost in

    // The web hangs behind the galaxy shell.
    for (let i = 0; i < n; i++) {
      expect(a.nodes[i * 3 + 2]!).toBeLessThan(-30);
    }
  });

  it('galaxy and proto-swirl clouds are deterministic', () => {
    expect(galaxyPoints(7)).toEqual(galaxyPoints(7));
    expect(protoSwirlPoints(7, 120)).toEqual(protoSwirlPoints(7, 120));
    expect(starColor(9).getHex()).toBe(starColor(9).getHex());
    expect(typeof starClass(9)).toBe('string');
  });

  it('journey sampling is monotone in distance and lands on the hero shot', () => {
    const cam = new Vector3();
    const look = new Vector3();
    sampleJourney(0, true, cam, look);
    expect(cam.z).toBeCloseTo(6.55, 2);
    let prev = cam.z;
    for (let z = 0.1; z <= 1.001; z += 0.1) {
      sampleJourney(Math.min(1, z), true, cam, look);
      expect(cam.z).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = cam.z;
    }
    expect(prev).toBeGreaterThan(90);
  });

  it('bands cover the journey in order', () => {
    expect(bandAt(0)).toBe(0);
    expect(bandAt(0.3)).toBe(1);
    expect(bandAt(0.55)).toBe(2);
    expect(bandAt(0.8)).toBe(3);
    expect(bandAt(1)).toBe(4);
  });
});
