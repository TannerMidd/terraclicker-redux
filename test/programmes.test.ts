import { describe, expect, it } from 'vitest';
import { newGame, step, stepOffline, computeDerived } from '../src/engine/sim';
import {
  answerPhase,
  finalModule,
  openPhase,
  openPhases,
  phasesReached,
  programmeEffects,
} from '../src/engine/programmes';
import { PHASES_PER_PROGRAMME, PROGRAMME_BY_MEGAPROJECT } from '../src/content/programmes';
import { MEGAPROJECT_BY_ID } from '../src/content/megaprojects';
import { serialize, deserialize } from '../src/engine/save/codec';
import { D } from '../src/engine/num';
import type { GameState } from '../src/engine/types';

const OPTS = { utcDay: 3 };
const HOUR = 3_600_000;

function building(id: string): GameState {
  const s = newGame(4242, 0);
  const def = MEGAPROJECT_BY_ID[id]!;
  s.tu = D(def.cost).mul(2);
  s.operations.reputation[def.faction] = def.reputationRequired;
  step(s, 0, [{ type: 'startMegaproject', id }], OPTS);
  return s;
}

describe('megaproject programmes', () => {
  it('divides the build time rather than extending it', () => {
    const id = 'orbital-gantry';
    const s = building(id);
    const def = MEGAPROJECT_BY_ID[id]!;

    expect(phasesReached(s, id)).toBe(0);
    stepOffline(s, def.buildMs / 3 + 60_000, OPTS);
    expect(phasesReached(s, id)).toBe(1);

    // The whole thing still finishes in exactly its stated build time.
    const fresh = building(id);
    stepOffline(fresh, def.buildMs, OPTS);
    expect(fresh.megaprojects[id]?.done).toBe(true);
    expect(phasesReached(fresh, id)).toBe(PHASES_PER_PROGRAMME);
  });

  it('opens a question at each phase, in order', () => {
    const id = 'orbital-gantry';
    const s = building(id);
    const def = MEGAPROJECT_BY_ID[id]!;
    const programme = PROGRAMME_BY_MEGAPROJECT[id]!;

    stepOffline(s, def.buildMs / 3 + 60_000, OPTS);
    const first = openPhase(s, id);
    expect(first?.index).toBe(0);
    expect(first?.phase.id).toBe(programme.phases[0]!.id);

    step(s, 0, [{ type: 'answerPhase', id, optionId: first!.phase.options[0]!.id }], OPTS);
    expect(openPhase(s, id)).toBeNull(); // nothing else reached yet

    stepOffline(s, def.buildMs / 3 + 60_000, OPTS);
    expect(openPhase(s, id)?.index).toBe(1);
  });

  it('never stalls construction on an unanswered question', () => {
    const id = 'orbital-gantry';
    const s = building(id);
    const def = MEGAPROJECT_BY_ID[id]!;

    // Answer nothing at all, ever.
    stepOffline(s, def.buildMs + HOUR, OPTS);

    expect(s.megaprojects[id]?.done).toBe(true);
    // All three questions are still there, waiting, in order.
    expect(openPhase(s, id)?.index).toBe(0);
    expect(phasesReached(s, id)).toBe(PHASES_PER_PROGRAMME);
  });

  it('pays the benefit the moment a phase is answered, not at the end', () => {
    const id = 'orbital-gantry';
    const s = building(id);
    s.buildings['seedProbe'] = 20;
    const def = MEGAPROJECT_BY_ID[id]!;
    stepOffline(s, def.buildMs / 3 + 60_000, OPTS);

    const before = computeDerived(s, OPTS).tuPerSec;
    const open = openPhase(s, id)!;
    // 'wide' grants +6% production immediately, with the thing still unbuilt.
    step(s, 0, [{ type: 'answerPhase', id, optionId: 'wide' }], OPTS);

    expect(s.megaprojects[id]?.done).toBe(false);
    expect(computeDerived(s, OPTS).tuPerSec.gt(before)).toBe(true);
    expect(open.phase.options.some((o) => o.id === 'wide')).toBe(true);
  });

  it('refuses an option that does not belong to the open phase', () => {
    const id = 'orbital-gantry';
    const s = building(id);
    const def = MEGAPROJECT_BY_ID[id]!;
    stepOffline(s, def.buildMs / 3 + 60_000, OPTS);

    // 'foundry' belongs to phase 3, not phase 1.
    expect(answerPhase(s, id, 'foundry')).toBe(false);
    expect(answerPhase(s, id, 'not-a-real-option')).toBe(false);
    expect(s.programmes[id]).toBeUndefined();
  });

  it('answers each phase once', () => {
    const id = 'orbital-gantry';
    const s = building(id);
    stepOffline(s, MEGAPROJECT_BY_ID[id]!.buildMs / 3 + 60_000, OPTS);
    expect(answerPhase(s, id, 'wide')).toBe(true);
    expect(answerPhase(s, id, 'deep')).toBe(false);
    expect(s.programmes[id]?.[0]).toBe('wide');
  });

  it('makes the final modules mutually exclusive', () => {
    const id = 'orbital-gantry';
    const s = building(id);
    stepOffline(s, MEGAPROJECT_BY_ID[id]!.buildMs + HOUR, OPTS);
    // Walk all three questions.
    for (let i = 0; i < PHASES_PER_PROGRAMME; i++) {
      const open = openPhase(s, id)!;
      answerPhase(s, id, open.phase.options[i === 2 ? 1 : 0]!.id);
    }
    expect(finalModule(s, id)).toBe('yard');
    // The other crown is not also fitted.
    expect(s.programmes[id]).not.toContain('foundry');
  });

  it('is neutral with nothing answered', () => {
    const s = newGame(1, 0);
    expect(programmeEffects(s)).toEqual({
      prodMult: 1,
      scienceMult: 1,
      aspectMult: { thermal: 1, atmo: 1, hydro: 1, bio: 1 },
      offlineCapAddMs: 0,
      salvagePerHour: 0,
    });
  });

  it('lists every question waiting across every programme', () => {
    const s = building('orbital-gantry');
    const archive = MEGAPROJECT_BY_ID['deep-archive']!;
    s.tu = D(archive.cost).mul(2);
    s.operations.reputation[archive.faction] = archive.reputationRequired;
    step(s, 0, [{ type: 'startMegaproject', id: 'deep-archive' }], OPTS);

    stepOffline(s, archive.buildMs, OPTS);
    const waiting = openPhases(s);
    expect(waiting.map((w) => w.id).sort()).toEqual(['deep-archive', 'orbital-gantry']);
  });

  it('survives a save round-trip', () => {
    const id = 'orbital-gantry';
    const s = building(id);
    stepOffline(s, MEGAPROJECT_BY_ID[id]!.buildMs / 3 + 60_000, OPTS);
    answerPhase(s, id, 'deep');

    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.programmes[id]).toEqual(['deep']);
  });
});
