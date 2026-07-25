/**
 * Megaproject programmes — the engine side. See content/programmes.ts.
 *
 * The whole design in one sentence: **phases divide the build time, they do not
 * extend it.** A programme takes exactly as long as the project always took;
 * what changes is that you are consulted three times on the way, and each
 * answer pays out immediately rather than at the end.
 *
 * The other rule that matters: **an unanswered phase never stalls
 * construction.** The crew carry on with what they can do without you. What
 * waits is the benefit, not the building — nothing here is a timer a player can
 * lose by being asleep, which is the same principle that keeps situations from
 * counting down offline.
 */
import {
  PHASES_PER_PROGRAMME,
  PROGRAMME_BY_MEGAPROJECT,
  type PhaseEffect,
  type ProgrammePhase,
} from '../content/programmes';
import { MEGAPROJECT_BY_ID } from '../content/megaprojects';
import type { AspectId, GameState } from './types';

/** How many phases of `id` are complete, from construction time alone. */
export function phasesReached(state: GameState, id: string): number {
  const m = state.megaprojects[id];
  const def = MEGAPROJECT_BY_ID[id];
  if (!m || !def) return 0;
  const per = def.buildMs / PHASES_PER_PROGRAMME;
  return Math.min(PHASES_PER_PROGRAMME, Math.floor(m.builtMs / per));
}

/**
 * The phase currently awaiting an answer, or null.
 *
 * Reached but unanswered. Construction has already moved past it — that is
 * deliberate — so this is a question waiting, not a blockage.
 */
export function openPhase(
  state: GameState,
  id: string,
): { phase: ProgrammePhase; index: number } | null {
  const programme = PROGRAMME_BY_MEGAPROJECT[id];
  if (!programme) return null;
  const reached = phasesReached(state, id);
  const answered = state.programmes[id] ?? [];
  for (let i = 0; i < reached; i++) {
    if (answered[i] === undefined) {
      const phase = programme.phases[i];
      if (phase) return { phase, index: i };
    }
  }
  return null;
}

/** Every phase awaiting an answer, across every programme under way. */
export function openPhases(state: GameState): { id: string; phase: ProgrammePhase; index: number }[] {
  const out: { id: string; phase: ProgrammePhase; index: number }[] = [];
  for (const id of Object.keys(state.megaprojects)) {
    const open = openPhase(state, id);
    if (open) out.push({ id, ...open });
  }
  return out;
}

/**
 * Answer a phase. Only the phase actually open, only with one of its options,
 * and only once.
 */
export function answerPhase(state: GameState, id: string, optionId: string): boolean {
  const open = openPhase(state, id);
  if (!open) return false;
  if (!open.phase.options.some((o) => o.id === optionId)) return false;
  const answers = state.programmes[id] ?? [];
  answers[open.index] = optionId;
  state.programmes[id] = answers;
  return true;
}

/** Every effect the player has actually chosen and been granted. */
function chosenEffects(state: GameState): PhaseEffect[] {
  const out: PhaseEffect[] = [];
  for (const [id, answers] of Object.entries(state.programmes)) {
    const programme = PROGRAMME_BY_MEGAPROJECT[id];
    if (!programme) continue;
    for (const [i, optionId] of answers.entries()) {
      const option = programme.phases[i]?.options.find((o) => o.id === optionId);
      if (option) out.push(option.effect);
    }
  }
  return out;
}

/**
 * Programme effects, folded.
 *
 * Note these are granted the moment a phase is answered rather than when the
 * project completes — that is the "partial benefit while under construction"
 * the whole system exists to provide.
 */
export function programmeEffects(state: GameState): {
  prodMult: number;
  scienceMult: number;
  aspectMult: Record<AspectId, number>;
  offlineCapAddMs: number;
  salvagePerHour: number;
} {
  const out = {
    prodMult: 1,
    scienceMult: 1,
    aspectMult: { thermal: 1, atmo: 1, hydro: 1, bio: 1 } as Record<AspectId, number>,
    offlineCapAddMs: 0,
    salvagePerHour: 0,
  };
  for (const e of chosenEffects(state)) {
    switch (e.kind) {
      case 'prodMult':
        out.prodMult *= e.v;
        break;
      case 'scienceMult':
        out.scienceMult *= e.v;
        break;
      case 'aspectMult':
        out.aspectMult[e.aspect] *= e.v;
        break;
      case 'offlineCapAddMs':
        out.offlineCapAddMs += e.v;
        break;
      case 'salvagePerHour':
        out.salvagePerHour += e.v;
        break;
    }
  }
  return out;
}

/** The final module chosen for a finished project, for the Guide and the scene. */
export function finalModule(state: GameState, id: string): string | null {
  return state.programmes[id]?.[PHASES_PER_PROGRAMME - 1] ?? null;
}
