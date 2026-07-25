import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine/sim';
import {
  boardRange,
  createExpeditionState,
  deepFieldSites,
  hasJumpDrive,
  hullShell,
  jumpStandoff,
  refitCost,
  scanSecondsFor,
  sensorRange,
  sitePositionAt,
  thrustMult,
  UNREACHABLE_HOLD,
} from '../src/engine/deepField';
import { DEEP_FIELD, DEEP_FIELD_BY_ID } from '../src/content/deepField';
import { WEB_R } from '../src/ui/scene/universeLayout';
import { REFITS } from '../src/content/refit';
import { serialize, deserialize } from '../src/engine/save/codec';

const SEED = 0x5eed;

describe('deep field placement', () => {
  it('is a pure function of the master seed', () => {
    const a = deepFieldSites(SEED);
    const b = deepFieldSites(SEED);
    expect(a.map((s) => s.pos)).toEqual(b.map((s) => s.pos));
  });

  it('gives different universes different skies', () => {
    const a = deepFieldSites(SEED);
    const b = deepFieldSites(SEED + 1);
    const same = a.filter((s, i) => s.pos[0] === b[i]!.pos[0] && s.pos[2] === b[i]!.pos[2]);
    expect(same.length).toBe(0);
  });

  it('places every landmark inside the navigable volume', () => {
    for (const site of deepFieldSites(SEED)) {
      const d = Math.hypot(...site.pos);
      // Outside the hero planet's neighbourhood, inside the soft wall (200u).
      expect(d).toBeGreaterThan(8);
      expect(d).toBeLessThan(WEB_R * 1.35); // inside the soft wall
    }
  });

  it('does not berth two landmarks on top of each other', () => {
    const sites = deepFieldSites(SEED);
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        const a = sites[i]!.pos;
        const b = sites[j]!.pos;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(11.9);
      }
    }
  });

  it('holds the unreachable landmark ahead of the camera, always', () => {
    const site = deepFieldSites(SEED).find((s) => s.def.unreachable)!;
    const out: [number, number, number] = [0, 0, 0];
    const home = Math.hypot(...site.pos);
    // Fly straight at it and it keeps its distance.
    let previous = Infinity;
    for (const t of [0, 300, 600, 900, 1200]) {
      const cam: [number, number, number] = [
        (site.pos[0] / home) * t,
        (site.pos[1] / home) * t,
        (site.pos[2] / home) * t,
      ];
      sitePositionAt(site, cam[0], cam[1], cam[2], out);
      const d = Math.hypot(out[0] - cam[0], out[1] - cam[1], out[2] - cam[2]);
      expect(d).toBeGreaterThanOrEqual(UNREACHABLE_HOLD - 0.001);
      previous = d;
    }
    expect(previous).toBeCloseTo(UNREACHABLE_HOLD, 3);
  });

  it('keeps fixed landmarks fixed regardless of where you look from', () => {
    const site = deepFieldSites(SEED).find((s) => !s.def.unreachable)!;
    const out: [number, number, number] = [0, 0, 0];
    sitePositionAt(site, 0, 0, 0, out);
    expect(out).toEqual([...site.pos]);
    sitePositionAt(site, 90, -20, 130, out);
    expect(out).toEqual([...site.pos]);
  });
});

describe('approach geometry', () => {
  it('parks you inside your own boarding envelope, outside it after a jump', () => {
    for (const def of DEEP_FIELD) {
      // The invariant the whole approach depends on.
      expect(hullShell(def.radius)).toBeLessThan(boardRange(def.radius));
      expect(boardRange(def.radius)).toBeLessThan(jumpStandoff(def.radius));
    }
  });
});

