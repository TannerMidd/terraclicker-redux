/**
 * The production asset pack (docs/ASSET_UPLIFT.md), loaded.
 *
 * Everything here obeys the five laws of that document:
 *  - assets feed EXISTING shared materials; nothing here mints a material
 *    per object (the kit materials are one per family, ever);
 *  - planet-type variation rides texture arrays and an index uniform;
 *  - only KTX2 ships; masters never enter this directory;
 *  - Tier C (quality 'low', or a machine with no WebGPU) never loads a byte
 *    of this pack — the procedural path IS the fallback, untouched;
 *  - nothing sampled here displaces geometry. Shading only.
 *
 * Loading pattern: the same imperative, cached, never-Suspend school as
 * spriteTextures.ts, extended for KTX2 and GLB. Always-mounted materials
 * receive a NODE wrapping a 1×1 placeholder; when the real texture lands the
 * node's `.value` is swapped in place — same shader graph, no recompile,
 * which is the whole reason the placeholder has the same dimensionality
 * (2D array placeholders for array textures). Per-session materials (the
 * surface) instead ask `groundBundle()` at build time and take the
 * procedural path when the pack has not arrived yet.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DataArrayTexture,
  DataTexture,
  Matrix4,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  RepeatWrapping,
  SpriteNodeMaterial,
  SRGBColorSpace,
  Texture,
} from 'three/webgpu';
import { materialColor, materialOpacity, mix, texture, uv, vec2, vec3, vertexColor } from 'three/tsl';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BufferGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three/webgpu';
import { useSettings } from '../../settings';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

// ————— Tier gate —————

export type UpliftTier = 'a' | 'b' | null;

/** Quality → asset tier. 'low' (Tier C) opts out of the pack entirely. */
export function upliftTier(): UpliftTier {
  const q = useSettings.getState().quality;
  let resolved: 'high' | 'medium' | 'low';
  if (q === 'auto') {
    const nav: Record<string, unknown> | null =
      typeof navigator !== 'undefined' ? (navigator as unknown as Record<string, unknown>) : null;
    if (nav && 'gpu' in nav) resolved = 'high';
    else resolved = ((nav?.hardwareConcurrency as number) || 4) >= 6 ? 'medium' : 'low';
  } else {
    resolved = q;
  }
  if (resolved === 'high') return 'a';
  if (resolved === 'medium') return 'b';
  return null;
}

export function upliftActive(): boolean {
  return upliftTier() !== null;
}

// ————— The loaders (lazy singletons) —————

const BASE = (relative: string): string =>
  new URL(`${import.meta.env.BASE_URL}assets/uplift/${relative}`, document.baseURI).href;

let ktx2: KTX2Loader | null = null;
let gltf: GLTFLoader | null = null;
let supportDetected = false;

/**
 * Wire the KTX2 transcoder to the renderer's capabilities. Called once from
 * SceneRoot's renderer factory, AFTER renderer.init() — detectSupport reads
 * real device features. Until this runs, texture requests queue.
 */
export function initUplift(renderer: { isWebGPURenderer?: boolean }): void {
  // Detect unconditionally — even when the current quality is Tier C. The
  // gate belongs to the CALLERS (nothing loads unless asked); detecting here
  // means a mid-session low→high switch can still start loading instead of
  // waiting on a promise that would never resolve.
  if (supportDetected) return;
  try {
    ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath(BASE('basis/'));
    ktx2.detectSupport(renderer as never);
    supportDetected = true;
    for (const kick of pendingDetect.splice(0)) kick();
  } catch (e) {
    console.warn('uplift: KTX2 support detection failed; pack disabled', e);
    ktx2 = null;
  }
}

const pendingDetect: Array<() => void> = [];

function whenDetected(): Promise<void> {
  if (supportDetected) return Promise.resolve();
  return new Promise((res) => pendingDetect.push(res));
}

// ————— Textures —————

