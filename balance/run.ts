/**
 * Balance harness (PROGRESSION.md §9): headless bots play the real engine
 * and report pacing. Run with `npm run balance`.
 *
 * CI *assertions* live in test/pacing.test.ts — this tool is for eyes:
 * acquisition timelines, income doubling, stall windows, BP outcomes.
 */
import { newGame, step, computeDerived } from '../src/engine/sim';
import { bulkCost, upgradeVisible } from '../src/engine/economy';
import { BUILDINGS } from '../src/content/buildings';
import { UPGRADES } from '../src/content/upgrades';
import { format, formatDuration } from '../src/engine/num';
import type { GameState, Input } from '../src/engine/types';

const OPTS = { utcDay: 3 };
const TICK = 250;

type Bot = (state: GameState, tick: number) => Input[];

function buyer(state: GameState): Input[] {
  const inputs: Input[] = [];
  const d = computeDerived(state, OPTS);
  for (const u of UPGRADES) {
    if (upgradeVisible(u, state, d) && state.tu.gte(u.cost)) {
      inputs.push({ type: 'buyUpgrade', id: u.id });
      break;
    }
  }
  let bestId: string | null = null;
  let bestValue = 0;
  for (const b of BUILDINGS) {
    if (b.unique && (state.buildings[b.id] ?? 0) > 0) continue;
    const owned = state.buildings[b.id] ?? 0;
    const cost = bulkCost(b.id, owned, 1, d);
    if (state.tu.lt(cost)) continue;
    const aspectSum = Object.values(b.aspects).reduce((a, v) => a + (v ?? 0), 0);
    const value = (b.tuPerSec + aspectSum) / cost.toNumber();
    if (value > bestValue) {
      bestValue = value;
      bestId = b.id;
    }
  }
  if (bestId) inputs.push({ type: 'buyBuilding', id: bestId, qty: 'max' });
  for (const bub of state.bubbles) inputs.push({ type: 'catchBubble', id: bub.id });
  return inputs;
}

const BOTS: Record<string, Bot> = {
  'greedy-clicker': (s, t) => {
    const inputs: Input[] = [{ type: 'click' }];
    if (t % 20 === 0) inputs.push(...buyer(s));
    return inputs;
  },
  idler: (s, t) => (t % 240 === 0 ? buyer(s) : []),
};

interface Milestone {
  label: string;
  atMs: number;
}

function runBot(name: string, bot: Bot, minutes: number): void {
  const state = newGame(20260723, 0);
  const milestones: Milestone[] = [];
  const doublings: number[] = [];
  let lastTups = 0.1;
  let maxStall = 0;

  const totalTicks = (minutes * 60_000) / TICK;
  for (let tick = 0; tick < totalTicks; tick++) {
    const r = step(state, TICK, bot(state, tick), OPTS);
    for (const e of r.effects) {
      if (e.t === 'planetComplete')
        milestones.push({ label: `planet ${e.lifetimeIndex} (${e.name})`, atMs: state.gameTimeMs });
      if (e.t === 'systemFormed') milestones.push({ label: `SYSTEM ${e.count}`, atMs: state.gameTimeMs });
      if (e.t === 'galaxyFormed') milestones.push({ label: `GALAXY ${e.count}`, atMs: state.gameTimeMs });
    }
    maxStall = Math.max(maxStall, state.timers.stallMs);
    if (tick % 40 === 0) {
      const tups = computeDerived(state, OPTS).tuPerSec.toNumber();
      if (tups >= lastTups * 2 && Number.isFinite(tups)) {
        doublings.push(state.gameTimeMs);
        lastTups = tups;
      }
    }
  }

  const d = computeDerived(state, OPTS);
  console.log(`\n━━━ ${name} · ${minutes} simulated minutes ━━━`);
  console.log(
    `  end: ${format(state.tu)} TU · ${format(d.tuPerSec)}/s · planets ${state.run.planetsCompleted} · BP on reset ${d.prestigeBp}`,
  );
  console.log(`  max stall: ${formatDuration(maxStall)} · income doublings: ${doublings.length}`);
  for (const m of milestones.slice(0, 24)) {
    console.log(`  ${formatDuration(m.atMs).padStart(8)}  ${m.label}`);
  }
  if (milestones.length > 24) console.log(`  … +${milestones.length - 24} more`);
}

const minutes = Number(process.argv[2] ?? 90);
console.log(`TerraClicker balance harness — ${minutes} min per bot, seed 20260723`);
for (const [name, bot] of Object.entries(BOTS)) runBot(name, bot, minutes);
