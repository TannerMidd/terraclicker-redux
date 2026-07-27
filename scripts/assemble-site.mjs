/**
 * Assemble the published site from its two halves:
 *
 *   site/          ← landing/          the marketing page (hand-written, no build)
 *   site/play/     ← dist/             the game (vite build; base is './' so it
 *                                      doesn't care what path it is served from)
 *
 * Fonts and the DON'T PANIC mark are copied in from node_modules and public/ so
 * landing/ holds only text and the shots it ships.
 *
 * Usage: node scripts/assemble-site.mjs        (expects dist/ to exist)
 *
 * This is the single definition of the site layout — both `npm run deploy` and
 * the Pages workflow go through here, so they cannot drift apart.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const landing = path.join(root, 'landing');
const dist = path.join(root, 'dist');
const site = path.join(root, 'site');

const FONTS = [
  '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
];
const EXTRAS = [['public/assets/brand/dont-panic.svg', 'assets/dont-panic.svg']];

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html missing — run `npm run build` first.');
  process.exit(1);
}

fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });

fs.cpSync(landing, site, { recursive: true });
fs.cpSync(dist, path.join(site, 'play'), { recursive: true });

fs.mkdirSync(path.join(site, 'fonts'), { recursive: true });
for (const rel of FONTS) {
  const from = path.join(root, 'node_modules', rel);
  if (!fs.existsSync(from)) {
    console.error(`Missing font ${rel} — run \`npm install\`.`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(site, 'fonts', path.basename(from)));
}

for (const [from, to] of EXTRAS) {
  const target = path.join(site, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, from), target);
}

// Pages would otherwise run Jekyll over this and eat anything starting with _.
fs.writeFileSync(path.join(site, '.nojekyll'), '');

const bytes = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .reduce((sum, e) => sum + fs.statSync(path.join(e.parentPath ?? e.path, e.name)).size, 0);

console.log(
  `site/ assembled — landing ${(bytes(site) - bytes(path.join(site, 'play')) >> 10).toLocaleString()}K, ` +
    `game ${(bytes(path.join(site, 'play')) >> 10).toLocaleString()}K`,
);
console.log('  /            landing page');
console.log('  /play/       the game');
