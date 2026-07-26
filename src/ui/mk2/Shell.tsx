/**
 * Guide Mk II — the casing.
 *
 * Mk I floated cards over the scene and hoped you would work out which of them
 * was the important one. Mk II is a device: bezels top and bottom, a spine on
 * the left saying what scale you are looking at, a rail of drawers on the
 * right, and the world seen THROUGH the middle of all that. The scene renders
 * behind this layer untouched — the window is a hole in the chrome, not a
 * picture of one.
 *
 * Three rules the layout is built on, all of them about attention:
 *
 *   - Exactly one thing is ever WAITING on you. The answer card is its own
 *     well, never mixed with the news, and nothing else uses brass.
 *   - The news goes in one tray, newest at the top, and it stays there. It
 *     does not fly across the screen and it does not disappear before it is
 *     read.
 *   - Everything else is a drawer. Drawers do not open themselves; they put a
 *     lamp on the rail and wait.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { actions, useGame } from '../../state/store';
import { heroScreen, useUiBus } from '../fx/uiBus';
import { Num, useSmoothTu } from '../bits';
import { format, formatDuration } from '../../engine/num';
import { ASPECTS, type AspectId } from '../../engine/types';
import { BUILDINGS, BUILDING_BY_ID } from '../../content/buildings';
import { buildingCost } from '../../engine/economy';
import { EVENT_BY_ID } from '../../content/events';
import { PETITION_BY_ID } from '../../content/petitions';
import { SITUATION_BY_ID, fillSituationText, type SituationSeverity } from '../../content/situations';
import { situationCosts } from '../../engine/situations';
import { findWaypoint, waypointId } from '../../engine/waypoints';
import { BAND_LABELS, BAND_STOPS } from '../scene/universeLayout';
import { BRAND_ASSETS } from '../assets';
import { C } from '../../content/constants';
import { FACTION_META } from '../../content/contracts';
import { Drawer, DRAWERS, type DrawerId } from './drawers';
import './mk2.css';

// ————— The rail —————

/** Nine drawers in four cabinets. The grouping is the argument. */
const CABINETS: readonly (readonly DrawerId[])[] = [
  ['shop', 'research', 'orders'],
  ['operations', 'magrathea'],
  ['chart', 'guide', 'vortex'],
  ['settings'],
];

const ASPECT_META: Record<AspectId, { label: string; color: string; a0: number; a1: number }> = {
  thermal: { label: 'THERMAL', color: 'var(--thermal)', a0: -160, a1: -96 },
  atmo: { label: 'ATMO', color: 'var(--atmo)', a0: -84, a1: -20 },
  hydro: { label: 'HYDRO', color: 'var(--hydro)', a0: 20, a1: 84 },
  bio: { label: 'BIOTIC', color: 'var(--bio)', a0: 96, a1: 160 },
};

function arcPath(r: number, a0deg: number, a1deg: number): string {
  const a0 = (a0deg * Math.PI) / 180;
  const a1 = (a1deg * Math.PI) / 180;
  return `M ${(Math.cos(a0) * r).toFixed(2)} ${(Math.sin(a0) * r).toFixed(2)} A ${r} ${r} 0 0 1 ${(Math.cos(a1) * r).toFixed(2)} ${(Math.sin(a1) * r).toFixed(2)}`;
}

// ————— Top bezel —————

function TopBezel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const standing = (Object.keys(FACTION_META) as (keyof typeof FACTION_META)[])
    .map((f) => s.operations.reputation[f] ?? 0)
    .join(' / ');

  return (
    <div className="mk2-top">
      <img className="mk2-wordmark" src={BRAND_ASSETS.wordmark} alt="TerraClicker" />
      <div className="mk2-rule" />
      <div className="mk2-top-stats">
        <div>
          <div className="k">Commission</div>
          <b>{String(s.lifetime.prestiges + 1).padStart(2, '0')}</b>
        </div>
        <div>
          <div className="k">Blueprints</div>
          <b style={{ color: 'var(--magrathea)' }}>{s.prestige.bp}</b>
        </div>
        <div>
          <div className="k">Standing</div>
          <b>{standing}</b>
        </div>
      </div>
      <span style={{ flex: 1 }} />
      <div className="mk2-autosave">
        <span className="k" style={{ fontSize: 8.5, letterSpacing: '.18em' }}>Autosave</span>
        <i style={{ background: 'var(--bio)' }} />
        <i style={{ background: 'var(--atmo)', animationDelay: '.9s' }} />
        <i style={{ background: 'var(--improbable)', animationDelay: '1.8s' }} />
      </div>
    </div>
  );
}

