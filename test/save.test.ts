import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import { deserialize, exportSave, importSave, serialize } from '../src/engine/save/codec';

const OPTS = { utcDay: 3 };

describe('save codec', () => {
  it('round-trips through JSON', () => {
    const s = newGame(31337, 12345);
    for (let i = 0; i < 400; i++) {
      step(s, 250, i % 3 === 0 ? [{ type: 'click' }] : [], OPTS);
    }
    const json = serialize(s);
    const r = deserialize(json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(serialize(r.state)).toEqual(json);
  });

  it('round-trips through the Share and Enjoy export string', () => {
    const s = newGame(8, 0);
    step(s, 60_000, [{ type: 'click' }], OPTS);
    const exported = exportSave(s);
    expect(exported.startsWith('TC2:')).toBe(true);
    const r = importSave(exported);
    expect(r.ok).toBe(true);
    if (r.ok) expect(serialize(r.state)).toEqual(serialize(s));
  });

  it('rejects garbage without throwing', () => {
    expect(deserialize('{"version":1}').ok).toBe(false);
    expect(deserialize('not json at all').ok).toBe(false);
    expect(importSave('TC2:!!!!').ok).toBe(false);
    expect(importSave('hello').ok).toBe(false);
  });

  it('keeps saves comfortably under the 32 KB budget', () => {
    const s = newGame(1, 0);
    for (let i = 0; i < 2_000; i++) step(s, 250, [{ type: 'click' }], OPTS);
    expect(serialize(s).length).toBeLessThan(32 * 1024);
  });
});
