/**
 * The ground truth of a landed world — literally.
 *
 * Everything on the surface derives from here: the terrain the renderer
 * displaces, the height under the walker's boots, where the sea sits, where
 * the deposits grew. Two rules hold this file together:
 *
 *  1. THE CONTINENT YOU SAW FROM ORBIT IS THE CONTINENT YOU LAND ON. The
 *     macro elevation field is the exact arithmetic of planetGeometry.ts —
 *     same mulberry seed, same two simplex fields, same octaves, same ridge
 *     and coast bands — evaluated at the landing direction and its
 *     surroundings on the real sphere. Land on the coast you were looking at
 *     and the sea is there. Land at a pole and it is winter.
 *
 *  2. THE RENDERER AND THE WALKER READ THE SAME ARRAY. Heights are baked
 *     into Float32 tiers on the CPU; the vertex shader and `heightAt` both
 *     sample those texels with the same manual bilinear filter. There is no
 *     GPU-only geometric displacement, so the ground under your feet is the
 *     ground under your feet.
 *
 * Scale: one unit = one metre. The flight scene's planet radius 1 maps to a
 * few hundred kilometres here — small enough that curvature is a fact you
 * can see from a ridge, large enough that the horizon behaves like a
 * planet's.
 */
import { Vector3 } from 'three/webgpu';
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { mulberry } from '../../../engine/rng';
import type { PlanetType } from '../../../engine/types';
import type { WorldSize } from '../universeLayout';

// ————— Scale —————

/** Physical radius of a landed world, by catalogue size (metres). */
export const PLANET_RADIUS_M: Record<WorldSize, number> = {
  small: 260_000,
  medium: 320_000,
  large: 380_000,
  huge: 440_000,
};

/** Surface gravity, by size. Small worlds are a spring in your step. */
export const GRAVITY_M_S2: Record<WorldSize, number> = {
  small: 6.4,
  medium: 7.9,
  large: 9.2,
  huge: 10.4,
};

/** How the planet-wide macro field (normalized 0–1) maps to metres.
 * Exported for the site lattice: sample identity reads macro elevation,
 * which is planet truth, where the local octaves are landing-relative. */
export const MACRO_RELIEF_M = 1400;

/** Heightmap tiers. Near covers footing; far covers the horizon. */
export const TIER_NEAR = { texels: 1024, extent: 4096 } as const; // 4 m/texel
export const TIER_FAR = { texels: 1024, extent: 65536 } as const; // 64 m/texel

interface TypeRelief {
  /** Regional / hill / local amplitudes (m). */
  regional: number;
  hills: number;
  local: number;
  /** 0–1 ridge sharpening on the hill band. */
  ridged: number;
  /** Sea behaviour: water, lava, or mostly-dry. */
  liquid: 'water' | 'lava';
}

const RELIEF_BY_TYPE: Record<PlanetType, TypeRelief> = {
  terrestrial: { regional: 420, hills: 150, local: 34, ridged: 0.45, liquid: 'water' },
  ice: { regional: 300, hills: 90, local: 22, ridged: 0.25, liquid: 'water' },
  desert: { regional: 380, hills: 120, local: 26, ridged: 0.6, liquid: 'water' },
  volcanic: { regional: 520, hills: 210, local: 46, ridged: 1.0, liquid: 'lava' },
  ocean: { regional: 240, hills: 70, local: 18, ridged: 0.2, liquid: 'water' },
  // Unlandable; parameters exist so the type table stays total.
  gasgiant: { regional: 100, hills: 30, local: 10, ridged: 0, liquid: 'water' },
};

// ————— Session parameters —————

export interface SurfaceAspects {
  thermal: number;
  atmo: number;
  hydro: number;
  bio: number;
}

/** What buildSurfaceParams needs to know about the landing. */
export interface SurfaceSpec {
  seed: number;
  type: PlanetType;
  size: WorldSize;
  /** Unit landing direction in the planet's own frame. */
  dir: [number, number, number];
  /** Gauge fractions 0–1 (a delivered world is all ones). */
  aspects: SurfaceAspects;
  /**
   * 1 when the world carries `award-winning-fjords` — planetGeometry crinkles
   * the coast band harder for the quirk, and the transcription law says the
   * ground must crinkle identically or the landing breaks the promise.
   */
  fjords?: number;
}

