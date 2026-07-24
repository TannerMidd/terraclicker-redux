import { AdditiveBlending, BackSide, Color, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  dot,
  float,
  mix,
  mx_fractal_noise_float,
  normalize,
  normalWorld,
  positionWorld,
  pow,
  smoothstep,
  sub,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import { mulberry } from '../../engine/rng';
import type { PlanetType } from '../../engine/types';

export interface PlanetPalette {
  deepWater: Color;
  shallowWater: Color;
  low: Color;
  high: Color;
  peak: Color;
  vegetation: Color;
  ice: Color;
  atmosphere: Color;
  emissive: Color; // volcanic veins / city warmth
  /** Ice-cap latitude at thermal=0 (lower = bigger caps). */
  capBase: number;
  /** Global frost tint strength at thermal=0. */
  frostMax: number;
}

function c(hex: number): Color {
  return new Color(hex);
}

export function paletteFor(type: PlanetType, seed: number): PlanetPalette {
  const r = mulberry(seed ^ 0x5eed);
  const jitter = (col: Color, amt = 0.05) => {
    const h = { h: 0, s: 0, l: 0 };
    col.getHSL(h);
    col.setHSL((h.h + (r() - 0.5) * amt + 1) % 1, Math.min(1, h.s * (0.9 + r() * 0.25)), h.l);
    return col;
  };
  switch (type) {
    case 'ice':
      return {
        deepWater: jitter(c(0x0a2340)), shallowWater: jitter(c(0x16466b)),
        low: jitter(c(0x8fa6ba)), high: jitter(c(0xbccddc)), peak: c(0xe8f0f8),
        vegetation: jitter(c(0x3f8f6a)), ice: c(0xe8f2fb), atmosphere: c(0x9fd4ef),
        emissive: c(0x000000), capBase: 0.3, frostMax: 0.55,
      };
    case 'desert':
      return {
        deepWater: jitter(c(0x123a52)), shallowWater: jitter(c(0x1f5f74)),
        low: jitter(c(0xb08a4a)), high: jitter(c(0x8a5f34)), peak: jitter(c(0x6b4526)),
        vegetation: jitter(c(0x5a9e4f)), ice: c(0xf2e9d8), atmosphere: c(0xe8c08a),
        emissive: c(0x000000), capBase: 0.85, frostMax: 0.04,
      };
    case 'volcanic':
      return {
        deepWater: jitter(c(0x16100f)), shallowWater: jitter(c(0x33231d)),
        low: jitter(c(0x2e2422)), high: jitter(c(0x4d3a34)), peak: jitter(c(0x201a1a)),
        vegetation: jitter(c(0x4d7d45)), ice: c(0xd8d2ce), atmosphere: c(0xef8f5a),
        emissive: c(0xff4d1a), capBase: 0.9, frostMax: 0.0,
      };
    case 'ocean':
      return {
        deepWater: jitter(c(0x082849)), shallowWater: jitter(c(0x155a8a)),
        low: jitter(c(0x7d9459), 0.08), high: jitter(c(0x5f7a46)), peak: jitter(c(0xa4b482)),
        vegetation: jitter(c(0x3d9e5f)), ice: c(0xe4eef6), atmosphere: c(0x7ac4e8),
        emissive: c(0x000000), capBase: 0.6, frostMax: 0.12,
      };
    case 'gasgiant':
      return {
        deepWater: jitter(c(0x3a2d56)), shallowWater: jitter(c(0x6b4680)),
        low: jitter(c(0x8f6ba4), 0.1), high: jitter(c(0xb488a0)), peak: jitter(c(0xd4b4c4)),
        vegetation: jitter(c(0x5fae8a)), ice: c(0xe8e2f2), atmosphere: c(0xc49ae8),
        emissive: c(0x000000), capBase: 0.72, frostMax: 0.06,
      };
    default:
      return {
        deepWater: jitter(c(0x0a2f4d)), shallowWater: jitter(c(0x1c628a)),
        low: jitter(c(0x6d6046), 0.08), high: jitter(c(0x55492f)), peak: jitter(c(0x8d8574)),
        vegetation: jitter(c(0x3f9e58)), ice: c(0xe8f0f8), atmosphere: c(0x8ac4e8),
        emissive: c(0x000000), capBase: 0.58, frostMax: 0.16,
      };
  }
}

export interface PlanetUniforms {
  thermal: ReturnType<typeof uniform>;
  atmo: ReturnType<typeof uniform>;
  hydro: ReturnType<typeof uniform>;
  bio: ReturnType<typeof uniform>;
  sunDir: ReturnType<typeof uniform>;
}

/**
 * The planet surface as a TSL node graph (ART_DIRECTION.md §4): the four
 * aspect gauges are uniforms, and every visible feature derives from them —
 * ice caps recede with thermal, sea level rises with hydro, vegetation
 * creeps with bio, city lights wake on the night side near completion.
 */
export function createPlanetMaterial(pal: PlanetPalette, seed: number, isEarth: boolean) {
  const thermal = uniform(0);
  const atmo = uniform(0);
  const hydro = uniform(0);
  const bio = uniform(0);
  const sunDir = uniform(vec3(1, 0.35, 0.6));

  const mat = new MeshStandardNodeMaterial();
  const elevation = attribute('elevation', 'float');
  const latitude = attribute('latitude', 'float');
  const seedOff = (seed % 977) * 0.13;

  // — Water: sea level rises with hydro; coastlines genuinely move. —
  const seaLevel = float(0.3).add(hydro.mul(0.18));
  const isWater = smoothstep(seaLevel.add(0.012), seaLevel.sub(0.012), elevation); // 1 under water
  const shoreFoam = smoothstep(0.024, 0.0, abs(elevation.sub(seaLevel))).mul(isWater.oneMinus().add(0.4));
  const waterDepth = smoothstep(seaLevel, seaLevel.sub(0.3), elevation);
  const waterCol = mix(vec3(pal.shallowWater.r, pal.shallowWater.g, pal.shallowWater.b), vec3(pal.deepWater.r, pal.deepWater.g, pal.deepWater.b), waterDepth);

  // — Land ramp by elevation, with altitude depth-shading for contrast. —
  const landMix = smoothstep(seaLevel, 0.85, elevation);
  let landCol = mix(vec3(pal.low.r, pal.low.g, pal.low.b), vec3(pal.high.r, pal.high.g, pal.high.b), landMix);
  landCol = mix(landCol, vec3(pal.peak.r, pal.peak.g, pal.peak.b), smoothstep(0.78, 0.95, elevation));
  landCol = landCol.mul(elevation.mul(0.55).add(0.62)) as unknown as ReturnType<typeof mix>; // valleys darker than ridges

  // — Vegetation: a creeping frontier driven by bio. —
  const vegNoise = mx_fractal_noise_float(positionWorld.mul(2.6).add(vec3(seedOff, 0, seedOff)), 3, 2.2, 0.55, 1);
  const vegBand = smoothstep(seaLevel.add(0.005), seaLevel.add(0.28), elevation)
    .mul(smoothstep(0.75, 0.45, elevation));
  const vegThreshold = bio.mul(1.6).sub(0.55);
  const vegMask = smoothstep(vegThreshold.sub(0.25), vegThreshold, vegNoise.mul(0.5).add(0.5).oneMinus())
    .oneMinus()
    .mul(vegBand)
    .mul(bio.mul(3).clamp(0, 1));
  landCol = mix(landCol, vec3(pal.vegetation.r, pal.vegetation.g, pal.vegetation.b), vegMask.mul(0.9));

  // — Ice caps recede as thermal fills (size at rest depends on planet type). —
  const capEdge = mix(float(pal.capBase), float(0.96), thermal);
  const capMask = smoothstep(capEdge, capEdge.add(0.05), latitude);
  const frost = smoothstep(0.55, 0.0, thermal).mul(pal.frostMax); // permafrost tint when cold

  type N = ReturnType<typeof vec3>;
  let surface = mix(landCol, waterCol, isWater) as unknown as N;
  surface = surface.add(shoreFoam.mul(0.35)) as unknown as N;
  surface = mix(surface, vec3(pal.ice.r, pal.ice.g, pal.ice.b), capMask.max(frost)) as unknown as N;

  mat.colorNode = surface;
  mat.roughnessNode = mix(float(0.9), float(0.24), isWater).sub(
    capMask.mul(0.15),
  ) as unknown as typeof mat.roughnessNode;
  mat.metalnessNode = float(0);

  // — Night side: bioluminescence, then city lights near completion. —
  const nightSide = smoothstep(0.15, -0.25, dot(normalWorld, normalize(sunDir)));
  const cityNoise = mx_fractal_noise_float(positionWorld.mul(9.0).add(vec3(seedOff, seedOff, 0)), 2, 2.0, 0.6, 1);
  const cityMask = smoothstep(0.55, 0.9, cityNoise.mul(0.5).add(0.5))
    .mul(isWater.oneMinus())
    .mul(capMask.oneMinus());
  const civilization = clamp(bio.add(thermal).add(atmo).add(hydro).mul(0.25).sub(0.55).mul(2.4), 0, 1);
  const cityGlow = vec3(1.0, 0.72, 0.35).mul(cityMask).mul(civilization).mul(nightSide).mul(1.6);
  const veins = vec3(pal.emissive.r, pal.emissive.g, pal.emissive.b)
    .mul(smoothstep(0.45, 0.2, elevation))
    .mul(smoothstep(0.6, 0.0, thermal)) // volcanic veins cool and fade as terraforming proceeds
    .mul(0.8);
  const earthNight = (isEarth
    ? vec3(0.02, 0.05, 0.1).mul(nightSide)
    : vec3(0, 0, 0)) as unknown as ReturnType<typeof vec3>;
  mat.emissiveNode = cityGlow.add(veins).add(earthNight);

  return { mat, uniforms: { thermal, atmo, hydro, bio, sunDir } };
}

/** Fresnel-scattering atmosphere shell; thickness and hue track the Atmo gauge. */
export function createAtmosphereMaterial(pal: PlanetPalette) {
  const atmo = uniform(0);
  const mat = new MeshBasicNodeMaterial();
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const rim = pow(sub(1.0, abs(dot(normalWorld, viewDir))), 2.4);
  const strength = atmo.mul(0.9).add(0.045);
  mat.colorNode = vec3(pal.atmosphere.r, pal.atmosphere.g, pal.atmosphere.b).mul(rim).mul(strength);
  mat.side = BackSide;
  mat.transparent = true;
  mat.blending = AdditiveBlending;
  mat.depthWrite = false;
  return { mat, atmo };
}

/** Scrolling noise cloud shell; coverage rides Atmo + Hydro. */
export function createCloudMaterial(seed: number) {
  const coverage = uniform(0);
  const mat = new MeshStandardNodeMaterial();
  const seedOff = (seed % 613) * 0.29;
  const n = mx_fractal_noise_float(
    positionWorld.mul(2.4).add(vec3(time.mul(0.014).add(seedOff), 0, time.mul(0.009))),
    3,
    2.3,
    0.55,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const cutoff = coverage.mul(-0.45).add(0.8);
  mat.colorNode = vec3(1, 1, 1);
  mat.opacityNode = smoothstep(cutoff, cutoff.add(0.12), n).mul(coverage.mul(0.5).add(0.04));
  mat.roughnessNode = float(1);
  mat.transparent = true;
  mat.depthWrite = false;
  return { mat, coverage };
}
