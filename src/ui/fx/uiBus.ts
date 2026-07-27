import { create } from 'zustand';
import type { PlanetType } from '../../engine/types';

/**
 * One shore leave, captured at the moment of commitment. The type lives here
 * (not in surfaceControl) so the bus never imports the scene: everything the
 * surface needs is frozen into this descriptor when the pilot commits, and
 * the scene mounts on it.
 */
export interface GroundfallSession {
  worldKey: string;
  name: string;
  seed: number;
  type: PlanetType;
  size: 'small' | 'medium' | 'large' | 'huge';
  hero: boolean;
  /** Gauge fractions 0–1 at landing (a delivered world is all ones). */
  aspects: { thermal: number; atmo: number; hydro: number; bio: number };
  /** Unit landing direction in flight space. */
  dir: [number, number, number];
  /** Sun in the landing ENU frame (x east, y up, z south). */
  sunLocal: [number, number, number];
  /** Star tint for the ground light. */
  starHex: number;
  /** Flight pose to restore after takeoff. */
  returnPos: [number, number, number];
  returnYaw: number;
  returnPitch: number;

  // — The world's civic facts, frozen at commitment. Widened once, here, so
  //   every phase of the expedition system reads this struct and none of them
  //   ever asks the flight scene a question after the plasma comes up. —

  /** Key into worldRecords and groundWorlds; unique across every commission. */
  lifetimeIndex: number;
  /** A delivered world, not a commission in progress. */
  completed: boolean;
  /** Simulated clock at commitment — weather is a function of it. */
  gameTimeMs: number;
  /** 0–1; drives settlement liveliness on delivered worlds. */
  standing: number;
  /** worldTraits() output at commitment (delivered worlds only). */
  traits: readonly string[];
  /** Installation ids standing at delivery — surface facilities to come. */
  installations: readonly string[];
  /** The world's quirks: landmark grammar and sample identity read these. */
  quirks: readonly string[];
  /** Open situations/petitions naming this world, titles resolved. */
  openRequests: readonly { uid: number; id: string; name: string }[];
  /** Field Certification ranks at commitment. */
  certs: Readonly<Record<string, number>>;
}

export interface Toast {
  id: number;
  kicker?: string;
  title: string;
  body?: string;
  art?: string;
  artAlt?: string;
  kind: 'info' | 'achievement' | 'event' | 'vogon';
  ttlMs: number;
}

export interface FloatNum {
  id: number;
  x: number;
  y: number;
  text: string;
}

/** A formation cinematic waiting to play (system ignition / galaxy bloom). */
export interface CinematicJob {
  id: number;
  kind: 'system' | 'galaxy';
  /** 0-based index of the system/galaxy that just formed. */
  index: number;
}

/** Nameplate for a hovered world / system / galaxy in the universe view. */
export interface InspectInfo {
  title: string;
  sub: string;
  x: number;
  y: number;
}

/**
 * A cosmic object the player clicked to visit. `system` uses the GLOBAL
 * system index (works both for constellation glyphs and for systems already
 * folded into a galaxy — the seat differs, the records don't). `world` is an
 * index into run.completedPlanets — the deepest rung of the zoom ladder.
 */
export interface FocusTarget {
  kind: 'galaxy' | 'system' | 'world';
  index: number;
}

/**
 * Live camera zoom, written by CameraRig every frame and read imperatively
 * (scene fades, HUD captions) without triggering React renders.
 * `v` is the smoothed 0–1 journey position; `band` the current scale band
 * (0 planet · 1 system · 2 constellation · 3 galaxies · 4 universe).
 */
export const zoomLive = { v: 0, band: 0 };

/**
 * The hero planet's live screen placement, written by CameraRig each frame.
 * The diegetic gauge ring glues itself to this instead of a fixed CSS
 * anchor, so it recedes WITH the planet instead of hanging half-detached.
 * `x`/`y` px center · `r` projected planet radius in px · `o` opacity.
 */
export const heroScreen = { x: 0, y: 0, r: 236, o: 1 };

