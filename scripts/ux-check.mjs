/**
 * Rendered UX smoke: node scripts/ux-check.mjs
 *
 * Walks the authored first sortie in real Chromium, checks the responsive
 * cockpit, exercises Proceed Unsurveyed, and verifies a statute requires
 * explicit confirmation. Needs the Vite dev server on TC_PORT (default 5173).
 * Screenshots go to shots/ux-check by default (ignored by git).
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const port = process.env.TC_PORT ?? '5173';
const baseUrl = `http://localhost:${port}`;
const outputDir = path.resolve(process.env.TC_SHOT_DIR ?? 'shots/ux-check');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.TC_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
});
const failures = [];
const browserErrors = [];

function check(value, message) {
  if (!value) failures.push(message);
}

function overlaps(a, b) {
  return Boolean(a && b
    && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y);
}

function watch(page, label) {
  page.on('pageerror', (error) => browserErrors.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`${label} console: ${message.text()}`);
  });
}

async function loadApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__tc && window.__tcFlight), null, { timeout: 15_000 });
  await page.waitForTimeout(5_500);
  const coldOpen = page.locator('.mk2-coldopen-veil');
  if (await coldOpen.count()) await coldOpen.click({ position: { x: 12, y: 12 } });
}

async function cockpitLayout(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
        display: style.display,
        visibility: style.visibility,
      };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      sensors: rect('.fh-sensors'),
      sortie: rect('.fh-sortie'),
      console: rect('.fh-console'),
      nav: rect('.fh-nav'),
      reticle: rect('.fh-reticle'),
      autopilot: rect('.fh-autopilot-switch'),
      view: rect('.fh-view-switch'),
      touch: rect('.fh-touch'),
      action: rect('.fh-engage'),
      brake: rect('.fh-brake'),
      legacyAutopilot: document.querySelectorAll('.fn-autopilot').length,
    };
  });
}

async function runFirstSortie(page) {
  await page.evaluate(() => window.__tcFlight.enter());
  await page.waitForSelector('.flight-layer');
  await page.waitForFunction(
    () => window.__tcFlight.state().contacts.some((contact) => contact.training),
    null,
    { timeout: 10_000 },
  );
  const targetId = await page.evaluate(
    () => window.__tcFlight.state().contacts.find((contact) => contact.training)?.id ?? null,
  );
  check(Boolean(targetId), 'first sortie did not assign a training contact');
  if (!targetId) return null;

  await page.screenshot({ path: path.join(outputDir, 'flight-desktop-start.png') });
  const initialLayout = await cockpitLayout(page);
  check(initialLayout.scrollWidth <= initialLayout.width, 'desktop cockpit overflows horizontally');

  check(Boolean(initialLayout.autopilot), 'desktop autopilot switch is missing');
  if (initialLayout.autopilot) {
    check(initialLayout.autopilot.width <= 124, 'desktop autopilot switch is wider than a compact cockpit control');
    check(initialLayout.autopilot.height >= 44 && initialLayout.autopilot.height <= 54, 'desktop autopilot switch is not a compact touch-safe control');
  }
  check(Boolean(initialLayout.view), 'desktop camera-view switch is missing');
  check(initialLayout.legacyAutopilot === 0, 'legacy center-screen autopilot button is still mounted');
  check(!overlaps(initialLayout.nav, initialLayout.reticle), 'route ribbon overlaps the central reticle');

  await page.locator('.fh-view-switch').click();
  await page.waitForFunction(() => window.__tcFlight.state().cameraMode === 'chase'
    && document.querySelector('.flight-layer')?.classList.contains('chase-view'));
  const exteriorVisible = await page.evaluate(
    () => window.__tcScene?.scene?.getObjectByName('runabout-exterior')?.visible === true,
  );
  check(exteriorVisible, 'external runabout is not visible in chase view');
  check(await page.locator('.fh-view-switch').getAttribute('aria-pressed') === 'true', 'camera switch does not expose chase state');
  await page.screenshot({ path: path.join(outputDir, 'flight-desktop-chase.png') });

  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => window.__tcFlight.state().cameraMode === 'cockpit'
    && !document.querySelector('.flight-layer')?.classList.contains('chase-view'));
  // Clear the berth and face the exact authored target. The tutorial observes
  // the same physical state a player produces; only the long travel is skipped.
  await page.evaluate((id) => {
    const site = window.__tcFlight.sites().find((candidate) => candidate.id === id);
    if (!site) return;
    const length = Math.hypot(...site.pos);
    const pos = site.pos.map((value) => value / length * 6);
    const toward = site.pos.map((value, index) => value - pos[index]);
    const towardLength = Math.hypot(...toward);
    const unit = toward.map((value) => value / towardLength);
    window.__tcFlight.pose(pos[0], pos[1], pos[2], Math.atan2(-unit[0], -unit[2]), Math.asin(unit[1]));
  }, targetId);
  await page.waitForFunction(
    () => /(?:3|4|5|6) of 6/.test(document.querySelector('.fh-sortie')?.textContent ?? ''),
    null,
    { timeout: 5_000 },
  );

  await page.evaluate(() => { window.__tcFlight.input.engage = true; });
  await page.waitForFunction(
    (id) => window.__tc.useGame.getState().s.expedition.discovered[id] !== undefined,
    targetId,
    { timeout: 15_000 },
  );
  await page.evaluate(() => { window.__tcFlight.input.engage = false; });


  const trainingRow = page.locator('.fh-sensors .fc-row.known.training').first();
  await page.waitForTimeout(600);
  if (!await page.evaluate(() => Boolean(window.__tc.useGame.getState().s.expedition.pinned))) {
    await trainingRow.click();
  }
  await page.waitForFunction(() => Boolean(window.__tcFlight.state().nav)
    && document.querySelector('.fh-autopilot-switch')?.classList.contains('ready'),
  null,
  { timeout: 5_000 });
  // The tutorial buoy may already be inside its arrival envelope. Step back
  // before testing the switch so engagement has time to become observable.
  await page.evaluate((id) => {
    const site = window.__tcFlight.sites().find((candidate) => candidate.id === id);
    if (!site) return;
    const length = Math.hypot(...site.pos);
    const unit = site.pos.map((value) => value / length);
    const pos = site.pos.map((value, index) => value + unit[index] * 18);
    const toward = unit.map((value) => -value);
    window.__tcFlight.pose(pos[0], pos[1], pos[2], Math.atan2(-toward[0], -toward[2]), Math.asin(toward[1]));
  }, targetId);
  await page.waitForFunction(() => (window.__tcFlight.state().nav?.distance ?? 0) > 12);
  await page.locator('.fh-autopilot-switch').click();
  await page.waitForFunction(() => window.__tcFlight.state().autopilot === true
    && document.querySelector('.fh-autopilot-switch')?.classList.contains('on'));
  check(await page.locator('.fh-autopilot-switch').getAttribute('aria-pressed') === 'true', 'flipping the autopilot switch does not expose engaged state');
  await page.keyboard.press('KeyH');
  await page.waitForFunction(() => window.__tcFlight.state().autopilot === false
    && document.querySelector('.fh-autopilot-switch')?.getAttribute('aria-pressed') === 'false');
  check(await page.locator('.fh-autopilot-switch').getAttribute('aria-pressed') === 'false', 'H did not return the autopilot switch to manual');
  await page.evaluate((id) => window.__tcFlight.goto(id), targetId);
  await page.waitForFunction(
    (id) => window.__tcFlight.state().locked?.id === id,
    targetId,
    { timeout: 5_000 },
  );
  await page.evaluate(() => { window.__tcFlight.input.thrust = 1; });
  await page.waitForFunction(
    (id) => window.__tcFlight.state().contacts.find((contact) => contact.id === id)?.inRange === true,
    targetId,
    { timeout: 10_000 },
  );
  await page.evaluate(() => {
    window.__tcFlight.input.thrust = 0;
    window.__tcFlight.input.brake = 1;
  });
  await page.waitForFunction(() => window.__tcFlight.state().speed < 1, null, { timeout: 5_000 });
  await page.evaluate(() => { window.__tcFlight.input.brake = 0; });
  await page.waitForFunction(
    () => window.__tcFlight.state().prompt?.verb === 'board'
      && !window.__tcFlight.state().prompt?.blocked,
    null,
    { timeout: 5_000 },
  );

  await page.evaluate(() => { window.__tcFlight.input.engage = true; });
  await page.waitForFunction(
    (id) => window.__tc.useGame.getState().s.expedition.boarded[id] !== undefined,
    targetId,
    { timeout: 5_000 },
  );
  await page.evaluate(() => { window.__tcFlight.input.engage = false; });
  // Let the authored observer file the boarding step before moving the ship;
  // otherwise an instant dev-hook teleport can remove the contact first.
  await page.waitForFunction(
    () => /6 of 6/.test(document.querySelector('.fh-sortie')?.textContent ?? ''),
    null,
    { timeout: 5_000 },
  );

  await page.evaluate(() => window.__tcFlight.pose(0, 0, 4, 0, 0));
  await page.waitForFunction(
    () => Boolean(window.__tc.useGame.getState().s.flags.firstSortieDone),
    null,
    { timeout: 5_000 },
  );
  await page.waitForFunction(
    () => /induction complete/i.test(document.querySelector('.fh-sortie')?.textContent ?? ''),
    null,
    { timeout: 5_000 },
  );
  await page.screenshot({ path: path.join(outputDir, 'flight-desktop-complete.png') });

  return page.evaluate((id) => {
    const state = window.__tc.useGame.getState().s;
    return {
      targetId: id,
      discovered: state.expedition.discovered[id] !== undefined,
      boarded: state.expedition.boarded[id] !== undefined,
      completed: Boolean(state.flags.firstSortieDone),
      salvage: state.expedition.salvage,
      tutorial: document.querySelector('.fh-sortie')?.textContent?.trim() ?? null,
    };
  }, targetId);
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
watch(desktop, 'desktop');
await loadApp(desktop);
const sortie = await runFirstSortie(desktop);
check(sortie?.discovered, 'training contact was not discovered');
check(sortie?.boarded, 'training contact was not boarded');
check(sortie?.completed, 'first sortie did not complete after returning home');
check((sortie?.salvage ?? 0) >= 5, 'first sortie did not fund the starter refit');

await desktop.evaluate(() => {
  window.__tcFlight.exit();
  window.__tc.dispatch({ type: 'devGrant', tu: '1e13', gaugeFrac: 1 });
  const state = window.__tc.useGame.getState().s;
  state.lifetime.bestGalaxies = 1;
  window.__tc.dispatch({ type: 'devSpawn', what: 'situation' });
});
await desktop.waitForSelector('.mk2-priorities');
await desktop.screenshot({ path: path.join(outputDir, 'desk-priority.png') });
const priorityText = await desktop.locator('.mk2-priorities').innerText();
check(/Next up|After this/i.test(priorityText), 'priority queue heading is absent');

const vortexButton = desktop.locator('.mk2-drawer').filter({ hasText: 'VORTEX' }).first();
await vortexButton.click();
await desktop.waitForSelector('.dr-card.offer');
const statutesBefore = await desktop.evaluate(() => window.__tc.useGame.getState().s.lifetime.statutes.length);
await desktop.locator('.dr-card.offer').first().click();
await desktop.waitForSelector('.dr-statute-modal');
await desktop.screenshot({ path: path.join(outputDir, 'statute-confirmation.png') });
const statutesDuringReview = await desktop.evaluate(() => window.__tc.useGame.getState().s.lifetime.statutes.length);
check(statutesDuringReview === statutesBefore, 'opening statute review enacted it before confirmation');
await desktop.getByRole('button', { name: 'Not yet' }).click();
check(
  await desktop.evaluate(() => window.__tc.useGame.getState().s.lifetime.statutes.length) === statutesBefore,
  'cancelling statute review changed permanent state',
);

await desktop.evaluate(() => {
  const state = window.__tc.useGame.getState().s;
  state.run.dossier = null;
  state.run.dossierOffers = ['luxury-ocean', 'vogon-minimum', 'experimental-cluster'];
  state.lifetime.prestiges = Math.max(1, state.lifetime.prestiges);
  window.__tc.dispatch({ type: 'setFlag', id: 'firstSortieStep', value: 0 });
});
const magratheaButton = desktop.getByRole('button', { name: /^Magrathea/ }).first();
await magratheaButton.click();
const standardCommission = desktop.getByRole('button', { name: /Standard Commission/i });
await standardCommission.waitFor();
await desktop.screenshot({ path: path.join(outputDir, 'standard-commission.png') });
await standardCommission.click();
check(
  await desktop.evaluate(() => window.__tc.useGame.getState().s.run.dossierOffers.length) === 0,
  'Standard Commission did not close the dossier tray',
);

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});
const mobile = await mobileContext.newPage();
watch(mobile, 'mobile');
await loadApp(mobile);
await mobile.evaluate(() => window.__tcFlight.enter());
await mobile.waitForSelector('.flight-layer');
await mobile.waitForTimeout(1_000);
await mobile.screenshot({ path: path.join(outputDir, 'flight-mobile.png') });
const mobileLayout = await cockpitLayout(mobile);
check(mobileLayout.scrollWidth <= mobileLayout.width, 'mobile cockpit overflows horizontally');
check(!overlaps(mobileLayout.sensors, mobileLayout.sortie), 'mobile sensors overlap the induction');
check(!overlaps(mobileLayout.sortie, mobileLayout.touch), 'mobile touch controls overlap the induction');
check(!overlaps(mobileLayout.sortie, mobileLayout.console), 'mobile console overlaps the induction');
for (const [name, box] of Object.entries({
  sensors: mobileLayout.sensors,
  sortie: mobileLayout.sortie,
  autopilot: mobileLayout.autopilot,
  view: mobileLayout.view,
  touch: mobileLayout.touch,
  action: mobileLayout.action,
  brake: mobileLayout.brake,
})) {
  check(Boolean(box), `mobile ${name} control is missing`);
  if (box) {
    check(box.x >= -1 && box.right <= mobileLayout.width + 1, `mobile ${name} leaves the viewport`);
    check(box.y >= -1 && box.bottom <= mobileLayout.height + 1, `mobile ${name} leaves the viewport vertically`);
  }
}
check((mobileLayout.autopilot?.height ?? 0) >= 44, 'mobile autopilot switch is smaller than 44px');
check((mobileLayout.view?.height ?? 0) >= 44, 'mobile camera switch is smaller than 44px');
check(mobileLayout.legacyAutopilot === 0, 'mobile still mounts the legacy center autopilot button');
check(!overlaps(mobileLayout.nav, mobileLayout.reticle), 'mobile route ribbon overlaps the reticle');
await mobile.locator('.fh-view-switch').click();
await mobile.waitForFunction(() => window.__tcFlight.state().cameraMode === 'chase'
  && document.querySelector('.flight-layer')?.classList.contains('chase-view'));
await mobile.waitForTimeout(700);
const mobileChaseLayout = await cockpitLayout(mobile);
const mobileExteriorVisible = await mobile.evaluate(
  () => window.__tcScene?.scene?.getObjectByName('runabout-exterior')?.visible === true,
);
check(mobileExteriorVisible, 'external runabout is not visible in mobile chase view');
check(mobileChaseLayout.scrollWidth <= mobileChaseLayout.width, 'mobile chase view overflows horizontally');
check(Boolean(mobileChaseLayout.autopilot), 'mobile chase view lost its autopilot switch');
await mobile.screenshot({ path: path.join(outputDir, 'flight-mobile-chase.png') });


await mobile.evaluate(() => {
  window.__tcFlight.exit();
  const state = window.__tc.useGame.getState().s;
  state.planet.survey = null;
  state.planet.surveyOptions = ['geothermal-seams', 'dense-aquifers', 'calm-skies'];
  window.__tc.dispatch({ type: 'setFlag', id: 'firstSortieStep', value: 0 });
});
await mobile.waitForSelector('.survey-skip');
await mobile.screenshot({ path: path.join(outputDir, 'survey-mobile.png') });
await mobile.locator('.survey-skip').click();
await mobile.waitForFunction(() => window.__tc.useGame.getState().s.planet.surveyOptions === null);
check(await mobile.locator('.modal-veil').count() === 0, 'Proceed Unsurveyed did not close the survey modal');

await mobileContext.close();
await desktop.close();
await browser.close();

const summary = {
  outputDir,
  sortie,
  desktopPriority: priorityText.replace(/\s+/g, ' ').trim(),
  mobile: mobileLayout,
  mobileChase: mobileChaseLayout,
  browserErrors,
  failures,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(failures.length === 0 && browserErrors.length === 0 ? 0 : 1);
