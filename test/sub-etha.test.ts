import { describe, expect, it } from 'vitest';
import { newGame, step, stepOffline } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import { bearingOf, isRumoured, rumouredSites } from '../src/engine/subEtha';
import { deepFieldSites } from '../src/engine/deepField';
import { DEEP_FIELD } from '../src/content/deepField';
import { C } from '../src/content/constants';
import type { GameState, Input } from '../src/engine/types';

const OPTS = { utcDay: 3 };
const HOUR = 3_600_000;

function played(seed: number, ms = HOUR): GameState {
  const s = newGame(seed, 0);
  step(s, 0, [{ type: 'devGrant', tu: '1e12' }], OPTS);
  step(s, ms, [], OPTS);
  return s;
}

describe('the channel', () => {
  it('files broadcasts as time passes', () => {
    const s = played(7);
    expect(s.subEtha.log.length).toBeGreaterThan(5);
    for (const entry of s.subEtha.log) {
      expect(entry.text.length).toBeGreaterThan(10);
      expect(entry.atMs).toBeLessThanOrEqual(s.gameTimeMs);
    }
  });

  it('is identical however the same elapsed time is chunked (engine law #1)', () => {
    const a = newGame(21, 0);
    const b = newGame(21, 0);
    step(a, HOUR, [], OPTS);
    for (let i = 0; i < 3_600; i++) step(b, 1_000, [], OPTS);
    expect(a.subEtha.log).toEqual(b.subEtha.log);
  });

  it('keeps filing while you are away — that is the point of it', () => {
    const s = newGame(33, 0);
    step(s, 60_000, [], OPTS); // establish the channel
    const before = s.subEtha.log.length;
    stepOffline(s, 6 * HOUR, OPTS);
    expect(s.subEtha.log.length).toBeGreaterThan(before);
  });

  it('caps the log so a long absence cannot bloat the save', () => {
    const s = newGame(44, 0);
    stepOffline(s, 8 * HOUR, OPTS);
    expect(s.subEtha.log.length).toBeLessThanOrEqual(C.SUBETHA_LOG_MAX);
    // The survivors are the newest ones, in order.
    const times = s.subEtha.log.map((e) => e.atMs);
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });

  it('does not repeat itself back-to-back', () => {
    const s = newGame(66, 0);
    // Force a long burst — the worst case the weighted pick can face.
    for (let i = 0; i < 40; i++) step(s, 0, [{ type: 'devSpawn', what: 'broadcast' }], OPTS);
    const ambient = s.subEtha.log.filter((e) => e.kind !== 'chronicle' && e.kind !== 'rumour');
    expect(ambient.length).toBeGreaterThan(10);
    for (let i = 1; i < ambient.length; i++) {
      expect(ambient[i]!.text).not.toBe(ambient[i - 1]!.text);
    }
  });

  it('gives different universes different chatter', () => {
    const a = played(101);
    const b = played(202);
    expect(a.subEtha.log.map((e) => e.text)).not.toEqual(b.subEtha.log.map((e) => e.text));
  });

  it('round-trips through the save', () => {
    const s = played(55);
    const back = deserialize(serialize(s));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.subEtha).toEqual(s.subEtha);
  });
});

describe('the chronicle', () => {
  it('records deliveries at the moment they happen, not in a batch', () => {
    const s = newGame(88, 0);
    const inputs: Input[] = [{ type: 'devGrant', tu: '1e9', gaugeFrac: 1 }];
    step(s, 0, inputs, OPTS);
    step(s, 1_000, [], OPTS);
    const delivered = s.subEtha.log.filter((e) => e.kind === 'chronicle');
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.some((e) => e.text.includes('delivered and inhabited'))).toBe(true);
  });

  it('records a Deep Field boarding with its salvage', () => {
    const s = newGame(89, 0);
    step(s, 0, [{ type: 'boardSite', id: 'generationShip' }], OPTS);
    const texts = s.subEtha.log.map((e) => e.text).join(' ');
    expect(texts).toContain('The Perpetual, Generation Ship');
    expect(texts).toContain('16 units of salvage');
  });

  it('does not announce a contract you withdrew yourself', () => {
    const s = newGame(90, 0);
    const offer = s.operations.offers[0];
    if (!offer) return;
    step(s, 0, [{ type: 'acceptContract', id: offer.id }], OPTS);
    const before = s.subEtha.log.length;
    step(s, 0, [{ type: 'abandonContract' }], OPTS);
    expect(s.subEtha.log.length).toBe(before);
  });
});

describe('rumours', () => {
  it('point at landmarks that have not been found yet', () => {
    const s = played(123, 4 * HOUR);
    const rumours = s.subEtha.log.filter((e) => e.kind === 'rumour');
    expect(rumours.length).toBeGreaterThan(0);
    for (const r of rumours) {
      expect(r.site).toBeDefined();
      expect(DEEP_FIELD.some((d) => d.id === r.site)).toBe(true);
    }
  });

  it('name a real bearing and a real distance', () => {
    const s = played(124, 4 * HOUR);
    const rumour = s.subEtha.log.find((e) => e.kind === 'rumour');
    expect(rumour).toBeDefined();
    if (!rumour?.site) return;
    const site = deepFieldSites(s.seed).find((x) => x.def.id === rumour.site)!;
    const dist = Math.round(Math.hypot(...site.pos));
    expect(rumour.text).toContain(String(dist));
    expect(rumour.text).toContain(bearingOf(site.pos).split(' ')[0]!);
  });

  it('never gossips twice about the same landmark', () => {
    const s = played(125, 8 * HOUR);
    const sites = s.subEtha.log.filter((e) => e.site).map((e) => e.site!);
    // The log is a ring buffer, so only check what survives in it.
    expect(new Set(sites).size).toBe(sites.length);
  });

  it('never gossips about something already resolved', () => {
    const s = newGame(126, 0);
    for (const def of DEEP_FIELD) step(s, 0, [{ type: 'scanSite', id: def.id }], OPTS);
    step(s, 4 * HOUR, [], OPTS);
    expect(s.subEtha.log.filter((e) => e.kind === 'rumour')).toHaveLength(0);
  });

  it('exposes the rumoured set for the sensors to widen on', () => {
    const s = played(127, 4 * HOUR);
    const set = rumouredSites(s);
    expect(set.size).toBeGreaterThan(0);
    for (const id of set) expect(isRumoured(s, id)).toBe(true);
    expect(isRumoured(s, 'nothing-of-the-sort')).toBe(false);
  });
});

describe('bearings', () => {
  it('names the dominant axis in shipping-lane terms', () => {
    expect(bearingOf([0, 0, -50])).toBe('coreward');
    expect(bearingOf([0, 0, 50])).toBe('rimward');
    expect(bearingOf([50, 0, 0])).toBe('spinward');
    expect(bearingOf([-50, 0, 0])).toBe('trailing');
  });

  it('adds height only when it actually matters', () => {
    expect(bearingOf([50, 1, 0])).toBe('spinward');
    expect(bearingOf([30, 40, 0])).toBe('spinward and high');
    expect(bearingOf([30, -40, 0])).toBe('spinward and low');
  });
});
