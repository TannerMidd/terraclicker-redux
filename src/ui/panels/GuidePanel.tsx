import { actions, useGame } from '../../state/store';
import { ACHIEVEMENTS } from '../../content/achievements';
import { PLANET_TYPE_BY_ID } from '../../content/planetTypes';
import { QUIRK_BY_ID } from '../../content/quirks';
import { SURVEY_BY_ID } from '../../content/surveys';
import { DEEP_FIELD } from '../../content/deepField';
import { C } from '../../content/constants';
import type { AspectId, CompletedPlanetRecord } from '../../engine/types';
import { formatDuration } from '../../engine/num';
import { AspectGlyph, guideIllustration } from '../assets';
import { FieldManual } from './FieldManual';
import { worldBiography, worldRecord, worldTraits } from '../../engine/worldRecords';
import { standingOf } from '../../engine/situations';

const ASPECT_LABEL: Record<AspectId, string> = {
  thermal: 'Thermal',
  atmo: 'Atmospheric',
  hydro: 'Hydrologic',
  bio: 'Biotic',
};

const ASPECT_CLASS: Record<AspectId, string> = {
  thermal: 'asp-th',
  atmo: 'asp-at',
  hydro: 'asp-hy',
  bio: 'asp-bi',
};

/**
 * What the world is like now, as opposed to what it was on the day it was
 * signed off. The card this sits inside is a delivery certificate; this is the
 * part that keeps changing after the certificate was filed.
 *
 * Absent for worlds delivered before the archive existed, which is honest —
 * they have no history because none was kept, and inventing one would be the
 * Guide doing precisely what it accuses everybody else of.
 */
function WorldLife({ lifetimeIndex }: { lifetimeIndex: number }) {
  const { s } = useGame.getState();
  const record = worldRecord(s, lifetimeIndex);
  if (!record) return null;
  const standing = standingOf(s, lifetimeIndex);
  const traits = worldTraits(record, standing, s);
  return (
    <div className="wm-life">
      <div className="wm-traits">
        {traits.map((t) => (
          <span key={t} className={`wm-trait t-${t}`}>
            {t}
          </span>
        ))}
      </div>
      <p className="wm-bio">{worldBiography(record, standing, s)}</p>
      {record.history.length > 0 && (
        <div className="wm-filed">
          {record.history.length} {record.history.length === 1 ? 'entry' : 'entries'} on file
        </div>
      )}
    </div>
  );
}

function WorldMemory({
  world,
  isCandidate,
  isArchived,
}: {
  world: CompletedPlanetRecord;
  isCandidate: boolean;
  isArchived: boolean;
}) {
  const type = PLANET_TYPE_BY_ID[world.type];
  const survey = world.survey ? SURVEY_BY_ID[world.survey] : null;
  const quirks = world.quirks.map((id) => QUIRK_BY_ID[id]?.text ?? id);
  const designationLabel = isArchived
    ? 'Archived heritage world'
    : isCandidate
      ? 'Selected for heritage review'
      : 'Designate as heritage candidate';

  return (
    <article className="world-memory">
      <div className="wm-head">
        <div className="wm-name">{world.name}</div>
        <div className="wm-index">WORLD #{world.lifetimeIndex}</div>
      </div>
      <div className="wm-meta">
        {type?.label ?? world.type} / {world.size} /{' '}
        {world.completionMs > 0 ? `delivered in ${formatDuration(world.completionMs)}` : 'delivery time unfiled'}
      </div>
      <div className={`wm-bottleneck ${ASPECT_CLASS[world.bottleneck]}`}>
        <AspectGlyph aspect={world.bottleneck} />
        {ASPECT_LABEL[world.bottleneck]} was the primary bottleneck
      </div>
      {quirks.length > 0 && <div className="wm-quirks">{quirks.join(' / ')}</div>}
      <WorldLife lifetimeIndex={world.lifetimeIndex} />
      {survey && (
        <div className="wm-survey">
          <b>Filed survey:</b> {survey.name}. {survey.text}
        </div>
      )}
      {(isCandidate || isArchived) && (
        <div className="wm-badges">
          {isCandidate && <span className="heritage-badge candidate">Current candidate</span>}
          {isArchived && <span className="heritage-badge">Heritage world</span>}
        </div>
      )}
      <button
        className="heritage-designate"
        disabled={isCandidate || isArchived}
        onClick={() => actions.designateHeritage(world.lifetimeIndex)}
        aria-label={`${designationLabel}: ${world.name}`}
      >
        {designationLabel}
      </button>
    </article>
  );
}

/**
 * The channel, newest first. This is the part of the Guide that is a record
 * rather than a reward — it keeps filing while you are away, so returning to
 * scroll it is the point.
 */
