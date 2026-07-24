import { actions, useGame } from '../../state/store';
import { ACHIEVEMENTS } from '../../content/achievements';
import { PLANET_TYPE_BY_ID } from '../../content/planetTypes';
import { QUIRK_BY_ID } from '../../content/quirks';
import { SURVEY_BY_ID } from '../../content/surveys';
import { C } from '../../content/constants';
import type { AspectId, CompletedPlanetRecord } from '../../engine/types';
import { formatDuration } from '../../engine/num';
import { AspectGlyph, guideIllustration } from '../assets';
import { FieldManual } from './FieldManual';

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