interface TexEntry {
  tex: Texture | null;
  failed: boolean;
  promise: Promise<Texture | null>;
  /** Node-side placeholders whose .value swaps when the real texture lands. */
  nodes: N[];
}

const texCache = new Map<string, TexEntry>();

export interface UpliftTexOpts {
  /** RepeatWrapping (tiling ground sets, atlases that tile). */
  repeat?: boolean;
  /** Expected layer count for array textures — sizes the placeholder. */
  layers?: number;
  /** Placeholder tone: neutral multiplier or invisible overlay. */
  placeholder?: 'white' | 'clear';
  /** sRGB placeholder colourspace (the KTX2 carries its own; this is for the 1×1). */
  srgb?: boolean;
  anisotropy?: number;
}

function loadTexture(relative: string, opts: UpliftTexOpts): TexEntry {
  let entry = texCache.get(relative);
  if (entry) return entry;
  const e: TexEntry = { tex: null, failed: false, nodes: [], promise: Promise.resolve(null) };
  entry = e;
  e.promise = (async () => {
    try {
      await whenDetected();
      if (!ktx2) throw new Error('no transcoder');
      const t = await ktx2.loadAsync(BASE(relative));
      if (opts.repeat) {
        t.wrapS = RepeatWrapping;
        t.wrapT = RepeatWrapping;
      }
      if (opts.anisotropy) t.anisotropy = opts.anisotropy;
      // Filters stay whatever KTX2Loader chose: it already distinguishes
      // mipped chains (trilinear) from single-level LUTs (linear), and a
      // mipmap filter on a mipless compressed texture samples garbage.
      t.needsUpdate = true;
      e.tex = t;
      for (const node of e.nodes) {
        node.value = t;
      }
      return t;
    } catch (err) {
      e.failed = true;
      console.warn(`uplift: ${relative} failed to load; staying procedural`, err);
      return null;
    }
  })();
  texCache.set(relative, e);
  return e;
}

function placeholderPixels(kind: 'white' | 'clear'): Uint8Array {
  return kind === 'white'
    ? new Uint8Array([255, 255, 255, 255])
    : new Uint8Array([0, 0, 0, 0]);
}

