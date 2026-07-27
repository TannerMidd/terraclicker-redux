import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useUiBus, zoomLive } from '../fx/uiBus';
import {
  flightInput,
  flightLive,
  helmChart,
  interdiction,
  mouseSteer,
  toggleAutopilot,
  toggleFlightCamera,
} from '../scene/flightControl';
import { bearingLabel, etaLabel } from '../../engine/navigation';
import { handlingFor, handlingLabel } from '../../engine/handling';
import { FlightControlsDialog } from './FlightControlsDialog';
import { flightPrefs, keyLabel, type FlightAction } from '../scene/flightBindings';
import { FirstSortie } from './FirstSortie';
import { SubEthaTicker } from './SubEthaTicker';
import { BAND_LABELS } from '../scene/universeLayout';
import { BRAND_ASSETS, COCKPIT_ASSETS } from '../assets';
import { REFITS } from '../../content/refit';
import { CERTIFICATIONS, CERT_THRESHOLDS } from '../../content/certifications';
import { certFirstCount, certRank } from '../../engine/certifications';
import { DEEP_FIELD } from '../../content/deepField';
import { refitCost } from '../../engine/deepField';
import { currentManifestLeg, deterrentPower } from '../../engine/freight';
import { FREIGHT_BY_ID } from '../../content/freight';
import { actions, useGame } from '../../state/store';
import * as audio from '../audio/audio';
import { waypointId } from '../../engine/waypoints';
import { INFRASTRUCTURE, SHIP_ROLES, type InfrastructureDef } from '../../content/loadouts';
import { ATTENDANCE_SALVAGE, attendable } from '../../engine/bridge';
import { C } from '../../content/constants';

/** How the console describes your velocity, in ascending order of pride. */
function speedLabel(frac: number, boosting: boolean, station: boolean): string {
  if (boosting && frac > 1.02) return 'highly improbable';
  // The helm has been taken away from you, briefly and for a good reason. A
  // ship that stops on its own without saying so is a ship that feels broken.
  if (station) return frac < 0.03 ? 'holding station' : 'holding station…';
  if (frac < 0.03) return 'all stop';
  if (frac < 0.3) return 'loitering';
  if (frac < 0.7) return 'cruising';
  return 'making excellent time';
}

/**
 * The chart, at the helm.
 *
 * Flying into a galaxy meant flying at a smear and hoping a system turned up,
 * because leaving the seat was the only way to find out where anything was.
 * Every row here is somewhere you can actually go, nearest first, with the
 * turn you need and the range to it — and pinning one drives the same ribbon
 * and the same course hold as a pin made at the desk.
 */
