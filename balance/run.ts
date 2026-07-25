/**
 * Balance harness (PROGRESSION.md §9): headless bots play the real engine
 * and report pacing. Run with `npm run balance`.
 *
 * CI *assertions* live in test/pacing.test.ts — this tool is for eyes:
 * acquisition timelines, income doubling, stall windows, BP outcomes.
 */
import { newGame, step, computeDerived } from '../src/engine/sim';
import { format, formatDuration } from '../src/engine/num';
import { BOTS, OPTS, TICK, type Bot } from './bots';

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
      if (e.t === 'contractCompleted')
        milestones.push({ label: `CONTRACT ${state.operations.completed.length} (+${e.rewardBp} BP)`, atMs: state.gameTimeMs });
      if (e.t === 'prestiged')
        milestones.push({
          label: `PRESTIGE ${state.lifetime.prestiges} (+${e.bp} BP)`,
          atMs: state.gameTimeMs,
        });
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
    `  end: ${format(state.tu)} TU · ${format(d.tuPerSec)}/s · planets ${state.run.planetsCompleted} (${state.lifetime.planetsCompleted} lifetime) · prestiges ${state.lifetime.prestiges} · BP on reset ${d.prestigeBp}`,
  );
  console.log(`  BP earned: ${state.prestige.bpEarned} | systems required now: ${d.prestigeRequiredSystems}`);
  const ranks = Object.entries(state.prestige.catalogue).filter(([, r]) => r > 0);
  if (ranks.length > 0)
    console.log(`  catalogue: ${state.prestige.bp} BP unspent | ${ranks.map(([id, r]) => `${id} ${r}`).join(', ')}`);
  console.log(`  operations: ${state.operations.completed.length} contracts | routes ${d.dispatchesUsed}/${d.dispatchSlots} | heritage ${state.operations.heritageWorlds.length}`);
  console.log(`  max stall: ${formatDuration(maxStall)} · income doublings: ${doublings.length}`);
  for (const m of milestones.slice(0, 24)) {
    console.log(`  ${formatDuration(m.atMs).padStart(8)}  ${m.label}`);
  }
  for (const m of milestones.slice(24).filter((entry) => entry.label.startsWith('PRESTIGE')).slice(0, 5)) {
    console.log(`  ${formatDuration(m.atMs).padStart(8)}  ${m.label}`);
  }
  if (milestones.length > 24) console.log(`  … +${milestones.length - 24} more`);
}

const minutes = Number(process.argv[2] ?? 90);
console.log(`TerraClicker balance harness — ${minutes} min per bot, seed 20260723`);
for (const [name, bot] of Object.entries(BOTS)) runBot(name, bot, minutes);
