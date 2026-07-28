import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  GENERATED_ROOT,
  GROUND_LAYERS,
  PALETTE,
  PLANET_TYPES,
  PUBLIC_ROOT,
  ROOT,
  SOURCE_ROOT,
  TMP_ROOT,
  encodeKtx,
  ensureDir,
  hash32,
  magick,
  mulberry,
  renderSvg,
  svgEscape,
  validateKtx,
  writeText,
} from './helpers.mjs';

const PLANET_PALETTES = {
  terrestrial: ['#6D6046', '#55492F', '#A89570', '#8D8574', '#3F9E58', '#E8F0F8'],
  ice: ['#8FA6BA', '#BCCDDC', '#557188', '#E8F0F8', '#3F8F6A', '#E8F2FB'],
  desert: ['#B08A4A', '#8A5F34', '#D7B978', '#6B4526', '#5A9E4F', '#F2E9D8'],
  volcanic: ['#2E2422', '#4D3A34', '#16100F', '#201A1A', '#4D7D45', '#D8D2CE'],
  ocean: ['#7D9459', '#5F7A46', '#C8C9A5', '#A4B482', '#3D9E5F', '#E4EEF6'],
  gasgiant: ['#8F6BA4', '#B488A0', '#6B4680', '#D4B4C4', '#5FAE8A', '#E8E2F2'],
};

const REFITS = [
  ['sensors', 'Sensor Array', PALETTE.atmo],
  ['analysis', 'Analysis Suite', PALETTE.hydro],
  ['thrusters', 'Thrust Nacelles', PALETTE.thermal],
  ['drive', 'Improbability Drive', PALETTE.magrathea],
  ['cargoHold', 'Cargo Hold', PALETTE.gold],
  ['rigBay', 'Rig Bay', '#B58B5A'],
  ['deterrent', 'Dispersal Field', PALETTE.magrathea],
  ['skimmer', 'Survey Skimmer', PALETTE.bio],
  ['atmo', 'Atmospheric Handling Package', PALETTE.atmo],
  ['fieldKit', 'Field Survey Kit', PALETTE.hydro],
];

const CERTS = [
  ['mobility', 'Mobility', PALETTE.thermal],
  ['survey', 'Survey', PALETTE.atmo],
  ['geology', 'Geology', PALETTE.gold],
  ['liaison', 'Liaison', PALETTE.bio],
];

const MARKS = [
  ['beacon', PALETTE.thermal],
  ['station', PALETTE.atmo],
  ['shelter', PALETTE.bio],
  ['repair', PALETTE.gold],
  ['prospect', PALETTE.magrathea],
];

const SPECIES = [
  'meadow-drifter',
  'sky-wisp',
  'glass-shoal',
  'dune-skink',
  'tumbleweave',
  'firn-burrower',
  'aurora-moth',
  'cinder-wren',
  'vent-lace',
  'grazer-ring',
  'nesting-colony',
  'spore-bloom',
  'tide-chorus',
  'brine-garden',
  'ember-swarm',
  'settlement-swift',
  'verge-lichen',
];

const SAMPLES = [
  'improbability-crystal',
  'fossil-atmosphere',
  'living-basalt',
  'cryogenic-brine',
  'tidal-glass',
  'vent-sulphur',
  'ferrous-drift',
  'polar-firn',
  'glacier-core',
  'reef-chalk',
  'biotite-loam',
  'ridge-quartz',
  'field-crystal',
];

const LANDMARKS = [
  'standing-ring',
  'stone-arch',
  'perched-boulder',
  'hoodoo-court',
  'ice-organ',
  'pressure-ridge',
  'basalt-choir',
  'cinder-cone',
  'fumarole-field',
  'sea-stacks',
  'tide-arch',
  'blowhole',
  'award-fjords',
];

function attrPairs(attrs) {
  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${svgEscape(value)}"`)
    .join(' ');
}

function svgRoot(width, height, content, attrs = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${attrPairs(attrs)}>
${content}
</svg>`;
}

function patternedSvg({
  width,
  height,
  colors,
  seed,
  alpha = false,
  cells = 8,
  line = PALETTE.line,
}) {
  const r = mulberry(seed);
  const bg = alpha ? 'none' : colors[0];
  const shapes = [];
  const cellW = width / cells;
  const cellH = height / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const cx = (x + 0.5 + (r() - 0.5) * 0.35) * cellW;
      const cy = (y + 0.5 + (r() - 0.5) * 0.35) * cellH;
      const rx = cellW * (0.18 + r() * 0.32);
      const ry = cellH * (0.12 + r() * 0.28);
      const color = colors[1 + ((x + y + Math.floor(r() * 7)) % Math.max(1, colors.length - 1))] || colors[0];
      const opacity = alpha ? 0.28 + r() * 0.68 : 0.12 + r() * 0.24;
      if (r() < 0.55) {
        shapes.push(`<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(2)}" transform="rotate(${(r() * 180).toFixed(1)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`);
      } else {
        const points = Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          const k = 0.7 + r() * 0.45;
          return `${(cx + Math.cos(a) * rx * k).toFixed(2)},${(cy + Math.sin(a) * ry * k).toFixed(2)}`;
        }).join(' ');
        shapes.push(`<polygon points="${points}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`);
      }
    }
  }
  for (let i = 0; i < cells * 2; i++) {
    const x1 = r() * width;
    const y1 = r() * height;
    const x2 = x1 + (r() - 0.5) * width * 0.18;
    const y2 = y1 + (r() - 0.5) * height * 0.18;
    shapes.push(`<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${((x1 + x2) / 2 + (r() - 0.5) * 24).toFixed(1)} ${((y1 + y2) / 2 + (r() - 0.5) * 24).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${line}" stroke-width="${Math.max(1, width / 1024).toFixed(1)}" opacity="${alpha ? 0.55 : 0.18}"/>`);
  }
  return svgRoot(width, height, `<rect width="${width}" height="${height}" fill="${bg}"/>
${shapes.join('\n')}`);
}

function renderPattern(output, options, width = 2048, height = 2048) {
  return renderSvg(
    patternedSvg({ width, height, ...options }),
    output,
    width,
    height,
  );
}

function imageSize(path) {
  const value = magick(['identify', '-format', '%w %h', path]).trim();
  const [width, height] = value.split(/\s+/).map(Number);
  return { width, height };
}