export interface SurfaceParams {
  seed: number;
  type: PlanetType;
  size: WorldSize;
  aspects: SurfaceAspects;
  radiusM: number;
  gravity: number;
  relief: TypeRelief;
  /** ENU frame at the landing point (unit vectors in planet space). */
  east: Vector3;
  north: Vector3;
  up: Vector3;
  /** |dir.y| — drives the frost latitude exactly as the orbit shader does. */
  latitude: number;
  /** Macro elevation (normalized 0–1) at the landing point. */
  macro0: number;
  /** Normalized macro sea level — 0.3 + hydro·0.18, planetMaterial's line. */
  seaNorm: number;
  /** Liquid surface altitude in local metres (may be far below the site). */
  seaLevelM: number;
  /** Macro normalization span, sampled the way planetGeometry normalizes. */
  macroMin: number;
  macroSpan: number;
  /** Coast-band frequency — 4.2, or 9.2 by decree of Slartibartfast. */
  coastF: number;
  noise: NoiseFunction3D;
  noise2: NoiseFunction3D;
  /** Landing-local detail noises (seeded off the site, not the planet). */
  detail: NoiseFunction3D;
}

/** One baked height tier plus its CPU-side normals. */
export interface HeightTier {
  texels: number;
  extent: number;
  data: Float32Array;
  /** RGBA8 world-space normals (xyz → rgb), built by buildNormalMap. */
  normals: Uint8Array | null;
  /**
   * Where the tier is centred, landing-frame metres. Zero at touchdown; the
   * rolling re-bake (TierStream) moves it under a travelling skimmer. Always
   * a multiple of the texel step, so a re-centred tier samples the analytic
   * field at EXACTLY the world points it already held where the two covers
   * overlap — the swap is invisible by arithmetic, not by blending.
   */
  cx: number;
  cz: number;
}

export interface SurfaceTiers {
  near: HeightTier;
  far: HeightTier;
}

/**
 * The macro field, transcribed from planetGeometry.ts. Any edit there must
 * land here too — test `terrain-field.test.ts` locks the two together.
 */
const MACRO_SHAPE: Record<PlanetType, { freq: number; ridge: number }> = {
  terrestrial: { freq: 1.6, ridge: 0.5 },
  ice: { freq: 1.9, ridge: 0.3 },
  desert: { freq: 1.4, ridge: 0.7 },
  volcanic: { freq: 1.8, ridge: 1.0 },
  ocean: { freq: 1.5, ridge: 0.2 },
  gasgiant: { freq: 0.8, ridge: 0 },
};

function macroRaw(
  noise: NoiseFunction3D,
  noise2: NoiseFunction3D,
  type: PlanetType,
  coastF: number,
  x: number,
  y: number,
  z: number,
): number {
  const shape = MACRO_SHAPE[type];
  const f = shape.freq;
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
  return e;
}

/** planetGeometry's coast-band frequency, fjord decree included. */
function coastFreq(fjords: number | undefined): number {
  return 4.2 + (fjords ?? 0) * 5;
}

/**
 * planetGeometry normalizes elevation over its icosphere's vertices. The
 * surface cannot afford to build that sphere, so it samples the same field
 * over a fibonacci sphere instead — a couple thousand points land within a
 * percent of the true span, which is closer than the eye can carry from
 * orbit to the ground.
 */
function macroSpanFor(
  noise: NoiseFunction3D,
  noise2: NoiseFunction3D,
  type: PlanetType,
  coastF: number,
): { min: number; span: number } {
  const N = 2048;
  const golden = Math.PI * (3 - Math.sqrt(5));
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = golden * i;
    const e = macroRaw(noise, noise2, type, coastF, Math.cos(a) * r, y, Math.sin(a) * r);
    if (e < min) min = e;
    if (e > max) max = e;
  }
  return { min, span: max - min || 1 };
}

