/**
 * Flight-layer smoke check: node scripts/flight-check.mjs
 *
 * Manual flight only integrates while the render loop is running, so none of
 * it can be verified from a headless DOM or from a browser pane that is not
 * compositing. This drives installed Chrome, takes the helm for real, and
 * reads the cockpit back out.
 *
 * Currently checks Civil Navigation end to end: pin a waypoint on the chart,
 * enter flight, and confirm the rig resolves it to a position, solves a
 * bearing, and paints the ribbon.
 *
 * Needs a dev server. TC_PORT selects it (default 5173).
 */
import './workspace-runtime.mjs';
import { chromium } from 'playwright';

const port = process.env.TC_PORT ?? '5173';
const browser = await chromium.launch({
  ...(process.env.TC_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);

// A universe with somewhere to go.
const universe = await page.evaluate(async () => {
  const tc = window.__tc;
  for (let i = 0; i < 8; i++) tc.dispatch({ type: 'devGrant', tu: '1e13', gaugeFrac: 1 });
  const s = tc.useGame.getState().s;
  if (s.planet.surveyOptions?.length) {
    tc.dispatch({ type: 'chooseSurvey', id: s.planet.surveyOptions[0] });
  }
  const after = tc.useGame.getState().s;
  return { worlds: after.run.completedPlanets.length, systems: after.run.systems };
});
console.log(`universe: ${JSON.stringify(universe)}`);

const result = await page.evaluate(async () => {
  const tc = window.__tc;
  const target = 'world:2';
  tc.dispatch({ type: 'setWaypoint', id: target });
  window.__tcFlight.enter();
  await new Promise((r) => setTimeout(r, 2500));

  const st = window.__tcFlight.state();
  const ribbon = document.querySelector('.fh-nav');
  const marker = document.querySelector('.fn-marker');

  // Turn the ship and confirm the bearing tracks the rotation.
  const before = st.nav ? st.nav.bearing : null;
  window.__tcFlight.pose(st.pos[0], st.pos[1], st.pos[2], st.yaw + 1.0, 0);
  await new Promise((r) => setTimeout(r, 600));
  const after = window.__tcFlight.state().nav;

  return {
    active: st.active,
    pinned: tc.useGame.getState().s.expedition.pinned,
    navLabel: st.navLabel,
    nav: st.nav,
    bearingBefore: before,
    bearingAfter: after ? after.bearing : null,
    ribbonOn: ribbon ? ribbon.classList.contains('on') : null,
    ribbonText: ribbon ? ribbon.textContent.trim() : null,
    markerTransform: marker ? marker.style.transform : null,
  };
});

console.log(JSON.stringify(result, null, 2));

const ok =
  result.active &&
  result.nav !== null &&
  result.ribbonOn === true &&
  result.bearingBefore !== result.bearingAfter;
console.log(ok ? '\nPASS — the cockpit carries a bearing.' : '\nFAIL — see above.');

await browser.close();
process.exit(ok ? 0 : 1);