function makeMirroredTile(source, layerIndex, output, size = 2048) {
  const { width, height } = imageSize(source);
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  const x = layerIndex % 2 === 0 ? 0 : w;
  const y = layerIndex < 2 ? 0 : h;
  const stem = basename(output).replace(/\.[^.]+$/, '');
  const crop = resolve(TMP_ROOT, `${stem}-crop.png`);
  const flip = resolve(TMP_ROOT, `${stem}-flip.png`);
  const row = resolve(TMP_ROOT, `${stem}-row.png`);
  const rowFlip = resolve(TMP_ROOT, `${stem}-row-flip.png`);
  ensureDir(dirname(output));
  magick([source, '-crop', `${w}x${h}+${x}+${y}`, '+repage', crop]);
  magick([crop, '-flop', flip]);
  magick([crop, flip, '+append', row]);
  magick([row, '-flip', rowFlip]);
  magick([
    row,
    rowFlip,
    '-append',
    '-filter', 'Lanczos',
    '-resize', `${size}x${size}!`,
    '-colorspace', 'sRGB',
    '-strip',
    output,
  ]);
  return output;
}

function derivePackedNormalRma(albedo, output) {
  const stem = basename(output).replace(/\.[^.]+$/, '');
  const height = resolve(TMP_ROOT, `${stem}-height.png`);
  const gx = resolve(TMP_ROOT, `${stem}-gx.png`);
  const gy = resolve(TMP_ROOT, `${stem}-gy.png`);
  const rough = resolve(TMP_ROOT, `${stem}-rough.png`);
  const ao = resolve(TMP_ROOT, `${stem}-ao.png`);
  magick([albedo, '-colorspace', 'Gray', '-contrast-stretch', '1%x1%', height]);
  magick([
    height,
    '-bias', '50%',
    '-define', 'convolve:scale=18%!',
    '-morphology', 'Convolve', '3x3:-1,0,1,-2,0,2,-1,0,1',
    '-level', '10%,90%',
    gx,
  ]);
  magick([
    height,
    '-bias', '50%',
    '-define', 'convolve:scale=18%!',
    '-morphology', 'Convolve', '3x3:-1,-2,-1,0,0,0,1,2,1',
    '-level', '10%,90%',
    gy,
  ]);
  magick([height, '-negate', '-level', '8%,92%', '-gamma', '1.35', rough]);
  magick([height, '-blur', '0x5', '-level', '4%,96%', ao]);
  ensureDir(dirname(output));
  magick([gx, gy, rough, ao, '-channel', 'RGBA', '-combine', '-colorspace', 'sRGB', output]);
  return output;
}

function deriveDetailNormal(albedo, output) {
  const stem = basename(output).replace(/\.[^.]+$/, '');
  const gray = resolve(TMP_ROOT, `${stem}-gray.png`);
  magick([
    albedo,
    '-resize', '1024x1024!',
    '-colorspace', 'Gray',
    '-blur', '0x0.6',
    '-contrast-stretch', '2%x2%',
    gray,
  ]);
  magick([
    gray,
    '-bias', '50%',
    '-define', 'convolve:scale=14%!',
    '-morphology', 'Convolve', '3x3:-1,0,1,-2,0,2,-1,0,1',
    '-level', '12%,88%',
    output,
  ]);
  return output;
}

function deriveMacroMottle(albedo, output) {
  magick([
    albedo,
    '-colorspace', 'Gray',
    '-blur', '0x42',
    '-contrast-stretch', '4%x4%',
    '-gamma', '1.25',
    output,
  ]);
  return output;
}

function generateGroundTextures() {
  const albedoInputs = [];
  const packedInputs = [];
  const detailInputs = [];
  const macroInputs = [];
  const prompts = [];
  for (const type of PLANET_TYPES) {
    const source = resolve(SOURCE_ROOT, 'ground', `${type}-atlas-source.png`);
    if (!existsSync(source)) throw new Error(`Missing image-generated ground master: ${source}`);
    PLANET_PALETTES[type].slice(0, 4).forEach((color, i) => {
      const layer = GROUND_LAYERS[i];
      const dir = ensureDir(resolve(GENERATED_ROOT, 'textures', 'ground', type));
      const albedo = resolve(dir, `${layer}-albedo.png`);
      const packed = resolve(dir, `${layer}-normal-rma.png`);
      if (!existsSync(albedo)) makeMirroredTile(source, i, albedo, 2048);
      if (!existsSync(packed)) derivePackedNormalRma(albedo, packed);
      albedoInputs.push(albedo);
      packedInputs.push(packed);
      prompts.push({ type, layer, color, source: source.replace(`${ROOT}\\`, '') });
    });
    const detail = resolve(GENERATED_ROOT, 'textures', 'ground', 'detail', `${type}-detail-normal.png`);
    const macro = resolve(GENERATED_ROOT, 'textures', 'ground', 'detail', `${type}-macro-mottle.png`);
    ensureDir(dirname(detail));
    if (!existsSync(detail)) deriveDetailNormal(albedoInputs[albedoInputs.length - 4], detail);
    if (!existsSync(macro)) deriveMacroMottle(albedoInputs[albedoInputs.length - 3], macro);
    detailInputs.push(detail);
    macroInputs.push(macro);
  }
  const outDir = ensureDir(resolve(PUBLIC_ROOT, 'textures', 'ground'));
  const outputs = [
    encodeKtx({
      output: resolve(outDir, 'ground-albedo-array.ktx2'),
      inputs: albedoInputs,
      layers: albedoInputs.length,
      srgb: true,
      quality: 'etc1s',
      qlevel: 25,
    }),
    encodeKtx({
      output: resolve(outDir, 'ground-normal-rma-array.ktx2'),
      inputs: packedInputs,
      layers: packedInputs.length,
      srgb: false,
      quality: 'etc1s',
      qlevel: 15,
    }),
    encodeKtx({
      output: resolve(outDir, 'detail-normal-array.ktx2'),
      inputs: detailInputs,
      layers: detailInputs.length,
      srgb: false,
      quality: 'etc1s',
    }),
    encodeKtx({
      output: resolve(outDir, 'macro-mottle-array.ktx2'),
      inputs: macroInputs,
      layers: macroInputs.length,
      srgb: false,
      quality: 'etc1s',
    }),
  ];
  return { outputs, prompts };
}

