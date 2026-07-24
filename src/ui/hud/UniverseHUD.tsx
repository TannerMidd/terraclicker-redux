import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../state/store';
import { useUiBus, zoomLive, type FocusTarget } from '../fx/uiBus';
import { BAND_STOPS, starClass } from '../scene/universeLayout';
import { exitFocus, focusOn } from '../scene/universe/shared';
import {
  SPECIALTY_VISUAL,
  operationsVisual,
  specialtyFor,
  specialtySummary,
} from '../scene/universe/operationsVisual';
import { C } from '../../content/constants';

const RAIL_LABELS = ['the planet', 'the system', 'the neighbourhood', 'the galaxies', 'everything else'];

function stageName(bestGalaxies: number): string {
  if (bestGalaxies >= 10) return 'Cosmic Web Age';
  if (bestGalaxies >= 6) return 'Supercluster Age';
  if (bestGalaxies >= 3) return 'Cluster Age';
  if (bestGalaxies >= 1) return 'Early Galaxy Age';
  return 'Local System';
}

/** Ancestry row for a visit: everything › galaxy N › system M. */
function Crumbs({
  galaxy,
  current,
}: {
  galaxy: number | null;
  current: string;
}) {
  return (
    <div className="uc-crumbs">
      <button className="uc-crumb" onClick={() => exitFocus()}>
        everything
      </button>
      {galaxy !== null && (
        <>
          <span className="uc-sep">›</span>
          <button
            className="uc-crumb"
            onClick={() => focusOn({ kind: 'galaxy', index: galaxy })}
          >
            galaxy {galaxy + 1}
          </button>
        </>
      )}
      <span className="uc-sep">›</span>
      <span className="uc-crumb here">{current}</span>
    </div>
  );
}

/** Caption while visiting a galaxy or system — the Guide does introductions. */
function FocusCaption({ focus }: { focus: FocusTarget }) {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();

  if (focus.kind === 'galaxy') {
    return (
      <div className="uni-caption" key={`fg-${focus.index}`}>
        <Crumbs galaxy={null} current={`galaxy ${focus.index + 1}`} />
        <div className="uc-kicker">galaxy {focus.index + 1} — formed, filed, yours</div>
        <div className="uc-line">
          {C.SYSTEMS_PER_GALAXY * C.PLANETS_PER_SYSTEM} worlds across{' '}
          {C.SYSTEMS_PER_GALAXY} systems · ×{C.GALAXY_MULT} production, in perpetuity
        </div>
        <div className="uc-foot">click a star to visit its worlds · esc steps back out</div>
      </div>
    );
  }

  const records = s.run.completedPlanets.slice(
    focus.index * C.PLANETS_PER_SYSTEM,
    (focus.index + 1) * C.PLANETS_PER_SYSTEM,
  );
  const galaxy =
    focus.index < s.run.galaxies * C.SYSTEMS_PER_GALAXY
      ? Math.floor(focus.index / C.SYSTEMS_PER_GALAXY)
      : null;
  const seed = records[0]?.seed ?? focus.index + 1;
  const specialty = specialtyFor(s, focus.index);
  const dispatchSummary = specialtySummary(specialty);
  return (
    <div className="uni-caption" key={`fs-${focus.index}`}>
      <Crumbs galaxy={galaxy} current={`system ${focus.index + 1}`} />
      <div className="uc-kicker">
        system {focus.index + 1}
        {galaxy !== null ? ` · galaxy ${galaxy + 1}` : ' · the neighbourhood'}
        {specialty ? ` · ${SPECIALTY_VISUAL[specialty].shortLabel} dispatch` : ''}
      </div>
      <div className="uc-line">
        {starClass(seed)} · {records.length} worlds, every one of them finished and still turning
        {dispatchSummary ? ` · ${dispatchSummary}` : ''}
      </div>
      <div className="uc-foot">{records.map((r) => r.name).join(' · ')}</div>
    </div>
  );
}

