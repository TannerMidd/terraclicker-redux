import { describe, expect, it } from 'vitest';
import {
  flightTrafficCount,
  screenAwareSpriteScale,
  TRAFFIC_RENDER_BUDGET,
} from '../src/ui/scene/trafficMath';

describe('flight traffic budget', () => {
  it('grows across worlds, systems, and galaxies but stays bounded', () => {
    const early = flightTrafficCount(1, 0, 0);
    const settled = flightTrafficCount(18, 3, 0);
    const intergalactic = flightTrafficCount(90, 18, 3);
    expect(early).toBeGreaterThanOrEqual(7);
    expect(settled).toBeGreaterThan(early);
    expect(intergalactic).toBeGreaterThan(settled);
    expect(flightTrafficCount(1_000_000, 100_000, 5_000)).toBe(TRAFFIC_RENDER_BUDGET);
  });

  it('does not render commerce before a world exists', () => {
    expect(flightTrafficCount(0, 20, 4)).toBe(0);
    expect(flightTrafficCount(Number.NaN, 0, 0)).toBe(0);
  });
});

describe('screen-aware sprite scale', () => {
  it('keeps apparent size stable as distance changes', () => {
    const near = screenAwareSpriteScale(20, 42, 1080, 22, 0.001, 100);
    const far = screenAwareSpriteScale(200, 42, 1080, 22, 0.001, 100);
    expect(far / near).toBeCloseTo(10, 8);
  });

  it('respects near and far safety caps', () => {
    expect(screenAwareSpriteScale(0, 42, 1080, 22, 0.1, 4)).toBe(0.1);
    expect(screenAwareSpriteScale(100_000, 42, 1080, 22, 0.1, 4)).toBe(4);
  });
});