function makePlaceholder(opts: UpliftTexOpts): Texture {
  const kind = opts.placeholder ?? 'white';
  if (opts.layers && opts.layers > 1) {
    const data = new Uint8Array(4 * opts.layers);
    const px = placeholderPixels(kind);
    for (let i = 0; i < opts.layers; i++) data.set(px, i * 4);
    const t = new DataArrayTexture(data, 1, 1, opts.layers);
    if (opts.srgb) t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
  const t = new DataTexture(placeholderPixels(kind), 1, 1);
  if (opts.srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * A TSL texture node for an always-mounted material. Samples a neutral 1×1
 * until the KTX2 arrives, then swaps `.value` in place — the graph never
 * rebuilds. The placeholder matches the real texture's dimensionality, which
 * is what keeps the bind layout stable across the swap.
 */
export function upliftNode(relative: string, uvNode: N, opts: UpliftTexOpts = {}): N {
  const entry = loadTexture(relative, opts);
  const node = texture(entry.tex ?? makePlaceholder(opts), uvNode);
  if (!entry.tex) entry.nodes.push(node);
  return node;
}

/** The loaded texture, or null — for materials built per-session. */
export function upliftTex(relative: string, opts: UpliftTexOpts = {}): Texture | null {
  return loadTexture(relative, opts).tex;
}

/** Begin a load without using the result yet. */
export function upliftPrefetch(relative: string, opts: UpliftTexOpts = {}): void {
  loadTexture(relative, opts);
}

// ————— The ground bundle (Tier 1) —————

/** Slice order is the generator's: PLANET_TYPES × [lowland, upland, shore, peak]. */
export const GROUND_TYPE_INDEX: Record<string, number> = {
  terrestrial: 0,
  ice: 1,
  desert: 2,
  volcanic: 3,
  ocean: 4,
  gasgiant: 5,
};

export interface GroundBundle {
  albedo: Texture; // 24-slice sRGB array
  normalRma: Texture; // 24-slice: RG normal, B rough, A AO
  detail: Texture; // 6-slice greyscale detail
  macro: Texture; // 6-slice large-scale mottle
  shore: Texture;
  snow: Texture;
  snowNormal: Texture;
  lava: Texture;
}

const GROUND_PATHS: Record<keyof GroundBundle, [string, UpliftTexOpts]> = {
  albedo: ['textures/ground/ground-albedo-array.ktx2', { repeat: true, layers: 24, srgb: true, anisotropy: 4 }],
  normalRma: ['textures/ground/ground-normal-rma-array.ktx2', { repeat: true, layers: 24, anisotropy: 4 }],
  detail: ['textures/ground/detail-normal-array.ktx2', { repeat: true, layers: 6 }],
  macro: ['textures/ground/macro-mottle-array.ktx2', { repeat: true, layers: 6 }],
  shore: ['textures/ground/shore-waterline.ktx2', { repeat: true }],
  snow: ['textures/ground/snow-frost.ktx2', { repeat: true, srgb: true }],
  snowNormal: ['textures/ground/snow-frost-normal.ktx2', { repeat: true }],
  lava: ['textures/ground/lava-emissive-flow-crust.ktx2', { repeat: true }],
};

/** Every Tier-1 map, or null while any is still in flight (or Tier C). */
export function groundBundle(): GroundBundle | null {
  if (!upliftActive()) return null;
  const out = {} as GroundBundle;
  for (const key of Object.keys(GROUND_PATHS) as Array<keyof GroundBundle>) {
    const [path, opts] = GROUND_PATHS[key];
    const t = upliftTex(path, opts);
    if (!t) return null;
    out[key] = t;
  }
  return out;
}

// ————— GLB kits (Tiers 2, 3, 5) —————

interface KitEntry {
  scene: Group | null;
  failed: boolean;
  promise: Promise<Group | null>;
  merged: Map<string, BufferGeometry | null>;
}

const kitCache = new Map<string, KitEntry>();

function loadKit(relative: string): KitEntry {
  let entry = kitCache.get(relative);
  if (entry) return entry;
  if (!gltf) gltf = new GLTFLoader();
  const e: KitEntry = { scene: null, failed: false, merged: new Map(), promise: Promise.resolve(null) };
  e.promise = gltf
    .loadAsync(BASE(relative))
    .then((g) => {
      e.scene = g.scene;
      g.scene.updateMatrixWorld(true);
      return g.scene;
    })
    .catch((err) => {
      e.failed = true;
      console.warn(`uplift: kit ${relative} failed to load; staying procedural`, err);
      return null;
    });
  kitCache.set(relative, e);
  return e;
}

export function prefetchKit(relative: string): void {
  if (upliftActive()) loadKit(relative);
}

/**
 * Resolves when a kit has arrived (or failed — check the getters after).
 * For components that mount BEFORE the pack lands and want to upgrade once,
 * rather than staying primitive for the whole app lifetime.
 */
export function whenKitReady(relative: string): Promise<void> {
  if (!upliftActive()) return new Promise(() => undefined); // never: Tier C stays put
  return loadKit(relative).promise.then(() => undefined);
}

const KIT_M = new Matrix4();

/**
 * One named asset from a kit, flattened to a single BufferGeometry with the
 * per-part material colours baked into a vertex-colour attribute — which is
 * what lets a whole family share ONE material (law 1) and still read as
 * painted parts. Geometry is cached per (kit, name); null until the kit
 * lands or when the name is missing.
 */
export function kitGeometry(relative: string, name: string): BufferGeometry | null {
  if (!upliftActive()) return null;
  const entry = loadKit(relative);
  if (!entry.scene) return null;
  const hit = entry.merged.get(name);
  if (hit !== undefined) return hit;

  const root = entry.scene.getObjectByName(name);
  if (!root) {
    entry.merged.set(name, null);
    return null;
  }
  const rootInverse = KIT_M.copy(root.matrixWorld).invert();
  const parts: BufferGeometry[] = [];
  root.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    // Normalise to non-indexed: the kits mix polyhedra (which three builds
    // without an index) with boxes and cylinders (which have one), and
    // mergeGeometries refuses the mixture outright.
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    // Pose the part relative to the ASSET root, not the file root.
    geo.applyMatrix4(new Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld));
    const mat = mesh.material as MeshStandardMaterial;
    const color = mat?.color ?? WHITE;
    const count = geo.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    // Merge needs a uniform attribute set; primitives all carry uv.
    parts.push(geo);
  });
  const merged = parts.length > 0 ? mergeGeometries(parts, false) : null;
  for (const part of parts) part.dispose();
  entry.merged.set(name, merged);
  return merged;
}

