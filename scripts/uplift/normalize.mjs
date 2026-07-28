/**
 * Normalize any GLB into a kit the game's merge will accept.
 *
 * The loader (kitGeometry in src/ui/scene/uplift/upliftAssets.ts) is strict:
 * uniform vertex attributes on every mesh, UVs everywhere, no tangents or
 * vertex colours, identity transforms, flat material colours. Historically
 * those rules were satisfied by authoring models in per-asset Blender Python —
 * this pass exists so they no longer have to be. Model in the Blender GUI,
 * download a CC0 pack, generate a mesh — whatever produces the GLB, this
 * repairs it:
 *
 *   - bakes every node's world transform into the vertex data and resets the
 *     node to identity (kills the "ship arrives on its side" class of bug,
 *     including mirrored parts, whose winding is flipped back);
 *   - strips what the merge refuses or ignores: tangents, vertex colours,
 *     skinning, morph targets, animations, cameras;
 *   - generates the missing pieces: flat normals where a mesh has none, and
 *     box-projected UVs at the kit-wide metres-per-tile where UVs are absent
 *     (same projection as kitlib.py's box_uvs — the atlas is grain, and grain
 *     only needs density, not artistry);
 *   - keeps attribute sets uniform: if any part carries a motion mask
 *     (TEXCOORD_1), rigid parts get a zero-filled one instead of none at all;
 *   - reduces materials to their flat baseColorFactor — the only thing the
 *     merge reads — and WARNS when that discards a texture, because a
 *     texture-painted download will arrive as one flat colour per material.
 *
 * What it cannot do: author a motion mask (that is animation design, not
 * repair), or turn a texture into per-part colours. It warns instead.
 *
 *   node scripts/uplift/normalize.mjs model.glb --out public/.../model.glb
 *   node scripts/uplift/normalize.mjs model.glb --inspect        look, don't write
 *   node scripts/uplift/normalize.mjs model.glb --rename Cube=person
 *
 * build-ship.mjs runs this automatically for every registry asset that has a
 * `source:` instead of a `script:` — see docs/BLENDER_PIPELINE.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import * as THREE from 'three';

/** Mirrors UV_METRES_PER_TILE in kitlib.py — texel density, not decoration. */
export const UV_METRES_PER_TILE = 2.5;

/** What the merge keeps. Everything else is stripped, not warned about. */
const KEEP = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'TEXCOORD_1']);

/** glTF semantic → the three.js attribute name verify prints, for familiarity. */
const THREE_NAMES = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', TEXCOORD_1: 'uv1' };

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const isIdentity = (m) => m.elements.every((v, i) => v === IDENTITY[i]);

export function createIO() {
  return new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
}

// ————— Small pieces —————

function cloneAccessor(doc, acc) {
  return doc
    .createAccessor(acc.getName())
    .setType(acc.getType())
    .setNormalized(acc.getNormalized())
    .setArray(acc.getArray().slice())
    .setBuffer(acc.getBuffer() ?? doc.getRoot().listBuffers()[0] ?? doc.createBuffer());
}

/** A private copy of a mesh, down to the accessors, so edits cannot alias. */
function deepCloneMesh(doc, mesh) {
  const copy = doc.createMesh(mesh.getName());
  for (const prim of mesh.listPrimitives()) {
    const p = doc.createPrimitive().setMode(prim.getMode()).setMaterial(prim.getMaterial());
    for (const sem of prim.listSemantics()) p.setAttribute(sem, cloneAccessor(doc, prim.getAttribute(sem)));
    if (prim.getIndices()) p.setIndices(cloneAccessor(doc, prim.getIndices()));
    copy.addPrimitive(p);
  }
  return copy;
}

/**
 * Quantized attributes (KHR_mesh_quantization exports) come out as normalized
 * ints; the bake and the merge both want plain floats.
 */
function toFloat(acc) {
  if (acc.getArray() instanceof Float32Array && !acc.getNormalized()) return false;
  const count = acc.getCount();
  const size = acc.getElementSize();
  const out = new Float32Array(count * size);
  const el = [];
  for (let i = 0; i < count; i++) {
    acc.getElement(i, el);
    for (let j = 0; j < size; j++) out[i * size + j] = el[j];
  }
  acc.setArray(out).setNormalized(false);
  return true;
}

