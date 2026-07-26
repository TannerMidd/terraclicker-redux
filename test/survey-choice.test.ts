import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { ASPECTS } from '../src/engine/types';

const OPTS = { utcDay: 3 };

function withSurveyOffer() {
  const state = newGame(20260725, 0);
  state.planet.survey = null;
  state.planet.surveyOptions = [
    'dense-aquifers',
    'calm-skies',
    'prospectors-dream',
  ];
  return state;
}

describe('orbital survey choice', () => {
  it('can intentionally proceed unsurveyed without applying a survey effect', () => {
    const state = withSurveyOffer();
    const before = Object.fromEntries(
      ASPECTS.map((aspect) => [aspect, state.planet.gauges[aspect].toString()]),
    );

    step(state, 0, [{ type: 'declineSurvey' }], OPTS);

    expect(state.planet.survey).toBeNull();
    expect(state.planet.surveyOptions).toBeNull();
    expect(Object.fromEntries(
      ASPECTS.map((aspect) => [aspect, state.planet.gauges[aspect].toString()]),
    )).toEqual(before);
  });

  it('records a completed declined world as unsurveyed', () => {
    const state = withSurveyOffer();
    step(state, 0, [{ type: 'declineSurvey' }], OPTS);
    for (const aspect of ASPECTS) state.planet.gauges[aspect] = state.planet.targets[aspect];

    step(state, 0, [], OPTS);

    expect(state.run.completedPlanets).toHaveLength(1);
    expect(state.run.completedPlanets[0]?.survey).toBeNull();
  });
});
