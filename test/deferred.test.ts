import { describe, expect, it } from 'vitest';
import { newGame, step, stepOffline, computeDerived } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import { C } from '../src/content/constants';
import { MEGAPROJECT_BY_ID } from '../src/content/megaprojects';
import { SEAM_BY_ID } from '../src/content/freight';
import { D } from '../src/engine/num';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };
const HOUR = 3_600_000;

/**
 * engine/megaprojects.ts has always documented full-rate offline construction
 * as the entire point of the system. It never happened: `stepOffline` capped
 * the simulated span at eight hours and construction rode along inside it, so
 * an eighteen-hour monument could not be finished by an eighteen-hour absence.
 * A player could return the next morning to 44%.
 */

/** A state with a named megaproject under construction and nothing else going on. */
function building(id: string): GameState {
  const s = newGame(4242, 0);
  const def = MEGAPROJECT_BY_ID[id];
  if (!def) throw new Error(`no megaproject ${id}`);
  s.tu = D(def.cost).mul(2);
  s.operations.reputation[def.faction] = def.reputationRequired;
  step(s, 0, [{ type: 'startMegaproject', id }], OPTS);
  if (!s.megaprojects[id]) throw new Error(`${id} did not start`);
  return s;
}

function clone(s: GameState): GameState {
  const r = deserialize(serialize(s));
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('deferred work runs on wall-clock, not on the offline cap', () => {
  it('finishes an 18-hour monument after an 18-hour absence', () => {
    const s = building('standing-office');
    const def = MEGAPROJECT_BY_ID['standing-office']!;
    expect(def.buildMs).toBe(18 * HOUR);
    // The cap is well under the build time — that is the whole problem.
    expect(computeDerived(s, OPTS).offlineCapMs).toBeLessThan(def.buildMs);

    const { effects } = stepOffline(s, 18 * HOUR, OPTS);

    expect(s.megaprojects['standing-office']?.done).toBe(true);
    expect(effects.some((e) => e.t === 'megaprojectFinished')).toBe(true);
    expect(s.lifetime.megaprojectsBuilt).toBe(1);
  });

  it('credits the true elapsed time however the absence is chunked', () => {
    const base = building('improbability-spire'); // 36h, longest in the game
    const once = clone(base);
    const split = clone(base);

    stepOffline(once, 36 * HOUR, OPTS);
    for (let i = 0; i < 6; i++) stepOffline(split, 6 * HOUR, OPTS);

    expect(once.megaprojects['improbability-spire']?.builtMs)
      .toBe(split.megaprojects['improbability-spire']?.builtMs);
    expect(once.megaprojects['improbability-spire']?.done).toBe(true);
    expect(split.megaprojects['improbability-spire']?.done).toBe(true);
  }, 60_000);

  it('does not overshoot: a finished project stops accruing', () => {
    const s = building('orbital-gantry'); // 8h
    stepOffline(s, 40 * HOUR, OPTS);
    const m = s.megaprojects['orbital-gantry']!;
    expect(m.done).toBe(true);
    expect(m.builtMs).toBe(MEGAPROJECT_BY_ID['orbital-gantry']!.buildMs);
  });

  it('fills a rig to its cap while nobody is there to watch it', () => {
    const s = newGame(99, 0);
    const seamId = Object.keys(SEAM_BY_ID)[0]!;
    const def = SEAM_BY_ID[seamId]!;
    s.expedition.rigs[seamId] = { banked: 0, lastTickMs: 0, placedAtMs: 0 };

    // Long enough to saturate: cap divided by hourly yield, doubled.
    stepOffline(s, (def.cap / def.yieldPerHour) * 2 * HOUR, OPTS);

    expect(s.expedition.rigs[seamId]!.banked).toBeCloseTo(def.cap, 6);
  });

  it('leaves unbounded income capped: salvage is not deferred work', () => {
    const short = building('reclamation-yard'); // 24h build, 30 salvage/hour
    stepOffline(short, 24 * HOUR, OPTS);
    expect(short.megaprojects['reclamation-yard']?.done).toBe(true);
    const salvageAfterBuild = short.expedition.salvage;

    // Now that it is standing it yields salvage — but that is income, and
    // income still answers to the offline cap the way TU does.
    const capMs = computeDerived(short, OPTS).offlineCapMs;
    const before = short.expedition.salvage;
    stepOffline(short, 100 * HOUR, OPTS);
    const gained = short.expedition.salvage - before;

    const rate = 30 / HOUR; // per ms
    expect(gained).toBeLessThanOrEqual(rate * capMs * 1.0001);
    expect(salvageAfterBuild).toBeGreaterThanOrEqual(0);
  });

  it('still matches the ordinary tick loop for spans inside the cap', () => {
    const base = building('orbital-gantry');
    const offline = clone(base);
    const foreground = clone(base);

    stepOffline(offline, 2 * HOUR, OPTS);
    for (let i = 0; i < (2 * HOUR) / C.LOGIC_TICK_MS; i++) {
      step(foreground, C.LOGIC_TICK_MS, [], OPTS);
    }

    expect(offline.megaprojects['orbital-gantry']?.builtMs)
      .toBeCloseTo(foreground.megaprojects['orbital-gantry']?.builtMs ?? -1, 6);
  });
});
