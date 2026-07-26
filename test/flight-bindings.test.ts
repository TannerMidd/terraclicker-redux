import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_LABELS,
  bindingLabel,
  DEFAULT_BINDINGS,
  FLIGHT_ACTIONS,
  flightBindingConflict,
  flightModeKeyIntent,
  readPad,
  validateFlightBindings,
  type Binding,
  type FlightAction,
} from '../src/ui/scene/flightBindings';

function bindingsWith(
  overrides: Partial<Record<FlightAction, Binding>>,
): Record<FlightAction, Binding> {
  return { ...DEFAULT_BINDINGS, ...overrides };
}

describe('flight bindings', () => {
  it('gives Jump and Exit first-class, conflict-free defaults', () => {
    expect(DEFAULT_BINDINGS.jump).toEqual(['KeyJ']);
    expect(DEFAULT_BINDINGS.exit).toEqual(['Escape']);
    expect(DEFAULT_BINDINGS.deter).toEqual(['KeyF']);
    expect(ACTION_LABELS.jump).toBe('jump');
    expect(ACTION_LABELS.engage).toBe('scan / board');
    expect(validateFlightBindings(DEFAULT_BINDINGS)).toEqual([]);

    for (const action of FLIGHT_ACTIONS) {
      expect(ACTION_LABELS[action]).toBeTruthy();
      expect(DEFAULT_BINDINGS[action].length).toBeGreaterThan(0);
    }
  });

  it('reports duplicate, cockpit-global, and browser-reserved keys', () => {
    const duplicate = flightBindingConflict(
      'jump',
      'KeyF',
      bindingsWith({ jump: ['KeyF'] }),
    );
    expect(duplicate).toMatchObject({
      action: 'jump',
      code: 'KeyF',
      kind: 'duplicate',
      otherAction: 'deter',
    });
    expect(duplicate?.message).toContain('dispersal field');

    expect(flightBindingConflict('jump', 'KeyM', DEFAULT_BINDINGS)).toMatchObject({
      kind: 'reserved',
      code: 'KeyM',
    });
    expect(flightBindingConflict('engage', 'Escape', DEFAULT_BINDINGS)).toMatchObject({
      kind: 'reserved',
      code: 'Escape',
    });
    expect(flightBindingConflict('jump', 'F5', DEFAULT_BINDINGS)).toMatchObject({
      kind: 'reserved',
      code: 'F5',
    });

    // F is safe at the helm now: CameraRig only treats it as entry outside flight.
    expect(flightBindingConflict('deter', 'KeyF', DEFAULT_BINDINGS)).toBeNull();
  });

  it('derives readable copy from the active binding', () => {
    expect(bindingLabel(['KeyJ'])).toBe('j');
    expect(bindingLabel(['ShiftLeft', 'ShiftRight'])).toBe('shift / shift');
    expect(bindingLabel(['Digit7'])).toBe('7');
  });
});

describe('CameraRig flight-mode key policy', () => {
  it('uses F only to enter, and the active Exit binding only to leave', () => {
    expect(flightModeKeyIntent({ code: 'KeyF' }, false, false, DEFAULT_BINDINGS)).toBe(
      'enter-flight',
    );
    expect(flightModeKeyIntent({ code: 'KeyF' }, true, false, DEFAULT_BINDINGS)).toBeNull();
    expect(flightModeKeyIntent({ code: 'Escape' }, true, false, DEFAULT_BINDINGS)).toBe(
      'exit-flight',
    );
    expect(flightModeKeyIntent({ code: 'Escape' }, false, false, DEFAULT_BINDINGS)).toBeNull();

    const remapped = bindingsWith({ exit: ['KeyQ'] });
    expect(flightModeKeyIntent({ code: 'KeyQ' }, true, false, remapped)).toBe('exit-flight');
    expect(flightModeKeyIntent({ code: 'Escape' }, true, false, remapped)).toBeNull();
  });

  it('leaves mode unchanged for panels, repeats, and modified shortcuts', () => {
    expect(flightModeKeyIntent({ code: 'Escape' }, true, true, DEFAULT_BINDINGS)).toBeNull();
    expect(
      flightModeKeyIntent({ code: 'KeyF', repeat: true }, false, false, DEFAULT_BINDINGS),
    ).toBeNull();
    expect(
      flightModeKeyIntent({ code: 'KeyF', ctrlKey: true }, false, false, DEFAULT_BINDINGS),
    ).toBeNull();
  });
});

describe.sequential('saved flight binding migration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('backfills Jump and Exit without losing existing custom keys', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    storage.setItem(
      'tc.flight.prefs.v1',
      JSON.stringify({ bindings: { thrust: ['Digit7'] }, horizonLock: true }),
    );
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();

    const bindings = await import('../src/ui/scene/flightBindings');
    const prefs = bindings.flightPrefs();
    expect(prefs.bindings.thrust).toEqual(['Digit7']);
    expect(prefs.bindings.jump).toEqual(['KeyJ']);
    expect(prefs.bindings.exit).toEqual(['Escape']);
    expect(prefs.horizonLock).toBe(true);
  });
});

describe('standard gamepad bindings', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    vi.restoreAllMocks();
  });

  it('exposes separate Jump and Exit buttons', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[4] = { pressed: true, value: 1 };
    buttons[8] = { pressed: true, value: 1 };
    const pad = {
      id: 'Standard Pad',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons,
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => [pad] },
      configurable: true,
      writable: true,
    });

    expect(readPad()).toMatchObject({ connected: true, jump: true, exit: true });
  });
});
