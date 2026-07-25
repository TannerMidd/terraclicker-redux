import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import {
  enactedStatutes,
  enactStatute,
  statuteEffects,
  statuteOffers,
  universeStage,
} from '../src/engine/statutes';
import { STAGE_GALAXIES, STATUTES } from '../src/content/statutes';
import { prestigeRequiredSystems } from '../src/engine/economy';
import { serialize, deserialize } from '../src/engine/save/codec';
import { C } from '../src/content/constants';
import { D } from '../src/engine/num';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };

function atStage(stage: 1 | 2 | 3): GameState {
  const s = newGame(5150, 0);
  s.lifetime.bestGalaxies = STAGE_GALAXIES[stage];
  return s;
}

describe('universe statutes', () => {
  it('legislates nothing before the first galaxy', () => {
    const s = newGame(1, 0);
    expect(universeStage(s)).toBe(0);
    expect(statuteOffers(s)).toEqual([]);
    expect(statuteEffects(s)).toEqual({
      situationFreq: 1, offlineCapAddMs: 0, headStart: 0, appraisalEasier: 0, sensors: 1,
    });
  });

  it('opens each stage as the universe reaches it', () => {
    expect(universeStage(atStage(1))).toBe(1);
    expect(universeStage(atStage(2))).toBe(2);
    expect(universeStage(atStage(3))).toBe(3);
    // A later stage offers the earlier acts too, if they were never passed.
    expect(statuteOffers(atStage(3)).length).toBeGreaterThan(statuteOffers(atStage(1)).length);
  });

  it('passes one act per stage, and no more', () => {
    const s = atStage(1);
    const first = statuteOffers(s)[0]!;
    step(s, 0, [{ type: 'enactStatute', id: first.id }], OPTS);
    expect(s.lifetime.statutes).toEqual([first.id]);

    // That stage is spent. Another stage-1 act is not available.
    expect(statuteOffers(s).some((d) => d.stage === 1)).toBe(false);
  });

  it('refuses an act the universe has not reached', () => {
    const s = atStage(1);
    const late = STATUTES.find((d) => d.stage === 3)!;
    expect(enactStatute(s, [], late.id)).toBe(false);
    expect(s.lifetime.statutes).toEqual([]);
  });

  it('cannot be repealed — you live in the universe you voted for', () => {
    const s = atStage(1);
    const act = statuteOffers(s)[0]!;
    enactStatute(s, [], act.id);
    expect(enactStatute(s, [], act.id)).toBe(false);
    expect(s.lifetime.statutes.length).toBe(1);
  });

  it('changes rules, and never adds a currency', () => {
    const s = atStage(2);
    const tuBefore = s.tu.toString();
    for (const act of statuteOffers(s).slice(0, 1)) enactStatute(s, [], act.id);
    expect(s.tu.toString()).toBe(tuBefore);
    // Every effect is a rule multiplier, not a resource.
    const e = statuteEffects(s);
    expect(Object.keys(e).sort()).toEqual(
      ['appraisalEasier', 'headStart', 'offlineCapAddMs', 'sensors', 'situationFreq'],
    );
  });

  it('reaches the appraisal when the act says it does', () => {
    const s = atStage(2);
    const before = prestigeRequiredSystems(s);
    enactStatute(s, [], 'plain-language'); // one system fewer, forever
    expect(prestigeRequiredSystems(s)).toBe(before - 1);
  });

  it('survives prestige, which is the whole point of reaching a stage', () => {
    const s = atStage(1);
    enactStatute(s, [], statuteOffers(s)[0]!.id);
    const enacted = [...s.lifetime.statutes];

    s.run.planetsCompleted = C.PLANETS_PER_SYSTEM * 20;
    s.run.systems = 20;
    s.run.tuEarned = D('1e15');
    step(s, 0, [{ type: 'prestige' }], OPTS);

    expect(s.lifetime.statutes).toEqual(enacted);
    expect(enactedStatutes(s).length).toBe(1);
  });

  it('survives a save', () => {
    const s = atStage(1);
    enactStatute(s, [], statuteOffers(s)[0]!.id);
    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.lifetime.statutes).toEqual(s.lifetime.statutes);
  });
});
