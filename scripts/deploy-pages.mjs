/**
 * Deploy = push main and prove it went live.
 *
 * Pages builds FROM SOURCE via .github/workflows/deploy.yml (workflow mode);
 * there is no build-output branch any more — `main` is the source of truth
 * and the only branch. This script exists so `npm run deploy` still means
 * "make it live and verify it", not "push and hope":
 *
 *   1. refuse to deploy a dirty tree or a branch that is not main
 *   2. push
 *   3. watch the workflow run to completion
 *   4. poll the live game until it serves the same bundle hash `npm run
 *      site` just built locally — the proof the new build is what's live
 *
 * `npm run deploy` runs the local site build first, which catches build and
 * test errors before anything is pushed and provides the hash for step 4.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LIVE = 'https://tannermidd.github.io/terraclicker-redux/';
const root = process.cwd();
const sh = (cmd) => execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`On "${branch}" — deploys ship from main.`);
  process.exit(1);
}
if (sh('git status --porcelain') !== '') {
  console.error('Working tree is dirty — commit first; the workflow builds what is pushed.');
  process.exit(1);
}

// The hash the local build produced; the live site must serve the same one.
const assets = path.join(root, 'site', 'play', 'assets');
const localBundle = fs.existsSync(assets)
  ? fs.readdirSync(assets).find((f) => /^index-[\w-]+\.js$/.test(f))
  : null;
if (!localBundle) {
  console.error('site/ not assembled — use `npm run deploy` (build → assemble → push → verify).');
  process.exit(1);
}

console.log(`Pushing main (${sh('git rev-parse --short HEAD')})…`);
execSync('git push origin main', { cwd: root, stdio: 'inherit' });

console.log('Waiting for the Pages workflow…');
const deadline = Date.now() + 8 * 60_000;
let runOk = false;
while (Date.now() < deadline) {
  let status = '';
  try {
    status = sh('gh run list --workflow "Deploy to GitHub Pages" --branch main --limit 1 --json status,conclusion --jq ".[0].status + \\":\\" + (.[0].conclusion // \\"\\")"');
  } catch {
    /* transient API hiccup — keep polling */
  }
  if (status.startsWith('completed:')) {
    if (status === 'completed:success') { runOk = true; break; }
    console.error(`Workflow finished: ${status.split(':')[1]} — see \`gh run view\`.`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 8000));
}
if (!runOk) {
  console.error('Workflow did not complete in time — check `gh run list`.');
  process.exit(1);
}

console.log(`Workflow green. Verifying ${LIVE}play/ serves ${localBundle}…`);
const liveDeadline = Date.now() + 4 * 60_000;
let liveOk = false;
while (Date.now() < liveDeadline) {
  try {
    const html = await (await fetch(`${LIVE}play/?v=${Date.now()}`)).text();
    if (html.includes(localBundle)) { liveOk = true; break; }
  } catch {
    /* CDN warming up */
  }
  await new Promise((r) => setTimeout(r, 6000));
}
if (!liveOk) {
  console.error(`Live page never served ${localBundle} — the CDN may lag; re-check manually.`);
  process.exit(1);
}
console.log(`\nLive and verified: ${LIVE} (landing) · ${LIVE}play/ (game) · bundle ${localBundle}`);