function concentricDecalsSvg(width, height) {
  const cell = width / 3;
  const names = ['scorch', 'seam-spoil', 'drill-spatter', 'footprint', 'landing-gear', 'blast-ring'];
  const content = [`<rect width="${width}" height="${height}" fill="none"/>`];
  names.forEach((name, i) => {
    const r = mulberry(hash32(name));
    const cx = (i % 3 + 0.5) * cell;
    const cy = (Math.floor(i / 3) + 0.5) * (height / 2);
    if (name === 'footprint') {
      content.push(`<path d="M ${cx - 45} ${cy + 55} q -28 -42 3 -98 q 35 36 13 100 z M ${cx + 42} ${cy - 40} q 24 -36 48 -3 q 3 51 -37 68 z" fill="${PALETTE.ink}" opacity=".8"/>`);
    } else if (name === 'landing-gear') {
      content.push(...[-1, 0, 1].map((k) => `<rect x="${cx + k * 62 - 20}" y="${cy - 58}" width="40" height="116" rx="18" fill="${PALETTE.ink}" opacity=".72" transform="rotate(${k * 18} ${cx + k * 62} ${cy})"/>`));
    } else {
      for (let n = 0; n < 4; n++) {
        content.push(`<ellipse cx="${cx + (r() - 0.5) * 30}" cy="${cy + (r() - 0.5) * 30}" rx="${(30 + n * 22 + r() * 20).toFixed(1)}" ry="${(24 + n * 20 + r() * 18).toFixed(1)}" fill="none" stroke="${i % 2 ? PALETTE.gold : PALETTE.ink}" stroke-width="${(5 + r() * 7).toFixed(1)}" opacity="${(0.75 - n * 0.12).toFixed(2)}" stroke-dasharray="${n % 2 ? '18 10' : 'none'}"/>`);
      }
      if (name.includes('spatter') || name.includes('spoil')) {
        for (let n = 0; n < 18; n++) {
          content.push(`<circle cx="${cx + (r() - 0.5) * 180}" cy="${cy + (r() - 0.5) * 150}" r="${2 + r() * 8}" fill="${PALETTE.ink}" opacity=".6"/>`);
        }
      }
    }
  });
  return svgRoot(width, height, content.join('\n'));
}

function generateGroundOverlays() {
  const masterDir = ensureDir(resolve(GENERATED_ROOT, 'textures', 'ground', 'overlays'));
  const publicDir = ensureDir(resolve(PUBLIC_ROOT, 'textures', 'ground'));
  const outputs = [];

  const shore = resolve(masterDir, 'shore-waterline.png');
  renderSvg(svgRoot(1024, 1024, `
    <defs>
      <linearGradient id="wet" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#172536"/><stop offset=".52" stop-color="#557188"/><stop offset="1" stop-color="#E9EEF9" stop-opacity="0"/></linearGradient>
      <pattern id="breaks" width="128" height="128" patternUnits="userSpaceOnUse"><path d="M -20 78 Q 22 42 64 78 T 148 78" fill="none" stroke="#E9EEF9" stroke-width="15" opacity=".72"/><path d="M -20 98 Q 24 68 64 98 T 148 98" fill="none" stroke="#5AD7E8" stroke-width="7" opacity=".48"/></pattern>
    </defs>
    <rect width="1024" height="1024" fill="url(#wet)"/>
    <rect width="1024" height="1024" fill="url(#breaks)"/>
  `), shore, 1024, 1024);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'shore-waterline.ktx2'), inputs: [shore], srgb: false, alpha: true, quality: 'uastc' }));

  const snowColor = resolve(masterDir, 'snow-frost.png');
  const snowNormal = resolve(masterDir, 'snow-frost-normal.png');
  renderPattern(snowColor, { colors: ['#E8F0F8', '#DCE7F0', '#FFFFFF'], seed: 0x5a0f, alpha: true, cells: 12 }, 1024, 1024);
  deriveDetailNormal(snowColor, snowNormal);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'snow-frost.ktx2'), inputs: [snowColor], srgb: true, alpha: true, quality: 'etc1s' }));
  outputs.push(encodeKtx({ output: resolve(publicDir, 'snow-frost-normal.ktx2'), inputs: [snowNormal], srgb: false, quality: 'etc1s' }));

  const lava = resolve(masterDir, 'lava-emissive-flow-crust.png');
  renderSvg(svgRoot(1024, 1024, `
    <rect width="1024" height="1024" fill="#201A1A"/>
    <g fill="none" stroke-linecap="round">
      <path d="M -40 160 C 210 20 340 310 570 128 S 840 66 1090 180" stroke="#FF4D1A" stroke-width="56"/>
      <path d="M -20 520 C 190 390 300 650 510 470 S 790 360 1060 560" stroke="#FF8A3D" stroke-width="42"/>
      <path d="M -30 860 C 150 720 420 980 610 775 S 870 710 1060 860" stroke="#F5C84C" stroke-width="24"/>
    </g>
    <g fill="#2E2422" stroke="#4D3A34" stroke-width="8">
      <path d="M 0 0 H 420 L 360 160 L 0 230 Z"/><path d="M 420 0 H 1024 V 135 L 710 160 Z"/>
      <path d="M 0 230 L 360 160 L 470 520 L 0 620 Z"/><path d="M 710 160 L 1024 135 V 520 L 470 520 Z"/>
      <path d="M 0 620 L 470 520 L 580 1024 H 0 Z"/><path d="M 470 520 L 1024 520 V 1024 H 580 Z"/>
    </g>
  `), lava, 1024, 1024);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'lava-emissive-flow-crust.ktx2'), inputs: [lava], srgb: false, alpha: true, quality: 'uastc' }));

  const decals = resolve(masterDir, 'ground-decals.png');
  renderSvg(concentricDecalsSvg(1024, 1024), decals, 1024, 1024);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'ground-decals.ktx2'), inputs: [decals], srgb: false, alpha: true, quality: 'uastc' }));
  return outputs;
}

function makeAtlasTexture(relative, colors, seed, options = {}) {
  const master = resolve(GENERATED_ROOT, 'textures', relative.replace(/\.ktx2$/, '.png'));
  const output = resolve(PUBLIC_ROOT, 'textures', relative);
  renderPattern(master, {
    colors,
    seed,
    alpha: options.alpha,
    cells: options.cells || 8,
  }, options.width || 2048, options.height || options.width || 2048);
  encodeKtx({
    output,
    inputs: [master],
    srgb: options.srgb ?? true,
    alpha: options.alpha,
    quality: options.quality || 'etc1s',
    mipmaps: options.mipmaps ?? true,
  });
  return output;
}

