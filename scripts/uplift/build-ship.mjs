/**
 * Build the Blender-authored kits and prove they survive the path the game
 * actually loads them through.
 *
 * The proof matters more than the build. `kitGeometry()` merges every mesh
 * under a named node into ONE geometry and bakes material colour into vertex
 * colours — a model that opens perfectly in Blender still fails in-game if a
 * mesh is missing UVs, if an asset name moved, or if the axis convention came
 * out wrong. So this runs the real merge here, in node, against the real file,
 * and reports the fitted result for every call site.
 *
 *   node scripts/uplift/build-ship.mjs                build+verify everything
 *   node scripts/uplift/build-ship.mjs skimmer        just one
 *   node scripts/uplift/build-ship.mjs --verify       verify shipped GLBs only
 *
 * Assets come in two ways: `script:` kits are BUILT (their Python is the
 * model), `source:` assets are IMPORTED (any .blend or .glb, repaired by
 * normalize.mjs — see docs/BLENDER_PIPELINE.md §8). Both end at the same
 * verify. Blender is found via $BLENDER, else the usual install roots, and is
 * only needed for scripts and .blend sources.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { PUBLIC_ROOT, ROOT, SOURCE_ROOT, TMP_ROOT, ensureDir } from './helpers.mjs';
import {
  deriveNames,
  discoverImports,
  namesFromShipped,
  writeImportsManifest,
  writeSidecarIfMissing,
} from './imports.mjs';
import { fitBox, fittedPoint, kitGeometry, loadKit } from './kit-contract.mjs';
import { createIO, normalizeDocument, printReport } from './normalize.mjs';

const BLENDER_CANDIDATES = [
  process.env.BLENDER,
  'F:/Tools/Blender/Blender Foundation/Blender 5.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe',
  '/usr/bin/blender',
  '/Applications/Blender.app/Contents/MacOS/Blender',
].filter(Boolean);

/**
 * Every Blender-authored kit.
 *
 * `names` are read out of the GLB by the TSX as strings — they are an API, and
 * a rename is a silent breakage, so they are asserted here. `sites` mirror the
 * call sites' box fits so a drifting silhouette is measured rather than
 * noticed on screen. `anchors` are points on the model that separate
 * basic-material emitters have to sit on: those meshes live in the TSX,
 * outside the merge (the shared kit material cannot glow), so they do not
 * follow the hull when it changes — the build prints where to put them.
 *
 * TWO WAYS IN. An asset has either
 *   `script:` — procedural, a Python file in assets-source/uplift/blender
 *               (the original six kits; the .blend is the script's output), or
 *   `source:` — a FILE under assets-source/uplift: a .blend modelled in the
 *               Blender GUI, or a .glb/.gltf from anywhere (asset pack,
 *               generator, another tool). No Python. The file is exported
 *               (if .blend) and then repaired by normalize.mjs — UVs, baked
 *               transforms, stripped tangents/rigs, flat colours — before the
 *               same verify as everyone else. `rename: { from: to }` teaches
 *               a download the names the game asks for.
 * New assets should use `source:`. A minimal entry is id, source, glb, names,
 * and a budget; add `sites` once a call site exists so its fit is measured.
 */
