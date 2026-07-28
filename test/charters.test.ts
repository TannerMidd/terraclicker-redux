import { describe, expect, it } from 'vitest';
import { newGame, step, computeDerived } from '../src/engine/sim';
import {
  charterOfferSignature,
  charterOfferWeightsFor,
  charterEffects,
  charterOffersFor,
  refreshUnsignedCharterOffers,
  charterStandingFloor,
  systemCharacter,
  systemFieldProfile,
} from '../src/engine/charters';
import { bankGroundSamples } from '../src/engine/groundfall';
import { CHARTERS, CHARTER_BY_ID, CHARTER_OFFER_COUNT } from '../src/content/charters';
import { createWorldRecord } from '../src/engine/worldRecords';
import { createGroundWorldRecord } from '../src/engine/groundSites';
import { standingOf, STANDING_FLOOR } from '../src/engine/situations';
import { serialize, deserialize } from '../src/engine/save/codec';
import { C } from '../src/content/constants';
import { D } from '../src/engine/num';
import { SITUATIONS } from '../src/content/situations';
import { BOTS, OPTS, TICK } from '../balance/bots';
import type { CompletedPlanetRecord, GameState, WorldRecordEvent } from '../src/engine/types';

/** A commission with one formed system whose worlds have the given history. */
function systemWith(history: WorldRecordEvent['kind'][], installations = 3): GameState {
  const s = newGame(1234, 0);
  for (let i = 0; i < C.PLANETS_PER_SYSTEM; i++) {
    const world: CompletedPlanetRecord = {
      lifetimeIndex: i + 1, seed: i + 1, type: 'terrestrial', size: 'medium',
      name: `World ${i + 1}`, quirks: [], survey: null, completionMs: 1,
      bottleneck: 'thermal', installations: Array.from({ length: installations }, (_, k) => `b${k}`),
    };
    s.run.completedPlanets.push(world);
    const record = createWorldRecord(world, 1, 0);
    for (const [k, kind] of history.entries()) {
      record.history.push({ kind, id: `e${k}`, atGameMs: k });
    }
    s.worldRecords[String(world.lifetimeIndex)] = record;
  }
  s.run.systems = 1;
  return s;
}

function addFieldPractice(state: GameState): void {
  state.expedition.groundWorlds.w1 = {
    ...createGroundWorldRecord(),
    surveyedAtMs: 10,
    visits: 2,
    sites: {
      'site:preserved': { s: 'preserved', atMs: 11 },
      'site:worked': { s: 'worked', atMs: 12 },
    },
    samples: { basalt: 10, crystal: 11 },
    species: { moth: 12 },
    marks: [{ kind: 'station', dir: [1, 0, 0], atMs: 13 }],
    salvagePaid: 0,
  };
  state.expedition.groundWorlds.w2 = {
    ...createGroundWorldRecord(),
    surveyedAtMs: 20,
    visits: 2,
    sites: {
      'site:preserved': { s: 'preserved', atMs: 21 },
      'site:prospected': { s: 'prospected', atMs: 22 },
    },
    samples: { brine: 20, glass: 21 },
    species: { lichen: 22 },
    marks: [
      { kind: 'beacon', dir: [0, 1, 0], atMs: 23 },
      { kind: 'repair', dir: [0, 0, 1], atMs: 24 },
    ],
    salvagePaid: 0,
  };
  state.worldRecords['2']!.history.push({
    kind: 'repairMade',
    id: 'repair',
    atGameMs: 24,
  });
}

