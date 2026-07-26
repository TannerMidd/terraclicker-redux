import { describe, expect, it } from 'vitest';
import { newGame, step, stepOffline } from '../src/engine/sim';
import { buildCircular, circularSummary } from '../src/engine/circular';
import { rigCapacity } from '../src/engine/freight';
import { MEGAPROJECT_BY_ID } from '../src/content/megaprojects';
import { SEAM_BY_ID } from '../src/content/freight';
import { D } from '../src/engine/num';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };
const HOUR = 3_600_000;

function building(id: string): GameState {
  const s = newGame(4242, 0);
  const def = MEGAPROJECT_BY_ID[id]!;
  s.tu = D(def.cost).mul(2);
  s.operations.reputation[def.faction] = def.reputationRequired;
  step(s, 0, [{ type: 'startMegaproject', id }], OPTS);
  return s;
}

describe('the Morning Circular', () => {
  it('leads with the monument that finished while you were gone', () => {
    const s = building('standing-office'); // 18h
    const leftAt = s.gameTimeMs;
    stepOffline(s, 20 * HOUR, OPTS);

    const items = buildCircular(s, leftAt);
    const built = items.filter((i) => i.kind === 'built');
    expect(built.length).toBe(1);
    expect(built[0]!.text).toContain('legally taller');
    // Finished things come before everything else.
    expect(items[0]!.kind).toBe('built');
  });

  it('does not report a monument that was already standing when you left', () => {
    const s = building('orbital-gantry'); // 8h
    // First absence: it goes up, and is news.
    stepOffline(s, 10 * HOUR, OPTS);
    expect(s.megaprojects['orbital-gantry']?.done).toBe(true);

    // You came back, saw it, and left again. The second briefing must not
    // report it a second time — this is the flow the `sinceMs` scope is for.
    const leftAgainAt = s.gameTimeMs;
    stepOffline(s, 3 * HOUR, OPTS);

    const items = buildCircular(s, leftAgainAt);
    expect(items.some((i) => i.kind === 'built')).toBe(false);
  });

  it('reports a rig that filled and stopped, with somewhere to fly', () => {
    const s = newGame(99, 0);
    const seamId = Object.keys(SEAM_BY_ID)[0]!;
    const def = SEAM_BY_ID[seamId]!;
    s.expedition.infrastructure['survey-station'] = 1;
    s.expedition.rigs[seamId] = { banked: def.cap, lastTickMs: 0, placedAtMs: 0 };

    expect(buildCircular(s, 0).some((i) => i.kind === 'full')).toBe(false);
    s.expedition.rigs[seamId]!.banked = rigCapacity(s.expedition, seamId);
    const item = buildCircular(s, 0).find((i) => i.kind === 'full');
    expect(item).toBeDefined();
    expect(item!.text).toContain('full');
    expect(item!.waypoint).toBe(`rig:${seamId}`);
  });

  it('puts worlds that wrote above rumour, because they are people', () => {
    const s = newGame(7, 0);
    s.run.petitions = [
      { uid: 1, id: 'quiet-request', remainingMs: 1000, world: 3, worldName: 'Vesper Reach' },
    ];
    s.subEtha.log = [
      { id: 1, atMs: 10, kind: 'rumour', text: 'Something is out there, allegedly.' },
    ];

    const items = buildCircular(s, 0);
    const askingAt = items.findIndex((i) => i.kind === 'asking');
    const rumourAt = items.findIndex((i) => i.kind === 'rumour');
    expect(askingAt).toBeGreaterThanOrEqual(0);
    expect(rumourAt).toBeGreaterThanOrEqual(0);
    expect(askingAt).toBeLessThan(rumourAt);
    expect(items[askingAt]!.waypoint).toBe('world:3');
  });

  it('derives rather than stores — reading it twice changes nothing', () => {
    const s = building('deep-archive');
    stepOffline(s, 14 * HOUR, OPTS);
    const before = JSON.stringify(s.megaprojects);
    const a = buildCircular(s, 0);
    const b = buildCircular(s, 0);
    expect(a).toEqual(b);
    expect(JSON.stringify(s.megaprojects)).toBe(before);
  });

  it('counts what is actually there, and admits when nothing is', () => {
    expect(circularSummary([])).toContain('prepared to describe as an event');

    const s = newGame(7, 0);
    s.run.petitions = [
      { uid: 1, id: 'quiet-request', remainingMs: 1, world: 3, worldName: 'A' },
      { uid: 2, id: 'quiet-request', remainingMs: 1, world: 4, worldName: 'B' },
    ];
    const line = circularSummary(buildCircular(s, 0));
    expect(line).toContain('2 worlds wrote');
    expect(line).toContain('declined to itemise');
    // It must never claim a category it does not have.
    expect(line).not.toContain('rig');
    expect(line).not.toContain('monument');
  });
});
