/**
 * Who flies the ship, and how.
 *
 * The helm shipped with one fixed keyboard layout, no gamepad, and a bank that
 * rolls the horizon. All three are accessibility problems before they are
 * feature gaps: a fixed WASD layout excludes anyone not on a QWERTY keyboard
 * or not using their left hand for it, no gamepad excludes anyone who cannot
 * hold a mouse steady, and a rolling horizon is one of the most reliable ways
 * known to make somebody motion-sick.
 *
 * Bindings live in localStorage rather than the save, because they belong to
 * the person and the machine rather than to the universe. A save carried to
 * another computer should not bring somebody else's control layout with it.
 */

export type FlightAction =
  | 'thrust'
  | 'brake'
  | 'strafeLeft'
  | 'strafeRight'
  | 'yawLeft'
  | 'yawRight'
  | 'pitchUp'
  | 'pitchDown'
  | 'up'
  | 'down'
  | 'boost'
  | 'engage'
  | 'deter'
  | 'courseHold';

export const ACTION_LABELS: Record<FlightAction, string> = {
  thrust: 'thrust',
  brake: 'brake',
  strafeLeft: 'slide left',
  strafeRight: 'slide right',
  yawLeft: 'turn left',
  yawRight: 'turn right',
  pitchUp: 'nose up',
  pitchDown: 'nose down',
  up: 'rise',
  down: 'descend',
  boost: 'boost',
  engage: 'scan / board / jump',
  deter: 'dispersal field',
  courseHold: 'course hold',
};

/** `KeyboardEvent.code` values, so the layout follows the physical key. */
export type Binding = readonly string[];

export const DEFAULT_BINDINGS: Record<FlightAction, Binding> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  strafeLeft: ['KeyA'],
  strafeRight: ['KeyD'],
  /**
   * Steering on the keyboard, which the helm simply did not have.
   *
   * Turning was mouse-only — hold the left button and drag — so anybody
   * flying with both hands on the keys had a ship that could slide sideways
   * but could not turn, which is a strange craft to be given and no fun at
   * all. The arrows now steer; they used to be duplicates of WASD, which is
   * the least useful thing four keys can be.
   */
  yawLeft: ['ArrowLeft'],
  yawRight: ['ArrowRight'],
  pitchUp: ['ArrowUp'],
  pitchDown: ['ArrowDown'],
  up: ['Space'],
  down: ['KeyC'],
  boost: ['ShiftLeft', 'ShiftRight'],
  engage: ['KeyE'],
  deter: ['KeyF'],
  courseHold: ['KeyH'],
};

export interface FlightPrefs {
  bindings: Record<FlightAction, Binding>;
  /**
   * Cosmetic bank on turns. Already reduced once for comfort; this turns it
   * off entirely for anyone who still finds a tilting horizon unpleasant.
   */
  horizonLock: boolean;
  /** Invert the vertical steering axis, as flight sticks have always allowed. */
  invertPitch: boolean;
  /** 0.3–2. Multiplies steering deflection for both mouse and pad. */
  sensitivity: number;
  gamepad: boolean;
}

export const DEFAULT_PREFS: FlightPrefs = {
  bindings: DEFAULT_BINDINGS,
  horizonLock: false,
  invertPitch: false,
  sensitivity: 1,
  gamepad: true,
};

const STORAGE_KEY = 'tc.flight.prefs.v1';

function sanitize(raw: unknown): FlightPrefs {
  const prefs: FlightPrefs = {
    ...DEFAULT_PREFS,
    bindings: { ...DEFAULT_BINDINGS },
  };
  if (typeof raw !== 'object' || raw === null) return prefs;
  const obj = raw as Record<string, unknown>;

  if (typeof obj['horizonLock'] === 'boolean') prefs.horizonLock = obj['horizonLock'];
  if (typeof obj['invertPitch'] === 'boolean') prefs.invertPitch = obj['invertPitch'];
  if (typeof obj['gamepad'] === 'boolean') prefs.gamepad = obj['gamepad'];
  if (typeof obj['sensitivity'] === 'number' && Number.isFinite(obj['sensitivity'])) {
    prefs.sensitivity = Math.max(0.3, Math.min(2, obj['sensitivity']));
  }

  const bindings = obj['bindings'];
  if (typeof bindings === 'object' && bindings !== null) {
    for (const action of Object.keys(DEFAULT_BINDINGS) as FlightAction[]) {
      const value = (bindings as Record<string, unknown>)[action];
      // A binding that survived a bad edit must never leave an action
      // unreachable — an empty list falls back to the default rather than
      // stranding the pilot with no brake.
      if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) {
        prefs.bindings[action] = value as string[];
      }
    }
  }
  return prefs;
}

