import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SOURCE_ROOT = resolve(ROOT, 'assets-source', 'uplift');
export const GENERATED_ROOT = resolve(SOURCE_ROOT, 'generated');
export const PUBLIC_ROOT = resolve(ROOT, 'public', 'assets', 'uplift');
export const TMP_ROOT = resolve(ROOT, '.runtime', 'uplift-assets');

export const MAGICK = process.env.MAGICK_BIN || 'magick';
export const TOKTX = process.env.TOKTX_BIN
  || resolve(ROOT, '.runtime', 'ktx', 'bin', 'toktx.exe');
export const KTX_VALIDATE = process.env.KTX_VALIDATE_BIN
  || resolve(ROOT, '.runtime', 'ktx', 'bin', 'ktx.exe');

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function assertWithin(parent, target) {
  const parentAbs = resolve(parent);
  const targetAbs = resolve(target);
  const rel = relative(parentAbs, targetAbs);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return targetAbs;
  throw new Error(`Refusing to operate outside ${parentAbs}: ${targetAbs}`);
}

export function resetDir(path, allowedParent = ROOT) {
  const safe = assertWithin(allowedParent, path);
  if (existsSync(safe)) rmSync(safe, { recursive: true, force: true });
  mkdirSync(safe, { recursive: true });
  return safe;
}

export function writeText(path, text) {
  ensureDir(dirname(path));
  writeFileSync(path, text, 'utf8');
}

export function run(bin, args, options = {}) {
  return execFileSync(bin, args, {
    cwd: options.cwd || ROOT,
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || 'pipe',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function magick(args) {
  return run(MAGICK, args);
}

export function hash32(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry(seed) {
  let x = seed >>> 0;
  return () => {
    x |= 0;
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function svgEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderSvg(svg, output, width, height, extra = []) {
  const stem = `svg-${hash32(output).toString(16)}`;
  const src = resolve(TMP_ROOT, `${stem}.svg`);
  writeText(src, svg);
  ensureDir(dirname(output));
  magick([
    '-background', 'none',
    '-density', '192',
    src,
    '-resize', `${width}x${height}!`,
    ...extra,
    output,
  ]);
  return output;
}

export function encodeKtx({
  output,
  inputs,
  layers,
  srgb = false,
  alpha = false,
  normal = false,
  quality = 'etc1s',
  qlevel,
  mipmaps = true,
}) {
  if (existsSync(output) && statSync(output).size > 0 && process.env.UPLIFT_FORCE !== '1') return output;
  if (!existsSync(TOKTX)) {
    throw new Error(
      `toktx was not found at ${TOKTX}. Install Khronos KTX-Software or set TOKTX_BIN.`,
    );
  }
  ensureDir(dirname(output));
  const args = [
    '--t2',
    '--threads', '1',
    '--assign_oetf', srgb ? 'srgb' : 'linear',
    '--assign_primaries', 'srgb',
  ];
  if (mipmaps) args.push('--genmipmap', '--filter', 'lanczos4');
  if (layers) args.push('--layers', String(layers));
  if (quality === 'uastc') {
    args.push(
      '--encode', 'uastc',
      '--uastc_quality', '2',
      '--uastc_rdo_l', normal ? '0.45' : '0.75',
      '--uastc_rdo_m',
      '--zcmp', '15',
    );
  } else {
    args.push('--encode', 'etc1s', '--clevel', '2', '--qlevel', String(qlevel ?? (alpha ? 190 : 175)));
  }
  args.push(output, ...inputs);
  run(TOKTX, args);
  return output;
}

export function validateKtx(path) {
  if (!existsSync(KTX_VALIDATE)) return;
  run(KTX_VALIDATE, ['validate', path]);
}

export const PALETTE = {
  void: '#05060A',
  panel: '#0D1020',
  line: '#2A3350',
  ink: '#E9EEF9',
  dim: '#8C96AF',
  faint: '#5A6378',
  thermal: '#FF8A3D',
  atmo: '#5AD7E8',
  hydro: '#4D8DFF',
  bio: '#58D68A',
  gold: '#F5C84C',
  magrathea: '#B36BFF',
  vogon: '#8A8F5A',
};

export const PLANET_TYPES = [
  'terrestrial',
  'ice',
  'desert',
  'volcanic',
  'ocean',
  'gasgiant',
];

export const GROUND_LAYERS = ['lowland', 'upland', 'shore', 'peak'];

