/** Dev probe: load a save, complete one world, log cinematic + camera state. */
import './workspace-runtime.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const savePath = process.argv[2] ?? 'shots/u49.txt';
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
page.on('pageerror', (err) => console.log('pageerror:', err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('console error:', msg.text());
});

await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const save = await fs.readFile(savePath, 'utf8');
await page.evaluate((s) => window.__tc.importSave(s), save);
await page.waitForTimeout(1500);

await page.evaluate(() => {
  window.__tc.dispatch({ type: 'devGrant', tu: '1e9', gaugeFrac: 1 });
});
await page.waitForTimeout(350);
await page.evaluate(() => {
  const s = window.__tc.useGame.getState().s;
  if (s.planet.surveyOptions) window.__tc.dispatch({ type: 'chooseSurvey', id: s.planet.surveyOptions[0] });
});

for (let i = 0; i < 24; i++) {
  const st = await page.evaluate(() => {
    const b = window.__tcBus.useUiBus.getState();
    const s = window.__tc.useGame.getState().s;
    return {
      cine: b.activeCinematic ? `${b.activeCinematic.kind}:${b.activeCinematic.index}` : null,
      queue: b.cinematicQueue.length,
      zoom: +window.__tcBus.zoomLive.v.toFixed(3),
      systems: s.run.systems,
      galaxies: s.run.galaxies,
    };
  });
  console.log(`${(i * 0.4).toFixed(1)}s`, JSON.stringify(st));
  await page.waitForTimeout(400);
}
await browser.close();
