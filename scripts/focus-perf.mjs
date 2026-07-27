/**
 * Navigation hitch probe: node scripts/focus-perf.mjs [save.txt] [zoom]
 *
 * frame-perf.mjs samples steady state. This one samples the EVENTS — clicking
 * a system, stepping out, hopping to the next one — because that is where the
 * multi-second stalls live. It records every rAF delta continuously and then
 * attributes each bad frame to the marked action it followed, so "clicking a
 * system costs 1.8s" is a measurement rather than a feeling.
 *
 * Needs `npm run dev` running. Pair with frame-profile.mjs for the cause.
 *
 * Runs against INSTALLED CHROME, not the bundled Chromium: Chromium headless
 * has no WebGPU and silently falls back to WebGL2, where a program link is
 * deferred and parallel. Players are on WebGPU, where `createRenderPipeline`
 * is synchronous and blocks the frame — so a hitch hunt on Chromium measures
 * the one backend that cannot show the bug. Set `TC_BROWSER=chromium` to
 * compare the fallback path deliberately.
 */
import './workspace-runtime.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const save = process.argv[2] ?? 'shots/u34.txt';
const zoom = Number(process.argv[3] ?? 0.62);
const W = 1440;
const H = 900;

const browser = await chromium.launch({
  ...(process.env.TC_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate((s) => window.__tc.importSave(s), await fs.readFile(save, 'utf8'));
await page.waitForTimeout(3000);
await page.evaluate((v) => window.__tcBus.useUiBus.getState().setZoom(v), zoom);
await page.waitForTimeout(2500);

// Continuous recorder: timestamped deltas plus named marks on the same clock.
await page.evaluate(() => {
  window.__rec = { deltas: [], marks: [] };
  let last = performance.now();
  const tick = (now) => {
    window.__rec.deltas.push([now, now - last]);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__mark = (name) => window.__rec.marks.push([performance.now(), name]);
});

async function mark(name) {
  await page.evaluate((n) => window.__mark(n), name);
}

/** Real pointer click on a scene object, the way a player reaches it. */
async function clickObject(kind, index) {
  const p = await page.evaluate(
    ([k, i]) => window.__tcCam.screenPos(k, Number(i)),
    [kind, index],
  );
  if (!p || p.z > 1 || p.x < 0 || p.y < 0 || p.x > W || p.y > H) {
    console.log(`  (skip ${kind}:${index} — projects off-screen ${JSON.stringify(p)})`);
    return false;
  }
  if (p.x > W - 420) {
    console.log(`  (skip ${kind}:${index} — under the dock at x=${Math.round(p.x)})`);
    return false;
  }
  await mark(`click ${kind}:${index}`);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(3200);
  // A click that missed costs nothing and proves nothing — say so loudly.
  const focus = await page.evaluate(() => window.__tcBus.useUiBus.getState().focus);
  const landed = focus && focus.kind === kind && focus.index === index;
  console.log(
    `  click ${kind}:${index} at ${Math.round(p.x)},${Math.round(p.y)} → focus=${JSON.stringify(
      focus,
    )}${landed ? '' : '   *** MISSED ***'}`,
  );
  return true;
}

async function escape() {
  await mark('escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3000);
}

// Only systems NOT yet swallowed by a galaxy still have a constellation glyph
// to click (SystemGlyphs starts at `galaxies * SYSTEMS_PER_GALAXY`). Clicking
// a consumed index hits empty space and measures nothing.
const state = await page.evaluate(() => {
  const s = window.__tc.useGame.getState().s;
  return { systems: s.run.systems, galaxies: s.run.galaxies, worlds: s.run.completedPlanets.length };
});
const perGalaxy = state.galaxies > 0 ? Math.round(state.systems / (state.galaxies + 1)) : 5;
const loose = state.systems - 1;
console.log(
  `universe: ${state.worlds} worlds / ${state.systems} systems / ${state.galaxies} galaxies` +
    ` — clicking loose system ${loose}`,
);

await mark('idle');
await page.waitForTimeout(2500);

await clickObject('system', loose);
await escape();

// The same system a second time. If this stalls too, the cost is not
// first-time material building — it is something the mount does every time.
await clickObject('system', loose);
await escape();

await clickObject('galaxy', 0);
await escape();

await mark('flight enter');
await page.evaluate(() => window.__tcFlight.enter());
await page.waitForTimeout(3000);

const rec = await page.evaluate(() => window.__rec);
const backend = await page.evaluate(() =>
  document.querySelector('canvas')?.getContext('webgpu') ? 'webgpu' : 'webgl2',
);
console.log(`\nbackend: ${backend}`);

// Attribute every frame to the most recent mark before it.
const marks = rec.marks;
console.log(`\nsave=${save} zoom=${zoom}  frames=${rec.deltas.length}\n`);
console.log('mark                     frames   p50    p95    max   >50ms  >200ms  stalled');
for (let m = 0; m < marks.length; m++) {
  const [t0, name] = marks[m];
  const t1 = m + 1 < marks.length ? marks[m + 1][0] : Infinity;
  const win = rec.deltas.filter(([t]) => t >= t0 && t < t1);
  if (win.length === 0) continue;
  const ds = win.map(([, d]) => d).sort((a, b) => a - b);
  const q = (p) => ds[Math.min(ds.length - 1, Math.floor(ds.length * p))];
  // Total time lost to frames that missed 60fps by more than a whole frame.
  const stalled = ds.filter((d) => d > 33).reduce((a, d) => a + d - 16.7, 0);
  console.log(
    `${name.padEnd(24)} ${String(win.length).padStart(5)}  ${q(0.5).toFixed(1).padStart(5)}  ${q(0.95)
      .toFixed(1)
      .padStart(5)}  ${ds[ds.length - 1].toFixed(0).padStart(5)}  ${String(
      ds.filter((d) => d > 50).length,
    ).padStart(5)}  ${String(ds.filter((d) => d > 200).length).padStart(6)}  ${(stalled / 1000)
      .toFixed(2)
      .padStart(6)}s`,
  );
}

console.log('\nworst frames (ms @ offset from mark):');
const worst = [...rec.deltas].sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [t, d] of worst) {
  let name = '(before any mark)';
  let off = 0;
  for (const [mt, mn] of marks) if (mt <= t) ((name = mn), (off = t - mt));
  console.log(`  ${d.toFixed(0).padStart(5)}ms   +${(off / 1000).toFixed(2)}s after "${name}"`);
}

await browser.close();