const WHITE = new Color(1, 1, 1);

/**
 * How a kit geometry seats into an existing instancer's frame:
 *  - 'box' fits (non-uniformly) into the exact bounding box of the primitive
 *    it replaces, so every seat matrix built for unit primitives keeps its
 *    silhouette and nothing in the layout code changes;
 *  - 'height' scales uniformly to a target height with the bbox centre at
 *    the origin — the centred-primitive convention of the prop scatter.
 */
export type KitFit =
  | { mode: 'box'; min: [number, number, number]; max: [number, number, number]; rotateY?: number }
  | { mode: 'height'; height: number; rotateY?: number }
  | { mode: 'extent'; extent: number; rotateY?: number };

export function kitGeometryFit(relative: string, name: string, fit: KitFit): BufferGeometry | null {
  const entry = kitCache.get(relative) ?? loadKit(relative);
  const key = `${name}|${fit.mode}|${fit.rotateY ?? 0}|${
    fit.mode === 'box' ? fit.min.join() + '|' + fit.max.join() : fit.mode === 'height' ? fit.height : fit.extent
  }`;
  const hit = entry.merged.get(key);
  if (hit !== undefined) return hit;
  const base = kitGeometry(relative, name);
  if (!base) return null; // do not cache: the kit may still be in flight
  const geo = base.clone();
  // The ships were authored +Z-forward; the scene flies -Z. Spin before the
  // fit so the bounding frame is measured in the destination's own axes.
  if (fit.rotateY) geo.rotateY(fit.rotateY);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const M = new Matrix4();
  if (fit.mode === 'height' || fit.mode === 'extent') {
    const s =
      fit.mode === 'height'
        ? fit.height / Math.max(1e-5, size[1]!)
        : fit.extent / Math.max(1e-5, Math.max(size[0]!, size[1]!, size[2]!));
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    M.makeScale(s, s, s).multiply(new Matrix4().makeTranslation(-cx, -cy, -cz));
  } else {
    const sx = (fit.max[0] - fit.min[0]) / Math.max(1e-5, size[0]!);
    const sy = (fit.max[1] - fit.min[1]) / Math.max(1e-5, size[1]!);
    const sz = (fit.max[2] - fit.min[2]) / Math.max(1e-5, size[2]!);
    M.makeTranslation(
      fit.min[0] - bb.min.x * sx,
      fit.min[1] - bb.min.y * sy,
      fit.min[2] - bb.min.z * sz,
    ).multiply(new Matrix4().makeScale(sx, sy, sz));
  }
  geo.applyMatrix4(M);
  if (geo.getAttribute('normal')) geo.normalizeNormals();
  entry.merged.set(key, geo);
  return geo;
}

/**
 * A session-scoped family material for kit geometry: vertex part-tints ×
 * a per-world tint (palette identity, exactly what the old flat materials
 * carried) × a soft read of the family atlas. One per family per session,
 * warmed behind the plasma like everything else.
 */
