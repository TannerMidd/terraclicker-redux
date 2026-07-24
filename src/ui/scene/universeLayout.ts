/**
 * Deterministic placement for the accumulating universe (all positions are
 * pure functions of index + seed — the scene is derived state, engine law #2).
 *
 * Depth shells, hero planet at origin:
 *   z ≈ -7    the current system assembling (star + your finished worlds)
 *   z ≈ -16   constellation of formed systems
 *   z ≈ -34   galaxies
 *   z ≈ -95   the cosmic web (everything else; mostly dark; mostly not yours)
 */
import { Color, Euler, Vector3 } from 'three/webgpu';
import { mulberry } from '../../engine/rng';
import { C } from '../../content/constants';

export const CURRENT_SYSTEM_ANCHOR = new Vector3(-4.9, 1.95, -7.4);

const GOLDEN = 2.39996; // golden angle, for tasteful orbit spacing

/** Orbit slot for the i-th finished planet of the assembling system (0–4). */
export function orbitSlot(i: number): { radius: number; phase: number; speed: number } {
  return {
    radius: 1.0 + i * 0.42,
    phase: i * GOLDEN,
    speed: 0.16 / (1 + i * 0.45),
  };
}

const STAR_PALETTE = [0xffd166, 0xffe0a3, 0x9bd4ff, 0xffb385, 0xd4e5ff, 0xffe9c9];
const STAR_CLASSES = [
  'G2V · reassuringly yellow',
  'G8 · warm, dependable',
  'A-class · blue-white, showy',
  'K-class · amber, economical',
  'F-class · crisp, punctual',
  'G0 · pale gold, unbothered',
];

function starIndex(seed: number): number {
  const r = mulberry(seed ^ 0x57a5);
  return Math.floor(r() * STAR_PALETTE.length);
}

/** Star color for a system, seeded from its first planet. */
export function starColor(seed: number): Color {
  return new Color(STAR_PALETTE[starIndex(seed)]!);
}

/** Guide-voice stellar classification for tooltips. */
export function starClass(seed: number): string {
  return STAR_CLASSES[starIndex(seed)]!;
}

/** Position of the i-th formed system in the constellation shell. */
export function systemGlyphPosition(i: number, masterSeed: number): Vector3 {
  const r = mulberry((masterSeed ^ (i * 0x51ed)) >>> 0);
  const t = i / 6;
  const angle = -2.5 + (i % 7) * 0.62 + r() * 0.3;
  const radius = 13 + (i % 3) * 3.4 + r() * 1.6;
  return new Vector3(
    Math.cos(angle) * radius * 0.9 - 1.5,
    2.1 + ((i * 1.7) % 4.2) + r() * 0.8 - t,
    -14 - (i % 4) * 2.8 - r() * 2,
  );
}

/** Position of the i-th formed galaxy, far shell. */
export function galaxyPosition(i: number, masterSeed: number): Vector3 {
  const r = mulberry((masterSeed ^ (i * 0x6a1a)) >>> 0);
  const angle = -2.2 + i * 1.05 + r() * 0.4;
  return new Vector3(
    Math.cos(angle) * 20 - 2,
    4.5 + (i % 3) * 2.4 + r() * 1.5,
    -30 - (i % 3) * 6 - r() * 4,
  );
}

/** Log-spiral point cloud for a galaxy — generated once, rotated forever. */
export function galaxyPoints(seed: number, count = 700): Float32Array {
  const r = mulberry(seed ^ 0x9a1a);
  const pts = new Float32Array(count * 3);
  const arms = 2 + Math.floor(r() * 2);
  for (let i = 0; i < count; i++) {
    const arm = i % arms;
    const t = r();
    const radius = 0.25 + t * 3.2;
    const angle = arm * ((Math.PI * 2) / arms) + t * 4.4 + (r() - 0.5) * (0.5 - t * 0.3);
    const spread = (1 - t * 0.7) * 0.28;
    pts[i * 3] = Math.cos(angle) * radius + (r() - 0.5) * spread;
    pts[i * 3 + 1] = (r() - 0.5) * spread * 1.6;
    pts[i * 3 + 2] = Math.sin(angle) * radius + (r() - 0.5) * spread;
  }
  return pts;
}

