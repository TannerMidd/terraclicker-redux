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
 * Blender is found via $BLENDER, else the usual install roots.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PUBLIC_ROOT, ROOT, SOURCE_ROOT } from './helpers.mjs';

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
 */
const ASSETS = [
  {
    id: 'runabout',
    script: 'runabout.py',
    blend: 'runabout.blend',
    glb: 'meshes/ships/runabout.glb',
    names: ['runabout', 'hull-nose'],
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
];

function findBlender() {
  for (const candidate of BLENDER_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Blender not found. Set $BLENDER to blender.exe, or install it.\nLooked in:\n  ${BLENDER_CANDIDATES.join('\n  ')}`,
  );
}

function build(asset, blender) {
  const output = execFileSync(
    blender,
    ['--background', '--factory-startup', '--python', resolve(SOURCE_ROOT, 'blender', asset.script),
      '--', '--blend', resolve(SOURCE_ROOT, 'blender', asset.blend),
      '--glb', resolve(PUBLIC_ROOT, asset.glb)],
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

/** Load a GLB the way GLTFLoader does in the browser, without a network. */
async function loadKit(path) {
  const buffer = readFileSync(path);
  const array = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const loader = new GLTFLoader();
  const gltf = await new Promise((res, rej) => loader.parse(array, '', res, rej));
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

/**
 * kitGeometry(), transcribed from src/ui/scene/uplift/upliftAssets.ts. Kept
 * literal on purpose: if the runtime merge would throw, this throws too.
 */
function kitGeometry(scene, name) {
  const root = scene.getObjectByName(name);
  if (!root) throw new Error(`asset '${name}' is missing from the kit`);
  const rootInverse = root.matrixWorld.clone().invert();
  const parts = [];
  const attributeSets = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const geo = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, obj.matrixWorld));
    const color = obj.material?.color ?? new THREE.Color(1, 1, 1);
    const count = geo.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    attributeSets.add(Object.keys(geo.attributes).sort().join(','));
    parts.push(geo);
  });
  if (parts.length === 0) throw new Error(`asset '${name}' has no meshes`);
  if (attributeSets.size > 1) {
    throw new Error(
      `mixed vertex attributes would make mergeGeometries return null:\n  ${[...attributeSets].join('\n  ')}`,
    );
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error(`mergeGeometries refused '${name}'`);
  return { merged, parts: parts.length, attributes: [...attributeSets][0] };
}

/** kitGeometryFit()'s box mode, same file. Returns the fit's own frame too. */
function fitBox(base, { min, max }, rotateY = Math.PI) {
  const geo = base.clone();
  if (rotateY) geo.rotateY(rotateY);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const scale = [0, 1, 2].map((i) => (max[i] - min[i]) / Math.max(1e-5, size[i]));
  // Read before the transform: applyMatrix4 RECOMPUTES boundingBox in place,
  // so `bb` stops describing the pre-fit model the moment the fit is applied.
  const bbMin = bb.min.toArray();
  geo.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(
        min[0] - bb.min.x * scale[0],
        min[1] - bb.min.y * scale[1],
        min[2] - bb.min.z * scale[2],
      )
      .multiply(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2])),
  );
  return { geo, scale, bbMin };
}

/**
 * A point authored in Blender axes, in the fitted frame the TSX works in.
 * Derived from the real geometry rather than hardcoded, so it stays true when
 * the model moves. Blender (x, y, z) is glTF (x, z, -y), and the fit spins
 * that by PI first.
 */
function fittedPoint(blender, fit) {
  const g = [-blender[0], blender[2], blender[1]];
  return [0, 1, 2].map((i) => fit.min[i] + (g[i] - fit.bbMin[i]) * fit.scale[i]);
}

async function verify(asset) {
  const path = resolve(PUBLIC_ROOT, asset.glb);
  console.log(`\n${asset.id} — ${asset.glb} (${(statSync(path).size / 1024).toFixed(0)} KB)`);
  const scene = await loadKit(path);

  const present = [];
  scene.traverse((o) => present.push(o.name));
  const missing = asset.names.filter((n) => !present.includes(n));
  if (missing.length) throw new Error(`kit is missing required node(s): ${missing.join(', ')}`);

  let failed = false;
  const fits = [];
  for (const site of asset.sites) {
    const { merged, parts, attributes } = kitGeometry(scene, site.asset);
    const tris = merged.getAttribute('position').count / 3;
    const fit = fitBox(merged, site);
    fits.push({ ...fit, min: site.min });
    // A near-1 ratio between the three fit scales means the box fit is close
    // to uniform, which is the only way the authored shape survives it.
    const skew = Math.max(...fit.scale) / Math.min(...fit.scale);
    if (skew > 1.25) failed = true;
    console.log(
      `  ${site.label}\n`
      + `      ${parts} meshes, ${tris} tris, attrs [${attributes}]\n`
      + `      fit scale ${fit.scale.map((v) => v.toFixed(3)).join(' / ')}`
      + `  skew ${skew.toFixed(2)}×${skew > 1.25 ? '  <-- DISTORTS' : ''}`,
    );
  }

  // Orientation: after the loader's rotateY(PI) the nose must lead on -Z, so
  // in the file it has to sit on +Z. Getting this wrong flies it backwards.
  const nose = scene.getObjectByName(asset.forward);
  nose.geometry.computeBoundingBox();
  const noseZ = nose.geometry.boundingBox.max.z;
  console.log(`  forward part '${asset.forward}' on +Z: ${noseZ > 0 ? 'yes' : 'NO — it faces backwards'}`);
  if (noseZ <= 0) failed = true;

  const { merged } = kitGeometry(scene, asset.names[0]);
  const tris = merged.getAttribute('position').count / 3;
  console.log(`  whole asset: ${tris} triangles (budget ${asset.budget})${tris > asset.budget ? '  <-- OVER' : ''}`);
  if (tris > asset.budget) failed = true;

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

const argv = process.argv.slice(2);
const verifyOnly = argv.includes('--verify');
const wanted = argv.filter((a) => !a.startsWith('--'));
const selected = wanted.length ? ASSETS.filter((a) => wanted.includes(a.id)) : ASSETS;
if (!selected.length) throw new Error(`no such asset: ${wanted.join(', ')}`);

if (!verifyOnly) {
  const blender = findBlender();
  console.log(`Blender: ${blender}`);
  for (const asset of selected) build(asset, blender);
}
for (const asset of selected) await verify(asset);
console.log('\nOK');
