import { useEffect, useState } from 'react';
import {
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  flightPrefs,
  keyLabel,
  readPad,
  resetFlightPrefs,
  saveFlightPrefs,
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