/** Expand an indexed primitive so per-face data can be written per-vertex. */
function deindex(doc, prim, buffer) {
  const indices = prim.getIndices();
  if (!indices) return;
  const idx = indices.getArray();
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem);
    const size = acc.getElementSize();
    const src = acc.getArray();
    const out = new Float32Array(idx.length * size);
    for (let i = 0; i < idx.length; i++) {
      for (let j = 0; j < size; j++) out[i * size + j] = src[idx[i] * size + j];
    }
    prim.setAttribute(
      sem,
      doc.createAccessor(acc.getName()).setType(acc.getType()).setArray(out).setBuffer(buffer),
    );
  }
  prim.setIndices(null);
}

/** Flat face normals — these are faceted kits; smooth is not the house style. */
function computeFlatNormals(doc, prim, buffer) {
  deindex(doc, prim, buffer);
  const pos = prim.getAttribute('POSITION').getArray();
  const out = new Float32Array(pos.length);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < pos.length; t += 9) {
    a.fromArray(pos, t);
    b.fromArray(pos, t + 3).sub(a);
    c.fromArray(pos, t + 6).sub(a);
    const n = b.cross(c).normalize(); // CCW front face, glTF's convention
    if (n.lengthSq() === 0) n.set(0, 1, 0); // degenerate triangle; any unit vector
    for (let v = 0; v < 3; v++) {
      out[t + v * 3] = n.x;
      out[t + v * 3 + 1] = n.y;
      out[t + v * 3 + 2] = n.z;
    }
  }
  prim.setAttribute('NORMAL', doc.createAccessor('normal').setType('VEC3').setArray(out).setBuffer(buffer));
}

/**
 * Deterministic box projection at the kit-wide metres-per-tile. Same rule as
 * kitlib.py's box_uvs: dominant normal axis picks the plane, ties go x, y, z.
 */
function boxUvs(doc, prim, buffer) {
  const pos = prim.getAttribute('POSITION').getArray();
  const nor = prim.getAttribute('NORMAL').getArray();
  const count = pos.length / 3;
  const uv = new Float32Array(count * 2);
  const s = 1 / UV_METRES_PER_TILE;
  for (let i = 0; i < count; i++) {
    const nx = Math.abs(nor[i * 3]);
    const ny = Math.abs(nor[i * 3 + 1]);
    const nz = Math.abs(nor[i * 3 + 2]);
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    let u;
    let v;
    if (nx >= ny && nx >= nz) [u, v] = [y, z];
    else if (ny >= nz) [u, v] = [x, z];
    else [u, v] = [x, y];
    uv[i * 2] = u * s;
    uv[i * 2 + 1] = v * s;
  }
  prim.setAttribute('TEXCOORD_0', doc.createAccessor('uv').setType('VEC2').setArray(uv).setBuffer(buffer));
}

/** A mirrored transform flips winding; unflip it or the part renders inside-out. */
function flipWinding(prim) {
  const indices = prim.getIndices();
  if (indices) {
    const arr = indices.getArray();
    for (let i = 0; i + 2 < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
    indices.setArray(arr);
    return;
  }
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem);
    const size = acc.getElementSize();
    const arr = acc.getArray();
    const stride = size * 3;
    for (let t = 0; t + stride <= arr.length; t += stride) {
      for (let j = 0; j < size; j++) {
        const x = t + size + j;
        const y = t + 2 * size + j;
        const tmp = arr[x];
        arr[x] = arr[y];
        arr[y] = tmp;
      }
    }
    acc.setArray(arr);
  }
}

function meshNodes(doc) {
  return doc.getRoot().listNodes().filter((n) => n.getMesh());
}

/** Scene children that contain meshes — the candidates for registry `names`. */
export function findRoots(doc) {
  const roots = [];
  for (const scene of doc.getRoot().listScenes()) {
    for (const child of scene.listChildren()) {
      let meshes = 0;
      const walk = (node) => {
        if (node.getMesh()) meshes += 1;
        node.listChildren().forEach(walk);
      };
      walk(child);
      if (meshes > 0) roots.push(child.getName() || '(unnamed)');
    }
  }
  return roots;
}

// ————— The pass —————

/**
 * Mutates `doc` into merge-safe form. Returns a report:
 *   { fixes: string[], warnings: string[], roots: [{name, meshes, tris, attributes}] }
 *
 * options.rename — { fromName: toName } applied to nodes first, so a download
 *                  can be taught the names the registry asserts.
 * options.names  — the registry's names, used only for the per-root summary;
 *                  existence is verify's job, but a miss is warned here early.
 */
