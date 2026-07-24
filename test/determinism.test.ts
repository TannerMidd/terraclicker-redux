import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import type { Input } from '../src/engine/types';

const OPTS = { utcDay: 3 }; // fixed Wednesday: no Monday quirk interference

function scriptedInputs(tick: number): Input[] {
  const inputs: Input[] = [];
  if (tick % 2 === 0) inputs.push({ type: 'click' });
  if (tick % 20 === 0) inputs.push({ type: 'buyBuilding', id: 'seedProbe', qty: 'max' });
  if (tick % 40 === 0) inputs.push({ type: 'buyBuilding', id: 'atmoProcessor', qty: 'max' });
  if (tick === 100) inputs.push({ type: 'buyUpgrade', id: 'terraforming-gloves' });
  return inputs;
}

describe('determinism', () => {
  it('same seed + same inputs → bit-identical state', () => {
    const a = newGame(424242, 1_000_000);
    const b = newGame(424242, 1_000_000);
    for (let tick = 0; tick < 2_000; tick++) {
      step(a, 250, scriptedInputs(tick), OPTS);
      step(b, 250, scriptedInputs(tick), OPTS);
    }
    expect(serialize(a)).toEqual(serialize(b));
  });

  it('different seeds diverge (planets differ eventually)', () => {
    const a = newGame(1, 0);
    const b = newGame(2, 0);
    // First planet is scripted (Terra Prima) but rng cursors must differ.
    expect(JSON.stringify(a.rng)).not.toEqual(JSON.stringify(b.rng));
  });

  it('a deserialized save continues identically to the original', () => {
    const a = newGame(7, 0);
    for (let tick = 0; tick < 500; tick++) step(a, 250, scriptedInputs(tick), OPTS);

    const loaded = deserialize(serialize(a));
    if (!loaded.ok) throw new Error(loaded.error);
    const b = loaded.state;

    for (let tick = 500; tick < 1_000; tick++) {
      step(a, 250, scriptedInputs(tick), OPTS);
      step(b, 250, scriptedInputs(tick), OPTS);
    }
    expect(serialize(a)).toEqual(serialize(b));
  });
});