function generateObjectAtlases() {
  const outputs = [];
  const propSpecs = [
    ['props/rocks-atlas.ktx2', ['#5A6378', '#8D8574', '#BCCDDC', '#6B4526']],
    ['props/boulders-atlas.ktx2', ['#34343B', '#55492F', '#8FA6BA', '#4D3A34']],
    ['props/flora-atlas.ktx2', ['#17372B', '#3F9E58', '#5FAE8A', '#58D68A']],
    ['props/shrubs-atlas.ktx2', ['#1D3527', '#4D7D45', '#5A9E4F', '#3D9E5F']],
    ['props/shards-atlas.ktx2', ['#0D1020', PALETTE.atmo, PALETTE.hydro, PALETTE.magrathea]],
    ['props/vents-atlas.ktx2', ['#201A1A', '#4D3A34', '#8A5F34', PALETTE.thermal]],
  ];
  for (const [relative, colors] of propSpecs) outputs.push(makeAtlasTexture(relative, colors, hash32(relative)));
  outputs.push(makeAtlasTexture('settlements/settlement-atlas.ktx2', [PALETTE.panel, PALETTE.dim, '#CABFA8', '#37404A', PALETTE.gold], 0x5e771e));
  outputs.push(makeAtlasTexture('settlements/window-emissive.ktx2', ['#0D1020', '#FFC561', '#9DEBFF', '#FF8A3D'], 0x71ad0, { srgb: false, alpha: true, width: 1024, cells: 12, quality: 'uastc' }));
  outputs.push(makeAtlasTexture('facilities/facility-atlas.ktx2', [PALETTE.panel, PALETTE.dim, PALETTE.ink, PALETTE.atmo, PALETTE.gold], 0xfa6117));
  outputs.push(makeAtlasTexture('marks/mark-atlas.ktx2', [PALETTE.panel, PALETTE.dim, PALETTE.ink, PALETTE.gold, PALETTE.bio], 0x4a4b5));
  outputs.push(makeAtlasTexture('seams/crystal-seam.ktx2', [PALETTE.panel, PALETTE.atmo, PALETTE.gold, PALETTE.magrathea, PALETTE.ink], 0x5ea4));
  outputs.push(makeAtlasTexture('ships/runabout-pbr.ktx2', [PALETTE.panel, '#202535', PALETTE.dim, PALETTE.ink, PALETTE.gold], 0x5a1f));
  outputs.push(makeAtlasTexture('ships/runabout-emissive.ktx2', ['#000000', PALETTE.atmo, PALETTE.thermal, PALETTE.gold], 0xe41551, { srgb: false, alpha: true, quality: 'uastc' }));
  outputs.push(makeAtlasTexture('deep-field/deep-field-atlas.ktx2', [PALETTE.panel, PALETTE.dim, '#6B2B2B', PALETTE.vogon, PALETTE.gold, PALETTE.magrathea], 0xdee0f));
  return outputs;
}

function hullDecalSvg() {
  return svgRoot(1024, 1024, `
    <rect width="1024" height="1024" fill="none"/>
    <g fill="${PALETTE.ink}" stroke="${PALETTE.ink}" stroke-width="14">
      <path d="M 72 130 H 438 M 72 178 H 438"/>
      <path d="M 92 280 H 428" stroke="${PALETTE.gold}" stroke-dasharray="46 28" stroke-width="42"/>
      <circle cx="244" cy="480" r="122" fill="none" stroke="${PALETTE.atmo}" stroke-width="24"/>
      <path d="M 178 510 q 65 -110 132 0 q -66 86 -132 0z" fill="${PALETTE.atmo}" stroke="none"/>
      <path d="M 590 120 h 320 v 150 h-320z" fill="none"/>
      <path d="M 625 160 h 250 M 625 205 h 180" stroke-width="18"/>
      <g transform="translate(570 390)">
        <path d="M 0 0 h 360 v 62 h-360z" fill="${PALETTE.thermal}" stroke="none"/>
        <path d="M 0 94 h 360 v 62 h-360z" fill="${PALETTE.gold}" stroke="none"/>
        <path d="M 0 188 h 360 v 62 h-360z" fill="${PALETTE.atmo}" stroke="none"/>
      </g>
      <path d="M 620 760 q 80 -90 160 0 q -80 90 -160 0z" fill="none" stroke="${PALETTE.gold}" stroke-width="18"/>
    </g>
  `);
}

function generateShipExtras() {
  const outputs = [];
  const master = resolve(GENERATED_ROOT, 'textures', 'ships', 'hull-decals.png');
  renderSvg(hullDecalSvg(), master, 1024, 1024);
  const output = resolve(PUBLIC_ROOT, 'textures', 'ships', 'hull-decals.ktx2');
  outputs.push(encodeKtx({ output, inputs: [master], srgb: false, alpha: true, quality: 'uastc' }));
  return outputs;
}

