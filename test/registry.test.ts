import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_BY_ID } from '../src/content/buildings';
import { UPGRADES } from '../src/content/upgrades';
import { RESEARCH, RESEARCH_BY_ID } from '../src/content/research';
import { ACHIEVEMENTS } from '../src/content/achievements';
import { QUIRKS } from '../src/content/quirks';
import { SURVEYS } from '../src/content/surveys';
import { EVENTS } from '../src/content/events';
import { CATALOGUE } from '../src/content/catalogue';

describe('content registry integrity (engine law #4)', () => {
  it('all ids are unique across each registry', () => {
    for (const list of [
      BUILDINGS.map((x) => x.id),
      UPGRADES.map((x) => x.id),
      RESEARCH.map((x) => x.id),
      ACHIEVEMENTS.map((x) => x.id),
      QUIRKS.map((x) => x.id),
      SURVEYS.map((x) => x.id),
      EVENTS.map((x) => x.id),
      CATALOGUE.map((x) => x.id),
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('upgrade cross-references resolve', () => {
    const upgradeIds = new Set(UPGRADES.map((u) => u.id));
    for (const u of UPGRADES) {
      for (const e of u.effects) {
        if (e.kind === 'buildingMult') expect(BUILDING_BY_ID[e.building]).toBeDefined();
      }
      if (u.requiresUpgrade) expect(upgradeIds.has(u.requiresUpgrade)).toBe(true);
      if (u.requiresBuilding) {
        for (const bid of Object.keys(u.requiresBuilding)) {
          expect(BUILDING_BY_ID[bid]).toBeDefined();
        }
      }
    }
  });

  it('research cross-references resolve', () => {
    for (const r of RESEARCH) {
      if (r.requiresResearch) expect(RESEARCH_BY_ID[r.requiresResearch]).toBeDefined();
      if (r.requiresBuilding) {
        for (const bid of Object.keys(r.requiresBuilding)) {
          expect(BUILDING_BY_ID[bid]).toBeDefined();
        }
      }
    }
  });

  it('every piece of content has a Guide voice', () => {
    for (const b of BUILDINGS) expect(b.guide.length).toBeGreaterThan(10);
    for (const u of UPGRADES) expect(u.guide.length).toBeGreaterThan(10);
    for (const r of RESEARCH) expect(r.guide.length).toBeGreaterThan(1);
    for (const a of ACHIEVEMENTS) expect(a.guide.length).toBeGreaterThan(10);
    for (const q of QUIRKS) expect(q.text.length).toBeGreaterThan(5);
    for (const s of SURVEYS) expect(s.text.length).toBeGreaterThan(10);
    for (const p of CATALOGUE) expect(p.guide.length).toBeGreaterThan(10);
  });

  it('costs and growth are sane (no NaN ladder)', () => {
    let prev = 0;
    for (const b of BUILDINGS) {
      expect(Number.isFinite(b.baseCost)).toBe(true);
      expect(b.baseCost).toBeGreaterThan(prev);
      prev = b.baseCost;
    }
  });
});
