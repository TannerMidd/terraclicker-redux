import {
  AdditiveBlending,
  BackSide,
  Color,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Vector3,
  Vector4,
} from 'three/webgpu';
import {
  abs,
  acos,
  atan,
  attribute,
  cameraPosition,
  clamp,
  cos,
  cross,
  dot,
  float,
  int,
  length,
  mix,
  mx_fractal_noise_float,
  normalize,
  normalLocal,
  normalWorld,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  sub,
  time,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { mulberry } from '../../engine/rng';
import type { PlanetType } from '../../engine/types';
import { GROUND_TYPE_INDEX, upliftActive, upliftNode } from './uplift/upliftAssets';

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

// ————— Per-pixel terrain —————

/**
 * The problem this solves: elevation used to arrive as a per-VERTEX
 * attribute. At icosphere detail 5 that is roughly ten thousand samples for
 * an entire world — vertices about 0.035 units apart — and everything between
 * them is linear interpolation. From orbit it passes. Fly down to it and the
 * planet is a smeared ball with a few colours in it, because that is
 * literally all the data there is.
 *
 * So the vertex attribute now carries only the BASE shape (continents, the
 * silhouette, the thing the geometry is actually displaced by), and every
 * frequency above it is evaluated per pixel: it costs the same at any
 * altitude and has no resolution limit. The same field drives both the
 * colour ramp — so coastlines are crisp and land has texture — and a normal
 * perturbation, so the relief is genuinely lit rather than painted on.
 *
 * Cost is three evaluations of `fine` per pixel (one for height, two for the
 * gradient), which is why `fine` is deliberately only two bands.
 */
const DETAIL_AMP = 0.045; // how much per-pixel detail shifts the colour ramp
const EPS = 0.0016; // gradient sample offset, in sphere-direction units
/**
 * Relief strength as an actual SLOPE, not a raw gradient.
 *
 * The gradient of this field is enormous in node units (the fine band varies
 * by ~1 over ~1/150 of a sphere direction, so d/dx ≈ 150). Feeding that
 * straight into the normal buries the real surface normal under it and the
 * planet comes out looking like coarse sandpaper. What we actually want is
 * the slope the detail would have if it were real geometry: an amplitude of
 * DETAIL_AMP × the type's displacement over that wavelength — order 0.01.
 */
const BUMP_SLOPE = 0.009;

/** Whatever the noise builder accepts — TSL's node types are not uniform. */
type Vec3Node = Parameters<typeof mx_fractal_noise_float>[0];

/**
 * Two bands of per-pixel relief. `close` is 0 at altitude and 1 on a low
 * pass; it fades the finest band in as you descend, which both kills the
 * shimmer of sampling a 150-cycle field across three pixels from orbit and
 * gives the planet the one quality that actually sells scale — detail that
 * keeps arriving the closer you get.
 *
 * Sampled three times a pixel (value + two gradient taps), so: stay lean.
 */
function fineDetail(dir: Vec3Node, off: Vec3Node, close: Vec3Node) {
  const d = dir as unknown as ReturnType<typeof vec3>;
  const o = off as unknown as ReturnType<typeof vec3>;
  const k = close as unknown as ReturnType<typeof float>;
  return mx_fractal_noise_float(d.mul(26).add(o) as unknown as Vec3Node, 3, 2.3, 0.55, 1)
    .mul(0.6)
    .add(
      mx_fractal_noise_float(d.mul(150).add(o) as unknown as Vec3Node, 2, 2.5, 0.5, 1)
        .mul(0.4)
        .mul(k),
    );
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
 *
 * EVERY per-world value here is a uniform, and that is load-bearing rather
 * than tidy. three caches a compiled shader per node-graph SHAPE, and a
 * literal baked into the graph — a palette colour, a seed offset, an `if
 * (isEarth)` branch — changes the shape, so each world became its own shader.
 * Building one is hundreds of milliseconds of WGSL generation, it happens
 * synchronously inside the render pass the first time the world is drawn, and
 * a system reveals five worlds at once: measured at 8.4 SECONDS of frozen
 * main thread when clicking a system in a 409-world universe. With the values
 * in uniforms every planet in the game shares one shader — built once, then
 * free — and the same click costs 33ms.
 *
 * So: nothing that varies per world may enter this graph as a literal. If a
 * new feature needs a per-world number, it needs a uniform.
 */
export function createPlanetMaterial(
  pal: PlanetPalette,
  seed: number,
  isEarth: boolean,
  type: PlanetType = 'terrestrial',
) {
  const thermal = uniform(0);
  const atmo = uniform(0);
  const hydro = uniform(0);
  const bio = uniform(0);
  const sunDir = uniform(vec3(1, 0.35, 0.6));
  // The orbit-detail slice (ASSET_UPLIFT.md 5.1). A UNIFORM, not a literal —
  // six types must keep sharing the one compiled shader.
  const uTypeSlice = uniform(GROUND_TYPE_INDEX[type] ?? 0);

  // The palette, as uniforms. `uniform(color)` uploads r/g/b unchanged, so
  // these are the same numbers the literals used to be.
  const uDeepWater = uniform(pal.deepWater);
  const uShallowWater = uniform(pal.shallowWater);
  const uLow = uniform(pal.low);
  const uHigh = uniform(pal.high);
  const uPeak = uniform(pal.peak);
  const uVegetation = uniform(pal.vegetation);
  const uIce = uniform(pal.ice);
  const uEmissive = uniform(pal.emissive);
  const uCapBase = uniform(pal.capBase);
  const uFrostMax = uniform(pal.frostMax);
  // Earth is a variation in value, not in shape — a branch would fork the
  // shader and cost every other planet the sharing.
  const uEarth = uniform(isEarth ? 1 : 0);

  const mat = new MeshStandardNodeMaterial();
  const baseElevation = attribute('elevation', 'float');
  const latitude = attribute('latitude', 'float');
  const seedOff = (seed % 977) * 0.13;
  // Three noise fields are offset by the seed so two worlds never wear the
  // same continents. Precomputed on the CPU, uploaded as vectors.
  const uDetailOff = uniform(new Vector3(seedOff, seedOff * 1.7 + 3.1, seedOff * 0.34 + 7.7));
  const uVegOff = uniform(new Vector3(seedOff, 0, seedOff));
  const uCityOff = uniform(new Vector3(seedOff, seedOff, 0));

  // Displacement is radial, so normalising the local position recovers the
  // ORIGINAL sphere direction exactly — the one coordinate that is stable
  // between the vertex and fragment stages and identical for every octave.
  const dir = normalize(positionLocal);
  const detailOff = uDetailOff;

  // Detail LOD: 0 seen from orbit, 1 on a low pass.
  const camDist = cameraPosition.sub(positionWorld).length();
  const close = smoothstep(2.4, 0.45, camDist);

  const detailC = fineDetail(
    dir as unknown as Vec3Node,
    detailOff as unknown as Vec3Node,
    close as unknown as Vec3Node,
  );

  // Tangent frame on the sphere. cross(dir, up) collapses at the poles, so
  // blend to a second axis as we approach them.
  const tanA = normalize(cross(dir, vec3(0, 1, 0)));
  const tanB = normalize(cross(dir, vec3(1, 0, 0)));
  const tan1 = normalize(mix(tanA, tanB, smoothstep(0.86, 0.99, abs(dir.y))));
  const tan2 = normalize(cross(dir, tan1));

  const detailU = fineDetail(
    normalize(dir.add(tan1.mul(EPS))) as unknown as Vec3Node,
    detailOff as unknown as Vec3Node,
    close as unknown as Vec3Node,
  );
  const detailV = fineDetail(
    normalize(dir.add(tan2.mul(EPS))) as unknown as Vec3Node,
    detailOff as unknown as Vec3Node,
    close as unknown as Vec3Node,
  );

  // Gradient → local-space bump. Subtracting means high ground tilts away
  // from the slope it sits on, which is the direction that reads as relief.
  const bump = tan1
    .mul(detailU.sub(detailC))
    .add(tan2.mul(detailV.sub(detailC)))
    .mul(-BUMP_SLOPE / EPS);

  /**
   * TWO elevations, and the split matters.
   *
   * `elevShape` decides where things ARE — coastline, sea depth, the shore
   * band. It takes only a whisper of detail, because a coastline is a
   * continental feature: let the full detail field near sea level and every
   * pixel of the planet crosses the waterline, so shore foam fires across the
   * entire surface and a low pass turns into white static.
   *
   * `elevDetail` decides what things LOOK like — the land ramp, peaks, the
   * valley shading. That wants all the detail it can get.
   */
  const elevShape = clamp(baseElevation.add(detailC.mul(0.018)), 0, 1);
  const elevation = clamp(baseElevation.add(detailC.mul(DETAIL_AMP)), 0, 1);

  // — Water: sea level rises with hydro; coastlines genuinely move. —
  const seaLevel = float(0.3).add(hydro.mul(0.18));
  const isWater = smoothstep(seaLevel.add(0.012), seaLevel.sub(0.012), elevShape); // 1 under water
  const shoreFoam = smoothstep(0.024, 0.0, abs(elevShape.sub(seaLevel))).mul(isWater.oneMinus().add(0.4));
  const waterDepth = smoothstep(seaLevel, seaLevel.sub(0.3), elevShape);
  const waterCol = mix(uShallowWater, uDeepWater, waterDepth);

  // — Land ramp by elevation, with altitude depth-shading for contrast. —
  const landMix = smoothstep(seaLevel, 0.85, elevation);
  let landCol = mix(uLow, uHigh, landMix);
  landCol = mix(landCol, uPeak, smoothstep(0.78, 0.95, elevation));
  landCol = landCol.mul(elevation.mul(0.55).add(0.62)) as unknown as ReturnType<typeof mix>; // valleys darker than ridges

  // — Vegetation: a creeping frontier driven by bio. —
  const vegNoise = mx_fractal_noise_float(positionWorld.mul(2.6).add(uVegOff), 3, 2.2, 0.55, 1);
  const vegBand = smoothstep(seaLevel.add(0.005), seaLevel.add(0.28), elevShape)
    .mul(smoothstep(0.75, 0.45, elevShape));
  const vegThreshold = bio.mul(1.6).sub(0.55);
  const vegMask = smoothstep(vegThreshold.sub(0.25), vegThreshold, vegNoise.mul(0.5).add(0.5).oneMinus())
    .oneMinus()
    .mul(vegBand)
    .mul(bio.mul(3).clamp(0, 1));
  landCol = mix(landCol, uVegetation, vegMask.mul(0.9));

  // — Ice caps recede as thermal fills (size at rest depends on planet type). —
  const capEdge = mix(uCapBase, float(0.96), thermal);
  const capMask = smoothstep(capEdge, capEdge.add(0.05), latitude);
  const frost = smoothstep(0.55, 0.0, thermal).mul(uFrostMax); // permafrost tint when cold

  type N = ReturnType<typeof vec3>;
  let surface = mix(landCol, waterCol, isWater) as unknown as N;
  surface = surface.add(shoreFoam.mul(0.35)) as unknown as N;
  surface = mix(surface, uIce, capMask.max(frost)) as unknown as N;

  mat.colorNode = surface;
  mat.roughnessNode = mix(float(0.9), float(0.24), isWater).sub(
    capMask.mul(0.15),
  ) as unknown as typeof mat.roughnessNode;
  mat.metalnessNode = float(0);

  // Relief. Water is a surface, not a landscape — it keeps the smooth normal
  // so the sea reads as sea instead of crumpled foil.
  const relief = normalize(normalLocal.add(bump.mul(isWater.oneMinus())));
  mat.normalNode = transformNormalToView(relief) as unknown as typeof mat.normalNode;

  // — Night side: bioluminescence, then city lights near completion. —
  const nightSide = smoothstep(0.15, -0.25, dot(normalWorld, normalize(sunDir)));
  const cityNoise = mx_fractal_noise_float(positionWorld.mul(9.0).add(uCityOff), 2, 2.0, 0.6, 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cityMask: any = smoothstep(0.55, 0.9, cityNoise.mul(0.5).add(0.5))
    .mul(isWater.oneMinus())
    .mul(capMask.oneMinus());
  const civilization = clamp(bio.add(thermal).add(atmo).add(hydro).mul(0.25).sub(0.55).mul(2.4), 0, 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cityGlow: any = vec3(1.0, 0.72, 0.35).mul(cityMask).mul(civilization).mul(nightSide).mul(1.6);

  if (upliftActive()) {
    // The orbit uplift (5.1/5.2): authored detail masks and the city-light
    // plate, sampled by equirect direction and ADDED over the procedural
    // reads — the clear placeholders make this exactly zero until the
    // KTX2s land, so a Tier-C frame and a pre-load frame are the same frame.
    const equirect = vec2(
      atan(dir.z, dir.x).div(Math.PI * 2).add(0.5).add(uDetailOff.x.mul(0.03)),
      acos(clamp(dir.y, -1, 1)).div(Math.PI),
    );
    const orbitDetail = upliftNode('textures/orbit/planet-detail-array.ktx2', equirect, {
      repeat: true,
      layers: 6,
      placeholder: 'clear',
    }).depth(int(uTypeSlice));
    // G is authored settlement sprawl: it extends the noise-grown mask.
    cityMask = cityMask.max(
      orbitDetail.g.mul(isWater.oneMinus()).mul(capMask.oneMinus()).mul(0.85),
    );
    const cityPlate = upliftNode('textures/orbit/city-lights.ktx2', equirect.mul(vec2(6, 3)), {
      repeat: true,
      placeholder: 'clear',
    });
    // Arterial roads and nodes over the sprawl, on the night side only.
    cityGlow = cityGlow.add(
      cityPlate.rgb
        .mul(cityPlate.a)
        .mul(cityMask.mul(0.7).add(0.3))
        .mul(civilization)
        .mul(nightSide)
        .mul(isWater.oneMinus())
        .mul(1.7),
    );
  }

  const veins = uEmissive
    .mul(smoothstep(0.45, 0.2, elevation))
    .mul(smoothstep(0.6, 0.0, thermal)) // volcanic veins cool and fade as terraforming proceeds
    .mul(0.8);
  const earthNight = vec3(0.02, 0.05, 0.1).mul(nightSide).mul(uEarth);
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
  // Hue as a uniform, so every planet type shares one shader — see
  // createPlanetMaterial for why a baked colour is expensive here.
  mat.colorNode = uniform(pal.atmosphere).mul(rim).mul(strength);
  mat.side = BackSide;
  mat.transparent = true;
  mat.blending = AdditiveBlending;
  mat.depthWrite = false;
  return { mat, atmo };
}

/**
 * Scrolling noise cloud shell; coverage rides Atmo + Hydro.
 *
 * Weather fronts (engine/weather.ts) ride three vec4 slots: xyz is the
 * front's centre in the shell's LOCAL frame with the angular radius encoded
 * as the vector's length, w is its strength. The tint says what kind of
 * front is passing — dust is sand-coloured, a storm is a bruise that
 * flickers when it fires. All uniforms, so every world still shares the one
 * cloud shader and a quiet world simply uploads zeros.
 */
export function createCloudMaterial(seed: number) {
  const coverage = uniform(0);
  const front0 = uniform(new Vector4(0, 1, 0, 0));
  const front1 = uniform(new Vector4(0, 1, 0, 0));
  const front2 = uniform(new Vector4(0, 1, 0, 0));
  const tint0 = uniform(new Color(0x8895a4));
  const tint1 = uniform(new Color(0x8895a4));
  const tint2 = uniform(new Color(0x8895a4));
  const mat = new MeshStandardNodeMaterial();
  const seedOff = uniform((seed % 613) * 0.29);
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
  const baseAlpha = smoothstep(cutoff, cutoff.add(0.12), n).mul(coverage.mul(0.5).add(0.04));

  // The shell is a unit-ish sphere in the spin group: normalising the local
  // position recovers the direction the front centres are expressed in.
  const dirL = normalize(positionLocal);
  const cellOf = (f: ReturnType<typeof uniform>) => {
    const fv = f as unknown as { xyz: ReturnType<typeof vec3>; w: ReturnType<typeof float> };
    const rad = length(fv.xyz).max(0.05);
    const d = dot(dirL, fv.xyz.div(rad));
    // cos is monotone-decreasing: inside the core d exceeds cos(rad).
    const inner = cos(rad.mul(0.55));
    const outer = cos(rad.add(0.16));
    return smoothstep(outer, inner, d).mul(fv.w);
  };
  const c0 = cellOf(front0);
  const c1 = cellOf(front1);
  const c2 = cellOf(front2);
  const cellMask = clamp(c0.add(c1).add(c2), 0, 1);
  const cellTexture = n.mul(0.5).add(0.62);
  const tintMix = tint0.mul(c0).add(tint1.mul(c1)).add(tint2.mul(c2)).div(c0.add(c1).add(c2).max(0.001));

  mat.colorNode = mix(vec3(1, 1, 1), tintMix, cellMask.mul(0.85));
  mat.opacityNode = clamp(baseAlpha.add(cellMask.mul(cellTexture).mul(0.62)), 0, 0.95);
  mat.roughnessNode = float(1);
  mat.transparent = true;
  mat.depthWrite = false;
  return { mat, coverage, fronts: [front0, front1, front2], tints: [tint0, tint1, tint2] };
}
