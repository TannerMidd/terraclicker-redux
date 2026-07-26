/**
 * Request a GitHub Pages deployment for source that is already committed
 * and pushed. package.json builds dist/ before this script runs, providing
 * a local release check without ever replacing the repository with artifacts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = 'TannerMidd/terraclicker-redux';
const LIVE = 'https://tannermidd.github.io/terraclicker-redux/';
const root = process.cwd();
const dist = path.join(root, 'dist');

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  fail('dist/index.html missing — run npm run build first (or use npm run deploy).');
}

if (git('status', '--porcelain')) {
  fail('Refusing to deploy a dirty source tree. Commit and push the source first.');
}

let upstream;
try {
  upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
} catch {
  fail('No upstream branch. Push the source with tracking before deploying.');
}

const slash = upstream.indexOf('/');
if (slash < 1) fail('Could not resolve the upstream branch.');
const remote = upstream.slice(0, slash);
const branch = upstream.slice(slash + 1);

execFileSync('git', ['fetch', '--quiet', remote, branch], { cwd: root, stdio: 'inherit' });
const localHead = git('rev-parse', 'HEAD');
const remoteHead = git('rev-parse', upstream);
if (localHead !== remoteHead) {
  fail('Local HEAD is not the pushed upstream revision. Push the source first.');
}

execFileSync(
  'gh',
  ['workflow', 'run', 'deploy.yml', '--repo', REPO, '--ref', branch],
  { cwd: root, stdio: 'inherit' },
);

console.log('Deployment requested for ' + localHead.slice(0, 12) + '.');
console.log('Live at: ' + LIVE);
