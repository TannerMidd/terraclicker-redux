/** Headed liveness probe: real compositing + WebGPU path + interactivity.
 * Opens off-screen so it doesn't disturb the desktop. */
import './workspace-runtime.mjs';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-gpu',
    '--use-angle=d3d11',
    '--window-position=-3200,-3200',
    '--mute-audio',
  ],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${m.location().url}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});

await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const before = await page.evaluate(() => ({
  backend: document.querySelector('canvas')?.getContext('webgpu') ? 'webgpu' : 'gl-or-none',
  gameTimeMs: window.__tc?.useGame.getState().s.gameTimeMs ?? -1,
  tu: window.__tc?.useGame.getState().s.tu.toString(),
  canvasSize: (() => {
    const c = document.querySelector('canvas');
    return c ? `${c.width}x${c.height}` : 'none';
  })(),
  atPlanet: (() => {
    const el = document.elementFromPoint(430, 420);
    const chain = [];
    let n = el;
    while (n && chain.length < 5) {
      chain.push(
        `${n.tagName}${typeof n.className === 'string' && n.className ? '.' + n.className.split(' ').join('.') : ''}`,
      );
      n = n.parentElement;
    }
    return chain.join(' < ');
  })(),
  dockClasses: [...document.querySelectorAll('.dock [class]')].slice(0, 6).map((e) => e.className),
}));
await page.screenshot({ path: 'shots/live-probe.png' });

// Click the planet (left-of-center where the hero sits) until a probe is affordable.
for (let i = 0; i < 18; i++) {
  await page.mouse.click(430, 420);
  await page.waitForTimeout(90);
}
await page.waitForTimeout(1200);

const after = await page.evaluate(() => ({
  gameTimeMs: window.__tc?.useGame.getState().s.gameTimeMs ?? -1,
  tu: window.__tc?.useGame.getState().s.tu.toString(),
  clicks: window.__tc?.useGame.getState().s.lifetime.clicks,
}));

// Buy a probe through the actual DOM to prove the dock is interactive.
let buyResult = 'skipped';
try {
  await page.locator('.shop-item').first().click({ timeout: 3000 });
  await page.waitForTimeout(400);
  buyResult = await page.evaluate(
    () => `owned:${window.__tc?.useGame.getState().s.buildings['seedProbe'] ?? 0}`,
  );
} catch (e) {
  buyResult = `FAILED: ${String(e).slice(0, 120)}`;
}

console.log(JSON.stringify({ before, after, buyResult, errors: errors.slice(0, 8) }, null, 2));
await browser.close();
