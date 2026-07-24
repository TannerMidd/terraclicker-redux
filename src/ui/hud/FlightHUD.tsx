import { useEffect, useMemo, useRef } from 'react';
import { useUiBus, zoomLive } from '../fx/uiBus';
import { flightInput, flightLive } from '../scene/flightControl';
import { BAND_LABELS } from '../scene/universeLayout';
import { BRAND_ASSETS } from '../assets';
import * as audio from '../audio/audio';

/** How the console describes your velocity, in ascending order of pride. */
function speedLabel(frac: number, boosting: boolean): string {
  if (boosting && frac > 1.02) return 'highly improbable';
  if (frac < 0.03) return 'all stop';
  if (frac < 0.3) return 'loitering';
  if (frac < 0.7) return 'cruising';
  return 'making excellent time';
}

/** Range at which the console upgrades “nearest:” to “off …”. */
const OFF_RANGE = { planet: 3, assembling: 3, system: 3.2, galaxy: 9 } as const;

/**
 * The cockpit. The scene is the windshield; this is the dashboard riding its
 * lower edge — throttle, velocity in plain language, the nearest landmark,
 * and the DON'T PANIC sticker required by regulation. All gauges are driven
 * imperatively from flightLive at rAF speed, same pattern as UniverseHUD.
 */
export function FlightHUD() {
  const flight = useUiBus((b) => b.flightMode);
  if (!flight) return null;
  return <FlightHUDInner />;
}

function FlightHUDInner() {
  const root = useRef<HTMLDivElement>(null);
  const loc = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLElement>(null);
  const cruise = useRef<HTMLElement>(null);
  const label = useRef<HTMLElement>(null);
  const pct = useRef<HTMLElement>(null);
  const coarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );

  useEffect(() => {
    audio.flightHumStart();
    let raf = 0;
    let prevBoost = false;
    let audioAt = 0;
    const tick = (now: number) => {
      const f = flightLive;
      const frac = f.cap > 0 ? f.speed / f.cap : 0;
      const boosting = flightInput.boost && !f.paused;
      if (boosting && !prevBoost) audio.boostWhoosh();
      prevBoost = boosting;
      if (now - audioAt > 120) {
        audioAt = now;
        audio.flightHumSet(Math.min(1, frac), f.boostBlend);
      }
      if (fill.current) {
        fill.current.style.width = `${(Math.min(1, frac) * 100).toFixed(1)}%`;
      }
      if (cruise.current) {
        cruise.current.style.left = `${(flightInput.cruise * 100).toFixed(1)}%`;
        cruise.current.style.opacity = flightInput.cruise > 0.02 ? '1' : '0';
      }
      if (label.current) label.current.textContent = speedLabel(frac, boosting);
      if (pct.current) pct.current.textContent = `${Math.round(Math.min(1.6, frac) * 100)}%`;
      if (loc.current) {
        let line: string;
        if (f.beyond) {
          line = 'beyond the shipping lanes — there is nothing further out except more nothing';
        } else {
          const region = BAND_LABELS[zoomLive.band] ?? 'space';
          const near = f.nearest;
          line = near
            ? near.d <= OFF_RANGE[near.kind]
              ? `${region} · holding off ${near.label}`
              : `${region} · nearest: ${near.label}`
            : region;
        }
        if (loc.current.textContent !== line) loc.current.textContent = line;
      }
      root.current?.classList.toggle('boosting', f.boostBlend > 0.25);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audio.flightHumStop();
    };
  }, []);

  return (
    <div ref={root} className="flight-layer">
      <div className="fh-vignette" aria-hidden />
      <div className="fh-streaks" aria-hidden />
      <div className="fh-reticle" aria-hidden>
        <i />
      </div>
      <div className="fh-top">
        <span className="fh-chip">manual flight · the company runabout</span>
        <button className="fh-exit" onClick={() => useUiBus.getState().setFlightMode(false)}>
          disembark <kbd>esc</kbd>
        </button>
      </div>
      <div className="fh-console">
        <img className="fh-panic" src={BRAND_ASSETS.dontPanic} alt="DON'T PANIC" draggable={false} />
        <div className="fh-mid">
          <div ref={loc} className="fh-loc">
            the planet
          </div>
          <div className="fh-throttle">
            <i ref={fill} />
            <em ref={cruise} />
          </div>
          <div className="fh-speedrow">
            <b ref={label}>all stop</b>
            <span ref={pct} className="num">
              0%
            </span>
          </div>
        </div>
        <div className="fh-leds" aria-hidden>
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="fh-legend">
        {coarse ? (
          <>left thumb steers · right thumb thrusts · double-tap right to boost · disembark up top</>
        ) : (
          <>
            mouse steers · <b>W</b> thrust · <b>S</b> brake · <b>A</b>/<b>D</b> slide ·{' '}
            <b>space</b>/<b>C</b> rise/sink · <b>shift</b> boost · scroll trims cruise ·{' '}
            <b>esc</b> disembark
          </>
        )}
      </div>
    </div>
  );
}
