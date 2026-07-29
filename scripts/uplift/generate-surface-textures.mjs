/**
 * Deterministic shared atlases for the Blender-authored surface-world kits.
 *
 * Kept separate from generate-images.mjs so the model pack can be rebuilt and
 * reviewed in isolation.  The PNG masters are committed under
 * assets-source/uplift/generated; runtime files are Basis KTX2.
 *
 *   node scripts/uplift/generate-surface-textures.mjs
 *   UPLIFT_FORCE=1 node scripts/uplift/generate-surface-textures.mjs
 */
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATED_ROOT,
  PUBLIC_ROOT,
  TMP_ROOT,
  encodeKtx,
  ensureDir,
  hash32,
  magick,
  mulberry,
  renderSvg,
  validateKtx,
} from './helpers.mjs';

const SPECS = [
  {
    id: 'landmark-atlas',
    colors: ['#575753', '#77746D', '#99978E', '#303337', '#AFC9D7', '#675047'],
    roughness: '76%,96%',
    relief: 12,
  },
  {
    id: 'deposit-atlas',
    colors: ['#262B31', '#6ACFE2', '#98654D', '#D0C4A5', '#D1B644', '#5A9C70'],
    roughness: '52%,92%',
    relief: 18,
  },
  {
    id: 'biome-clutter-atlas',
    colors: ['#34383A', '#8C744E', '#B4D6E4', '#3D7651', '#604039', '#A9A18D'],
    roughness: '68%,96%',
    relief: 15,
  },
  {
    id: 'settlement-dressing-atlas',
    colors: ['#171D26', '#717D87', '#D0CDC2', '#D2AA45', '#50C8D7', '#6B5548'],
    roughness: '45%,88%',
    relief: 10,
    panels: true,
  },
  {
    id: 'ecology-atlas',
    colors: ['#29362E', '#4F956A', '#A8CC91', '#CFC5AC', '#6F8D9B', '#BD613C'],
    roughness: '58%,93%',
    relief: 14,
    organic: true,
  },
  {
    id: 'weather-atlas',
    colors: ['#26303A', '#778691', '#E5EDF1', '#AF633B', '#426B7B', '#D1AA46'],
    roughness: '34%,90%',
    relief: 9,
    streaks: true,
  },
];

function svgRoot(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${body}
</svg>`;
}

function atlasSvg(spec, size = 1024) {
  const random = mulberry(hash32(spec.id));
  const base = spec.colors[0];
  const content = [
    '<defs>',
    '  <filter id="soft"><feGaussianBlur stdDeviation="1.4"/></filter>',
    '</defs>',
    `<rect width="${size}" height="${size}" fill="${base}"/>`,
  ];

  // Vertex colours carry each model's palette. The atlas supplies continuous
  // fine material variation instead of large colour cells, so box-projected
  // UVs cannot turn an asset into a checkerboard.
  const featureCount = spec.panels ? 72 : spec.organic ? 150 : 118;
  for (let i = 0; i < featureCount; i++) {
    const cx = random() * size;
    const cy = random() * size;
    const rx = size * (0.006 + random() * (spec.panels ? 0.055 : 0.085));
    const ry = size * (0.004 + random() * (spec.streaks ? 0.11 : 0.052));
    const color = spec.colors[1 + (i % Math.max(1, spec.colors.length - 1))];
    const opacity = (0.035 + random() * 0.115).toFixed(3);
    if (spec.panels) {
      content.push(`<rect x="${(cx - rx).toFixed(1)}" y="${(cy - ry).toFixed(1)}" width="${(rx * 2).toFixed(1)}" height="${(ry * 2).toFixed(1)}" rx="${(2 + random() * 6).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(1 + random() * 2.6).toFixed(1)}" opacity="${opacity}"/>`);
    } else if (spec.organic) {
      content.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${color}" opacity="${opacity}" transform="rotate(${(random() * 180).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`);
    } else {
      const points = Array.from({ length: 6 }, (_, point) => {
        const angle = point * Math.PI / 3;
        const scale = 0.68 + random() * 0.45;
        return `${(cx + Math.cos(angle) * rx * scale).toFixed(1)},${(cy + Math.sin(angle) * ry * scale).toFixed(1)}`;
      }).join(' ');
      content.push(`<polygon points="${points}" fill="${color}" opacity="${opacity}"/>`);
    }
  }

  if (spec.panels) {
    for (let x = 96; x < size; x += 128) {
      const offset = (random() - 0.5) * 26;
      content.push(`<path d="M ${(x + offset).toFixed(1)} 0 V ${size}" stroke="#101820" stroke-width="${(1.2 + random() * 2).toFixed(1)}" opacity=".15"/>`);
    }
    for (let y = 112; y < size; y += 144) {
      const offset = (random() - 0.5) * 28;
      content.push(`<path d="M 0 ${(y + offset).toFixed(1)} H ${size}" stroke="#101820" stroke-width="${(1.2 + random() * 2).toFixed(1)}" opacity=".13"/>`);
    }
  }
  if (spec.streaks) {
    for (let i = 0; i < 34; i++) {
      const sx = random() * size;
      const sy = random() * size;
      content.push(`<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} q ${(random() * 28 - 14).toFixed(1)} ${(size * 0.08).toFixed(1)} ${(random() * 34 - 17).toFixed(1)} ${(size * 0.18).toFixed(1)}" fill="none" stroke="${spec.colors[(i + 2) % spec.colors.length]}" stroke-width="${(1.2 + random() * 3).toFixed(1)}" opacity=".12"/>`);
    }
  }
  return svgRoot(size, size, content.join('\n'));
}