function cloudSvg(kind, width, height, color, seed) {
  const r = mulberry(seed);
  const parts = [`<rect width="${width}" height="${height}" fill="none"/>`];
  const count = kind === 'cirrus' ? 26 : kind === 'dust' ? 38 : 48;
  for (let i = 0; i < count; i++) {
    const x = r() * width;
    const y = r() * height;
    const rx = kind === 'cirrus' ? 120 + r() * 260 : 48 + r() * 150;
    const ry = kind === 'cirrus' ? 8 + r() * 20 : 26 + r() * 80;
    parts.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${color}" opacity="${(0.1 + r() * 0.55).toFixed(2)}" transform="rotate(${(-25 + r() * 50).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
  }
  return svgRoot(width, height, parts.join('\n'));
}

function generateSkyTextures() {
  const outputs = [];
  const masterDir = ensureDir(resolve(GENERATED_ROOT, 'textures', 'sky'));
  const publicDir = ensureDir(resolve(PUBLIC_ROOT, 'textures', 'sky'));
  const clouds = [];
  const cloudDefs = [
    ['cirrus', PALETTE.ink],
    ['cumulus', '#DDEAF4'],
    ['storm', '#667184'],
    ['dust', '#C2945A'],
  ];
  cloudDefs.forEach(([kind, color], i) => {
    const path = resolve(masterDir, `cloud-${kind}.png`);
    renderSvg(cloudSvg(kind, 2048, 2048, color, hash32(kind)), path, 2048, 2048);
    clouds.push(path);
  });
  outputs.push(encodeKtx({ output: resolve(publicDir, 'cloud-deck-array.ktx2'), inputs: clouds, layers: 4, srgb: false, alpha: true, quality: 'etc1s' }));

  const flow = resolve(masterDir, 'cloud-flow.png');
  renderPattern(flow, { colors: ['#808080', '#3EA5D2', '#D25A8C'], seed: 0xc10d, cells: 18 }, 2048, 2048);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'cloud-flow.ktx2'), inputs: [flow], srgb: false, quality: 'etc1s' }));

  const weather = resolve(masterDir, 'weather-particles.png');
  renderSvg(svgRoot(1024, 1024, `
    <rect width="1024" height="1024" fill="none"/>
    <g stroke="${PALETTE.atmo}" stroke-linecap="round"><path d="M 110 70 l -62 250" stroke-width="18"/><path d="M 210 50 l -48 270" stroke-width="11"/></g>
    <g fill="none" stroke="${PALETTE.ink}" stroke-width="13" transform="translate(380 170)"><path d="M 0 -90 V 90 M -78 -45 L 78 45 M -78 45 L 78 -45"/><circle r="20" fill="${PALETTE.ink}"/></g>
    <g fill="#C2945A" opacity=".78">${Array.from({ length: 22 }, (_, i) => `<circle cx="${560 + (i % 6) * 58 + (i % 2) * 13}" cy="${70 + Math.floor(i / 6) * 62}" r="${8 + (i % 5) * 3}"/>`).join('')}</g>
    <g fill="${PALETTE.dim}"><path d="M 80 620 l 70 -88 l 55 105 l -64 64z"/><path d="M 285 650 l 58 -112 l 72 96 l -68 78z"/></g>
    <g fill="${PALETTE.thermal}">${Array.from({ length: 10 }, (_, i) => `<path d="M ${540 + i * 42} ${520 + (i % 3) * 34} q 30 42 0 92 q -30 -42 0 -92z"/>`).join('')}</g>
    <g stroke="${PALETTE.gold}" stroke-width="20" stroke-linecap="round"><path d="M 710 780 l 230 -190"/><path d="M 760 855 l 205 -125" opacity=".62"/></g>
  `), weather, 1024, 1024);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'weather-particles.ktx2'), inputs: [weather], srgb: false, alpha: true, quality: 'uastc' }));

  const luts = [];
  PLANET_TYPES.forEach((type, i) => {
    const colors = PLANET_PALETTES[type];
    const path = resolve(masterDir, `sky-lut-${type}.png`);
    renderSvg(svgRoot(256, 64, `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${PALETTE.void}"/><stop offset=".28" stop-color="${colors[1]}"/><stop offset=".56" stop-color="${colors[5]}"/><stop offset=".76" stop-color="${i === 3 ? PALETTE.thermal : PALETTE.gold}"/><stop offset="1" stop-color="${colors[0]}"/></linearGradient></defs><rect width="256" height="64" fill="url(#g)"/>`), path, 256, 64);
    luts.push(path);
  });
  outputs.push(encodeKtx({ output: resolve(publicDir, 'sky-gradient-luts.ktx2'), inputs: luts, layers: 6, srgb: true, quality: 'etc1s', mipmaps: false }));

  const starfield = resolve(masterDir, 'starfield-equirect.png');
  const stars = [];
  const sr = mulberry(0x57a4f13d);
  for (let i = 0; i < 1200; i++) {
    stars.push(`<circle cx="${(sr() * 4096).toFixed(1)}" cy="${(sr() * 2048).toFixed(1)}" r="${(0.8 + Math.pow(sr(), 5) * 4.8).toFixed(2)}" fill="${sr() < 0.08 ? PALETTE.atmo : PALETTE.ink}" opacity="${(0.45 + sr() * 0.55).toFixed(2)}"/>`);
  }
  renderSvg(svgRoot(4096, 2048, `<rect width="4096" height="2048" fill="${PALETTE.void}"/>${stars.join('\n')}`), starfield, 4096, 2048);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'starfield-equirect.ktx2'), inputs: [starfield], srgb: true, quality: 'etc1s' }));

  const nebula = resolve(masterDir, 'nebula-wash.png');
  renderSvg(svgRoot(4096, 2048, `
    <defs>
      <radialGradient id="n1"><stop stop-color="${PALETTE.magrathea}" stop-opacity=".28"/><stop offset="1" stop-color="${PALETTE.magrathea}" stop-opacity="0"/></radialGradient>
      <radialGradient id="n2"><stop stop-color="${PALETTE.atmo}" stop-opacity=".2"/><stop offset="1" stop-color="${PALETTE.atmo}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="4096" height="2048" fill="none"/>
    <ellipse cx="1180" cy="980" rx="1280" ry="420" fill="url(#n1)" transform="rotate(-18 1180 980)"/>
    <ellipse cx="3040" cy="1100" rx="1480" ry="520" fill="url(#n2)" transform="rotate(12 3040 1100)"/>
  `), nebula, 4096, 2048);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'nebula-wash.ktx2'), inputs: [nebula], srgb: true, alpha: true, quality: 'etc1s' }));

  const glare = resolve(masterDir, 'sun-glare.png');
  renderSvg(svgRoot(1024, 1024, `
    <defs>
      <radialGradient id="b"><stop stop-color="#fff" stop-opacity=".95"/><stop offset=".16" stop-color="${PALETTE.gold}" stop-opacity=".62"/><stop offset="1" stop-color="${PALETTE.gold}" stop-opacity="0"/></radialGradient>
      <linearGradient id="s"><stop stop-color="${PALETTE.atmo}" stop-opacity="0"/><stop offset=".5" stop-color="${PALETTE.ink}" stop-opacity=".82"/><stop offset="1" stop-color="${PALETTE.atmo}" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="none"/>
    <circle cx="256" cy="256" r="230" fill="url(#b)"/>
    <rect x="520" y="236" width="460" height="40" rx="20" fill="url(#s)"/>
    <g fill="none" stroke="${PALETTE.hydro}" stroke-width="18" opacity=".55"><circle cx="700" cy="700" r="110"/><circle cx="700" cy="700" r="55"/></g>
  `), glare, 1024, 1024);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'sun-glare.ktx2'), inputs: [glare], srgb: false, alpha: true, quality: 'uastc' }));

  const aurora = resolve(masterDir, 'aurora-bioluminescence-ramp.png');
  renderSvg(svgRoot(512, 32, `<defs><linearGradient id="a"><stop stop-color="${PALETTE.void}" stop-opacity="0"/><stop offset=".28" stop-color="${PALETTE.hydro}"/><stop offset=".58" stop-color="${PALETTE.bio}"/><stop offset=".82" stop-color="${PALETTE.atmo}"/><stop offset="1" stop-color="${PALETTE.magrathea}" stop-opacity="0"/></linearGradient></defs><rect width="512" height="32" fill="url(#a)"/>`), aurora, 512, 32);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'aurora-bioluminescence-ramp.ktx2'), inputs: [aurora], srgb: false, alpha: true, quality: 'uastc', mipmaps: false }));
  return outputs;
}

function planetMaskSvg(type, width, height, seed) {
  const r = mulberry(seed);
  const cloud = [];
  const city = [];
  const ice = [];
  for (let i = 0; i < 70; i++) {
    const x = r() * width;
    const y = r() * height;
    cloud.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(30 + r() * 130).toFixed(1)}" ry="${(8 + r() * 45).toFixed(1)}" fill="#ff0000" opacity="${(0.14 + r() * 0.62).toFixed(2)}"/>`);
  }
  for (let i = 0; i < 180; i++) {
    const x = r() * width;
    const y = height * (0.2 + r() * 0.6);
    city.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1 + r() * 5).toFixed(1)}" fill="#00ff00" opacity="${(0.3 + r() * 0.7).toFixed(2)}"/>`);
  }
  ice.push(`<rect width="${width}" height="${height * 0.12}" fill="#0000ff" opacity=".9"/><rect y="${height * 0.88}" width="${width}" height="${height * 0.12}" fill="#0000ff" opacity=".9"/>`);
  return svgRoot(width, height, `<rect width="${width}" height="${height}" fill="#000000"/>${cloud.join('')}${city.join('')}${ice.join('')}`);
}

