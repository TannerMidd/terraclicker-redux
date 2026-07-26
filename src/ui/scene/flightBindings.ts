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
  | 'jump'
  | 'deter'
  | 'courseHold'
  | 'exit';

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
  engage: 'scan / board',
  jump: 'jump',
  deter: 'dispersal field',
  courseHold: 'course hold',
  exit: 'disembark',
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
  jump: ['KeyJ'],
  deter: ['KeyF'],
  courseHold: ['KeyH'],
  exit: ['Escape'],
};

/** Stable display and validation order for every remappable helm action. */
export const FLIGHT_ACTIONS = Object.freeze(Object.keys(DEFAULT_BINDINGS) as FlightAction[]);

/**
 * One physical axis on one device, and what it is wired to.
 *
 * Standard-mapping pads are read by fixed index because the API promises that
 * layout. Everything else — a flight stick, a throttle quadrant, rudder
 * pedals — promises nothing at all, so the only honest way to know which axis
 * is the rudder is to have the pilot move it and watch which number changed.
 */
export interface AxisBind {
  /** Gamepad.id of the device this axis belongs to. */
  device: string;
  index: number;
  invert: boolean;
  /** 0–0.5. Wider than a thumbstick's, because springs age. */
  deadzone: number;
  /**
   * A stick centres and reads -1..1; a throttle lever does not centre and its
   * idle end is whichever way round the manufacturer felt like wiring it. A
   * `lever` axis is therefore rescaled to 0..1 rather than treated as signed.
   */
  lever: boolean;
}

export type AxisRole = 'yaw' | 'pitch' | 'throttle' | 'strafe';
export const AXIS_ROLES: readonly AxisRole[] = ['yaw', 'pitch', 'throttle', 'strafe'];
export const AXIS_ROLE_LABELS: Record<AxisRole, string> = {
  yaw: 'turn (yaw)',
  pitch: 'nose up / down',
  throttle: 'throttle',
  strafe: 'slide left / right',
};

export interface FlightPrefs {
  bindings: Record<FlightAction, Binding>;
  /**
   * Axes assigned on a device the Gamepad API refuses to describe. Empty for
   * everybody who is not flying a HOTAS, which is almost everybody.
   */
  axes: Partial<Record<AxisRole, AxisBind>>;
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
  axes: {},
  horizonLock: false,
  invertPitch: false,
  sensitivity: 1,
  gamepad: true,
};

const STORAGE_KEY = 'tc.flight.prefs.v1';

function sanitizeAxis(raw: unknown): AxisBind | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o['device'] !== 'string' || typeof o['index'] !== 'number') return null;
  if (!Number.isInteger(o['index']) || o['index'] < 0 || o['index'] > 63) return null;
  return {
    device: o['device'],
    index: o['index'],
    invert: o['invert'] === true,
    deadzone: typeof o['deadzone'] === 'number' && Number.isFinite(o['deadzone'])
      ? Math.max(0, Math.min(0.5, o['deadzone']))
      : 0.08,
    lever: o['lever'] === true,
  };
}

function sanitize(raw: unknown): FlightPrefs {
  const prefs: FlightPrefs = {
    ...DEFAULT_PREFS,
    bindings: { ...DEFAULT_BINDINGS },
    axes: {},
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
    for (const action of FLIGHT_ACTIONS) {
      const value = (bindings as Record<string, unknown>)[action];
      // A binding that survived a bad edit must never leave an action
      // unreachable — an empty list falls back to the default rather than
      // stranding the pilot with no brake.
      if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) {
        prefs.bindings[action] = value as string[];
      }
    }
  }
  // Older builds allowed duplicate and cockpit-global keys. A malformed map
  // must not revive those collisions before the controls dialog can repair it.
  if (validateFlightBindings(prefs.bindings).length > 0) {
    prefs.bindings = { ...DEFAULT_BINDINGS };
  }


  const axes = obj['axes'];
  if (typeof axes === 'object' && axes !== null) {
    for (const role of AXIS_ROLES) {
      const bind = sanitizeAxis((axes as Record<string, unknown>)[role]);
      if (bind) prefs.axes[role] = bind;
    }
  }
  return prefs;
}

let cached: FlightPrefs | null = null;