export function buildSurfaceParams(spec: SurfaceSpec): SurfaceParams {
  // EXACTLY planetGeometry's construction: one mulberry stream, two noises
  // drawn from it in order. This is what makes the continents agree.
  const rand = mulberry(spec.seed);
  const noise = createNoise3D(rand);
  const noise2 = createNoise3D(rand);
  const coastF = coastFreq(spec.fjords);
  const { min, span } = macroSpanFor(noise, noise2, spec.type, coastF);

  const up = new Vector3(spec.dir[0], spec.dir[1], spec.dir[2]).normalize();
  // East is horizontal by construction; degenerate at the poles, where any
  // heading is as east as any other.
  const east = new Vector3(0, 1, 0).cross(up);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0).cross(up);
  east.normalize();
  const north = new Vector3().crossVectors(up, east).normalize();

  const macroAt = (d: Vector3) =>
    (macroRaw(noise, noise2, spec.type, coastF, d.x, d.y, d.z) - min) / span;
  const macro0 = macroAt(up);
  const seaNorm = 0.3 + spec.aspects.hydro * 0.18;

  // Site-local detail noise: seeded from planet seed AND landing direction,
  // so two landings a hemisphere apart are different countrysides while the
  // same approach is always the same valley.
  const siteKey =
    (spec.seed ^ (Math.round((up.x * 0.5 + 0.5) * 4093) * 2654435761)
      ^ (Math.round((up.y * 0.5 + 0.5) * 4093) * 40503)
      ^ (Math.round((up.z * 0.5 + 0.5) * 4093) * 977)) >>> 0;
  const detail = createNoise3D(mulberry(siteKey));

  const rawSea = (seaNorm - macro0) * MACRO_RELIEF_M;

  const built: SurfaceParams = {
    seed: spec.seed,
    type: spec.type,
    size: spec.size,
    aspects: spec.aspects,
    radiusM: PLANET_RADIUS_M[spec.size],
    gravity: GRAVITY_M_S2[spec.size],
    relief: RELIEF_BY_TYPE[spec.type],
    east,
    north,
    up,
    latitude: Math.abs(up.y),
    macro0,
    seaNorm,
    seaLevelM: rawSea,
    macroMin: min,
    macroSpan: span,
    coastF,
    noise,
    noise2,
    detail,
  };

  // The waterline is honest until it argues with the touchdown shelf. The
  // macro field says where the sea is planet-wide; the LOCAL octaves can
  // still dip the exact site below it, and the dry-site divert only reads
  // macro. So the sea is pinned at least four metres below the boots that
  // are about to arrive — a coastal landing keeps its coast, an awash one
  // gets a shoal, and nobody spawns snorkelling.
  built.seaLevelM = Math.min(rawSea, analyticHeight(built, 0, 0) - 4);
  return built;
}

// ————— The height field —————

const DIR = new Vector3();
const TMP = new Vector3();

/**
 * Ground x/z (metres east/south of the landing point) to a direction on the
 * planet sphere. +x walks east, +z walks south — the camera's -Z faces north
 * on arrival, which is as good a tradition as any.
 *
 * Exported for the site lattice (surfaceSites.ts), which needs to speak both
 * languages: local metres for the walker, planet directions for identity.
 */
export function localDir(p: SurfaceParams, x: number, z: number, out: Vector3): Vector3 {
  out
    .copy(p.up)
    .multiplyScalar(p.radiusM)
    .addScaledVector(p.east, x)
    .addScaledVector(p.north, -z);
  return out.normalize();
}

/**
 * The inverse: a planet-space direction to local metres in this landing's
 * frame. Exact inverse of `localDir` (gnomonic projection onto the landing
 * tangent plane), valid over the hemisphere facing the site — far more ground
 * than any tier can carry. Anything persistent — a worked seam, a mark left
 * standing — is stored as a direction and recovered through this, because a
 * landing frame is not a coordinate system.
 */