function HelmChart({ onClose }: { onClose: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 220);
    return () => window.clearInterval(id);
  }, []);

  const rows = helmChart();
  const pinned = useGame.getState().s.expedition.pinned;
  const pinnedRow = rows.find((row) => row.pinned);
  const canAutopilot = Boolean(pinnedRow?.known && flightLive.nav);

  return (
    <div className="fh-chart" role="dialog" aria-label="Chart">
      <div className="fs-head">
        chart
        <span>{rows.length} places</span>
        <button className="fc-chart-close" onClick={onClose} aria-label="Close the chart">×</button>
      </div>
      <div className="fh-chart-list">
        {rows.length === 0 && <div className="fs-none">nothing charted yet</div>}
        {rows.map((r) => {
          // Which way to turn, said as an instruction rather than a number.
          const deg = Math.round((r.bearing * 180) / Math.PI);
          const turn = Math.abs(deg) < 6
            ? 'dead ahead'
            : `${Math.abs(deg)}° ${deg < 0 ? 'port' : 'starboard'}`;
          const up = Math.round((r.elevation * 180) / Math.PI);
          return (
            <button
              key={r.id}
              className={`fh-chart-row${r.pinned ? ' pinned' : ''}${r.known ? '' : ' unknown'}`}
              onClick={() => actions.setWaypoint(pinned === r.id ? null : r.id)}
              aria-pressed={r.pinned}
            >
              <span className="fcr-main">
                <b>{r.label}</b>
                <em>{r.detail}</em>
              </span>
              <span className="fcr-nav">
                <b>{r.distance < 1000 ? `${r.distance.toFixed(0)}u` : `${(r.distance / 1000).toFixed(1)}ku`}</b>
                <em>
                  {turn}
                  {Math.abs(up) >= 6 ? ` · ${Math.abs(up)}° ${up < 0 ? 'down' : 'up'}` : ''}
                </em>
              </span>
              <span className="fcr-pin">{r.pinned ? 'PINNED' : 'PIN'}</span>
            </button>
          );
        })}
      </div>
      <div className="fh-chart-foot">
        <span>Pin a known place, then the ship aligns, cruises, brakes, and stops there. Any helm input returns to manual.</span>
        <button
          className={`fh-chart-autopilot${flightLive.courseHold ? ' on' : ''}`}
          disabled={!canAutopilot}
          aria-label={flightLive.courseHold ? 'Disengage destination autopilot' : 'Engage autopilot to the pinned route'}
          aria-pressed={flightLive.courseHold}
          onClick={() => toggleAutopilot()}
        >
          {flightLive.courseHold
            ? `DISENGAGE · ${flightLive.autopilotPhase.toUpperCase()}`
            : `ENGAGE AUTOPILOT · ${boundKey('courseHold')}`}
        </button>
      </div>
    </div>
  );
}

/** Whatever key currently performs an action, as the console would say it. */
function boundKey(action: FlightAction): string {
  return keyLabel(flightPrefs().bindings[action][0] ?? '').toUpperCase();
}

function engageKey(): string {
  return boundKey('engage');
}

function directionLabel(bearing: number, elevation: number): string {
  const deg = Math.round(Math.abs(bearing) * 180 / Math.PI);
  const elev = Math.round(Math.abs(elevation) * 180 / Math.PI);
  const horizontal = deg < 6 ? '↑' : bearing < 0 ? `↖ ${deg}°` : `↗ ${deg}°`;
  if (elev < 7) return horizontal;
  return `${horizontal} ${elevation < 0 ? '↓' : '↑'}${elev}°`;
}

function infrastructureEffect(def: InfrastructureDef): string {
  const pct = Math.round((def.effect.v - 1) * 100);
  if (def.effect.kind === 'sensors') return `+${pct}% sensor reach each`;
  if (def.effect.kind === 'capacity') return `+${pct}% cargo capacity each`;
  return `+${pct}% rig bank capacity each`;
}

/** Recent filings remain visible at the helm, where their effects occurred. */
function FlightEventFeed() {
  const toasts = useUiBus((bus) => bus.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack fh-flight-events" role="status" aria-live="polite">
      {toasts.slice(-2).map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          {toast.kicker && <div className="t-kicker">{toast.kicker}</div>}
          <div className="t-title">{toast.title}</div>
          {toast.body && <div className="t-body">{toast.body}</div>}
        </div>
      ))}
    </div>
  );
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
/**
 * What is in the hold, at the helm, where the flying happens. Deliberately
 * small: the manifest matters most as the reason the ship feels heavy and as
 * the destination you are aiming at.
 */
