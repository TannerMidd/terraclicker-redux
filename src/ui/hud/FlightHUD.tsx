import { useEffect, useMemo, useRef, useState } from 'react';
import { useUiBus, zoomLive } from '../fx/uiBus';
import { flightInput, flightLive, mouseSteer } from '../scene/flightControl';
import { BAND_LABELS } from '../scene/universeLayout';
import { BRAND_ASSETS } from '../assets';
import { REFITS } from '../../content/refit';
import { DEEP_FIELD } from '../../content/deepField';
import { refitCost } from '../../engine/deepField';
import { actions, useGame } from '../../state/store';
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

/** Circumference of the scan ring (r=26), for the dash-offset sweep. */
const SCAN_C = 2 * Math.PI * 26;

/** Inside this height above a surface, the console reports altitude instead. */
const ALTITUDE_RANGE = 3;

/** Visual radius of the steering ring, in px. */
const STICK_R = 46;

/** Range readout: fine near a thing, coarse when it is a commute. */
export function rangeLabel(d: number): string {
  if (d < 10) return `${d.toFixed(1)}u`;
  return `${Math.round(d)}u`;
}

/**
 * The cockpit. The scene is the windshield; everything here is the runabout
 * built around it — canopy frame, dashboard, sensor readout, and the DON'T
 * PANIC sticker required by regulation. All gauges are driven imperatively
 * from flightLive at rAF speed, same pattern as UniverseHUD.
 */
export function FlightHUD() {
  const flight = useUiBus((b) => b.flightMode);
  if (!flight) return null;
  return <FlightHUDInner />;
}

/**
 * The canopy: an SVG frame whose window is the scene. Drawn in a fixed
 * 1000×600 space and cropped to the viewport, so the struts keep their
 * proportions on any screen instead of smearing on ultrawides.
 */
const WINDOW_PATH =
  'M 74,44 C 312,-8 688,-8 926,44 C 968,182 968,388 926,528 C 688,584 312,584 74,528 C 32,388 32,182 74,44 Z';
const OUTER_PATH = 'M -40,-40 H 1040 V 640 H -40 Z';

function Canopy() {
  return (
    <svg
      className="fh-canopy"
      viewBox="0 0 1000 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="fhFrameFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#171c2a" />
          <stop offset="0.4" stopColor="#080b12" />
          <stop offset="1" stopColor="#1a2030" />
        </linearGradient>
        <linearGradient id="fhStrut" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#232a3c" />
          <stop offset="1" stopColor="#0c1018" />
        </linearGradient>
      </defs>
      {/* The frame is everything outside the window. */}
      <path
        d={`${OUTER_PATH} ${WINDOW_PATH}`}
        fillRule="evenodd"
        fill="url(#fhFrameFill)"
      />
      {/* Glass lip — the edge where the canopy catches the running lights. */}
      <path
        d={WINDOW_PATH}
        fill="none"
        stroke="rgba(150,182,236,0.26)"
        strokeWidth="2"
      />
      <path
        d={WINDOW_PATH}
        fill="none"
        stroke="rgba(120,220,200,0.10)"
        strokeWidth="6"
      />
      {/* Corner fillets, hugging the glass edge. Deliberately no centre
          strut: the reticle lives there and a pillar through it would be
          the single most annoying design decision available. */}
      <path
        d="M 74,44 C 160,26 250,14 340,8 L 330,26 C 244,33 168,45 100,62 Z"
        fill="url(#fhStrut)"
      />
      <path
        d="M 926,44 C 840,26 750,14 660,8 L 670,26 C 756,33 832,45 900,62 Z"
        fill="url(#fhStrut)"
      />
      <path
        d="M 74,528 C 160,546 250,558 340,564 L 330,546 C 244,539 168,527 100,510 Z"
        fill="url(#fhStrut)"
        opacity="0.85"
      />
      <path
        d="M 926,528 C 840,546 750,558 660,564 L 670,546 C 756,539 832,527 900,510 Z"
        fill="url(#fhStrut)"
        opacity="0.85"
      />
    </svg>
  );
}

