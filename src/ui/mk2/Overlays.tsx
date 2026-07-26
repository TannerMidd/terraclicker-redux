/**
 * The two overlays that take the whole device.
 *
 * THE MORNING CIRCULAR is an absence report, and its order is an argument:
 * the three headline readings, then the circular — the part that asks
 * something of you and carries the button to answer it — and only then the
 * accounting. A briefing that tells you a rig is full and then makes you go
 * and find it has wasted your time.
 *
 * THE COLD OPEN is the first thing anybody sees, so it is the one screen in
 * the game with no chrome at all: the cover of the book, one instruction, and
 * a way past it for somebody who is here to restore a save rather than start.
 */
import { useEffect, useRef } from 'react';
import { ACHIEVEMENT_BY_ID } from '../../content/achievements';
import { CONTRACT_TEMPLATE_META, FACTION_META, contractRewardText } from '../../content/contracts';
import { RESEARCH_BY_ID } from '../../content/research';
import { actions, useGame } from '../../state/store';
import { format, formatDuration } from '../../engine/num';
import { circularSummary } from '../../engine/circular';
import { useUiBus } from '../fx/uiBus';
import { BRAND_ASSETS } from '../assets';

const ASPECT_LABELS = {
  thermal: 'Thermal',
  atmo: 'Atmospheric',
  hydro: 'Hydrologic',
  bio: 'Biotic',
} as const;

const ASPECT_COLOR = {
  thermal: 'var(--thermal)',
  atmo: 'var(--atmo)',
  hydro: 'var(--hydro)',
  bio: 'var(--bio)',
} as const;

/** What each kind of circular line is worth looking at for. */
const CIRCULAR_TONE: Record<string, string> = {
  salvage: 'var(--bio)',
  petition: 'var(--improbable)',
  contract: 'var(--atmo)',
  rumour: 'var(--line-3)',
};

