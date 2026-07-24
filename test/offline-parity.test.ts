import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import type { Input } from '../src/engine/types';

const OPTS = { utcDay: 3 };

function seededPlayedState(seed: number) {
  const s = newGame(seed, 0);
  // Establish some production so time actually does something.
  for (let tick = 0; tick < 1_200; tick++) {
    const inputs: Input[] = [];
    if (tick % 2 === 0) inputs.push({ type: 'click' });
    if (tick % 16 === 0) inputs.push({ type: 'buyBuilding', id: 'seedProbe', qty: 'max' });
    if (tick % 60 === 0) inputs.push({ type: 'buyBuilding', id: 'atmoProcessor', qty: 'max' });
    if (tick % 90 === 0) inputs.push({ type: 'buyBuilding', id: 'hydroSeeder', qty: 'max' });
    step(s, 250, inputs, OPTS);
  }
  return s;
}

function clone(s: ReturnType<typeof newGame>) {
  const r = deserialize(serialize(s));
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('time integration parity (engine law #1)', () => {
  it('offline: one 2-hour step ≡ 120 one-minute steps', () => {
    const base = seededPlayedState(99);
    const a = clone(base);
    const b = clone(base);

    step(a, 2 * 3_600_000, [], { ...OPTS, offline: true });
    for (let i = 0; i < 120; i++) step(b, 60_000, [], { ...OPTS, offline: true });

    expect(serialize(a)).toEqual(serialize(b));
  });

  it('online: one 10-minute step ≡ 2400 quarter-second steps (spawns included)', () => {
    const base = seededPlayedState(1234);
    const a = clone(base);
    const b = clone(base);

    step(a, 600_000, [], OPTS);
    for (let i = 0; i < 2_400; i++) step(b, 250, [], OPTS);

    expect(serialize(a)).toEqual(serialize(b));
  });

  it('offline efficiency < 1 slows gauge fill but stays exact across chunkings', () => {
    const base = seededPlayedState(555);
    const a = clone(base);
    const b = clone(base);

    step(a, 3_600_000, [], { ...OPTS, offline: true });
    for (let i = 0; i < 3_600; i++) step(b, 1_000, [], { ...OPTS, offline: true });

    expect(serialize(a)).toEqual(serialize(b));
  });
});
