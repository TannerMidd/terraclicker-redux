import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { flightPrefs, resetFlightPrefs, saveFlightPrefs } from '../src/ui/scene/flightBindings';
import { attachFlightInput, beginFlightAt, endFlight, flightInput, flightLive, setFlightCameraMode, stepFlight } from '../src/ui/scene/flightControl';

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

function keyEvent(code: string, repeat = false, target: unknown = null): Record<string, unknown> {
  return {
    code,
    repeat,
    target,
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
    flightInput.vert = 0;
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

  it('leaves Space activation on a focused cockpit button', () => {
    const button = {
      closest: (selector: string) => selector.includes('button') ? {} : null,
    };
    let prevented = false;
    const event = keyEvent('Space', false, button);
    event.preventDefault = () => { prevented = true; };
    windowStub.emit('keydown', event);
    expect(flightInput.vert).toBe(0);
    expect(prevented).toBe(false);
    windowStub.emit('keyup', event);
  });

  it('does not retoggle chase view when focus blurs under a held R3', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[11] = { pressed: true, value: 1 };
    const pad = {
      id: 'Standard Pad',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons,
    };
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });

    saveFlightPrefs({ ...flightPrefs(), gamepad: true });
    beginFlightAt(new Vector3(150, 0, 80), 0, 0);
    setFlightCameraMode('cockpit');

    stepFlight(1 / 60, 0);
    expect(flightLive.cameraMode).toBe('chase');
    windowStub.emit('blur', {});
    stepFlight(1 / 60, 1 / 60);
    expect(flightLive.cameraMode).toBe('chase');

    buttons[11] = { pressed: false, value: 0 };
    stepFlight(1 / 60, 2 / 60);
    buttons[11] = { pressed: true, value: 1 };
    stepFlight(1 / 60, 3 / 60);
    expect(flightLive.cameraMode).toBe('cockpit');

    buttons[11] = { pressed: false, value: 0 };
    stepFlight(1 / 60, 4 / 60);
    endFlight();
  });
});