export async function normalizeDocument(doc, options = {}) {
  const report = { fixes: [], warnings: [], roots: [] };
  doc.setLogger(new Logger(Logger.Verbosity.WARN)); // the report speaks; prune's play-by-play does not
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0] ?? doc.createBuffer();

  // Names first: everything downstream, including the game, speaks them.
  for (const [from, to] of Object.entries(options.rename ?? {})) {
    let hits = 0;
    for (const node of root.listNodes()) {
      if (node.getName() === from) {
        node.setName(to);
        hits += 1;
      }
    }
    if (hits) report.fixes.push(`renamed node '${from}' -> '${to}'`);
    else report.warnings.push(`rename '${from}' -> '${to}' matched no node`);
  }

  // Riggery: the merge flattens the hierarchy, so none of this can survive —
  // remove it deliberately rather than let it fail obscurely.
  const anims = root.listAnimations().length;
  root.listAnimations().forEach((a) => a.dispose());
  if (anims) report.fixes.push(`removed ${anims} animation(s) — motion lives in the shader, not the file`);
  let skinned = 0;
  for (const node of root.listNodes()) {
    if (node.getSkin()) {
      node.setSkin(null);
      skinned += 1;
    }
    if (node.getCamera()) node.setCamera(null);
  }
  root.listSkins().forEach((s) => s.dispose());
  if (skinned) report.fixes.push(`removed skinning from ${skinned} mesh(es)`);
  let morphs = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const targets = prim.listTargets();
      morphs += targets.length;
      targets.forEach((t) => t.dispose());
    }
    mesh.setWeights([]);
  }
  if (morphs) report.fixes.push(`removed ${morphs} morph target(s)`);

  // A mesh reused by several nodes must become several meshes: every node ends
  // at identity, so shared geometry would collapse the copies onto each other.
  const used = new Set();
  let duplicated = 0;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (used.has(mesh)) {
      node.setMesh(deepCloneMesh(doc, mesh));
      duplicated += 1;
    } else {
      used.add(mesh);
    }
  }
  if (duplicated) report.fixes.push(`split ${duplicated} shared mesh reference(s) into real copies`);

  // Attributes: strip what the merge refuses, dequantize what it keeps.
  const stripped = new Set();
  let dequantized = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const sem of prim.listSemantics()) {
        if (!KEEP.has(sem)) {
          prim.setAttribute(sem, null);
          stripped.add(sem);
        } else if (toFloat(prim.getAttribute(sem))) {
          dequantized += 1;
        }
      }
    }
  }
  if (stripped.size) report.fixes.push(`stripped ${[...stripped].sort().join(', ')}`);
  if (dequantized) report.fixes.push(`dequantized ${dequantized} attribute(s) to float`);

  // Transforms: bake each node's WORLD matrix into its vertices and reset the
  // node. The loader cancels the asset root's transform (see §4.5 of the
  // pipeline doc); with everything at identity that cancel is a no-op and the
  // model arrives exactly as a viewer shows it.
  const baked = new Map(); // accessor -> world fingerprint it was baked with
  const pristine = new Map(); // accessor -> untouched copy, for a second, different placement
  let bakedNodes = 0;
  let cleared = 0;
  let mirrored = 0;
  const bakePrim = (prim, world) => {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    for (const sem of ['POSITION', 'NORMAL']) {
      let acc = prim.getAttribute(sem);
      if (!acc) continue;
      const fp = world.elements.join(',');
      const prev = baked.get(acc);
      if (prev === fp) continue; // sibling primitive sharing the accessor
      if (prev !== undefined) {
        // Shared with a DIFFERENT placement — split off a copy of the original.
        const copy = cloneAccessor(doc, acc);
        copy.setArray(pristine.get(acc).slice());
        prim.setAttribute(sem, copy);
        acc = copy;
      } else {
        pristine.set(acc, acc.getArray().slice());
      }
      const arr = acc.getArray();
      const v = new THREE.Vector3();
      for (let i = 0; i < arr.length; i += 3) {
        v.set(arr[i], arr[i + 1], arr[i + 2]);
        if (sem === 'POSITION') v.applyMatrix4(world);
        else v.applyMatrix3(normalMatrix).normalize();
        arr[i] = v.x;
        arr[i + 1] = v.y;
        arr[i + 2] = v.z;
      }
      acc.setArray(arr);
      baked.set(acc, fp);
    }
  };
  const walk = (node, parentWorld) => {
    const local = new THREE.Matrix4().fromArray(node.getMatrix());
    const world = parentWorld.clone().multiply(local);
    const mesh = node.getMesh();
    if (mesh && !isIdentity(world)) {
      for (const prim of mesh.listPrimitives()) bakePrim(prim, world);
      if (world.determinant() < 0) {
        for (const prim of mesh.listPrimitives()) flipWinding(prim);
        mirrored += 1;
      }
      bakedNodes += 1;
    }
    if (!isIdentity(local)) {
      node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
      cleared += 1;
    }
    node.listChildren().forEach((c) => walk(c, world));
  };
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) walk(child, new THREE.Matrix4());
  }
  if (bakedNodes) report.fixes.push(`baked transforms into ${bakedNodes} mesh(es), reset ${cleared} node(s) to identity`);
  if (mirrored) report.fixes.push(`unflipped winding on ${mirrored} mirrored mesh(es)`);

  // Normals and UVs: generate what is missing, in that order (the projection
  // needs normals). Non-triangle primitives get a warning, not a guess.
  let madeNormals = 0;
  let madeUvs = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) {
        report.warnings.push(`'${mesh.getName() || 'mesh'}' has a non-triangle primitive (mode ${prim.getMode()}) — the merge assumes triangles`);
        continue;
      }
      if (!prim.getAttribute('NORMAL')) {
        computeFlatNormals(doc, prim, buffer);
        madeNormals += 1;
      }
      if (!prim.getAttribute('TEXCOORD_0')) {
        boxUvs(doc, prim, buffer);
        madeUvs += 1;
      }
    }
  }
  if (madeNormals) report.fixes.push(`computed flat normals for ${madeNormals} primitive(s)`);
  if (madeUvs) report.fixes.push(`box-projected UVs onto ${madeUvs} primitive(s) at ${UV_METRES_PER_TILE} m/tile`);

  // Motion-mask uniformity: once any part carries TEXCOORD_1, every part must,
  // or the merge returns null. A rigid part is weight 0, not absent.
  const prims = root.listMeshes().flatMap((m) => m.listPrimitives());
  if (prims.some((p) => p.getAttribute('TEXCOORD_1'))) {
    let filled = 0;
    for (const prim of prims) {
      if (prim.getAttribute('TEXCOORD_1')) continue;
      const count = prim.getAttribute('POSITION').getCount();
      prim.setAttribute(
        'TEXCOORD_1',
        doc.createAccessor('motion').setType('VEC2').setArray(new Float32Array(count * 2)).setBuffer(buffer),
      );
      filled += 1;
    }
    if (filled) report.fixes.push(`zero-filled the motion mask (uv1) on ${filled} rigid primitive(s)`);
  }

  // Materials: only the flat baseColorFactor reaches the game. Anything else a
  // material carries is dead weight at best and a silent look-change at worst,
  // so reduce — and say so when a texture was doing the painting.
  const flats = new Map();
  let reduced = 0;
  for (const prim of prims) {
    const m = prim.getMaterial();
    const name = m?.getName() || 'flat';
    const factor = m ? m.getBaseColorFactor() : [1, 1, 1, 1];
    if (!m) report.warnings.push('a primitive has no material — it will arrive white');
    else if (m.getBaseColorTexture()) {
      report.warnings.push(
        `material '${name}' paints with a texture; only its flat baseColorFactor survives the merge — `
        + 'split the model into flat-coloured materials to keep the paint job',
      );
    }
    const key = `${name}|${factor.slice(0, 3).map((v) => v.toFixed(4)).join(',')}`;
    let flat = flats.get(key);
    if (!flat) {
      flat = doc
        .createMaterial(name)
        .setBaseColorFactor([factor[0], factor[1], factor[2], 1])
        .setRoughnessFactor(m ? m.getRoughnessFactor() : 0.5)
        .setMetallicFactor(m ? m.getMetallicFactor() : 0.0);
      flats.set(key, flat);
    }
    if (prim.getMaterial() !== flat) {
      prim.setMaterial(flat);
      reduced += 1;
    }
  }
  if (reduced) report.fixes.push(`reduced ${reduced} material assignment(s) to flat base colours`);

  // Sweep everything orphaned above. keepAttributes matters: TEXCOORD_1 is
  // referenced by no material, and prune would eat it without the flag.
  await doc.transform(prune({ keepAttributes: true, keepLeaves: true }));

  // Per-root summary, in the vocabulary verify prints.
  const names = options.names ?? findRoots(doc);
  for (const name of names) {
    const start = root.listNodes().find((n) => n.getName() === name);
    if (!start) {
      report.warnings.push(`asset '${name}' is not in this file — verify will fail`);
      continue;
    }
    let meshes = 0;
    let tris = 0;
    const attrs = new Set();
    const collect = (node) => {
      const mesh = node.getMesh();
      if (mesh) {
        for (const prim of mesh.listPrimitives()) {
          meshes += 1;
          const idx = prim.getIndices();
          tris += Math.floor((idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3);
          for (const sem of prim.listSemantics()) attrs.add(THREE_NAMES[sem] ?? sem);
        }
      }
      node.listChildren().forEach(collect);
    };
    collect(start);
    report.roots.push({ name, meshes, tris, attributes: [...attrs].sort().join(',') });
  }
  return report;
}

