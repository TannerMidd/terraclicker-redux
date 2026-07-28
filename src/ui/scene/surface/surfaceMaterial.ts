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
  Vector2,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  dFdx,
  dFdy,
  float,
  floor,
  fract,
  instancedBufferAttribute,
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
  step,
  texture,
  textureLoad,
  time,
  transformNormalToView,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { InstancedBufferAttribute, Texture } from 'three/webgpu';
import type { HeightTier, SurfaceTiers } from './terrainField';
import { TIER_BLEND_START } from './terrainField';
import type { PlanetPalette } from '../planetMaterial';
import type { GroundBundle } from '../uplift/upliftAssets';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

// ————— Textures from the baked tiers —————

export interface TierTextures {
  nearHeight: DataTexture;
  farHeight: DataTexture;
  nearNormal: DataTexture;
  farNormal: DataTexture;
  /**
   * Tier centres as uniforms, shared by the terrain and liquid materials.
   * The rolling re-bake moves a tier; these move the sampling with it, so a
   * re-centre is one uniform write and two needsUpdate flags — no recompile,
   * per the sharing law.
   */
  nearCenter: ReturnType<typeof uniform>;
  farCenter: ReturnType<typeof uniform>;
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
    nearCenter: uniform(new Vector2(tiers.near.cx, tiers.near.cz)),
    farCenter: uniform(new Vector2(tiers.far.cx, tiers.far.cz)),
  };
}

/** One tier re-centred: re-upload its arrays and move the sampling with it. */
export function refreshTierTextures(
  tex: TierTextures,
  tiers: SurfaceTiers,
  which: 'near' | 'far',
): void {
  if (which === 'near') {
    tex.nearHeight.needsUpdate = true;
    tex.nearNormal.needsUpdate = true;
    (tex.nearCenter.value as Vector2).set(tiers.near.cx, tiers.near.cz);
  } else {
    tex.farHeight.needsUpdate = true;
    tex.farNormal.needsUpdate = true;
    (tex.farCenter.value as Vector2).set(tiers.far.cx, tiers.far.cz);
  }
}

export function disposeTierTextures(t: TierTextures): void {
  t.nearHeight.dispose();
  t.farHeight.dispose();
  t.nearNormal.dispose();
  t.farNormal.dispose();
}

/** Manual bilinear height fetch — the shader half of terrainField.sampleTier.
 * `center` is the tier's rolling centre uniform; sampling is centre-relative. */
