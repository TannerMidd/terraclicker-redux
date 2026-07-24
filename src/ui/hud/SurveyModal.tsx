import { actions, useGame } from '../../state/store';
import { SURVEY_BY_ID } from '../../content/surveys';

export function SurveyModal() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const options = s.planet.surveyOptions;
  if (!options) return null;
  return (
    <div className="modal-veil">
      <div className="modal">
        <h2>Orbital Survey — {s.planet.name}</h2>
        <p className="m-body">
          Three probes report back. Their findings disagree, as probes do. Commission one report
          as official:
        </p>
        <div className="survey-options">
          {options.map((id) => {
            const sv = SURVEY_BY_ID[id];
            if (!sv) return null;
            return (
              <button key={id} className="survey-opt" onClick={() => actions.chooseSurvey(id)}>
                <div className="so-name">{sv.name}</div>
                <div className="so-text">{sv.text}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
