import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  GENERATED_ROOT,
  PALETTE,
  PUBLIC_ROOT,
  TMP_ROOT,
  encodeKtx,
  ensureDir,
  magick,
  mulberry,
  renderSvg,
  validateKtx,
} from './helpers.mjs';

function svgRoot(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;
}

function patternedSvg(width, height, colors, seed, cells = 14) {
  const random = mulberry(seed);
  const out = [`<rect width="${width}" height="${height}" fill="${colors[0]}"/>`];
  const cw = width / cells;
  const ch = height / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const cx = (x + 0.5 + (random() - 0.5) * 0.36) * cw;
      const cy = (y + 0.5 + (random() - 0.5) * 0.36) * ch;
      const rx = cw * (0.22 + random() * 0.36);
      const ry = ch * (0.14 + random() * 0.3);
      const color = colors[1 + ((x * 3 + y * 5 + Math.floor(random() * 9)) % (colors.length - 1))];
      out.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${color}" opacity="${(0.12 + random() * 0.32).toFixed(2)}" transform="rotate(${(random() * 180).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`);
    }
  }
  for (let i = 0; i < cells * 3; i++) {
    const x = random() * width;
    const y = random() * height;
    out.push(`<path d="M ${x.toFixed(1)} ${y.toFixed(1)} l ${((random() - 0.5) * 180).toFixed(1)} ${((random() - 0.5) * 110).toFixed(1)}" stroke="${colors[(i % (colors.length - 1)) + 1]}" stroke-width="${(2 + random() * 8).toFixed(1)}" opacity=".24"/>`);
  }
  return svgRoot(width, height, out.join('\n'));
}

function derivePackedNormalRma(albedo, output) {
  const stem = basename(output).replace(/\.[^.]+$/, '');
  const height = resolve(TMP_ROOT, `${stem}-height.png`);
  const gx = resolve(TMP_ROOT, `${stem}-gx.png`);
  const gy = resolve(TMP_ROOT, `${stem}-gy.png`);
  const rough = resolve(TMP_ROOT, `${stem}-rough.png`);
  const ao = resolve(TMP_ROOT, `${stem}-ao.png`);
  magick([albedo, '-colorspace', 'Gray', '-contrast-stretch', '1%x1%', height]);
  magick([height, '-bias', '50%', '-define', 'convolve:scale=18%!', '-morphology', 'Convolve', '3x3:-1,0,1,-2,0,2,-1,0,1', '-level', '10%,90%', gx]);
  magick([height, '-bias', '50%', '-define', 'convolve:scale=18%!', '-morphology', 'Convolve', '3x3:-1,-2,-1,0,0,0,1,2,1', '-level', '10%,90%', gy]);
  magick([height, '-negate', '-level', '8%,92%', '-gamma', '1.35', rough]);
  magick([height, '-blur', '0x5', '-level', '4%,96%', ao]);
  ensureDir(dirname(output));
  magick([gx, gy, rough, ao, '-channel', 'RGBA', '-combine', '-colorspace', 'sRGB', output]);
}

function technicalAtlas(relative, colors, seed) {
  const master = resolve(GENERATED_ROOT, 'textures', `${relative}.png`);
  const packed = resolve(GENERATED_ROOT, 'textures', `${relative}-normal-rma.png`);
  ensureDir(dirname(master));
  renderSvg(patternedSvg(2048, 2048, colors, seed), master, 2048, 2048);
  derivePackedNormalRma(master, packed);
  return [
    encodeKtx({ output: resolve(PUBLIC_ROOT, 'textures', `${relative}.ktx2`), inputs: [master], srgb: true, quality: 'uastc' }),
    encodeKtx({ output: resolve(PUBLIC_ROOT, 'textures', `${relative}-normal-rma.ktx2`), inputs: [packed], srgb: false, quality: 'uastc' }),
  ];
}

function cockpitTrimSvg() {
  const random = mulberry(0xc0c7a17);
  const hairlines = Array.from({ length: 150 }, () => {
    const y = random() * 2048;
    const x = random() * 2048;
    const length = 35 + random() * 260;
    const light = random() > 0.55 ? '#66717D' : '#080D13';
    return `<path d="M ${x.toFixed(1)} ${y.toFixed(1)} h ${length.toFixed(1)}" stroke="${light}" stroke-width="${(0.5 + random() * 1.5).toFixed(1)}" opacity="${(0.04 + random() * 0.10).toFixed(2)}"/>`;
  }).join('');
  return svgRoot(2048, 2048, `
    <defs>
      <linearGradient id="alloy" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#252D38"/><stop offset=".45" stop-color="#10161E"/><stop offset=".72" stop-color="#303A46"/><stop offset="1" stop-color="#1A222C"/>
      </linearGradient>
      <pattern id="brushed" width="18" height="18" patternUnits="userSpaceOnUse">
        <path d="M 0 3 H 18 M 0 9 H 18 M 0 15 H 18" stroke="#66717D" stroke-width=".65" opacity=".10"/>
        <path d="M 0 6 H 18 M 0 12 H 18" stroke="#4F5B68" stroke-width=".55" opacity=".09"/>
      </pattern>
      <pattern id="panel" width="512" height="512" patternUnits="userSpaceOnUse">
        <path d="M 8 64 H 504 M 64 8 V 504" stroke="#4B5664" stroke-width="5" opacity=".16"/>
        <path d="M 12 69 H 500 M 69 12 V 500" stroke="#56616D" stroke-width="2" opacity=".12"/>
        <g fill="#414B58" opacity=".35">
          <circle cx="24" cy="24" r="5"/><circle cx="488" cy="24" r="5"/>
          <circle cx="24" cy="488" r="5"/><circle cx="488" cy="488" r="5"/>
        </g>
      </pattern>
    </defs>
    <rect width="2048" height="2048" fill="url(#alloy)"/>
    <rect width="2048" height="2048" fill="url(#brushed)"/>
    <rect width="2048" height="2048" fill="url(#panel)"/>${hairlines}
  `);
}

function cockpitEmissiveSvg() {
  // This atlas is deliberately microdetail only. The old atlas contained three
  // giant glyphs that the screen-bed UVs sampled as meaningless cockpit icons.
  // Live instruments now belong to independent CanvasTexture display roots.
  const ticks = Array.from({ length: 96 }, (_, i) => {
    const x = 20 + (i % 24) * 84;
    const y = 24 + Math.floor(i / 24) * 236;
    const color = i % 17 === 0 ? PALETTE.thermal : i % 11 === 0 ? PALETTE.gold : PALETTE.atmo;
    return `<path d="M ${x} ${y} h ${18 + (i % 4) * 7}" stroke="${color}" stroke-width="${2 + (i % 2)}" opacity="${i % 5 === 0 ? '.72' : '.34'}"/>`;
  }).join('');
  return svgRoot(2048, 1024, `
    <defs>
      <pattern id="microgrid" width="64" height="64" patternUnits="userSpaceOnUse">
        <path d="M 64 0 H 0 V 64" fill="none" stroke="${PALETTE.atmo}" stroke-width="1.25" opacity=".10"/>
        <circle cx="32" cy="32" r="1.6" fill="${PALETTE.atmo}" opacity=".18"/>
      </pattern>
    </defs>
    <rect width="2048" height="1024" fill="url(#microgrid)" opacity=".42"/>
    ${ticks}
    <g fill="${PALETTE.gold}" opacity=".45">
      <rect x="52" y="170" width="9" height="4"/><rect x="76" y="170" width="22" height="4"/>
      <rect x="1070" y="650" width="9" height="4"/><rect x="1094" y="650" width="22" height="4"/>
    </g>
  `);
}
function cockpitGlassSvg() {
  const random = mulberry(0xc4a055);
  const scratches = Array.from({ length: 110 }, () => {
    const x = random() * 2048;
    const y = random() * 1024;
    return `<path d="M ${x.toFixed(1)} ${y.toFixed(1)} q ${((random() - 0.5) * 40).toFixed(1)} ${((random() - 0.5) * 30).toFixed(1)} ${(30 + random() * 170).toFixed(1)} ${((random() - 0.5) * 45).toFixed(1)}" fill="none" stroke="#DDF8FF" stroke-width="${(0.8 + random() * 2.7).toFixed(1)}" opacity="${(0.04 + random() * 0.17).toFixed(2)}"/>`;
  }).join('');
  return svgRoot(2048, 1024, `
    <defs><linearGradient id="frost" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#EAFBFF" stop-opacity=".55"/><stop offset=".2" stop-color="#B9E7F0" stop-opacity=".04"/><stop offset=".8" stop-color="#B9E7F0" stop-opacity=".04"/><stop offset="1" stop-color="#EAFBFF" stop-opacity=".48"/></linearGradient></defs>
    <rect width="2048" height="1024" fill="url(#frost)"/>${scratches}
  `);
}

function contactFxSvg() {
  const random = mulberry(0xc07ac7);
  const flecks = Array.from({ length: 180 }, (_, i) => {
    const cellX = i % 3;
    const cellY = Math.floor(i / 3) % 2;
    return `<circle cx="${(cellX * 341 + 40 + random() * 260).toFixed(1)}" cy="${(cellY * 512 + 40 + random() * 430).toFixed(1)}" r="${(2 + random() * 11).toFixed(1)}" fill="${i % 3 === 0 ? '#DDF8FF' : i % 3 === 1 ? '#C2945A' : PALETTE.thermal}" opacity="${(0.2 + random() * 0.62).toFixed(2)}"/>`;
  }).join('');
  return svgRoot(1024, 1024, `
    <rect width="1024" height="1024" fill="none"/>
    <g fill="none" stroke="${PALETTE.atmo}" stroke-width="9"><ellipse cx="165" cy="160" rx="112" ry="34"/><ellipse cx="165" cy="160" rx="72" ry="21"/><ellipse cx="500" cy="160" rx="125" ry="38"/><ellipse cx="500" cy="160" rx="82" ry="24"/></g>
    <path d="M 785 58 L 735 176 L 790 150 L 748 310" fill="none" stroke="${PALETTE.thermal}" stroke-width="18"/>
    <path d="M 80 690 q -50 -72 8 -166 q 66 60 24 170 z M 190 535 q 42 -65 86 -4 q 8 90 -68 118 z" fill="#27303A" opacity=".8"/>
    <path d="M 425 555 V 930 M 478 555 V 930 M 590 555 V 930 M 643 555 V 930" stroke="#6D6046" stroke-width="24" stroke-dasharray="20 16" opacity=".74"/>
    ${flecks}
  `);
}

function specialTexture(relative, svg, width, height, options = {}) {
  const master = resolve(GENERATED_ROOT, 'textures', `${relative}.png`);
  ensureDir(dirname(master));
  renderSvg(svg, master, width, height);
  return encodeKtx({
    output: resolve(PUBLIC_ROOT, 'textures', `${relative}.ktx2`),
    inputs: [master],
    srgb: options.srgb ?? false,
    alpha: options.alpha ?? true,
    quality: 'uastc',
  });
}

export function generateNextLevelImages() {
  const outputs = [];
  const specs = [
    ['viewmodels/field-kit', ['#18202B', '#303A49', '#7B8798', '#101620', PALETTE.gold, PALETTE.atmo], 0xf13d517],
  ];
  for (const [relative, colors, seed] of specs) outputs.push(...technicalAtlas(relative, colors, seed));

  const cockpitMaster = resolve(GENERATED_ROOT, 'textures', 'ships', 'cockpit-trim.png');
  const cockpitPacked = resolve(GENERATED_ROOT, 'textures', 'ships', 'cockpit-trim-normal-rma.png');
  ensureDir(dirname(cockpitMaster));
  renderSvg(cockpitTrimSvg(), cockpitMaster, 2048, 2048);
  derivePackedNormalRma(cockpitMaster, cockpitPacked);
  outputs.push(encodeKtx({
    output: resolve(PUBLIC_ROOT, 'textures', 'ships', 'cockpit-trim.ktx2'),
    inputs: [cockpitMaster], srgb: true, quality: 'uastc',
  }));
  outputs.push(encodeKtx({
    output: resolve(PUBLIC_ROOT, 'textures', 'ships', 'cockpit-trim-normal-rma.ktx2'),
    inputs: [cockpitPacked], srgb: false, quality: 'uastc',
  }));
  const hullMaster = resolve(GENERATED_ROOT, 'textures', 'ships', 'runabout-pbr.png');
  if (existsSync(hullMaster)) {
    const hullPacked = resolve(GENERATED_ROOT, 'textures', 'ships', 'runabout-pbr-normal-rma.png');
    derivePackedNormalRma(hullMaster, hullPacked);
    outputs.push(encodeKtx({
      output: resolve(PUBLIC_ROOT, 'textures', 'ships', 'runabout-pbr-normal-rma.ktx2'),
      inputs: [hullPacked], srgb: false, quality: 'uastc',
    }));
  }
  outputs.push(specialTexture('ships/cockpit-emissive', cockpitEmissiveSvg(), 2048, 1024));
  outputs.push(specialTexture('ships/cockpit-glass', cockpitGlassSvg(), 2048, 1024));
  outputs.push(specialTexture('ground/contact-fx', contactFxSvg(), 1024, 1024));
  for (const output of outputs) validateKtx(output);
  return outputs;
}