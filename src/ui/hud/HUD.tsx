import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../state/store';
import { heroScreen, useUiBus } from '../fx/uiBus';
import { UniverseHUD } from './UniverseHUD';
import { Num, useSmoothTu } from '../bits';
import { format, formatDuration } from '../../engine/num';
import { ASPECTS, type AspectId } from '../../engine/types';
import { BUILDINGS } from '../../content/buildings';
import { buildingCost } from '../../engine/economy';
import { EVENT_BY_ID } from '../../content/events';
import { VOGON_POEM_LINES } from '../../content/vogonPoetry';
import { poemLine } from '../../engine/improbability';
import { C } from '../../content/constants';
import { BRAND_ASSETS, EVENT_ART, VOGON_ART } from '../assets';

const ASPECT_META: Record<AspectId, { label: string; color: string; a0: number; a1: number }> = {
  thermal: { label: 'THERMAL', color: 'var(--thermal)', a0: -160, a1: -96 },
  atmo: { label: 'ATMO', color: 'var(--atmo)', a0: -84, a1: -20 },
  hydro: { label: 'HYDRO', color: 'var(--hydro)', a0: 20, a1: 84 },
  bio: { label: 'BIOTIC', color: 'var(--bio)', a0: 96, a1: 160 },
};

function arcPath(r: number, a0deg: number, a1deg: number): string {
  const a0 = (a0deg * Math.PI) / 180;
  const a1 = (a1deg * Math.PI) / 180;
  const x0 = Math.cos(a0) * r;
  const y0 = Math.sin(a0) * r;
  const x1 = Math.cos(a1) * r;
  const y1 = Math.sin(a1) * r;
  const large = Math.abs(a1deg - a0deg) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function computeScale(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(1.3, Math.max(0.52, Math.min(window.innerHeight / 860, window.innerWidth / 640)));
}

function useViewportScale(): number {
  const [scale, setScale] = useState(computeScale);
  useEffect(() => {
    const onResize = () => setScale(computeScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

function Gauges() {
  const rev = useGame((g) => g.rev);
  void rev;
  const maxScale = useViewportScale();
  const anchor = useRef<HTMLDivElement>(null);
  const { s } = useGame.getState();
  const p = s.planet;

  // The diegetic HUD is glued to the hero planet's PROJECTED position and
  // apparent size (heroScreen, written by CameraRig every frame), so it
  // recedes and shrinks with the world instead of hanging half-detached
  // over empty space, and it bows out entirely as you pull back.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = anchor.current;
      if (el) {
        const o = heroScreen.o;
        const k = Math.max(0.4, Math.min(maxScale, (heroScreen.r / 236) * 1.06));
        el.style.transform = `translate3d(${heroScreen.x.toFixed(1)}px, ${heroScreen.y.toFixed(1)}px, 0) scale(${k.toFixed(3)})`;
        el.style.opacity = o.toFixed(2);
        el.style.visibility = o <= 0.01 ? 'hidden' : 'visible';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [maxScale]);

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

  return (
    <div ref={anchor} className="gauge-anchor">
      <svg className="gauge-svg" width="0" height="0" viewBox="-300 -300 600 600" style={{ width: 600, height: 600, marginLeft: -300, marginTop: -300 }}>
        {ASPECTS.map((a) => {
          const m = ASPECT_META[a];
          const d = arcPath(R, m.a0, m.a1);
          const mid = ((m.a0 + m.a1) / 2) * (Math.PI / 180);
          const lx = Math.cos(mid) * (R + 24);
          const ly = Math.sin(mid) * (R + 24);
          return (
            <g key={a}>
              <path className="gauge-track" d={d} strokeWidth={5} pathLength={100} />
              <path
                className={`gauge-fill${a === lowest && fracs[a] < 1 ? ' pulse' : ''}`}
                d={d}
                stroke={m.color}
                strokeWidth={5}
                pathLength={100}
                strokeDasharray={`${(fracs[a] * 100).toFixed(2)} 100`}
              />
              <text className="gauge-label" x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">
                {m.label} {Math.floor(fracs[a] * 100)}%
              </text>
            </g>
          );
        })}
      </svg>
      <div className="planet-name-tag" style={{ top: R + 46 }}>
        <div className="pn-name">{p.name}</div>
        <div className="pn-sub">
          Planet #{p.lifetimeIndex}
          {p.survey ? ' · surveyed' : ''} · {p.type === 'gasgiant' ? 'gas giant' : p.type}
          {' · '}
          {p.size}
        </div>
        <div className="system-dots" title="Worlds completed toward the next solar system">
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className={`sd${i < s.run.completedPlanets.length % 5 ? ' on' : ''}`}
            />
          ))}
          <span className="sd-label">
            system {s.run.systems + 1}
            {s.run.galaxies > 0 ? ` · galaxy ${s.run.galaxies}` : ''}
          </span>
        </div>
        {s.run.completedPlanets.length > 0 && (
          <div className="pn-hint">scroll to survey your universe · drag to orbit</div>
        )}
      </div>
    </div>
  );
}

function EtaRibbon() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();
  if (d.tuPerSec.lte(0)) return null;

  let bestLabel: string | null = null;
  let bestMs = Infinity;
  for (const b of BUILDINGS) {
    if (s.run.tuEarned.lt(b.unlockAtTu)) continue;
    if (b.unique && (s.buildings[b.id] ?? 0) > 0) continue;
    const cost = buildingCost(b.id, s.buildings[b.id] ?? 0, d);
    if (s.tu.gte(cost)) continue;
    const ms = cost.sub(s.tu).div(d.tuPerSec).toNumber() * 1000;
    if (ms < bestMs) {
      bestMs = ms;
      bestLabel = b.name;
    }
  }
  if (!bestLabel || !Number.isFinite(bestMs) || bestMs > 30 * 60_000) return null;
  return (
    <div className="eta-ribbon">
      <div className="eta-item">
        next: <b>{bestLabel}</b> in <span className="eta-t">~{formatDuration(bestMs)}</span>
      </div>
    </div>
  );
}

function BuffRow() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  if (s.buffs.length === 0 && s.activeEvents.length === 0) return null;
  return (
    <div className="buff-row">
      {s.activeEvents.map((e) => {
        const def = EVENT_BY_ID[e.id];
        return (
          <span key={e.id} className="buff-chip event">
            <img className="bc-art" src={EVENT_ART[e.id]} alt="" aria-hidden /> {def?.name}
            <span className="bc-t">{formatDuration(e.remainingMs)}</span>
          </span>
        );
      })}
      {s.buffs.map((b) => (
        <span key={b.id} className="buff-chip">
          {b.label} {b.mult > 1 ? `×${b.mult}` : `click ×${b.clickMult}`}
          <span className="bc-t">{formatDuration(b.remainingMs)}</span>
        </span>
      ))}
    </div>
  );
}