function deriveNormalRma(albedo, output, spec) {
  const stem = basename(output).replace(/\.[^.]+$/, '');
  const work = ensureDir(resolve(TMP_ROOT, 'surface-textures'));
  const height = resolve(work, `${stem}-height.png`);
  const gx = resolve(work, `${stem}-gx.png`);
  const gy = resolve(work, `${stem}-gy.png`);
  const roughness = resolve(work, `${stem}-roughness.png`);
  const ao = resolve(work, `${stem}-ao.png`);

  magick([albedo, '-colorspace', 'Gray', '-contrast-stretch', '1%x1%', height]);
  magick([
    height,
    '-bias', '50%',
    '-define', `convolve:scale=${spec.relief}%!`,
    '-morphology', 'Convolve', '3x3:-1,0,1,-2,0,2,-1,0,1',
    '-level', '12%,88%',
    gx,
  ]);
  magick([
    height,
    '-bias', '50%',
    '-define', `convolve:scale=${spec.relief}%!`,
    '-morphology', 'Convolve', '3x3:-1,-2,-1,0,0,0,1,2,1',
    '-level', '12%,88%',
    gy,
  ]);
  magick([height, '-negate', '-level', spec.roughness, '-gamma', '1.15', roughness]);
  magick([height, '-blur', '0x6', '-level', '7%,94%', ao]);
  ensureDir(dirname(output));
  magick([gx, gy, roughness, ao, '-channel', 'RGBA', '-combine', '-colorspace', 'sRGB', output]);
  return output;
}

function build(spec) {
  const masterDir = ensureDir(resolve(GENERATED_ROOT, 'textures', 'surface'));
  const publicDir = ensureDir(resolve(PUBLIC_ROOT, 'textures', 'surface'));
  const albedoPng = resolve(masterDir, `${spec.id}.png`);
  const normalPng = resolve(masterDir, `${spec.id}-normal-rma.png`);
  const albedoKtx = resolve(publicDir, `${spec.id}.ktx2`);
  const normalKtx = resolve(publicDir, `${spec.id}-normal-rma.ktx2`);

  renderSvg(atlasSvg(spec), albedoPng, 1024, 1024);
  deriveNormalRma(albedoPng, normalPng, spec);
  encodeKtx({
    output: albedoKtx,
    inputs: [albedoPng],
    srgb: true,
    quality: 'etc1s',
    qlevel: 180,
  });
  encodeKtx({
    output: normalKtx,
    inputs: [normalPng],
    srgb: false,
    normal: true,
    quality: 'uastc',
  });
  validateKtx(albedoKtx);
  validateKtx(normalKtx);
  return [albedoKtx, normalKtx];
}

export function generateSurfaceTextures() {
  const outputs = SPECS.flatMap(build);
  console.log(`Generated and validated ${outputs.length} surface KTX2 textures:`);
  for (const output of outputs) console.log(`  ${output}`);
  return outputs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateSurfaceTextures();
}