export function dirToLocal(
  p: SurfaceParams,
  dir: Vector3,
  out: { x: number; z: number },
): { x: number; z: number } {
  const w = dir.dot(p.up);
  // Behind the horizon of the tangent plane: no finite local coordinate.
  if (w < 1e-6) {
    out.x = Number.POSITIVE_INFINITY;
    out.z = Number.POSITIVE_INFINITY;
    return out;
  }
  out.x = (p.radiusM * dir.dot(p.east)) / w;
  out.z = (-p.radiusM * dir.dot(p.north)) / w;
  return out;
}

/** FBM helper over the site-local detail noise. */
function fbm(
  n: NoiseFunction3D,
  x: number,
  z: number,
  freq: number,
  octaves: number,
  seedPlane: number,
): number {
  let a = 0.5;
  let f = freq;
  let e = 0;
  for (let o = 0; o < octaves; o++) {
    e += a * n(x * f, seedPlane, z * f);
    a *= 0.5;
    f *= 2.02;
  }
  return e;
}

/**
 * Analytic height (metres, landing point = 0) BEFORE curvature. This is what
 * gets baked into tiers; runtime sampling reads the bake.
 *
 * Layers, in descending wavelength:
 *  - macro: the planet's own continents, exact to orbit
 *  - regional: 6–40 km undulation the macro is too coarse to carry
 *  - hills: 0.7–5 km, optionally ridged into ranges
 *  - local: 90–700 m ground character
 * Everything below ~12 m is the renderer's normal-detail problem, not a
 * geometric one — the walker's collision must not diverge from the bake.
 */
export function analyticHeight(p: SurfaceParams, x: number, z: number): number {
  localDir(p, x, z, DIR);
  const macroN = (macroRaw(p.noise, p.noise2, p.type, p.coastF, DIR.x, DIR.y, DIR.z) - p.macroMin) / p.macroSpan;
  let h = (macroN - p.macro0) * MACRO_RELIEF_M;

  const r = p.relief;
  h += fbm(p.detail, x, z, 1 / 26000, 3, 17.3) * r.regional;

  let hills = fbm(p.detail, x, z, 1 / 3800, 4, 53.7);
  if (r.ridged > 0) {
    const ridge = 1 - Math.abs(fbm(p.detail, x, z, 1 / 5200, 2, 91.1) * 1.6);
    // Soft-signed, not sign(): a hard sign turned every ridge line into a
    // hundred-metre knife wall with a sawtooth silhouette. The soft version
    // keeps ranges and loses the cliffs of pure mathematics.
    const lean = hills + 0.4;
    const soft = lean / (Math.abs(lean) + 0.35);
    hills += r.ridged * 0.42 * ridge * ridge * soft;
  }
  h += hills * r.hills;

  h += fbm(p.detail, x, z, 1 / 420, 3, 7.9) * r.local;
  return h;
}

/** Planet-curvature drop from the landing tangent plane, metres. */
export function curvatureDrop(p: SurfaceParams, x: number, z: number): number {
  return (x * x + z * z) / (2 * p.radiusM);
}

/**
 * Normalized macro elevation (0–1) at any direction on the sphere — the same
 * number planetGeometry writes into the `elevation` attribute, up to the
 * normalization span. Exported so the agreement can be tested rather than
 * asserted in a comment.
 */
export function macroNormAt(p: SurfaceParams, dir: Vector3): number {
  return (macroRaw(p.noise, p.noise2, p.type, p.coastF, dir.x, dir.y, dir.z) - p.macroMin) / p.macroSpan;
}

/**
 * The autoland's shoreline divert. A pilot commits to a descent point by
 * flying at it; nobody re-checks whether that exact spot is ocean. The
 * autoland does: if the sub-ship point is wet, it spirals outward — golden
 * angle, widening cone — and sets down on the nearest dry shelf instead.
 * Deterministic, so the same approach always lands the same beach.
 *
 * Returns the original direction untouched when it was already dry, and
 * falls back to it if the whole neighbourhood is water (buildSurfaceParams
 * then raises a shoal — see the seaLevelM clamp there).
 */