export function upliftFamilyMaterial(opts: {
  atlas?: string | null;
  tint?: Color;
  /** Recentres the kit's mid-grey part colours around the tint. */
  gain?: number;
  roughness?: number;
  metalness?: number;
  emissive?: Color;
  emissiveIntensity?: number;
}): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  m.roughness = opts.roughness ?? 0.88;
  m.metalness = opts.metalness ?? 0.1;
  if (opts.emissive) {
    m.emissive = opts.emissive.clone();
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  const gain = opts.gain ?? 2.0;
  const tint = opts.tint ?? WHITE;
  let col: N = vertexColor().mul(vec3(tint.r * gain, tint.g * gain, tint.b * gain));
  if (opts.atlas) {
    const tex = upliftNode(opts.atlas, undefined, { repeat: true, srgb: true });
    col = col.mul(mix(vec3(1), tex.rgb.mul(2.0), 0.32));
  }
  m.colorNode = col;
  return m;
}

/**
 * A sprite material cut from an atlas by UV window, tinted by material.color
 * (read live via materialColor, so callers keep driving colour/opacity as
 * they always did). Null on Tier C so callers can fall back to their glow.
 */
export function upliftWindowSprite(
  relative: string,
  cell: [number, number, number, number],
  colorHex: number,
  opacity: number,
): import('three/webgpu').SpriteNodeMaterial | null {
  if (!upliftActive()) return null;
  const m = new SpriteNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  m.color = new Color(colorHex);
  m.opacity = opacity;
  const winUV = vec2(
    uv().x.mul(cell[2] - cell[0]).add(cell[0]),
    uv().y.mul(cell[3] - cell[1]).add(cell[1]),
  );
  const s = upliftNode(relative, winUV, { placeholder: 'clear' });
  m.colorNode = s.rgb.mul(materialColor);
  m.opacityNode = s.a.mul(materialOpacity);
  return m;
}

let ringMat: MeshBasicNodeMaterial | null = null;

/**
 * The ringed-world dust band (5.3): one shared material; RingGeometry's
 * planar UVs land exactly on the radial plate. Null on Tier C.
 */
export function upliftRingMaterial(): MeshBasicNodeMaterial | null {
  if (!upliftActive()) return null;
  if (ringMat) return ringMat;
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthWrite = false;
  m.side = 2; // DoubleSide
  const s = upliftNode('textures/orbit/ring-dust.ktx2', undefined, { placeholder: 'clear' });
  m.colorNode = s.rgb.mul(vec3(1.05, 1.0, 0.88));
  m.opacityNode = s.a.mul(0.5);
  ringMat = m;
  return m;
}

/**
 * A lit-window material that keeps its day/night colour drive (the frame
 * loop writes material.color; materialColor reads it live) and gains the
 * window-emissive atlas (2.4) as pane structure. Neutral until the KTX2
 * lands — the placeholder swap keeps the graph stable.
 */
export function upliftWindowMaterial(baseHex: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.color = new Color(baseHex);
  const tex = upliftNode('textures/settlements/window-emissive.ktx2', undefined, {});
  m.colorNode = materialColor.mul(mix(vec3(1), tex.rgb.mul(2.4), 0.55));
  return m;
}

// ————— Kit materials: exactly one per family —————

const kitMaterials = new Map<string, MeshStandardNodeMaterial>();

/**
 * The one material a kit's every instance shares. Vertex colours carry the
 * authored part tints; the family atlas breaks up the surface as a
 * mid-strength modulation so a flat quad still reads as material. Built
 * eagerly (placeholder atlas) so warm-up can compile it before first use.
 */
