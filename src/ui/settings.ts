import { create } from 'zustand';

export type Quality = 'auto' | 'high' | 'medium' | 'low';

interface Settings {
  audio: boolean;
  quality: Quality;
  setAudio: (v: boolean) => void;
  setQuality: (q: Quality) => void;
}

const KEY = 'terraclicker2.settings';

function load(): { audio: boolean; quality: Quality } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<{ audio: boolean; quality: Quality }>;
      return { audio: p.audio ?? true, quality: p.quality ?? 'auto' };
    }
  } catch {
    /* defaults */
  }
  return { audio: true, quality: 'auto' };
}

function persist(s: { audio: boolean; quality: Quality }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* fine */
  }
}

export const useSettings = create<Settings>((set, get) => ({
  ...load(),
  setAudio: (v) => {
    set({ audio: v });
    persist({ audio: v, quality: get().quality });
  },
  setQuality: (q) => {
    set({ quality: q });
    persist({ audio: get().audio, quality: q });
  },
}));
