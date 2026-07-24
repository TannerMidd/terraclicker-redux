import { actions, useGame } from '../../state/store';
import { RESEARCH, RESEARCH_BY_ID } from '../../content/research';
import { format, formatDuration } from '../../engine/num';
import { researchIcon } from '../assets';

export function ResearchPanel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s, d } = useGame.getState();
  const active = s.research.active;
  const activeDef = active ? RESEARCH_BY_ID[active.id] : null;

  const hasLab = (s.buildings['researchLab'] ?? 0) > 0;

  const available = RESEARCH.filter((r) => {
    if (s.research.completed.includes(r.id)) return false;
    if (r.requiresResearch && !s.research.completed.includes(r.requiresResearch)) return false;
    if (r.requiresBuilding) {
      for (const [bid, n] of Object.entries(r.requiresBuilding)) {
        if ((s.buildings[bid] ?? 0) < n) return false;
      }
    }
    return true;
  });

  if (!hasLab && s.research.completed.length === 0 && !active) {
    return (
      <div>
        <div className="panel-h">Research</div>
        <p className="panel-sub">
          Build a Research Laboratory and the mice will take it from there. They usually do.
        </p>
      </div>
    );
  }

  return (
    <div>
      {active && activeDef && (
        <div className="research-active">
          <div className="ra-name">{activeDef.name}</div>
          {activeDef.survivesPrestige && <div className="r-dur">Deep Thought metaproject | survives commission sale</div>}
          <div className="r-dur">
            {formatDuration(active.remainingMs / d.researchSpeedMult)} remaining
          </div>
          <div className="progress-track">
            <div
              className="progress-bar"
              style={{
                width: `${(100 * (1 - active.remainingMs / activeDef.durationMs)).toFixed(1)}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="panel-h">Available Projects</div>
      {available.length === 0 && <p className="panel-sub">The mice are between grants.</p>}
      {available.map((r) => {
        const affordable = s.science.gte(r.costScience) && !active;
        return (
          <button
            key={r.id}
            className="research-item"
            disabled={!affordable}
            onClick={() => actions.startResearch(r.id)}
          >
            <img className="r-icon" src={researchIcon(r.id)} alt="" aria-hidden />
            <div className="r-copy">
              <div className="r-row">
                <span className="r-name">{r.name}</span>
                <span className="r-cost"><i className="science-mark">S</i> {format(r.costScience)}</span>
              </div>
              <div className="r-desc">{r.guide}</div>
              <div className="r-dur">
                takes {formatDuration(r.durationMs / d.researchSpeedMult)}
                {r.survivesPrestige ? ' | persists across commissions' : ''}
                {active ? ' · queue busy' : ''}
              </div>
            </div>
          </button>
        );
      })}

      {s.research.completed.length > 0 && (
        <>
          <div className="panel-h">Completed</div>
          <div className="research-done">
            {s.research.completed.map((id) => (
              <div key={id}>
                <b>✓ {RESEARCH_BY_ID[id]?.name ?? id}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