/** Dense warm bulge for a galaxy's core. */
export function galaxyCorePoints(seed: number, count = 220): Float32Array {
  const r = mulberry(seed ^ 0xc04e);
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Gaussian-ish via sum of uniforms, squeezed vertically.
    const g = () => (r() + r() + r()) / 3 - 0.5;
    pts[i * 3] = g() * 1.1;
    pts[i * 3 + 1] = g() * 0.42;
    pts[i * 3 + 2] = g() * 1.1;
  }
  return pts;
}

/**
 * Unstructured swirl for the proto-galaxy: matter loitering at the site of
 * the NEXT galaxy, thickening as systems accumulate. Not yet organized —
 * organization is what the cinematic is for.
 */
export function protoSwirlPoints(seed: number, count: number): Float32Array {
  const r = mulberry(seed ^ 0x9707);
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * 2.6;
    pts[i * 3] = Math.cos(a) * rad + (r() - 0.5) * 0.5;
    pts[i * 3 + 1] = (r() - 0.5) * (1.6 - rad * 0.35);
    pts[i * 3 + 2] = Math.sin(a) * rad + (r() - 0.5) * 0.5;
  }
  return pts;
}

// ————— Visiting (click a galaxy or system to go look at it) —————

/** Every formed galaxy hangs at this fixed tilt; member seats share it. */
export const GALAXY_TILT = new Euler(0.7, 0, 0.2);

/** Personality seed for the i-th galaxy — keep Galaxies.tsx in sync via this. */
export function galaxySeed(index: number, masterSeed: number): number {
  return (masterSeed ^ (index * 7919)) >>> 0;
}

/**
 * Local seat of a galaxy's k-th member system, spread through the spiral
 * disc (galaxy-local coordinates, before GALAXY_TILT is applied).
 */
export function memberSeatLocal(slot: number, gSeed: number): Vector3 {
  const r = mulberry((gSeed ^ (slot * 0x3d1)) >>> 0);
  const angle = slot * GOLDEN * 1.9 + r() * 0.5;
  const radius = 1.15 + slot * 0.24 + r() * 0.12;
  return new Vector3(Math.cos(angle) * radius, (r() - 0.5) * 0.14, Math.sin(angle) * radius);
}

export interface FocusRef {
  kind: 'galaxy' | 'system' | 'world';
  index: number;
}

/**
 * World seat of a focus target. A system folded into a galaxy sits at its
 * member seat inside that galaxy's disc; one still in the constellation
 * sits at its glyph. A `world` target resolves to its parent system's seat
 * (the live orbital offset is layered on by `visitWorldAnchor`).
 */
export function focusSeat(target: FocusRef, masterSeed: number, galaxies: number): Vector3 {
  if (target.kind === 'galaxy') return galaxyPosition(target.index, masterSeed);
  const systemIndex =
    target.kind === 'world' ? Math.floor(target.index / C.PLANETS_PER_SYSTEM) : target.index;
  const consumed = galaxies * C.SYSTEMS_PER_GALAXY;
  if (systemIndex < consumed) {
    const g = Math.floor(systemIndex / C.SYSTEMS_PER_GALAXY);
    const slot = systemIndex % C.SYSTEMS_PER_GALAXY;
    return memberSeatLocal(slot, galaxySeed(g, masterSeed))
      .applyEuler(GALAXY_TILT)
      .add(galaxyPosition(g, masterSeed));
  }
  return systemGlyphPosition(systemIndex, masterSeed);
}

/** Orbit slot for a visited system's k-th world (FocusedSystem + CameraRig). */
export function visitOrbit(i: number): { radius: number; phase: number; speed: number } {
  return { radius: 0.56 + i * 0.3, phase: i * 2.39996, speed: 0.14 / (1 + i * 0.4) };
}

/**
 * Live position of a visited world at clock time `t` — the same math
 * FocusedSystem animates with, so a camera aimed here tracks the planet.
 */
