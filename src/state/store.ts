import { create } from 'zustand';
import { computeDerived, newGame, step, stepOffline } from '../engine/sim';
import { deserialize, exportSave, importSave, serialize } from '../engine/save/codec';
import type { Decimal } from '../engine/num';
import type { Derived, GameState, Input, SimEffect } from '../engine/types';
import { C } from '../content/constants';

const SAVE_KEY = 'terraclicker2.save';
const BACKUP_KEYS = ['terraclicker2.backup.0', 'terraclicker2.backup.1'];

export interface OfflineReport {
  simulatedMs: number;
  cappedMs: number;
  tuGained: Decimal;
  planetsCompleted: number;
}

interface GameStore {
  /** Live engine state — mutated in place by the loop; treat as read-only in UI. */
  s: GameState;
  /** Fresh derived bundle, republished each logic tick. */
  d: Derived;
  /** Bumped on every publish; cheap subscription key. */
  rev: number;
  booted: boolean;
  loadError: string | null;
  offlineReport: OfflineReport | null;
  dismissOfflineReport: () => void;
}

type EffectListener = (effects: SimEffect[]) => void;
const effectListeners = new Set<EffectListener>();

/** Subscribe to sim effects (cinematics, audio, toasts). Returns unsubscribe. */
export function onEffects(cb: EffectListener): () => void {
  effectListeners.add(cb);
  return () => effectListeners.delete(cb);
}

function emit(effects: SimEffect[]): void {
  if (effects.length === 0) return;
  for (const cb of effectListeners) cb(effects);
}

function opts() {
  return { utcDay: new Date().getUTCDay() };
}

// ————— Boot: load or new game —————

function boot(): { state: GameState; loadError: string | null; report: OfflineReport | null } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    /* storage unavailable (private mode etc.) — run in-memory */
  }
  if (raw) {
    const r = deserialize(raw);
    if (r.ok) {
      const state = r.state;
      const elapsed = Date.now() - state.savedAtWall;
      let report: OfflineReport | null = null;
      if (elapsed > C.OFFLINE_MIN_MS) {
        const before = state.lifetime.planetsCompleted;
        const res = stepOffline(state, elapsed, opts());
        emit(res.effects);
        report = {
          simulatedMs: res.simulatedMs,
          cappedMs: elapsed - res.simulatedMs,
          tuGained: res.tuGained,
          planetsCompleted: state.lifetime.planetsCompleted - before,
        };
      }
      return { state, loadError: null, report };
    }
    // Corrupt main save: try backups, keep the corpse for forensics.
    for (const key of BACKUP_KEYS) {
      try {
        const b = localStorage.getItem(key);
        if (b) {
          const br = deserialize(b);
          if (br.ok) return { state: br.state, loadError: `main save was ${r.error}; restored backup`, report: null };
        }
      } catch {
        /* keep trying */
      }
    }
    return { state: freshGame(), loadError: r.error, report: null };
  }
  return { state: freshGame(), loadError: null, report: null };
}

function freshGame(): GameState {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  return newGame(seed, Date.now());
}

const initial = boot();

export const useGame = create<GameStore>((set) => ({
  s: initial.state,
  d: computeDerived(initial.state, opts()),
  rev: 0,
  booted: true,
  loadError: initial.loadError,
  offlineReport: initial.report,
  dismissOfflineReport: () => set({ offlineReport: null }),
}));

function publish(): void {
  const { s } = useGame.getState();
  useGame.setState((prev) => ({ d: computeDerived(s, opts()), rev: prev.rev + 1 }));
}

// ————— Actions: immediate input processing (zero-dt step) —————

export function dispatch(input: Input): void {
  const { s } = useGame.getState();
  const r = step(s, 0, [input], opts());
  emit(r.effects);
  publish();
}

export const actions = {
  click: () => dispatch({ type: 'click' }),
  buyBuilding: (id: string, qty: number | 'max') => dispatch({ type: 'buyBuilding', id, qty }),
  buyUpgrade: (id: string) => dispatch({ type: 'buyUpgrade', id }),
  startResearch: (id: string) => dispatch({ type: 'startResearch', id }),
  chooseSurvey: (id: string) => dispatch({ type: 'chooseSurvey', id }),
  catchBubble: (id: number) => dispatch({ type: 'catchBubble', id }),
  hitVogonShip: (id: number) => dispatch({ type: 'hitVogonShip', id }),
  prestige: () => dispatch({ type: 'prestige' }),
  buyPerk: (id: string) => dispatch({ type: 'buyPerk', id }),
};

// Dev hook for headless verification and manual poking.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__tc'] = {
    dispatch,
    useGame,
    saveNow: () => saveNow(),
    exportSave: () => exportToClipboard(),
    importSave: (t: string) => importFromText(t),
  };
}

// ————— Persistence —————

let lastBackupAt = Date.now();

export function saveNow(): void {
  const { s } = useGame.getState();
  s.savedAtWall = Date.now();
  try {
    const json = serialize(s);
    localStorage.setItem(SAVE_KEY, json);
    if (Date.now() - lastBackupAt > 5 * 60_000) {
      // Rotate backups every 5 minutes.
      const prev = localStorage.getItem(BACKUP_KEYS[0]!);
      if (prev) localStorage.setItem(BACKUP_KEYS[1]!, prev);
      localStorage.setItem(BACKUP_KEYS[0]!, json);
      lastBackupAt = Date.now();
    }
  } catch {
    /* storage full or unavailable; the show goes on */
  }
}

export function exportToClipboard(): string {
  return exportSave(useGame.getState().s);
}

export function importFromText(text: string): string | null {
  const r = importSave(text);
  if (!r.ok) return r.error;
  useGame.setState({ s: r.state, offlineReport: null, loadError: null });
  saveNow();
  publish();
  return null;
}

export function hardReset(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    for (const k of BACKUP_KEYS) localStorage.removeItem(k);
  } catch {
    /* fine */
  }
  useGame.setState({ s: freshGame(), offlineReport: null, loadError: null });
  publish();
}

// ————— The loop driver —————

let loopStarted = false;

export function startLoop(): void {
  if (loopStarted) return;
  loopStarted = true;

  let last = performance.now();
  let acc = 0;
  let sinceSave = 0;

  const frame = (now: number) => {
    const dt = now - last;
    last = now;

    if (dt > C.OFFLINE_MIN_MS) {
      // The tab slept long enough to count as an absence.
      const { s } = useGame.getState();
      const before = s.lifetime.planetsCompleted;
      const res = stepOffline(s, dt, opts());
      emit(res.effects);
      useGame.setState({
        offlineReport: {
          simulatedMs: res.simulatedMs,
          cappedMs: dt - res.simulatedMs,
          tuGained: res.tuGained,
          planetsCompleted: s.lifetime.planetsCompleted - before,
        },
      });
      publish();
      acc = 0;
    } else {
      acc += dt;
      if (acc >= C.LOGIC_TICK_MS) {
        const { s } = useGame.getState();
        const r = step(s, acc, [], opts()); // sub-tick remainder carries inside the engine
        acc = 0;
        emit(r.effects);
        publish();
      }
    }

    sinceSave += dt;
    if (sinceSave > 10_000) {
      saveNow();
      sinceSave = 0;
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const onHide = () => {
    if (document.visibilityState === 'hidden') saveNow();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => saveNow());
}
