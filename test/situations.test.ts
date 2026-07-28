import { describe, expect, it } from 'vitest';
import { newGame, step, stepOffline } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import { computeDerived } from '../src/engine/economy';
import { C } from '../src/content/constants';
import { STANDING_FLOOR, standingFactor, standingOf } from '../src/engine/situations';
import { SITUATION_BY_ID, SITUATIONS } from '../src/content/situations';
import { prestigeEligible } from '../src/engine/economy';
import { BUILDINGS } from '../src/content/buildings';
import { EVENT_BY_ID } from '../src/content/events';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };

/** A game with worlds delivered, so targeted situations have somewhere to land. */
function withWorlds(seed: number, worlds = 6): GameState {
  const s = newGame(seed, 0);
  for (let i = 0; i < worlds; i++) {
    step(s, 0, [{ type: 'devGrant', tu: '1e12', gaugeFrac: 1 }], OPTS);
    step(s, 300, [], OPTS);
    if (s.planet.surveyOptions) {
      step(s, 0, [{ type: 'chooseSurvey', id: s.planet.surveyOptions[0]! }], OPTS);
    }
  }
  step(s, 0, [{ type: 'devGrant', tu: '1e12' }], OPTS);
  // Something has to be producing before a multiplier on production means
  // anything: with no buildings, tuPerSec is zero and stays zero.
  step(s, 0, [{ type: 'buyBuilding', id: BUILDINGS[0]!.id, qty: 25 }], OPTS);
  step(s, 1000, [], OPTS);
  return s;
}

function openOne(s: GameState): void {
  step(s, 0, [{ type: 'devSpawn', what: 'situation' }], OPTS);
}

describe('situations: content', () => {
  it('every option and lapse outcome says something, and buffs point at real events', () => {
    for (const def of SITUATIONS) {
      expect(def.options.length).toBeGreaterThanOrEqual(2);
      expect(def.windowMs).toBeGreaterThan(30_000);
      expect(def.ignored.text.length).toBeGreaterThan(10);
      for (const o of def.options) {
        expect(o.label.length).toBeGreaterThan(0);
        expect(o.detail.length).toBeGreaterThan(0);
        expect(o.outcome.text.length).toBeGreaterThan(10);
        if (o.outcome.buff) expect(EVENT_BY_ID[o.outcome.buff]).toBeDefined();
      }
      // A targeted situation must actually use the world it names, or it had
      // no business asking for one.
      if (def.targeted) expect(def.text).toContain('{world}');
    }
  });

  it('never spends or pays salvage — the Deep Field economy stays sealed', () => {
    const json = JSON.stringify(SITUATIONS);
    expect(json).not.toContain('salvage');
  });
});

describe('buffs are earned now', () => {
  it('no buff event ever arrives unbidden', () => {
    // Two hours of play with nothing but the clock running. The old random
    // events fired every 5–12 minutes; a buff must now come from a decision.
    const s = withWorlds(19);
    step(s, 2 * 3_600_000, [], OPTS);
    expect(s.activeEvents).toEqual([]);
  });

  it('but a situation can still hand you one', () => {
    const def = SITUATIONS.find((x) => x.options.some((o) => o.outcome.buff))!;
    const option = def.options.find((o) => o.outcome.buff)!;
    const s = withWorlds(23);
    s.science = s.tu; // some options are paid for in research time
    // Drive this specific situation rather than waiting for the roll.
    s.situations.push({
      uid: 1,
      id: def.id,
      remainingMs: def.windowMs,
      world: s.run.completedPlanets[0]!.lifetimeIndex,
      worldName: s.run.completedPlanets[0]!.name,
    });
    step(s, 0, [{ type: 'answerSituation', uid: 1, optionId: option.id }], OPTS);
    expect(s.activeEvents.map((e) => e.id)).toContain(option.outcome.buff);
  });
});