export function visitWorldAnchor(
  worldIndex: number,
  masterSeed: number,
  galaxies: number,
  t: number,
  out: Vector3,
): Vector3 {
  const seat = focusSeat({ kind: 'world', index: worldIndex }, masterSeed, galaxies);
  const o = visitOrbit(worldIndex % C.PLANETS_PER_SYSTEM);
  const a = o.phase + t * o.speed;
  return out.set(
    seat.x + Math.cos(a) * o.radius,
    seat.y + Math.sin(a) * o.radius * 0.22,
    seat.z + Math.sin(a) * o.radius * 0.6,
  );
}

/**
 * Camera pose for visiting a target: parked a respectful distance out,
 * slightly above the plane, nudged toward the universe's center so the
 * composition always faces home.
 */
export function focusFraming(
  target: FocusRef,
  masterSeed: number,
  galaxies: number,
  wide: boolean,
  outCam: Vector3,
  outLook: Vector3,
): void {
  const seat = focusSeat(target, masterSeed, galaxies);
  const galaxy = target.kind === 'galaxy';
  const dist = galaxy ? (wide ? 9.8 : 11.6) : wide ? 4.35 : 5.1;
  // Galaxies get a higher vantage so the disc reads as a spiral, not a blob.
  outCam
    .set(-seat.x * 0.05, galaxy ? 0.62 : 0.44, 1)
    .normalize()
    .multiplyScalar(dist)
    .add(seat);
  outLook.copy(seat);
  if (galaxy) outLook.y += 0.2;
  // Portrait: the dock is a bottom sheet — sit the subject in the upper half.
  if (!wide) outLook.y -= dist * 0.115;
}

export interface CosmicWebData {
  /** Dim filament dust, xyz triplets. */
  filaments: Float32Array;
  /** Node centers, xyz triplets — the places a galaxy could live. */
  nodes: Float32Array;
  /** Order in which nodes light up as galaxies form (index into nodes). */
  order: number[];
}

/**
 * The rest of the universe: filaments of could-be, strung between anchors,
 * studded with dark nodes. Your galaxies light nodes in `order` — the first
 * few deliberately near the center of the camera's deep-zoom gaze, so the
 * earliest lights are findable, and everything after that gets lost in the
 * crowd, which is the Total Perspective Vortex working as intended.
 */
export function cosmicWeb(masterSeed: number): CosmicWebData {
  const r = mulberry((masterSeed ^ 0xc0b3) >>> 0);
  const A = 30; // anchors
  const anchors: Vector3[] = [];
  for (let i = 0; i < A; i++) {
    anchors.push(
      new Vector3(
        (r() - 0.5) * 118,
        -6 + r() * 42,
        -46 - r() * 62,
      ),
    );
  }
  // Connect each anchor to its 2 nearest — a scraggly, believable web.
  const edges: [number, number][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < A; i++) {
    const dists = anchors
      .map((p, j) => ({ j, d: i === j ? Infinity : p.distanceToSquared(anchors[i]!) }))
      .sort((a, b) => a.d - b.d);
    for (let k = 0; k < 2; k++) {
      const j = dists[k]!.j;
      const key = i < j ? i * 100 + j : j * 100 + i;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, j]);
      }
    }
  }

  const perEdge = 46;
  const filaments = new Float32Array(edges.length * perEdge * 3);
  const nodePts: number[] = [];
  const tmp = new Vector3();
  let f = 0;
  for (const [ai, bi] of edges) {
    const a = anchors[ai]!;
    const b = anchors[bi]!;
    for (let k = 0; k < perEdge; k++) {
      const t = (k + r() * 0.9) / perEdge;
      // Thicker mid-filament scatter, pinched at the anchor ends.
      const pinch = 0.7 + Math.sin(t * Math.PI) * 2.1;
      tmp.copy(a).lerp(b, t);
      filaments[f++] = tmp.x + (r() - 0.5) * pinch;
      filaments[f++] = tmp.y + (r() - 0.5) * pinch * 0.7;
      filaments[f++] = tmp.z + (r() - 0.5) * pinch;
      // Sprinkle candidate galaxy nodes along the filaments.
      if (k % 6 === 2 && r() < 0.8) {
        tmp.copy(a).lerp(b, t);
        nodePts.push(
          tmp.x + (r() - 0.5) * 1.4,
          tmp.y + (r() - 0.5) * 1.0,
          tmp.z + (r() - 0.5) * 1.4,
        );
      }
    }
  }
  const nodes = new Float32Array(nodePts);
  const n = nodes.length / 3;

  // Shuffle node order, then bias the first dozen toward the deep-gaze
  // center (0, 7, -78) so early galaxies are visible, not lost off-frame.
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const gaze = new Vector3(0, 7, -78);
  const head = order.slice(0, Math.min(14, n)).sort((a, b) => {
    tmp.set(nodes[a * 3]!, nodes[a * 3 + 1]!, nodes[a * 3 + 2]!);
    const da = tmp.distanceToSquared(gaze);
    tmp.set(nodes[b * 3]!, nodes[b * 3 + 1]!, nodes[b * 3 + 2]!);
    return da - tmp.distanceToSquared(gaze);
  });
  order.splice(0, head.length, ...head);

  return { filaments, nodes, order };
}