function SubEthaLog() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const log = s.subEtha.log;
  // Relative, because a feed is about recency. Simulated time throughout, so
  // a line filed while you were away reads the same as one filed live.
  const ago = (atMs: number) => {
    const delta = Math.max(0, s.gameTimeMs - atMs);
    return delta < 60_000 ? 'just now' : `${formatDuration(delta)} ago`;
  };

  return (
    <>
      <div className="panel-h">The Sub-Etha</div>
      <p className="panel-sub">
        Open channel. Colonial traffic, editorial revisions, Vogon
        administration, and unverified sightings. It keeps filing while you are away.
      </p>
      {log.length === 0 ? (
        <p className="panel-sub df-empty">
          The channel is open and carrying nothing. This is normal, and will not last.
        </p>
      ) : (
        <div className="se-log">
          {[...log].reverse().map((entry) => {
            const found = entry.site && s.expedition.discovered[entry.site] !== undefined;
            return (
              <div key={entry.id} className={`se-row k-${entry.kind}`}>
                <div className="se-when">{ago(entry.atMs)}</div>
                <div className="se-body">
                  {entry.text}
                  {entry.site && found && <span className="se-found">found</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const SHELL_HINT: Record<string, string> = {
  near: 'close to home',
  mid: 'out past the constellation',
  far: 'deep out',
  deep: 'a very long way out',
};

/**
 * The only section of the Guide that is not about you. Entries here are
 * written by going and looking — nothing unlocks them from the armchair —
 * and they pay in salvage rather than production, so the ledger stays clean.
 */
function DeepFieldLog() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { expedition } = useGame.getState().s;
  const found = Object.keys(expedition.discovered).length;

  return (
    <>
      <div className="panel-h">
        The Deep Field — {found}/{DEEP_FIELD.length} filed
      </div>
      <p className="panel-sub">
        Things that were already out there. Take the helm (<b>F</b>), fly to a contact and hold{' '}
        <b>E</b> to resolve it; board what will have you. Salvage refits the runabout and buys
        nothing else — no entry here touches production.
      </p>
      {found === 0 ? (
        <p className="panel-sub df-empty">
          No contacts resolved. The sensors have been reporting unidentified returns for some time
          and would appreciate being taken seriously.
        </p>
      ) : (
        <div className="df-log">
          {DEEP_FIELD.map((def) => {
            const scanned = expedition.discovered[def.id] !== undefined;
            const boarded = expedition.boarded[def.id] !== undefined;
            return (
              <article key={def.id} className={`df-entry ${scanned ? 'found' : 'unknown'}`}>
                <div className="df-head">
                  <span className="df-name">{scanned ? def.name : def.contact}</span>
                  {boarded && <span className="df-badge">boarded</span>}
                </div>
                <div className="df-meta">
                  {def.kind} · {SHELL_HINT[def.shell]}
                  {scanned && !def.unreachable && !boarded && ` · ${def.salvage} salvage aboard`}
                </div>
                {scanned ? (
                  <>
                    <p className="df-entry-text">{def.entry}</p>
                    {boarded && <p className="df-boarding">{def.boarding}</p>}
                  </>
                ) : (
                  <p className="df-entry-text df-unwritten">
                    Entry not yet written. The sensors hold a return and no opinion.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export function GuidePanel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const p = s.planet;
  const typeDef = PLANET_TYPE_BY_ID[p.type];
  const unlockedCount = Object.keys(s.achievements).length;

  return (
    <div>
      <FieldManual />

      <div className="panel-h">Current World</div>
      <div className="dossier">
        <div className="d-name">{p.name}</div>
        <div className="d-type">
          {typeDef?.label} · {p.size} · planet #{p.lifetimeIndex} of your career
        </div>
        {p.quirks.map((q) => (
          <div key={q} className="d-quirk">
            {QUIRK_BY_ID[q]?.text ?? q}
          </div>
        ))}
        {p.survey && (
          <div className="d-quirk">Survey: {SURVEY_BY_ID[p.survey]?.name} — {SURVEY_BY_ID[p.survey]?.text}</div>
        )}
        <div className="d-guide">{typeDef?.guide}</div>
      </div>

      {/* Both above the atlas deliberately: the atlas runs to hundreds of
          worlds deep in a commission, and these would never be found under it. */}
      <SubEthaLog />
      <DeepFieldLog />

      {s.run.completedPlanets.length > 0 && (
        <>
          <div className="panel-h">Commission Atlas &mdash; {s.run.completedPlanets.length} filed</div>
          <p className="panel-sub">
            Designate one world for heritage review before selling this commission. You may change
            the candidate freely; the selected world is archived at prestige.
          </p>
          <div className="world-atlas">
            {[...s.run.completedPlanets].reverse().map((world) => {
              const isCandidate = s.operations.heritageCandidateLifetimeIndex === world.lifetimeIndex;
              const isArchived = s.operations.heritageWorlds.some(
                (heritage) => heritage.lifetimeIndex === world.lifetimeIndex,
              );
              return (
                <WorldMemory
                  key={`${world.lifetimeIndex}-${world.seed}`}
                  world={world}
                  isCandidate={isCandidate}
                  isArchived={isArchived}
                />
              );
            })}
          </div>
        </>
      )}

      <div className="panel-h">
        Guide Entries — {unlockedCount}/{ACHIEVEMENTS.length}
      </div>
      <p className="panel-sub">
        Each entry improves production by {Math.round(C.ACHIEVEMENT_BONUS * 100)}%. The Guide
        considers this a rounding error and you a delight.
      </p>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const unlocked = s.achievements[a.id] !== undefined;
          if (!unlocked && a.hidden) return null;
          return (
            <div key={a.id} className={`ach ${unlocked ? 'unlocked' : 'locked'}`}>
              <img className="a-art" src={guideIllustration(a.id)} alt="" aria-hidden />
              <div className="a-copy">
                <div className="a-name">{unlocked ? a.name : '?????'}</div>
                <div className="a-guide">{unlocked ? a.guide : 'Entry not yet written.'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
