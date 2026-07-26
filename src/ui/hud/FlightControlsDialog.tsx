import { useEffect, useRef, useState } from 'react';
import {
  ACTION_LABELS,
  AXIS_ROLES,
  AXIS_ROLE_LABELS,
  DEFAULT_BINDINGS,
  flightPrefs,
  keyLabel,
  readDevices,
  readPad,
  resetFlightPrefs,
  saveFlightPrefs,
  type AxisRole,
  type FlightAction,
  type FlightPrefs,
} from '../scene/flightBindings';

/**
 * Helm settings. Everything here is an accessibility control before it is a
 * preference: a fixed WASD layout assumes a keyboard and a hand, a rolling
 * horizon makes some people ill, and a mouse-only helm excludes anyone who
 * cannot hold one steady.
 *
 * Written in the register of an equipment requisition, because that is what it
 * is.
 */
/**
 * Wiring up a flight stick.
 *
 * A HOTAS enumerates as a gamepad and then declines to say what any of its
 * axes are for, so there is no table of defaults that could possibly be
 * right. The only honest method is the one every flight sim has used for
 * thirty years: ask the pilot to move the thing they mean, watch which number
 * changed most, and write that down.
 *
 * The throttle is captured as a LEVER — rescaled across its whole travel
 * rather than deadzoned about a centre it does not have — because a throttle
 * that idles at -1 and reads 0 at half open is not a stick and cannot be
 * treated as one.
 */