function RefitConsole({ onClose }: { onClose: () => void }) {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const salvage = s.expedition.salvage;
  const found = Object.keys(s.expedition.discovered).length;

  return (
    <div className="fh-refit" role="dialog" aria-label="Refit the runabout">
      <div className="fr-head">
        <div>
          <div className="fr-title">Sirius Cybernetics Refit Bay</div>
          <div className="fr-sub">
            {found}/{DEEP_FIELD.length} landmarks filed · salvage is good for nothing else
          </div>
        </div>
        <div className="fr-salvage">
          <b>{salvage}</b>
          <span>salvage</span>
        </div>
      </div>
      <div className="fr-list">
        {REFITS.map((def) => {
          const rank = s.expedition.refits[def.id] ?? 0;
          const cost = refitCost(s.expedition, def.id);
          const maxed = cost === null;
          const afford = cost !== null && salvage >= cost;
          return (
            <div key={def.id} className={`fr-item ${maxed ? 'maxed' : ''}`}>
              <div className="fr-item-head">
                <span className="fr-name">{def.name}</span>
                <span className="fr-rank">
                  {Array.from({ length: def.maxRank }, (_, i) => (
                    <i key={i} className={i < rank ? 'on' : ''} />
                  ))}
                </span>
              </div>
              <div className="fr-effect">{def.effect(rank)}</div>
              <div className="fr-guide">{def.guide}</div>
              <button
                className="fr-buy"
                disabled={maxed || !afford}
                onClick={() => actions.buyRefit(def.id)}
              >
                {maxed ? 'fitted' : `${cost} salvage`}
              </button>
            </div>
          );
        })}
      </div>
      <button className="fr-close" onClick={onClose}>
        back to the helm <kbd>r</kbd>
      </button>
    </div>
  );
}