// ————— Left spine —————

/**
 * Where you are, at every scale. The lit part of the track is how far out the
 * camera currently is, so the spine answers "how far away am I" without
 * anybody having to read a number.
 */
function LeftSpine() {
  const zoom = useUiBus((b) => b.zoom);
  const setFlight = useUiBus((b) => b.setFlightMode);
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();

  const counts = [
    `${s.run.completedPlanets.length % C.PLANETS_PER_SYSTEM}/${C.PLANETS_PER_SYSTEM}`,
    `${s.run.systems}`,
    `${s.run.galaxies}`,
    `${s.run.galaxies}`,
    '∞',
  ];

  return (
    <div className="mk2-spine">
      <div className="mk2-spine-title">Scale</div>
      <div className="mk2-scale">
        <div className="mk2-scale-track" />
        <div className="mk2-scale-lit" style={{ height: `${Math.max(4, zoom * 100)}%` }} />
        {BAND_LABELS.map((label, i) => {
          const here = zoom >= BAND_STOPS[i]! && (i === BAND_LABELS.length - 1 || zoom < BAND_STOPS[i + 1]!);
          return (
            <button
              key={label}
              className={`mk2-stop${here ? ' on' : ''}`}
              title={label}
              onClick={() => useUiBus.getState().setZoom(BAND_STOPS[i]!)}
            >
              <span>
                <i
                  style={{
                    width: here ? 9 : 5,
                    height: here ? 9 : 5,
                    background: here ? 'var(--atmo)' : 'var(--line-2)',
                    boxShadow: here ? '0 0 8px rgba(90,215,232,.7)' : 'none',
                  }}
                />
              </span>
              <b>{counts[i]}</b>
            </button>
          );
        })}
      </div>
      <div className="mk2-spine-sep" />
      <button className="mk2-helm" title="Take the helm" onClick={() => setFlight(true)}>
        <svg viewBox="0 0 16 16" aria-hidden>
          <path
            d="M8 1.2c1.7 1.5 2.6 3.6 2.6 6.1l1.9 2.9-.7 1.1-2-1.2c-.2.6-.5 1.1-.8 1.6h-2c-.3-.5-.6-1-.8-1.6l-2 1.2-.7-1.1 1.9-2.9C5.4 4.8 6.3 2.7 8 1.2Z"
            fill="currentColor"
          />
          <path d="M8 12.4l.9 2.4L8 14.2l-.9.6.9-2.4Z" fill="currentColor" opacity=".7" />
        </svg>
        <span>HELM</span>
      </button>
    </div>
  );
}

// ————— Bottom bezel —————

/** The next thing you can afford, which is the only forecast worth printing. */
function useNextPurchase(): { label: string; ms: number } | null {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();
  if (d.tuPerSec.lte(0)) return null;
  let best: { label: string; ms: number } | null = null;
  for (const b of BUILDINGS) {
    if (s.run.tuEarned.lt(b.unlockAtTu)) continue;
    if (b.unique && (s.buildings[b.id] ?? 0) > 0) continue;
    const cost = buildingCost(b.id, s.buildings[b.id] ?? 0, d);
    if (s.tu.gte(cost)) continue;
    const ms = cost.sub(s.tu).div(d.tuPerSec).toNumber() * 1000;
    if (!best || ms < best.ms) best = { label: b.name, ms };
  }
  if (!best || !Number.isFinite(best.ms) || best.ms > 30 * 60_000) return null;
  return best;
}