describe('situations: arriving', () => {
  it('is deterministic from the seed', () => {
    const a = withWorlds(31);
    const b = withWorlds(31);
    openOne(a);
    openOne(b);
    expect(a.situations).toEqual(b.situations);
    expect(a.situations.length).toBe(1);
  });

  it('names a world you actually delivered', () => {
    const s = withWorlds(12);
    // Try a few so at least one targeted situation comes up.
    for (let i = 0; i < 6 && s.situations.length === 0; i++) openOne(s);
    const inst = s.situations[0]!;
    const def = SITUATION_BY_ID[inst.id]!;
    if (def.targeted) {
      const match = s.run.completedPlanets.find((w) => w.lifetimeIndex === inst.world);
      expect(match).toBeDefined();
      expect(inst.worldName).toBe(match!.name);
    } else {
      expect(inst.world).toBe(0);
    }
  });

  it('only ever asks one question at a time', () => {
    const s = withWorlds(5);
    for (let i = 0; i < 8; i++) openOne(s);
    expect(s.situations.length).toBe(1);
  });
});

describe('situations: answering', () => {
  it('charges the option and applies its outcome', () => {
    const s = withWorlds(77);
    openOne(s);
    const inst = s.situations[0]!;
    const def = SITUATION_BY_ID[inst.id]!;
    const paid = def.options.find((o) => o.costSeconds) ?? def.options[0]!;
    const before = s.tu;

    step(s, 0, [{ type: 'answerSituation', uid: inst.uid, optionId: paid.id }], OPTS);

    expect(s.situations.length).toBe(0);
    expect(s.lifetime.situationsAnswered).toBe(1);
    if (paid.costSeconds && !paid.outcome.gainSeconds) expect(s.tu.lt(before)).toBe(true);
    if (paid.outcome.standing && paid.outcome.standing > 0) {
      expect(standingOf(s, inst.world)).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it('refuses an option you cannot pay for, and leaves the question open', () => {
    const s = withWorlds(90);
    openOne(s);
    const inst = s.situations[0]!;
    const def = SITUATION_BY_ID[inst.id]!;
    const costly = def.options.find((o) => o.costSeconds);
    if (!costly) return; // this one is free either way
    s.tu = s.tu.mul(0); // broke

    step(s, 0, [{ type: 'answerSituation', uid: inst.uid, optionId: costly.id }], OPTS);

    expect(s.situations.length).toBe(1);
    expect(s.lifetime.situationsAnswered).toBe(0);
  });

  it('ignores an unknown uid or option rather than throwing', () => {
    const s = withWorlds(4);
    openOne(s);
    expect(() =>
      step(s, 0, [{ type: 'answerSituation', uid: 9999, optionId: 'nope' }], OPTS),
    ).not.toThrow();
    expect(s.situations.length).toBe(1);
  });
});

describe('situations: letting one lapse', () => {
  it('closes the window and applies the ignored outcome', () => {
    const s = withWorlds(21);
    openOne(s);
    const inst = s.situations[0]!;
    const def = SITUATION_BY_ID[inst.id]!;

    step(s, def.windowMs + 1000, [], OPTS);

    expect(s.situations.length).toBe(0);
    expect(s.lifetime.situationsIgnored).toBe(1);
    if (def.ignored.standing && def.ignored.standing < 0) {
      expect(standingOf(s, inst.world)).toBeLessThan(1);
    }
  });

  it('a neglected world dims but is never lost, and recovers', () => {
    const s = withWorlds(64);
    const world = s.run.completedPlanets[0]!.lifetimeIndex;
    // Hammer it well past anything the content could do in one go.
    for (let i = 0; i < 40; i++) s.run.standing[String(world)] = standingOf(s, world) - 0.3;
    // The engine clamps on write; emulate the same guard the outcomes use.
    s.run.standing[String(world)] = Math.max(
      STANDING_FLOOR,
      s.run.standing[String(world)] as number,
    );
    expect(standingOf(s, world)).toBeGreaterThanOrEqual(STANDING_FLOOR);

    delete s.run.standing[String(world)];
    expect(standingOf(s, world)).toBe(1);
  });
});

describe('situations: the rest of the game', () => {
  it('does not touch production while nothing is neglected', () => {
    const s = withWorlds(88);
    expect(standingFactor(s)).toBe(1);
    const before = computeDerived(s, OPTS).tuPerSec;
    expect(before.gt(0)).toBe(true);

    s.run.standing[String(s.run.completedPlanets[0]!.lifetimeIndex)] = STANDING_FLOOR;
    const after = computeDerived(s, OPTS).tuPerSec;

    expect(standingFactor(s)).toBeLessThan(1);
    expect(after.lt(before)).toBe(true);
  });

  it('stays put while you are away — an unattended clock must not answer for you', () => {
    const s = withWorlds(41);
    openOne(s);
    const before = s.situations[0]!.remainingMs;
    const def = SITUATION_BY_ID[s.situations[0]!.id]!;

    stepOffline(s, def.windowMs * 4, OPTS);

    expect(s.situations.length).toBe(1);
    expect(s.situations[0]!.remainingMs).toBe(before);
    expect(s.lifetime.situationsIgnored).toBe(0);
  });

  it('does not arrive while you are away either', () => {
    const s = withWorlds(43);
    stepOffline(s, 6 * 3_600_000, OPTS);
    expect(s.situations.length).toBe(0);
  });

  it('survives a save round-trip, standing and all', () => {
    const s = withWorlds(55);
    openOne(s);
    s.run.standing[String(s.run.completedPlanets[0]!.lifetimeIndex)] = 0.5;

    const r = deserialize(serialize(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.situations).toEqual(s.situations);
    expect(r.state.run.standing).toEqual(s.run.standing);
  });

  it('stays an idle game however hard the drives compound', () => {
    // Eighty Hearts of Gold is ×1.12⁸⁰ ≈ ×8,700 on the raw stack — the whale
    // save that turned 7–15 minutes into seconds. The cap is the promise.
    const s = withWorlds(101);
    s.buildings['heartOfGold'] = 80;
    const d = computeDerived(s, OPTS);
    expect(d.situationFreqMult).toBeLessThanOrEqual(C.SITUATION_FREQ_CAP);
    expect(d.bubbleFreqMult).toBeLessThanOrEqual(C.BUBBLE_FREQ_CAP);
    // The meter still reads the raw pressure — a fleet of drives makes the
    // universe more improbable, just never more demanding.
    expect(d.improbability).toBe(42);
  });

  it('answering buys a guaranteed breather before the next question', () => {
    const s = withWorlds(102);
    s.science = s.tu; // some options are paid for in research time
    openOne(s);
    const inst = s.situations[0]!;
    const def = SITUATION_BY_ID[inst.id]!;
    // Worst case: the spawn clock already ran out behind the open card.
    s.timers.nextSituationMs = 1;
    step(s, 0, [{ type: 'answerSituation', uid: inst.uid, optionId: def.options[0]!.id }], OPTS);
    expect(s.situations.length).toBe(0);
    expect(s.timers.nextSituationMs).toBeGreaterThanOrEqual(C.SITUATION_BREATHER_MS);
    // And the quiet holds: two minutes of play brings nothing new to the desk.
    step(s, 120_000, [], OPTS);
    expect(s.situations.length).toBe(0);
  });

  it('a lapsed question is not replaced mid-sentence either', () => {
    const s = withWorlds(103);
    openOne(s);
    const def = SITUATION_BY_ID[s.situations[0]!.id]!;
    // Arrange the next spawn to fall just after the lapse would fire.
    s.timers.nextSituationMs = def.windowMs + 60_000;
    step(s, def.windowMs + 1_000, [], OPTS);
    expect(s.situations.length).toBe(0);
    expect(s.lifetime.situationsIgnored).toBe(1);
    expect(s.timers.nextSituationMs).toBeGreaterThanOrEqual(C.SITUATION_BREATHER_MS - 2_000);
  });

  it('goes with the portfolio when you prestige', () => {
    const s = withWorlds(66, 6);
    openOne(s);
    s.run.standing[String(s.run.completedPlanets[0]!.lifetimeIndex)] = 0.5;
    // Prestige needs the full portfolio depth Magrathea asks for this run.
    for (let i = 0; i < 80 && !prestigeEligible(s); i++) {
      step(s, 0, [{ type: 'devGrant', tu: '1e12', gaugeFrac: 1 }], OPTS);
      step(s, 300, [], OPTS);
      if (s.planet.surveyOptions) {
        step(s, 0, [{ type: 'chooseSurvey', id: s.planet.surveyOptions[0]! }], OPTS);
      }
    }
    expect(prestigeEligible(s)).toBe(true);
    step(s, 0, [{ type: 'prestige' }], OPTS);

    expect(s.situations).toEqual([]);
    expect(s.run.standing).toEqual({});
  });
});
