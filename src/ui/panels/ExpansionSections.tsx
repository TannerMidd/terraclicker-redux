/**
 * The three sections the expansion adds to Operations: what you are building
 * for years, what you are carrying today, and what is working while you are
 * not there.
 *
 * They live in Operations rather than in a new dock tab on purpose — the tab
 * strip is deliberately short enough never to scroll, and all three of these
 * are things a Magrathean operations office would already be handling.
 */
import { MEGAPROJECTS } from '../../content/megaprojects';
import { FREIGHT_BY_ID, SEAM_BY_ID } from '../../content/freight';
import { FACTION_META } from '../../content/contracts';
import { D, format, formatDuration } from '../../engine/num';
import { buildProgress, canStart, isBuilding, isBuilt } from '../../engine/megaprojects';
import { cargoCapacity, rigLimit, rigsStanding } from '../../engine/freight';
import { actions, useGame } from '../../state/store';

export function MegaprojectSection() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();

  return (
    <>
      <div className="panel-h">Megaprojects</div>
      <div className="heritage-rule">
        Commissioned once and built over days — including the days you are not here. A finished
        megaproject is not sold with the commission; it keeps working across every one that
        follows.
      </div>
      <div className="mega-list">
        {MEGAPROJECTS.map((def) => {
          const built = isBuilt(s, def.id);
          const building = isBuilding(s, def.id);
          const progress = buildProgress(s, def.id);
          const rep = s.operations.reputation[def.faction];
          const trusted = rep >= def.reputationRequired;
          const affordable = s.tu.gte(def.cost);
          const remaining = building
            ? Math.max(0, def.buildMs - (s.megaprojects[def.id]?.builtMs ?? 0))
            : def.buildMs;
          return (
            <div
              key={def.id}
              className={`mega-item${built ? ' done' : ''}${building ? ' building' : ''}`}
            >
              <div className="mega-head">
                <div className="mega-name">{def.name}</div>
                <div className="mega-faction">{FACTION_META[def.faction].label}</div>
              </div>
              <div className="mega-guide">{def.guide}</div>
              <div className="mega-effect">{def.effectText}</div>
              {built ? (
                <div className="mega-state done">Standing. It will outlast the commission.</div>
              ) : building ? (
                <>
                  <div className="mega-bar" aria-hidden>
                    <i style={{ width: `${progress * 100}%` }} />
                  </div>
                  <div className="mega-state">
                    {Math.floor(progress * 100)}% · {formatDuration(remaining)} remaining
                  </div>
                </>
              ) : (
                <div className="mega-buy">
                  <button
                    className="btn"
                    disabled={!canStart(s, def)}
                    onClick={() => actions.startMegaproject(def.id)}
                  >
                    Commission · {format(D(def.cost))} TU
                  </button>
                  <span className={trusted ? 'mega-gate met' : 'mega-gate'}>
                    {trusted
                      ? `${FACTION_META[def.faction].label} will sign`
                      : `needs ${def.reputationRequired} standing with ${FACTION_META[def.faction].label} (you have ${rep})`}
                  </span>
                  {trusted && !affordable && <span className="mega-gate">not enough TU yet</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function FreightSection() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const exp = s.expedition;
  const capacity = cargoCapacity(exp);
  const manifest = exp.manifest;
  const manifestDef = manifest ? FREIGHT_BY_ID[manifest.id] : null;

  return (
    <>
      <div className="panel-h">Freight Board</div>
      {capacity === 0 ? (
        <div className="contract-empty">
          No hold fitted. The runabout will carry a great deal of nothing until the Cargo Hold
          refit is installed at the helm.
        </div>
      ) : manifest ? (
        <div className="manifest-card">
          <div className="mf-head">
            <span className="mf-label">{manifestDef?.label ?? manifest.id}</span>
            <span className="mf-pay">{manifest.salvage} salvage</span>
          </div>
          <div className="mf-note">{manifestDef?.note}</div>
          <div className="mf-route">
            {manifest.fromName} → <b>{manifest.toName}</b>
            {manifestDef ? ` · ${manifestDef.mass}t` : ''}
          </div>
          <div className="mf-hint">
            Fly to {manifest.toName} and it discharges on arrival. Its system has to be revealed
            for the port to see you.
          </div>
          <button className="btn ghost" onClick={() => actions.abandonManifest()}>
            Jettison the manifest
          </button>
        </div>
      ) : exp.jobs.length === 0 ? (
        <div className="contract-empty">
          Nothing posted. The board refills on its own, and only ever between worlds you have
          actually delivered.
        </div>
      ) : (
        <div className="job-list">
          {exp.jobs.map((job) => {
            const def = FREIGHT_BY_ID[job.id];
            if (!def) return null;
            const fits = def.mass <= capacity;
            return (
              <button
                key={job.uid}
                className="job-item"
                disabled={!fits}
                onClick={() => actions.acceptJob(job.uid)}
              >
                <div className="job-head">
                  <span className="job-label">{def.label}</span>
                  <span className="job-pay">{job.salvage} salvage</span>
                </div>
                <div className="job-note">{def.note}</div>
                <div className="job-route">
                  {job.fromName} → {job.toName} · {def.mass}t
                  {!fits && <span className="job-over"> · too heavy for this hold</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export function RigSection() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const exp = s.expedition;
  const limit = rigLimit(exp);
  const standing = rigsStanding(exp);
  const ids = Object.keys(exp.rigs);

  return (
    <>
      <div className="panel-h">Survey Rigs</div>
      <div className="heritage-rule">
        {limit === 0
          ? 'No rig bay fitted. Prospect a seam at the helm and fit the Rig Bay refit to leave something behind.'
          : `${standing} of ${limit} on station. A rig works whether or not anybody is watching; fly back out to collect what it has banked.`}
      </div>
      {ids.length > 0 && (
        <div className="rig-list">
          {ids.map((id) => {
            const seam = SEAM_BY_ID[id];
            const rig = exp.rigs[id]!;
            const cap = seam?.cap ?? 1;
            return (
              <div className="rig-item" key={id}>
                <div className="rig-head">
                  <span className="rig-name">{seam?.name ?? id}</span>
                  <span className="rig-banked">{Math.floor(rig.banked)} banked</span>
                </div>
                <div className="rig-bar" aria-hidden>
                  <i style={{ width: `${Math.min(100, (rig.banked / cap) * 100)}%` }} />
                </div>
                <div className="rig-meta">
                  {seam ? `${seam.yieldPerHour}/hr · holds ${seam.cap}` : ''}
                  {rig.banked >= cap ? ' · full, and waiting' : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
