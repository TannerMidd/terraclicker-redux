import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../state/store';
import { useUiBus, zoomLive } from '../fx/uiBus';
import { BAND_STOPS } from '../scene/universeLayout';
import { C } from '../../content/constants';

const RAIL_LABELS = ['the planet', 'the system', 'the neighbourhood', 'the galaxies', 'everything else'];

function stageName(bestGalaxies: number): string {
  if (bestGalaxies >= 10) return 'Cosmic Web Age';
  if (bestGalaxies >= 6) return 'Supercluster Age';
  if (bestGalaxies >= 3) return 'Cluster Age';
  if (bestGalaxies >= 1) return 'Early Galaxy Age';
  return 'Local System';
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
      }`;
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
        capWrap.current.style.opacity = String(Math.max(0, Math.min(1, (z - 0.1) / 0.09)));
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
        <Caption band={band} />
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