function FlightHUDInner() {
  const root = useRef<HTMLDivElement>(null);
  const loc = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLElement>(null);
  const cruise = useRef<HTMLElement>(null);
  const label = useRef<HTMLElement>(null);
  const pct = useRef<HTMLElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const targetName = useRef<HTMLElement>(null);
  const targetSub = useRef<HTMLElement>(null);
  const scanArc = useRef<SVGCircleElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const contacts = useRef<HTMLDivElement>(null);
  /** Live sensor rows, so distances update without rebuilding the list. */
  const rows = useRef<
    { id: string; scanned: boolean; boarded: boolean; dist: HTMLElement }[]
  >([]);
  const [refit, setRefit] = useState(false);
  const coarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );
  const salvage = useGame((g) => g.s.expedition.salvage);

  // R opens the refit bay. Everything else at the helm is flightControl's.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'KeyR') setRefit((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    audio.flightHumStart();
    let raf = 0;
    let prevBoost = false;
    let prevJump = flightLive.jumpNonce;
    let stickOn = false;
    let audioAt = 0;
    const tick = (now: number) => {
      const f = flightLive;
      const frac = f.cap > 0 ? f.speed / f.cap : 0;
      const boosting = flightInput.boost && !f.paused;
      if (boosting && !prevBoost) audio.boostWhoosh();
      prevBoost = boosting;
      if (f.jumpNonce !== prevJump) {
        prevJump = f.jumpNonce;
        audio.boostWhoosh();
        useUiBus.getState().flash();
      }
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
        } else if (f.altitude < ALTITUDE_RANGE) {
          // Close to something solid: height above ITS surface says far more
          // about scale than a distance from the middle of the universe does.
          line = `${f.altitudeOf} · altitude ${f.altitude.toFixed(2)}`;
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

      // Glass parallax: the canopy is bolted to your head, so what shifts is
      // the glare across it as you steer.
      if (glare.current) {
        glare.current.style.transform = `translate(${(-flightInput.steerX * 26).toFixed(1)}px, ${(-flightInput.steerY * 16).toFixed(1)}px)`;
      }

      // The stick. Hold-to-steer is not discoverable without showing it, so
      // it draws itself where you pressed and follows the pointer.
      if (stick.current) {
        const on = mouseSteer.active;
        if (on !== stickOn) {
          stickOn = on;
          stick.current.style.opacity = on ? '1' : '0';
        }
        if (on) {
          stick.current.style.transform = `translate(${mouseSteer.x0}px, ${mouseSteer.y0}px)`;
          const knob = stick.current.firstElementChild as HTMLElement | null;
          if (knob) {
            knob.style.transform = `translate(${(flightInput.steerX * STICK_R).toFixed(1)}px, ${(flightInput.steerY * STICK_R).toFixed(1)}px)`;
          }
        }
      }

      // Target block: name, verb, and the scan sweep welded to the reticle.
      const locked = f.locked;
      if (target.current) {
        target.current.classList.toggle('on', locked !== null);
        target.current.classList.toggle('resolved', Boolean(locked?.scanned));
      }
      if (targetName.current) {
        const text = locked ? locked.label : '';
        if (targetName.current.textContent !== text) targetName.current.textContent = text;
      }
      if (targetSub.current) {
        let text = '';
        if (locked) {
          const dist = `${locked.d.toFixed(1)}u`;
          if (locked.unreachable) text = `${dist} · and it will stay that way`;
          else if (f.prompt) text = `${dist} · hold E to ${f.prompt.label}`;
          else if (locked.boarded) text = `${dist} · already boarded`;
          else text = dist;
        }
        if (targetSub.current.textContent !== text) targetSub.current.textContent = text;
      }
      if (scanArc.current) {
        const p = f.scanProgress;
        scanArc.current.style.opacity = p > 0.005 ? '1' : '0';
        scanArc.current.style.strokeDashoffset = `${SCAN_C * (1 - p)}`;
      }

      // Sensor list. The ROWS are rebuilt only when the set of contacts or
      // their state changes; the distances update in place every frame. The
      // previous version built a join()'d key string from every contact each
      // frame, which was ~1000 string allocations a second on its own.
      if (contacts.current) {
        const list = f.contacts;
        const n = Math.min(5, list.length);
        let structural = n !== rows.current.length;
        if (!structural) {
          for (let i = 0; i < n; i++) {
            const c = list[i]!;
            const row = rows.current[i]!;
            if (row.id !== c.id || row.scanned !== c.scanned || row.boarded !== c.boarded) {
              structural = true;
              break;
            }
          }
        }
        if (structural) {
          contacts.current.replaceChildren();
          rows.current = [];
          for (let i = 0; i < n; i++) {
            const c = list[i]!;
            const row = document.createElement('div');
            row.className =
              `fc-row${c.scanned ? ' known' : ''}${c.boarded ? ' done' : ''}` +
              `${c.rumoured && !c.scanned ? ' rumoured' : ''}`;
            const name = document.createElement('span');
            name.textContent = c.label;
            const dist = document.createElement('b');
            row.append(name, dist);
            contacts.current.appendChild(row);
            rows.current.push({ id: c.id, scanned: c.scanned, boarded: c.boarded, dist });
          }
        }
        for (let i = 0; i < n; i++) {
          const text = rangeLabel(list[i]!.d);
          const slot = rows.current[i]!;
          if (slot.dist.textContent !== text) slot.dist.textContent = text;
        }
        contacts.current.parentElement?.classList.toggle('empty', list.length === 0);
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
      <Canopy />
      <div ref={glare} className="fh-glare" aria-hidden />
      <div ref={stick} className="fh-stick" aria-hidden>
        <i />
      </div>
      <div className="fh-vignette" aria-hidden />
      <div className="fh-streaks" aria-hidden />

      <div className="fh-reticle" aria-hidden>
        <i />
        <svg className="fh-scan" viewBox="0 0 60 60">
          <circle
            ref={scanArc}
            cx="30"
            cy="30"
            r="26"
            fill="none"
            strokeDasharray={SCAN_C}
            strokeDashoffset={SCAN_C}
            transform="rotate(-90 30 30)"
          />
        </svg>
      </div>

      <div ref={target} className="fh-target" aria-live="polite">
        <b ref={targetName} />
        <span ref={targetSub} />
      </div>

      <div className="fh-top">
        <span className="fh-chip">manual flight · the company runabout</span>
        <button className="fh-exit" onClick={() => useUiBus.getState().setFlightMode(false)}>
          disembark <kbd>esc</kbd>
        </button>
      </div>

      <div className="fh-sensors empty">
        <div className="fs-head">
          sensors
          <span>{salvage} salvage</span>
        </div>
        <div ref={contacts} className="fs-list" />
        <div className="fs-none">no contacts</div>
        <button className="fs-refit" onClick={() => setRefit(true)}>
          refit <kbd>r</kbd>
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

      {coarse && (
        <button
          className="fh-engage"
          onPointerDown={() => {
            flightInput.engage = true;
          }}
          onPointerUp={() => {
            flightInput.engage = false;
          }}
          onPointerCancel={() => {
            flightInput.engage = false;
          }}
        >
          engage
        </button>
      )}

      <div className="fh-legend">
        {coarse ? (
          <>left thumb steers · right thumb thrusts · double-tap right to boost · hold engage to scan</>
        ) : (
          <>
            <b>hold left mouse</b> to steer · <b>W</b> thrust · <b>S</b> brake · <b>A</b>/<b>D</b> slide ·{' '}
            <b>space</b>/<b>C</b> rise/sink · <b>shift</b> boost · <b>E</b> scan/board ·{' '}
            <b>J</b> jump · <b>R</b> refit · <b>esc</b> disembark
          </>
        )}
      </div>

      {refit && <RefitConsole onClose={() => setRefit(false)} />}
    </div>
  );
}
