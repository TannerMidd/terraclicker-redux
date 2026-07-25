import { describe, expect, it } from 'vitest';
import { newGame, step, stepOffline } from '../src/engine/sim';
import { serialize, deserialize } from '../src/engine/save/codec';
import { computeDerived, prestigeEligible } from '../src/engine/economy';
import {
  cargoCapacity,
  massFactor,
  refreshJobBoard,
  rigLimit,
  seamSites,
} from '../src/engine/freight';
import { buildProgress, isBuilt, megaprojectEffects } from '../src/engine/megaprojects';
import { MEGAPROJECTS } from '../src/content/megaprojects';
import { SEAMS, SEAM_BY_ID, FREIGHT_BY_ID } from '../src/content/freight';
import { PETITIONS } from '../src/content/petitions';
import { BUILDINGS } from '../src/content/buildings';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };
const HOUR = 3_600_000;

function withWorlds(seed: number, worlds = 6): GameState {
  const s = newGame(seed, 0);
  for (let i = 0; i < worlds; i++) {
    step(s, 0, [{ type: 'devGrant', tu: '1e12', gaugeFrac: 1 }], OPTS);
    step(s, 300, [], OPTS);
    if (s.planet.surveyOptions) {
      step(s, 0, [{ type: 'chooseSurvey', id: s.planet.surveyOptions[0]! }], OPTS);
    }
  }
  step(s, 0, [{ type: 'devGrant', tu: '1e12' }], OPTS);
  step(s, 0, [{ type: 'buyBuilding', id: BUILDINGS[0]!.id, qty: 25 }], OPTS);
  step(s, 1000, [], OPTS);
  return s;
}

/** Fit a refit line to a rank without going through the salvage economy. */
function fit(s: GameState, id: string, rank: number): void {
  s.expedition.refits[id] = rank;
}

describe('the seal between the two economies', () => {
  it('flight content never mentions TU, science or aspects', () => {
    // The whole flight layer is denominated in salvage. If a payload or seam
    // ever starts paying production, this is the test that should stop it.
    const json = JSON.stringify({ FREIGHT: FREIGHT_BY_ID, SEAMS });
    expect(json).not.toMatch(/\btu\b/i);
    expect(json).not.toMatch(/science/i);
  });

  it('delivering pays salvage and trust, and touches nothing else', () => {
    const s = withWorlds(11);
    fit(s, 'cargoHold', 3);
    refreshJobBoard(s);
    const job = s.expedition.jobs[0]!;
    const def = FREIGHT_BY_ID[job.id]!;
    const tu = s.tu;
    const science = s.science;
    const salvage = s.expedition.salvage;
    const rep = s.operations.reputation[def.faction];

    step(s, 0, [{ type: 'acceptJob', uid: job.uid }], OPTS);
    step(s, 0, [{ type: 'deliverManifest' }], OPTS);

    expect(s.expedition.salvage).toBe(salvage + job.salvage);
    expect(s.operations.reputation[def.faction]).toBeGreaterThan(rep);
    expect(s.tu.eq(tu)).toBe(true);
    expect(s.science.eq(science)).toBe(true);
  });
});