export function MorningCircular() {
  const report = useGame((g) => g.offlineReport);
  const dismiss = useGame((g) => g.dismissOfflineReport);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!report) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismiss, report]);

  if (!report) return null;

  const worlds = report.planetNames.slice(0, 4);
  const hidden = Math.max(0, report.planetNames.length - worlds.length);
  const research = report.researchCompleted
    .map((id) => RESEARCH_BY_ID[id]?.name)
    .filter((n): n is string => Boolean(n));
  const entries = report.achievementsUnlocked
    .map((id) => ACHIEVEMENT_BY_ID[id]?.name)
    .filter((n): n is string => Boolean(n));
  const contracts = report.completedContracts.length > 0 || report.failedContracts.length > 0;

  return (
    <div className="mk2-veil" onClick={dismiss}>
      <div
        ref={dialogRef}
        className="mk2-report"
        role="dialog"
        aria-modal="true"
        aria-label="While you were hitchhiking"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mk2-report-head">
          <div className="k">Absence report · form 7-A</div>
          <h2>While you were hitchhiking…</h2>
          <p>
            The operation missed you productively for{' '}
            <b>{formatDuration(report.simulatedMs)}</b>
            {report.cappedMs > 60_000 && (
              <>
                . A further {formatDuration(report.cappedMs)} exceeded the filed absence forms
                and was, regrettably, unpaid
              </>
            )}
            .
          </p>
        </header>

        <div className="mk2-report-stats">
          <div>
            <b style={{ color: 'var(--bio)' }}>+{format(report.tuGained)}</b>
            <span>TU EARNED</span>
          </div>
          <div>
            <b style={{ color: 'var(--atmo)' }}>+{format(report.scienceGained)}</b>
            <span>SCIENCE</span>
          </div>
          <div>
            <b>{report.planetsCompleted}</b>
            <span>WORLDS DELIVERED</span>
          </div>
        </div>

        {report.circular.length > 0 && (
          <>
            <div className="mk2-report-sec">
              <span className="k" style={{ color: 'var(--magrathea)' }}>The Morning Circular</span>
            </div>
            <p className="mk2-report-lede">{circularSummary(report.circular)}</p>
            <div className="mk2-report-lines">
              {report.circular.map((item, i) => (
                <div key={`${item.kind}-${i}`} className={`mk2-circ${item.kind === 'rumour' ? ' quiet' : ''}`}>
                  <span style={{ background: CIRCULAR_TONE[item.kind] ?? 'var(--line-3)' }} />
                  <span className="mk2-circ-text">{item.text}</span>
                  {item.waypoint && (
                    <button
                      onClick={() => {
                        actions.setWaypoint(item.waypoint!);
                        dismiss();
                      }}
                    >
                      PIN IT
                    </button>
                  )}
                  {!item.waypoint && item.panel && (
                    <button
                      onClick={() => {
                        useUiBus.getState().setDockTab(item.panel!);
                        dismiss();
                      }}
                    >
                      OPEN {item.panel.toUpperCase()}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mk2-report-sec">
          <span className="k">The accounting</span>
        </div>
        <div className="mk2-report-body">
          {worlds.length > 0 && (
            <p>
              Filed: {worlds.map((w, i) => (
                <span key={w}>
                  <b>{w}</b>
                  {i < worlds.length - 1 ? ', ' : ''}
                </span>
              ))}
              {hidden > 0 ? `, and ${hidden} further world${hidden === 1 ? '' : 's'}` : ''}.
            </p>
          )}
          {(report.systemsFormed > 0 || report.galaxiesFormed > 0) && (
            <p>
              Portfolio growth: {report.systemsFormed} new system
              {report.systemsFormed === 1 ? '' : 's'}
              {report.galaxiesFormed > 0
                ? ` and ${report.galaxiesFormed} new galax${report.galaxiesFormed === 1 ? 'y' : 'ies'}`
                : ''}
              .
            </p>
          )}
          {contracts && (
            <>
              {report.completedContracts.map((c, i) => (
                <p key={`c${i}`}>
                  <b>{CONTRACT_TEMPLATE_META[c.templateId].name}</b> — {FACTION_META[c.faction].label}{' '}
                  approved, and paid {contractRewardText(c.rewardBp, c.rewardReputation)}.
                </p>
              ))}
              {report.failedContracts.map((c, i) => (
                <p key={`f${i}`}>
                  <b>{CONTRACT_TEMPLATE_META[c.templateId].name}</b> closed.{' '}
                  {c.reason === 'deadline'
                    ? 'The filing window expired; no TU, BP, or reputation was deducted.'
                    : c.reason === 'abandoned'
                      ? 'Withdrawn without penalty.'
                      : 'Closed when the commission was sold; no penalty.'}
                </p>
              ))}
            </>
          )}
          {research.length > 0 && <p>Research concluded: {research.join(', ')}.</p>}
          {entries.length > 0 && <p>Guide entries filed: {entries.join(', ')}.</p>}
          <p>
            Current recommendation: review the{' '}
            <b style={{ color: ASPECT_COLOR[report.bottleneck] }}>
              {ASPECT_LABELS[report.bottleneck]}
            </b>{' '}
            department. It has submitted the least convincing paperwork.
          </p>
        </div>

        <div className="mk2-report-foot">
          <button onClick={dismiss}>Resume the work</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The cold open. Shown until the world has been touched once — there is no
 * dismiss that skips into the game, because the instruction IS the game and
 * following it is one click. The way past is for somebody restoring a save,
 * which is why it leads to the department rather than to the desk.
 */
export function ColdOpen() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const started = s.lifetime.clicks > 0 || s.lifetime.tuEarned.gt(0);
  const dismissed = useUiBus((b) => b.coldOpenDismissed);
  if (started || dismissed) return null;

  return (
    <div className="mk2-coldopen-veil">
      <div className="mk2-coldopen-inner">
        <img src={BRAND_ASSETS.dontPanic} alt="DON’T PANIC" />
        <div className="k">Guide entry 0</div>
        <p className="mk2-coldopen-line">
          Touch the world. It has been waiting with admirable patience.
        </p>
        <p className="mk2-coldopen-sub">
          Restoring a universe? Use the department without starting this one.
        </p>
        <div className="mk2-coldopen-bar"><i /></div>
        <button onClick={() => useUiBus.getState().dismissColdOpen()}>SKIP TO THE DESK</button>
      </div>
    </div>
  );
}
