import { describe, expect, it } from 'vitest';
import { compose, compositionSpace, type Composition } from '../src/content/composer';
import { WORLD_BIOGRAPHY, worldContextTags } from '../src/content/biography';
import { createWorldRecord, worldBiography, worldTraits } from '../src/engine/worldRecords';
import { newGame } from '../src/engine/sim';
import type { CompletedPlanetRecord } from '../src/engine/types';

const toy: Composition = {
  id: 'toy',
  pattern: '{a} {b}',
  slots: [
    {
      id: 'a',
      fragments: [
        { id: 'building', text: 'A building.', tags: ['solid'] },
        { id: 'cloud', text: 'A cloud.', tags: ['vapour'] },
      ],
    },
    {
      id: 'b',
      fragments: [
        { id: 'door', text: 'It has a door.', requires: ['solid'] },
        { id: 'drifts', text: 'It drifts.', forbids: ['solid'] },
        { id: 'plain', text: 'It is there.' },
      ],
    },
  ],
};

const sampleWorld = (over: Partial<CompletedPlanetRecord> = {}): CompletedPlanetRecord => ({
  lifetimeIndex: 12, seed: 1, type: 'ocean', size: 'small', name: 'Pelagia II',
  quirks: [], survey: null, completionMs: 1, bottleneck: 'bio', installations: ['a'],
  ...over,
});

describe('the combinatorial content format', () => {
  it('is deterministic — same seed, same sentence', () => {
    for (let seed = 0; seed < 25; seed++) {
      expect(compose(toy, seed).text).toBe(compose(toy, seed).text);
    }
  });

  it('advances no shared rng: composing is not a dice roll the universe feels', () => {
    const s = newGame(7, 0);
    const before = { ...s.rng };
    for (let seed = 0; seed < 20; seed++) compose(WORLD_BIOGRAPHY, seed);
    expect(s.rng).toEqual(before);
  });

  it('never puts a door on a cloud', () => {
    for (let seed = 0; seed < 400; seed++) {
      const out = compose(toy, seed);
      if (out.text.includes('A cloud.')) expect(out.text).not.toContain('a door');
      if (out.text.includes('It has a door.')) expect(out.text).toContain('A building.');
    }
  });

  it('honours context tags supplied by the caller', () => {
    for (let seed = 0; seed < 50; seed++) {
      // 'solid' injected up front means the cloud-only fragment is excluded
      // even though slot `a` may still pick the cloud — the door becomes legal.
      const out = compose(toy, seed, ['solid']);
      expect(out.text).not.toContain('It drifts.');
    }
  });

  it('fills a slot rather than leaving a hole when everything is excluded', () => {
    const cornered: Composition = {
      id: 'cornered',
      pattern: '{only}',
      slots: [{
        id: 'only',
        fragments: [
          { id: 'impossible', text: 'never', requires: ['absent-tag'] },
          { id: 'fallback', text: 'something' },
        ],
      }],
    };
    expect(compose(cornered, 1).text).toBe('something');
    expect(compose(cornered, 1).text).not.toContain('{');
  });

  it('leaves an unknown placeholder alone rather than printing undefined', () => {
    const odd: Composition = { id: 'odd', pattern: '{a} {missing}', slots: toy.slots.slice(0, 1) };
    expect(compose(odd, 1).text).toContain('{missing}');
    expect(compose(odd, 1).text).not.toContain('undefined');
  });

  it('reports how much material an authored set actually holds', () => {
    expect(compositionSpace(toy)).toBe(6);
    expect(compositionSpace(WORLD_BIOGRAPHY)).toBeGreaterThan(100);
  });
});

describe('world biographies', () => {
  it('describes a world without leaving holes or contradictions', () => {
    const record = createWorldRecord(sampleWorld(), 1, 0);
    const line = worldBiography(record, 1);

    expect(line.length).toBeGreaterThan(20);
    expect(line).not.toContain('{');
    expect(line).not.toContain('undefined');
    // A world nobody has neglected must not be described as having stopped writing.
    expect(line).not.toContain('stopped writing');
  });

  it('says something different about a neglected world', () => {
    const record = createWorldRecord(sampleWorld(), 1, 0);
    for (let i = 0; i < 4; i++) {
      record.history.push({ kind: 'petitionIgnored', id: `p${i}`, atGameMs: i });
    }
    const traits = worldTraits(record, 0.4);
    expect(traits).toContain('neglected');

    const tags = worldContextTags(record.type, record.bottleneck, traits);
    for (let seed = 0; seed < 60; seed++) {
      const out = compose(WORLD_BIOGRAPHY, seed, tags);
      // "Settled, and settling further" forbids neglect; it must never appear.
      expect(out.text).not.toContain('settling further');
    }
  });

  it('changes only when something actually happens to the world', () => {
    const record = createWorldRecord(sampleWorld(), 1, 0);
    const first = worldBiography(record, 1);
    expect(worldBiography(record, 1)).toBe(first);

    record.history.push({ kind: 'visited', id: 'v', atGameMs: 1 });
    // A different history is a different seed; the description is allowed to
    // move. What matters is that it is stable while nothing is happening.
    const second = worldBiography(record, 1);
    expect(worldBiography(record, 1)).toBe(second);
  });

  it('matches the world it is describing', () => {
    const ice = createWorldRecord(sampleWorld({ type: 'ice', bottleneck: 'thermal' }), 1, 0);
    const ocean = createWorldRecord(sampleWorld({ type: 'ocean', bottleneck: 'hydro' }), 1, 0);
    // Fragments gated on the wrong type must never appear.
    for (let seed = 0; seed < 80; seed++) {
      const tags = worldContextTags('ice', 'thermal', worldTraits(ice, 1));
      expect(compose(WORLD_BIOGRAPHY, seed, tags).text).not.toContain('Two thirds sea');
    }
    expect(worldBiography(ocean, 1)).not.toContain('Warm now.');
  });
});