describe('scanning and boarding', () => {
  it('files a Guide entry on a scan, once', () => {
    const s = newGame(SEED, 0);
    const r1 = step(s, 0, [{ type: 'scanSite', id: 'sofa' }]);
    expect(r1.effects.some((e) => e.t === 'siteScanned')).toBe(true);
    expect(s.expedition.discovered['sofa']).toBeDefined();

    const r2 = step(s, 0, [{ type: 'scanSite', id: 'sofa' }]);
    expect(r2.effects.some((e) => e.t === 'siteScanned')).toBe(false);
  });

  it('ignores landmarks that are not in the catalogue', () => {
    const s = newGame(SEED, 0);
    step(s, 0, [{ type: 'scanSite', id: 'the-management' }]);
    expect(Object.keys(s.expedition.discovered)).toHaveLength(0);
  });

  it('pays salvage on boarding, once, and files the entry if you skipped the scan', () => {
    const s = newGame(SEED, 0);
    const def = DEEP_FIELD_BY_ID['generationShip']!;
    const r = step(s, 0, [{ type: 'boardSite', id: 'generationShip' }]);
    expect(r.effects.some((e) => e.t === 'siteScanned')).toBe(true);
    expect(s.expedition.salvage).toBe(def.salvage);

    step(s, 0, [{ type: 'boardSite', id: 'generationShip' }]);
    expect(s.expedition.salvage).toBe(def.salvage);
  });

  it('refuses to board the restaurant, on principle', () => {
    const s = newGame(SEED, 0);
    step(s, 0, [{ type: 'boardSite', id: 'milliways' }]);
    expect(s.expedition.boarded['milliways']).toBeUndefined();
    expect(s.expedition.salvage).toBe(0);
  });

  it('hands over the towel when the towel is collected', () => {
    const s = newGame(SEED, 0);
    step(s, 0, [{ type: 'boardSite', id: 'towelDrift' }]);
    expect(s.flags['towelEarned']).toBe(true);
    expect(s.achievements['towel']).toBeDefined();
  });

  it('never touches production', () => {
    const s = newGame(SEED, 0);
    const tuBefore = s.tu.toString();
    const scienceBefore = s.science.toString();
    for (const def of DEEP_FIELD) step(s, 0, [{ type: 'boardSite', id: def.id }]);
    expect(s.tu.toString()).toBe(tuBefore);
    expect(s.science.toString()).toBe(scienceBefore);
  });
});

describe('the refit bay', () => {
  it('spends salvage and raises the rank', () => {
    const s = newGame(SEED, 0);
    s.expedition.salvage = 100;
    const cost = refitCost(s.expedition, 'sensors')!;
    step(s, 0, [{ type: 'buyRefit', id: 'sensors' }]);
    expect(s.expedition.refits['sensors']).toBe(1);
    expect(s.expedition.salvage).toBe(100 - cost);
  });

  it('refuses a rank you cannot afford', () => {
    const s = newGame(SEED, 0);
    s.expedition.salvage = 0;
    step(s, 0, [{ type: 'buyRefit', id: 'sensors' }]);
    expect(s.expedition.refits['sensors']).toBeUndefined();
  });

  it('stops at the top rank', () => {
    const s = newGame(SEED, 0);
    s.expedition.salvage = 10_000;
    for (const def of REFITS) {
      for (let i = 0; i < def.maxRank + 3; i++) step(s, 0, [{ type: 'buyRefit', id: def.id }]);
      expect(s.expedition.refits[def.id]).toBe(def.maxRank);
      expect(refitCost(s.expedition, def.id)).toBeNull();
    }
  });

  it('improves the ship in the direction it advertises', () => {
    const base = createExpeditionState();
    const kitted = createExpeditionState();
    kitted.refits = { sensors: 3, analysis: 3, thrusters: 3, drive: 1 };
    expect(sensorRange(kitted)).toBeGreaterThan(sensorRange(base));
    expect(thrustMult(kitted)).toBeGreaterThan(thrustMult(base));
    expect(scanSecondsFor(kitted, 'sofa')).toBeLessThan(scanSecondsFor(base, 'sofa'));
    expect(hasJumpDrive(base)).toBe(false);
    expect(hasJumpDrive(kitted)).toBe(true);
  });

  it('can reach the restaurant with sensors alone, and never with the ship', () => {
    const kitted = createExpeditionState();
    kitted.refits = { sensors: 3 };
    // Full sensors out-reach the hold; nothing else ever closes it.
    expect(sensorRange(kitted)).toBeGreaterThan(UNREACHABLE_HOLD);
    expect(sensorRange(createExpeditionState())).toBeLessThan(UNREACHABLE_HOLD);
  });
});

describe('the logbook survives', () => {
  it('is preserved across prestige — those things were never yours to sell', () => {
    const s = newGame(SEED, 0);
    step(s, 0, [{ type: 'boardSite', id: 'sofa' }]);
    const salvage = s.expedition.salvage;
    s.expedition.refits['sensors'] = 2;

    // Force an eligible portfolio and sell it.
    s.run.systems = 99;
    s.lifetime.planetsCompleted = 99;
    step(s, 0, [{ type: 'prestige' }]);

    expect(s.expedition.discovered['sofa']).toBeDefined();
    expect(s.expedition.boarded['sofa']).toBeDefined();
    expect(s.expedition.salvage).toBe(salvage);
    expect(s.expedition.refits['sensors']).toBe(2);
  });

  it('round-trips through the save', () => {
    const s = newGame(SEED, 0);
    step(s, 0, [{ type: 'boardSite', id: 'teapot' }, { type: 'scanSite', id: 'whale' }]);
    s.expedition.refits['analysis'] = 2;
    const back = deserialize(serialize(s));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.expedition).toEqual(s.expedition);
  });
});
