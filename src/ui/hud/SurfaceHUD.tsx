/**
 * The suit's HUD: what a shore party sees.
 *
 * Reads surfaceLive imperatively on a short interval, like the rest of the
 * cockpit — the walk loop runs at frame rate and React has no business
 * rendering at it. Phase chrome:
 *
 *   entry    the canopy, a heat shimmer caption, and the Guide being calm
 *   descent  the approach readout while the ship glides itself in
 *   walk     reticle, compass, samples, and whatever the engage key means
 *   takeoff  the departure readout
 */
import { useEffect, useMemo, useState } from 'react';
import { useUiBus, type GroundfallSession } from '../fx/uiBus';
import {
  MINING_VERBS,
  SHIP_PARK,
  surfaceDeposits,
  surfaceLive,
  surfaceProspects,
  type MiningVerb,
} from '../scene/surface/surfaceControl';
import { SAMPLE_BY_ID } from '../../content/groundSamples';
import { flightPrefs, keyLabel } from '../scene/flightBindings';
import { useGame } from '../../state/store';
import { isGroundSurveyed } from '../../engine/groundfall';
import { C } from '../../content/constants';
import { Canopy } from './FlightHUD';

function engageKey(): string {
  return keyLabel(flightPrefs().bindings.engage[0] ?? 'KeyE').toUpperCase();
}

/** The Guide, on the subject of standing on things. */
const ENTRY_LINES: Record<string, string> = {
  terrestrial: 'The Guide notes that most air is breathable right up until it is not.',
  ice: 'The Guide recommends thick socks, and has nothing further to add.',
  desert: 'The Guide rates this landing "gritty, but character-building".',
  volcanic: 'The Guide files this world under "warm, with opinions".',
  ocean: 'The Guide reminds you that a beach is just a queue for an ocean.',
  gasgiant: 'This line should be unreachable. The Guide is thrilled.',
};

const WALK_HINT = 'move · run · jump — the helm keys, repurposed for legs';

const VERB_LABELS: Record<MiningVerb, string> = {
  break: 'quick break',
  core: 'precision core',
  prospect: 'prospect',
  preserve: 'preserve',
};

/** A compass marker: something with a bearing worth carrying. */
interface CompassMark {
  key: string;
  /** World bearing, degrees, 0 = north. */
  deg: number;
  distM: number;
  kind: 'ship' | 'site' | 'prospect';
}

