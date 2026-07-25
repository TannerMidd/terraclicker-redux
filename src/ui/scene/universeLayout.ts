/**
 * Deterministic placement for the accumulating universe (all positions are
 * pure functions of index + seed — the scene is derived state, engine law #2).
 *
 * ————— THE SCALE HIERARCHY —————
 *
 * Everything spatial in this file derives from the block below, and the one
 * rule it exists to enforce is that each level must be large enough to CONTAIN
 * the level beneath it at full size.
 *
 * The universe used to be a compressed diorama: a "system" was a 0.78-unit
 * glyph and a galaxy held five of them 1.15–2.11 units apart. That works
 * while a system is a symbol, and falls apart the moment you can fly into
 * one — five real systems will not fit inside a galaxy two units across, and
 * a delivered world rendered a sixth the size of the hero planet reads as a
 * marble of the thing it used to be.
 *
 * So: a world is a real world, a system comfortably holds five of them, a
 * galaxy comfortably holds five systems, and the universe holds the galaxies.
 * Nothing here is a magic number any more; retune a level by editing its
 * radius and everything nested inside and around it follows.
 *
 * The hero planet stays at radius 1. It is the ruler everything else uses.
 */
import { Color, Euler, Vector3 } from 'three/webgpu';
import { mulberry } from '../../engine/rng';
import { C } from '../../content/constants';

/** Outermost orbit of a system's five worlds. A system is this across. */
export const SYSTEM_R = 8;
/** Outermost member seat inside a galaxy. Must comfortably clear SYSTEM_R. */
export const GALAXY_R = 78;
/** Radius of the shell galaxies are placed on. Must clear 2 × GALAXY_R. */
export const UNIVERSE_R = 260;
/** Reach of the cosmic web — the backdrop everything else sits inside. */
export const WEB_R = 1150;

/**
 * The system currently under construction. Far enough out that its worlds,
 * which now orbit to SYSTEM_R, never crowd the hero planet at the origin.
 */
export const CURRENT_SYSTEM_ANCHOR = new Vector3(-17, 6.5, -26);

const GOLDEN = 2.39996; // golden angle, for tasteful orbit spacing

/**
 * On-screen radius of a settled world, by size. Lives here rather than in
 * miniPlanet.ts because the helm needs it to build collision shells, and
 * miniPlanet builds a node material at import time — which the flight tests
 * have no renderer for.
 */
export const MINI_SIZE: Record<'small' | 'medium' | 'large' | 'huge', number> = {
  small: 0.5,
  medium: 0.62,
  large: 0.78,
  huge: 0.95,
};

export interface HeroMoon {
  size: number;
  orbit: number;
  speed: number;
  phase: number;
  tilt: number;
}

/**
 * The hero planet's moons. Shared between the renderer and the helm so the
 * two cannot disagree about where they are — they were invisible to
 * collision for a while, which meant flying straight through what is,
 * visibly, a small planet.
 *
 * The draw ORDER here is load-bearing: it must match what Planet.tsx used to
 * do inline, or every existing world's moons move.
 */
export function heroMoons(seed: number, isEarth: boolean): HeroMoon[] {
  const r = mulberry(seed ^ 0xdeca);
  const count = isEarth ? 1 : Math.floor(r() * 3.2);
  return Array.from({ length: count }, (_, i) => ({
    size: 0.05 + r() * 0.07,
    orbit: 1.9 + i * 0.55 + r() * 0.3,
    speed: (0.12 + r() * 0.18) * (r() < 0.2 ? -1 : 1),
    phase: r() * Math.PI * 2,
    tilt: (r() - 0.5) * 0.7,
  }));
}

/** Live position of a moon at clock time `t` (planet-local, hero at origin). */
export function heroMoonPosition(m: HeroMoon, t: number, out: Vector3): Vector3 {
  const a = m.phase + t * m.speed;
  return out.set(Math.cos(a) * m.orbit, Math.sin(a * 0.7) * m.tilt, Math.sin(a) * m.orbit);
}