function generateOrbitTextures() {
  const outputs = [];
  const masterDir = ensureDir(resolve(GENERATED_ROOT, 'textures', 'orbit'));
  const publicDir = ensureDir(resolve(PUBLIC_ROOT, 'textures', 'orbit'));
  const masks = [];
  PLANET_TYPES.forEach((type) => {
    const path = resolve(masterDir, `planet-detail-${type}.png`);
    renderSvg(planetMaskSvg(type, 2048, 1024, hash32(type)), path, 2048, 1024);
    masks.push(path);
  });
  outputs.push(encodeKtx({ output: resolve(publicDir, 'planet-detail-array.ktx2'), inputs: masks, layers: 6, srgb: false, quality: 'etc1s' }));

  const city = resolve(masterDir, 'city-lights.png');
  const cr = mulberry(0xc1711e);
  const roads = [];
  const nodes = [];
  for (let i = 0; i < 75; i++) {
    const x1 = cr() * 2048;
    const y1 = cr() * 2048;
    const x2 = x1 + (cr() - 0.5) * 460;
    const y2 = y1 + (cr() - 0.5) * 460;
    roads.push(`<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${((x1 + x2) / 2 + (cr() - 0.5) * 130).toFixed(1)} ${((y1 + y2) / 2 + (cr() - 0.5) * 130).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${PALETTE.gold}" stroke-width="${(1 + cr() * 4).toFixed(1)}" opacity=".5" fill="none"/>`);
    nodes.push(`<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="${(2 + cr() * 9).toFixed(1)}" fill="${cr() < 0.3 ? PALETTE.atmo : PALETTE.gold}" opacity="${(0.45 + cr() * 0.5).toFixed(2)}"/>`);
  }
  renderSvg(svgRoot(2048, 2048, `<rect width="2048" height="2048" fill="none"/>${roads.join('')}${nodes.join('')}`), city, 2048, 2048);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'city-lights.ktx2'), inputs: [city], srgb: false, alpha: true, quality: 'etc1s' }));

  const ring = resolve(masterDir, 'ring-dust.png');
  renderSvg(svgRoot(1024, 1024, `
    <defs><radialGradient id="r"><stop offset=".45" stop-color="${PALETTE.dim}" stop-opacity="0"/><stop offset=".57" stop-color="${PALETTE.ink}" stop-opacity=".7"/><stop offset=".64" stop-color="${PALETTE.gold}" stop-opacity=".35"/><stop offset=".78" stop-color="${PALETTE.dim}" stop-opacity=".55"/><stop offset=".9" stop-color="${PALETTE.dim}" stop-opacity="0"/></radialGradient></defs>
    <rect width="1024" height="1024" fill="url(#r)"/>
  `), ring, 1024, 1024);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'ring-dust.ktx2'), inputs: [ring], srgb: false, alpha: true, quality: 'uastc' }));

  const galaxy = resolve(masterDir, 'galaxy-sprites.png');
  renderSvg(svgRoot(1024, 1024, `
    <defs>
      <radialGradient id="core"><stop stop-color="#fff"/><stop offset=".25" stop-color="${PALETTE.gold}" stop-opacity=".8"/><stop offset="1" stop-color="${PALETTE.gold}" stop-opacity="0"/></radialGradient>
      <radialGradient id="hii"><stop stop-color="${PALETTE.thermal}"/><stop offset="1" stop-color="${PALETTE.thermal}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1024" height="1024" fill="none"/>
    <circle cx="250" cy="250" r="220" fill="url(#core)"/>
    <g fill="none" stroke="${PALETTE.dim}" stroke-width="26" opacity=".6"><path d="M 520 260 C 620 60 950 120 915 320 C 880 500 590 455 610 620 C 630 790 900 820 970 690"/></g>
    <g fill="url(#hii)">${Array.from({ length: 18 }, (_, i) => `<circle cx="${560 + (i % 5) * 90}" cy="${570 + Math.floor(i / 5) * 90}" r="${28 + (i % 4) * 8}"/>`).join('')}</g>
  `), galaxy, 1024, 1024);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'galaxy-sprites.ktx2'), inputs: [galaxy], srgb: false, alpha: true, quality: 'uastc' }));

  const traffic = resolve(masterDir, 'traffic-freight-atlas.png');
  const spritePaths = ['hauler', 'tanker', 'courier', 'liner', 'tug', 'surveyor']
    .map((id) => resolve(ROOT, 'public', 'assets', 'sprites', 'traffic', `${id}.webp`));
  magick([
    'montage',
    ...spritePaths,
    '-thumbnail', '256x256',
    '-background', 'none',
    '-gravity', 'center',
    '-tile', '3x2',
    '-geometry', '256x256+0+0',
    traffic,
  ]);
  outputs.push(encodeKtx({ output: resolve(publicDir, 'traffic-freight-atlas.ktx2'), inputs: [traffic], srgb: true, alpha: true, quality: 'etc1s' }));
  return outputs;
}

function guidePlateSvg(id, accent, width, height, kind = 'guide') {
  const r = mulberry(hash32(`${kind}:${id}`));
  const cx = width * (0.38 + (r() - 0.5) * 0.12);
  const cy = height * (0.5 + (r() - 0.5) * 0.12);
  const paths = [];
  const spokes = 5 + Math.floor(r() * 5);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + r() * 0.3;
    const x2 = cx + Math.cos(a) * width * (0.18 + r() * 0.12);
    const y2 = cy + Math.sin(a) * height * (0.2 + r() * 0.18);
    paths.push(`<path d="M ${cx.toFixed(1)} ${cy.toFixed(1)} Q ${(cx + (r() - 0.5) * 60).toFixed(1)} ${(cy + (r() - 0.5) * 40).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${accent}" stroke-width="${kind === 'sample' ? 5 : 3.4}" stroke-linecap="round"/>`);
    paths.push(`<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${(3 + r() * 7).toFixed(1)}" fill="${accent}" opacity=".78"/>`);
  }
  const rings = [0.1, 0.17, 0.24].map((k, i) => `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(width * k).toFixed(1)}" ry="${(height * k * 0.8).toFixed(1)}" fill="none" stroke="${i === 1 ? PALETTE.ink : PALETTE.dim}" stroke-width="${i === 1 ? 2.8 : 1.4}" stroke-dasharray="${i === 2 ? '7 8' : 'none'}" opacity="${0.9 - i * 0.2}"/>`).join('');
  return svgRoot(width, height, `
    <rect width="${width}" height="${height}" fill="none"/>
    <g opacity=".9">${rings}${paths.join('')}</g>
    <path d="M ${width * 0.06} ${height * 0.18} h ${width * 0.1} M ${width * 0.06} ${height * 0.18} v ${height * 0.16} M ${width * 0.94} ${height * 0.82} h ${-width * 0.1} M ${width * 0.94} ${height * 0.82} v ${-height * 0.16}" fill="none" stroke="${PALETTE.dim}" stroke-width="1.4"/>
    <g transform="translate(${width * 0.72} ${height * 0.28})" fill="none" stroke="${accent}" stroke-width="2">
      <circle r="${height * 0.14}"/><path d="M ${-height * 0.11} 0 h ${height * 0.22} M 0 ${-height * 0.11} v ${height * 0.22}"/>
    </g>
  `);
}