export function kitMaterial(
  family: string,
  atlas: string | null,
  opts: { roughness?: number; metalness?: number; emissiveScale?: number } = {},
): MeshStandardNodeMaterial {
  const key = family;
  const hit = kitMaterials.get(key);
  if (hit) return hit;
  const m = new MeshStandardNodeMaterial();
  m.roughness = opts.roughness ?? 0.82;
  m.metalness = opts.metalness ?? 0.18;
  if (atlas) {
    // Default UVs from primitive geometry tile the atlas once per face.
    const tex = upliftNode(atlas, undefined, { repeat: true, srgb: true });
    // Modulate, never replace: the vertex tints own the read, the atlas owns
    // the grain. ×2 recentres the mid-grey pattern around 1.
    m.colorNode = vertexColor().mul(mix(vec3(1), tex.rgb.mul(2.0), 0.42));
  } else {
    m.colorNode = vertexColor();
  }
  kitMaterials.set(key, m);
  return m;
}

// ————— Preload —————

/**
 * Begin the whole pack's fetch+transcode as soon as the renderer exists.
 * Order mirrors ASSET_UPLIFT.md's return-per-hour ordering, so the ground
 * you stare at arrives before the teapot you might fly past.
 */
export function preloadUplift(): void {
  if (!upliftActive()) return;
  for (const key of Object.keys(GROUND_PATHS) as Array<keyof GroundBundle>) {
    const [path, opts] = GROUND_PATHS[key];
    upliftPrefetch(path, opts);
  }
  upliftPrefetch('textures/ground/ground-decals.ktx2', {});
  prefetchKit('meshes/ships/runabout.glb');
  prefetchKit('meshes/ships/runabout-refits.glb');
  prefetchKit('meshes/ships/skimmer.glb');
  upliftPrefetch('textures/ships/runabout-pbr.ktx2', { repeat: true, srgb: true });
  prefetchKit('meshes/props/creatures.glb');
  for (const family of ['rocks', 'boulders', 'flora', 'shrubs', 'shards', 'vents']) {
    prefetchKit(`meshes/props/${family}.glb`);
    upliftPrefetch(`textures/props/${family}-atlas.ktx2`, { repeat: true, srgb: true });
  }
  prefetchKit('meshes/settlements/settlement-kit.glb');
  upliftPrefetch('textures/settlements/settlement-atlas.ktx2', { repeat: true, srgb: true });
  upliftPrefetch('textures/settlements/window-emissive.ktx2', {});
  prefetchKit('meshes/facilities/facility-kit.glb');
  upliftPrefetch('textures/facilities/facility-atlas.ktx2', { repeat: true, srgb: true });
  prefetchKit('meshes/marks/mark-kit.glb');
  upliftPrefetch('textures/marks/mark-atlas.ktx2', { repeat: true, srgb: true });
  prefetchKit('meshes/seams/crystal-seam-kit.glb');
  prefetchKit('meshes/deep-field/deep-field-kit.glb');
  upliftPrefetch('textures/deep-field/deep-field-atlas.ktx2', { repeat: true, srgb: true });
  // Sky and weather (Tier 4).
  upliftPrefetch('textures/sky/sky-gradient-luts.ktx2', { layers: 6, srgb: true });
  upliftPrefetch('textures/sky/aurora-bioluminescence-ramp.ktx2', {});
  upliftPrefetch('textures/sky/cloud-deck-array.ktx2', { repeat: true, layers: 4 });
  upliftPrefetch('textures/sky/cloud-flow.ktx2', { repeat: true });
  upliftPrefetch('textures/sky/weather-particles.ktx2', {});
  upliftPrefetch('textures/sky/starfield-equirect.ktx2', { srgb: true });
  upliftPrefetch('textures/sky/nebula-wash.ktx2', { srgb: true });
  upliftPrefetch('textures/sky/sun-glare.ktx2', {});
  // The orbital and universe scales (Tier 5).
  upliftPrefetch('textures/orbit/planet-detail-array.ktx2', { repeat: true, layers: 6 });
  upliftPrefetch('textures/orbit/city-lights.ktx2', { repeat: true });
  upliftPrefetch('textures/orbit/ring-dust.ktx2', {});
  upliftPrefetch('textures/orbit/galaxy-sprites.ktx2', {});
  upliftPrefetch('textures/orbit/traffic-freight-atlas.ktx2', { srgb: true });
}
