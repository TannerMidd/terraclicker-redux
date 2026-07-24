import { useGame } from '../../state/store';
import { ACHIEVEMENTS } from '../../content/achievements';
import { PLANET_TYPE_BY_ID } from '../../content/planetTypes';
import { QUIRK_BY_ID } from '../../content/quirks';
import { SURVEY_BY_ID } from '../../content/surveys';
import { C } from '../../content/constants';

export function GuidePanel() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const p = s.planet;
  const typeDef = PLANET_TYPE_BY_ID[p.type];
  const unlockedCount = Object.keys(s.achievements).length;

  return (
    <div>
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
              <div className="a-name">{unlocked ? a.name : '?????'}</div>
              <div className="a-guide">{unlocked ? a.guide : 'Entry not yet written.'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
