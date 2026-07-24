import { useGame } from '../../state/store';
import { format, formatDuration } from '../../engine/num';
import { Num } from '../bits';

export function OfflineModal() {
  const report = useGame((g) => g.offlineReport);
  const dismiss = useGame((g) => g.dismissOfflineReport);
  if (!report) return null;
  return (
    <div className="modal-veil" onClick={dismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>While you were hitchhiking…</h2>
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
        {report.planetsCompleted > 0 && (
          <p className="m-body">
            {report.planetsCompleted} planet{report.planetsCompleted === 1 ? '' : 's'} completed
            in your absence. They did not wait for a speech.
          </p>
        )}
        <div className="m-actions">
          <button className="btn" onClick={dismiss}>
            Resume the work
          </button>
        </div>
      </div>
    </div>
  );
}