/** Orbit slot for the i-th finished planet of the assembling system (0–4). */
export function orbitSlot(i: number): { radius: number; phase: number; speed: number } {
  return {
    radius: SYSTEM_R * (0.28 + i * 0.18),
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
  const radius = GALAXY_R * (0.55 + (i % 3) * 0.14 + r() * 0.07);
  return new Vector3(
    Math.cos(angle) * radius * 0.9 - GALAXY_R * 0.06,
    GALAXY_R * (0.1 + ((i * 1.7) % 4.2) * 0.045 + r() * 0.035 - t * 0.05),
    -GALAXY_R * (0.72 + (i % 4) * 0.13 + r() * 0.09),
  );
}

/** Position of the i-th formed galaxy, far shell. */
export function galaxyPosition(i: number, masterSeed: number): Vector3 {
  const r = mulberry((masterSeed ^ (i * 0x6a1a)) >>> 0);
  const angle = -2.2 + i * 1.05 + r() * 0.4;
  return new Vector3(
    Math.cos(angle) * UNIVERSE_R - UNIVERSE_R * 0.1,
    UNIVERSE_R * (0.05 + (i % 3) * 0.028 + r() * 0.018),
    -UNIVERSE_R * (0.62 + (i % 3) * 0.12 + r() * 0.08),
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
    const radius = GALAXY_R * (0.08 + t * 1.0);
    const angle = arm * ((Math.PI * 2) / arms) + t * 4.4 + (r() - 0.5) * (0.5 - t * 0.3);
    const spread = (1 - t * 0.7) * 0.28 * GALAXY_R * 0.31;
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
    pts[i * 3] = g() * GALAXY_R * 0.34;
    pts[i * 3 + 1] = g() * GALAXY_R * 0.13;
    pts[i * 3 + 2] = g() * GALAXY_R * 0.34;
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
    const rad = Math.sqrt(r()) * GALAXY_R * 0.81;
    pts[i * 3] = Math.cos(a) * rad + (r() - 0.5) * GALAXY_R * 0.16;
    pts[i * 3 + 1] = (r() - 0.5) * (GALAXY_R * 0.5 - rad * 0.35);
    pts[i * 3 + 2] = Math.sin(a) * rad + (r() - 0.5) * GALAXY_R * 0.16;
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
  const radius = GALAXY_R * (0.32 + slot * 0.17 + r() * 0.04);
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
  return { radius: SYSTEM_R * (0.28 + i * 0.18), phase: i * 2.39996, speed: 0.14 / (1 + i * 0.4) };
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
  const dist = galaxy ? GALAXY_R * (wide ? 2.0 : 2.4) : SYSTEM_R * (wide ? 2.1 : 2.5);
  // Lateral offset, so the subject is not viewed straight down -Z. It has to
  // be a FRACTION of the way out, never a multiple of the seat's absolute
  // position: this was `-seat.x * 0.05`, written when the whole universe was
  // a few units across. At UNIVERSE_R = 260 it reaches ±13 against a y of
  // 0.62, and normalising that gives a direction lying almost exactly along
  // -X — which is why every visited galaxy arrived edge-on and every system
  // was seen down the plane of its own orbits.
  const lateral = -(seat.x / UNIVERSE_R) * 0.28;
  // Galaxies get a higher vantage so the disc reads as a spiral, not a blob.
  outCam
    .set(lateral, galaxy ? 0.62 : 0.44, 1)
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
        (r() - 0.5) * WEB_R * 2,
        WEB_R * (-0.05 + r() * 0.36),
        -WEB_R * (0.4 + r() * 0.6),
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
      const pinch = (0.7 + Math.sin(t * Math.PI) * 2.1) * WEB_R * 0.017;
      tmp.copy(a).lerp(b, t);
      filaments[f++] = tmp.x + (r() - 0.5) * pinch;
      filaments[f++] = tmp.y + (r() - 0.5) * pinch * 0.7;
      filaments[f++] = tmp.z + (r() - 0.5) * pinch;
      // Sprinkle candidate galaxy nodes along the filaments.
      if (k % 6 === 2 && r() < 0.8) {
        tmp.copy(a).lerp(b, t);
        nodePts.push(
          tmp.x + (r() - 0.5) * WEB_R * 0.012,
          tmp.y + (r() - 0.5) * WEB_R * 0.009,
          tmp.z + (r() - 0.5) * WEB_R * 0.012,
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
  const gaze = new Vector3(0, WEB_R * 0.06, -WEB_R * 0.68);
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
/** What the Guide calls each band (zoom rail, flight console). */
export const BAND_LABELS = [
  'the planet',
  'the system',
  'the neighbourhood',
  'the galaxies',
  'everything else',
] as const;
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
/**
 * The journey, rebuilt on the scale hierarchy. Each stop frames the level it
 * is named after — band 1 holds the assembling system in view, band 2 the
 * constellation, band 3 the galaxies, band 4 the web — so the stops move
 * automatically if a level is retuned. Only band 0 is hand-placed, because
 * it frames the hero planet and the hero planet is the ruler.
 */
const SYS = SYSTEM_R;
const GAL = GALAXY_R;
const UNI = UNIVERSE_R;
const WEB = WEB_R;
const ANCHOR: [number, number, number] = [
  CURRENT_SYSTEM_ANCHOR.x,
  CURRENT_SYSTEM_ANCHOR.y,
  CURRENT_SYSTEM_ANCHOR.z,
];

const WIDE: Waypoint[] = [
  { z: 0.0, cam: [0.4, 0.2, 6.55], look: [1.28, 0.02, 0] },
  { z: 0.3, cam: [ANCHOR[0] * 0.35, SYS * 0.5, SYS * 4.4], look: ANCHOR },
  { z: 0.55, cam: [-GAL * 0.02, GAL * 0.16, GAL * 1.5], look: [-GAL * 0.06, GAL * 0.08, -GAL * 0.7] },
  { z: 0.78, cam: [UNI * 0.01, UNI * 0.11, UNI * 1.55], look: [-UNI * 0.05, UNI * 0.05, -UNI * 0.62] },
  { z: 1.0, cam: [WEB * 0.01, WEB * 0.1, WEB * 1.05], look: [0, WEB * 0.06, -WEB * 0.68] },
];
const NARROW: Waypoint[] = [
  { z: 0.0, cam: [0.4, 0.2, 6.55], look: [0, -0.55, 0] },
  { z: 0.3, cam: [ANCHOR[0] * 0.3, SYS * 0.6, SYS * 5.3], look: ANCHOR },
  { z: 0.55, cam: [-GAL * 0.02, GAL * 0.18, GAL * 1.8], look: [-GAL * 0.06, GAL * 0.06, -GAL * 0.7] },
  { z: 0.78, cam: [UNI * 0.01, UNI * 0.12, UNI * 1.85], look: [-UNI * 0.05, UNI * 0.04, -UNI * 0.62] },
  { z: 1.0, cam: [WEB * 0.01, WEB * 0.1, WEB * 1.25], look: [0, WEB * 0.05, -WEB * 0.68] },
];

/** Camera distance from origin at each band stop — the helm mirrors these. */
export const BAND_DISTANCES: readonly number[] = WIDE.map((w) =>
  Math.hypot(w.cam[0], w.cam[1], w.cam[2]),
);

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
