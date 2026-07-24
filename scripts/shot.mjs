/**
 * Headless verification screenshot: node scripts/shot.mjs <out.png> [width] [height] [waitMs] [actions]
 * `actions` is a semicolon list: click:x,y | tab:Name | wait:ms | worlds:N (complete
 * N planets, auto-survey) | zoom:v (set journey zoom 0–1) | save:file | load:file |
 * shot:file (mid-run capture; the final <out.png> still happens) |
 * focus:kind,index|none (visit a galaxy/system/world via the bus) |
 * clickobj:kind,index (REAL mouse click on the object via __tcCam.screenPos) |
 * key:Name (keyboard press, e.g. key:Escape) |
 * wheel:x,y,dy (real wheel at coords — cursor zoom / focus dolly ladder) |
 * drag:x0,y0,x1,y1 (real mouse drag — orbit) | cine:cancel (skip ceremonies) |
 * flight:on|off (take/leave the helm) | move:x,y (park the mouse — steering) |
 * flykeys:w+shift,1200 (hold real flight keys for ms) | flystate (log pose).
 * Prints console errors and the active render backend.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const [out = 'shot.png', w = '1440', h = '860', waitMs = '6000', actionsRaw = ''] =
  process.argv.slice(2);

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`${msg.type()}: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(process.env.SHOT_URL || 'http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(Number(waitMs));

for (const action of actionsRaw.split(';').filter(Boolean)) {
  const [kind, ...rest] = action.split(':');
  const arg = rest.join(':');
  if (kind === 'click') {
    const [x, y] = arg.split(',').map(Number);
    await page.mouse.click(x, y);
  } else if (kind === 'tab') {
    await page.getByRole('tab', { name: arg, exact: true }).click();
  } else if (kind === 'btn') {
    await page.getByRole('button', { name: arg }).first().click();
  } else if (kind === 'wait') {
    await page.waitForTimeout(Number(arg));
  } else if (kind === 'grant') {
    const [tu, frac] = arg.split(',');
    await page.evaluate(
      ([t, f]) =>
        window.__tc?.dispatch({ type: 'devGrant', tu: t, gaugeFrac: f ? Number(f) : undefined }),
      [tu, frac],
    );
  } else if (kind === 'scroll') {
    await page.mouse.move(500, 420);
    await page.mouse.wheel(0, Number(arg));
    await page.waitForTimeout(900);
  } else if (kind === 'spawn') {
    await page.evaluate((what) => window.__tc?.dispatch({ type: 'devSpawn', what }), arg);
  } else if (kind === 'buy') {
    const [id, qty] = arg.split(',');
    await page.evaluate(
      ([bid, q]) =>
        window.__tc?.dispatch({ type: 'buyBuilding', id: bid, qty: q === 'max' ? 'max' : Number(q) }),
      [id, qty],
    );
  } else if (kind === 'worlds') {
    await page.evaluate(async (count) => {
      for (let i = 0; i < count; i++) {
        window.__tc.dispatch({ type: 'devGrant', tu: '1e9', gaugeFrac: 1 });
        await new Promise((r) => setTimeout(r, 300));
        const s = window.__tc.useGame.getState().s;
        if (s.planet.surveyOptions)
          window.__tc.dispatch({ type: 'chooseSurvey', id: s.planet.surveyOptions[0] });
        await new Promise((r) => setTimeout(r, 60));
      }
    }, Number(arg));
  } else if (kind === 'zoom') {
    await page.evaluate((v) => window.__tcBus.useUiBus.getState().setZoom(v), Number(arg));
    await page.waitForTimeout(1900);
  } else if (kind === 'focus') {
    const [fk, fi] = arg.split(',');
    await page.evaluate(
      ([k, i]) =>
        window.__tcBus.useUiBus
          .getState()
          .setFocus(k === 'none' ? null : { kind: k, index: Number(i) }),
      [fk, fi],
    );
    await page.waitForTimeout(2600);
  } else if (kind === 'clickobj') {
    const [ck, ci] = arg.split(',');
    const p = await page.evaluate(([k, i]) => window.__tcCam.screenPos(k, Number(i)), [ck, ci]);
    if (!p || p.z > 1 || p.x < 0 || p.y < 0 || p.x > Number(w) || p.y > Number(h)) {
      errors.push(`clickobj: ${arg} projects off-screen (${JSON.stringify(p)})`);
    } else {
      if (p.x > Number(w) - 420)
        errors.push(`clickobj: ${arg} at x=${Math.round(p.x)} may be under the dock panel`);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(2600);
    }
  } else if (kind === 'hoverobj') {
    const [hk, hi] = arg.split(',');
    const p = await page.evaluate(([k, i]) => window.__tcCam.screenPos(k, Number(i)), [hk, hi]);
    if (p && p.z <= 1) {
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(700);
    }
  } else if (kind === 'key') {
    await page.keyboard.press(arg);
    await page.waitForTimeout(2200);
  } else if (kind === 'wheel') {
    const [x, y, dy] = arg.split(',').map(Number);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(600);
  } else if (kind === 'drag') {
    const [x0, y0, x1, y1] = arg.split(',').map(Number);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / 14, y0 + ((y1 - y0) * i) / 14);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(700);
  } else if (kind === 'cine') {
    await page.evaluate(() => window.__tcBus.useUiBus.getState().cancelCinematics());
  } else if (kind === 'flight') {
    await page.evaluate((on) => (on === 'on' ? window.__tcFlight.enter() : window.__tcFlight.exit()), arg);
    await page.waitForTimeout(900);
  } else if (kind === 'move') {
    const [x, y] = arg.split(',').map(Number);
    await page.mouse.move(x, y);
    await page.waitForTimeout(150);
  } else if (kind === 'flykeys') {
    const [names, ms] = arg.split(',');
    const KEYMAP = {
      w: 'w', a: 'a', s: 's', d: 'd', c: 'c',
      shift: 'Shift', space: 'Space',
      up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    };
    const list = names.split('+').map((k) => KEYMAP[k] ?? k);
    for (const k of list) await page.keyboard.down(k);
    await page.waitForTimeout(Number(ms));
    for (const k of list) await page.keyboard.up(k);
    await page.waitForTimeout(250);
  } else if (kind === 'flystate') {
    const st = await page.evaluate(() => window.__tcFlight?.state());
    console.log('flystate:', JSON.stringify(st));
  } else if (kind === 'dispatch') {
    await page.evaluate((json) => window.__tc.dispatch(JSON.parse(json)), arg);
  } else if (kind === 'save') {
    const str = await page.evaluate(() => window.__tc.exportSave());
    await fs.writeFile(arg, str, 'utf8');
  } else if (kind === 'load') {
    const str = await fs.readFile(arg, 'utf8');
    await page.evaluate((s) => window.__tc.importSave(s), str);
    await page.waitForTimeout(1200);
  } else if (kind === 'shot') {
    await page.screenshot({ path: arg });
  } else if (kind === 'survey') {
    await page.evaluate(() => {
      const s = window.__tc.useGame.getState().s;
      if (s.planet.surveyOptions)
        window.__tc.dispatch({ type: 'chooseSurvey', id: s.planet.surveyOptions[0] });
    });
  }
}
if (actionsRaw) await page.waitForTimeout(600);

const info = await page.evaluate(() => ({
  webgpu: 'gpu' in navigator,
  canvas: (() => {
    const c = document.querySelector('canvas');
    return c ? `${c.width}x${c.height} ctx=${c.getContext('webgpu') ? 'webgpu' : 'gl'}` : 'none';
  })(),
  tu: document.querySelector('.tu-counter')?.textContent ?? null,
}));

await page.screenshot({ path: out });
await browser.close();

console.log(JSON.stringify(info));
if (errors.length) {
  console.log('--- console issues ---');
  for (const e of errors.slice(0, 12)) console.log(e);
}