describe('the hold', () => {
  it('will not take a job with no hold fitted', () => {
    const s = withWorlds(12);
    expect(cargoCapacity(s.expedition)).toBe(0);
    refreshJobBoard(s);
    const job = s.expedition.jobs[0]!;
    step(s, 0, [{ type: 'acceptJob', uid: job.uid }], OPTS);
    expect(s.expedition.manifest).toBeNull();
  });

  it('refuses a payload heavier than the hold', () => {
    const s = withWorlds(13);
    fit(s, 'cargoHold', 1); // 20t
    refreshJobBoard(s);
    const heavy = s.expedition.jobs.find((j) => (FREIGHT_BY_ID[j.id]?.mass ?? 0) > 20);
    if (!heavy) return;
    step(s, 0, [{ type: 'acceptJob', uid: heavy.uid }], OPTS);
    expect(s.expedition.manifest).toBeNull();
  });

  it('carries one job at a time', () => {
    const s = withWorlds(14);
    fit(s, 'cargoHold', 3);
    refreshJobBoard(s);
    const [a, b] = s.expedition.jobs;
    step(s, 0, [{ type: 'acceptJob', uid: a!.uid }], OPTS);
    step(s, 0, [{ type: 'acceptJob', uid: b!.uid }], OPTS);
    expect(s.expedition.manifest!.uid).toBe(a!.uid);
  });

  it('makes the ship heavier to fly, and only while loaded', () => {
    const s = withWorlds(15);
    fit(s, 'cargoHold', 1);
    expect(massFactor(s.expedition)).toBe(1);
    refreshJobBoard(s);
    const job = s.expedition.jobs.find((j) => (FREIGHT_BY_ID[j.id]?.mass ?? 0) > 5);
    if (!job) return;
    step(s, 0, [{ type: 'acceptJob', uid: job.uid }], OPTS);
    expect(massFactor(s.expedition)).toBeGreaterThan(1);
    step(s, 0, [{ type: 'deliverManifest' }], OPTS);
    expect(massFactor(s.expedition)).toBe(1);
  });

  it('only ever routes between worlds you actually delivered', () => {
    const s = withWorlds(16, 6);
    refreshJobBoard(s);
    const names = new Set(s.run.completedPlanets.map((w) => w.name));
    for (const job of s.expedition.jobs) {
      expect(names.has(job.fromName)).toBe(true);
      expect(names.has(job.toName)).toBe(true);
      expect(job.fromName).not.toBe(job.toName);
    }
  });

  it('is never taken from you by a clock', () => {
    const s = withWorlds(17);
    fit(s, 'cargoHold', 3);
    refreshJobBoard(s);
    step(s, 0, [{ type: 'acceptJob', uid: s.expedition.jobs[0]!.uid }], OPTS);
    const held = s.expedition.manifest!.id;
    stepOffline(s, 12 * HOUR, OPTS);
    step(s, 2 * HOUR, [], OPTS);
    expect(s.expedition.manifest?.id).toBe(held);
  });
});

describe('mining', () => {
  it('places every seam from the master seed alone', () => {
    const a = seamSites(4242);
    const b = seamSites(4242);
    const c = seamSites(9999);
    expect(a).toEqual(b);
    expect(a.map((x) => x.pos)).not.toEqual(c.map((x) => x.pos));
    expect(a).toHaveLength(SEAMS.length);
  });

  it('needs prospecting, a bay, and the salvage before a rig stands', () => {
    const s = withWorlds(18);
    const seam = SEAMS[0]!;
    // Not prospected yet.
    step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);
    expect(s.expedition.rigs[seam.id]).toBeUndefined();

    step(s, 0, [{ type: 'prospectSeam', id: seam.id }], OPTS);
    // No bay fitted.
    expect(rigLimit(s.expedition)).toBe(0);
    step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);
    expect(s.expedition.rigs[seam.id]).toBeUndefined();

    fit(s, 'rigBay', 1);
    // No salvage.
    s.expedition.salvage = 0;
    step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);
    expect(s.expedition.rigs[seam.id]).toBeUndefined();

    s.expedition.salvage = seam.rigCost;
    step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);
    expect(s.expedition.rigs[seam.id]).toBeDefined();
    expect(s.expedition.salvage).toBe(0);
  });

  it('respects the bay limit', () => {
    const s = withWorlds(19);
    fit(s, 'rigBay', 1);
    s.expedition.salvage = 1000;
    for (const seam of SEAMS.slice(0, 3)) {
      step(s, 0, [{ type: 'prospectSeam', id: seam.id }], OPTS);
      step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);
    }
    expect(Object.keys(s.expedition.rigs)).toHaveLength(1);
  });

  it('works while you are away, and stops at the cap', () => {
    const s = withWorlds(20);
    const seam = SEAMS[0]!;
    fit(s, 'rigBay', 1);
    s.expedition.salvage = seam.rigCost;
    step(s, 0, [{ type: 'prospectSeam', id: seam.id }], OPTS);
    step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);

    stepOffline(s, HOUR, OPTS);
    const afterAnHour = s.expedition.rigs[seam.id]!.banked;
    expect(afterAnHour).toBeGreaterThan(0);

    stepOffline(s, 400 * HOUR, OPTS);
    expect(s.expedition.rigs[seam.id]!.banked).toBeLessThanOrEqual(seam.cap + 1e-6);
  });

  it('hands the bank over when you come back for it', () => {
    const s = withWorlds(21);
    const seam = SEAMS[0]!;
    fit(s, 'rigBay', 1);
    s.expedition.salvage = seam.rigCost;
    step(s, 0, [{ type: 'prospectSeam', id: seam.id }], OPTS);
    step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);
    stepOffline(s, 5 * HOUR, OPTS);

    const banked = Math.floor(s.expedition.rigs[seam.id]!.banked);
    step(s, 0, [{ type: 'collectRig', id: seam.id }], OPTS);
    expect(s.expedition.salvage).toBe(banked);
    expect(s.expedition.rigs[seam.id]!.banked).toBeLessThan(1);
  });
});