function refitDiagramSvg(id, accent) {
  const r = mulberry(hash32(id));
  const nodes = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + r() * 0.3;
    return [128 + Math.cos(a) * (58 + r() * 28), 128 + Math.sin(a) * (50 + r() * 35)];
  });
  return svgRoot(256, 256, `
    <rect x="10" y="10" width="236" height="236" rx="26" fill="none" stroke="currentColor" stroke-width="2.35" opacity=".36"/>
    <circle cx="128" cy="128" r="42" fill="none" stroke="currentColor" stroke-width="2.35"/>
    <circle cx="128" cy="128" r="18" fill="${accent}" opacity=".26" stroke="currentColor" stroke-width="2.35"/>
    ${nodes.map(([x, y], i) => `<path d="M 128 128 Q ${(128 + (x - 128) * 0.48 + (r() - 0.5) * 18).toFixed(1)} ${(128 + (y - 128) * 0.48 + (r() - 0.5) * 18).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="currentColor" stroke-width="2.35"/><${i % 2 ? 'rect' : 'circle'} ${i % 2 ? `x="${(x - 7).toFixed(1)}" y="${(y - 7).toFixed(1)}" width="14" height="14" rx="3"` : `cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"`} fill="${accent}" stroke="currentColor" stroke-width="2.35"/>`).join('')}
    <path d="M 40 218 h 72 M 144 218 h 72" stroke="currentColor" stroke-width="2.35" stroke-dasharray="8 6"/>
  `, { style: `color:${PALETTE.ink}` });
}

function certSealSvg(id, accent) {
  const points = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? 24 : 29;
    return `${(32 + Math.cos(a) * rr).toFixed(2)},${(32 + Math.sin(a) * rr).toFixed(2)}`;
  }).join(' ');
  const mark = {
    mobility: '<path d="M 18 39 L 32 18 L 46 39 M 24 33 h 16" />',
    survey: '<circle cx="32" cy="32" r="13"/><path d="M 32 12 v40 M 12 32 h40"/>',
    geology: '<path d="M 20 43 L 27 18 L 43 25 L 47 45 Z M 27 32 h18"/>',
    liaison: '<path d="M 17 35 q 8 -16 16 0 q 8 -16 16 0 v10 h-32z"/>',
  }[id];
  // Root colour matters: these render via <img>, where currentColor cannot
  // inherit from the page and would otherwise resolve to black.
  return svgRoot(64, 64, `
    <polygon points="${points}" fill="${accent}" fill-opacity=".12" stroke="currentColor" stroke-width="2.35" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/>
    <g fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round">${mark}</g>
  `, { style: `color:${PALETTE.ink}` });
}

function markSymbol(id) {
  const shapes = {
    beacon: '<path d="M 12 26 V 8 M 7 26 h10 M 8 11 q4 -7 8 0 M 5 15 q7 -12 14 0"/>',
    station: '<path d="M 7 24 l5 -14 l5 14 M 12 10 v-4 M 5 26 h14"/><circle cx="12" cy="8" r="3"/>',
    shelter: '<path d="M 4 24 Q 12 5 20 24 Z M 9 24 v-7 h6 v7"/>',
    repair: '<path d="M 5 20 l5 -5 l9 -9 l3 3 l-9 9 l-5 5 z M 15 7 l3 -3 l3 3"/>',
    prospect: '<path d="M 12 26 V 5 M 12 7 h9 l-3 5 l3 5 h-9 M 7 26 h10"/>',
  };
  return shapes[id];
}

function compassSpriteSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    ${MARKS.map(([id]) => `<symbol id="mark-${id}" viewBox="0 0 24 30"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${markSymbol(id)}</g></symbol>`).join('\n')}
  </defs>
</svg>`;
}

function generateUiAssets() {
  const outputs = [];
  const guideRoot = ensureDir(resolve(PUBLIC_ROOT, 'illustrations', 'guide-expeditions'));
  const sampleRoot = ensureDir(resolve(PUBLIC_ROOT, 'illustrations', 'samples'));
  const speciesRoot = ensureDir(resolve(PUBLIC_ROOT, 'illustrations', 'species'));
  const refitRoot = ensureDir(resolve(PUBLIC_ROOT, 'icons', 'refits'));
  const certRoot = ensureDir(resolve(PUBLIC_ROOT, 'icons', 'certifications'));
  const markRoot = ensureDir(resolve(PUBLIC_ROOT, 'icons', 'marks'));

  CERTS.forEach(([track, , accent]) => {
    for (let rank = 1; rank <= 3; rank++) {
      const id = `cert-${track}-${rank}`;
      const output = resolve(guideRoot, `${id}.webp`);
      renderSvg(guidePlateSvg(id, accent, 320, 144), output, 320, 144, ['-quality', '88']);
      outputs.push(output);
    }
  });
  MARKS.forEach(([id, accent]) => {
    const output = resolve(guideRoot, `mark-${id}.webp`);
    renderSvg(guidePlateSvg(`mark-${id}`, accent, 320, 144), output, 320, 144, ['-quality', '88']);
    outputs.push(output);
  });
  LANDMARKS.forEach((id, i) => {
    const accent = [PALETTE.thermal, PALETTE.atmo, PALETTE.hydro, PALETTE.bio, PALETTE.gold, PALETTE.magrathea][i % 6];
    const output = resolve(guideRoot, `landmark-${id}.webp`);
    renderSvg(guidePlateSvg(id, accent, 320, 144), output, 320, 144, ['-quality', '88']);
    outputs.push(output);
  });
  const atmoGuide = resolve(guideRoot, 'refit-atmo.webp');
  renderSvg(guidePlateSvg('refit-atmo', PALETTE.atmo, 320, 144), atmoGuide, 320, 144, ['-quality', '88']);
  outputs.push(atmoGuide);

  SPECIES.forEach((id, i) => {
    const accent = [PALETTE.bio, PALETTE.atmo, PALETTE.hydro, PALETTE.thermal][i % 4];
    const output = resolve(speciesRoot, `${id}.webp`);
    renderSvg(guidePlateSvg(id, accent, 320, 180, 'species'), output, 320, 180, ['-quality', '88']);
    outputs.push(output);
  });
  SAMPLES.forEach((id, i) => {
    const accent = [PALETTE.gold, PALETTE.magrathea, PALETTE.atmo, PALETTE.thermal, PALETTE.ink][i % 5];
    const output = resolve(sampleRoot, `${id}.webp`);
    renderSvg(guidePlateSvg(id, accent, 320, 180, 'sample'), output, 320, 180, ['-quality', '88']);
    outputs.push(output);
  });

  REFITS.forEach(([id, , accent]) => {
    const output = resolve(refitRoot, `${id}.svg`);
    writeText(output, refitDiagramSvg(id, accent));
    outputs.push(output);
  });
  CERTS.forEach(([id, , accent]) => {
    const output = resolve(certRoot, `${id}.svg`);
    writeText(output, certSealSvg(id, accent));
    outputs.push(output);
  });
  const spriteSheet = resolve(markRoot, 'compass-marks.svg');
  writeText(spriteSheet, compassSpriteSvg());
  outputs.push(spriteSheet);
  for (const [id] of MARKS) {
    const output = resolve(markRoot, `${id}.svg`);
    writeText(output, svgRoot(24, 30, `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${markSymbol(id)}</g>`, { style: `color:${PALETTE.ink}` }));
    outputs.push(output);
  }
  return outputs;
}