function BottomBezel() {
  const next = useNextPurchase();
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();

  // The channel, doubled so the marquee can loop without a seam. Newest first,
  // because a ticker reads front to back and the eye lands at the front.
  const log = s.subEtha.log;
  const items = useMemo(() => {
    const recent = log.slice(-6).reverse().map((entry) => entry.text);
    return recent.length > 0
      ? recent
      : ['The channel is quiet. In the Guide’s experience this is rarely a good sign.'];
  }, [log]);

  const line = (
    <span>
      {items.map((t, i) => (
        <span key={i}>
          {t}
          {'  ·  '}
        </span>
      ))}
    </span>
  );

  return (
    <div className="mk2-bottom">
      {next && (
        <div className="mk2-next">
          <span className="k" style={{ fontSize: 8.5 }}>Next</span>
          <b>{next.label}</b>
          <span className="v">~{formatDuration(next.ms)}</span>
        </div>
      )}
      <div className="mk2-ticker">
        <span className="mk2-ticker-label">SUB-ETHA</span>
        <div className="mk2-ticker-run">
          {line}
          {line}
        </div>
      </div>
      <div className="mk2-corp">SIRIUS CYBERNETICS CORP. · GUIDE MK II</div>
    </div>
  );
}

// ————— Binnacle —————

function Binnacle() {
  const rev = useGame((g) => g.rev);
  void rev;
  const tuText = useSmoothTu();
  const { s, d } = useGame.getState();

  // How far the world itself has come — the bar under the headline reading.
  let done = 0;
  for (const a of ASPECTS) {
    const t = s.planet.targets[a];
    done += t.lte(0) ? 1 : Math.min(1, s.planet.gauges[a].div(t).toNumber());
  }
  const frac = done / ASPECTS.length;

  return (
    <div className="mk2-binnacle">
      <div className="mk2-binnacle-head">
        <span className="k">Terraforming Units</span>
        {d.tuPerSec.gt(0) && <span className="mk2-accruing">▲ ACCRUING</span>}
      </div>
      <div className="mk2-tu">
        <b><Num v={tuText} /></b>
        <span>TU</span>
      </div>
      <div className="mk2-progress"><i style={{ width: `${(frac * 100).toFixed(1)}%` }} /></div>
      <div className="mk2-vitals">
        <div>
          <b><Num v={d.tuPerSec} /></b>
          <span>PER SECOND</span>
        </div>
        <div>
          <b><Num v={d.clickPower} /></b>
          <span>PER CLICK</span>
        </div>
        <div>
          <b style={{ color: 'var(--atmo)' }}>{format(s.science)}</b>
          <span>SCIENCE +{format(d.sciencePerSec)}/S</span>
        </div>
      </div>
    </div>
  );
}

// ————— Active effects —————

function Lamps() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const all = [
    ...s.activeEvents.map((e) => ({
      key: `e${e.id}`,
      label: (EVENT_BY_ID[e.id]?.name ?? e.id).split(' ')[0]!.toUpperCase(),
      value: '',
      ms: e.remainingMs,
      color: 'var(--atmo)',
    })),
    ...s.buffs.map((b) => ({
      key: `b${b.id}`,
      label: b.label.split(' ')[0]!.toUpperCase(),
      value: b.mult > 1 ? `×${b.mult}` : `×${b.clickMult}`,
      ms: b.remainingMs,
      color: 'var(--improbable)',
    })),
  ];
  if (all.length === 0) return null;
  const shown = all.slice(0, 2);
  const rest = all.length - shown.length;

  return (
    <div
      className="mk2-lamps"
      title={all.map((l) => `${l.label} ${l.value} ${formatDuration(l.ms)}`).join(' · ')}
    >
      {shown.map((l) => (
        <div
          key={l.key}
          className="mk2-lamp"
          style={{ borderColor: l.color, borderLeftColor: l.color, background: 'rgba(245,200,76,.08)' }}
        >
          <b style={{ color: l.color }}>{l.label}</b>
          {l.value && <em>{l.value}</em>}
          <span className="v">{formatDuration(l.ms)}</span>
        </div>
      ))}
      {rest > 0 && <button className="mk2-lamp-more">+{rest}</button>}
    </div>
  );
}

