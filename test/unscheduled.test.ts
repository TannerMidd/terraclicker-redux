import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import {
  boardUnscheduled,
  hasBoardedUnscheduled,
  isUnscheduledId,
  unscheduledFor,
  unscheduledFound,
} from '../src/engine/unscheduled';
import { UNSCHEDULED_PER_COMMISSION, UNSCHEDULED_SALVAGE } from '../src/content/unscheduled';
import { waypoints, waypointId } from '../src/engine/waypoints';
import { C } from '../src/content/constants';
import { D } from '../src/engine/num';

const OPTS = { utcDay: 3 };

describe('the Unscheduled Objects Register', () => {
  it('gives every commission something nobody filed', () => {
    const s = newGame(20260723, 0);
    const objects = unscheduledFor(s);
    expect(objects.length).toBe(UNSCHEDULED_PER_COMMISSION);
    for (const o of objects) {
      expect(o.text.length).toBeGreaterThan(20);
      expect(o.text).not.toContain('{');
      expect(o.text).not.toContain('undefined');
    }
  });

  it('is generated, not random — same universe, same oddities', () => {
    expect(unscheduledFor(newGame(4242, 0))).toEqual(unscheduledFor(newGame(4242, 0)));
    // ...and consumes no rng doing it, because describing is not rolling.
    const s = newGame(4242, 0);
    const before = { ...s.rng };
    unscheduledFor(s);
    expect(s.rng).toEqual(before);
  });

  it('produces a different set for a different universe', () => {
    const a = unscheduledFor(newGame(1, 0)).map((o) => o.text);
    const b = unscheduledFor(newGame(2, 0)).map((o) => o.text);
    expect(a).not.toEqual(b);
  });

  it('never puts a door on a swarm', () => {
    // The tag constraints have to hold across many universes, not just one.
    for (let seed = 1; seed < 400; seed++) {
      for (const o of unscheduledFor(newGame(seed, 0))) {
        if (o.text.includes('swarm of filing cabinets')) {
          expect(o.text).not.toContain('doors open');
          expect(o.text).not.toContain('chairs are warm');
        }
        if (o.text.includes('weather front')) {
          expect(o.text).not.toContain('lights are on');
        }
      }
    }
  });

  it('appears on the chart with somewhere to go', () => {
    const s = newGame(7, 0);
    const listed = waypoints(s).filter((w) => w.kind === 'unscheduled');
    expect(listed.length).toBe(UNSCHEDULED_PER_COMMISSION);
    expect(listed[0]!.ref.at).toBe('point');
  });

  it('pays salvage and a Guide line, never TU', () => {
    const s = newGame(7, 0);
    const id = unscheduledFor(s)[0]!.id;
    const tuBefore = s.tu.toString();

    const r = step(s, 0, [{ type: 'boardUnscheduled', id }], OPTS);

    expect(hasBoardedUnscheduled(s, id)).toBe(true);
    expect(s.expedition.salvage).toBe(UNSCHEDULED_SALVAGE);
    expect(s.tu.toString()).toBe(tuBefore); // the seal holds
    expect(r.effects.some((e) => e.t === 'unscheduledBoarded')).toBe(true);
  });

  it('cannot be looked into twice', () => {
    const s = newGame(7, 0);
    const id = unscheduledFor(s)[0]!.id;
    expect(boardUnscheduled(s, [], id)).toBe(true);
    expect(boardUnscheduled(s, [], id)).toBe(false);
    expect(s.expedition.salvage).toBe(UNSCHEDULED_SALVAGE);
    expect(unscheduledFound(s)).toBe(1);
  });

  it('refuses an id that is not one of ours', () => {
    const s = newGame(7, 0);
    expect(isUnscheduledId('landmark:sofa')).toBe(false);
    expect(boardUnscheduled(s, [], 'landmark:sofa')).toBe(false);
    expect(boardUnscheduled(s, [], 'uns-9-9')).toBe(false); // right shape, wrong commission
  });

  it('expires with the commission, and a new set arrives', () => {
    const s = newGame(20260723, 0);
    const before = unscheduledFor(s).map((o) => o.text);
    boardUnscheduled(s, [], unscheduledFor(s)[0]!.id);
    expect(unscheduledFound(s)).toBe(1);

    s.run.planetsCompleted = C.PLANETS_PER_SYSTEM * C.PRESTIGE_MIN_SYSTEMS;
    s.run.systems = C.PRESTIGE_MIN_SYSTEMS;
    s.run.tuEarned = D('1e15');
    step(s, 0, [{ type: 'prestige' }], OPTS);

    expect(s.expedition.unscheduled).toEqual({});
    expect(unscheduledFor(s).map((o) => o.text)).not.toEqual(before);
    expect(unscheduledFound(s)).toBe(0);
  });

  it('keeps its ids out of the way of the landmark ids', () => {
    const s = newGame(7, 0);
    const id = unscheduledFor(s)[0]!.id;
    expect(waypointId('unscheduled', id)).toContain('unscheduled:');
    expect(isUnscheduledId(id)).toBe(true);
  });
});
