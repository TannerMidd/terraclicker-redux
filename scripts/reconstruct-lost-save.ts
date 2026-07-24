import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import LZString from 'lz-string';

import { BUILDING_BY_ID } from '../src/content/buildings';
import { C } from '../src/content/constants';
import { RESEARCH } from '../src/content/research';
import { SURVEY_BY_ID } from '../src/content/surveys';
import { computeDerived, newGame, step } from '../src/engine/sim';
import { D } from '../src/engine/num';
import { runMigrations } from '../src/engine/save/migrate';
import { saveSchema } from '../src/engine/save/schema';
import { ASPECTS } from '../src/engine/types';

const TARGET_GALAXIES = 2;
const TARGET_SETTLEMENTS = 512;
const TARGET_TU_PER_SEC = 3_000_000;
const RATE_TOLERANCE = 0.01;

const BUILDINGS: Record<string, number> = {
  seedProbe: 164,
  atmoProcessor: 130,
  hydroSeeder: 90,
  geoTap: 60,
  bioDome: 40,
  researchLab: 16,
  orbitalMirror: 6,
  marvin: 1,
  quantumExcavator: 3,
  temporalCompressor: 2,
};

const UPGRADES = [
  'terraforming-gloves',
  'reinforced-gauntlets',
  'hydraulic-servos',
  'neural-lace',
  'seedProbe-eff-1',
  'atmoProcessor-eff-1',
  'hydroSeeder-eff-1',
  'geoTap-eff-1',
  'bioDome-eff-1',
  'researchLab-eff-1',
  'milestone-25',
  'milestone-75',
  'milestone-150',
] as const;

const RESEARCH_COMPLETED = RESEARCH.slice(0, 10).map((entry) => entry.id);

const now = Date.now();
const state = newGame(20_260_724, now);
const planetsToComplete =
  TARGET_GALAXIES * C.SYSTEMS_PER_GALAXY * C.PLANETS_PER_SYSTEM;

for (let index = 0; index < planetsToComplete; index += 1) {
  // Rebuild a plausible history: early worlds took longer, later worlds less.
  const completionMinutes = 75 - Math.round((40 * index) / (planetsToComplete - 1));
  state.gameTimeMs += completionMinutes * 60_000;

  const inputs: Parameters<typeof step>[2] = [];
  if (state.planet.surveyOptions) {
    const survey =
      state.planet.surveyOptions.find(
        (id) => SURVEY_BY_ID[id]?.allProdMult === undefined,
      ) ?? state.planet.surveyOptions[0]!;
    inputs.push({ type: 'chooseSurvey', id: survey });
  }
  inputs.push({ type: 'devGrant', tu: '0', gaugeFrac: 1 });
  step(state, 0, inputs, { offline: true, utcDay: new Date(now).getUTCDay() });
}

state.buildings = { ...BUILDINGS };
state.upgrades = Object.fromEntries(UPGRADES.map((id) => [id, 1]));
state.research = {
  completed: [...RESEARCH_COMPLETED],
  active: null,
};
state.science = D(5_000);
state.tu = D('420000000000');
state.run.tuEarned = D('1250000000000');
state.lifetime.tuEarned = D('1250000000000');
state.lifetime.clicks = 3_500;
state.lifetime.bubblesCaught = 18;
state.lifetime.petuniasCaught = 1;
state.lifetime.vogonShipsRepelled = 5;
state.lifetime.vogonReadingsEndured = 0;
state.lifetime.prestiges = 0;
state.prestige = { bp: 0, bpEarned: 0, catalogue: {} };
state.flags = {
  earthCompleted: state.flags.earthCompleted ?? state.gameTimeMs,
  vogonCleared: true,
};
state.buffs = [];
state.bubbles = [];
state.activeEvents = [];
state.vogon = null;
state.timers.nextBubbleMs = 45_000;
state.timers.nextEventMs = 180_000;
state.timers.nextVogonMs = 900_000;
state.timers.stallMs = 0;
state.timers.sinceBubbleCatchMs = 60_000;
state.timers.tickCarryMs = 0;

if (state.planet.surveyOptions) {
  const survey =
    state.planet.surveyOptions.find(
      (id) => SURVEY_BY_ID[id]?.allProdMult === undefined,
    ) ?? state.planet.surveyOptions[0]!;
  step(
    state,
    0,
    [{ type: 'chooseSurvey', id: survey }],
    { offline: true, utcDay: new Date(now).getUTCDay() },
  );
}
for (const aspect of ASPECTS) {
  state.planet.gauges[aspect] = state.planet.targets[aspect].mul(0.35);
}