describe('megaprojects', () => {
  it('will not start without the reputation, and will with it', () => {
    const s = withWorlds(22);
    const def = MEGAPROJECTS[0]!;
    step(s, 0, [{ type: 'devGrant', tu: '1e15' }], OPTS);
    s.operations.reputation[def.faction] = def.reputationRequired - 1;
    step(s, 0, [{ type: 'startMegaproject', id: def.id }], OPTS);
    expect(s.megaprojects[def.id]).toBeUndefined();

    s.operations.reputation[def.faction] = def.reputationRequired;
    step(s, 0, [{ type: 'startMegaproject', id: def.id }], OPTS);
    expect(s.megaprojects[def.id]).toBeDefined();
  });

  it('builds while you are away — the one system that must', () => {
    const s = withWorlds(23);
    const def = MEGAPROJECTS[0]!;
    step(s, 0, [{ type: 'devGrant', tu: '1e15' }], OPTS);
    s.operations.reputation[def.faction] = def.reputationRequired;
    step(s, 0, [{ type: 'startMegaproject', id: def.id }], OPTS);

    stepOffline(s, def.buildMs / 2, OPTS);
    expect(buildProgress(s, def.id)).toBeGreaterThan(0.4);
    expect(isBuilt(s, def.id)).toBe(false);

    stepOffline(s, def.buildMs, OPTS);
    expect(isBuilt(s, def.id)).toBe(true);
  });

  it('keeps working after the commission is sold', () => {
    const s = withWorlds(24, 6);
    const def = MEGAPROJECTS[0]!;
    step(s, 0, [{ type: 'devGrant', tu: '1e15' }], OPTS);
    s.operations.reputation[def.faction] = def.reputationRequired;
    step(s, 0, [{ type: 'startMegaproject', id: def.id }], OPTS);
    stepOffline(s, def.buildMs + 1000, OPTS);
    expect(isBuilt(s, def.id)).toBe(true);

    for (let i = 0; i < 120 && !prestigeEligible(s); i++) {
      step(s, 0, [{ type: 'devGrant', tu: '1e12', gaugeFrac: 1 }], OPTS);
      step(s, 300, [], OPTS);
      if (s.planet.surveyOptions) {
        step(s, 0, [{ type: 'chooseSurvey', id: s.planet.surveyOptions[0]! }], OPTS);
      }
    }
    step(s, 0, [{ type: 'prestige' }], OPTS);

    // Magrathea bought the portfolio, not the monument.
    expect(isBuilt(s, def.id)).toBe(true);
    expect(megaprojectEffects(s).prodMult).toBeGreaterThan(1);
  });

  it('changes production only once it actually stands', () => {
    const s = withWorlds(25);
    const def = MEGAPROJECTS[0]!;
    step(s, 0, [{ type: 'devGrant', tu: '1e15' }], OPTS);
    s.operations.reputation[def.faction] = def.reputationRequired;
    step(s, 0, [{ type: 'startMegaproject', id: def.id }], OPTS);
    stepOffline(s, def.buildMs / 2, OPTS);

    // Compared at the SAME instant, so nothing else about the state can move:
    // half-built is worth exactly nothing, finished is worth its multiplier.
    const halfBuilt = computeDerived(s, OPTS).tuPerSec;
    expect(megaprojectEffects(s).prodMult).toBe(1);
    s.megaprojects[def.id]!.done = true;
    const standing = computeDerived(s, OPTS).tuPerSec;
    expect(standing.div(halfBuilt).toNumber()).toBeCloseTo(def.prodMult!, 5);
  });
});

