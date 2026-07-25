import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import {
  activeRole,
  buildInfrastructure,
  canBuildInfrastructure,
  infrastructureCount,
  loadoutEffects,
} from '../src/engine/loadouts';
import { INFRASTRUCTURE_BY_ID, SHIP_ROLES } from '../src/content/loadouts';
import { cargoCapacity } from '../src/engine/freight';
import { sensorRange } from '../src/engine/deepField';
import { serialize, deserialize } from '../src/engine/save/codec';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };

function fitted(): GameState {
  const s = newGame(11, 0);
  s.expedition.refits['cargoHold'] = 2;
  s.expedition.refits['sensors'] = 2;
  return s;
}

describe('ship roles', () => {
  it('starts in the configuration it left the yard in', () => {
    expect(activeRole(newGame(1, 0).expedition).id).toBe('general');
    const e = loadoutEffects(newGame(1, 0).expedition);
    expect(e).toEqual({ speed: 1, capacity: 1, sensors: 1, agility: 1, rigCap: 1 });
  });

  it('trades one capability for another rather than adding', () => {
    for (const role of SHIP_ROLES) {
      if (role.id === 'general') continue;
      const better = [role.speed, role.capacity, role.sensors, role.agility].filter((v) => v > 1);
      const worse = [role.speed, role.capacity, role.sensors, role.agility].filter((v) => v < 1);
      expect(better.length, `${role.id} improves nothing`).toBeGreaterThan(0);
      expect(worse.length, `${role.id} costs nothing`).toBeGreaterThan(0);
    }
  });

  it('never un-buys a refit — the hold is still the hold', () => {
    const s = fitted();
    const base = cargoCapacity(s.expedition);

    step(s, 0, [{ type: 'setRole', id: 'courier' }], OPTS);
    const courier = cargoCapacity(s.expedition);
    expect(courier).toBeLessThan(base);

    // Switching back restores it exactly. Nothing was lost, only packed away.
    step(s, 0, [{ type: 'setRole', id: 'general' }], OPTS);
    expect(cargoCapacity(s.expedition)).toBe(base);
  });

  it('is free and reversible at any time', () => {
    const s = fitted();
    const salvage = s.expedition.salvage;
    for (const role of SHIP_ROLES) {
      step(s, 0, [{ type: 'setRole', id: role.id }], OPTS);
      expect(s.expedition.role).toBe(role.id);
    }
    expect(s.expedition.salvage).toBe(salvage);
  });

  it('ignores a role that does not exist', () => {
    const s = fitted();
    step(s, 0, [{ type: 'setRole', id: 'battlecruiser' }], OPTS);
    expect(s.expedition.role).toBe('general');
  });

  it('reaches further as a survey vessel and less as a hauler', () => {
    const s = fitted();
    const base = sensorRange(s.expedition);
    step(s, 0, [{ type: 'setRole', id: 'survey' }], OPTS);
    expect(sensorRange(s.expedition)).toBeGreaterThan(base);
    step(s, 0, [{ type: 'setRole', id: 'hauler' }], OPTS);
    expect(sensorRange(s.expedition)).toBeLessThan(base);
  });
});

describe('salvage-built infrastructure', () => {
  it('costs salvage and never TU', () => {
    const s = fitted();
    const def = INFRASTRUCTURE_BY_ID['relay-buoy']!;
    s.expedition.salvage = def.cost;
    const tuBefore = s.tu.toString();

    step(s, 0, [{ type: 'buildInfrastructure', id: 'relay-buoy' }], OPTS);

    expect(infrastructureCount(s.expedition, 'relay-buoy')).toBe(1);
    expect(s.expedition.salvage).toBe(0);
    expect(s.tu.toString()).toBe(tuBefore);
  });

  it('refuses when the salvage is not there', () => {
    const s = fitted();
    s.expedition.salvage = 1;
    expect(canBuildInfrastructure(s, 'relay-buoy')).toBe(false);
    expect(buildInfrastructure(s, [], 'relay-buoy')).toBe(false);
  });

  it('stops at the number that may stand at once', () => {
    const s = fitted();
    const def = INFRASTRUCTURE_BY_ID['depot']!;
    s.expedition.salvage = def.cost * (def.max + 4);
    for (let i = 0; i < def.max + 3; i++) buildInfrastructure(s, [], 'depot');
    expect(infrastructureCount(s.expedition, 'depot')).toBe(def.max);
  });

  it('improves only navigation, storage and convenience', () => {
    const s = fitted();
    s.expedition.salvage = 1000;
    const tuPerSecBefore = s.tu.toString();
    for (const id of Object.keys(INFRASTRUCTURE_BY_ID)) buildInfrastructure(s, [], id);

    const e = loadoutEffects(s.expedition);
    expect(e.sensors).toBeGreaterThan(1);
    expect(e.capacity).toBeGreaterThan(1);
    expect(e.rigCap).toBeGreaterThan(1);
    // The seal: nothing here has produced a single TU.
    expect(s.tu.toString()).toBe(tuPerSecBefore);
  });

  it('stacks, and survives a save', () => {
    const s = fitted();
    s.expedition.salvage = 1000;
    buildInfrastructure(s, [], 'relay-buoy');
    const one = loadoutEffects(s.expedition).sensors;
    buildInfrastructure(s, [], 'relay-buoy');
    expect(loadoutEffects(s.expedition).sensors).toBeGreaterThan(one);

    step(s, 0, [{ type: 'setRole', id: 'survey' }], OPTS);
    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.expedition.role).toBe('survey');
    expect(round.state.expedition.infrastructure['relay-buoy']).toBe(2);
  });
});
