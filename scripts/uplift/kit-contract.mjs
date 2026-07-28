/**
 * The game's kit-loading contract, transcribed for Node.
 *
 * `kitGeometry()` here is a literal copy of the one in
 * src/ui/scene/uplift/upliftAssets.ts: find a node BY NAME, merge every mesh
 * beneath it into one geometry, bake each part's material colour into vertex
 * colours. Kept literal on purpose — if the runtime merge would throw, this
 * throws too, which is what lets build-ship.mjs and the tests *prove* a GLB
 * will survive the game rather than assume it.
 *
 * Shared by scripts/uplift/build-ship.mjs (verification) and
 * test/normalize.test.mjs (the normalizer's proof). Change the runtime loader
 * and this file must follow, or the proof goes stale.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Load a GLB the way GLTFLoader does in the browser, without a network. */
export async function loadKit(path) {
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
export function kitGeometry(scene, name) {
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
export function fitBox(base, { min, max }, rotateY = Math.PI) {
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
export function fittedPoint(blender, fit) {
  const g = [-blender[0], blender[2], blender[1]];
  return [0, 1, 2].map((i) => fit.min[i] + (g[i] - fit.bbMin[i]) * fit.scale[i]);
}
