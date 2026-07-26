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
import { openPhase } from '../../engine/programmes';

/**
 * The question a phase is waiting on.
 *
 * Rendered inside the project's own card rather than as a modal, because the
 * crew are not interrupting you — they got on with it and would like a decision
 * when you have a moment. Construction has already moved past this point; what
 * is waiting is the benefit and the shape of the final object.
 */
function PhaseQuestion({ id }: { id: string }) {
  const rev = useGame((g) => g.rev);
  void rev;
  const open = openPhase(useGame.getState().s, id);
  if (!open) return null;
  return (
    <div className="mega-phase">
      <div className="mp-kicker">
        {open.phase.name} · decision {open.index + 1} of 3
      </div>
      <p className="mp-text">{open.phase.text}</p>
      <div className="mp-options">
        {open.phase.options.map((o) => (
          <button key={o.id} className="mp-option" onClick={() => actions.answerPhase(id, o.id)}>
            <b>{o.label}</b>
            <span>{o.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
import {
  cargoCapacity,
  currentManifestLeg,
  rigCapacity,
  rigLimit,
  rigsStanding,
} from '../../engine/freight';
import { findWaypoint, manifestWaypointId } from '../../engine/waypoints';
import { actions, useGame } from '../../state/store';
import { useUiBus } from '../fx/uiBus';

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
              <PhaseQuestion id={def.id} />
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
  const leg = currentManifestLeg(s);
  const objectiveId = manifest ? manifestWaypointId(manifest) : null;
  const objectiveAvailable = objectiveId !== null && findWaypoint(s, objectiveId) !== null;
  const objectivePinned = objectiveId !== null && exp.pinned === objectiveId;
  const deliveredWorlds = s.run.completedPlanets.length;
  const routesReady = deliveredWorlds >= 2;
  const launch = () => useUiBus.getState().setFlightMode(true);

  return (
    <section className="mission-board" aria-label="Flight jobs">
      <div className="mission-section-title">
        <span>
          <b>Flight Jobs</b>
          <em>HELM MISSIONS</em>
        </span>
        <span className="mission-board-count">
          {manifest ? '1 ACTIVE' : `${exp.jobs.length} POSTED`}
        </span>
      </div>
      <p className="dr-note">
        Accept here, then fly the highlighted route. Arrival collects and unloads automatically;
        there is no hidden dock button.
      </p>
      <div className="mission-readiness" aria-label="Flight job readiness">
        <span className={s.flags.firstSortieDone ? 'met' : ''}>
          {s.flags.firstSortieDone ? '✓' : '1'} PILOT INDUCTION
        </span>
        <span className={capacity > 0 ? 'met' : ''}>
          {capacity > 0 ? '✓' : '2'} CARGO HOLD · {capacity}t
        </span>
        <span className={routesReady ? 'met' : ''}>
          {routesReady ? '✓' : '3'} ROUTES · {Math.min(2, deliveredWorlds)}/2 WORLDS
        </span>
      </div>

      {manifest ? (
        <div className="mission-active-card">
          <div className="mission-type-row">
            <span>ACTIVE FLIGHT MISSION · LEG {leg?.phase === 'collect' ? '1' : '2'} OF 2</span>
            <b>+{manifest.salvage} SALVAGE</b>
          </div>
          <h3>{manifestDef?.label ?? manifest.id}</h3>
          <p>{manifestDef?.note}</p>
          <div className="mission-objective">
            <small>{leg?.phase === 'collect' ? 'FLY TO PICKUP' : 'FLY TO DELIVERY'}</small>
            <b>{leg?.targetName ?? manifest.toName}</b>
            <span>
              {manifest.fromName} → {manifest.toName}
              {manifestDef ? ` · ${manifestDef.mass}t` : ''}
            </span>
          </div>
          <p className="mission-auto-note">
            {leg?.phase === 'collect'
              ? 'Pickup is automatic on arrival. The course then retargets the destination.'
              : 'Cargo is aboard. Delivery and payment are automatic on arrival.'}
          </p>
          <div className="mission-actions">
            {objectiveAvailable && objectiveId && (
              <button
                className="dr-btn"
                disabled={objectivePinned}
                onClick={() => actions.setWaypoint(objectiveId)}
              >
                {objectivePinned ? 'COURSE SET' : `SET COURSE · ${leg?.targetName ?? 'OBJECTIVE'}`}
              </button>
            )}
            <button className="dr-btn mission-launch" onClick={launch}>TAKE THE HELM</button>
            <button className="dr-btn ghost" onClick={() => actions.abandonManifest()}>
              {leg?.phase === 'collect' ? 'WITHDRAW' : 'JETTISON CARGO'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {exp.deliveries === 0 && exp.jobs.length > 0 && (
            <div className="mission-callout">
              <b>Your first flight job is ready.</b>
              <span>Choose a route below. ACCEPT &amp; SET COURSE does both jobs at once.</span>
            </div>
          )}
          {capacity === 0 && (
            <div className="mission-prereq">
              <b>Cargo Hold required</b>
              <span>
                Finish First Sortie for the company rank-one hold, or fit one from the helm.
                Offers remain visible below so you can see what capacity they need.
              </span>
              <button className="dr-btn" onClick={launch}>TAKE THE HELM</button>
            </div>
          )}
          {!routesReady && (
            <div className="mission-prereq">
              <b>Flight routes need two delivered worlds</b>
              <span>
                Deliver {2 - deliveredWorlds} more world{2 - deliveredWorlds === 1 ? '' : 's'}.
                Then clients can name both an origin and a destination.
              </span>
              <strong>{Math.min(2, deliveredWorlds)} / 2 WORLDS DELIVERED</strong>
            </div>
          )}
          {routesReady && exp.jobs.length === 0 && (
            <div className="mission-empty">
              <b>No flight jobs posted right now</b>
              <span>The board refills automatically; accepted work never expires.</span>
            </div>
          )}
          {exp.jobs.length > 0 && (
            <div className="mission-job-list">
              {exp.jobs.map((job) => {
                const def = FREIGHT_BY_ID[job.id];
                if (!def) return null;
                const fits = def.mass <= capacity;
                const expires = Math.max(0, job.expiresAtMs - s.gameTimeMs);
                const faction = FACTION_META[def.faction];
                const rep = def.kind === 'passenger' ? 2 : 1;
                return (
                  <article key={job.uid} className={`mission-job${fits ? ' job-ready' : ''}`}>
                    <div className="mission-type-row">
                      <span>{faction.label.toUpperCase()} · {formatDuration(expires)} LEFT</span>
                      <b>+{job.salvage} SALVAGE · +{rep} REP</b>
                    </div>
                    <h3>{def.label}</h3>
                    <p>{def.note}</p>
                    <div className="mission-route">
                      <b>{job.fromName}</b><i>→</i><b>{job.toName}</b><span>{def.mass}t</span>
                    </div>
                    {!fits && (
                      <p className="mission-blocked">
                        Requires {def.mass}t capacity · your hold carries {capacity}t
                      </p>
                    )}
                    <button
                      className="dr-btn mission-accept"
                      disabled={!fits}
                      onClick={() => actions.acceptJob(job.uid)}
                    >
                      {fits ? 'ACCEPT & SET COURSE' : `NEEDS ${def.mass}t HOLD`}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
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
            const cap = Math.max(1, rigCapacity(exp, id));
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
                  {seam ? `${seam.yieldPerHour}/hr · holds ${Math.floor(cap)}` : ''}
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