export function flightPrefs(): FlightPrefs {
  if (cached) return cached;
  if (typeof localStorage === 'undefined') {
    cached = { ...DEFAULT_PREFS, bindings: { ...DEFAULT_BINDINGS }, axes: {} };
    return cached;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    cached = { ...DEFAULT_PREFS, bindings: { ...DEFAULT_BINDINGS }, axes: {} };
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

/** Human-readable copy for one action's currently assigned physical keys. */
export function bindingLabel(binding: Binding): string {
  return binding.map(keyLabel).join(' / ');
}

/**
 * Fixed cockpit shortcuts owned by panels rather than the flight-input map.
 *
 * KeyF is intentionally absent. It is a global shortcut only while outside
 * flight; once the helm is active it belongs to the remappable action map.
 */
export const GLOBAL_FLIGHT_SHORTCUTS: Readonly<Record<string, string>> = {
  KeyR: 'the refit bay',
  KeyK: 'helm controls',
  KeyM: 'the helm chart',
};

const SYSTEM_RESERVED_CODES: Readonly<Record<string, string>> = {
  Tab: 'keyboard focus navigation',
  ControlLeft: 'operating-system shortcuts',
  ControlRight: 'operating-system shortcuts',
  AltLeft: 'operating-system shortcuts',
  AltRight: 'operating-system shortcuts',
  MetaLeft: 'operating-system shortcuts',
  MetaRight: 'operating-system shortcuts',
};

export interface FlightBindingConflict {
  action: FlightAction;
  code: string;
  kind: 'reserved' | 'duplicate';
  message: string;
  otherAction?: FlightAction;
}

function reservedBindingReason(action: FlightAction, code: string): string | null {
  const globalOwner = GLOBAL_FLIGHT_SHORTCUTS[code];
  if (globalOwner) return `${keyLabel(code)} opens ${globalOwner}`;
  if (code === 'Escape' && action !== 'exit') {
    return 'escape closes the current panel or disembarks';
  }
  const systemOwner = SYSTEM_RESERVED_CODES[code];
  if (systemOwner) return `${keyLabel(code)} is reserved for ${systemOwner}`;
  if (/^F(?:[1-9]|1[0-2])$/.test(code)) {
    return `${keyLabel(code)} is reserved for browser or system commands`;
  }
  return null;
}

/** Find why assigning one physical key would be unsafe, if anything. */
export function flightBindingConflict(
  action: FlightAction,
  code: string,
  bindings: Readonly<Record<FlightAction, Binding>>,
): FlightBindingConflict | null {
  const reserved = reservedBindingReason(action, code);
  if (reserved) {
    return {
      action,
      code,
      kind: 'reserved',
      message: `${reserved}; choose another key for ${ACTION_LABELS[action]}.`,
    };
  }

  for (const other of FLIGHT_ACTIONS) {
    if (other === action || !bindings[other].includes(code)) continue;
    return {
      action,
      code,
      kind: 'duplicate',
      otherAction: other,
      message: `${keyLabel(code)} is already assigned to ${ACTION_LABELS[other]}.`,
    };
  }
  return null;
}

/** Validate a complete map, including panel/system reservations and duplicates. */
export function validateFlightBindings(
  bindings: Readonly<Record<FlightAction, Binding>>,
): FlightBindingConflict[] {
  const issues: FlightBindingConflict[] = [];
  const owners = new Map<string, FlightAction>();
  for (const action of FLIGHT_ACTIONS) {
    for (const code of new Set(bindings[action])) {
      const reserved = reservedBindingReason(action, code);
      if (reserved) {
        issues.push({
          action,
          code,
          kind: 'reserved',
          message: `${reserved}; choose another key for ${ACTION_LABELS[action]}.`,
        });
      }
      const owner = owners.get(code);
      if (owner && owner !== action) {
        issues.push({
          action,
          code,
          kind: 'duplicate',
          otherAction: owner,
          message: `${keyLabel(code)} is already assigned to ${ACTION_LABELS[owner]}.`,
        });
      } else {
        owners.set(code, action);
      }
    }
  }
  return issues;
}

export interface FlightModeKeyEvent {
  code: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type FlightModeKeyIntent = 'enter-flight' | 'exit-flight' | null;

/**
 * Resolve only the global mode change; every other key remains available to
 * the active helm. Open panels consume their own dismissal key first.
 */
export function flightModeKeyIntent(
  event: FlightModeKeyEvent,
  flightMode: boolean,
  overlayOpen: boolean,
  bindings: Readonly<Record<FlightAction, Binding>>,
): FlightModeKeyIntent {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || overlayOpen) return null;
  if (!flightMode) return event.code === 'KeyF' ? 'enter-flight' : null;
  return bindings.exit.includes(event.code) ? 'exit-flight' : null;
}

/** Fixed standard-pad wiring, shared with the controls copy. */
export const STANDARD_PAD_BINDINGS: Partial<Record<FlightAction, string>> = {
  thrust: 'right trigger / A',
  brake: 'left trigger / B',
  strafeLeft: 'left stick',
  strafeRight: 'left stick',
  yawLeft: 'right stick',
  yawRight: 'right stick',
  pitchUp: 'right stick',
  pitchDown: 'right stick',
  up: 'left stick',
  down: 'left stick',
  boost: 'right bumper / left stick button',
  engage: 'X',
  jump: 'left bumper',
  deter: 'Y',
  courseHold: 'menu / start',
  exit: 'view / back',
};

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
  jump: boolean;
  deter: boolean;
  courseHold: boolean;
  exit: boolean;
}

const DEADZONE = 0.16;

function axis(value: number | undefined): number {
  const v = value ?? 0;
  if (Math.abs(v) < DEADZONE) return 0;
  // Rescale past the deadzone so the first responsive degree is not a jump.
  return Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE));
}

