/**
 * Frame-time probe: node scripts/frame-perf.mjs [save.txt]
 *
 * Samples rAF deltas across map, flight, and flight-while-moving, and reports
 * p50/p95/p99/max plus counts of frames over 33ms and 50ms. Averages hide
 * stutter — a session can sit at a perfect 16.7ms p50 and still feel broken
 * because of a handful of 200ms hitches, so the percentiles are the point.
 *
 * Needs `npm run dev` running. Pair with frame-profile.mjs to find the cause.
 *
 * Runs against INSTALLED CHROME: the bundled Chromium has no WebGPU and falls
 * back to WebGL2, which is not the backend players are on and hides the
 * hitches that matter. `TC_BROWSER=chromium` measures the fallback instead.
 */
import './workspace-runtime.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const save = process.argv[2] ?? 'shots/u34.txt';
const port = process.env.TC_PORT ?? '5173';
const browser = await chromium.launch({
  ...(process.env.TC_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate((s) => window.__tc.importSave(s), await fs.readFile(save, 'utf8'));
await page.waitForTimeout(2500);

async function sample(label, setup, ms = 6000) {
  if (setup) await setup();
  await page.waitForTimeout(700);
  const stats = await page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now) => {
          deltas.push(now - last);
          last = now;
          if (now - t0 < dur) requestAnimationFrame(tick);
          else {
            deltas.sort((a, b) => a - b);
            const q = (p) => deltas[Math.floor(deltas.length * p)];
            resolve({
              frames: deltas.length,
              p50: +q(0.5).toFixed(2),
              p95: +q(0.95).toFixed(2),
              p99: +q(0.99).toFixed(2),
              max: +deltas[deltas.length - 1].toFixed(2),
              over33: deltas.filter((d) => d > 33).length,
              over50: deltas.filter((d) => d > 50).length,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
  console.log(label, JSON.stringify(stats));
}

await sample('map-idle       ', null);
await sample('flight-idle    ', async () => {
  await page.evaluate(() => window.__tcFlight.enter());
});
await sample('flight-warm    ', null); // second pass: everything compiled
await sample('flight-moving  ', async () => {
  await page.mouse.move(760, 430);
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
});
await page.keyboard.up('w');
await page.keyboard.up('Shift');

// The busy part of the map: hero planet, infrastructure, traffic, worlds.
await sample('flight-at-home ', async () => {
  await page.evaluate(() => {
    const f = window.__tcFlight;
    f.exit();
    f.enter();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__tcBus.useUiBus.getState().setZoom(0));
});
await sample('flight-thru-sys', async () => {
  await page.mouse.move(690, 400);
  await page.keyboard.down('w');
});
await page.keyboard.up('w');

await sample('flight-nearsite', async () => {
  await page.evaluate(() => window.__tcFlight.goto('coolingArray'));
});

await browser.close();
