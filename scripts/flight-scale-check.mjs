/**
 * Rendered hierarchy check. Requires the Vite dev server on TC_PORT (5173).
 * Loads a mature save, flies through galaxy -> system -> planet reveal tiers,
 * and verifies render/navigation/collision coordinates agree.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const port = process.env.TC_PORT ?? '5173';
const saveText = await fs.readFile(new URL('../shots/u34.txt', import.meta.url), 'utf8');
const browser = await chromium.launch({
  ...(process.env.TC_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://localhost:' + port, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);
await page.evaluate((save) => window.__tc.importSave(save), saveText);
await page.waitForTimeout(1600);
const imported = await page.evaluate(() =>
  window.__tc.useGame.getState().s.run.completedPlanets.length > 0
);

const result = await page.evaluate(async () => {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  window.__tcBus.useUiBus.getState().cancelCinematics();
  window.__tcFlight.enter();
  await pause(700);

  const game = window.__tc.useGame.getState().s;
  const initialBodies = window.__tcFlight.bodies();
  const stars = initialBodies
    .map((body) => {
      const match = /^system ([0-9]+)$/.exec(body.label);
      return match ? { ...body, index: Number(match[1]) - 1 } : null;
    })
    .filter((body) => body && body.index < game.run.systems);
  const galaxyMembers = stars.filter((star) => star.index < 5);
  const isolated = galaxyMembers
    .map((star) => ({
      star,
      clearance: Math.min(...stars
        .filter((other) => other.index !== star.index)
        .map((other) => distance(star.pos, other.pos))),
    }))
    .sort((a, b) => b.clearance - a.clearance)[0];
  if (!isolated) return { error: 'formed galaxy has no member stars' };
  const star = isolated.star;

  const directions = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [0.707, 0, 0.707], [-0.707, 0, 0.707], [0.707, 0, -0.707], [-0.707, 0, -0.707],
  ];
  const approaches = directions.map((direction) => {
    const pos = [
      star.pos[0] + direction[0] * 30,
      star.pos[1] + direction[1] * 30,
      star.pos[2] + direction[2] * 30,
    ];
    const ordered = stars
      .map((candidate) => ({ index: candidate.index, distance: distance(pos, candidate.pos) }))
      .sort((a, b) => a.distance - b.distance);
    return {
      pos,
      nearest: ordered[0]?.index,
      margin: (ordered[1]?.distance ?? 999) - (ordered[0]?.distance ?? 0),
    };
  });
  const approach = approaches
    .filter((candidate) => candidate.nearest === star.index)
    .sort((a, b) => b.margin - a.margin)[0];
  if (!approach) return { error: 'no unambiguous approach to galaxy member', stars };

  window.__tcFlight.pose(approach.pos[0], approach.pos[1], approach.pos[2], 0, 0);
  await pause(900);
  const systemState = window.__tcFlight.state();
  const systemBodies = window.__tcFlight.bodies();
  const worldIndex = star.index * 5;
  const record = game.run.completedPlanets[worldIndex];
  const world = record
    ? systemBodies.find((body) => body.label === record.name)
    : null;
  if (!world) {
    return {
      error: 'formed world did not resolve',
      selectedSystem: star.index,
      systemState,
      labels: systemBodies.map((body) => body.label),
    };
  }

  window.__tc.dispatch({ type: 'setWaypoint', id: 'world:' + record.lifetimeIndex });
  await pause(450);
  const navState = window.__tcFlight.state();
  const navDelta = navState.navTarget
    ? Math.hypot(
        navState.navTarget[0] - world.pos[0],
        navState.navTarget[1] - world.pos[1],
        navState.navTarget[2] - world.pos[2],
      )
    : null;
  const orbitRadius = distance(world.pos, star.pos);

  window.__tcFlight.pose(
    world.pos[0],
    world.pos[1],
    world.pos[2] + world.radius * 4,
    0,
    0,
  );
  await pause(900);
  const worldState = window.__tcFlight.state();
  const location = document.querySelector('.fh-loc')?.textContent?.trim() ?? '';

  return {
    imported: true,
    galaxies: game.run.galaxies,
    systems: game.run.systems,
    completedWorlds: game.run.completedPlanets.length,
    selectedSystem: star.index,
    selectedWorld: worldIndex,
    systemState,
    worldState,
    location,
    worldName: record.name,
    worldRadius: world.radius,
    orbitRadius,
    navDelta,
    worldBodies: systemBodies.filter((body) =>
      game.run.completedPlanets
        .slice(worldIndex, worldIndex + 5)
        .some((planet) => planet.name === body.label)
    ).length,
  };
});

await page.screenshot({ path: process.env.TC_SCALE_SHOT ?? 'C:/tmp/terraclicker-flight-scale.png' });
await browser.close();

console.log(JSON.stringify({ imported, result, errors: errors.slice(0, 8) }, null, 2));
const ok =
  imported &&
  !result.error &&
  result.galaxies >= 1 &&
  result.systems >= 1 &&
  result.systemState.nearGalaxy !== null &&
  result.systemState.nearSystem === result.selectedSystem &&
  result.worldState.nearWorld === result.selectedWorld &&
  result.worldBodies === 5 &&
  result.worldRadius >= 1.1 &&
  result.orbitRadius >= 5 &&
  result.navDelta !== null &&
  result.navDelta < 0.25 &&
  result.location.includes('SYSTEM') &&
  result.location.includes(result.worldName) &&
  errors.length === 0;

console.log(ok
  ? 'PASS — galaxy, system, and planet resolve at one physical scale.'
  : 'FAIL — hierarchy mismatch; inspect the payload above.');
process.exit(ok ? 0 : 1);
