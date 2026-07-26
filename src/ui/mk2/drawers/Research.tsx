/**
 * RD · Research.
 *
 * One project at a time, which is the whole shape of the drawer: what is
 * running goes in a lit box at the top with its own clock, everything else is
 * a queue that is explicitly told it is waiting, and what is finished becomes
 * a row of chips you can read in one sweep rather than a list you scroll.
 *
 * A project that survives the commission sale says so twice — in the queue and
 * on its chip — because that is the only property here worth planning around.
 */
import { actions, useGame } from '../../../state/store';
import { RESEARCH, RESEARCH_BY_ID } from '../../../content/research';
import { format, formatDuration } from '../../../engine/num';
import { researchIcon } from '../../assets';

export function Research() {
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
      <p className="dr-note">
        Build a Research Laboratory and the mice will take it from there. They usually do.
      </p>
    );
  }

  return (
    <>
      {active && activeDef && (
        <div className="dr-card lit">
          <div className="dr-card-head">
            <span className="dr-sec-k" style={{ color: 'var(--atmo)' }}>In progress</span>
            <span className="dr-card-clock">
              {formatDuration(active.remainingMs / d.researchSpeedMult)} remaining
            </span>
          </div>
          <div className="dr-card-name">{activeDef.name}</div>
          <div className="dr-card-body">{activeDef.guide}</div>
          {activeDef.survivesPrestige && (
            <div className="dr-card-note" style={{ color: 'var(--magrathea)' }}>
              Deep Thought metaproject — survives the commission sale.
            </div>
          )}
          <div className="dr-meter">
            <i style={{ width: `${(100 * (1 - active.remainingMs / activeDef.durationMs)).toFixed(1)}%` }} />
          </div>
        </div>
      )}

      <div className="dr-sec">
        <span className="dr-sec-k">Available projects</span>
        <span className="dr-rule" />
        <span className="dr-sec-note">{active ? 'QUEUE BUSY' : `${available.length} OPEN`}</span>
      </div>

      {available.length === 0 && <p className="dr-note">The mice are between grants.</p>}

      {available.map((r) => {
        const afford = s.science.gte(r.costScience) && !active;
        return (
          <button
            key={r.id}
            className={`dr-row${afford ? ' on' : ''}`}
            disabled={!afford}
            onClick={() => actions.startResearch(r.id)}
          >
            <img className="dr-row-icon" src={researchIcon(r.id)} alt="" aria-hidden />
            <span className="dr-row-copy">
              <span className="dr-row-name"><b>{r.name}</b></span>
              <span className="dr-row-desc">{r.guide}</span>
              <span className="dr-chips">
                <span>TAKES {formatDuration(r.durationMs / d.researchSpeedMult)}</span>
                {r.survivesPrestige && (
                  <span style={{ color: 'var(--magrathea)' }}>PERSISTS</span>
                )}
              </span>
            </span>
            <span className="dr-row-cost">
              <b style={{ color: afford ? 'var(--atmo)' : 'var(--ink-dim)' }}>{format(r.costScience)}</b>
              <span>SCIENCE</span>
            </span>
          </button>
        );
      })}

      {s.research.completed.length > 0 && (
        <>
          <div className="dr-sec">
            <span className="dr-sec-k">Concluded</span>
            <span className="dr-rule" />
            <span className="dr-sec-note">{s.research.completed.length}</span>
          </div>
          <div className="dr-chipwrap">
            {s.research.completed.map((id) => {
              const def = RESEARCH_BY_ID[id];
              const persists = Boolean(def?.survivesPrestige);
              return (
                <span
                  key={id}
                  className="dr-chip"
                  style={persists ? { borderColor: 'rgba(179,107,255,.4)', color: 'var(--magrathea)' } : undefined}
                >
                  <i style={{ color: persists ? 'var(--magrathea)' : 'var(--bio)' }}>✓</i>
                  {def?.name ?? id}
                  {persists ? ' · persists' : ''}
                </span>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
