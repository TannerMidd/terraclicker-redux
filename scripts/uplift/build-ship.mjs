/**
 * Build the Blender-authored runabout (ASSET_UPLIFT.md 3.1) and prove it
 * survives the path the game actually loads it through.
 *
 * The proof matters more than the build. `kitGeometry()` merges every mesh
 * under a named node into ONE geometry and bakes material colour into vertex
 * colours — a model that opens perfectly in Blender still fails in-game if a
 * mesh is missing UVs, if the asset names moved, or if the axis convention
 * came out wrong. So this runs the real merge here, in node, against the real
 * file, and reports the fitted result for every call site.
 *
 *   node scripts/uplift/build-ship.mjs            build, verify, install
 *   node scripts/uplift/build-ship.mjs --verify   verify the shipped GLB only
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

const SCRIPT = resolve(SOURCE_ROOT, 'blender', 'runabout.py');
const BLEND = resolve(SOURCE_ROOT, 'blender', 'runabout.blend');
const GLB = resolve(PUBLIC_ROOT, 'meshes', 'ships', 'runabout.glb');

/** Names the game reads out of this kit. Renaming one is a silent breakage. */
const REQUIRED_NAMES = ['runabout', 'hull-nose'];

/** Every call site's box fit, so a silhouette change is measured, not guessed. */
const CALL_SITES = [
  {
    label: 'chase exterior  (RunaboutExterior.tsx)',
    asset: 'runabout',
    min: [-0.76, -0.12, -0.85],
    max: [0.76, 0.26, 0.79],
  },
  {
    label: 'landed on world (SurfaceScene.tsx)',
    asset: 'runabout',
    min: [-0.71, 0, -0.85],
    max: [0.71, 0.42, 0.7],
  },
  {
    label: 'cockpit prow    (RunaboutHull.tsx)',
    asset: 'hull-nose',
    min: [-0.029, -0.01, -0.065],
    max: [0.029, 0.01, 0.065],
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

function build() {
  const blender = findBlender();
  console.log(`Blender: ${blender}`);
  const output = execFileSync(
    blender,
    ['--background', '--factory-startup', '--python', SCRIPT,
      '--', '--blend', BLEND, '--glb', GLB],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // Blender narrates every exported primitive; only the model's own report is
  // interesting, and it is the part that fails loudly.
  for (const line of output.split(/\r?\n/)) {
    if (/^(runabout:|\s{2}(bounds|size|authored|envelope|fit |wrote|OVER|bevel))/.test(line)) {
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

/** kitGeometryFit()'s box mode, same file. */
function fitBox(base, { min, max }, rotateY = Math.PI) {
  const geo = base.clone();
  if (rotateY) geo.rotateY(rotateY);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const s = [0, 1, 2].map((i) => (max[i] - min[i]) / Math.max(1e-5, size[i]));
  geo.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(
        min[0] - bb.min.x * s[0],
        min[1] - bb.min.y * s[1],
        min[2] - bb.min.z * s[2],
      )
      .multiply(new THREE.Matrix4().makeScale(s[0], s[1], s[2])),
  );
  return { geo, scale: s };
}

async function verify() {
  console.log(`\nVerifying ${GLB.replace(ROOT, '.').replaceAll('\\', '/')} `
    + `(${(statSync(GLB).size / 1024).toFixed(0)} KB)`);
  const scene = await loadKit(GLB);

  const present = [];
  scene.traverse((o) => present.push(o.name));
  const missing = REQUIRED_NAMES.filter((n) => !present.includes(n));
  if (missing.length) throw new Error(`kit is missing required node(s): ${missing.join(', ')}`);

  let failed = false;
  for (const site of CALL_SITES) {
    const { merged, parts, attributes } = kitGeometry(scene, site.asset);
    const tris = merged.getAttribute('position').count / 3;
    const { scale } = fitBox(merged, site);
    // A near-1 ratio between the three fit scales means the box fit is close
    // to uniform, which is the only way the authored shape survives it.
    const skew = Math.max(...scale) / Math.min(...scale);
    const flag = skew > 1.25 ? '  <-- DISTORTS' : '';
    if (skew > 1.25) failed = true;
    console.log(
      `  ${site.label}\n`
      + `      ${parts} meshes, ${tris} tris, attrs [${attributes}]\n`
      + `      fit scale ${scale.map((v) => v.toFixed(3)).join(' / ')}  skew ${skew.toFixed(2)}×${flag}`,
    );
  }

  // Orientation: after the loader's rotateY(PI) the nose must lead on -Z and
  // the gear must be the floor. Getting this wrong flies the ship backwards.
  const { merged } = kitGeometry(scene, 'runabout');
  const { geo } = fitBox(merged, CALL_SITES[0]);
  geo.computeBoundingBox();
  const nose = scene.getObjectByName('hull-nose');
  nose.geometry.computeBoundingBox();
  const noseZ = nose.geometry.boundingBox.max.z;
  console.log(`\n  prow sits at +Z in the file: ${noseZ > 0 ? 'yes' : 'NO — ship faces backwards'}`);
  if (noseZ <= 0) failed = true;

  const tris = merged.getAttribute('position').count / 3;
  console.log(`  whole ship: ${tris} triangles (budget 4000)${tris > 4000 ? '  <-- OVER' : ''}`);
  if (tris > 4000) failed = true;

  // Where the separately-drawn emissive bits must sit on THIS hull. They are
  // basic-material meshes in RunaboutExterior.tsx, not part of the merge, so
  // they do not move themselves when the model changes.
  const map = (x, y, z) => {
    const b = { x: [-6.45, 6.45], y: [-1.3, 2.2], z: [-8, 6] };
    const site = CALL_SITES[0];
    const f = (v, [lo, hi], i) => site.min[i] + ((v - lo) / (hi - lo)) * (site.max[i] - site.min[i]);
    return [f(x, b.x, 0), f(z, b.y, 1), f(y, b.z, 2)];
  };
  const fmt = (p) => `[${p.map((v) => v.toFixed(3)).join(', ')}]`;
  console.log('\n  Fitted anchors for RunaboutExterior.tsx:');
  console.log(`    wingtip lamps   ${fmt(map(6.28, 1.35, 0.19))} (mirror x for port)`);
  console.log(`    dorsal beacon   ${fmt(map(0, 0.6, 1.15))}`);
  console.log(`    engine exhausts ${fmt(map(2.88, 6.0, 0.26))} (mirror x for port)`);

  if (failed) throw new Error('verification failed');
  console.log('\nOK');
}

const verifyOnly = process.argv.includes('--verify');
if (!verifyOnly) build();
await verify();
