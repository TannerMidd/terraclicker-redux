/**
 * CPU profile of the flight-moving window: node scripts/frame-profile.mjs [save]
 *
 * Reports inclusive time per function and, specifically, what is calling
 * `getProgramParameter` — shader/pipeline linking is the usual cause of
 * hitches in this scene, and self-time alone will not tell you who triggered
 * it. Needs `npm run dev` running.
 *
 * Runs against INSTALLED CHROME (WebGPU); the bundled Chromium silently falls
 * back to WebGL2. `TC_BROWSER=chromium` profiles the fallback instead. On
 * WebGPU the usual culprit is `getNodeBuilderState` — a node graph being
 * turned into WGSL inside the render pass — rather than the link itself.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const save = process.argv[2] ?? 'shots/u409.txt';
const browser = await chromium.launch({
  ...(process.env.TC_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate((s) => window.__tc.importSave(s), await fs.readFile(save, 'utf8'));
await page.waitForTimeout(2500);
await page.evaluate(() => window.__tcFlight.enter());
await page.waitForTimeout(2500);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');

await page.mouse.move(760, 430);
await page.keyboard.down('w');
await page.keyboard.down('Shift');
await page.waitForTimeout(8000);
await page.keyboard.up('w');
await page.keyboard.up('Shift');

const { profile } = await cdp.send('Profiler.stop');

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const total = profile.samples.length;
const label = (n) => {
  const f = n.callFrame;
  const file = f.url ? f.url.split('/').pop().split('?')[0] : '';
  return `${f.functionName || '(anon)'} ${file ? `@${file}:${f.lineNumber}` : ''}`;
};

// Inclusive time per function: every sample credits its whole ancestor chain.
const incl = new Map();
for (const id of profile.samples) {
  const seen = new Set();
  let cur = id;
  while (cur !== undefined) {
    const n = byId.get(cur);
    if (!n) break;
    const k = label(n);
    if (!seen.has(k)) {
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + 1);
    }
    cur = parent.get(cur);
  }
}
console.log(`samples: ${total}`);
console.log('--- inclusive (excluding idle/root) ---');
const skip = /^\((idle|root|program|garbage collector)\)/;
for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) {
  if (skip.test(k)) continue;
  console.log(`${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
}

// Who calls the shader link?
console.log('--- callers of getProgramParameter ---');
const callers = new Map();
for (const id of profile.samples) {
  const n = byId.get(id);
  if (!n || n.callFrame.functionName !== 'getProgramParameter') continue;
  const chain = [];
  let cur = parent.get(id);
  for (let i = 0; i < 8 && cur !== undefined; i++) {
    const p = byId.get(cur);
    if (!p) break;
    chain.push(label(p));
    cur = parent.get(cur);
  }
  const k = chain.join(' <- ');
  callers.set(k, (callers.get(k) ?? 0) + 1);
}
for (const [k, v] of [...callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
  console.log(`  ${v} samples: ${k}`);
}

await browser.close();