function cockpitLayerSvg(kind) {
  if (kind === 'window-frame') {
    return svgRoot(2048, 1024, `
      <rect width="2048" height="1024" fill="none"/>
      <path d="M 0 0 H 2048 V 1024 H 0 Z M 210 88 Q 1024 -30 1838 88 L 1690 820 Q 1024 940 358 820 Z" fill="${PALETTE.panel}" fill-rule="evenodd"/>
      <path d="M 210 88 Q 1024 -30 1838 88 L 1690 820 Q 1024 940 358 820 Z" fill="none" stroke="${PALETTE.dim}" stroke-width="34"/>
      <path d="M 1024 8 V 890" stroke="${PALETTE.dim}" stroke-width="28"/>
      <path d="M 70 930 H 1978" stroke="${PALETTE.gold}" stroke-width="7" opacity=".65"/>
    `);
  }
  if (kind === 'throttle') {
    return svgRoot(2048, 1024, `
      <rect width="2048" height="1024" fill="none"/>
      <g transform="translate(1380 420)">
        <path d="M -340 470 L -260 -300 Q 0 -420 260 -300 L 340 470 Z" fill="${PALETTE.panel}" stroke="${PALETTE.dim}" stroke-width="20"/>
        <rect x="-115" y="-190" width="230" height="440" rx="105" fill="#1B2131" stroke="${PALETTE.ink}" stroke-width="16"/>
        <path d="M 0 45 L 0 -280" stroke="${PALETTE.gold}" stroke-width="40" stroke-linecap="round"/>
        <circle cy="-292" r="90" fill="${PALETTE.dark ?? '#202535'}" stroke="${PALETTE.gold}" stroke-width="18"/>
      </g>
    `);
  }
  return svgRoot(2048, 1024, `
    <rect width="2048" height="1024" fill="none"/>
    <path d="M 0 650 Q 1024 510 2048 650 V 1024 H 0 Z" fill="${PALETTE.panel}" stroke="${PALETTE.dim}" stroke-width="24"/>
    <g fill="#111526" stroke="${PALETTE.line}" stroke-width="12">
      <rect x="250" y="650" width="460" height="260" rx="42"/><rect x="794" y="610" width="460" height="300" rx="42"/><rect x="1338" y="650" width="460" height="260" rx="42"/>
    </g>
    <g fill="none" stroke="${PALETTE.atmo}" stroke-width="12">
      <circle cx="480" cy="780" r="78"/><path d="M 410 810 Q 480 700 550 810"/>
      <path d="M 900 825 L 1015 670 L 1130 825"/><path d="M 920 790 h190"/>
      <circle cx="1568" cy="780" r="78"/><path d="M 1500 780 h136 M 1568 712 v136"/>
    </g>
  `);
}

function generateCockpitLayers() {
  const outputs = [];
  const dir = ensureDir(resolve(PUBLIC_ROOT, 'cockpit'));
  for (const kind of ['dashboard-fascia', 'window-frame', 'throttle-quadrant']) {
    const output = resolve(dir, `${kind}.webp`);
    renderSvg(cockpitLayerSvg(kind === 'dashboard-fascia' ? 'dashboard' : kind), output, 2048, 1024, ['-quality', '90']);
    outputs.push(output);
  }
  return outputs;
}

function generateLandingRefresh() {
  const specs = [
    ['shots/p6-hover2.png', '14-low-flight.webp', '1400x836^', 'none'],
    ['shots/p6-chase.png', '15-chase-view.webp', '1400x836^', 'none'],
    ['shots/p6-setdown.png', '16-set-down.webp', '1400x836^', 'none'],
    ['shots/p4-district.png', '17-district-dusk.webp', '1400x560^', 'dusk'],
  ];
  const outputs = [];
  for (const [sourceRel, file, resize, grade] of specs) {
    const source = resolve(ROOT, sourceRel);
    if (!existsSync(source)) continue;
    const output = resolve(ROOT, 'landing', 'media', file);
    const args = [
      source,
      '-filter', 'Lanczos',
      '-resize', resize,
      '-gravity', 'center',
      '-extent', resize.replace('^', ''),
    ];
    if (grade === 'dusk') args.push('-modulate', '82,94,108', '-fill', '#241A46', '-colorize', '13%');
    args.push('-strip', '-quality', '84', '-define', 'webp:method=6', output);
    magick(args);
    outputs.push(output);
  }
  return outputs;
}

export function generateImages() {
  const ground = generateGroundTextures();
  const outputs = [...ground.outputs];
  outputs.push(...generateGroundOverlays());
  outputs.push(...generateObjectAtlases());
  outputs.push(...generateShipExtras());
  outputs.push(...generateSkyTextures());
  outputs.push(...generateOrbitTextures());
  outputs.push(...generateUiAssets());
  outputs.push(...generateCockpitLayers());
  outputs.push(...generateLandingRefresh());
  for (const output of outputs.filter((path) => path.endsWith('.ktx2'))) validateKtx(output);
  return { outputs, groundPrompts: ground.prompts };
}

export const UPLIFT_UI_IDS = {
  refits: REFITS.map(([id]) => id),
  certifications: CERTS.map(([id]) => id),
  marks: MARKS.map(([id]) => id),
  species: SPECIES,
  samples: SAMPLES,
  landmarks: LANDMARKS,
};