/** Bearing (deg, 0=N, 90=E) from the walker to a ground point. */
function bearingTo(x: number, z: number): number {
  const dx = x - surfaceLive.pos.x;
  const dz = z - surfaceLive.pos.z;
  return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

/** Everything the compass should be carrying right now. */
function compassMarks(): CompassMark[] {
  const live = surfaceLive;
  const out: CompassMark[] = [
    {
      key: 'ship',
      deg: bearingTo(SHIP_PARK.x, SHIP_PARK.z),
      distM: Math.hypot(SHIP_PARK.x - live.pos.x, SHIP_PARK.z - live.pos.z),
      kind: 'ship',
    },
  ];
  for (const d of surfaceDeposits()) {
    if (!live.scanned.has(d.id) || live.mined.has(d.id)) continue;
    out.push({
      key: d.id,
      deg: bearingTo(d.x, d.z),
      distM: Math.hypot(d.x - live.pos.x, d.z - live.pos.z),
      kind: 'site',
    });
  }
  for (const d of surfaceProspects()) {
    out.push({
      key: `p:${d.id}`,
      deg: bearingTo(d.x, d.z),
      distM: Math.hypot(d.x - live.pos.x, d.z - live.pos.z),
      kind: 'prospect',
    });
  }
  return out;
}

export function SurfaceHUD() {
  const session = useUiBus((b) => b.groundfall);
  if (!session) return null;
  return <SurfaceHUDInner session={session} />;
}

function SurfaceHUDInner({ session }: { session: GroundfallSession }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 120);
    return () => window.clearInterval(id);
  }, []);

  const surveyed = useGame((g) => isGroundSurveyed(g.s, session.worldKey));
  const live = surfaceLive;
  const entryLine = useMemo(
    () => ENTRY_LINES[session.type] ?? ENTRY_LINES['terrestrial']!,
    [session.type],
  );

  if (live.phase === 'entry') {
    const pct = Math.round(live.genProgress * 100);
    return (
      <div className="sh-hud" aria-live="polite">
        <Canopy />
        <div className="sh-entry">
          <div className="sh-kicker">ATMOSPHERIC INTERFACE</div>
          <div className="sh-title">{session.name}</div>
          <div className="sh-line">{entryLine}</div>
          <div className="sh-progress" role="progressbar" aria-valuenow={pct}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="sh-sub">hull temperature: reassuring shade of orange · surveying terrain {pct}%</div>
        </div>
      </div>
    );
  }

  if (live.phase === 'descent' || live.phase === 'takeoff') {
    const leaving = live.phase === 'takeoff';
    return (
      <div className="sh-hud" aria-live="polite">
        <div className="sh-entry">
          <div className="sh-kicker">{leaving ? 'DEPARTURE' : 'ON FINAL'}</div>
          <div className="sh-title">{session.name}</div>
          <div className="sh-alt">{Math.max(0, Math.round(live.alt)).toLocaleString()} m</div>
          <div className="sh-line">
            {leaving
              ? 'The runabout files the surface under "visited" and means it as a compliment.'
              : 'The autoland would like everyone to remain impressed but seated.'}
          </div>
        </div>
      </div>
    );
  }

  // ————— On foot —————
  const heading = ((-live.yaw * 180) / Math.PI % 360 + 360) % 360;
  const prompt = live.prompt;
  const mining = prompt?.verb === 'mine' && live.mineProgress > 0;
  const scanning = live.scanCharge > 0;
  const locked = typeof document !== 'undefined' && document.pointerLockElement != null;
  const surveyNeed = C.GROUND_SURVEY_SAMPLES;
  const surveyProgress = Math.min(surveyNeed, live.surveyCredit);

  // The haul, aggregated by kind for the ledger. Three lines, then "and more".
  const carried = new Map<string, number>();
  for (const h of live.haul) carried.set(h.kind, (carried.get(h.kind) ?? 0) + h.n);
  const carriedRows = [...carried.entries()].sort((a, b) => b[1] - a[1]);

  const target = live.target;
  const targetScanned = target != null && live.scanned.has(target.id);
  const targetKind = targetScanned ? SAMPLE_BY_ID[target.kind] : undefined;
  const ringProgress = scanning ? live.scanCharge : live.mineProgress;

  return (
    <div className="sh-hud">
      <Compass heading={heading} marks={compassMarks()} />

      <div className={`sh-reticle${mining || scanning ? ' working' : ''}${scanning ? ' scanning' : ''}`} aria-hidden>
        <svg viewBox="0 0 48 48">
          <circle className="sh-ret-dot" cx="24" cy="24" r="1.6" />
          <circle
            className="sh-ret-ring"
            cx="24"
            cy="24"
            r="14"
            style={{
              strokeDasharray: 88,
              strokeDashoffset: 88 * (1 - ringProgress),
            }}
          />
        </svg>
      </div>

      <div className="sh-samples">
        <b>{live.samples}</b> samples
        {carriedRows.slice(0, 3).map(([kind, n]) => (
          <em key={kind}>
            {n}× {SAMPLE_BY_ID[kind]?.name ?? kind}
          </em>
        ))}
        {carriedRows.length > 3 && <em>… and {carriedRows.length - 3} more kinds</em>}
        <em>
          {surveyed
            ? 'ground survey on file'
            : `survey: ${surveyProgress}/${surveyNeed} credit to file`}
        </em>
        <em className="sh-world">{session.name} · on foot</em>
      </div>

      {targetScanned && targetKind && (
        <div className="sh-assay">
          <span className="sh-assay-kind">◈ {targetKind.name}</span>
          <span className="sh-assay-sub">seam of {target.richness} · {targetKind.salvage} salvage each</span>
          <div className="sh-verbs" role="radiogroup" aria-label="extraction method">
            {MINING_VERBS.map((v, i) => (
              <span key={v} className={`sh-verb${i === live.verbIdx ? ' on' : ''}`} aria-checked={i === live.verbIdx} role="radio">
                {VERB_LABELS[v]}
              </span>
            ))}
          </div>
          <span className="sh-assay-hint">wheel — choose method</span>
        </div>
      )}

      {prompt && (
        <div className={`sh-prompt${prompt.blocked ? ' blocked' : ''}`}>
          {prompt.blocked ?? `${prompt.verb === 'board' ? 'press' : 'hold'} ${engageKey()} — ${prompt.label}`}
        </div>
      )}
      {!prompt && !locked && <div className="sh-prompt dim">click to look around</div>}
      {!prompt && locked && !scanning && (
        <div className="sh-prompt dim">hold {engageKey()} — field scan · {Math.round(live.scanRange)} m</div>
      )}
      {scanning && !prompt && <div className="sh-prompt">field scan charging…</div>}

      <div className="sh-hint">{WALK_HINT}</div>
    </div>
  );
}

/** Signed shortest offset from the current heading, wrapped to ±180. */
function wrapOffset(deg: number, heading: number): number {
  let off = deg - heading;
  if (off > 180) off -= 360;
  if (off < -180) off += 360;
  return off;
}

const MARK_GLYPH: Record<CompassMark['kind'], string> = {
  ship: '▲',
  site: '◆',
  prospect: '▮',
};

/**
 * A sliding tape compass; ticks every 15°, cardinals where they fall, and a
 * marker layer riding under the tape — the runabout always, every site the
 * scanner has resolved, every prospect stake standing.
 */
function Compass({ heading, marks }: { heading: number; marks: CompassMark[] }) {
  const ticks = useMemo(() => {
    const out: { deg: number; label: string | null }[] = [];
    for (let d = 0; d < 360; d += 15) {
      const label = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : null;
      out.push({ deg: d, label });
    }
    return out;
  }, []);
  const PX_PER_DEG = 2.4;
  return (
    <div className="sh-compass" aria-label={`heading ${Math.round(heading)} degrees`}>
      <div className="sh-compass-window">
        {ticks.map((t) => {
          const off = wrapOffset(t.deg, heading);
          if (Math.abs(off) > 70) return null;
          return (
            <span
              key={t.deg}
              className={`sh-tick${t.label ? ' cardinal' : ''}`}
              style={{ transform: `translateX(${off * PX_PER_DEG}px)` }}
            >
              {t.label ?? '·'}
            </span>
          );
        })}
        <i className="sh-lubber" />
      </div>
      <div className="sh-marks">
        {marks.map((m) => {
          const off = wrapOffset(m.deg, heading);
          if (Math.abs(off) > 70) return null;
          const dist = m.distM >= 950 ? `${(m.distM / 1000).toFixed(1)}k` : `${Math.round(m.distM)}m`;
          return (
            <span
              key={m.key}
              className={`sh-mark ${m.kind}`}
              style={{ transform: `translateX(${off * PX_PER_DEG}px)` }}
            >
              {MARK_GLYPH[m.kind]}
              <i>{dist}</i>
            </span>
          );
        })}
      </div>
      <div className="sh-compass-deg">{Math.round(heading).toString().padStart(3, '0')}°</div>
    </div>
  );
}