export function findDrySite(spec: SurfaceSpec, out: Vector3): Vector3 {
  const rand = mulberry(spec.seed);
  const noise = createNoise3D(rand);
  const noise2 = createNoise3D(rand);
  const coastF = coastFreq(spec.fjords);
  const { min, span } = macroSpanFor(noise, noise2, spec.type, coastF);
  const seaNorm = 0.3 + spec.aspects.hydro * 0.18;
  const normAt = (d: Vector3) =>
    (macroRaw(noise, noise2, spec.type, coastF, d.x, d.y, d.z) - min) / span;

  const dir = new Vector3(spec.dir[0], spec.dir[1], spec.dir[2]).normalize();
  out.copy(dir);
  if (normAt(dir) > seaNorm + 0.015) return out;

  const tanA = new Vector3(0, 1, 0).cross(dir);
  if (tanA.lengthSq() < 1e-6) tanA.set(1, 0, 0).cross(dir);
  tanA.normalize();
  const tanB = new Vector3().crossVectors(dir, tanA);
  const golden = 2.39996;
  const probe = new Vector3();
  for (let i = 1; i <= 64; i++) {
    const r = 0.008 + (i / 64) * 0.14; // ~0.5° widening to ~8°
    const a = i * golden;
    probe
      .copy(dir)
      .addScaledVector(tanA, Math.cos(a) * r)
      .addScaledVector(tanB, Math.sin(a) * r)
      .normalize();
    if (normAt(probe) > seaNorm + 0.015) return out.copy(probe);
  }
  return out;
}

/**
 * Bake rows of a tier. Chunked so the entry cinematic can generate the world
 * behind the plasma without a single long stall — call with slices of rows.
 */
export function bakeTierRows(
  p: SurfaceParams,
  tier: HeightTier,
  row0: number,
  rows: number,
): void {
  const { texels, extent, data } = tier;
  const step = extent / (texels - 1);
  const half = extent / 2;
  for (let j = row0; j < Math.min(texels, row0 + rows); j++) {
    const z = tier.cz - half + j * step;
    for (let i = 0; i < texels; i++) {
      data[j * texels + i] = analyticHeight(p, tier.cx - half + i * step, z);
    }
  }
}

/**
 * One separable smoothing pass over a baked tier, in place.
 *
 * Bilinear filtering across a one-texel cliff produces diamond staircases —
 * visible from the walk as sawtooth banding on every steep face. Softening
 * the DATA once fixes the renderer and the collision together, because they
 * read the same array; that shared read is the module's whole covenant.
 */
export function smoothTier(tier: HeightTier): void {
  smoothTierRows(tier, 0, tier.texels);
  smoothTierCols(tier, 0, tier.texels);
}

const SMOOTH_W = [0.27, 0.46, 0.27] as const;
let smoothScratch = new Float32Array(0);

/** The horizontal half of smoothTier, over a row range — chunkable. */
export function smoothTierRows(tier: HeightTier, row0: number, rows: number): void {
  const { texels, data } = tier;
  const w = SMOOTH_W;
  if (smoothScratch.length < texels) smoothScratch = new Float32Array(texels);
  const row = smoothScratch;
  for (let j = row0; j < Math.min(texels, row0 + rows); j++) {
    const base = j * texels;
    for (let i = 0; i < texels; i++) {
      const a = data[base + Math.max(0, i - 1)]!;
      const b = data[base + i]!;
      const c = data[base + Math.min(texels - 1, i + 1)]!;
      row[i] = a * w[0] + b * w[1] + c * w[2];
    }
    for (let i = 0; i < texels; i++) data[base + i] = row[i]!;
  }
}

/** The vertical half — run only after every row pass is done. */
export function smoothTierCols(tier: HeightTier, col0: number, cols: number): void {
  const { texels, data } = tier;
  const w = SMOOTH_W;
  if (smoothScratch.length < texels) smoothScratch = new Float32Array(texels);
  const col = smoothScratch;
  for (let i = col0; i < Math.min(texels, col0 + cols); i++) {
    for (let j = 0; j < texels; j++) {
      const a = data[Math.max(0, j - 1) * texels + i]!;
      const b = data[j * texels + i]!;
      const c = data[Math.min(texels - 1, j + 1) * texels + i]!;
      col[j] = a * w[0] + b * w[1] + c * w[2];
    }
    for (let j = 0; j < texels; j++) data[j * texels + i] = col[j]!;
  }
}

