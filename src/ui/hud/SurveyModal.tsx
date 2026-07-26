import { useEffect, useRef } from 'react';
import { actions, useGame } from '../../state/store';
import { SURVEY_BY_ID } from '../../content/surveys';

export function SurveyModal() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (s.planet.surveyOptions) firstOptionRef.current?.focus();
  }, [s.planet.surveyOptions]);

  const options = s.planet.surveyOptions;
  if (!options) return null;
  return (
    <div className="modal-veil">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="survey-title"
        aria-describedby="survey-explainer survey-commitment"
      >
        <span id="survey-title" className="sr-only">Orbital Survey - {s.planet.name}</span>
        <h2>Orbital Survey — {s.planet.name}</h2>
        <p className="m-body" id="survey-explainer">
          Three probes report back. Their findings disagree, as probes do. Choose the report whose
          listed effect best serves this world.
        </p>
        <p className="survey-decision-note" id="survey-commitment">
          Selecting files immediately. The bonus and record apply only to this world.
        </p>
        <div className="survey-options">
          {options.map((id, index) => {
            const sv = SURVEY_BY_ID[id];
            if (!sv) return null;
            return (
              <button
                key={id}
                ref={index === 0 ? firstOptionRef : undefined}
                className="survey-opt"
                onClick={() => actions.chooseSurvey(id)}
              >
                <div className="so-name">{sv.name}</div>
                <div className="so-text">{sv.text}</div>
                <span className="so-action">FILE THIS REPORT</span>
              </button>
            );
          })}
        </div>
        <div className="survey-decline">
          <button className="survey-skip" onClick={() => actions.declineSurvey()}>
            PROCEED UNSURVEYED
          </button>
          <span>
            No survey bonus is filed, and this world will not count toward surveyed-world contracts.
          </span>
        </div>
      </div>
    </div>
  );
}
