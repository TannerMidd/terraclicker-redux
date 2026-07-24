import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportSave } from '../src/engine/save/codec';
import { newGame } from '../src/engine/sim';

const SAVE_KEY = 'terraclicker2.save';
const QUARANTINE_KEY = 'terraclicker2.recovery.rejected';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.sequential('local persistence safety', () => {
  it('quarantines a rejected main save and never overwrites it through saveNow', async () => {
    const rejected = '{"version":2,"seed":23063,"prestige":{"bp":13}}';
    const storage = memoryStorage({ [SAVE_KEY]: rejected });
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();

    const store = await import('../src/state/store');

    expect(store.useGame.getState().persistenceBlocked).toBe(true);
    expect(store.useGame.getState().loadError).toMatch(/autosave(?: is)? paused/i);
    expect(storage.getItem(QUARANTINE_KEY)).toBe(rejected);

    store.saveNow();

    expect(storage.getItem(SAVE_KEY)).toBe(rejected);
    expect(storage.getItem(QUARANTINE_KEY)).toBe(rejected);
  });

  it('only resumes persistence after an explicitly validated import', async () => {
    const rejected = '{"version":2,"seed":23063,"prestige":{"bp":13}}';
    const storage = memoryStorage({ [SAVE_KEY]: rejected });
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();

    const store = await import('../src/state/store');
    const replacement = newGame(424242, Date.now());
    replacement.prestige.bp = 9;

    expect(store.importFromText(exportSave(replacement))).toBeNull();
    expect(store.useGame.getState().persistenceBlocked).toBe(false);
    expect(storage.getItem(SAVE_KEY)).not.toBe(rejected);
    expect(storage.getItem(QUARANTINE_KEY)).toBe(rejected);
  });

  it('treats an explicit hard reset as permission to leave recovery mode', async () => {
    const rejected = '{"version":2,"seed":23063,"prestige":{"bp":13}}';
    const storage = memoryStorage({ [SAVE_KEY]: rejected });
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();

    const store = await import('../src/state/store');
    expect(store.useGame.getState().persistenceBlocked).toBe(true);

    store.hardReset();
    expect(store.useGame.getState().persistenceBlocked).toBe(false);
    expect(storage.getItem(QUARANTINE_KEY)).toBeNull();
    expect(storage.getItem(SAVE_KEY)).not.toBe(rejected);

    store.saveNow();
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
  });
});