function ManifestStrip() {
  const rev = useGame((game) => game.rev);
  void rev;
  const state = useGame.getState().s;
  const leg = currentManifestLeg(state);
  if (!leg) {
    const pin = state.expedition.pinned;
    const request = attendable(state)
      .find((candidate) => waypointId('world', candidate.world) === pin);
    if (!request) return null;
    return (
      <div className="fh-manifest attendance" role="status">
        <span className="fm-label">personal attendance</span>
        <span className="fm-step">ARRIVE TO RESOLVE</span>
        <span className="fm-to">{request.name}</span>
        <span className="fm-pay">+{ATTENDANCE_SALVAGE} salvage</span>
      </div>
    );
  }
  const manifest = leg.manifest;
  const def = FREIGHT_BY_ID[manifest.id];
  const waiting = leg.phase === 'collect';
  const hold = handlingLabel(handlingFor(state.expedition));
  const objectiveId = waypointId('job', manifest.uid);
  const target = helmChart(500).find((row) => row.id === objectiveId);

  return (
    <div className={`fh-manifest${waiting ? ' waiting' : ''}`}>
      <span className="fm-label">{def?.label ?? manifest.id}</span>
      <span className="fm-step">{waiting ? '1 · COLLECT' : '2 · DELIVER'}</span>
      <span className="fm-to">{leg.targetName}</span>
      {target && (
        <button
          className={`fm-pin${target.pinned ? ' on' : ''}`}
          onClick={() => actions.setWaypoint(target.pinned ? null : target.id)}
          title={`Carry a bearing to ${target.label}`}
        >
          {target.pinned
            ? `${target.distance < 1000 ? `${target.distance.toFixed(0)}u` : `${(target.distance / 1000).toFixed(1)}ku`} · pinned`
            : 'pin objective'}
        </button>
      )}
      {!waiting && hold && <span className="fm-hold">{hold}</span>}
      <span className="fm-pay">{manifest.salvage} salvage</span>
    </div>
  );
}
/**
 * A patrol has taken an interest. Three ways out, all of them things the ship
 * can already do — nothing here shoots at anybody.
 */
