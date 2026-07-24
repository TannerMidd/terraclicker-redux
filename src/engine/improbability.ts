import { C } from '../content/constants';
import { EVENTS, EVENT_BY_ID } from '../content/events';
import { D, Decimal } from './num';
import { pickWeighted, randInt, randRange } from './rng';
import type { BubbleKind, Derived, GameState, SimEffect } from './types';

/** Rubber band: the universe gets bored during a stall and raises Improbability. */
export function stallBoost(state: GameState): number {
  return state.timers.stallMs >= C.STALL_MS ? C.STALL_FREQ_BONUS : 1;
}

function nextId(state: GameState): number {
  return ++state.timers.nextIdCounter;
}

// ————————————————— Bubbles —————————————————

const BUBBLE_WEIGHTS: readonly { kind: BubbleKind; weight: number }[] = [
  { kind: 'normal', weight: 78 },
  { kind: 'golden', weight: 15 },
  { kind: 'whale', weight: 4 },
  { kind: 'petunias', weight: 2 },
  { kind: 'gargle', weight: 1 },
];

export function rollBubbleGap(state: GameState, derived: Derived): number {
  const gap = randRange(state.rng, 'bubbles', C.BUBBLE_MIN_GAP_MS, C.BUBBLE_MAX_GAP_MS);
  return gap / (derived.bubbleFreqMult * stallBoost(state));
}

export function spawnBubble(state: GameState, derived: Derived, effects: SimEffect[]): void {
  state.timers.nextBubbleMs = rollBubbleGap(state, derived);
  if (state.bubbles.length >= C.MAX_BUBBLES) return;

  let kind: BubbleKind;
  if (state.timers.sinceBubbleCatchMs >= C.BUBBLE_PITY_MS) {
    kind = 'golden'; // pity: the next one is golden and finds you
  } else {
    const weighted = BUBBLE_WEIGHTS.map((b) => ({
      ...b,
      weight: b.kind === 'golden' ? b.weight * derived.goldenOddsMult : b.weight,
    }));
    kind = pickWeighted(state.rng, 'bubbles', weighted).kind;
  }

  const bubble = {
    id: nextId(state),
    kind,
    seed: randInt(state.rng, 'bubbles', 1, 2 ** 31),
    remainingMs: derived.bubbleLifetimeMs * (kind === 'golden' ? 1.2 : 1),
  };
  state.bubbles.push(bubble);
  effects.push({ t: 'bubbleSpawn', id: bubble.id, kind });
}

export function catchBubble(
  state: GameState,
  derived: Derived,
  id: number,
  effects: SimEffect[],
): void {
  const idx = state.bubbles.findIndex((b) => b.id === id);
  if (idx < 0) return;
  const bubble = state.bubbles[idx]!;
  state.bubbles.splice(idx, 1);

  const base = Decimal.max(
    derived.tuPerSec.mul(C.BUBBLE_PAYOUT_SECONDS),
    state.tu.mul(C.BUBBLE_PAYOUT_BANK_PCT),
  ).max(D(10));

  let tuGain = base;
  switch (bubble.kind) {
    case 'normal':
      state.buffs.push({
        id: `buff-${nextId(state)}`,
        label: 'Improbable Surge',
        mult: 2,
        clickMult: 1,
        remainingMs: 15_000,
      });
      break;
    case 'golden':
      tuGain = base.mul(3);
      state.buffs.push({
        id: `buff-${nextId(state)}`,
        label: 'Golden Improbability',
        mult: 3,
        clickMult: 1,
        remainingMs: 30_000,
      });
      break;
    case 'whale':
      state.science = state.science.add(
        Decimal.max(derived.sciencePerSec.mul(120), D(25)),
      );
      break;
    case 'petunias':
      tuGain = base.mul(10);
      state.lifetime.petuniasCaught += 1;
      break;
    case 'gargle':
      state.buffs.push({
        id: `buff-${nextId(state)}`,
        label: 'Pan Galactic Gargle Blaster',
        mult: 1,
        clickMult: 20,
        remainingMs: 20_000,
      });
      break;
  }

  state.tu = state.tu.add(tuGain);
  state.run.tuEarned = state.run.tuEarned.add(tuGain);
  state.lifetime.tuEarned = state.lifetime.tuEarned.add(tuGain);
  state.lifetime.bubblesCaught += 1;
  state.timers.sinceBubbleCatchMs = 0;
  effects.push({ t: 'bubbleCaught', id, kind: bubble.kind, tu: tuGain });
}

