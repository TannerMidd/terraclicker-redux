import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flightPrefs, resetFlightPrefs, saveFlightPrefs } from '../src/ui/scene/flightBindings';
import { attachFlightInput, flightInput } from '../src/ui/scene/flightControl';

type Listener = (event: Record<string, unknown>) => void;

function fakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type: string, event: Record<string, unknown>) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}

function keyEvent(code: string, repeat = false): Record<string, unknown> {
  return {
    code,
    repeat,
    target: null,
    preventDefault: () => undefined,
  };
}

describe('remapped flight input', () => {
  const windowStub = fakeWindow();
  let detach: () => void = () => undefined;

  beforeEach(() => {
    vi.stubGlobal('window', windowStub);
    resetFlightPrefs();
    const prefs = flightPrefs();
    saveFlightPrefs({
      ...prefs,
      bindings: { ...prefs.bindings, jump: ['Digit7'] },
    });
    flightInput.jump = false;
    detach = attachFlightInput();
  });

  afterEach(() => {
    detach();
    resetFlightPrefs();
    vi.unstubAllGlobals();
  });

  it('latches only the active Jump binding once per press', () => {
    windowStub.emit('keydown', keyEvent('KeyJ'));
    expect(flightInput.jump).toBe(false);
    windowStub.emit('keyup', keyEvent('KeyJ'));

    windowStub.emit('keydown', keyEvent('Digit7'));
    expect(flightInput.jump).toBe(true);

    flightInput.jump = false;
    windowStub.emit('keydown', keyEvent('Digit7', true));
    expect(flightInput.jump).toBe(false);

    windowStub.emit('keyup', keyEvent('Digit7'));
    windowStub.emit('keydown', keyEvent('Digit7'));
    expect(flightInput.jump).toBe(true);

    detach();
    detach = () => undefined;
    expect(flightInput.jump).toBe(false);
  });
});