describe('petitions', () => {
  it('every petition names its world and offers a way out', () => {
    for (const def of PETITIONS) {
      expect(def.text).toContain('{world}');
      expect(def.options.length).toBeGreaterThanOrEqual(2);
      expect(def.severity).toBe('opportunity');
      expect(def.windowMs).toBeGreaterThanOrEqual(10 * 60_000);
    }
  });

  it('queues rather than interrupting, and is capped', () => {
    const s = withWorlds(26);
    for (let i = 0; i < 30; i++) step(s, 6 * 60_000, [], OPTS);
    expect(s.run.petitions.length).toBeLessThanOrEqual(3);
    // Urgent situations remain strictly one at a time.
    expect(s.situations.length).toBeLessThanOrEqual(1);
  });

  it('resolves through the same answer path as a situation', () => {
    const s = withWorlds(27);
    for (let i = 0; i < 20 && s.run.petitions.length === 0; i++) step(s, 6 * 60_000, [], OPTS);
    const p = s.run.petitions[0];
    if (!p) return;
    const def = PETITIONS.find((x) => x.id === p.id)!;
    const free = def.options.find((o) => !o.costSeconds && !o.costScienceSeconds) ?? def.options[0]!;
    step(s, 0, [{ type: 'answerSituation', uid: p.uid, optionId: free.id }], OPTS);
    expect(s.run.petitions.some((x) => x.uid === p.uid)).toBe(false);
  });

  it('goes with the portfolio, unlike a megaproject', () => {
    const s = withWorlds(28);
    for (let i = 0; i < 20 && s.run.petitions.length === 0; i++) step(s, 6 * 60_000, [], OPTS);
    for (let i = 0; i < 120 && !prestigeEligible(s); i++) {
      step(s, 0, [{ type: 'devGrant', tu: '1e12', gaugeFrac: 1 }], OPTS);
      step(s, 300, [], OPTS);
      if (s.planet.surveyOptions) {
        step(s, 0, [{ type: 'chooseSurvey', id: s.planet.surveyOptions[0]! }], OPTS);
      }
    }
    expect(prestigeEligible(s)).toBe(true);
    step(s, 0, [{ type: 'prestige' }], OPTS);
    expect(s.run.petitions).toEqual([]);
  });
});

describe('the expansion persists', () => {
  it('survives a save round-trip in full', () => {
    const s = withWorlds(29);
    const seam = SEAMS[0]!;
    fit(s, 'cargoHold', 2);
    fit(s, 'rigBay', 2);
    s.expedition.salvage = 500;
    step(s, 0, [{ type: 'prospectSeam', id: seam.id }], OPTS);
    step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);
    refreshJobBoard(s);
    step(s, 0, [{ type: 'acceptJob', uid: s.expedition.jobs[0]!.uid }], OPTS);
    const def = MEGAPROJECTS[0]!;
    step(s, 0, [{ type: 'devGrant', tu: '1e15' }], OPTS);
    s.operations.reputation[def.faction] = def.reputationRequired;
    step(s, 0, [{ type: 'startMegaproject', id: def.id }], OPTS);
    step(s, 60_000, [], OPTS);

    const r = deserialize(serialize(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.expedition.manifest).toEqual(s.expedition.manifest);
    expect(r.state.expedition.rigs).toEqual(s.expedition.rigs);
    expect(r.state.expedition.seams).toEqual(s.expedition.seams);
    expect(r.state.expedition.jobs).toEqual(s.expedition.jobs);
    expect(r.state.megaprojects).toEqual(s.megaprojects);
    expect(r.state.run.petitions).toEqual(s.run.petitions);
  });

  it('is identical however the same elapsed time is chunked (engine law #1)', () => {
    const build = (chunks: number, ms: number) => {
      const s = withWorlds(30);
      const seam = SEAM_BY_ID[SEAMS[0]!.id]!;
      fit(s, 'rigBay', 1);
      s.expedition.salvage = seam.rigCost;
      step(s, 0, [{ type: 'prospectSeam', id: seam.id }], OPTS);
      step(s, 0, [{ type: 'placeRig', id: seam.id }], OPTS);
      for (let i = 0; i < chunks; i++) step(s, ms, [], OPTS);
      return s.expedition.rigs[seam.id]!.banked;
    };
    expect(build(1, 60 * 60_000)).toBeCloseTo(build(60, 60_000), 6);
  });
});