function VogonBanner() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  if (!s.vogon) return null;
  const line = VOGON_POEM_LINES[poemLine(s, VOGON_POEM_LINES.length)];
  const left = s.vogon.ships.filter((sh) => !sh.hit).length;
  const earth = Boolean(s.flags['earthDefenseActive']);
  return (
    <div className="vogon-banner">
      <img className="v-art" src={VOGON_ART} alt="" aria-hidden />
      <div className="v-kicker">
        {earth ? '⚠ DEMOLITION NOTICE — EARTH ⚠' : 'Vogon poetry reading in progress'} · −
        {Math.round(C.VOGON_DEBUFF * 100)}% production
      </div>
      <div className="v-line">“{line}”</div>
      <div className="v-hint">
        Click the constructor ships to end the reading. {left} remain{left === 1 ? 's' : ''}.
        {earth ? ' This one is personal.' : ''}
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useUiBus((b) => b.toasts);
  return (
    <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}${t.art ? ' has-art' : ''}`}>
          {t.art && (
            <img className="t-art" src={t.art} alt={t.artAlt ?? ''} />
          )}
          <div className="t-copy">
            {t.kicker && <div className="t-kicker">{t.kicker}</div>}
            <div className="t-title">{t.title}</div>
            {t.body && <div className="t-body">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Floats() {
  const floats = useUiBus((b) => b.floats);
  return (
    <>
      {floats.map((f) => (
        <div key={f.id} className="float-num" style={{ left: f.x, top: f.y }}>
          {f.text}
        </div>
      ))}
    </>
  );
}

function Flash() {
  const nonce = useUiBus((b) => b.flashNonce);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (nonce === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 700);
    return () => clearTimeout(t);
  }, [nonce]);
  if (!visible) return null;
  return <div className="flash-overlay" />;
}

export function HUD() {
  const rev = useGame((g) => g.rev);
  void rev;
  const tuText = useSmoothTu();
  const { s, d } = useGame.getState();
  const started = s.lifetime.clicks > 0 || s.lifetime.tuEarned.gt(0);
  if (!started) {
    return (
      <div className="hud-layer">
        <div className="cold-open-prompt">
          <span>GUIDE ENTRY 0</span>
          Touch the world. It has been waiting with admirable patience.
          <small>Restoring a universe? Use Settings without starting this one.</small>
        </div>
      </div>
    );
  }


  return (
    <div className="hud-layer">
      <div className="masthead">
        <div className="brand">
          <img className="brand-wordmark" src={BRAND_ASSETS.wordmark} alt="TerraClicker" />
        </div>
        <div className="tu-counter">
          <Num v={tuText} />
          <span className="unit">TU</span>
        </div>
        <div className="tu-rate">
          <b>
            <Num v={d.tuPerSec} />
          </b>
          /s · click <Num v={d.clickPower} />
        </div>
        {(d.sciencePerSec.gt(0) || s.science.gt(0)) && (
          <div className="sci-chip">
            <i className="science-mark">S</i> <b>{format(s.science)}</b> science · {format(d.sciencePerSec)}/s
          </div>
        )}
      </div>
      <Gauges />
      <UniverseHUD />
      <EtaRibbon />
      <BuffRow />
      <VogonBanner />
      <Toasts />
      <Floats />
      <Flash />
    </div>
  );
}