// Recompute only achievements supported by the reconstructed facts.
state.achievements = {};
step(
  state,
  0,
  [{ type: 'devGrant', tu: '0' }],
  { offline: true, utcDay: new Date(now).getUTCDay() },
);

state.createdAtWall = now - state.gameTimeMs;
state.savedAtWall = now;

const derived = computeDerived(state, { utcDay: new Date(now).getUTCDay() });
const totalSettlements = derived.totalBuildings;
const rate = derived.tuPerSec.toNumber();
const rateError = Math.abs(rate - TARGET_TU_PER_SEC) / TARGET_TU_PER_SEC;

if (state.run.galaxies !== TARGET_GALAXIES) {
  throw new Error(`Expected ${TARGET_GALAXIES} galaxies, got ${state.run.galaxies}`);
}
if (state.run.planetsCompleted !== planetsToComplete) {
  throw new Error(
    `Expected ${planetsToComplete} completed planets, got ${state.run.planetsCompleted}`,
  );
}
if (totalSettlements !== TARGET_SETTLEMENTS) {
  throw new Error(
    `Expected ${TARGET_SETTLEMENTS} settlements, got ${totalSettlements}`,
  );
}
if (state.lifetime.prestiges !== 0 || state.prestige.bp !== 0 || state.prestige.bpEarned !== 0) {
  throw new Error('Reconstruction unexpectedly contains prestige progress');
}
if (rateError > RATE_TOLERANCE) {
  throw new Error(
    `Expected TU/sec within ${RATE_TOLERANCE * 100}% of target; got ${rate}`,
  );
}

for (const [id, count] of Object.entries(BUILDINGS)) {
  if (!BUILDING_BY_ID[id]) throw new Error(`Unknown building id: ${id}`);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Invalid building count for ${id}: ${count}`);
  }
}

const raw = JSON.stringify(state);
const portable = `TC2:${LZString.compressToEncodedURIComponent(raw)}`;
const decompressed = LZString.decompressFromEncodedURIComponent(portable.slice(4));
const rawCheck = saveSchema.safeParse(runMigrations(JSON.parse(raw)));
const portableCheck = decompressed
  ? saveSchema.safeParse(runMigrations(JSON.parse(decompressed)))
  : { success: false as const };
if (!portableCheck.success) throw new Error('Portable export failed schema validation');
if (!rawCheck.success) throw new Error('Raw save failed schema validation');

const outputDir = resolve('recovery');
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(
    resolve(outputDir, 'terraclicker-reconstructed-2-galaxies.tc2.txt'),
    `${portable}\n`,
    'utf8',
  ),
  writeFile(
    resolve(outputDir, 'terraclicker-reconstructed-2-galaxies.json'),
    `${raw}\n`,
    'utf8',
  ),
  writeFile(
    resolve(outputDir, 'terraclicker-reconstructed-2-galaxies-summary.json'),
    `${JSON.stringify(
      {
        generatedAt: new Date(now).toISOString(),
        anchors: {
          prestiges: state.lifetime.prestiges,
          galaxies: state.run.galaxies,
          systems: state.run.systems,
          completedPlanets: state.run.planetsCompleted,
          totalSettlements,
          tuPerSec: rate,
          targetTuPerSec: TARGET_TU_PER_SEC,
          currentTu: state.tu.toString(),
          lifetimeTu: state.lifetime.tuEarned.toString(),
        },
        buildings: state.buildings,
        upgrades: Object.keys(state.upgrades),
        research: state.research.completed,
        achievements: Object.keys(state.achievements),
        validation: {
          schemaVersion: state.version,
          portableImport: 'passed',
          rawImport: 'passed',
          rateErrorPercent: rateError * 100,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  ),
]);

console.log(
  JSON.stringify(
    {
      outputDir,
      galaxies: state.run.galaxies,
      systems: state.run.systems,
      completedPlanets: state.run.planetsCompleted,
      totalSettlements,
      prestiges: state.lifetime.prestiges,
      bp: state.prestige.bp,
      tuPerSec: rate,
      rateErrorPercent: rateError * 100,
      achievements: Object.keys(state.achievements).length,
      portableCharacters: portable.length,
    },
    null,
    2,
  ),
);
