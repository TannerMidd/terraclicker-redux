/**
 * Visual smoke test for the themed asset layer.
 *
 * Requires the Vite dev server at http://localhost:5173.
 * (localhost, not 127.0.0.1 — Vite binds IPv6 ::1 on this machine.)
 * Writes screenshots outside the bundle and prints a machine-readable report.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const outputDir = process.argv[2] ?? 'C:/tmp/terraclicker-asset-qa';
await fs.mkdir(outputDir, { recursive: true });

const issues = [];
const report = { views: [], failedAssets: [], console: issues };

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
});

async function openApp(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    if (request.url().includes('/assets/')) {
      report.failedAssets.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/assets/')) {
      report.failedAssets.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  return page;
}

async function grantAll(page) {
  await page.evaluate(() => {
    window.__tc?.dispatch({ type: 'devGrant', tu: '1e30', gaugeFrac: 0.72 });
  });
  await page.waitForTimeout(350);
}

async function captureView(page, name) {
  await page.waitForTimeout(350);
  const snapshot = await page.evaluate(() => {
    const allImages = [...document.images];
    const brokenImages = allImages
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => ({ src: img.currentSrc || img.src, className: img.className }));
    const overflowing = [...document.querySelectorAll('.dock, .shop-item, .upgrade-card, .research-item, .ach, .toast')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    const dock = document.querySelector('.dock');
    const body = document.querySelector('.dock-body');
    return {
      imageCount: allImages.length,
      brokenImages,
      overflowing,
      dock: dock
        ? {
            width: Math.round(dock.getBoundingClientRect().width),
            height: Math.round(dock.getBoundingClientRect().height),
          }
        : null,
      panelScroll: body ? { clientHeight: body.clientHeight, scrollHeight: body.scrollHeight } : null,
    };
  });
  const target = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: target });
  report.views.push({ name, screenshot: target, ...snapshot });
}

const desktop = await openApp(1440, 900);
await grantAll(desktop);
await captureView(desktop, 'desktop-shop');
await desktop.getByRole('button', { name: 'Research', exact: true }).click();
await captureView(desktop, 'desktop-research');
await desktop.getByRole('button', { name: 'Guide', exact: true }).click();
await captureView(desktop, 'desktop-guide');
await desktop.evaluate(() => window.__tc?.dispatch({ type: 'devSpawn', what: 'event' }));
await captureView(desktop, 'desktop-event-toast');
await desktop.close();

const mobile = await openApp(390, 844);
await grantAll(mobile);
await captureView(mobile, 'mobile-shop');
await mobile.getByRole('button', { name: 'Guide', exact: true }).click();
await captureView(mobile, 'mobile-guide');
await mobile.close();

report.failedAssets = [...new Set(report.failedAssets)];
report.console = [...new Set(report.console)].slice(0, 30);

await browser.close();
console.log(JSON.stringify(report, null, 2));

if (
  report.failedAssets.length > 0 ||
  report.views.some((view) => view.brokenImages.length > 0 || view.overflowing.length > 0)
) {
  process.exitCode = 1;
}