const ASSETS = [
  {
    id: 'runabout',
    script: 'runabout.py',
    blend: 'runabout.blend',
    glb: 'meshes/ships/runabout.glb',
    names: ['runabout', 'hull-nose'],
    // hull-nose is a duplicate VIEW of nose geometry the 'runabout' name
    // already counts — fetched separately to draw the prow in the cockpit —
    // so it is excluded from the file-total budget rather than counted twice.
    alias: ['hull-nose'],
    budget: 4000,
    forward: 'hull-nose',
    sites: [
      { label: 'chase exterior  (RunaboutExterior.tsx)', asset: 'runabout', min: [-0.76, -0.12, -0.85], max: [0.76, 0.26, 0.79] },
      { label: 'landed on world (SurfaceScene.tsx)', asset: 'runabout', min: [-0.71, 0, -0.85], max: [0.71, 0.42, 0.7] },
      { label: 'cockpit prow    (RunaboutHull.tsx)', asset: 'hull-nose', min: [-0.029, -0.01, -0.065], max: [0.029, 0.01, 0.065] },
    ],
    anchors: {
      site: 0,
      note: 'RunaboutExterior.tsx',
      points: [
        ['wingtip lamps  ', [6.28, 1.35, 0.19], 'mirrored pair'],
        ['dorsal beacon  ', [0, 0.6, 1.15], ''],
        ['engine exhausts', [2.88, 6.0, 0.26], 'mirrored pair'],
      ],
    },
  },
  {
    id: 'skimmer',
    script: 'skimmer.py',
    blend: 'skimmer.blend',
    glb: 'meshes/ships/skimmer.glb',
    names: ['survey-skimmer'],
    budget: 1500,
    forward: 'skimmer-prow',
    sites: [
      { label: 'parked sled     (SurfaceScene.tsx)', asset: 'survey-skimmer', min: [-0.93, 0, -1.9], max: [0.93, 2.05, 1.35] },
    ],
    anchors: {
      site: 0,
      note: 'SkimmerSled in SurfaceScene.tsx',
      points: [
        ['scanner ball   ', [0, 1.19, 2.02], ''],
        ['running strips ', [0.68, -0.15, 0.65], 'mirrored pair'],
      ],
    },
  },
  {
    id: 'settlements',
    script: 'settlements.py',
    blend: 'settlements.blend',
    glb: 'meshes/settlements/settlement-kit.glb',
    // The nine the TSX asks for by name, plus optional variants. A missing
    // variant is not an error — the family falls back to its base asset — but
    // a missing BASE is, so only the nine are required here.
    names: ['hab-shell', 'roof', 'mast', 'dome', 'pad', 'stilt', 'works', 'banner', 'scaffold'],
    optional: ['hab-shell-b', 'hab-shell-c', 'roof-b', 'roof-c', 'dome-b', 'stilt-b', 'works-b'],
    // Instanced per asset, so the budget that bites is the per-asset one.
    perAsset: 900,
    budget: 16000,
    skewLimit: null, // the seat matrix owns proportions here — see fitBox()
    sites: [
      { label: 'hab shells      (unit frame)', asset: 'hab-shell', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { label: 'roofs           (unit frame)', asset: 'roof', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { label: 'domes           (dome frame)', asset: 'dome', min: [-1, -0.063, -1], max: [1, 1, 1] },
      { label: 'pads            (pad frame)', asset: 'pad', min: [-1, -0.5, -1], max: [1, 0.5, 1] },
    ],
  },
  {
    id: 'creatures',
    script: 'creatures.py',
    blend: 'creatures.blend',
    glb: 'meshes/props/creatures.glb',
    names: ['grazer', 'flier', 'shoal-fish', 'mote', 'nest-mound', 'shell-bed', 'bone-arch'],
    perAsset: 900,
    budget: 6000,
    skewLimit: null, // fitted by extent, then posed by the frame loop
    // Animated in the vertex stage off a baked mask, so the second UV set is
    // load-bearing: without it the creatures stand still, and if only SOME
    // meshes carry it the merge returns null and they vanish entirely.
    requireAttributes: ['uv1'],
    sites: [
      { label: 'grazer          (extent fit)', asset: 'grazer', min: [-0.6, -0.6, -0.6], max: [0.6, 0.6, 0.6] },
      { label: 'flier           (extent fit)', asset: 'flier', min: [-0.6, -0.6, -0.6], max: [0.6, 0.6, 0.6] },
    ],
  },
  {
    id: 'ore',
    script: 'ore.py',
    blend: 'ore.blend',
    glb: 'meshes/seams/crystal-seam-kit.glb',
    names: ['crystal-shard'],
    // Four per seam, and the seam census reaches kilometres. Cheap or nothing.
    budget: 140,
    skewLimit: null, // the seam's seat stretches it along the growth axis
    sites: [
      { label: 'seam shards     (extent fit)', asset: 'crystal-shard', min: [-0.7, -0.7, -0.7], max: [0.7, 0.7, 0.7] },
    ],
  },
  {
    id: 'clouds',
    script: 'clouds.py',
    blend: 'clouds.blend',
    glb: 'meshes/sky/cloud-banks.glb',
    names: ['cloud-bank-a', 'cloud-bank-b', 'cloud-bank-c'],
    perAsset: 600,
    budget: 1600,
    skewLimit: null, // instanced at wildly different sizes by the frame loop
    sites: [
      { label: 'banks           (extent fit)', asset: 'cloud-bank-a', min: [-1, -1, -1], max: [1, 1, 1] },
    ],
  },
];

function findBlender() {
  for (const candidate of BLENDER_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Blender not found. Set $BLENDER to blender.exe, or install it.\nLooked in:\n  ${BLENDER_CANDIDATES.join('\n  ')}`,
  );
}

function runBlender(blender, script, blend, glb) {
  const output = execFileSync(
    blender,
    ['--background', '--factory-startup', '--python', script,
      '--', '--blend', blend, '--glb', glb],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // Blender narrates every exported primitive; only the model's own report is
  // interesting, and it is the part that fails loudly.
  for (const line of output.split(/\r?\n/)) {
    if (/^(\w[\w -]*:\s\d|\s{2}(bounds|size|authored|envelope|fit |wrote|OVER|bevel))/.test(line)) {
      console.log(line);
    }
  }
}

async function build(asset, blender) {
  // The original route: a procedural kit whose Python IS the model.
  if (asset.script) {
    runBlender(
      blender,
      resolve(SOURCE_ROOT, 'blender', asset.script),
      resolve(SOURCE_ROOT, 'blender', asset.blend),
      resolve(PUBLIC_ROOT, asset.glb),
    );
    return;
  }
  // The no-code route: a modelled file, exported if needed, then normalized.
  const src = resolve(SOURCE_ROOT, asset.source);
  if (!existsSync(src)) throw new Error(`${asset.id}: source file missing: ${src}`);
  let input = src;
  if (src.endsWith('.blend')) {
    input = resolve(ensureDir(TMP_ROOT), `${asset.id}-export.glb`);
    runBlender(blender, resolve(ROOT, 'scripts', 'uplift', 'blend-export.py'), src, input);
  }
  console.log(`${asset.id}: normalizing ${asset.source}`);
  const io = createIO();
  const doc = await io.read(input).catch((err) => {
    throw new Error(
      `${asset.id}: could not read ${input}: ${err.message}\n`
      + `If it is Draco/meshopt-compressed:  npx @gltf-transform/cli copy "${input}" decompressed.glb`,
    );
  });
  // A dropped file names itself: derive on first build, persist to the
  // sidecar, and from then on the sidecar is the source of truth.
  if (asset.imported && !asset.names) {
    const derived = deriveNames(doc, asset.id);
    asset.names = derived.names;
    asset.rename = { ...derived.rename, ...(asset.rename ?? {}) };
    if (writeSidecarIfMissing(asset, derived)) {
      console.log(`  wrote ${relative(ROOT, asset.sidecar)} — this import's config; edit to override`);
    }
  }
  const report = await normalizeDocument(doc, {
    rename: asset.rename,
    names: asset.names, // optional variants may be absent; verify tolerates that
  });
  const out = resolve(PUBLIC_ROOT, asset.glb);
  ensureDir(dirname(out));
  writeFileSync(out, await io.writeBinary(doc));
  printReport(report);
}

// loadKit / kitGeometry / fitBox / fittedPoint — the literal transcription of
// the game's loading path — live in kit-contract.mjs, shared with the tests.

async function verify(asset) {
  // A never-configured import verifies against what actually shipped.
  if (!asset.names) asset.names = await namesFromShipped(asset);
  const path = resolve(PUBLIC_ROOT, asset.glb);
  console.log(`\n${asset.id} — ${asset.glb} (${(statSync(path).size / 1024).toFixed(0)} KB)`);
  const scene = await loadKit(path);

  const present = [];
  scene.traverse((o) => present.push(o.name));
  const missing = asset.names.filter((n) => !present.includes(n));
  if (missing.length) throw new Error(`kit is missing required node(s): ${missing.join(', ')}`);

  let failed = false;
  const fits = [];
  if (asset.requireAttributes) {
    for (const name of asset.names) {
      const { attributes } = kitGeometry(scene, name);
      const missing = asset.requireAttributes.filter((a) => !attributes.split(',').includes(a));
      if (missing.length) {
        console.log(`  ${name}: MISSING ${missing.join(', ')}`);
        failed = true;
      }
    }
  }
  for (const site of asset.sites ?? []) {
    const { merged, parts, attributes } = kitGeometry(scene, site.asset);
    const tris = merged.getAttribute('position').count / 3;
    const fit = fitBox(merged, site);
    fits.push({ ...fit, min: site.min });
    // A near-1 ratio between the three fit scales means the box fit is close
    // to uniform, which is the only way the authored shape survives it.
    //
    // That only matters where the fitted envelope IS the final shape — the
    // vehicles. A settlement family is fitted into the UNIT frame of the
    // primitive it replaces and then given its real dimensions by the seat
    // matrix, so a big skew there is the design, not a defect: `skewLimit:
    // null` opts out and reports the number for information only.
    const limit = asset.skewLimit === undefined ? 1.25 : asset.skewLimit;
    const skew = Math.max(...fit.scale) / Math.min(...fit.scale);
    const bad = limit !== null && skew > limit;
    if (bad) failed = true;
    console.log(
      `  ${site.label}\n`
      + `      ${parts} meshes, ${tris} tris, attrs [${attributes}]\n`
      + `      fit scale ${fit.scale.map((v) => v.toFixed(3)).join(' / ')}`
      + `  skew ${skew.toFixed(2)}×${bad ? '  <-- DISTORTS' : ''}`,
    );
  }

  // Orientation: after the loader's rotateY(PI) the nose must lead on -Z, so
  // in the file it has to sit on +Z. Getting this wrong flies it backwards.
  // Only vehicles have a front; a settlement is placed by its seat matrix.
  if (asset.forward) {
    const nose = scene.getObjectByName(asset.forward);
    nose.geometry.computeBoundingBox();
    const noseZ = nose.geometry.boundingBox.max.z;
    console.log(`  forward part '${asset.forward}' on +Z: ${noseZ > 0 ? 'yes' : 'NO — it faces backwards'}`);
    if (noseZ <= 0) failed = true;
  }

  // Every asset in the file gets merged and measured — a kit is only as good
  // as its worst member, and the ones with no call site listed above are
  // exactly the ones nobody would notice breaking.
  let total = 0;
  let aliased = 0;
  const over = [];
  for (const name of [...asset.names, ...(asset.optional ?? [])]) {
    if (!present.includes(name)) continue;
    const { merged } = kitGeometry(scene, name);
    const tris = merged.getAttribute('position').count / 3;
    // An alias is a separately-fetched view of geometry another name already
    // counts (the cockpit prow); real file weight, but not new scene cost.
    if (asset.alias?.includes(name)) {
      aliased += tris;
      continue;
    }
    total += tris;
    if (asset.perAsset && tris > asset.perAsset) over.push(`${name} ${tris}`);
  }
  if (asset.perAsset) {
    console.log(`  ${asset.names.length + (asset.optional?.length ?? 0)} assets, ${total} triangles`
      + `  (per-asset budget ${asset.perAsset})`);
    if (over.length) {
      console.log(`    OVER: ${over.join(', ')}`);
      failed = true;
    }
  } else if (asset.budget) {
    const dup = aliased ? `, +${aliased} in duplicate views` : '';
    console.log(`  whole asset: ${total} triangles (budget ${asset.budget}${dup})${total > asset.budget ? '  <-- OVER' : ''}`);
    if (total > asset.budget) failed = true;
  } else {
    // No budget declared yet — report the number so someone declares one.
    console.log(`  whole asset: ${total} triangles (no budget declared)`);
  }

  if (asset.anchors) {
    const fit = fits[asset.anchors.site];
    console.log(`  fitted anchors for ${asset.anchors.note}:`);
    for (const [label, point, note] of asset.anchors.points) {
      const p = fittedPoint(point, fit).map((v) => v.toFixed(3)).join(', ');
      console.log(`    ${label} [${p}]${note ? `  (${note})` : ''}`);
    }
  }

  if (failed) throw new Error(`${asset.id}: verification failed`);
}

// Everything dropped into assets-source/uplift/models/ is an asset too — no
// entry above required. See imports.mjs for what is derived and how the
// sidecar overrides it.
const IMPORTS = discoverImports();
for (const imp of IMPORTS) {
  if (ASSETS.some((a) => a.id === imp.id)) {
    throw new Error(`import '${imp.source}' collides with the scripted asset id '${imp.id}' — rename the file`);
  }
}
const REGISTRY = [...ASSETS, ...IMPORTS];

const argv = process.argv.slice(2);
const verifyOnly = argv.includes('--verify');
const wanted = argv.filter((a) => !a.startsWith('--'));
const selected = wanted.length ? REGISTRY.filter((a) => wanted.includes(a.id)) : REGISTRY;
if (!selected.length) throw new Error(`no such asset: ${wanted.join(', ')}`);

if (!verifyOnly) {
  // Blender is only needed for scripted kits and .blend sources — a .glb
  // source normalizes without it, so a machine with no Blender can still
  // import downloaded models.
  const needsBlender = selected.some((a) => a.script || a.source?.endsWith('.blend'));
  const blender = needsBlender ? findBlender() : null;
  if (blender) console.log(`Blender: ${blender}`);
  for (const asset of selected) await build(asset, blender);
}
for (const asset of selected) await verify(asset);
// The game's side of the handshake: which imported kits to prefetch.
if (writeImportsManifest(IMPORTS)) {
  console.log(`\nupdated ${relative(ROOT, resolve(ROOT, 'src', 'ui', 'scene', 'uplift', 'importsManifest.ts'))}`);
}
console.log('\nOK');
