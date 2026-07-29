/** ASSET_UPLIFT.md production pipeline. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  GENERATED_ROOT,
  PALETTE,
  PUBLIC_ROOT,
  ROOT,
  SOURCE_ROOT,
  TMP_ROOT,
  ensureDir,
  magick,
  resetDir,
  writeText,
} from './uplift/helpers.mjs';
import { generateImages, UPLIFT_UI_IDS } from './uplift/generate-images.mjs';
import { generateNextLevelImages } from './uplift/generate-next-level-images.mjs';
import { generateSurfaceTextures } from './uplift/generate-surface-textures.mjs';
import { generateMeshes } from './uplift/generate-meshes.mjs';

function walkFiles(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) out.push(path);
    }
  };
  if (existsSync(root)) visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function record(path) {
  const data = readFileSync(path);
  return {
    path: relative(ROOT, path).replaceAll('\\', '/'),
    bytes: statSync(path).size,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

const COVERAGE = {
  '1.1': ['textures/ground/ground-albedo-array.ktx2', 'textures/ground/ground-normal-rma-array.ktx2'],
  '1.2': ['textures/ground/detail-normal-array.ktx2', 'textures/ground/macro-mottle-array.ktx2'],
  '1.3': ['textures/ground/shore-waterline.ktx2'],
  '1.4': ['textures/ground/snow-frost.ktx2', 'textures/ground/snow-frost-normal.ktx2'],
  '1.5': ['textures/ground/lava-emissive-flow-crust.ktx2'],
  '1.6': ['textures/ground/ground-decals.ktx2'],
  '2.1': ['meshes/props/rocks.glb', 'meshes/props/boulders.glb', 'meshes/props/flora.glb', 'meshes/props/shrubs.glb', 'meshes/props/shards.glb', 'meshes/props/vents.glb'],
  '2.2': ['textures/props/rocks-atlas.ktx2', 'textures/props/boulders-atlas.ktx2', 'textures/props/flora-atlas.ktx2', 'textures/props/shrubs-atlas.ktx2', 'textures/props/shards-atlas.ktx2', 'textures/props/vents-atlas.ktx2'],
  '2.3': ['meshes/settlements/settlement-kit.glb', 'textures/settlements/settlement-atlas.ktx2'],
  '2.4': ['textures/settlements/window-emissive.ktx2'],
  '2.5': ['meshes/facilities/facility-kit.glb', 'textures/facilities/facility-atlas.ktx2'],
  '2.6': ['meshes/marks/mark-kit.glb', 'textures/marks/mark-atlas.ktx2'],
  '2.7': ['meshes/seams/crystal-seam-kit.glb', 'textures/seams/crystal-seam.ktx2'],
  '3.1': ['meshes/ships/runabout.glb', 'textures/ships/runabout-pbr.ktx2', 'textures/ships/runabout-emissive.ktx2'],
  '3.2': ['meshes/ships/runabout-refits.glb'],
  '3.3': ['cockpit/runabout-cockpit-pilot-eye.webp'],
  '3.4': ['meshes/ships/skimmer.glb'],
  '3.5': ['textures/ships/hull-decals.ktx2'],
  '4.1': ['textures/sky/cloud-deck-array.ktx2', 'textures/sky/cloud-flow.ktx2'],
  '4.2': ['textures/sky/weather-particles.ktx2'],
  '4.3': ['textures/sky/sky-gradient-luts.ktx2'],
  '4.4': ['textures/sky/starfield-equirect.ktx2', 'textures/sky/nebula-wash.ktx2'],
  '4.5': ['textures/sky/sun-glare.ktx2'],
  '4.6': ['textures/sky/aurora-bioluminescence-ramp.ktx2'],
  '5.1': ['textures/orbit/planet-detail-array.ktx2'],
  '5.2': ['textures/orbit/city-lights.ktx2'],
  '5.3': ['textures/orbit/ring-dust.ktx2'],
  '5.4': ['meshes/deep-field/deep-field-kit.glb', 'textures/deep-field/deep-field-atlas.ktx2'],
  '5.5': ['textures/orbit/galaxy-sprites.ktx2'],
  '5.6': ['textures/orbit/traffic-freight-atlas.ktx2'],
  '6.1': ['illustrations/guide-expeditions/'],
  '6.2': ['icons/refits/'],
  '6.3': ['icons/certifications/'],
  '6.4': ['illustrations/samples/', 'illustrations/species/'],
  '6.5': ['icons/marks/compass-marks.svg', 'icons/marks/'],
  '6.6': ['../../landing/media/14-low-flight.webp', '../../landing/media/15-chase-view.webp', '../../landing/media/16-set-down.webp', '../../landing/media/17-district-dusk.webp'],
  '6.7': [],
  '7.1': [
    'meshes/ships/runabout-cockpit.glb',
    'textures/ships/cockpit-trim.ktx2',
    'textures/ships/cockpit-trim-normal-rma.ktx2',
    'textures/ships/cockpit-emissive.ktx2',
    'textures/ships/cockpit-glass.ktx2',
    'textures/ships/runabout-pbr-normal-rma.ktx2',
  ],
  '7.2': [
    'meshes/viewmodels/surface-viewmodels.glb',
    'textures/viewmodels/field-kit.ktx2',
    'textures/viewmodels/field-kit-normal-rma.ktx2',
  ],
  '7.3': [
    'meshes/surface/landmark-kit.glb',
    'meshes/surface/dressing-kit.glb',
    'textures/surface/landmark-atlas.ktx2',
    'textures/surface/landmark-atlas-normal-rma.ktx2',
    'textures/surface/deposit-atlas.ktx2',
    'textures/surface/deposit-atlas-normal-rma.ktx2',
  ],
  '7.4': [
    'meshes/surface/creature-variants.glb',
    'textures/surface/biome-clutter-atlas.ktx2',
    'textures/surface/biome-clutter-atlas-normal-rma.ktx2',
    'textures/surface/settlement-dressing-atlas.ktx2',
    'textures/surface/settlement-dressing-atlas-normal-rma.ktx2',
    'textures/surface/ecology-atlas.ktx2',
    'textures/surface/ecology-atlas-normal-rma.ktx2',
  ],
  '7.5': [
    'meshes/surface/weather-props.glb',
    'textures/ground/contact-fx.ktx2',
    'textures/surface/weather-atlas.ktx2',
    'textures/surface/weather-atlas-normal-rma.ktx2',
  ],
};

const IMAGEGEN_PROMPTS = {
  shared: [
    'Use case: stylized-concept',
    'Source master atlas for seamless game ground materials',
    'Exact 2x2 edge-to-edge atlas: lowland, upland, shore, peak/frost',
    'Straight-on top-down material swatches with neutral scan lighting',
    'Premium stylized PBR albedo reference with quiet scientific-naturalism',
    'No objects, text, UI, normal-map purple, roughness/AO presentation, directional lighting, or watermark',
  ],
  variants: {
    terrestrial: 'Earth and stone: #6D6046 #55492F #A89570 #8D8574; restrained #3F9E58 and #E8F0F8.',
    ice: 'Blue-grey permafrost and glacier: #8FA6BA #BCCDDC #557188 #E8F0F8 #E8F2FB.',
    desert: 'Ochre and rust mineral: #B08A4A #8A5F34 #D7B978 #6B4526.',
    volcanic: 'Charcoal basalt: #2E2422 #4D3A34 #16100F #201A1A; no emissive lava in albedo.',
    ocean: 'Damp island: #7D9459 #5F7A46 #C8C9A5 #A4B482 with restrained biotic flecks.',
    gasgiant: 'Muted violet moon: #8F6BA4 #B488A0 #6B4680 #D4B4C4; low saturation.',
  },
};

async function main() {
  ensureDir(SOURCE_ROOT);
  ensureDir(GENERATED_ROOT);
  ensureDir(PUBLIC_ROOT);
  resetDir(TMP_ROOT, resolve(ROOT, '.runtime'));

  console.log('Generating raster, vector, and KTX2 assets...');
  const images = generateImages();
  images.outputs.push(...generateNextLevelImages());
  images.outputs.push(...generateSurfaceTextures());
  const cockpitFallbackSource = resolve(SOURCE_ROOT, 'renders', 'runabout-cockpit-pilot-eye.png');
  if (!existsSync(cockpitFallbackSource)) {
    throw new Error(`Missing deterministic cockpit fallback: ${cockpitFallbackSource}. Run Blender with assets-source/uplift/blender/render_runabout_cockpit.py.`);
  }
  const cockpitFallbackPublic = resolve(PUBLIC_ROOT, 'cockpit', 'runabout-cockpit-pilot-eye.webp');
  ensureDir(dirname(cockpitFallbackPublic));
  magick([
    cockpitFallbackSource,
    '-strip',
    '-quality', '86',
    '-define', 'webp:method=6',
    cockpitFallbackPublic,
  ]);
  images.outputs.push(cockpitFallbackPublic);
  console.log('Generating low-poly GLB kits...');
  const meshOutputs = await generateMeshes();

  const landingFiles = ['14-low-flight.webp', '15-chase-view.webp', '16-set-down.webp', '17-district-dusk.webp']
    .map((file) => resolve(ROOT, 'landing', 'media', file))
    .filter(existsSync);
  const publicManifest = resolve(PUBLIC_ROOT, 'manifest.json');
  const allFiles = [
    ...walkFiles(PUBLIC_ROOT).filter((path) => path !== publicManifest),
    ...landingFiles,
  ];
  const byExtension = {};
  for (const path of allFiles) {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    byExtension[ext] = (byExtension[ext] || 0) + 1;
  }
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/generate-uplift-assets.mjs',
    artDirection: 'docs/ART_DIRECTION.md',
    productionList: 'docs/ASSET_UPLIFT.md',
    palette: PALETTE,
    sources: {
      imagegen: IMAGEGEN_PROMPTS,
      deterministic: [
        'Technical maps derived locally from the six image-generated albedo atlases.',
        'Procedural GLB kits are deterministic low-poly geometry generated with three.js.',
        'The runabout hull, cockpit, surface viewmodels, landmarks, dressing, creatures, and weather props are modelled in Blender from assets-source/uplift/blender/*.py and built with `npm run assets:ship`.',
        'All UI SVG/WebP and non-ground masters are deterministic project-authored vector patterns.',
        'KTX2 output is Basis Universal encoded with Khronos toktx 4.4.2 and single-thread settings.',
      ],
    },
    uiIds: UPLIFT_UI_IDS,
    coverage: COVERAGE,
    counts: {
      total: allFiles.length,
      byExtension,
      groundSlices: 24,
      groundMaps: 48,
      propFamilies: 6,
      propVariants: 180,
      propLods: 3,
      settlementMeshes: 11,
      deepFieldMeshes: 15,
      guideExpeditionPlates: 31,
      speciesPlates: UPLIFT_UI_IDS.species.length,
      samplePlates: UPLIFT_UI_IDS.samples.length,
      refitDiagrams: UPLIFT_UI_IDS.refits.length,
      certificationSeals: UPLIFT_UI_IDS.certifications.length,
    },
    files: allFiles.map(record),
    notes: {
      '6.7': 'Intentionally no audio files. ART_DIRECTION.md requires the existing synthesized Web Audio stack.',
      tierC: 'The current procedural renderer remains the fallback; generated assets do not alter collision or save-derived geometry.',
    },
  };

  writeText(publicManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  writeText(resolve(SOURCE_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  writeText(resolve(ROOT, 'docs', 'ASSET_SOURCES.md'), `# Asset sources

This file covers the production pack generated from [ASSET_UPLIFT.md](ASSET_UPLIFT.md).

## Ground masters

The six files under \`assets-source/uplift/ground/*-atlas-source.png\` were generated with the built-in OpenAI image-generation tool. The shared prompt and per-world palette notes are recorded in \`public/assets/uplift/manifest.json\`. The requested content was original, non-branded material art with no text or recognizable franchise design.

The generator mirrors each source quadrant into a seamless 2K master, derives packed RG normal / B roughness / A ambient-occlusion maps, and encodes the result as Basis Universal KTX2 arrays.

## Deterministic project-authored assets

All remaining texture masters, SVGs, WebPs, and procedural GLB files are generated locally by \`scripts/generate-uplift-assets.mjs\` from project-authored geometry and vector patterns. The Blender-authored GLBs are deterministically regenerated from \`assets-source/uplift/blender/*.py\` through \`npm run assets:ship\`. They have no third-party source imagery.

KTX2 files are encoded by Khronos KTX-Software 4.4.2. The complete file list, hashes, coverage map, counts, palette, and prompt set live in the generated manifest.

## Regeneration

\`\`\`sh
npm run assets:uplift
\`\`\`

Set \`TOKTX_BIN\` if \`toktx\` is not installed at \`.runtime/ktx/bin/toktx.exe\`. ImageMagick 7 is required.
`);

  console.log(`Generated ${manifest.counts.total} deliverables.`);
  console.log(JSON.stringify(manifest.counts, null, 2));
  console.log(`Manifest: ${relative(ROOT, publicManifest)}`);
  console.log(`Mesh outputs: ${meshOutputs.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});