// ————— The perspective journey (camera path) —————

/** Journey stops: 0 planet · 1 system · 2 constellation · 3 galaxies · 4 universe. */
export const BAND_STOPS = [0, 0.3, 0.55, 0.78, 1] as const;
/** Band membership thresholds for HUD captions and fades. */
const BAND_EDGES = [0.14, 0.44, 0.68, 0.9];

export function bandAt(z: number): number {
  let b = 0;
  for (const e of BAND_EDGES) if (z >= e) b++;
  return b;
}

interface Waypoint {
  z: number;
  cam: [number, number, number];
  look: [number, number, number];
}

// Wide (landscape) and narrow (portrait) camera scripts. Distances grow
// roughly geometrically — each band is a power of ten in spirit.
const WIDE: Waypoint[] = [
  { z: 0.0, cam: [0.4, 0.2, 6.55], look: [1.28, 0.02, 0] },
  { z: 0.3, cam: [-1.3, 1.6, 13.8], look: [-3.7, 1.75, -7.4] },
  { z: 0.55, cam: [-0.7, 3.6, 27.5], look: [-1.6, 2.8, -16] },
  { z: 0.78, cam: [0.2, 5.8, 50], look: [-0.7, 4.2, -32] },
  { z: 1.0, cam: [0.6, 10, 96], look: [0, 7, -78] },
];
const NARROW: Waypoint[] = [
  { z: 0.0, cam: [0.4, 0.2, 6.55], look: [0, -0.55, 0] },
  { z: 0.3, cam: [-0.9, 2.0, 16.4], look: [-4.2, 1.15, -7.4] },
  { z: 0.55, cam: [-0.5, 3.8, 33], look: [-1.6, 2.1, -16] },
  { z: 0.78, cam: [0.2, 6.0, 60], look: [-0.7, 3.4, -32] },
  { z: 1.0, cam: [0.5, 10, 112], look: [0, 6, -78] },
];

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Sample the perspective journey at z ∈ [0,1]. Smoothstepped between
 * waypoints so the camera eases into a gentle landing at every band.
 */
export function sampleJourney(
  z: number,
  wide: boolean,
  outCam: Vector3,
  outLook: Vector3,
): void {
  const w = wide ? WIDE : NARROW;
  let i = 0;
  while (i < w.length - 2 && z > w[i + 1]!.z) i++;
  const a = w[i]!;
  const b = w[i + 1]!;
  const t = smooth(Math.max(0, Math.min(1, (z - a.z) / (b.z - a.z))));
  outCam.set(
    a.cam[0] + (b.cam[0] - a.cam[0]) * t,
    a.cam[1] + (b.cam[1] - a.cam[1]) * t,
    a.cam[2] + (b.cam[2] - a.cam[2]) * t,
  );
  outLook.set(
    a.look[0] + (b.look[0] - a.look[0]) * t,
    a.look[1] + (b.look[1] - a.look[1]) * t,
    a.look[2] + (b.look[2] - a.look[2]) * t,
  );
}
