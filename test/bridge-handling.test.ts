import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { handlingFor, handlingLabel, NEUTRAL_HANDLING } from '../src/engine/handling';
import { attendInPerson, attendable, ATTENDANCE_SALVAGE } from '../src/engine/bridge';
import { massFactor } from '../src/engine/freight';
import { worldRecord, createWorldRecord } from '../src/engine/worldRecords';
import { waypointId } from '../src/engine/waypoints';
import { FREIGHT_BY_ID } from '../src/content/freight';
import { SITUATIONS } from '../src/content/situations';
import type { CompletedPlanetRecord, GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };

function withWorld(): GameState {
  const s = newGame(99, 0);
  const world: CompletedPlanetRecord = {
    lifetimeIndex: 3, seed: 3, type: 'ocean', size: 'small', name: 'Pelagia II',
    quirks: [], survey: null, completionMs: 1, bottleneck: 'bio', installations: ['a'],
  };
  s.run.completedPlanets.push(world);
  s.worldRecords['3'] = createWorldRecord(world, 1, 0);
  return s;
}

function hold(s: GameState, freightId: string): void {
  s.expedition.manifest = {
    uid: 1, id: freightId, from: 0, to: 3, fromName: 'here', toName: 'Pelagia II',
    distance: 10, salvage: 5, expiresAtMs: 1e9, acceptedAtMs: 0, pickedUpAtMs: 0,
  };
}

describe('Special Handling', () => {
  it('leaves an empty ship flying exactly as it always did', () => {
    expect(handlingFor(newGame(1, 0).expedition)).toEqual(NEUTRAL_HANDLING);
  });

  it('makes a fragile load unwilling to be hurried, in both directions', () => {
    const s = withWorld();
    hold(s, 'teaset');
    const p = handlingFor(s.expedition);
    expect(p.responseMult).toBeLessThan(1);
    // Not a speed cap — the ship still goes as fast, it just gets there slower.
    expect(p.turnMult).toBe(1);
    expect(handlingLabel(p)).toContain('do not hurry');
  });

  it('makes an awkward load turn wide without slowing it', () => {
    const s = withWorld();
    hold(s, 'coastline');
    const p = handlingFor(s.expedition);
    expect(p.turnMult).toBeLessThan(1);
    expect(p.responseMult).toBe(1);
  });

  it('stacks traits when a load has more than one', () => {
    const s = withWorld();
    hold(s, 'labware'); // fragile AND awkward
    const p = handlingFor(s.expedition);
    expect(p.responseMult).toBeLessThan(1);
    expect(p.turnMult).toBeLessThan(1);
    expect(p.traits.length).toBe(2);
  });

  it('makes a secret load attract attention', () => {
    const s = withWorld();
    hold(s, 'forms');
    expect(handlingFor(s.expedition).inspectionMult).toBeGreaterThan(1);
  });

  it('says nothing about an ordinary load', () => {
    const s = withWorld();
    const plain = Object.values(FREIGHT_BY_ID).find((f) => !f.handling)!;
    hold(s, plain.id);
    expect(handlingLabel(handlingFor(s.expedition))).toBe('');
  });
});

describe('physical pickup', () => {
  it('weighs nothing until it is actually aboard', () => {
    const s = withWorld();
    hold(s, 'ballast');
    s.expedition.manifest!.pickedUpAtMs = null;
    expect(massFactor(s.expedition)).toBe(1);

    step(s, 0, [{ type: 'pickUpManifest' }], OPTS);
    expect(s.expedition.manifest!.pickedUpAtMs).not.toBeNull();
    expect(massFactor(s.expedition)).toBeGreaterThan(1);
  });

  it('does not collect the same cargo twice', () => {
    const s = withWorld();
    hold(s, 'ballast');
    s.expedition.manifest!.pickedUpAtMs = null;
    step(s, 0, [{ type: 'pickUpManifest' }], OPTS);
    const at = s.expedition.manifest!.pickedUpAtMs;
    step(s, 250, [{ type: 'pickUpManifest' }], OPTS);
    expect(s.expedition.manifest!.pickedUpAtMs).toBe(at);
  });
});

describe('the bridge', () => {
  it('offers personal attention only for a world you have been to', () => {
    const s = withWorld();
    s.situations = [
      { uid: 7, id: SITUATIONS[0]!.id, remainingMs: 9000, world: 3, worldName: 'Pelagia II' },
    ];
    expect(attendable(s).map((a) => a.uid)).toEqual([7]);

    // Never been there: the desk is the only option.
    expect(attendInPerson(s, [], 7)).toBe(false);
    expect(s.situations.length).toBe(1);

    s.expedition.visited[waypointId('world', 3)] = 1000;
    expect(attendInPerson(s, [], 7)).toBe(true);
    expect(s.situations.length).toBe(0);
  });

  it('pays in salvage and memory, never in TU', () => {
    const s = withWorld();
    s.expedition.visited[waypointId('world', 3)] = 1000;
    s.situations = [
      { uid: 8, id: SITUATIONS[0]!.id, remainingMs: 9000, world: 3, worldName: 'Pelagia II' },
    ];
    const tuBefore = s.tu.toString();
    const salvageBefore = s.expedition.salvage;

    step(s, 0, [{ type: 'attendInPerson', uid: 8 }], OPTS);

    // The sealed economy holds: flight never pays TU.
    expect(s.tu.toString()).toBe(tuBefore);
    expect(s.expedition.salvage).toBe(salvageBefore + ATTENDANCE_SALVAGE);

    // And the part that actually matters.
    const history = worldRecord(s, 3)!.history;
    expect(history.some((e) => e.kind === 'visited')).toBe(true);
    expect(history.some((e) => e.kind === 'petitionAnswered')).toBe(true);
  });

  it('refuses a request that does not exist', () => {
    const s = withWorld();
    s.expedition.visited[waypointId('world', 3)] = 1;
    expect(attendInPerson(s, [], 999)).toBe(false);
  });
});
