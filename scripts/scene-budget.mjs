/**
 * Scene budget probe: node scripts/scene-budget.mjs [save.txt]
 *
 * Answers the question the roadmap's Phases 3 and 4 cannot be designed without:
 * how much is already on screen, and how much room is left.
 *
 * "The universe visibly accumulates" is one of the two laws in EXPANSION.md,
 * and everything still to be built obeys it — settlement lights and weather
 * per world, nebulae and debris and comet trails, relay buoys and depots and
 * survey stations, lanes worn into space by repeated flight. Every one of
 * those mints persistent scene objects, and nobody has ever written down the
 * ceiling. This prints it, so content can be authored against a number instead
 * of against optimism.
 *
 * Reports draw calls, programs, geometries and textures at each zoom band and
 * inside flight, against a save with real accumulation in it. Programs are the
 * number to watch: this scene is TSL/node-material based, so distinct material
 * graphs each compile their own shader, and a per-instance node cost is paid
 * per unique graph rather than per draw.
 *
 * Needs a dev server. TC_PORT selects it (default 5173). Runs against INSTALLED
 * CHROME for WebGPU, like frame-perf.mjs; TC_BROWSER=chromium measures the
 * WebGL2 fallback instead.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const save = process.argv[2] ?? 'shots/u409.txt';
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
await page.waitForTimeout(3000);

const universe = await page.evaluate(() => {
  const s = window.__tc.useGame.getState().s;
  return {
    worlds: s.run.completedPlanets.length,
    systems: s.run.systems,
    galaxies: s.run.galaxies,
    heritage: s.operations.heritageWorlds.length,
    rigs: Object.keys(s.expedition.rigs).length,
    megaprojects: Object.values(s.megaprojects).filter((m) => m.done).length,
    discovered: Object.keys(s.expedition.discovered).length,
  };
});
console.log(`save: ${save}`);
console.log(`universe: ${JSON.stringify(universe)}\n`);

async function measure(label, setup) {
  if (setup) await setup();
  await page.waitForTimeout(1400);
  const info = await page.evaluate(() => {
    const gl = window.__tcRenderer;
    if (!gl) return null;
    // NOTE: `info.render.calls` / `.triangles` are NOT reported here. On the
    // WebGPU backend they read 2 and 0 respectively against a 409-world scene
    // that is visibly drawing hundreds of meshes — the counters are a WebGL-era
    // field this backend does not populate. Publishing them as a budget would
    // be publishing a fiction. Frame *time* comes from frame-perf.mjs, which
    // measures rAF deltas and does not depend on renderer bookkeeping.
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        {
          // Distinct material graphs = distinct pipeline compiles.
          const materials = new Set();
          const kinds = new Set();
          let meshes = 0;
          let instanced = 0;
          const root = window.__tcScene?.scene;
          if (root) {
            root.traverse((o) => {
              if (!o.material) return;
              meshes += 1;
              if (o.isInstancedMesh) instanced += 1;
              for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                materials.add(m.uuid);
                kinds.add(m.type);
              }
            });
          }

          resolve({
            geometries: gl.info.memory.geometries,
            textures: gl.info.memory.textures,
            materials: materials.size,
            materialTypes: kinds.size,
            meshes,
            instanced,
          });
        }
      });
    });
  });
  console.log(`${label.padEnd(16)} ${info ? JSON.stringify(info) : 'no renderer hook'}`);
  return info;
}

const bands = ['the planet', 'the system', 'the neighbourhood', 'the galaxies', 'everything else'];
for (let zoom = 0; zoom < bands.length; zoom++) {
  await measure(`zoom ${zoom} ${bands[zoom].slice(0, 6)}`, async () => {
    await page.evaluate((z) => window.__tcBus.useUiBus.getState().setZoom(z), zoom);
  });
}

await measure('flight-entry', async () => {
  await page.evaluate(() => window.__tcBus.useUiBus.getState().setZoom(0));
  await page.evaluate(() => window.__tcFlight.enter());
});
await measure('flight-warm', null);

await browser.close();