interface UiBus {
  toasts: Toast[];
  floats: FloatNum[];
  /** Scene shake/punch trigger; increments on planet click. */
  punchNonce: number;
  /** Planet warp-in trigger; increments when a new planet arrives. */
  warpNonce: number;
  /** Full-screen flash trigger for completions. */
  flashNonce: number;
  /** Camera pull-back 0 (hero) → 1 (the whole universe). Scroll/pinch to travel. */
  zoom: number;
  /** The cinematic currently playing, or null. FormationFX drives its timeline. */
  activeCinematic: CinematicJob | null;
  cinematicQueue: CinematicJob[];
  inspect: InspectInfo | null;
  /** The object the camera is visiting, or null for the free journey. */
  focus: FocusTarget | null;
  /** Manual flight: the player has the helm (flightControl + CameraRig). */
  flightMode: boolean;
  /**
   * The formed system the runabout is close enough to for its worlds to
   * materialize (FocusedSystem renders it), or null. Written by the flight
   * landmark sweep with hysteresis; only meaningful while flightMode is on.
   */
  flightNearSystem: number | null;
  /**
   * The formed galaxy whose internal member systems are resolved for flight.
   * Written by the same hysteretic sweep as flightNearSystem.
   */
  flightNearGalaxy: number | null;
  /** The formed world close enough to receive hero-grade surface detail. */
  flightNearWorld: number | null;
  /**
   * The active shore leave, or null at the helm / desk. While set, the
   * universe scene stands down and the surface scene owns the camera.
   */
  groundfall: GroundfallSession | null;
  setGroundfall: (session: GroundfallSession | null) => void;
  addToast: (t: Omit<Toast, 'id'>) => void;
  addFloat: (x: number, y: number, text: string) => void;
  punch: () => void;
  warp: () => void;
  flash: () => void;
  setZoom: (v: number) => void;
  queueCinematic: (kind: CinematicJob['kind'], index: number) => void;
  /** Called by FormationFX when the active cinematic ends; promotes the next. */
  finishCinematic: () => void;
  cancelCinematics: () => void;
  setInspect: (i: InspectInfo | null) => void;
  /** Visit an object (or null to release the camera back to the journey). */
  setFocus: (f: FocusTarget | null) => void;
  setFlightMode: (on: boolean) => void;
  /**
   * A panel the Dock should switch to, set from outside it — the Morning
   * Circular deep-links into panels, and the Dock's own tab was local state
   * with no way in. Cleared by the Dock once honoured, so it is a request
   * rather than a second source of truth.
   */
  dockRequest: string | null;
  setDockTab: (tab: string) => void;
  clearDockRequest: () => void;
  /**
   * The cold open covers everything until the world is touched once. Somebody
   * who came here to restore a save has to get past it without starting a
   * universe, so this is a session flag rather than a saved one — it is not a
   * preference, it is "I have seen this, let me at the department".
   */
  coldOpenDismissed: boolean;
  dismissColdOpen: () => void;
  setFlightNearSystem: (index: number | null) => void;
  setFlightNearGalaxy: (index: number | null) => void;
  setFlightNearWorld: (index: number | null) => void;
}

let nextId = 1;

export const useUiBus = create<UiBus>((set) => ({
  toasts: [],
  floats: [],
  punchNonce: 0,
  warpNonce: 0,
  flashNonce: 0,
  addToast: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.ttlMs);
  },
  addFloat: (x, y, text) => {
    const id = nextId++;
    set((s) => ({ floats: [...s.floats.slice(-11), { id, x, y, text }] }));
    setTimeout(() => set((s) => ({ floats: s.floats.filter((f) => f.id !== id) })), 950);
  },
  punch: () => set((s) => ({ punchNonce: s.punchNonce + 1 })),
  warp: () => set((s) => ({ warpNonce: s.warpNonce + 1 })),
  flash: () => set((s) => ({ flashNonce: s.flashNonce + 1 })),
  zoom: 0,
  setZoom: (v) => set({ zoom: Math.max(0, Math.min(1, v)) }),
  activeCinematic: null,
  cinematicQueue: [],
  queueCinematic: (kind, index) => {
    const job: CinematicJob = { id: nextId++, kind, index };
    set((s) => {
      // A ceremony beginning reclaims the stage from any visit.
      if (s.activeCinematic === null) return { activeCinematic: job, focus: null };
      // Keep the queue short: one of each kind pending at most (offline
      // catch-up can form several systems at once; replaying all would drone).
      const queue = [...s.cinematicQueue.filter((j) => j.kind !== kind), job];
      return { cinematicQueue: queue.slice(-2) };
    });
  },
  finishCinematic: () =>
    set((s) => ({
      activeCinematic: s.cinematicQueue[0] ?? null,
      cinematicQueue: s.cinematicQueue.slice(1),
      ...(s.cinematicQueue.length > 0 ? { focus: null } : {}),
    })),
  cancelCinematics: () => set({ activeCinematic: null, cinematicQueue: [] }),
  inspect: null,
  setInspect: (i) => set({ inspect: i }),
  focus: null,
  setFocus: (f) => {
    if (typeof document !== 'undefined') document.body.style.cursor = '';
    set({ focus: f, inspect: null });
  },
  flightMode: false,
  flightNearSystem: null,
  flightNearGalaxy: null,
  flightNearWorld: null,
  groundfall: null,
  setGroundfall: (session) => {
    if (typeof document !== 'undefined') document.body.style.cursor = '';
    set({ groundfall: session, inspect: null });
  },
  dockRequest: null,
  setDockTab: (tab) => set({ dockRequest: tab }),
  clearDockRequest: () => set({ dockRequest: null }),
  coldOpenDismissed: false,
  dismissColdOpen: () => set({ coldOpenDismissed: true }),
  setFlightMode: (on) => {
    if (typeof document !== 'undefined') document.body.style.cursor = '';
    // Taking the helm releases any visit; handing it back clears the reveal.
    set(on
      ? {
          flightMode: true,
          focus: null,
          flightNearSystem: null,
          flightNearGalaxy: null,
          flightNearWorld: null,
          inspect: null,
        }
      : {
          flightMode: false,
          flightNearSystem: null,
          flightNearGalaxy: null,
          flightNearWorld: null,
          groundfall: null,
          inspect: null,
        });
  },
  setFlightNearSystem: (index) => set({ flightNearSystem: index }),
  setFlightNearGalaxy: (index) => set({ flightNearGalaxy: index }),
  setFlightNearWorld: (index) => set({ flightNearWorld: index }),
}));

// Dev hook for headless verification of camera/cinematic plumbing.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__tcBus'] = { useUiBus, zoomLive };
}