function Caption({ band }: { band: number }) {
  const rev = useGame((g) => g.rev);
  void rev;
  const cine = useUiBus((b) => b.activeCinematic);
  const { s } = useGame.getState();

  // While a ceremony plays, narrate the ceremony.
  if (cine) {
    return (
      <div className="uni-caption" key={`cine-${cine.id}`}>
        <div className="uc-kicker">
          {cine.kind === 'system' ? `system ${cine.index + 1} — formed` : `galaxy ${cine.index + 1} — forming`}
        </div>
        <div className="uc-line">
          {cine.kind === 'system'
            ? 'Five worlds spiral in. The star signs for them.'
            : 'Five stars agree to a spiral. The paperwork is gravitational.'}
        </div>
      </div>
    );
  }
  const systems = s.run.systems;
  const galaxies = s.run.galaxies;
  const worldsToward = s.run.completedPlanets.length - systems * C.PLANETS_PER_SYSTEM;
  const systemsToward = systems - galaxies * C.SYSTEMS_PER_GALAXY;
  const pct = 100 * (1 - Math.exp(-s.lifetime.bestGalaxies / 6));
  const assignments = Object.keys(operationsVisual(s).systemSpecialties).filter(
    (key) => Number(key) >= 0 && Number(key) < systems,
  ).length;

  let kicker = '';
  let line = '';
  let foot: string | null = null;
  switch (band) {
    case 1:
      kicker = `system ${systems + 1} — assembling`;
      line =
        worldsToward === 0
          ? 'Awaiting its first finished world. The star is patient. The star has no choice.'
          : `${worldsToward} of ${C.PLANETS_PER_SYSTEM} worlds delivered · the star settles at five`;
      break;
    case 2:
      kicker = 'the neighbourhood';
      line = `${systems} system${systems === 1 ? '' : 's'} formed · +${Math.round(C.SYSTEM_BONUS * 100)}% production each${
        galaxies > 0 ? ` · ${galaxies * C.SYSTEMS_PER_GALAXY} folded into galaxies` : ''
      }${assignments > 0 ? ` · ${assignments} dispatch route${assignments === 1 ? '' : 's'} active` : ''}`;
      if (systemsToward > 0)
        foot = `next galaxy: ${systemsToward} of ${C.SYSTEMS_PER_GALAXY} systems gathered — gravity has expressed interest`;
      break;
    case 3:
      kicker = 'the galaxies';
      line =
        galaxies === 0
          ? 'None yet. The spiral arms are entirely theoretical, like most good things.'
          : `${galaxies} galax${galaxies === 1 ? 'y' : 'ies'} · ×${C.GALAXY_MULT} production each · visible from a tasteful distance`;
      break;
    case 4:
      kicker = 'the whole sort of general mish mash';
      line = `${pct < 0.01 ? '0.000' : pct.toFixed(pct < 1 ? 3 : 1)}% of the universe terraformed · ${stageName(s.lifetime.bestGalaxies)}`;
      foot = 'You are here.';
      break;
    default:
      return null;
  }
  return (
    <div className="uni-caption" key={band}>
      <div className="uc-kicker">{kicker}</div>
      <div className="uc-line">{line}</div>
      {foot && <div className={`uc-foot${band === 4 ? ' here' : ''}`}>{foot}</div>}
    </div>
  );
}

/**
 * DOM chrome for the perspective journey: scale-band captions, the zoom
 * rail (click a stop to travel there — also the mobile zoom control), and
 * the nameplate tooltip for whatever the pointer is resting on.
 */
export function UniverseHUD() {
  const inspect = useUiBus((b) => b.inspect);
  const focus = useUiBus((b) => b.focus);
  const [band, setBand] = useState(0);
  const bandRef = useRef(0);
  const capWrap = useRef<HTMLDivElement>(null);
  const railFill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const z = zoomLive.v;
      if (zoomLive.band !== bandRef.current) {
        bandRef.current = zoomLive.band;
        setBand(zoomLive.band);
      }
      if (capWrap.current) {
        // A visit always narrates, even if the parked journey zoom is shallow.
        const vis = useUiBus.getState().focus
          ? 1
          : Math.max(0, Math.min(1, (z - 0.1) / 0.09));
        capWrap.current.style.opacity = String(vis);
      }
      if (railFill.current) railFill.current.style.height = `${(z * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div className={`zoom-rail${band > 0 ? ' engaged' : ''}`}>
        <div className="zr-track">
          <div ref={railFill} className="zr-fill" />
        </div>
        {BAND_STOPS.map((stop, i) => (
          <button
            key={i}
            className={`zr-stop${band === i ? ' on' : ''}`}
            style={{ top: `${stop * 100}%` }}
            title={RAIL_LABELS[i]}
            onClick={() => useUiBus.getState().setZoom(stop)}
          >
            <span className="zr-dot" />
            <span className="zr-label">{RAIL_LABELS[i]}</span>
          </button>
        ))}
      </div>
      <div ref={capWrap} className="uni-caption-wrap" style={{ opacity: 0 }}>
        {focus ? <FocusCaption focus={focus} /> : <Caption band={band} />}
      </div>
      {inspect && (
        <div
          className="inspect-tip"
          style={{
            left: Math.min(inspect.x + 16, window.innerWidth - 240),
            top: Math.max(12, inspect.y - 14),
          }}
        >
          <div className="it-title">{inspect.title}</div>
          <div className="it-sub">{inspect.sub}</div>
        </div>
      )}
    </>
  );
}
