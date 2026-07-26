/** Hard ceiling for decorative ships, including mature multi-galaxy saves. */
export const TRAFFIC_RENDER_BUDGET = 56;

function finiteFloor(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Decorative traffic grows throughout a run without scaling linearly into a
 * render problem. Worlds create demand; systems and galaxies create hubs.
 */
export function flightTrafficCount(planets: number, systems: number, galaxies: number): number {
  const worlds = finiteFloor(planets);
  if (worlds === 0) return 0;
  const systemHubs = finiteFloor(systems);
  const galaxyHubs = finiteFloor(galaxies);
  const demand = 4
    + Math.sqrt(worlds) * 3.2
    + Math.sqrt(systemHubs) * 4.2
    + Math.sqrt(galaxyHubs) * 5.5;
  return Math.min(TRAFFIC_RENDER_BUDGET, Math.max(7, Math.floor(demand)));
}

/**
 * World-space sprite height needed to occupy a stable number of screen pixels
 * in a perspective camera. Caps keep near-lens and extreme-range cases sane.
 */
export function screenAwareSpriteScale(
  distance: number,
  fovDegrees: number,
  viewportHeight: number,
  targetPixels: number,
  minScale = 0.08,
  maxScale = 5,
): number {
  const d = Math.max(0.01, Number.isFinite(distance) ? distance : 0.01);
  const fov = Math.max(1, Math.min(170, Number.isFinite(fovDegrees) ? fovDegrees : 42));
  const height = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const pixels = Math.max(1, Number.isFinite(targetPixels) ? targetPixels : 1);
  const lo = Math.max(0.001, Math.min(minScale, maxScale));
  const hi = Math.max(lo, Math.max(minScale, maxScale));
  const visibleWorldHeight = 2 * d * Math.tan((fov * Math.PI) / 360);
  return Math.max(lo, Math.min(hi, visibleWorldHeight * (pixels / height)));
}