/** World-space normals for a baked tier (RGBA8, xyz→rgb, a=255). */
export function buildNormalMap(tier: HeightTier): Uint8Array {
  if (!tier.normals || tier.normals.length !== tier.texels * tier.texels * 4) {
    tier.normals = new Uint8Array(tier.texels * tier.texels * 4);
  }
  buildNormalMapRows(tier, 0, tier.texels);
  return tier.normals;
}

/** Normal rows for a range — chunkable; smoothing must be complete first. */
export function buildNormalMapRows(tier: HeightTier, row0: number, rows: number): void {
  const { texels, extent, data } = tier;
  const step = extent / (texels - 1);
  const out = tier.normals!;
  for (let j = row0; j < Math.min(texels, row0 + rows); j++) {
    for (let i = 0; i < texels; i++) {
      const iw = Math.max(0, i - 1);
      const ie = Math.min(texels - 1, i + 1);
      const jn = Math.max(0, j - 1);
      const js = Math.min(texels - 1, j + 1);
      const dx = (data[j * texels + ie]! - data[j * texels + iw]!) / ((ie - iw) * step);
      const dz = (data[js * texels + i]! - data[jn * texels + i]!) / ((js - jn) * step);
      TMP.set(-dx, 1, -dz).normalize();
      const k = (j * texels + i) * 4;
      out[k] = Math.round((TMP.x * 0.5 + 0.5) * 255);
      out[k + 1] = Math.round((TMP.y * 0.5 + 0.5) * 255);
      out[k + 2] = Math.round((TMP.z * 0.5 + 0.5) * 255);
      out[k + 3] = 255;
    }
  }
}

/**
 * Manual bilinear over one tier, edge-extended by clamping — precisely the
 * arithmetic the vertex shader performs, which is the whole point.
 */
function sampleTier(tier: HeightTier, x: number, z: number): number {
  const { texels, extent, data } = tier;
  const half = extent / 2;
  const step = extent / (texels - 1);
  const u = (x - tier.cx + half) / step;
  const v = (z - tier.cz + half) / step;
  const i0 = Math.min(texels - 2, Math.max(0, Math.floor(u)));
  const j0 = Math.min(texels - 2, Math.max(0, Math.floor(v)));
  const fu = Math.min(1, Math.max(0, u - i0));
  const fv = Math.min(1, Math.max(0, v - j0));
  const a = data[j0 * texels + i0]!;
  const b = data[j0 * texels + i0 + 1]!;
  const c = data[(j0 + 1) * texels + i0]!;
  const d = data[(j0 + 1) * texels + i0 + 1]!;
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}

function smooth01(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}

/** Where the near tier hands off to the far one (fraction of its half-extent). */
export const TIER_BLEND_START = 0.94;

/**
 * Height with curvature, the walker's ground truth. Near tier wins inside
 * its extent, blending smoothly into the far tier across the last few
 * percent — the same mix, in the same order, as the vertex shader.
 */
export function heightAt(p: SurfaceParams, tiers: SurfaceTiers, x: number, z: number): number {
  const far = sampleTier(tiers.far, x, z);
  const near = sampleTier(tiers.near, x, z);
  const halfNear = tiers.near.extent / 2;
  const edge = Math.max(Math.abs(x - tiers.near.cx), Math.abs(z - tiers.near.cz)) / halfNear;
  const nearness = smooth01((1 - edge) / (1 - TIER_BLEND_START));
  return far + (near - far) * nearness - curvatureDrop(p, x, z);
}

/** Ground normal from baked heights (central differences over ~2 texels). */
export function groundNormalAt(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  x: number,
  z: number,
  out: Vector3,
): Vector3 {
  const e = 3;
  const dx = (heightAt(p, tiers, x + e, z) - heightAt(p, tiers, x - e, z)) / (2 * e);
  const dz = (heightAt(p, tiers, x, z + e) - heightAt(p, tiers, x, z - e)) / (2 * e);
  return out.set(-dx, 1, -dz).normalize();
}

