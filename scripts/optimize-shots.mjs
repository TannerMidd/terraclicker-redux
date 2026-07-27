/**
 * Re-encode the verification screenshots as web-sized WebP for the landing page,
 * plus one JPEG social card. Source PNGs (docs/screenshots) stay the archive copy;
 * landing/media holds what actually ships.
 *
 * Usage: node scripts/optimize-shots.mjs
 *
 * Chromium does the encoding — playwright is already a dev dependency and this
 * runs rarely (only when the shots are re-taken), so the cost is a launch.
 */
import './workspace-runtime.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'docs', 'screenshots');
const outDir = path.join(root, 'landing', 'media');

/** maxW: cap on the long edge. Gallery art is shown ~700px wide, so 1400 covers 2×. */
const WEBP = { maxW: 1400, quality: 0.82 };
const CARD = { from: '02-terraforming.png', w: 1200, h: 630, quality: 0.86 };

await fs.mkdir(outDir, { recursive: true });
const files = (await fs.readdir(srcDir)).filter((f) => f.endsWith('.png')).sort();
if (!files.length) {
  console.error(`No PNGs in ${srcDir}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

/** Decode a data URL in the page, draw it scaled, hand back an encoded data URL. */
const encode = (dataUrl, opts) =>
  page.evaluate(async ([url, o]) => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    let { width: dw, height: dh } = bmp;
    let sx = 0;
    let sy = 0;
    let sw = bmp.width;
    let sh = bmp.height;

    if (o.cover) {
      // Crop to fill the target box, centred, then draw at exactly that size.
      const scale = Math.max(o.cover.w / bmp.width, o.cover.h / bmp.height);
      sw = Math.round(o.cover.w / scale);
      sh = Math.round(o.cover.h / scale);
      sx = Math.round((bmp.width - sw) / 2);
      sy = Math.round((bmp.height - sh) / 2);
      dw = o.cover.w;
      dh = o.cover.h;
    } else if (o.maxW && bmp.width > o.maxW) {
      dw = o.maxW;
      dh = Math.round((bmp.height * o.maxW) / bmp.width);
    }

    const canvas = new OffscreenCanvas(dw, dh);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);
    const blob = await canvas.convertToBlob({ type: o.type, quality: o.quality });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (const byte of buf) bin += String.fromCharCode(byte);
    return { data: btoa(bin), w: dw, h: dh, src: [bmp.width, bmp.height] };
  }, [dataUrl, opts]);

const read = async (name) =>
  `data:image/png;base64,${(await fs.readFile(path.join(srcDir, name))).toString('base64')}`;

const manifest = [];
for (const name of files) {
  const dataUrl = await read(name);
  const out = await encode(dataUrl, { ...WEBP, type: 'image/webp' });
  const target = path.join(outDir, name.replace(/\.png$/, '.webp'));
  await fs.writeFile(target, Buffer.from(out.data, 'base64'));
  const before = (await fs.stat(path.join(srcDir, name))).size;
  const after = (await fs.stat(target)).size;
  manifest.push({ file: path.basename(target), w: out.w, h: out.h });
  console.log(
    `${name.padEnd(24)} ${out.src.join('×').padEnd(10)} → ${`${out.w}×${out.h}`.padEnd(10)} ` +
      `${(before / 1024).toFixed(0)}K → ${(after / 1024).toFixed(0)}K`,
  );
}

// Social card: 1200×630 is what Open Graph and Twitter both want.
const card = await encode(await read(CARD.from), {
  cover: { w: CARD.w, h: CARD.h },
  type: 'image/jpeg',
  quality: CARD.quality,
});
await fs.writeFile(path.join(outDir, 'social-card.jpg'), Buffer.from(card.data, 'base64'));
console.log(
  `social-card.jpg          from ${CARD.from} → ${CARD.w}×${CARD.h} ` +
    `${((await fs.stat(path.join(outDir, 'social-card.jpg'))).size / 1024).toFixed(0)}K`,
);

await browser.close();
console.log(`\n${manifest.length} shots in landing/media/`);