// ————— File in, file out —————

export async function normalizeFile(input, output, options = {}) {
  const io = createIO();
  let doc;
  try {
    doc = await io.read(input);
  } catch (err) {
    throw new Error(
      `could not read ${input}: ${err.message}\n`
      + 'If the file is Draco- or meshopt-compressed, decompress it once with\n'
      + `  npx @gltf-transform/cli copy "${input}" decompressed.glb`,
    );
  }
  const report = await normalizeDocument(doc, options);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, await io.writeBinary(doc));
  return { report };
}

export function printReport(report, log = console.log) {
  for (const fix of report.fixes) log(`  fixed: ${fix}`);
  for (const warning of report.warnings) log(`  WARN:  ${warning}`);
  for (const r of report.roots) {
    log(`  ${r.name}: ${r.meshes} mesh(es), ${r.tris} tris, attrs [${r.attributes}]`);
  }
}

/** What is actually in this file — run before writing a registry entry. */
export function inspectDocument(doc) {
  const lines = [];
  const factorHex = (f) => `#${f.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
  const describe = (node, depth) => {
    const mesh = node.getMesh();
    let info = '';
    if (mesh) {
      let tris = 0;
      const attrs = new Set();
      const mats = new Set();
      for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices();
        tris += Math.floor((idx ? idx.getCount() : prim.getAttribute('POSITION')?.getCount() ?? 0) / 3);
        for (const sem of prim.listSemantics()) attrs.add(THREE_NAMES[sem] ?? sem);
        const m = prim.getMaterial();
        if (m) mats.add(`'${m.getName() || 'unnamed'}' ${factorHex(m.getBaseColorFactor())}${m.getBaseColorTexture() ? '+tex' : ''}`);
      }
      info = ` — ${tris} tris [${[...attrs].sort().join(',')}] ${[...mats].join(' ') || 'no material'}`;
    }
    lines.push(`${'  '.repeat(depth)}${node.getName() || '(unnamed)'}${info}`);
    node.listChildren().forEach((c) => describe(c, depth + 1));
  };
  for (const scene of doc.getRoot().listScenes()) {
    for (const child of scene.listChildren()) describe(child, 0);
  }
  lines.push('');
  lines.push(`candidate registry names: ${findRoots(doc).join(', ') || '(none — no meshes found)'}`);
  lines.push('(material colours shown are linear, as the game reads them)');
  return lines;
}

// ————— CLI —————

const isMain = process.argv[1] && basename(process.argv[1]).toLowerCase() === 'normalize.mjs';
if (isMain) {
  const argv = process.argv.slice(2);
  const rename = {};
  let input;
  let output;
  let inspect = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--inspect') inspect = true;
    else if (arg === '--out') output = argv[++i];
    else if (arg === '--rename') {
      const [from, to] = String(argv[++i]).split('=');
      if (!from || !to) throw new Error('--rename wants from=to');
      rename[from] = to;
    } else if (!arg.startsWith('--')) input = arg;
    else throw new Error(`unknown flag ${arg}`);
  }
  if (!input) {
    console.log('usage: node scripts/uplift/normalize.mjs <model.glb|.gltf> [--out <path>] [--rename from=to] [--inspect]');
    process.exit(2);
  }
  const io = createIO();
  const doc = await io.read(input).catch((err) => {
    console.error(`could not read ${input}: ${err.message}`);
    console.error(`If it is Draco/meshopt-compressed:  npx @gltf-transform/cli copy "${input}" decompressed.glb`);
    process.exit(1);
  });
  if (inspect) {
    for (const [from, to] of Object.entries(rename)) {
      for (const node of doc.getRoot().listNodes()) if (node.getName() === from) node.setName(to);
    }
    for (const line of inspectDocument(doc)) console.log(line);
  } else {
    output ??= input.replace(/\.(glb|gltf)$/i, '') + '.normalized.glb';
    const report = await normalizeDocument(doc, { rename });
    mkdirSync(dirname(output) || '.', { recursive: true });
    writeFileSync(output, await io.writeBinary(doc));
    printReport(report);
    console.log(`  wrote ${output}`);
  }
}