// ————— Placement: scatter —————
// Deposit placement lives in surfaceSites.ts: seams are planet-fixed facts
// with stable identities, not decorations of the current landing.

export interface ScatterOptions {
  minR: number;
  maxR: number;
  maxSlopeY: number;
  /** Keep above the liquid line (metres of clearance). */
  shore: number;
  /** Extra per-instance scale range. */
  scale: [number, number];
}

/**
 * Instanced-prop placement: xyz + uniform scale + yaw, five floats a piece.
 * Deterministic per site and per stream id, so the same valley always grew
 * the same rocks.
 */
export function scatterSites(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  stream: number,
  count: number,
  opt: ScatterOptions,
): Float32Array {
  const r = mulberry((p.seed ^ stream) >>> 0);
  const out = new Float32Array(count * 5);
  const N = new Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 30) {
    const a = r() * Math.PI * 2;
    const d = opt.minR + Math.sqrt(r()) * (opt.maxR - opt.minR);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = heightAt(p, tiers, x, z);
    if (y < p.seaLevelM + opt.shore) continue;
    groundNormalAt(p, tiers, x, z, N);
    if (N.y < opt.maxSlopeY) continue;
    const k = placed * 5;
    out[k] = x;
    out[k + 1] = y;
    out[k + 2] = z;
    out[k + 3] = opt.scale[0] + r() * (opt.scale[1] - opt.scale[0]);
    out[k + 4] = r() * Math.PI * 2;
    placed++;
  }
  return placed === count ? out : out.slice(0, placed * 5);
}

/** Allocate an empty tier (bake fills it in chunks). */
export function makeTier(t: { texels: number; extent: number }): HeightTier {
  return {
    texels: t.texels,
    extent: t.extent,
    data: new Float32Array(t.texels * t.texels),
    normals: null,
    cx: 0,
    cz: 0,
  };
}

// ————— The rolling re-bake: ground that extends to meet the skimmer —————

/**
 * A tier plus the machinery to move it. The bake used to be a landing event;
 * at skimmer speed it is a continuous obligation. The stream keeps a back
 * buffer, bakes it toward a new centre a few milliseconds a frame — rows,
 * then the two smoothing passes, then normals — and commits with one copy,
 * so the live tier is never half-written and the walker's ground never lies.
 *
 * Centres snap to the texel grid. Where old and new cover overlap, a snapped
 * re-bake evaluates the analytic field at the very world points the old tier
 * held, so the commit changes nothing the eye was looking at except the far
 * edge where new ground appears (and the near/far blend band, which is the
 * blend's job to hide).
 */
export interface TierStream {
  /** The live tier everyone reads. The stream only ever copies INTO it. */
  tier: HeightTier;
  /** The back buffer being baked toward its own cx/cz. */
  back: HeightTier;
  /** True while a re-bake is in flight. */
  active: boolean;
  /** Pipeline cursors, in rows/cols of the back buffer. */
  row: number;
  smoothRow: number;
  smoothCol: number;
  normalRow: number;
}

export function makeTierStream(tier: HeightTier): TierStream {
  const back = makeTier({ texels: tier.texels, extent: tier.extent });
  back.normals = new Uint8Array(tier.texels * tier.texels * 4);
  return { tier, back, active: false, row: 0, smoothRow: 0, smoothCol: 0, normalRow: 0 };
}

/** Snap a proposed centre onto the tier's texel grid. */
export function snapTierCenter(
  tier: HeightTier,
  cx: number,
  cz: number,
): { cx: number; cz: number } {
  const step = tier.extent / (tier.texels - 1);
  return { cx: Math.round(cx / step) * step, cz: Math.round(cz / step) * step };
}