/**
 * Every connected device, whatever shape it claims to be.
 *
 * `readPad` deliberately ignores anything that is not standard-mapping,
 * because it reads fixed indices. This does the opposite job: it hands back
 * the raw axes so a pilot can point at the one they just moved.
 */
export function readDevices(): { id: string; axes: readonly number[] }[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  const out: { id: string; axes: readonly number[] }[] = [];
  for (const pad of navigator.getGamepads()) {
    if (!pad || !pad.connected) continue;
    out.push({ id: pad.id, axes: Array.from(pad.axes) });
  }
  return out;
}

/** What the bound axes read right now, already shaped and deadzoned. */
export interface AxisState {
  yaw: number;
  pitch: number;
  strafe: number;
  /** 0..1, or null when no throttle axis is bound. */
  throttle: number | null;
  /** True while at least one bound device is actually present. */
  live: boolean;
}

export function readAxes(prefs: FlightPrefs): AxisState {
  const out: AxisState = { yaw: 0, pitch: 0, strafe: 0, throttle: null, live: false };
  const bound = prefs.axes;
  if (!bound.yaw && !bound.pitch && !bound.strafe && !bound.throttle) return out;

  const devices = readDevices();
  const value = (bind: AxisBind | undefined): number | null => {
    if (!bind) return null;
    const dev = devices.find((d) => d.id === bind.device);
    if (!dev) return null;
    const raw = dev.axes[bind.index];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    out.live = true;
    const signed = bind.invert ? -raw : raw;
    if (bind.lever) {
      // A lever's travel is its whole range, so it is rescaled rather than
      // deadzoned about a centre it does not have.
      return Math.max(0, Math.min(1, (signed + 1) / 2));
    }
    const mag = Math.abs(signed);
    if (mag <= bind.deadzone) return 0;
    return Math.sign(signed) * ((mag - bind.deadzone) / (1 - bind.deadzone));
  };

  out.yaw = value(bound.yaw) ?? 0;
  out.pitch = value(bound.pitch) ?? 0;
  out.strafe = value(bound.strafe) ?? 0;
  out.throttle = value(bound.throttle);
  return out;
}

export function readPad(): PadState {
  const empty: PadState = {
    connected: false,
    moveX: 0, moveY: 0, lookX: 0, lookY: 0,
    thrust: 0, brake: 0,
    boost: false, engage: false, jump: false, deter: false, courseHold: false, exit: false,
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
      jump: b(4), // left bumper
      deter: b(3), // Y
      courseHold: b(9), // start
      exit: b(8), // back / view
    };
  }
  return empty;
}