describe('System Charters', () => {
  it('reads what kind of system it was from the worlds themselves', () => {
    expect(systemCharacter(systemWith(['petitionAnswered', 'petitionAnswered']), 0)).toBe('attended');
    expect(systemCharacter(systemWith(['petitionIgnored', 'petitionIgnored']), 0)).toBe('neglected');
    expect(systemCharacter(systemWith([], 8), 0)).toBe('engineered');
    expect(systemCharacter(systemWith([], 3), 0)).toBe('always');
    // A tie is not a verdict.
    expect(systemCharacter(systemWith(['petitionAnswered', 'petitionIgnored'], 3), 0)).toBe('always');
  });

  it('offers articles the history opened, never articles it did not', () => {
    const neglected = systemWith(['petitionIgnored', 'petitionIgnored']);
    for (const id of charterOffersFor(neglected, 0)) {
      const def = CHARTER_BY_ID[id]!;
      expect(['always', 'neglected']).toContain(def.when);
    }
    const attended = systemWith(['petitionAnswered', 'petitionAnswered']);
    for (const id of charterOffersFor(attended, 0)) {
      expect(['always', 'attended']).toContain(CHARTER_BY_ID[id]!.when);
    }
  });

  it('offers two distinct articles, deterministically', () => {
    const a = systemWith(['petitionAnswered']);
    const b = systemWith(['petitionAnswered']);
    const offers = charterOffersFor(a, 0);
    expect(offers.length).toBe(CHARTER_OFFER_COUNT);
    expect(new Set(offers).size).toBe(CHARTER_OFFER_COUNT);
    expect(charterOffersFor(b, 0)).toEqual(offers);
  });

  it('derives system-wide field character from existing expedition records', () => {
    const s = systemWith([]);
    addFieldPractice(s);

    expect(systemFieldProfile(s, 0)).toEqual({
      visitedWorlds: 2,
      surveyedWorlds: 2,
      sampleKinds: 4,
      speciesKinds: 2,
      preservedSites: 2,
      prospectedSites: 1,
      workedSites: 1,
      marks: 3,
      repairs: 1,
      signals: ['charted', 'stewarded', 'waymarked', 'prospected'],
    });
  });

  it('does not let one very busy landing define an entire system', () => {
    const s = systemWith([]);
    addFieldPractice(s);
    delete s.expedition.groundWorlds.w2;
    s.worldRecords['2']!.history = [];

    expect(systemFieldProfile(s, 0).signals).toEqual([]);
  });

  it('uses field character to open and weight compatible articles', () => {
    const plain = systemWith([]);
    const fielded = systemWith([]);
    addFieldPractice(fielded);

    const plainWeights = Object.fromEntries(
      charterOfferWeightsFor(plain, 0).map((entry) => [entry.id, entry]),
    );
    const fieldWeights = Object.fromEntries(
      charterOfferWeightsFor(fielded, 0).map((entry) => [entry.id, entry]),
    );

    // The no-ground pool remains the original neutral pool.
    expect(Object.keys(plainWeights).sort()).toEqual(
      CHARTERS.filter((charter) => charter.when === 'always').map((charter) => charter.id).sort(),
    );

    // Survey practice strengthens a neutral research article.
    expect(fieldWeights.observatory!.weight).toBeGreaterThan(plainWeights.observatory!.weight);
    expect(fieldWeights.observatory!.fieldSignals).toEqual(['charted']);

    // Stewardship, routes, and geology can open compatible articles even
    // when petition/build history alone reached no verdict.
    expect(fieldWeights['mutual-aid']!.fieldSignals).toEqual(['stewarded', 'waymarked']);
    expect(fieldWeights['works-committee']!.fieldSignals).toEqual(['prospected', 'waymarked']);
    expect(fieldWeights['salvage-rights']!.fieldSignals).toEqual(['prospected']);

    // Neutral choice never disappears.
    expect(CHARTERS.filter((charter) => charter.when === 'always')
      .every((charter) => fieldWeights[charter.id] !== undefined)).toBe(true);
  });

  it('draws field-authored offers deterministically', () => {
    const a = systemWith([]);
    const b = systemWith([]);
    addFieldPractice(a);
    addFieldPractice(b);

    expect(charterOffersFor(a, 0)).toEqual(charterOffersFor(b, 0));
  });

  it('refreshes a formed system pending table when banked field work changes its signature', () => {
    const s = systemWith([]);
    s.expedition.groundWorlds.w1 = {
      ...createGroundWorldRecord(),
      surveyedAtMs: 10,
      visits: 1,
      samples: { basalt: 10 },
    };
    const previousSignature = charterOfferSignature(s, 0);
    s.run.charterOffers['0'] = charterOffersFor(s, 0);

    bankGroundSamples(
      s,
      [],
      'w2',
      'World 2',
      [{ kind: 'field-crystal', n: C.GROUND_SURVEY_SAMPLES, method: 'quick' }],
    );

    expect(previousSignature).toBe('always|');
    expect(charterOfferSignature(s, 0)).toBe('always|charted');
    const offers = s.run.charterOffers['0']!;
    expect(offers).toHaveLength(CHARTER_OFFER_COUNT);
    expect(
      charterOfferWeightsFor(s, 0)
        .find((entry) => entry.id === offers[0])!
        .fieldSignals,
    ).toContain('charted');
  });

  it('does not churn a pending table or advance RNG when its signature is unchanged', () => {
    const s = systemWith([]);
    s.run.charterOffers['0'] = charterOffersFor(s, 0);
    const offers = s.run.charterOffers['0']!;
    const rng = { ...s.rng };
    const signature = charterOfferSignature(s, 0);

    expect(refreshUnsignedCharterOffers(s, 0, signature)).toBe(false);
    expect(s.run.charterOffers['0']).toBe(offers);
    expect(s.rng).toEqual(rng);
  });

  it('never refreshes a signed charter, even after the system field signature changes', () => {
    const s = systemWith([]);
    const previousSignature = charterOfferSignature(s, 0);
    s.run.charters['0'] = 'observatory';
    // Keep a stale pending table too: even malformed legacy state must defer
    // to the filed article and must not consume a draw.
    const staleOffers = ['thermal-compact', 'water-board'];
    s.run.charterOffers['0'] = staleOffers;
    const rng = { ...s.rng };
    addFieldPractice(s);

    expect(charterOfferSignature(s, 0)).not.toBe(previousSignature);
    expect(refreshUnsignedCharterOffers(s, 0, previousSignature)).toBe(false);
    expect(s.run.charters['0']).toBe('observatory');
    expect(s.run.charterOffers['0']).toBe(staleOffers);
    expect(s.rng).toEqual(rng);
  });

  it('signs one article per system, once, and only from its offers', () => {
    const s = systemWith(['petitionAnswered']);
    s.run.charterOffers['0'] = charterOffersFor(s, 0);
    const chosen = s.run.charterOffers['0']![0]!;

    step(s, 0, [{ type: 'signCharter', systemIndex: 0, id: chosen }], OPTS);
    expect(s.run.charters['0']).toBe(chosen);
    expect(s.run.charterOffers['0']).toBeUndefined();

    const other = CHARTERS.find((c) => c.id !== chosen)!.id;
    step(s, 0, [{ type: 'signCharter', systemIndex: 0, id: other }], OPTS);
    expect(s.run.charters['0']).toBe(chosen); // not re-signed
  });

  it('refuses an article that was never offered to that system', () => {
    const s = systemWith(['petitionAnswered']);
    s.run.charterOffers['0'] = ['observatory'];
    step(s, 0, [{ type: 'signCharter', systemIndex: 0, id: 'thermal-compact' }], OPTS);
    expect(s.run.charters['0']).toBeUndefined();
  });

  it('is neutral in every direction with nothing signed', () => {
    const s = systemWith([]);
    expect(charterEffects(s)).toEqual({
      prodMult: 1,
      scienceMult: 1,
      aspectMult: { thermal: 1, atmo: 1, hydro: 1, bio: 1 },
      petitionFocus: 1,
    });
  });

  it('applies a signed article to the commission', () => {
    const plain = systemWith([]);
    plain.buildings['seedProbe'] = 20;
    const signed = systemWith([]);
    signed.buildings['seedProbe'] = 20;
    signed.run.charters['0'] = 'works-committee'; // +22% production

    expect(computeDerived(signed, OPTS).tuPerSec.gt(computeDerived(plain, OPTS).tuPerSec))
      .toBe(true);
  });

  it('lets a system agree not to think less of you than a floor', () => {
    const withArticle = systemWith([]);
    withArticle.run.charters['0'] = 'quiet-clause'; // floor 0.85
    expect(charterStandingFloor(withArticle, 1)).toBe(0.85);
    // A world in a system with no article gets only the global floor.
    expect(charterStandingFloor(systemWith([]), 1)).toBeNull();

    // Neglect the same world repeatedly in both. The clamp is applied when
    // standing is WRITTEN, which is the only place it can be applied without
    // making every read walk the portfolio to find its system.
    const drop = (s: GameState) => {
      for (let i = 0; i < 12; i++) {
        s.situations = [
          { uid: 100 + i, id: SITUATIONS[0]!.id, remainingMs: 100, world: 1, worldName: 'World 1' },
        ];
        for (let t = 0; t < 3; t++) step(s, 250, [], OPTS);
      }
      return standingOf(s, 1);
    };

    const plain = systemWith([]);
    const bare = drop(plain);
    const held = drop(withArticle);

    expect(held).toBeGreaterThanOrEqual(0.85);
    expect(bare).toBeGreaterThanOrEqual(STANDING_FLOOR);
    expect(held).toBeGreaterThan(bare);
  });

  it('offers a charter when a system actually forms in play', () => {
    const bot = BOTS['greedy-clicker']!;
    const s = newGame(20260723, 0);
    for (let tick = 0; tick < (30 * 60_000) / TICK; tick++) {
      step(s, TICK, bot(s, tick), OPTS);
      if (s.run.systems >= 1) break;
    }
    expect(s.run.systems).toBeGreaterThanOrEqual(1);
    expect(s.run.charterOffers['0']?.length).toBe(CHARTER_OFFER_COUNT);
  }, 60_000);

  it('goes with the portfolio when it is sold, and survives a save', () => {
    const s = systemWith(['petitionAnswered']);
    s.run.charters['0'] = 'observatory';

    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (round.ok) expect(round.state.run.charters['0']).toBe('observatory');

    s.run.planetsCompleted = C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS;
    s.run.systems = C.PRESTIGE_MIN_SYSTEMS;
    s.run.tuEarned = D('1e15');
    step(s, 0, [{ type: 'prestige' }], OPTS);
    expect(s.run.charters).toEqual({});
  });
});