/** Arm a re-bake toward (cx, cz). Restarts cleanly if one was in flight. */
export function streamBegin(stream: TierStream, cx: number, cz: number): void {
  const snapped = snapTierCenter(stream.tier, cx, cz);
  stream.back.cx = snapped.cx;
  stream.back.cz = snapped.cz;
  stream.active = true;
  stream.row = 0;
  stream.smoothRow = 0;
  stream.smoothCol = 0;
  stream.normalRow = 0;
}

/**
 * Advance the in-flight re-bake within a millisecond budget. Returns true
 * when the back buffer is complete and waiting on streamCommit.
 */
export function streamStep(stream: TierStream, p: SurfaceParams, msBudget: number): boolean {
  if (!stream.active) return false;
  const { back } = stream;
  const n = back.texels;
  const t0 = performance.now();
  while (performance.now() - t0 < msBudget) {
    if (stream.row < n) {
      bakeTierRows(p, back, stream.row, 8);
      stream.row += 8;
    } else if (stream.smoothRow < n) {
      smoothTierRows(back, stream.smoothRow, 64);
      stream.smoothRow += 64;
    } else if (stream.smoothCol < n) {
      smoothTierCols(back, stream.smoothCol, 64);
      stream.smoothCol += 64;
    } else if (stream.normalRow < n) {
      buildNormalMapRows(back, stream.normalRow, 32);
      stream.normalRow += 32;
    } else {
      return true;
    }
  }
  return stream.normalRow >= n && stream.smoothCol >= n && stream.smoothRow >= n && stream.row >= n;
}

/**
 * Publish the finished back buffer into the live tier. A copy, not a swap:
 * the renderer's DataTextures wrap the live arrays, and those references
 * must outlive every re-centre. ~8 MB of memcpy — one frame pays it, once
 * per several hundred metres of travel.
 */
export function streamCommit(stream: TierStream): void {
  if (!stream.active) return;
  stream.tier.data.set(stream.back.data);
  if (stream.tier.normals && stream.back.normals) stream.tier.normals.set(stream.back.normals);
  stream.tier.cx = stream.back.cx;
  stream.tier.cz = stream.back.cz;
  stream.active = false;
}

// ————— Chunked scatter: props that stream with the traveller —————

/**
 * Instanced-prop placement for one world-fixed chunk of ground, same five
 * floats per seat as scatterSites. Deterministic in everything but height:
 * position, scale and yaw are pure hashes of (seed, stream, chunk), so the
 * valley regrows the same rocks every time you drive back through it; y is
 * re-read from the live tiers, which is why a tier re-centre re-seats chunks
 * instead of letting the rocks float on ground that has since learned better.
 */
export function scatterChunk(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  stream: number,
  chunkM: number,
  ix: number,
  iz: number,
  opt: { tries: number; maxSlopeY: number; shore: number; scale: [number, number]; clearR?: number },
): Float32Array {
  const h =
    (p.seed ^
      Math.imul(stream + 1, 0x9e3779b9) ^
      Math.imul(ix | 0, 0x85ebca6b) ^
      Math.imul(iz | 0, 0xc2b2ae35)) >>>
    0;
  const r = mulberry(h);
  const out = new Float32Array(opt.tries * 5);
  const N = new Vector3();
  const clear2 = (opt.clearR ?? 0) * (opt.clearR ?? 0);
  let placed = 0;
  for (let t = 0; t < opt.tries; t++) {
    const x = (ix + r()) * chunkM;
    const z = (iz + r()) * chunkM;
    const s = opt.scale[0] + r() * (opt.scale[1] - opt.scale[0]);
    const yaw = r() * Math.PI * 2;
    if (clear2 > 0 && x * x + z * z < clear2) continue;
    const y = heightAt(p, tiers, x, z);
    if (y < p.seaLevelM + opt.shore) continue;
    groundNormalAt(p, tiers, x, z, N);
    if (N.y < opt.maxSlopeY) continue;
    const k = placed * 5;
    out[k] = x;
    out[k + 1] = y;
    out[k + 2] = z;
    out[k + 3] = s;
    out[k + 4] = yaw;
    placed++;
  }
  return placed === opt.tries ? out : out.slice(0, placed * 5);
}