// ————— Something wants an answer —————

const LAPSE_HINT: Record<SituationSeverity, string> = {
  opportunity: 'Let it pass and nothing is lost but the chance.',
  nuisance: 'Let it pass and somebody will notice.',
  hazard: 'Let it pass and it will leave a mark.',
};

function AnswerCard({
  inst,
}: {
  inst: { uid: number; id: string; remainingMs: number; world: number; worldName: string };
}) {
  const { s, d } = useGame.getState();
  const def = SITUATION_BY_ID[inst.id] ?? PETITION_BY_ID[inst.id];
  if (!def) return null;
  const left = Math.max(0, inst.remainingMs);
  const frac = Math.max(0, Math.min(1, left / def.windowMs));

  const pinId = inst.world ? waypointId('world', inst.world) : null;
  const canPin = pinId ? Boolean(findWaypoint(s, pinId)) : false;
  const pinned = pinId !== null && s.expedition.pinned === pinId;
  const canAttend =
    Boolean(inst.world) && pinId !== null && s.expedition.visited[pinId] !== undefined;

  return (
    <div className="mk2-answer-slot">
      <div className="mk2-answer">
        <div className="mk2-answer-head">
          <span className="k">Awaiting an answer</span>
          <span style={{ flex: 1 }} />
          <span className="v">{formatDuration(left)}</span>
          <span className="mk2-answer-timer"><i style={{ width: `${frac * 100}%` }} /></span>
        </div>
        <div className="mk2-answer-body">
          <div className="mk2-answer-scroll">
            <div className="mk2-answer-title">{def.name}</div>
            <p className="mk2-answer-text">{fillSituationText(def.text, inst.worldName)}</p>
          </div>
          {(canPin || canAttend) && (
            <div className="mk2-answer-acts">
              {canPin && (
                <button
                  className={pinned ? 'on' : ''}
                  onClick={() => actions.setWaypoint(pinned ? null : pinId)}
                >
                  {pinned ? `PINNED · ${inst.worldName}` : `PIN ${inst.worldName.toUpperCase()}`}
                </button>
              )}
              {canAttend && (
                <button className="attend" onClick={() => actions.attendInPerson(inst.uid)}>
                  ATTEND IN PERSON
                </button>
              )}
            </div>
          )}
          <div className="mk2-answer-opts">
            {def.options.map((o) => {
              const costs = situationCosts(d, o);
              const canTu = !costs.tu || s.tu.gte(costs.tu);
              const canSci = !costs.science || s.science.gte(costs.science);
              return (
                <button
                  key={o.id}
                  className="mk2-opt"
                  disabled={!canTu || !canSci}
                  onClick={() => actions.answerSituation(inst.uid, o.id)}
                >
                  <span>
                    <b>{o.label}</b>
                    <em>{o.detail}</em>
                  </span>
                  {costs.tu && (
                    <span className={canTu ? 'cost' : 'cost short'}>{format(costs.tu)} TU</span>
                  )}
                  {costs.science && (
                    <span className={canSci ? 'cost' : 'cost short'}>{format(costs.science)} SCI</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mk2-lapse">{LAPSE_HINT[def.severity]}</div>
        </div>
      </div>
    </div>
  );
}

// ————— The filing tray —————

/**
 * One well, not a pile. Everything the universe has told you recently lands
 * here in order and stays until it scrolls off — no toast has ever been read
 * by somebody who was looking at something else at the time.
 */
function FilingTray() {
  const toasts = useUiBus((b) => b.toasts);
  const [openTray, setOpenTray] = useState(true);
  const seen = useRef<{ id: number; at: number }[]>([]);

  // Filings keep their arrival time so the tray can say "12s" rather than
  // silently reordering under the reader.
  const now = Date.now();
  for (const t of toasts) if (!seen.current.some((x) => x.id === t.id)) seen.current.push({ id: t.id, at: now });
  seen.current = seen.current.filter((x) => toasts.some((t) => t.id === x.id));

  const when = (id: number): string => {
    const at = seen.current.find((x) => x.id === id)?.at ?? now;
    const secs = Math.floor((now - at) / 1000);
    return secs < 3 ? 'now' : secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m`;
  };

  const tone: Record<string, string> = {
    achievement: 'var(--improbable)',
    event: 'var(--atmo)',
    vogon: 'var(--vogon, #8a8f5a)',
    info: 'var(--bio)',
  };

  return (
    <div className="mk2-tray">
      <div className="mk2-tray-head">
        <span className="k">Filing tray</span>
        <span style={{ flex: 1 }} />
        <span className="mk2-tray-count">{toasts.length} HELD</span>
        <button
          style={{ padding: '0 4px', border: 'none', background: 'none', color: 'var(--ink-faint)', fontSize: 11 }}
          onClick={() => setOpenTray((v) => !v)}
          title={openTray ? 'Collapse the tray' : 'Open the tray'}
        >
          {openTray ? '▾' : '▸'}
        </button>
      </div>
      {openTray && (
        <div className="mk2-tray-list" role="status" aria-live="polite">
          {toasts.length === 0 && (
            <div className="mk2-filing" style={{ opacity: .5 }}>
              <span style={{ background: 'var(--line-2)' }} />
              <div className="mk2-filing-copy">
                <div className="mk2-filing-body">Nothing filed. The universe is being polite.</div>
              </div>
            </div>
          )}
          {[...toasts].reverse().map((t) => (
            <div key={t.id} className="mk2-filing">
              <span style={{ background: tone[t.kind] ?? 'var(--line-2)' }} />
              {t.art && <img src={t.art} alt={t.artAlt ?? ''} />}
              <div className="mk2-filing-copy">
                {t.kicker && (
                  <div className="mk2-filing-kicker" style={{ color: tone[t.kind] ?? 'var(--ink-dim)' }}>
                    {t.kicker}
                  </div>
                )}
                <div className="mk2-filing-title">{t.title}</div>
                {t.body && <div className="mk2-filing-body">{t.body}</div>}
              </div>
              <span className="mk2-filing-when">{when(t.id)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ————— The gauge ring, welded to the world —————

function GaugeRing() {
  const rev = useGame((g) => g.rev);
  void rev;
  const anchor = useRef<HTMLDivElement>(null);
  const { s } = useGame.getState();
  const p = s.planet;

  // Glued to the hero planet's projected position, so it recedes with the
  // world rather than hanging in the middle of the chrome.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = anchor.current;
      if (el) {
        const k = Math.max(0.4, Math.min(1.3, (heroScreen.r / 236) * 1.06));
        el.style.transform = `translate3d(${heroScreen.x.toFixed(1)}px, ${heroScreen.y.toFixed(1)}px, 0) scale(${k.toFixed(3)})`;
        el.style.opacity = heroScreen.o.toFixed(2);
        el.style.visibility = heroScreen.o <= 0.01 ? 'hidden' : 'visible';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const R = 236;
  let lowest: AspectId = 'thermal';
  let lowestFrac = Infinity;
  const fracs = {} as Record<AspectId, number>;
  for (const a of ASPECTS) {
    const t = p.targets[a];
    const f = t.lte(0) ? 1 : Math.min(1, p.gauges[a].div(t).toNumber());
    fracs[a] = f;
    if (f < lowestFrac) {
      lowestFrac = f;
      lowest = a;
    }
  }

  const delivered = s.run.completedPlanets.length % C.PLANETS_PER_SYSTEM;

  return (
    // Sits inside the window, so its origin is pulled back to the viewport's
    // to keep heroScreen's screen-space coordinates meaningful.
    <div
      ref={anchor}
      className="mk2-ring-anchor"
      style={{
        position: 'absolute',
        left: 'calc(-1 * var(--spine))',
        top: 'calc(-1 * var(--bezel-t))',
        zIndex: 2,
      }}
    >
      <svg
        className="mk2-ring"
        viewBox="-300 -300 600 600"
        style={{ width: 600, height: 600, left: -300, top: -300 }}
      >
        {ASPECTS.map((a) => {
          const m = ASPECT_META[a];
          const d = arcPath(R, m.a0, m.a1);
          const mid = ((m.a0 + m.a1) / 2) * (Math.PI / 180);
          const lx = Math.cos(mid) * (R + 32);
          const ly = Math.sin(mid) * (R + 32);
          const bottleneck = a === lowest && fracs[a] < 1;
          return (
            <g key={a}>
              <path d={d} fill="none" stroke="rgba(233,238,249,.07)" strokeWidth={7} />
              <path
                d={d}
                fill="none"
                stroke={m.color}
                strokeWidth={7}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${(fracs[a] * 100).toFixed(2)} 100`}
                opacity={0.95}
                style={bottleneck ? { animation: 'mk2pulse 1.8s ease-in-out infinite' } : undefined}
              />
              <text x={lx} y={ly - 9} textAnchor="middle" fill={m.color} fontSize={12}>
                {m.label}
              </text>
              <text
                x={lx}
                y={ly + 9}
                textAnchor="middle"
                fill={bottleneck ? 'var(--ink)' : '#8c96af'}
                fontSize={15}
                letterSpacing="0"
              >
                {Math.floor(fracs[a] * 100)}%
              </text>
              {bottleneck && (
                <text x={lx} y={ly + 27} textAnchor="middle" fill="#5a6378" fontSize={9} letterSpacing="1.6">
                  BOTTLENECK
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mk2-plate" style={{ left: 0, top: R + 28 }}>
        <div className="mk2-plate-name">{p.name}</div>
        <div className="mk2-plate-sub">
          World #{p.lifetimeIndex} · {p.type === 'gasgiant' ? 'gas giant' : p.type} · {p.size}
          {p.survey ? ' · surveyed' : ''}
        </div>
        <div className="mk2-plate-system">
          <span className="k">System {s.run.systems + 1}</span>
          <span className="mk2-pips">
            {Array.from({ length: C.PLANETS_PER_SYSTEM }, (_, i) => (
              <i key={i} className={i < delivered ? 'on' : ''} />
            ))}
          </span>
          <span className="k">{delivered}/{C.PLANETS_PER_SYSTEM} DELIVERED</span>
        </div>
      </div>
    </div>
  );
}

// ————— The rail and the panel —————

function useUnlocked(): (id: DrawerId) => boolean {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  return (id: DrawerId): boolean => {
    switch (id) {
      case 'research':
        return s.lifetime.tuEarned.gte(BUILDING_BY_ID['researchLab']!.unlockAtTu)
          || s.research.completed.length > 0
          || Boolean(s.research.active);
      case 'operations':
      case 'vortex':
        return s.lifetime.planetsCompleted > 0;
      case 'orders':
        return s.lifetime.prestiges >= 1;
      case 'chart':
        return s.lifetime.planetsCompleted > 0 || Object.keys(s.expedition.discovered).length > 0;
      case 'magrathea':
        return s.lifetime.prestiges > 0 || s.run.systems > 0
          || s.run.tuEarned.gte(C.PRESTIGE_TU_DIVISOR * 0.1);
      default:
        return true;
    }
  };
}

function RightRail({
  open,
  onPick,
}: {
  open: DrawerId | null;
  onPick: (id: DrawerId) => void;
}) {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();
  const unlocked = useUnlocked();

  const attention: Partial<Record<DrawerId, boolean>> = {
    magrathea: d.prestigeEligible,
    research: !s.research.active && s.science.gte(15) && s.buildings['researchLab'] !== undefined,
    operations: !s.operations.active && s.operations.offers.length > 0,
  };

  return (
    <nav className="mk2-rail" aria-label="Guide drawers">
      {CABINETS.map((cabinet, ci) => {
        const items = cabinet.filter(unlocked);
        if (items.length === 0) return null;
        return (
          <div
            className="mk2-cabinet"
            key={ci}
            style={ci === CABINETS.length - 1 ? { marginTop: 'auto' } : undefined}
          >
            {items.map((id) => {
              const meta = DRAWERS[id];
              return (
                <button
                  key={id}
                  className={`mk2-drawer${open === id ? ' on' : ''}`}
                  onClick={() => onPick(id)}
                  title={meta.title}
                  aria-pressed={open === id}
                >
                  <span className="mk2-drawer-code">{meta.code}</span>
                  <span className="mk2-drawer-label">{meta.rail}</span>
                  {attention[id] && <i className="mk2-drawer-badge" />}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Panel({ id, onClose }: { id: DrawerId; onClose: () => void }) {
  const rev = useGame((g) => g.rev);
  void rev;
  const meta = DRAWERS[id];
  const ledger = meta.ledger();

  return (
    <section className="mk2-panel" aria-label={`${meta.title} drawer`}>
      <header className="mk2-panel-head">
        <div className="mk2-panel-head-row">
          <span className="k">{meta.eyebrow}</span>
          <span style={{ flex: 1 }} />
          <button className="mk2-collapse" onClick={onClose} title="Collapse the panel">››</button>
        </div>
        <h1 className="mk2-panel-title">{meta.title}</h1>
        <p className="mk2-panel-dek">{meta.dek}</p>
      </header>
      {ledger.length > 0 && (
        <div className="mk2-ledger">
          {ledger.map((l) => (
            <div key={l.k}>
              <b style={{ color: l.color ?? 'var(--ink)' }}>{l.v}</b>
              <span>{l.k}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mk2-panel-body">
        <Drawer id={id} />
      </div>
    </section>
  );
}

// ————— The device —————

export function Mk2Shell() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const started = s.lifetime.clicks > 0 || s.lifetime.tuEarned.gt(0);
  const [open, setOpen] = useState<DrawerId | null>(started ? 'shop' : 'settings');
  const dockRequest = useUiBus((b) => b.dockRequest);

  // A deep link from elsewhere (the Morning Circular) opens the drawer once.
  useEffect(() => {
    if (!dockRequest) return;
    const id = dockRequest.toLowerCase() as DrawerId;
    if (DRAWERS[id]) setOpen(id);
    useUiBus.getState().clearDockRequest();
  }, [dockRequest]);

  const urgent = s.situations[0];
  const petitions = s.run.petitions;

  return (
    <div className={`mk2${open ? '' : ' panel-closed'}`}>
      {/* The ring lives INSIDE the glass, so the casing crops it exactly as a
          real bezel would rather than letting it wander onto the chrome. */}
      <div className="mk2-window">
        <div className="mk2-window-shade" />
        <GaugeRing />
        <div className="mk2-window-vignette" />
      </div>

      <TopBezel />
      <LeftSpine />
      <BottomBezel />

      <Binnacle />
      <div className="mk2-column">
        <Lamps />
        {urgent && <AnswerCard inst={urgent} />}
        {!urgent && petitions[0] && <AnswerCard inst={petitions[0]} />}
        <FilingTray />
      </div>

      <RightRail open={open} onPick={(id) => setOpen((v) => (v === id ? null : id))} />
      {open && <Panel id={open} onClose={() => setOpen(null)} />}
      {!open && (
        <button className="mk2-reopen" onClick={() => setOpen('shop')}>
          OPEN THE DRAWERS ‹‹
        </button>
      )}

      {!started && (
        <div className="mk2-coldopen">
          <span className="k">Guide entry 0</span>
          <p>Touch the world. It has been waiting with admirable patience.</p>
          <small>Restoring a universe? Use Settings without starting this one.</small>
        </div>
      )}
    </div>
  );
}
