import { create } from 'zustand';

export type Quality = 'auto' | 'high' | 'medium' | 'low';

interface Settings {
  audio: boolean;
  /**
   * The theme, separately switchable from the sound. An idle game is played
   * for hours in the corner of a screen, and "I want the machine noises but
   * not a tune" is a completely reasonable position that a single Sound
   * switch cannot express.
   */
  music: boolean;
  quality: Quality;
  setAudio: (v: boolean) => void;
  setMusic: (v: boolean) => void;
  setQuality: (q: Quality) => void;
}

const KEY = 'terraclicker2.settings';

type Stored = { audio: boolean; music: boolean; quality: Quality };

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Stored>;
      return { audio: p.audio ?? true, music: p.music ?? true, quality: p.quality ?? 'auto' };
    }
  } catch {
    /* defaults */
  }
  return { audio: true, music: true, quality: 'auto' };
}

function persist(s: Stored): void {
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
    const s = get();
    persist({ audio: v, music: s.music, quality: s.quality });
  },
  setMusic: (v) => {
    set({ music: v });
    const s = get();
    persist({ audio: s.audio, music: v, quality: s.quality });
  },
  setQuality: (q) => {
    set({ quality: q });
    const s = get();
    persist({ audio: s.audio, music: s.music, quality: q });
  },
}));