// ————————————————— Events —————————————————

export function rollEventGap(state: GameState, derived: Derived, first = false): number {
  const gap = first
    ? randRange(state.rng, 'events', C.FIRST_EVENT_MIN_MS, C.FIRST_EVENT_MAX_MS)
    : randRange(state.rng, 'events', C.EVENT_MIN_GAP_MS, C.EVENT_MAX_GAP_MS);
  return gap / (derived.eventFreqMult * stallBoost(state));
}

export function spawnEvent(state: GameState, derived: Derived, effects: SimEffect[]): void {
  if (state.activeEvents.length > 0) {
    // One at a time; try again shortly.
    state.timers.nextEventMs = 60_000;
    return;
  }
  const def = pickWeighted(state.rng, 'events', EVENTS);
  state.activeEvents.push({ id: def.id, remainingMs: def.durationMs });
  if (def.instantSeconds) {
    const gain = derived.tuPerSec.mul(def.instantSeconds).max(D(15));
    state.tu = state.tu.add(gain);
    state.run.tuEarned = state.run.tuEarned.add(gain);
    state.lifetime.tuEarned = state.lifetime.tuEarned.add(gain);
  }
  state.timers.nextEventMs = rollEventGap(state, derived);
  effects.push({ t: 'eventStart', id: def.id });
}

export { EVENT_BY_ID };

// ————————————————— Vogons —————————————————

export function rollVogonGap(state: GameState): number {
  return randRange(state.rng, 'vogons', C.VOGON_MIN_GAP_MS, C.VOGON_MAX_GAP_MS);
}

export function spawnVogons(
  state: GameState,
  derived: Derived,
  effects: SimEffect[],
  earthDefense = false,
  force = false,
): void {
  state.timers.nextVogonMs = rollVogonGap(state);
  if (state.vogon) return;
  if (derived.vogonsBlocked && !earthDefense && !force) return;
  if (state.gameTimeMs < C.VOGON_EARLIEST_MS && !earthDefense && !force) return;

  const ships = Array.from({ length: C.VOGON_SHIPS }, () => ({
    id: nextId(state),
    seed: randInt(state.rng, 'vogons', 1, 2 ** 31),
    hit: false,
  }));
  state.vogon = {
    remainingMs: C.VOGON_DURATION_MS,
    ships,
    poemSeed: randInt(state.rng, 'vogons', 0, 2 ** 16),
  };
  if (earthDefense) state.flags['earthDefenseActive'] = true;
  effects.push({ t: 'vogonStart' });
}

export function hitVogonShip(
  state: GameState,
  derived: Derived,
  shipId: number,
  effects: SimEffect[],
): void {
  const vogon = state.vogon;
  if (!vogon) return;
  const ship = vogon.ships.find((sh) => sh.id === shipId);
  if (!ship || ship.hit) return;
  ship.hit = true;
  state.lifetime.vogonShipsRepelled += 1;

  const reward = derived.tuPerSec.mul(15).max(D(10));
  state.tu = state.tu.add(reward);
  state.run.tuEarned = state.run.tuEarned.add(reward);
  state.lifetime.tuEarned = state.lifetime.tuEarned.add(reward);
  effects.push({ t: 'shipRepelled', id: shipId });

  if (vogon.ships.every((sh) => sh.hit)) endVogon(state, true, effects);
}

export function endVogon(state: GameState, cleared: boolean, effects: SimEffect[]): void {
  if (!state.vogon) return;
  state.vogon = null;
  if (cleared) {
    state.flags['vogonCleared'] = true;
  } else {
    state.lifetime.vogonReadingsEndured += 1;
  }
  if (state.flags['earthDefenseActive']) {
    delete state.flags['earthDefenseActive'];
    if (cleared) {
      state.flags['earthDefended'] = true;
    } else {
      // Earth is gone. You are handed a towel. Somehow, this helps.
      state.flags['towelEarned'] = true;
    }
  }
  effects.push({ t: 'vogonEnd', cleared });
}

/** A deterministic poem line index for the UI. */
export function poemLine(state: GameState, lineCount: number): number {
  if (!state.vogon) return 0;
  const elapsed = C.VOGON_DURATION_MS - state.vogon.remainingMs;
  return Math.floor(elapsed / 4_500) % lineCount;
}
