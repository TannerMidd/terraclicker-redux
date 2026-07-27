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
 * flykeys:w+shift,1200 (hold real flight keys for ms) | flystate (log pose) |
 * goto:id (park beside a Deep Field landmark) | sites (log landmark placement) |
 * refit:id (install the next rank of a runabout refit).
 * Groundfall: gfland (park over the hero world and press engage for real) |
 * gfskip (finish the bake, stand at the airlock) | gfstate (log the walker) |
 * gflook:yaw,pitch | gfteleport:x,z[,yaw] | gfmine[:ms] (work nearest seam) |
 * gfscanall (identify every site — the field pulse, without the dwell) |
 * gfverb:i (choose the pick's meaning: 0 break · 1 core · 2 prospect · 3 preserve) |
 * gfweather:kind (pin the sky: rain fog storm dust whiteout ash tremor meteors clear) |
 * gflandmarks (log the region's landmark census) |
 * gfboard (board the runabout and take off).
 * Prints console errors and the active render backend.
 */
import './workspace-runtime.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const [out = 'shot.png', w = '1440', h = '860', waitMs = '6000', actionsRaw = ''] =
  process.argv.slice(2);

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=d3d11'],
  // SHOT_CHANNEL=chrome runs the installed Chrome, whose WebGPU device
  // actually initializes headless — the bundled Chromium falls back to
  // WebGL2 on this machine, which is the fallback path, not the main one.
  channel: process.env.SHOT_CHANNEL || undefined,
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
    // scroll:dy — the scene (journey zoom). scroll:dy,x,y — scroll whatever
    // is under that point instead (the dock panel, for one).
    const [dy, sx, sy] = arg.split(',').map(Number);
    await page.mouse.move(sx ?? 500, sy ?? 420);
    await page.mouse.wheel(0, dy);
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
  } else if (kind === 'pose') {
    // pose:x,y,z,yaw[,pitch] — exact helm pose for approach/wall checks.
    const [px, py, pz, yaw, pitch] = arg.split(',').map(Number);
    await page.evaluate(
      ([a, b, c, d, e]) => window.__tcFlight?.pose(a, b, c, d, e ?? 0),
      [px, py, pz, yaw, pitch],
    );
    await page.waitForTimeout(300);
  } else if (kind === 'goto') {
    // Park the runabout beside a Deep Field landmark (uses the jump path).
    const p = await page.evaluate((id) => window.__tcFlight?.goto(id), arg);
    if (!p) errors.push(`goto: no landmark "${arg}"`);
    await page.waitForTimeout(700);
  } else if (kind === 'sites') {
    const list = await page.evaluate(() => window.__tcFlight?.sites());
    console.log('sites:', JSON.stringify(list));
  } else if (kind === 'refit') {
    await page.evaluate((id) => window.__tc.dispatch({ type: 'buyRefit', id }), arg);
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
  } else if (kind === 'newseed') {
    await page.evaluate((n) => window.__tc.newUniverse(Number(n)), arg);
    await page.waitForTimeout(700);
  } else if (kind === 'gfland') {
    // Park the runabout just off the hero world and press engage for real:
    // the live frame loop sees the landing prompt and commits the groundfall.
    await page.evaluate(() => {
      const shell = window.__tcFlight.bodies()[0].radius;
      window.__tcFlight.pose(0, shell + 0.22, 0, 0, -0.6);
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__tcFlight.input.engage = true; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.__tcFlight.input.engage = false; });
  } else if (kind === 'gfwaitwalk') {
    // Bake time varies by machine; wait for boots on the ground, not a clock.
    const deadline = Date.now() + Number(arg || 40000);
    let walking = false;
    while (Date.now() < deadline) {
      walking = await page.evaluate(() => window.__tcSurface?.state()?.phase === 'walk');
      if (walking) break;
      await page.waitForTimeout(400);
    }
    if (!walking) errors.push('gfwaitwalk: never reached the ground');
    await page.waitForTimeout(300);
  } else if (kind === 'gfskip') {
    // Finish the bake synchronously and stand at the airlock.
    const ok = await page.evaluate(() => window.__tcSurface?.skipToWalk() ?? false);
    if (!ok) errors.push('gfskip: skipToWalk failed');
    await page.waitForTimeout(600);
  } else if (kind === 'gfstate') {
    const st = await page.evaluate(() => window.__tcSurface?.state() ?? null);
    console.log('gfstate:', JSON.stringify(st));
  } else if (kind === 'gflook') {
    const [yaw, pitch] = arg.split(',').map(Number);
    await page.evaluate(([y, p]) => window.__tcSurface.look(y, p), [yaw, pitch]);
    await page.waitForTimeout(200);
  } else if (kind === 'gfteleport') {
    const [x, z, yaw] = arg.split(',').map(Number);
    await page.evaluate(([a, b, c]) => window.__tcSurface.teleport(a, b, c ?? 0), [x, z, yaw]);
    await page.waitForTimeout(250);
  } else if (kind === 'gfengage') {
    await page.evaluate((v) => { window.__tcSurface.input.engage = v === 'on'; }, arg);
  } else if (kind === 'gfmineaim') {
    // Stand before the nearest unworked seam and aim, without pulling the
    // trigger — for screenshots of the beam mid-extraction.
    await page.evaluate(() => {
      const st = window.__tcSurface.state();
      const live = st.pos;
      const seam = st.deposits
        .filter((d) => !st.mined.includes(d.id))
        .sort((a, b) =>
          Math.hypot(a.x - live[0], a.z - live[2]) - Math.hypot(b.x - live[0], b.z - live[2]))[0];
      if (!seam) return;
      const back = 2.6;
      const ang = Math.atan2(seam.x, seam.z);
      const sx = seam.x - Math.sin(ang) * back;
      const sz = seam.z - Math.cos(ang) * back;
      window.__tcSurface.teleport(sx, sz);
      const p = window.__tcSurface.state().pos;
      const dx = seam.x - p[0];
      const dz = seam.z - p[2];
      const dy = seam.y + 0.9 - p[1];
      window.__tcSurface.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    });
    await page.waitForTimeout(250);
  } else if (kind === 'gfmine') {
    // Walk the reticle onto the nearest seam and hold engage until it yields.
    await page.evaluate(() => {
      const st = window.__tcSurface.state();
      const live = st.pos;
      const seam = st.deposits
        .filter((d) => !st.mined.includes(d.id))
        .sort((a, b) =>
          Math.hypot(a.x - live[0], a.z - live[2]) - Math.hypot(b.x - live[0], b.z - live[2]))[0];
      if (!seam) return;
      const back = 2.4;
      const ang = Math.atan2(seam.x, seam.z);
      const sx = seam.x - Math.sin(ang) * back;
      const sz = seam.z - Math.cos(ang) * back;
      window.__tcSurface.teleport(sx, sz);
      const p = window.__tcSurface.state().pos;
      const dx = seam.x - p[0];
      const dz = seam.z - p[2];
      const dy = seam.y + 0.9 - p[1];
      window.__tcSurface.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      window.__tcSurface.input.engage = true;
    });
    await page.waitForTimeout(Number(arg || 2400));
    await page.evaluate(() => { window.__tcSurface.input.engage = false; });
  } else if (kind === 'gfscanall') {
    await page.evaluate(() => window.__tcSurface.identifyAll());
  } else if (kind === 'gfshore') {
    // Walk the reticle to the nearest wading shelf and face the open water.
    // gfshore:look instead stands on the beach above it, looking down the
    // waterline — the postcard angle for shore breaks and mist.
    const found = await page.evaluate((mode) => {
      const s = window.__tcSurface;
      const sea = s.state().seaLevelM;
      for (let r = 30; r < 3200; r += 14) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 20) {
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          const depth = sea - s.heightAt(x, z);
          if (depth > 0.35 && depth < 0.8) {
            // Up-gradient is the way to the beach.
            const e = 8;
            const gx = s.heightAt(x + e, z) - s.heightAt(x - e, z);
            const gz = s.heightAt(x, z + e) - s.heightAt(x, z - e);
            const g = Math.hypot(gx, gz) || 1;
            if (mode === 'look') {
              const bx = x + (gx / g) * 26;
              const bz = z + (gz / g) * 26;
              s.teleport(bx, bz);
              s.look(Math.atan2(-(x - bx), -(z - bz)), -0.34);
            } else {
              s.teleport(x, z);
              s.look(Math.atan2(gx, gz), -0.12);
            }
            return { x, z, depth };
          }
        }
      }
      return null;
    }, arg);
    if (!found) errors.push('gfshore: no wading shelf within 3.2 km');
    else console.log('gfshore:', JSON.stringify(found));
    await page.waitForTimeout(400);
  } else if (kind === 'gfweather') {
    const set = await page.evaluate((k) => window.__tcSurface.setWeather(k), arg);
    console.log('gfweather:', set);
    await page.waitForTimeout(2500); // let fog and particles settle in
  } else if (kind === 'gflandmarks') {
    const list = await page.evaluate(() => window.__tcSurface.state()?.landmarks ?? []);
    console.log('gflandmarks:', JSON.stringify(list));
  } else if (kind === 'gfvisit') {
    // gfvisit[:i] — stand a photographer's distance from the i-th (default
    // nearest) landmark and face it.
    const which = await page.evaluate((idx) => {
      const s = window.__tcSurface;
      const st = s.state();
      const sorted = [...st.landmarks].sort((a, b) =>
        Math.hypot(a.x - st.pos[0], a.z - st.pos[2]) - Math.hypot(b.x - st.pos[0], b.z - st.pos[2]));
      const lm = sorted[Math.min(idx, sorted.length - 1)];
      if (!lm) return null;
      const back = 34;
      const ang = Math.atan2(lm.x - st.pos[0], lm.z - st.pos[2]);
      const sx = lm.x - Math.sin(ang) * back;
      const sz = lm.z - Math.cos(ang) * back;
      s.teleport(sx, sz);
      const p = s.state().pos;
      const dx = lm.x - p[0];
      const dz = lm.z - p[2];
      const dy = lm.y + 4 - p[1];
      s.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      return lm;
    }, Number(arg || 0));
    if (!which) errors.push('gfvisit: no landmarks in the region');
    else console.log('gfvisit:', JSON.stringify(which));
    await page.waitForTimeout(500);
  } else if (kind === 'gfverb') {
    await page.evaluate((i) => window.__tcSurface.setVerb(i), Number(arg));
  } else if (kind === 'gfboard') {
    await page.evaluate(() => window.__tcSurface.board());
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