function InterdictionBanner() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((value) => value + 1), 160);
    return () => window.clearInterval(id);
  }, []);
  if (!interdiction.active) return null;
  const power = deterrentPower(useGame.getState().s.expedition);
  const seconds = Math.max(0, Math.ceil(interdiction.remainingMs / 1000));
  return (
    <div className="fh-interdiction" role="status" aria-live="assertive">
      <div className="fi-kicker">customs pursuit</div>
      <div className="fi-status">
        patrol {Math.round(interdiction.gap)}u astern · {seconds}s until they give up
      </div>
      <div className="fi-line">
        Outrun them, stop and surrender the hold, or
        {power > 0 ? <> hold <kbd>{boundKey('deter')}</kbd> to disperse them.</> : ' fit a Dispersal Field for a third option.'}
      </div>
      <div className="fi-escape" aria-hidden>
        <i style={{ width: `${Math.min(100, interdiction.gap / 95 * 100)}%` }} />
      </div>
      {power > 0 && (
        <div className="fi-bar" aria-hidden>
          <i style={{ width: `${Math.min(100, interdiction.dispersal * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
/**
 * Civil Navigation, Provisional — the bearing ribbon.
 *
 * The cockpit could always tell you what was near. It could never tell you
 * which way the thing you actually care about is, which is the question a
 * pilot asks roughly once a second. The ribbon is a horizon-relative strip:
 * the marker slides to port or starboard by the bearing, and the readout
 * underneath carries distance, ETA, and a warning when there is no longer
 * enough room to stop.
 *
 * Updated from `flightLive` at rAF speed rather than through React state, the
 * same pattern as the rest of this file — a HUD that re-renders sixty times a
 * second is a HUD that costs more than the scene it sits on.
 */
function NavRibbon() {
  const wrap = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLElement>(null);
  const readout = useRef<HTMLElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const nav = flightLive.nav;
      const el = wrap.current;
      if (!el) return;

      if (!nav) {
        if (el.classList.contains('on')) el.classList.remove('on');
        return;
      }
      if (!el.classList.contains('on')) el.classList.add('on');

      // Position the marker in the ribbon itself. Transform percentages are
      // relative to the nine-pixel marker, which used to make a 420px ribbon
      // move by only a few pixels and turned every bearing into "ahead".
      const clamped = Math.max(-1, Math.min(1, nav.bearing / (Math.PI * 0.6)));
      if (marker.current) {
        marker.current.style.left = `${(50 + clamped * 48).toFixed(2)}%`;
        marker.current.classList.toggle('astern', Math.abs(nav.bearing) > Math.PI * 0.6);
      }
      if (name.current && name.current.textContent !== flightLive.navLabel) {
        name.current.textContent = flightLive.navLabel;
      }
      if (readout.current) {
        const elevation = Math.round((nav.elevation * 180) / Math.PI);
        const vertical = Math.abs(elevation) < 4
          ? 'level'
          : `${Math.abs(elevation)}° ${elevation < 0 ? 'down' : 'up'}`;
        const compact = nav.overshooting
          ? `${rangeLabel(nav.distance)} · ${directionLabel(nav.bearing, nav.elevation)} · BRAKE`
          : `${rangeLabel(nav.distance)} · ${directionLabel(nav.bearing, nav.elevation)} · ${etaLabel(nav.etaSeconds)}`;
        const verbose = nav.overshooting
          ? `${rangeLabel(nav.distance)}, ${bearingLabel(nav.bearing)}, ${vertical}, too fast to stop`
          : `${rangeLabel(nav.distance)}, ${bearingLabel(nav.bearing)}, ${vertical}, ${etaLabel(nav.etaSeconds)}`;
        if (readout.current.textContent !== compact) readout.current.textContent = compact;
        if (readout.current.getAttribute('aria-label') !== verbose) readout.current.setAttribute('aria-label', verbose);
      }
      el.classList.toggle('hot', nav.overshooting);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrap} className="fh-nav">
      <div className="fn-strip" aria-hidden>
        <i className="fn-centre" />
        <div ref={marker} className="fn-marker" />
      </div>
      <b ref={name} />
      <span ref={readout} />
    </div>
  );
}

export function FlightHUD() {
  const flight = useUiBus((b) => b.flightMode);
  // Groundside the surface HUD takes over — including the entry dive, which
  // keeps the canopy but none of the sensor chrome (SurfaceHUD draws it).
  const grounded = useUiBus((b) => b.groundfall !== null);
  if (!flight || grounded) return null;
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

/**
 * `steady` drops the fade-in. An arrival earns an entrance; swapping back
 * from the chase camera is a change of seat, and a frame that fades up
 * every time you press the view key reads as a fault in the glass.
 */
export function Canopy({ steady = false }: { steady?: boolean }) {
  return (
    <svg
      className={`fh-canopy${steady ? ' steady' : ''}`}
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
            {found}/{DEEP_FIELD.length} landmarks filed · salvage funds the ship and its flight network
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

      <div className="fr-section-head">
        <b>Field Certifications</b>
        <span>earned on firsts · cannot be bought, to the fitter’s open disgust</span>
      </div>
      <div className="fr-cert-list">
        {CERTIFICATIONS.map((track) => {
          const rank = certRank(s.expedition, track.id);
          const firsts = certFirstCount(s.expedition, track.id);
          const next = CERT_THRESHOLDS[rank];
          const title = rank > 0 ? track.ranks[rank - 1]?.title : null;
          return (
            <div key={track.id} className={`fr-item fr-cert${rank >= CERT_THRESHOLDS.length ? ' maxed' : ''}`}>
              <div className="fr-item-head">
                <span className="fr-name">
                  {track.name}
                  {title && <em className="fr-cert-title"> · {title}</em>}
                </span>
                <span className="fr-rank">
                  {CERT_THRESHOLDS.map((_, i) => (
                    <i key={i} className={i < rank ? 'on' : ''} />
                  ))}
                </span>
              </div>
              <div className="fr-effect">
                {next !== undefined
                  ? `${firsts}/${next} firsts toward ${track.ranks[rank]?.title ?? 'the next rank'} — ${track.ranks[rank]?.unlock ?? ''}`
                  : `complete — ${track.ranks[CERT_THRESHOLDS.length - 1]!.unlock}`}
              </div>
              <div className="fr-guide">{track.guide}</div>
              <div className="fr-cert-earns">{track.earns}</div>
            </div>
          );
        })}
      </div>

      <div className="fr-section-head">
        <b>Mission configuration</b>
        <span>free to switch · every fitted refit remains fitted</span>
      </div>
      <div className="fr-role-list">
        {SHIP_ROLES.map((role) => (
          <button
            key={role.id}
            className={`fr-role${s.expedition.role === role.id ? ' on' : ''}`}
            onClick={() => actions.setRole(role.id)}
            aria-pressed={s.expedition.role === role.id}
          >
            <b>{role.name}</b>
            <span>{role.text}</span>
            <em>speed ×{role.speed.toFixed(2)} · hold ×{role.capacity.toFixed(2)} · sensors ×{role.sensors.toFixed(2)} · turn ×{role.agility.toFixed(2)}</em>
          </button>
        ))}
      </div>

      <div className="fr-section-head">
        <b>Flight infrastructure</b>
        <span>permanent salvage-built support</span>
      </div>
      <div className="fr-infra-list">
        {INFRASTRUCTURE.map((def) => {
          const count = s.expedition.infrastructure[def.id] ?? 0;
          const maxed = count >= def.max;
          const afford = salvage >= def.cost;
          return (
            <div key={def.id} className={`fr-infra${maxed ? ' maxed' : ''}`}>
              <div><b>{def.name}</b><em>{count}/{def.max} standing</em></div>
              <span>{def.text}</span>
              <small>{infrastructureEffect(def)}</small>
              <button
                disabled={maxed || !afford}
                onClick={() => actions.buildInfrastructure(def.id)}
              >
                {maxed ? 'network complete' : `${def.cost} salvage`}
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
    {
      id: string;
      scanned: boolean;
      boarded: boolean;
      training: boolean;
      row: HTMLButtonElement;
      dist: HTMLElement;
      direction: HTMLElement;
    }[]
  >([]);
  const touchAction = useRef<HTMLButtonElement>(null);
  const autopilotSwitch = useRef<HTMLButtonElement>(null);
  const autopilotStatus = useRef<HTMLElement>(null);
  const autopilotKey = useRef<HTMLElement>(null);
  const viewSwitch = useRef<HTMLButtonElement>(null);
  const viewLabel = useRef<HTMLElement>(null);
  const viewKey = useRef<HTMLElement>(null);
  const [refit, setRefit] = useState(false);
  const [controls, setControls] = useState(false);
  const [chart, setChart] = useState(false);
  const coarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );
  const salvage = useGame((g) => g.s.expedition.salvage);

  // Equipment overlays capture the exit binding before CameraRig may disembark.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (flightPrefs().bindings.exit.includes(e.code)) {
        if (controls) setControls(false);
        else if (refit) setRefit(false);
        else if (chart) setChart(false);
        else return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.code === 'KeyR') {
        setRefit((value) => !value);
        setControls(false);
        setChart(false);
      }
      if (e.code === 'KeyK') {
        setControls((value) => !value);
        setRefit(false);
        setChart(false);
      }
      if (e.code === 'KeyM') {
        setChart((value) => !value);
        setRefit(false);
        setControls(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chart, controls, refit]);

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
      if (label.current) label.current.textContent = speedLabel(frac, boosting, f.station);
      if (pct.current) pct.current.textContent = `${Math.round(Math.min(1.6, frac) * 100)}%`;
      if (loc.current) {
        let line: string;
        const bus = useUiBus.getState();
        const game = useGame.getState().s;
        const system = bus.flightNearSystem;
        const world = bus.flightNearWorld;
        const systemGalaxy =
          system !== null && system < game.run.galaxies * C.SYSTEMS_PER_GALAXY
            ? Math.floor(system / C.SYSTEMS_PER_GALAXY)
            : null;
        const inferredGalaxy = systemGalaxy ?? bus.flightNearGalaxy;
        if (inferredGalaxy !== null || system !== null || world !== null) {
          const hierarchy = ['DEEP SPACE'];
          if (inferredGalaxy !== null) hierarchy.push('GALAXY ' + (inferredGalaxy + 1));
          if (system !== null) {
            const localSystem = inferredGalaxy !== null
              ? system % C.SYSTEMS_PER_GALAXY
              : system;
            hierarchy.push('SYSTEM ' + (localSystem + 1));
          }
          if (world !== null) {
            hierarchy.push(game.run.completedPlanets[world]?.name ?? ('WORLD ' + (world + 1)));
          }
          line = hierarchy.join(' › ');
          if (world !== null && f.altitude < ALTITUDE_RANGE) {
            line += ' · ALT ' + f.altitude.toFixed(2);
          }
        } else if (f.beyond) {
          line = 'beyond the shipping lanes — there is nothing further out except more nothing';
        } else if (f.altitude < ALTITUDE_RANGE) {
          // Close to something solid: height above ITS surface says far more
          // about scale than a distance from the middle of the universe does.
          line = f.altitudeOf + ' · altitude ' + f.altitude.toFixed(2);
        } else {
          const region = BAND_LABELS[zoomLive.band] ?? 'space';
          const near = f.nearest;
          line = near
            ? near.d <= OFF_RANGE[near.kind]
              ? region + ' · holding off ' + near.label
              : region + ' · nearest: ' + near.label
            : region;
        }
        if (loc.current.textContent !== line) loc.current.textContent = line;
      }
      if (autopilotSwitch.current) {
        const engaged = f.courseHold;
        const hasCourse = Boolean(f.nav);
        const phase = engaged ? f.autopilotPhase.toUpperCase() : hasCourse ? 'READY' : 'NO COURSE';
        const shortcut = boundKey('courseHold');
        const button = autopilotSwitch.current;
        button.classList.toggle('on', engaged);
        button.classList.toggle('ready', hasCourse && !engaged);
        button.dataset.phase = phase.toLowerCase().replace(' ', '-');
        button.setAttribute('aria-pressed', String(engaged));
        const destination = f.navLabel || 'the pinned destination';
        const aria = engaged
          ? `Autopilot engaged to ${destination}; ${phase.toLowerCase()}. Flip the switch or press ${shortcut} to disengage.`
          : hasCourse
            ? `Autopilot ready for ${destination}. Flip the switch or press ${shortcut} to engage.`
            : `Autopilot needs a destination. Pin one in the chart or sensors, then flip the switch or press ${shortcut}.`;
        if (button.getAttribute('aria-label') !== aria) button.setAttribute('aria-label', aria);
        if (autopilotStatus.current?.textContent !== phase) autopilotStatus.current!.textContent = phase;
        if (autopilotKey.current?.textContent !== shortcut) autopilotKey.current!.textContent = shortcut;
      }

      if (viewSwitch.current) {
        const chase = f.cameraMode === 'chase';
        const shortcut = boundKey('cameraView');
        const next = chase ? 'cockpit' : 'chase';
        viewSwitch.current.classList.toggle('on', chase);
        viewSwitch.current.setAttribute('aria-pressed', String(chase));
        viewSwitch.current.setAttribute('aria-label', `Chase camera; shortcut ${shortcut}`);
        viewSwitch.current.title = `Switch to ${next} view (${shortcut})`;
        if (viewLabel.current?.textContent !== (chase ? 'CHASE' : 'COCKPIT')) {
          viewLabel.current!.textContent = chase ? 'CHASE' : 'COCKPIT';
        }
        if (viewKey.current?.textContent !== shortcut) viewKey.current!.textContent = shortcut;
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
          // The key is whatever the pilot bound it to. Naming E at a helm
          // that has been rearranged is worse than naming nothing at all.
          else if (f.prompt?.blocked) text = `${dist} · ${f.prompt.blocked}`;
          else if (f.prompt) {
            const control = coarse ? 'ENGAGE' : engageKey();
            text = `${dist} · ${f.prompt.hold ? 'hold' : 'press'} ${control} to ${f.prompt.label}`;
          } else if (locked.boarded) text = `${dist} · already boarded`;
          else text = dist;
        }
        if (targetSub.current.textContent !== text) targetSub.current.textContent = text;
      }
      if (scanArc.current) {
        const p = f.scanProgress;
        scanArc.current.style.opacity = p > 0.005 ? '1' : '0';
        scanArc.current.style.strokeDashoffset = `${SCAN_C * (1 - p)}`;
      }

      // Sensor rows expose direction and let a resolved contact become the pin.
      if (contacts.current) {
        const list = f.contacts;
        const n = Math.min(5, list.length);
        let structural = n !== rows.current.length;
        if (!structural) {
          for (let i = 0; i < n; i++) {
            const contact = list[i]!;
            const row = rows.current[i]!;
            if (
              row.id !== contact.id
              || row.scanned !== contact.scanned
              || row.boarded !== contact.boarded
              || row.training !== contact.training
            ) {
              structural = true;
              break;
            }
          }
        }
        if (structural) {
          contacts.current.replaceChildren();
          rows.current = [];
          for (let i = 0; i < n; i++) {
            const contact = list[i]!;
            const row = document.createElement('button');
            row.type = 'button';
            row.className =
              `fc-row${contact.scanned ? ' known' : ''}${contact.boarded ? ' done' : ''}`
              + `${contact.rumoured && !contact.scanned ? ' rumoured' : ''}`
              + `${contact.training ? ' training' : ''}`;
            const name = document.createElement('span');
            name.textContent = `${contact.training ? 'TRAINING · ' : ''}${contact.label}`;
            const direction = document.createElement('em');
            const dist = document.createElement('b');
            row.append(name, direction, dist);
            row.title = contact.scanned ? 'Pin this contact' : 'Centre this bearing to scan';
            const contactId = contact.id;
            row.addEventListener('click', () => {
              const current = flightLive.contacts.find((candidate) => candidate.id === contactId);
              if (!current?.scanned) return;
              const waypoint = helmChart(500).find((entry) => entry.id.endsWith(`:${contactId}`));
              if (waypoint) actions.setWaypoint(waypoint.pinned ? null : waypoint.id);
            });
            contacts.current.appendChild(row);
            rows.current.push({
              id: contact.id,
              scanned: contact.scanned,
              boarded: contact.boarded,
              training: contact.training,
              row,
              dist,
              direction,
            });
          }
        }
        for (let i = 0; i < n; i++) {
          const contact = list[i]!;
          const slot = rows.current[i]!;
          const distance = rangeLabel(contact.d);
          const direction = directionLabel(contact.bearing, contact.elevation);
          if (slot.dist.textContent !== distance) slot.dist.textContent = distance;
          if (slot.direction.textContent !== direction) slot.direction.textContent = direction;
          slot.row.classList.toggle('locked', f.locked?.id === contact.id);
        }
        contacts.current.parentElement?.classList.toggle('empty', list.length === 0);
      }

      if (touchAction.current) {
        const prompt = f.prompt;
        touchAction.current.disabled = !prompt || Boolean(prompt.blocked);
        const text = prompt?.blocked ? 'blocked' : prompt?.label ?? 'engage';
        if (touchAction.current.textContent !== text) touchAction.current.textContent = text;
      }

      root.current?.classList.toggle('boosting', f.boostBlend > 0.25);
      root.current?.classList.toggle('chase-view', f.cameraMode === 'chase');
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

      <NavRibbon />
      <FirstSortie onOpenRefit={() => { setRefit(true); setChart(false); setControls(false); }} />
      <SubEthaTicker />
      <FlightEventFeed />

      <div className="fh-top">
        <span className="fh-chip">the company runabout · helm online</span>
        <button
          ref={viewSwitch}
          type="button"
          className="fh-view-switch"
          aria-label={`Chase camera; shortcut ${boundKey('cameraView')}`}
          aria-pressed="false"
          onClick={() => toggleFlightCamera()}
          title="Switch between cockpit and chase cameras"
        >
          <i aria-hidden />
          <span>
            <b ref={viewLabel}>COCKPIT</b>
            <kbd ref={viewKey}>{boundKey('cameraView')}</kbd>
          </span>
        </button>
        <button className="fh-exit" onClick={() => useUiBus.getState().setFlightMode(false)}>
          disembark <kbd>{boundKey('exit')}</kbd>
        </button>
      </div>

      <ManifestStrip />
      <div className="fh-sensors empty">
        <div className="fs-head">
          sensors
          <span>{salvage} salvage</span>
        </div>
        <div ref={contacts} className="fs-list" />
        <div className="fs-none">no contacts</div>
        <div className="fh-tool-actions">
          <button
            className="fs-refit"
            onClick={() => { setChart((value) => !value); setRefit(false); setControls(false); }}
          >
            chart <kbd>m</kbd>
          </button>
          <button
            className="fs-refit"
            onClick={() => { setRefit(true); setChart(false); setControls(false); }}
          >
            refit <kbd>r</kbd>
          </button>
          <button
            className="fs-refit"
            onClick={() => { setControls(true); setChart(false); setRefit(false); }}
          >
            controls <kbd>k</kbd>
          </button>
        </div>
      </div>
      {chart && <HelmChart onClose={() => setChart(false)} />}

      <InterdictionBanner />
      <div
        className="fh-console"
        style={{ '--fh-fascia': `url("${COCKPIT_ASSETS.fascia}")` } as CSSProperties}
      >
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
        <button
          ref={autopilotSwitch}
          type="button"
          className="fh-autopilot-switch"
          aria-label="Autopilot needs a pinned destination; shortcut H"
          aria-pressed="false"
          onClick={() => toggleAutopilot()}
          title="Destination autopilot; any helm input returns to manual"
        >
          <span className="fas-copy">
            <b>AUTO <kbd ref={autopilotKey}>{boundKey('courseHold')}</kbd></b>
            <em ref={autopilotStatus} role="status" aria-live="polite" aria-atomic="true">NO COURSE</em>
          </span>
          <span className="fas-rocker" aria-hidden>
            <i />
          </span>
        </button>
      </div>

      {coarse && (
        <div className="fh-touch">
          <button
            ref={touchAction}
            className="fh-engage"
            onPointerDown={() => {
              if (flightLive.prompt?.verb === 'jump') flightInput.jump = true;
              else flightInput.engage = true;
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
          <button
            className="fh-brake"
            onPointerDown={() => { flightInput.brake = 1; }}
            onPointerUp={() => { flightInput.brake = 0; }}
            onPointerCancel={() => { flightInput.brake = 0; }}
          >
            brake
          </button>
        </div>
      )}

      <div className="fh-legend">
        {coarse ? (
          <>left thumb steers · right thumb thrusts · double-tap right to boost · action and brake controls are contextual</>
        ) : (
          <>
            <b>{boundKey('yawLeft')}/{boundKey('yawRight')}</b> steer · <b>{boundKey('thrust')}</b> thrust ·{' '}
            <b>{boundKey('brake')}</b> brake · <b>{boundKey('boost')}</b> boost ·{' '}
            <b>{boundKey('engage')}</b> scan/board · <b>{boundKey('jump')}</b> jump ·{' '}
            <b>M</b> chart · <b>{boundKey('courseHold')}</b> autopilot · <b>K</b> controls · <b>{boundKey('exit')}</b> disembark
          </>
        )}
      </div>

      {refit && <RefitConsole onClose={() => setRefit(false)} />}
      {controls && <FlightControlsDialog onClose={() => setControls(false)} />}
    </div>
  );
}
