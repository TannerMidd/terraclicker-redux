import { useEffect, useRef } from 'react';
import { ACHIEVEMENT_BY_ID } from '../../content/achievements';
import {
  CONTRACT_TEMPLATE_META,
  FACTION_META,
  contractRewardText,
} from '../../content/contracts';
import { RESEARCH_BY_ID } from '../../content/research';
import { useGame } from '../../state/store';
import { format, formatDuration } from '../../engine/num';
import { Num } from '../bits';
import { circularSummary } from '../../engine/circular';
import { actions } from '../../state/store';
import { useUiBus } from '../fx/uiBus';
import type { CircularItem } from '../../engine/circular';

/**
 * The Morning Circular, at the top of the report, because it is the part that
 * asks something of you. Everything below it is the accounting.
 *
 * Each line that can be acted on carries the action: pin it on the chart, or
 * open the panel that answers it. A briefing that tells you a rig is full and
 * then makes you go and find it is a briefing that has wasted your time.
 */
function Circular({ items, onGo }: { items: readonly CircularItem[]; onGo: () => void }) {
  if (items.length === 0) return null;
  return (
    <div className="m-circular">
      <div className="mc-kicker">the morning circular</div>
      <p className="mc-summary">{circularSummary(items)}</p>
      <ul className="mc-list">
        {items.map((item, i) => (
          <li key={`${item.kind}-${i}`} className={`mc-${item.kind}`}>
            <span>{item.text}</span>
            {item.waypoint && (
              <button
                onClick={() => {
                  actions.setWaypoint(item.waypoint!);
                  onGo();
                }}
              >
                pin it
              </button>
            )}
            {!item.waypoint && item.panel && (
              <button
                onClick={() => {
                  useUiBus.getState().setDockTab(item.panel!);
                  onGo();
                }}
              >
                open {item.panel.toLowerCase()}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
const ASPECT_LABELS = {
  thermal: 'Thermal',
  atmo: 'Atmospheric',
  hydro: 'Hydrologic',
  bio: 'Biotic',
} as const;

export function OfflineModal() {
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
  const shownWorlds = report.planetNames.slice(0, 4);
  const hiddenWorlds = Math.max(0, report.planetNames.length - shownWorlds.length);
  const researchNames = report.researchCompleted
    .map((id) => RESEARCH_BY_ID[id]?.name)
    .filter((name): name is string => Boolean(name));
  const achievementNames = report.achievementsUnlocked
    .map((id) => ACHIEVEMENT_BY_ID[id]?.name)
    .filter((name): name is string => Boolean(name));
  const hasOfflineOperations = report.completedContracts.length > 0
    || report.failedContracts.length > 0;

  return (
    <div className="modal-veil" onClick={dismiss}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="While you were hitchhiking"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>While you were hitchhiking…</h2>
        <Circular items={report.circular} onGo={dismiss} />
        <p className="m-body">
          The operation missed you productively for{' '}
          <b>{formatDuration(report.simulatedMs)}</b>
          {report.cappedMs > 60_000 && (
            <>
              {' '}
              (a further {formatDuration(report.cappedMs)} exceeded the filed absence forms and
              was, regrettably, unpaid)
            </>
          )}
          .
        </p>
        <div className="m-stat">
          +<Num v={format(report.tuGained)} /> TU
        </div>
        {report.scienceGained.gt(0) && (
          <div className="m-stat">
            +<Num v={format(report.scienceGained)} /> Science
          </div>
        )}
        {report.planetsCompleted > 0 && (
          <p className="m-body">
            {report.planetsCompleted} planet{report.planetsCompleted === 1 ? '' : 's'} completed
            in your absence. They did not wait for a speech.
          </p>
        )}
        {shownWorlds.length > 0 && (
          <p className="m-body">
            Filed: {shownWorlds.join(', ')}
            {hiddenWorlds > 0
              ? `, and ${hiddenWorlds} further world${hiddenWorlds === 1 ? '' : 's'}`
              : ''}
            .
          </p>
        )}
        {(report.systemsFormed > 0 || report.galaxiesFormed > 0) && (
          <p className="m-body">
            Portfolio growth: {report.systemsFormed} new system
            {report.systemsFormed === 1 ? '' : 's'}
            {report.galaxiesFormed > 0
              ? ` and ${report.galaxiesFormed} new galax${report.galaxiesFormed === 1 ? 'y' : 'ies'}`
              : ''}
            .
          </p>
        )}
        {hasOfflineOperations && (
          <section className="offline-operations" aria-labelledby="offline-operations-heading">
            <h3 id="offline-operations-heading">Operations filed while away</h3>
            <ul className="offline-contract-list">
              {report.completedContracts.map((contract, index) => (
                <li key={`${contract.templateId}-completed-${index}`}>
                  <div className="offline-contract-main">
                    <b>{CONTRACT_TEMPLATE_META[contract.templateId].name}</b>
                    <span>{FACTION_META[contract.faction].label} approved</span>
                  </div>
                  <div className="offline-contract-reward">
                    {contractRewardText(contract.rewardBp, contract.rewardReputation)}
                  </div>
                </li>
              ))}
              {report.failedContracts.map((contract, index) => {
                const filingNote = contract.reason === 'deadline'
                  ? 'Filing window expired; no TU, BP, or reputation was deducted.'
                  : contract.reason === 'abandoned'
                    ? 'Withdrawn without penalty.'
                    : 'Closed when the commission was sold; no penalty.';
                return (
                  <li key={`${contract.templateId}-failed-${index}`}>
                    <div className="offline-contract-main">
                      <b>{CONTRACT_TEMPLATE_META[contract.templateId].name} closed</b>
                      <span>{filingNote}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {researchNames.length > 0 && (
          <p className="m-body">Research concluded: {researchNames.join(', ')}.</p>
        )}
        {achievementNames.length > 0 && (
          <p className="m-body">Guide entries filed: {achievementNames.join(', ')}.</p>
        )}
        <p className="m-body">
          Current recommendation: review the <b>{ASPECT_LABELS[report.bottleneck]}</b> department.
          It has submitted the least convincing paperwork.
        </p>
        <div className="m-actions">
          <button className="btn" onClick={dismiss}>
            Resume the work
          </button>
        </div>
      </div>
    </div>
  );
}
