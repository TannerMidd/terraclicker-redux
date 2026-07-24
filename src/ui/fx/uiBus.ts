import { create } from 'zustand';

export interface Toast {
  id: number;
  kicker?: string;
  title: string;
  body?: string;
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
 * Live camera zoom, written by CameraRig every frame and read imperatively
 * (scene fades, HUD captions) without triggering React renders.
 * `v` is the smoothed 0–1 journey position; `band` the current scale band
 * (0 planet · 1 system · 2 constellation · 3 galaxies · 4 universe).
 */
export const zoomLive = { v: 0, band: 0 };

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
      if (s.activeCinematic === null) return { activeCinematic: job };
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
    })),
  cancelCinematics: () => set({ activeCinematic: null, cinematicQueue: [] }),
  inspect: null,
  setInspect: (i) => set({ inspect: i }),
}));

// Dev hook for headless verification of camera/cinematic plumbing.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__tcBus'] = { useUiBus, zoomLive };
}

