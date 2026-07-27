/**
 * Publish the assembled site/ to the public playable-build repo (GitHub Pages).
 * Usage: npm run deploy  (builds + assembles first, then syncs, commits, pushes)
 *
 * site/ is the landing page at the root with the game under /play/ — see
 * scripts/assemble-site.mjs, which owns that layout.
 *
 * Keeps a shallow working clone in .deploy-pages/ (gitignored). Only build
 * output ships — the source tree never leaves this machine.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'https://github.com/TannerMidd/terraclicker-redux.git';
const LIVE = 'https://tannermidd.github.io/terraclicker-redux/';
const root = process.cwd();
const site = path.join(root, 'site');
const work = path.join(root, '.deploy-pages');
const run = (cmd, cwd = work) => execSync(cmd, { cwd, stdio: 'inherit' });

if (!fs.existsSync(path.join(site, 'play', 'index.html'))) {
  console.error('site/ not assembled — use `npm run deploy` (build → assemble → push).');
  process.exit(1);
}

if (!fs.existsSync(work)) run(`git clone --depth 1 "${REPO}" "${work}"`, root);
else run('git pull --ff-only');

// Wipe everything except the repo plumbing and the README, then lay in site/.
for (const entry of fs.readdirSync(work)) {
  if (entry === '.git' || entry === 'README.md') continue;
  fs.rmSync(path.join(work, entry), { recursive: true, force: true });
}
fs.cpSync(site, work, { recursive: true });

run('git add -A');
const staged = execSync('git diff --cached --quiet || echo dirty', { cwd: work }).toString();
if (!staged.includes('dirty')) {
  console.log('Nothing changed — the universe is already up to date.');
} else {
  run(`git commit -m "Deploy build ${new Date().toISOString().slice(0, 16)}Z"`);
  run('git push');
}
console.log(`\nLive at: ${LIVE} (landing) and ${LIVE}play/ (game)`);
console.log('Pages usually refreshes within a minute.');