function StickSection({
  prefs,
  update,
}: {
  prefs: FlightPrefs;
  update: (next: FlightPrefs) => void;
}) {
  const [devices, setDevices] = useState<{ id: string; axes: readonly number[] }[]>([]);
  const [capturing, setCapturing] = useState<AxisRole | null>(null);
  const baseline = useRef<Map<string, readonly number[]>>(new Map());

  // Poll while the dialog is open: an axis only reveals itself by moving.
  useEffect(() => {
    const id = window.setInterval(() => setDevices(readDevices()), 60);
    return () => window.clearInterval(id);
  }, []);

  // Take a snapshot when capture starts; whatever travels furthest from it wins.
  useEffect(() => {
    if (!capturing) {
      baseline.current.clear();
      return;
    }
    const snap = new Map<string, readonly number[]>();
    for (const d of readDevices()) snap.set(d.id, [...d.axes]);
    baseline.current = snap;
  }, [capturing]);

  useEffect(() => {
    if (!capturing) return;
    let best: { device: string; index: number; travel: number; from: number; to: number } | null = null;
    for (const d of devices) {
      const base = baseline.current.get(d.id);
      if (!base) continue;
      for (let i = 0; i < d.axes.length; i++) {
        const from = base[i] ?? 0;
        const to = d.axes[i] ?? 0;
        const travel = Math.abs(to - from);
        if (travel > 0.35 && (!best || travel > best.travel)) {
          best = { device: d.id, index: i, travel, from, to };
        }
      }
    }
    if (!best) return;
    const lever = capturing === 'throttle';
    update({
      ...prefs,
      axes: {
        ...prefs.axes,
        [capturing]: {
          device: best.device,
          index: best.index,
          // Pushed the axis negative to mean "more"? Then it is inverted.
          invert: lever ? best.to < best.from : best.to < best.from,
          deadzone: lever ? 0 : 0.08,
          lever,
        },
      },
    });
    setCapturing(null);
  }, [devices, capturing, prefs, update]);

  const nonStandard = devices.filter((d) => d.axes.length > 0);
  if (nonStandard.length === 0 && Object.keys(prefs.axes).length === 0) return null;

  return (
    <div className="fc-stick">
      <div className="fc-stick-head">
        <b>Flight stick, throttle, pedals</b>
        <em>
          {nonStandard.length > 0
            ? nonStandard.map((d) => d.id.replace(/\s*\(Vendor.*$/, '')).join(' · ')
            : 'Nothing connected. Assignments are kept for when it is.'}
        </em>
      </div>
      <p className="fc-note">
        These devices describe themselves to the browser as a list of numbers and nothing
        else, so the department cannot guess which one is the rudder. Choose a control, then
        move the axis you mean.
      </p>
      {AXIS_ROLES.map((role) => {
        const bind = prefs.axes[role];
        return (
          <div key={role} className="fc-row">
            <span className="fc-label">{AXIS_ROLE_LABELS[role]}</span>
            <span className="fc-axis-controls">
              {bind && (
                <button
                  className="fc-axis-invert"
                  title="Reverse this axis"
                  onClick={() =>
                    update({
                      ...prefs,
                      axes: { ...prefs.axes, [role]: { ...bind, invert: !bind.invert } },
                    })
                  }
                >
                  {bind.invert ? 'reversed' : 'normal'}
                </button>
              )}
              <button
                className={`fc-key${capturing === role ? ' listening' : ''}`}
                onClick={() => setCapturing(capturing === role ? null : role)}
              >
                {capturing === role
                  ? 'move it now…'
                  : bind
                    ? `axis ${bind.index}`
                    : 'unassigned'}
              </button>
              {bind && (
                <button
                  className="fc-axis-clear"
                  title="Unassign"
                  onClick={() => {
                    const axes = { ...prefs.axes };
                    delete axes[role];
                    update({ ...prefs, axes });
                  }}
                >
                  ×
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FlightControlsDialog({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<FlightPrefs>(() => ({
    ...flightPrefs(),
    bindings: { ...flightPrefs().bindings },
  }));
  const [capturing, setCapturing] = useState<FlightAction | null>(null);
  const [padSeen, setPadSeen] = useState(false);

  const update = (next: FlightPrefs) => {
    setPrefs(next);
    saveFlightPrefs(next);
  };

  // Capture the next physical key for whichever action is listening.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setCapturing(null);
        return;
      }
      update({ ...prefs, bindings: { ...prefs.bindings, [capturing]: [e.code] } });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, prefs]);

  // A pad that is plugged in but idle is still worth acknowledging.
  useEffect(() => {
    const id = window.setInterval(() => setPadSeen(readPad().connected), 500);
    return () => window.clearInterval(id);
  }, []);

  const actions = Object.keys(DEFAULT_BINDINGS) as FlightAction[];

  return (
    <div className="fh-refit fh-controls" role="dialog" aria-label="Helm controls">
      <div className="fr-head">
        <b>Helm — Controls and Comfort</b>
        <button className="fr-close" onClick={onClose}>
          close <kbd>esc</kbd>
        </button>
      </div>

      <p className="fc-note">
        Requisition form 11-C. Any physical key may be assigned to any control. The
        department notes that it has never received this form completed correctly and has
        stopped expecting to.
      </p>

      <div className="fc-binds">
        {actions.map((action) => (
          <div key={action} className="fc-row">
            <span className="fc-label">{ACTION_LABELS[action]}</span>
            <button
              className={`fc-key${capturing === action ? ' listening' : ''}`}
              onClick={() => setCapturing(action)}
            >
              {capturing === action
                ? 'press a key…'
                : prefs.bindings[action].map(keyLabel).join(' / ')}
            </button>
          </div>
        ))}
      </div>

      <StickSection prefs={prefs} update={update} />

      <div className="fc-toggles">
        <label className="fc-toggle">
          <input
            type="checkbox"
            checked={prefs.horizonLock}
            onChange={(e) => update({ ...prefs, horizonLock: e.target.checked })}
          />
          <span>
            <b>Lock the horizon</b>
            <em>The hull stops banking into turns. Recommended if turning makes you queasy.</em>
          </span>
        </label>

        <label className="fc-toggle">
          <input
            type="checkbox"
            checked={prefs.invertPitch}
            onChange={(e) => update({ ...prefs, invertPitch: e.target.checked })}
          />
          <span>
            <b>Invert vertical steering</b>
            <em>As flight controls have worked since long before there was anywhere to fly.</em>
          </span>
        </label>

        <label className="fc-toggle">
          <input
            type="checkbox"
            checked={prefs.gamepad}
            onChange={(e) => update({ ...prefs, gamepad: e.target.checked })}
          />
          <span>
            <b>Accept a gamepad</b>
            <em>
              Left stick slides, right stick steers, triggers throttle.{' '}
              {padSeen ? 'One is connected.' : 'None detected.'}
            </em>
          </span>
        </label>

        <div className="fc-slider">
          <label htmlFor="fc-sens">
            <b>Steering sensitivity</b> <span>{prefs.sensitivity.toFixed(2)}×</span>
          </label>
          <input
            id="fc-sens"
            type="range"
            min={0.3}
            max={2}
            step={0.05}
            value={prefs.sensitivity}
            onChange={(e) => update({ ...prefs, sensitivity: Number(e.target.value) })}
          />
        </div>
      </div>

      <button
        className="fc-reset"
        onClick={() => {
          resetFlightPrefs();
          setPrefs({ ...flightPrefs(), bindings: { ...flightPrefs().bindings } });
        }}
      >
        restore the factory arrangement
      </button>
    </div>
  );
}
