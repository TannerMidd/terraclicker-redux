/**
 * The surface renderer's node materials.
 *
 * Same law as planetMaterial.ts, for the same measured reason: EVERY
 * per-world value is a uniform. One terrain shader serves every landable
 * world in the game; a desert noon, a half-terraformed tundra and a volcanic
 * night differ only in the numbers uploaded. The graphs are built once per
 * session and warmed behind the entry plasma, so the first frame on the
 * ground never compiles anything.
 *
 * Height is sampled from the CPU-baked tiers with a manual bilinear filter —
 * four textureLoads and a mix — which is bit-for-bit the arithmetic
 * terrainField.heightAt performs. The walker and the terrain cannot disagree
 * about where the ground is, because they are reading the same array.
 */
import {
  BackSide,
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  LinearFilter,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  NearestFilter,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  float,
  floor,
  int,
  ivec2,
  length,
  max,
  mix,
  modelWorldMatrix,
  mx_fractal_noise_float,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  texture,
  textureLoad,
  time,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { HeightTier, SurfaceTiers } from './terrainField';
import { TIER_BLEND_START } from './terrainField';
import type { PlanetPalette } from '../planetMaterial';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

// ————— Textures from the baked tiers —————

export interface TierTextures {
  nearHeight: DataTexture;
  farHeight: DataTexture;
  nearNormal: DataTexture;
  farNormal: DataTexture;
}

function heightTexture(tier: HeightTier): DataTexture {
  const t = new DataTexture(tier.data, tier.texels, tier.texels, RedFormat, FloatType);
  // Unfiltered on purpose: the shader does its own bilinear so the CPU can do
  // the identical one. Float32 filtering is also optional hardware — this
  // avoids ever finding out.
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function normalTexture(tier: HeightTier): DataTexture {
  const t = new DataTexture(tier.normals!, tier.texels, tier.texels, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function buildTierTextures(tiers: SurfaceTiers): TierTextures {
  return {
    nearHeight: heightTexture(tiers.near),
    farHeight: heightTexture(tiers.far),
    nearNormal: normalTexture(tiers.near),
    farNormal: normalTexture(tiers.far),
  };
}

export function disposeTierTextures(t: TierTextures): void {
  t.nearHeight.dispose();
  t.farHeight.dispose();
  t.nearNormal.dispose();
  t.farNormal.dispose();
}

/** Manual bilinear height fetch — the shader half of terrainField.sampleTier. */
function bilinearHeight(map: DataTexture, texels: number, extent: number, xz: N): N {
  const step = extent / (texels - 1);
  const half = extent / 2;
  const u = xz.x.add(half).div(step);
  const v = xz.y.add(half).div(step);
  const i0 = clamp(floor(u), 0, texels - 2);
  const j0 = clamp(floor(v), 0, texels - 2);
  const fu = clamp(u.sub(i0), 0, 1);
  const fv = clamp(v.sub(j0), 0, 1);
  const ia = int(i0);
  const ja = int(j0);
  const ib = int(i0.add(1));
  const jb = int(j0.add(1));
  const a = textureLoad(map, ivec2(ia, ja)).r;
  const b = textureLoad(map, ivec2(ib, ja)).r;
  const c = textureLoad(map, ivec2(ia, jb)).r;
  const d = textureLoad(map, ivec2(ib, jb)).r;
  return mix(mix(a, b, fu), mix(c, d, fu), fv);
}

/** Near/far tier blend factor at a ground position (1 = fully near tier). */
function nearness(xz: N, nearExtent: number): N {
  const halfNear = nearExtent / 2;
  const edge = max(abs(xz.x), abs(xz.y)).div(halfNear);
  return smoothstep(1.0, TIER_BLEND_START, edge);
}

export interface TerrainUniforms {
  sunDir: ReturnType<typeof uniform>;
  sunTint: ReturnType<typeof uniform>;
  seaLevel: ReturnType<typeof uniform>;
  snowLine: ReturnType<typeof uniform>;
  frost: ReturnType<typeof uniform>;
  vegDensity: ReturnType<typeof uniform>;
  lavaOn: ReturnType<typeof uniform>;
  curvR2: ReturnType<typeof uniform>;
}

/**
 * The ground. Splat by altitude-above-sea, slope, frost and vegetation, all
 * relative to uniforms so a terraforming tick can move the sea and the snow
 * line under your boots without a recompile.
 */
export function createTerrainMaterial(pal: PlanetPalette, tiers: SurfaceTiers, tex: TierTextures) {
  const sunDir = uniform(new Vector3(0.4, 0.7, 0.3));
  const sunTint = uniform(new Color(0xfff2dc));
  const seaLevel = uniform(-40);
  const snowLine = uniform(2600);
  const frost = uniform(0);
  const vegDensity = uniform(0);
  const lavaOn = uniform(0);
  /** 1 / (2·planet radius) — the curvature drop's whole personality. */
  const curvR2 = uniform(1 / (2 * 320000));

  const uDeep = uniform(pal.deepWater);
  const uLow = uniform(pal.low);
  const uHigh = uniform(pal.high);
  const uPeak = uniform(pal.peak);
  const uVeg = uniform(pal.vegetation);
  const uIce = uniform(pal.ice);
  const uEmissive = uniform(pal.emissive);

  const mat = new MeshStandardNodeMaterial();

  // — Vertex: displace the grid by the baked field. —
  // World position via the object's matrix, NOT positionWorld: positionWorld
  // derives from the displaced output of positionNode, and reading it while
  // computing that output is a cycle.
  const wpos = modelWorldMatrix.mul(vec4(positionLocal, 1));
  const worldXZ = vec2(wpos.x, wpos.z);
  const hNear = bilinearHeight(tex.nearHeight, tiers.near.texels, tiers.near.extent, worldXZ);
  const hFar = bilinearHeight(tex.farHeight, tiers.far.texels, tiers.far.extent, worldXZ);
  const k = nearness(worldXZ, tiers.near.extent);
  const curvature = worldXZ.x.mul(worldXZ.x).add(worldXZ.y.mul(worldXZ.y)).mul(curvR2);
  const h = mix(hFar, hNear, k).sub(curvature);
  mat.positionNode = vec3(positionLocal.x, h, positionLocal.z);

  // — Fragment: normals from the baked maps, plus micro relief. —
  // Displacement is vertical, so the varying's XZ is safe on this side.
  const fragXZ = vec2(positionWorld.x, positionWorld.z);
  const kFrag = nearness(fragXZ, tiers.near.extent);
  const uvNear = vec2(
    fragXZ.x.add(tiers.near.extent / 2).div(tiers.near.extent),
    fragXZ.y.add(tiers.near.extent / 2).div(tiers.near.extent),
  );
  const uvFar = vec2(
    fragXZ.x.add(tiers.far.extent / 2).div(tiers.far.extent),
    fragXZ.y.add(tiers.far.extent / 2).div(tiers.far.extent),
  );
  const nNear = texture(tex.nearNormal, uvNear).xyz.mul(2).sub(1);
  const nFar = texture(tex.farNormal, uvFar).xyz.mul(2).sub(1);
  const baseNormal = normalize(mix(nFar, nNear, kFrag));

  // Micro relief: two noise taps give a slope, exactly the planet shader's
  // trick, at boot-print frequencies. Fades out by 150 m — beyond that the
  // baked normals carry the relief, and at grazing angles a strong bump
  // field reads as chop on water, which is a strange thing for tundra to do.
  const camD = length(cameraPosition.sub(positionWorld));
  const micro = smoothstep(150, 30, camD);
  const mnA = mx_fractal_noise_float(positionWorld.mul(0.9), 2, 2.2, 0.55, 1);
  const mnX = mx_fractal_noise_float(positionWorld.add(vec3(0.35, 0, 0)).mul(0.9), 2, 2.2, 0.55, 1);
  const mnZ = mx_fractal_noise_float(positionWorld.add(vec3(0, 0, 0.35)).mul(0.9), 2, 2.2, 0.55, 1);
  const microBump = vec3(mnA.sub(mnX), 0, mnA.sub(mnZ)).mul(micro.mul(0.28));
  const normal = normalize(baseNormal.add(microBump));
  mat.normalNode = transformNormalToView(normal);

  // — Splat. Everything keys off altitude-above-sea and slope. —
  const altSea = positionWorld.y.sub(seaLevel);
  const slope = clamp(baseNormal.y, 0, 1);
  const bandNoise = mx_fractal_noise_float(positionWorld.mul(0.013), 3, 2.3, 0.5, 1);

  const shore = smoothstep(4.5, 0.5, altSea);
  const lowBand = smoothstep(0, 420, altSea.add(bandNoise.mul(90)));
  const peakBand = smoothstep(500, 1300, altSea.add(bandNoise.mul(160)));

  let col: N = mix(uLow, uHigh, lowBand);
  col = mix(col, uPeak, peakBand);
  // Sand at the waterline — the low colour, bleached.
  col = mix(col, uLow.mul(1.25).add(0.06), shore.mul(lavaOn.oneMinus()));
  // Steep ground sheds soil and shows rock.
  const rocky = smoothstep(0.78, 0.55, slope);
  col = mix(col, mix(uHigh, uPeak, 0.5).mul(0.72), rocky);

  // Vegetation creeps over gentle low ground, exactly as far as the Biotic
  // gauge has pushed it.
  const vegNoise = mx_fractal_noise_float(positionWorld.mul(0.02), 3, 2.2, 0.55, 1).mul(0.5).add(0.5);
  const vegBand = smoothstep(680, 120, altSea).mul(smoothstep(2.5, 12, altSea)).mul(smoothstep(0.62, 0.85, slope));
  const vegMask = smoothstep(
    vegDensity.mul(1.45).oneMinus(),
    vegDensity.mul(1.45).oneMinus().add(0.28),
    vegNoise,
  ).mul(vegBand).mul(clamp(vegDensity.mul(3), 0, 1));
  const vegTone = mx_fractal_noise_float(positionWorld.mul(0.11), 2, 2.1, 0.5, 1).mul(0.18).add(0.86);
  col = mix(col, uVeg.mul(vegTone), vegMask.mul(0.92));

  // Snow above the line (thermal pushes it up); frost dusts everything cold.
  const snowNoise = bandNoise.mul(220);
  const snow = smoothstep(snowLine, snowLine.add(180), altSea.sub(snowNoise).add(peakBand.mul(120)))
    .mul(smoothstep(0.5, 0.72, slope));
  const frostMask = frost.mul(smoothstep(0.66, 0.9, slope)).mul(vegMask.oneMinus());
  col = mix(col, uIce, max(snow, frostMask));

  // Grain so a plain is a surface rather than a fill.
  const grain = mx_fractal_noise_float(positionWorld.mul(0.6), 2, 2.3, 0.5, 1).mul(0.09).add(0.96);
  col = col.mul(grain);

  mat.colorNode = col;
  // Snow is matte from a boot's distance; only ice sheets gloss, and there
  // are no ice sheets here. Grazing-angle speculars on a low-roughness white
  // field read instantly as open water.
  mat.roughnessNode = float(0.95).sub(max(snow, frostMask).mul(0.16)).sub(shore.mul(0.1));
  mat.metalnessNode = float(0);

  // Volcanic lowlands crack open and glow; thermal progress cools them.
  const crack = mx_fractal_noise_float(positionWorld.mul(0.05), 2, 2.4, 0.5, 1);
  const crackMask = smoothstep(0.42, 0.52, abs(crack).oneMinus())
    .mul(smoothstep(120, 15, altSea))
    .mul(lavaOn);
  mat.emissiveNode = uEmissive.mul(crackMask).mul(1.6);

  void uDeep;
  const uniforms: TerrainUniforms = { sunDir, sunTint, seaLevel, snowLine, frost, vegDensity, lavaOn, curvR2 };
  return { mat, uniforms };
}

// ————— The liquid line: sea, or something with stronger opinions —————

export function createLiquidMaterial(pal: PlanetPalette, tiers: SurfaceTiers, tex: TierTextures) {
  const lavaOn = uniform(0);
  const seaLevel = uniform(-40);
  const curvR2 = uniform(1 / (2 * 320000));
  const uDeep = uniform(pal.deepWater);
  const uShallow = uniform(pal.shallowWater);
  const uLava = uniform(pal.emissive.getHex() === 0 ? new Color(0xff4d1a) : pal.emissive);

  const mat = new MeshStandardNodeMaterial();
  mat.transparent = true;

  // Vertex-safe world position (see the terrain material for why).
  const wpos = modelWorldMatrix.mul(vec4(positionLocal, 1));
  const vertXZ = vec2(wpos.x, wpos.z);
  // The plane is flat; curvature belongs to the sea too, or distant water
  // floats above the ground that should be hiding it. The plane is rotated
  // -90° about X, so local +Z is world up: the drop is applied along local Z.
  const curvature = vertXZ.x.mul(vertXZ.x).add(vertXZ.y.mul(vertXZ.y)).mul(curvR2);
  mat.positionNode = vec3(positionLocal.x, positionLocal.y, positionLocal.z.sub(curvature));

  // Depth against the same baked ground the walker reads (fragment side).
  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const hNear = bilinearHeight(tex.nearHeight, tiers.near.texels, tiers.near.extent, worldXZ);
  const hFar = bilinearHeight(tex.farHeight, tiers.far.texels, tiers.far.extent, worldXZ);
  const ground = mix(hFar, hNear, nearness(worldXZ, tiers.near.extent));
  const depth = clamp(seaLevel.sub(ground).div(60), 0, 1);

  const waterCol = mix(uShallow, uDeep, smoothstep(0, 0.6, depth));
  const foam = smoothstep(0.045, 0.0, depth).mul(
    mx_fractal_noise_float(vec3(worldXZ.x.mul(0.11), time.mul(0.5), worldXZ.y.mul(0.11)), 2, 2.2, 0.5, 1)
      .mul(0.5)
      .add(0.62),
  );
  const lavaTone = mx_fractal_noise_float(
    vec3(worldXZ.x.mul(0.016), time.mul(0.07), worldXZ.y.mul(0.016)),
    3,
    2.3,
    0.55,
    1,
  ).mul(0.5).add(0.5);
  const lavaCol = mix(uLava.mul(0.35), uLava, lavaTone);

  mat.colorNode = mix(waterCol.add(foam.mul(0.5)), lavaCol, lavaOn);
  mat.emissiveNode = lavaCol.mul(lavaOn).mul(lavaTone.mul(1.4).add(0.4));
  mat.opacityNode = mix(smoothstep(0, 0.06, depth).mul(0.5).add(0.42), float(1), lavaOn);
  mat.roughnessNode = mix(float(0.14), float(0.75), lavaOn);
  mat.metalnessNode = float(0);

  // Ripples: two scrolling noise taps become a slope, scaled down with
  // distance so the far sea does not sparkle like static. The normal is
  // expressed in the PLANE'S local frame (local +Z is world up, local −Y is
  // world +Z) because transformNormalToView applies the model rotation.
  const camD = length(cameraPosition.sub(positionWorld));
  const rippleAmp = smoothstep(2600, 120, camD).mul(0.24).add(0.03);
  const rip = (o: N) =>
    mx_fractal_noise_float(
      vec3(worldXZ.x.mul(0.32).add(o), time.mul(0.32), worldXZ.y.mul(0.32)),
      2,
      2.1,
      0.5,
      1,
    );
  const r0 = rip(float(0));
  const rX = rip(float(0.24));
  const rZ = rip(float(0.53));
  const rippleN = normalize(
    vec3(r0.sub(rX).mul(rippleAmp), r0.sub(rZ).mul(rippleAmp).negate(), 1),
  );
  mat.normalNode = transformNormalToView(rippleN);

  return { mat, uniforms: { lavaOn, seaLevel, curvR2 } };
}

// ————— The sky —————

export function createSkyMaterial(pal: PlanetPalette) {
  const sunDir = uniform(new Vector3(0.4, 0.7, 0.3));
  const sunTint = uniform(new Color(0xfff2dc));
  /** Atmospheric presence 0–1 (the Atmo gauge, or 1 for a delivered world). */
  const density = uniform(1);

  const mat = new MeshBasicNodeMaterial();
  mat.side = BackSide;
  mat.depthWrite = false;
  mat.fog = false;

  const dir = normalize(positionWorld.sub(cameraPosition));
  const sunAmount = clamp(dir.dot(normalize(sunDir)), -1, 1);
  const day = clamp(normalize(sunDir).y.mul(1.6).add(0.12), 0, 1);
  const up = clamp(dir.y, -1, 1);

  const uAtmo = uniform(pal.atmosphere);
  // Zenith keeps a memory of space; the horizon is where the air lives.
  const zenith = uAtmo.mul(0.16).add(vec3(0.012, 0.016, 0.03)).mul(day).mul(density.mul(0.85).add(0.15));
  const horizonCol = mix(uAtmo, sunTint, 0.24).mul(day.mul(0.85).add(0.05)).mul(density);
  const horizonMask = pow(clamp(up.oneMinus(), 0, 1).min(1), 2.6);
  let sky: N = mix(zenith, horizonCol, horizonMask);

  // Sunset band: the terminator's warmth follows the sun down.
  const dusk = smoothstep(0.35, 0.02, abs(normalize(sunDir).y)).mul(density);
  const duskCol = vec3(1.0, 0.45, 0.22).mul(dusk).mul(pow(clamp(sunAmount, 0, 1), 3)).mul(0.55);
  sky = sky.add(duskCol.mul(horizonMask));

  // The sun: a disc, a bloom, and a wide forward scatter.
  const disc = smoothstep(0.9996, 0.99985, sunAmount);
  const bloom = pow(clamp(sunAmount, 0, 1), 260).mul(0.85);
  const scatterGlow = pow(clamp(sunAmount, 0, 1), 8).mul(0.16).mul(density);
  sky = sky.add(sunTint.mul(disc.mul(3.4).add(bloom).add(scatterGlow)).mul(day.mul(0.92).add(0.08)));

  // Night: stars sharpen as the air thins and the sun leaves. A real
  // atmosphere in daylight admits none of them; a vacuum admits all of them
  // at noon, which is the airless worlds' whole look.
  const starField = pow(
    mx_fractal_noise_float(dir.mul(210), 2, 2.0, 0.5, 1).mul(0.5).add(0.5),
    26,
  ).mul(34);
  const twinkle = mx_fractal_noise_float(dir.mul(63).add(vec3(time.mul(0.21), 0, 0)), 1, 2, 0.5, 1)
    .mul(0.5)
    .add(0.75);
  const nightness = pow(day.oneMinus(), 3);
  // Day stars belong to vacuum alone; even a modest atmosphere scatters
  // enough blue to drown them until the sun is properly down.
  const vacuumStars = smoothstep(0.3, 0.08, density).mul(0.85);
  const starVis = clamp(nightness.mul(density.mul(0.6).oneMinus()).add(vacuumStars), 0, 1)
    .mul(smoothstep(-0.06, 0.25, up));
  sky = sky.add(vec3(0.9, 0.95, 1).mul(starField.mul(twinkle)).mul(starVis));

  // Below the horizon the sky ends in ground haze rather than void.
  sky = mix(sky, horizonCol.mul(0.6).add(0.004), smoothstep(-0.02, -0.3, up));

  mat.colorNode = sky;
  return { mat, uniforms: { sunDir, sunTint, density } };
}

// ————— Cloud deck —————

export function createCloudDeckMaterial() {
  const coverage = uniform(0.4);
  const sunTint = uniform(new Color(0xfff2dc));
  const day = uniform(1);
  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.side = DoubleSide;
  mat.depthWrite = false;

  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const n = mx_fractal_noise_float(
    vec3(worldXZ.x.mul(0.00042).add(time.mul(0.004)), time.mul(0.0016), worldXZ.y.mul(0.00042)),
    4,
    2.3,
    0.55,
    1,
  ).mul(0.5).add(0.5);
  const cut = coverage.mul(-0.5).add(0.72);
  const alpha = smoothstep(cut, cut.add(0.2), n);
  // Fade the deck out toward the horizon so its edge is never a line.
  const camD = length(positionWorld.sub(cameraPosition));
  const horizonFade = smoothstep(30000, 9000, camD);

  mat.colorNode = mix(vec3(1, 1, 1), sunTint, 0.35).mul(day.mul(0.82).add(0.05));
  mat.opacityNode = alpha.mul(horizonFade).mul(coverage.mul(0.4).add(0.42));
  return { mat, uniforms: { coverage, sunTint, day } };
}

// ————— Entry plasma —————

/**
 * The sheath. A camera-locked quad: streaks rushing past, a rim that catches
 * fire first, and a white-out core that swallows the screen at the moment
 * the scenes swap underneath it.
 */
export function createPlasmaMaterial() {
  const intensity = uniform(0);
  const tint = uniform(new Color(0xff7a33));

  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthTest = false;
  mat.depthWrite = false;
  mat.fog = false;

  const p = positionLocal;
  const r = length(vec2(p.x, p.y.mul(1.4)));
  const streakN = mx_fractal_noise_float(
    vec3(p.x.mul(9), p.y.mul(2.2).add(time.mul(-11)), 4.7),
    3,
    2.2,
    0.55,
    1,
  ).mul(0.5).add(0.5);
  // Sparse hot filaments, not a sheet: most of the glass stays glass until
  // the white-out moment that actually hides the scene swap.
  const streaks = pow(streakN, 2.2);
  const flicker = mx_fractal_noise_float(vec3(time.mul(13), 2.1, 0.5), 1, 2, 0.5, 1).mul(0.14).add(0.92);

  const rim = smoothstep(0.34, 1.1, r);
  const fire = rim.mul(streaks).mul(intensity).mul(flicker);
  const whiteout = smoothstep(0.8, 1.0, intensity);
  const hot = mix(tint.mul(1.15), vec3(1.22, 1.14, 1.04), clamp(whiteout.mul(1.2).add(fire.mul(0.15)), 0, 1));

  mat.colorNode = hot;
  mat.opacityNode = clamp(fire.mul(1.35).add(whiteout.mul(1.05)).add(rim.mul(intensity).mul(0.12)), 0, 1);
  return { mat, uniforms: { intensity, tint } };
}

// ————— Core-sample crystals —————

export function createCrystalMaterial() {
  const glow = uniform(new Color(0x6fe0ff));
  const night = uniform(0);
  const mat = new MeshStandardNodeMaterial();
  const pulse = mx_fractal_noise_float(vec3(time.mul(0.8), positionWorld.y.mul(0.4), 1.3), 1, 2, 0.5, 1)
    .mul(0.5)
    .add(0.5);
  mat.colorNode = glow.mul(0.5).add(vec3(0.04, 0.07, 0.09));
  mat.roughnessNode = float(0.22);
  mat.metalnessNode = float(0.1);
  mat.emissiveNode = glow.mul(pulse.mul(0.5).add(0.42)).mul(night.mul(1.6).add(1));
  return { mat, uniforms: { glow, night } };
}

/** Touchdown dust: an expanding, thinning ring. */
export function createDustRingMaterial() {
  const life = uniform(0); // 0 fresh → 1 gone
  const tint = uniform(new Color(0x9a8f80));
  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = DoubleSide;
  const p = positionLocal;
  const r = length(vec2(p.x, p.y));
  const band = smoothstep(0.35, 0.72, r).mul(smoothstep(1.0, 0.8, r));
  const swirl = mx_fractal_noise_float(vec3(p.x.mul(4), p.y.mul(4), time.mul(1.4)), 2, 2.2, 0.5, 1)
    .mul(0.5)
    .add(0.5);
  mat.colorNode = tint;
  mat.opacityNode = band.mul(swirl).mul(life.oneMinus()).mul(0.55);
  return { mat, uniforms: { life, tint } };
}

void vec4;
