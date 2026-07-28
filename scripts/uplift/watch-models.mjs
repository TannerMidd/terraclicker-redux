/**
 * Leave this running and assets-source/uplift/models/ becomes a drop target:
 * save a .blend there (or export a .glb into it, or paste a download) and it
 * is normalized, verified, shipped, and added to the game's prefetch manifest
 * a moment later. Save again, it rebuilds. Delete it, the manifest forgets it.
 *
 *   npm run assets:watch
 *
 * Each burst of file events is debounced (Blender saves in chunks) and builds
 * run one at a time through build-ship.mjs, so output reads like the build you
 * would have run by hand — because it is exactly that build.
 */
import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './helpers.mjs';
import {
  MODEL_EXTENSIONS,
  MODELS_ROOT,
  discoverImports,
  importId,
  writeImportsManifest,
} from './imports.mjs';

const BUILD = resolve(ROOT, 'scripts', 'uplift', 'build-ship.mjs');
const DEBOUNCE_MS = 600;

const pending = new Set();
let timer = null;
let running = false;
let rerun = false;

function schedule(id) {
  if (id) pending.add(id);
  clearTimeout(timer);
  timer = setTimeout(run, DEBOUNCE_MS);
}

function run() {
  if (running) {
    rerun = true; // a save landed mid-build; go again when it finishes
    return;
  }
  const imports = discoverImports();
  const known = new Set(imports.map((a) => a.id));
  const ids = [...pending].filter((id) => known.has(id));
  pending.clear();
  if (ids.length === 0) {
    // Nothing to build — but a deletion still has to leave the manifest true.
    if (writeImportsManifest(imports)) console.log('[watch] model removed — manifest updated');
    return;
  }
  running = true;
  console.log(`[watch] importing: ${ids.join(', ')}`);
  const child = spawn(process.execPath, [BUILD, ...ids], { stdio: 'inherit' });
  child.on('close', (code) => {
    console.log(code === 0
      ? '[watch] OK — waiting for the next save'
      : `[watch] FAILED (exit ${code}) — fix the model or its .import.json and save again`);
    running = false;
    if (rerun || pending.size) {
      rerun = false;
      schedule();
    }
  });
}

const startup = discoverImports();
console.log(`[watch] ${MODELS_ROOT}`);
console.log(`[watch] ${startup.length} import(s) known${startup.length ? `: ${startup.map((a) => a.id).join(', ')}` : ''}`);
console.log('[watch] drop a .glb/.gltf/.blend (or edit a .import.json) to import it; Ctrl+C to stop');
for (const asset of startup) schedule(asset.id); // catch up on anything dropped while not watching

watch(MODELS_ROOT, (_event, filename) => {
  if (!filename) return schedule(null); // platform gave no name: refresh the manifest at least
  const name = String(filename);
  if (MODEL_EXTENSIONS.test(name)) {
    // A deletion arrives as the same event; existence decides build vs forget.
    return schedule(existsSync(resolve(MODELS_ROOT, name)) ? importId(name) : null);
  }
  if (/\.import\.json$/i.test(name)) {
    return schedule(importId(name.replace(/\.import\.json$/i, '.glb')));
  }
});
