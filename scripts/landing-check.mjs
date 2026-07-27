/**
 * Headless check of the landing page — the shot.mjs equivalent for the front door.
 *
 *   npm run site:preview          # in one shell
 *   node scripts/landing-check.mjs [outDir]
 *
 * At six widths it reports console errors, any response ≥400, and horizontal
 * overflow (the failure this page is most likely to have, since it is the only
 * scrolling document in the project). Writes <width>.png into outDir if given.
 */
import './workspace-runtime.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.LANDING_URL || 'http://localhost:4180/';
const outDir = process.argv[2];
const WIDTHS = [360, 390, 768, 1024, 1440, 1920];

if (outDir) fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
let failed = 0;

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });

  // Walk the page so lazy images fetch and any observer-driven state settles.
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 800) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(90);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const doc = await page.evaluate(() => {
    // The lightbox's <img> has no src until a thumbnail is clicked — not a failure.
    const real = [...document.images].filter((i) => i.getAttribute('src'));
    return {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      broken: real.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.currentSrc || i.src),
      noAlt: real.filter((i) => i.getAttribute('alt') === null).length,
    };
  });
  if (doc.scrollW > doc.clientW) problems.push(`h-scroll: ${doc.scrollW} > ${doc.clientW}`);
  for (const src of doc.broken) problems.push(`image failed: ${src}`);
  if (doc.noAlt) problems.push(`${doc.noAlt} images without an alt attribute`);

  if (outDir) await page.screenshot({ path: `${outDir}/${width}.png`, fullPage: true });

  failed += problems.length ? 1 : 0;
  console.log(
    `${String(width).padStart(4)}px  ${height}px tall  ` +
      (problems.length ? `\n        ${problems.join('\n        ')}` : 'clean'),
  );
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