let cached: FlightPrefs | null = null;

export function flightPrefs(): FlightPrefs {
  if (cached) return cached;
  if (typeof localStorage === 'undefined') {
    cached = { ...DEFAULT_PREFS, bindings: { ...DEFAULT_BINDINGS } };
    return cached;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    cached = { ...DEFAULT_PREFS, bindings: { ...DEFAULT_BINDINGS } };
  }
  return cached;
}

export function saveFlightPrefs(next: FlightPrefs): void {
  cached = sanitize(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // A pilot with storage disabled still gets to fly; they just re-bind each
    // session, which is better than refusing to accept the change at all.
  }
}

export function resetFlightPrefs(): void {
  cached = { ...DEFAULT_PREFS, bindings: { ...DEFAULT_BINDINGS } };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* see above */
  }
}

/** Human-readable name for a `KeyboardEvent.code`. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Arrow')) return `${code.slice(5).toLowerCase()} arrow`;
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'space';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
  return code.toLowerCase();
}

// ————— Gamepad —————

/**
 * A standard-mapping pad, read fresh each frame. Deliberately not stateful:
 * browsers hand back a new snapshot per poll, and holding onto one is how you
 * end up flying a ship with a controller that was unplugged.
 */
export interface PadState {
  connected: boolean;
  /** Left stick: strafe / vertical. */
  moveX: number;
  moveY: number;
  /** Right stick: steering. */
  lookX: number;
  lookY: number;
  thrust: number;
  brake: number;
  boost: boolean;
  engage: boolean;
  deter: boolean;
  courseHold: boolean;
}

const DEADZONE = 0.16;

function axis(value: number | undefined): number {
  const v = value ?? 0;
  if (Math.abs(v) < DEADZONE) return 0;
  // Rescale past the deadzone so the first responsive degree is not a jump.
  return Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE));
}

export function readPad(): PadState {
  const empty: PadState = {
    connected: false,
    moveX: 0, moveY: 0, lookX: 0, lookY: 0,
    thrust: 0, brake: 0,
    boost: false, engage: false, deter: false, courseHold: false,
  };
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return empty;

  for (const pad of navigator.getGamepads()) {
    if (!pad || !pad.connected) continue;
    /**
     * Standard mapping only, and this is not fussiness.
     *
     * Every index below — axes 0–3, buttons 0–10 — is a promise the Gamepad
     * API makes for pads it reports as `standard`, and for nothing else. A
     * HOTAS throttle, a yoke, a wheel or a set of rudder pedals all enumerate
     * here too, and their axes mean entirely different things: a throttle
     * sitting untouched on the desk reports its rudder rocker and slider as
     * axes 2 and 3, which this used to read as a right stick held hard over.
     * The helm then flew a permanent full-deflection turn commanded by a
     * device nobody was touching, and the pilot got a ship that would not
     * stop dropping. Better to see no pad at all than to invent one.
     */
    if (pad.mapping !== 'standard') continue;
    const b = (i: number) => pad.buttons[i]?.pressed ?? false;
    const v = (i: number) => pad.buttons[i]?.value ?? 0;
    return {
      connected: true,
      moveX: axis(pad.axes[0]),
      moveY: axis(pad.axes[1]),
      lookX: axis(pad.axes[2]),
      lookY: axis(pad.axes[3]),
      thrust: Math.max(v(7), b(0) ? 1 : 0), // right trigger or A
      brake: Math.max(v(6), b(1) ? 1 : 0), // left trigger or B
      boost: b(10) || b(5),
      engage: b(2), // X
      deter: b(3), // Y
      courseHold: b(9), // start
    };
  }
  return empty;
}