function bilinearHeight(map: DataTexture, texels: number, extent: number, xz: N, center: N): N {
  const step = extent / (texels - 1);
  const half = extent / 2;
  const u = xz.x.sub(center.x).add(half).div(step);
  const v = xz.y.sub(center.y).add(half).div(step);
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
function nearness(xz: N, nearExtent: number, center: N): N {
  const halfNear = nearExtent / 2;
  const edge = max(abs(xz.x.sub(center.x)), abs(xz.y.sub(center.y))).div(halfNear);
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
 * The Tier-1 texture pack a session hands the terrain shader, or null for
 * the procedural path (Tier C, or the pack still in flight at bake time —
 * either way the material is complete at build and never recompiles).
 */
export interface GroundTexSet {
  bundle: GroundBundle;
  /** Generator PLANET_TYPES index; ×4 is the type's first of four layer slices. */
  typeIndex: number;
  /** Tier A spends the full tap budget; Tier B drops side projection + detail. */
  rich: boolean;
}

/**
 * The ground. Splat by altitude-above-sea, slope, frost and vegetation, all
 * relative to uniforms so a terraforming tick can move the sea and the snow
 * line under your boots without a recompile.
 *
 * With a GroundTexSet the palette-band mix becomes the TINT over a real
 * layered material read (ASSET_UPLIFT.md 1.1–1.5): four array slices
 * weighted by the same band weights the splat already computes, a side
 * projection for rock faces, detail + macro breakup, snow and lava sets.
 * The bands stay the one truth — the textures only dress them.
 */
export function createTerrainMaterial(
  pal: PlanetPalette,
  tiers: SurfaceTiers,
  tex: TierTextures,
  ground: GroundTexSet | null = null,
) {
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
  const hNear = bilinearHeight(tex.nearHeight, tiers.near.texels, tiers.near.extent, worldXZ, tex.nearCenter);
  const hFar = bilinearHeight(tex.farHeight, tiers.far.texels, tiers.far.extent, worldXZ, tex.farCenter);
  const k = nearness(worldXZ, tiers.near.extent, tex.nearCenter);
  const curvature = worldXZ.x.mul(worldXZ.x).add(worldXZ.y.mul(worldXZ.y)).mul(curvR2);
  const h = mix(hFar, hNear, k).sub(curvature);
  mat.positionNode = vec3(positionLocal.x, h, positionLocal.z);

  // — Fragment: normals from the baked maps, plus micro relief. —
  // Displacement is vertical, so the varying's XZ is safe on this side.
  const fragXZ = vec2(positionWorld.x, positionWorld.z);
  const kFrag = nearness(fragXZ, tiers.near.extent, tex.nearCenter);
  const uvNear = vec2(
    fragXZ.x.sub(tex.nearCenter.x).add(tiers.near.extent / 2).div(tiers.near.extent),
    fragXZ.y.sub(tex.nearCenter.y).add(tiers.near.extent / 2).div(tiers.near.extent),
  );
  const uvFar = vec2(
    fragXZ.x.sub(tex.farCenter.x).add(tiers.far.extent / 2).div(tiers.far.extent),
    fragXZ.y.sub(tex.farCenter.y).add(tiers.far.extent / 2).div(tiers.far.extent),
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

  // — Splat. Everything keys off altitude-above-sea and slope. —
  const altSea = positionWorld.y.sub(seaLevel);
  const slope = clamp(baseNormal.y, 0, 1);
  const bandNoise = mx_fractal_noise_float(positionWorld.mul(0.013), 3, 2.3, 0.5, 1);

  const shore = smoothstep(4.5, 0.5, altSea);
  const lowBand = smoothstep(0, 420, altSea.add(bandNoise.mul(90)));
  const peakBand = smoothstep(500, 1300, altSea.add(bandNoise.mul(160)));
  // Steep ground sheds soil and shows rock.
  const rocky = smoothstep(0.78, 0.55, slope);

  // The palette bands — the whole colour story on the procedural path, the
  // per-world TINT over the texture read on the other.
  let bandCol: N = mix(uLow, uHigh, lowBand);
  bandCol = mix(bandCol, uPeak, peakBand);
  // Sand at the waterline — the low colour, bleached.
  bandCol = mix(bandCol, uLow.mul(1.25).add(0.06), shore.mul(lavaOn.oneMinus()));
  bandCol = mix(bandCol, mix(uHigh, uPeak, 0.5).mul(0.72), rocky);

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

  // Snow above the line (thermal pushes it up); frost dusts everything cold.
  const snowNoise = bandNoise.mul(220);
  const snow = smoothstep(snowLine, snowLine.add(180), altSea.sub(snowNoise).add(peakBand.mul(120)))
    .mul(smoothstep(0.5, 0.72, slope));
  const frostMask = frost.mul(smoothstep(0.66, 0.9, slope)).mul(vegMask.oneMinus());
  const snowAll = max(snow, frostMask);

  // Grain so a plain is a surface rather than a fill.
  const grain = mx_fractal_noise_float(positionWorld.mul(0.6), 2, 2.3, 0.5, 1).mul(0.09).add(0.96);

  // Volcanic lowlands crack open and glow; thermal progress cools them.
  const crack = mx_fractal_noise_float(positionWorld.mul(0.05), 2, 2.4, 0.5, 1);
  const crackMask = smoothstep(0.42, 0.52, abs(crack).oneMinus())
    .mul(smoothstep(120, 15, altSea))
    .mul(lavaOn);

  let col: N;
  let normal: N;
  let roughBase: N = float(0.95);
  let emissive: N = uEmissive.mul(crackMask).mul(1.6);

  if (ground) {
    const g = ground.bundle;
    const slice0 = ground.typeIndex * 4;
    const typeSlice = int(ground.typeIndex);
    // Feature size ~pebbles at the boots. The far field does NOT tile this:
    // it cross-fades to a coarse sample whose mip chain is effectively the
    // material's local average — measured, because the first cut tiled 14 m
    // features across a desert and printed a cookie sheet to the horizon.
    const uvT = fragXZ.mul(1 / 6.5);
    const texFade = smoothstep(620, 80, camD);

    // Layer weights from the SAME bands the splat computed. Shore claims the
    // waterline, peak claims height and rock faces, low/up split the rest —
    // the four sum to one by construction.
    const wShore = shore.mul(lavaOn.oneMinus());
    const wPeak = max(peakBand, rocky.mul(0.85)).mul(wShore.oneMinus());
    const rest = wShore.oneMinus().mul(wPeak.oneMinus());
    const wUp = lowBand.mul(rest);
    const wLow = rest.mul(lowBand.oneMinus());

    const layered = (map: Texture, uvN: N): N =>
      texture(map, uvN).depth(int(slice0)).mul(wLow)
        .add(texture(map, uvN).depth(int(slice0 + 1)).mul(wUp))
        .add(texture(map, uvN).depth(int(slice0 + 2)).mul(wShore))
        .add(texture(map, uvN).depth(int(slice0 + 3)).mul(wPeak));

    let texNear: N = layered(g.albedo, uvT).rgb;
    const texFar: N = layered(g.albedo, fragXZ.mul(1 / 190)).rgb;
    const rma = layered(g.normalRma, uvT);

    // Macro mottle carries the large-scale variation everywhere; one tap.
    const mottle = texture(g.macro, fragXZ.mul(1 / 220)).depth(typeSlice).r;

    if (ground.rich) {
      // Side projection for rock faces: the peak slice, projected along the
      // dominant horizontal axis so cliffs stop smearing (Tier A only).
      const axisPick = step(abs(baseNormal.x), abs(baseNormal.z));
      const sideUV = vec2(mix(positionWorld.z, positionWorld.x, axisPick), positionWorld.y).mul(1 / 10);
      const sideW = smoothstep(0.72, 0.42, slope);
      texNear = mix(texNear, texture(g.albedo, sideUV).depth(int(slice0 + 3)).rgb, sideW);
    }

    const texA = mix(texFar, texNear, texFade).mul(mottle.mul(0.36).add(0.82));

    // Palette identity survives: the texture is lit by the band colour, so a
    // seeded warm desert and a cold one stay two different deserts.
    col = texA.mul(mix(vec3(1), bandCol.mul(2.05), 0.55));

    // AO in the alpha channel — boot range only; a tiled AO at distance
    // reads as etching, which sand famously is not.
    col = col.mul(mix(float(1), rma.a.mul(0.3).add(0.7), texFade));

    // Shore set (1.3), the dry half: wet sand darkening up from the
    // waterline. The texture's v axis IS the gradient; altitude drives it.
    const wet = texture(g.shore, vec2(fragXZ.x.mul(1 / 26), clamp(altSea.div(4.5), 0, 1)));
    col = mix(col, col.mul(0.5).add(wet.rgb.mul(0.1)), wet.a.mul(shore).mul(lavaOn.oneMinus()).mul(0.85));

    // Vegetation and snow keep their procedural masks but wear texture.
    col = mix(col, uVeg.mul(vegTone).mul(mottle.mul(0.4).add(0.8)), vegMask.mul(0.92));
    // Frost is a WHISPER of crystalline variation, premultiplied by the
    // pattern's alpha — at full rgb strength its drawn blobs printed as
    // outlined plates across every cold flat (measured on a frosted desert).
    const snowTex = texture(g.snow, uvT.mul(3.2));
    const snowLum = snowTex.r.mul(snowTex.a);
    col = mix(col, uIce.mul(snowLum.mul(0.14).add(0.92)), snowAll);
    col = col.mul(grain);

    // Normals: baked field + micro noise + the packed RG detail (near only),
    // plus a one-tap derivative bump from the greyscale detail slice.
    const nTex = rma.rg.mul(2).sub(1);
    const nTexPerturb = vec3(nTex.x, 0, nTex.y).mul(texFade.mul(0.2));
    let bump: N = baseNormal.add(microBump).add(nTexPerturb);
    if (ground.rich) {
      // Gentle: screen-space derivative bumps comb into diagonal corduroy
      // when pushed, and the frost pattern's own normal printed its drawn
      // rings back onto the ground — whisper frost carries no drifts.
      const dHeight = texture(g.detail, fragXZ.mul(1 / 2.3)).depth(typeSlice).r;
      bump = bump.add(vec3(dFdx(dHeight), 0, dFdy(dHeight)).mul(micro.mul(0.55)));
    }
    normal = normalize(bump);

    // Roughness from the packed B channel, seated near today's matte read.
    roughBase = mix(float(0.95), rma.b.mul(0.26).add(0.72), texFade);

    // The lava set (1.5): emissive crust from the flow texture where the
    // procedural cracks used to glow alone. The noise stays as variation.
    const lavaTex = texture(g.lava, fragXZ.mul(1 / 11));
    emissive = mix(
      uEmissive.mul(crackMask).mul(1.6),
      lavaTex.rgb.mul(lavaTex.a).mul(smoothstep(120, 15, altSea)).mul(2.2).mul(crack.mul(0.35).add(0.85)),
      lavaOn,
    );
  } else {
    col = mix(bandCol, uVeg.mul(vegTone), vegMask.mul(0.92));
    col = mix(col, uIce, snowAll);
    col = col.mul(grain);
    normal = normalize(baseNormal.add(microBump));
  }

  mat.normalNode = transformNormalToView(normal);
  mat.colorNode = col;
  // Snow is matte from a boot's distance; only ice sheets gloss, and there
  // are no ice sheets here. Grazing-angle speculars on a low-roughness white
  // field read instantly as open water.
  mat.roughnessNode = roughBase.sub(snowAll.mul(0.16)).sub(shore.mul(0.1));
  mat.metalnessNode = float(0);
  mat.emissiveNode = emissive;

  void uDeep;
  const uniforms: TerrainUniforms = { sunDir, sunTint, seaLevel, snowLine, frost, vegDensity, lavaOn, curvR2 };
  return { mat, uniforms };
}

// ————— The liquid line: sea, or something with stronger opinions —————

export function createLiquidMaterial(
  pal: PlanetPalette,
  tiers: SurfaceTiers,
  tex: TierTextures,
  shoreTex: Texture | null = null,
) {
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
  const hNear = bilinearHeight(tex.nearHeight, tiers.near.texels, tiers.near.extent, worldXZ, tex.nearCenter);
  const hFar = bilinearHeight(tex.farHeight, tiers.far.texels, tiers.far.extent, worldXZ, tex.farCenter);
  const ground = mix(hFar, hNear, nearness(worldXZ, tiers.near.extent, tex.nearCenter));
  const depth = clamp(seaLevel.sub(ground).div(60), 0, 1);

  const waterCol = mix(uShallow, uDeep, smoothstep(0, 0.6, depth));
  const foam = smoothstep(0.045, 0.0, depth).mul(
    mx_fractal_noise_float(vec3(worldXZ.x.mul(0.11), time.mul(0.5), worldXZ.y.mul(0.11)), 2, 2.2, 0.5, 1)
      .mul(0.5)
      .add(0.62),
  );
  // Shore breaks: lines of constant depth-phase march toward the beach —
  // depth shrinks shoreward, so adding time walks the crests in. Ragged by
  // noise, confined to the last shallow band, gone on lava.
  const breakNoise = mx_fractal_noise_float(
    vec3(worldXZ.x.mul(0.045), time.mul(0.22), worldXZ.y.mul(0.045)), 2, 2.2, 0.5, 1,
  ).mul(0.5).add(0.5);
  const breakPhase = fract(depth.mul(-11).add(time.mul(0.34)).add(breakNoise.mul(0.6)));
  let breaks: N = smoothstep(0.72, 0.94, breakPhase)
    .mul(smoothstep(0.2, 0.05, depth))
    .mul(smoothstep(0.005, 0.03, depth)) // not on dry texels
    .mul(breakNoise.mul(0.7).add(0.5));
  if (shoreTex) {
    // The shore set's break pattern (1.3): crests get curl instead of being
    // bands of plain white. Depth walks the pattern shoreward with the phase.
    const curl = texture(shoreTex, vec2(worldXZ.x.mul(0.035), depth.mul(4.2).sub(time.mul(0.1))));
    breaks = breaks.mul(curl.a.mul(0.9).add(0.35));
  }
  // Mist: a soft luminous haze hugging the waterline, breathing slowly.
  const mist = smoothstep(0.085, 0.0, depth)
    .mul(mx_fractal_noise_float(vec3(worldXZ.x.mul(0.02), time.mul(0.13), worldXZ.y.mul(0.02)), 2, 2.1, 0.5, 1).mul(0.5).add(0.5))
    .mul(0.4);
  const lavaTone = mx_fractal_noise_float(
    vec3(worldXZ.x.mul(0.016), time.mul(0.07), worldXZ.y.mul(0.016)),
    3,
    2.3,
    0.55,
    1,
  ).mul(0.5).add(0.5);
  const lavaCol = mix(uLava.mul(0.35), uLava, lavaTone);

  const foamAll = foam.mul(0.5).add(breaks.mul(0.55)).add(mist.mul(0.6));
  mat.colorNode = mix(waterCol.add(foamAll), lavaCol, lavaOn);
  mat.emissiveNode = mix(vec3(0.9, 0.95, 1).mul(mist.mul(0.12)), lavaCol.mul(lavaTone.mul(1.4).add(0.4)), lavaOn);
  mat.opacityNode = mix(
    smoothstep(0, 0.06, depth).mul(0.5).add(0.42).add(breaks.mul(0.3)).add(mist.mul(0.25)).min(1),
    float(1),
    lavaOn,
  );
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

/** Tier-4 sky maps a session hands the dome, or null for pure arithmetic. */
export interface SkyTexSet {
  /** 6-slice 256×64 gradient LUT (4.3), one per planet type. */
  lut: Texture;
  typeIndex: number;
  /** 512×32 aurora/bioluminescence ramp (4.6), optional. */
  aurora: Texture | null;
}

export function createSkyMaterial(pal: PlanetPalette, skyTex: SkyTexSet | null = null) {
  const sunDir = uniform(new Vector3(0.4, 0.7, 0.3));
  const sunTint = uniform(new Color(0xfff2dc));
  /** Atmospheric presence 0–1 (the Atmo gauge, or 1 for a delivered world). */
  const density = uniform(1);
  /** Lightning flash envelope 0–1 (engine/weather.stormFlash drives it). */
  const flash = uniform(0);
  /** Weather gloom 0–1: heavy fronts sit on the sky before they sit on you. */
  const gloom = uniform(0);
  /** What the front's underside looks like — the scene keeps it in step
   * with the fog tint, so the dome and the haze are one weather. */
  const gloomTint = uniform(new Color(0x595949));
  /** Night-side aurora strength 0–1 — the Biotic gauge drives it (4.6). */
  const aurora = uniform(0);

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

  if (skyTex) {
    // The authored gradient LUT (4.3): x walks void → horizon → sunset →
    // ground; elevation and dusk choose where to read. Blended under the
    // dynamic layers so stars, sun and gloom all keep working on top.
    const xHorizon = dusk.mul(0.2).add(0.56);
    let lutX: N = mix(float(0.06), xHorizon, pow(clamp(up, 0, 1).oneMinus(), 1.4));
    lutX = mix(lutX, float(0.97), smoothstep(0.0, -0.28, up));
    const lutCol = texture(skyTex.lut, vec2(lutX, 0.5))
      .depth(int(skyTex.typeIndex))
      .rgb.mul(day.mul(0.8).add(0.05));
    sky = mix(sky, lutCol, density.mul(0.42));
  }
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
  // A front overhead puts the stars out — snow, dust and ash are all
  // opaque from underneath, whatever the air pressure did or did not do.
  const starVis = clamp(nightness.mul(density.mul(0.6).oneMinus()).add(vacuumStars), 0, 1)
    .mul(smoothstep(-0.06, 0.25, up))
    .mul(gloom.oneMinus());
  sky = sky.add(vec3(0.9, 0.95, 1).mul(starField.mul(twinkle)).mul(starVis));

  if (skyTex?.aurora) {
    // Aurora / bioluminescent night glow (4.6): slow curtains over the low
    // sky, coloured by the authored ramp, only as strong as the Biotic
    // gauge says and only once the sun is properly gone.
    const curtain = mx_fractal_noise_float(
      vec3(dir.x.mul(2.3), dir.y.mul(0.7), dir.z.mul(2.3)).add(vec3(0, time.mul(0.03), 0)),
      3, 2.1, 0.5, 1,
    ).mul(0.5).add(0.5);
    const band = smoothstep(0.52, 0.8, curtain)
      .mul(smoothstep(0.0, 0.28, up))
      .mul(smoothstep(0.9, 0.42, up));
    const ramp = texture(skyTex.aurora, vec2(clamp(up.mul(1.5), 0.02, 0.98), 0.5));
    sky = sky.add(
      ramp.rgb.mul(ramp.a).mul(band).mul(aurora).mul(nightness).mul(gloom.oneMinus()).mul(0.9),
    );
  }

  // Below the horizon the sky ends in ground haze rather than void.
  sky = mix(sky, horizonCol.mul(0.6).add(0.004), smoothstep(-0.02, -0.3, up));

  // Weather gloom flattens the whole dome toward the FRONT'S own colour —
  // the same tint the fog wears, brighter toward the horizon where the
  // walker's haze meets the ceiling, dimmer straight up where it is thick.
  const ceiling = gloomTint.mul(day.mul(0.72).add(0.06)).mul(
    horizonMask.mul(0.45).add(0.55),
  );
  sky = mix(sky, ceiling, gloom.mul(0.92));
  // …and lightning un-flattens it for a frame or two.
  sky = sky.add(vec3(1.0, 1.0, 1.12).mul(flash).mul(density.mul(0.7).add(0.3)).mul(0.8));

  mat.colorNode = sky;
  return { mat, uniforms: { sunDir, sunTint, density, flash, gloom, gloomTint, aurora } };
}

// ————— Cloud deck —————

/** The cloud sheets (4.1): a 4-slice array + a curl flow map. */
export interface CloudTexSet {
  deck: Texture;
  flow: Texture;
}

/** Slice order is the generator's cloudDefs. */
export const CLOUD_SLICES = { cirrus: 0, cumulus: 1, storm: 2, dust: 3 } as const;

export function createCloudDeckMaterial(cloudTex: CloudTexSet | null = null) {
  const coverage = uniform(0.4);
  const sunTint = uniform(new Color(0xfff2dc));
  const day = uniform(1);
  /** Which authored sheet the weather wants (CLOUD_SLICES). */
  const slice = uniform(CLOUD_SLICES.cumulus);
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
  let alpha: N = smoothstep(cut, cut.add(0.2), n);
  // Fade the deck out toward the horizon so its edge is never a line.
  const camD = length(positionWorld.sub(cameraPosition));
  const horizonFade = smoothstep(30000, 9000, camD);

  let col: N = mix(vec3(1, 1, 1), sunTint, 0.35).mul(day.mul(0.82).add(0.05));
  if (cloudTex) {
    // The authored sheets (4.1): the noise stays the coverage gate; the
    // texture is what the gated cloud LOOKS like, advected by the flow map
    // so the deck churns instead of sliding as one sheet.
    const flow = texture(cloudTex.flow, worldXZ.mul(1 / 9000).add(time.mul(0.0011))).rg.sub(0.5);
    const sheetUV = worldXZ.mul(1 / 1500).add(flow.mul(0.16)).add(vec2(time.mul(0.0015), 0));
    const sheet = texture(cloudTex.deck, sheetUV).depth(int(slice));
    // Texture, not stamps: the sheet MODULATES the noise-gated deck. At
    // full weight its drawn puffs printed as polka dots on the night sky.
    alpha = alpha.mul(sheet.a.mul(0.45).add(0.55));
    col = col.mul(sheet.rgb.mul(0.5).add(vec3(0.62)));
  }
  mat.colorNode = col;
  mat.opacityNode = alpha.mul(horizonFade).mul(coverage.mul(0.4).add(0.42));
  return { mat, uniforms: { coverage, sunTint, day, slice } };
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

// ————— Precipitation —————

/**
 * One material for every falling thing: rain streaks, snow, dust, ash. The
 * kind only changes uniforms (tint, glow, and — with the weather atlas
 * loaded — a UV window into the particle sheet), so a front rolling in
 * compiles nothing — the sharing law, kept in the weather.
 */
export function createPrecipMaterial(atlas: Texture | null = null) {
  const tint = uniform(new Color(0x9db8d8));
  const glow = uniform(0); // meteors and nothing else
  const fade = uniform(0.5);
  /** Atlas window (4.2): offset + scale into the weather particle sheet. */
  const uvOff = uniform(new Vector2(0, 0));
  const uvScale = uniform(new Vector2(1, 1));
  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.fog = false;
  // The pool billboards by yaw alone; whichever face the camera gets, keep.
  mat.side = DoubleSide;
  // Shape in UV space, NOT positionLocal: on an instanced mesh the node
  // system folds the instance matrix into positionLocal, so a streak scaled
  // ×300 sees |y| in the hundreds and a 0.5-scale mask reads pure zero —
  // measured as a meteor shower rendering as nothing at all. UVs are the
  // one geometry coordinate instancing leaves alone.
  const u = uv();
  const edge = smoothstep(0.5, 0.18, abs(u.x.sub(0.5)));
  const cap = smoothstep(0.52, 0.3, abs(u.y.sub(0.5)));
  const baseCol = tint.add(vec3(1, 0.98, 0.9).mul(glow));
  if (atlas) {
    // A drawn particle in the quad (4.2); the soft procedural mask stays as
    // a vignette so the window's edges never print.
    const s = texture(atlas, u.mul(uvScale).add(uvOff));
    mat.colorNode = baseCol.mul(s.rgb.mul(1.1).add(vec3(0.35)));
    mat.opacityNode = s.a.mul(edge.mul(cap).mul(0.5).add(0.6)).mul(fade);
  } else {
    mat.colorNode = baseCol;
    mat.opacityNode = edge.mul(cap).mul(fade);
  }
  return { mat, uniforms: { tint, glow, fade, uvOff, uvScale } };
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

// ————— Ground decals (ASSET_UPLIFT.md 1.6) —————

/** Atlas cells, 3×2: the generator's concentricDecalsSvg order. */
export const DECAL_CELLS = {
  scorch: 0,
  seamSpoil: 1,
  drillSpatter: 2,
  footprint: 3,
  landingGear: 4,
  blastRing: 5,
} as const;

/**
 * One material for every scar on the ground: set-down gear marks, seam
 * spoil, blast rings. Per-instance atlas cell rides an instanced attribute;
 * the pool hangs matrices on touchdownNonce and mineNonce. KTX2 arrays are
 * not flipped, so cell row 0 is the TOP of the drawn atlas.
 */
export function createGroundDecalMaterial(atlas: Texture, cellAttr: InstancedBufferAttribute) {
  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  const cell = instancedBufferAttribute(cellAttr);
  const cellX = cell.mod(3);
  const cellY = floor(cell.div(3));
  const u = uv();
  const cuv = vec2(u.x.add(cellX).div(3), u.y.oneMinus().add(cellY).div(2));
  const s = texture(atlas, cuv);
  // The strokes are drawn in ink and gold; ground them to scar tones.
  mat.colorNode = s.rgb.mul(0.34);
  mat.opacityNode = s.a.mul(0.72);
  return mat;
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
