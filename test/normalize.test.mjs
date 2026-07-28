/**
 * The normalizer's proof: a GLB that breaks every rule in
 * docs/BLENDER_PIPELINE.md §4 goes in, and what comes out survives the game's
 * ACTUAL merge — kitGeometry from kit-contract.mjs, the literal transcription
 * of the runtime loader. If normalize "works" but the merge refuses the
 * result, these tests fail; that is the whole point of them.
 *
 * Plain .mjs on purpose: this exercises the node-side asset tooling, which is
 * untyped by design (see vite.config.ts's test.include).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document } from '@gltf-transform/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { kitGeometry } from '../scripts/uplift/kit-contract.mjs';
import { createIO, normalizeDocument, UV_METRES_PER_TILE } from '../scripts/uplift/normalize.mjs';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);

/** Parse GLB bytes the way the browser loader does (mirrors loadKit). */
async function parseScene(bytes) {
  const loader = new GLTFLoader();
  const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((res, rej) => loader.parse(array, '', res, rej));
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

/**
 * A model that violates every rule a GUI export or a downloaded pack tends to:
 *
 *   widget (root, translated — §4.5 says identity or it arrives wrong)
 *   ├─ hull  indexed 2.5 m cube; NO UVs; tangents, vertex colours, skinning
 *   │        attrs; textured material (§4.4, §4.2); its own translation
 *   ├─ mast  triangle carrying a motion mask (TEXCOORD_1) the others lack —
 *   │        exactly the mixed-attribute case that merges to null (§4.8)
 *   └─ fin   triangle with NO UVs and a MIRRORED transform (negative scale)
 */
function buildOffender() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('scene');

  const h = 1.25; // half of 2.5 m — one atlas tile exactly, for the UV test
  const cubePositions = new Float32Array([
    -h, -h, -h, +h, -h, -h, +h, +h, -h, -h, +h, -h,
    -h, -h, +h, +h, -h, +h, +h, +h, +h, -h, +h, +h,
  ]);
  const cubeIndices = new Uint16Array([
    4, 5, 6, 4, 6, 7, // +Z
    1, 0, 3, 1, 3, 2, // -Z
    5, 1, 2, 5, 2, 6, // +X
    0, 4, 7, 0, 7, 3, // -X
    7, 6, 2, 7, 2, 3, // +Y
    0, 1, 5, 0, 5, 4, // -Y
  ]);
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

  const texture = doc.createTexture('paintjob').setMimeType('image/png').setImage(PNG_1PX);
  const painted = doc
    .createMaterial('paint')
    .setBaseColorFactor([0.8, 0.1, 0.1, 1])
    .setBaseColorTexture(texture);

  const hullPrim = doc
    .createPrimitive()
    .setMode(4)
    .setIndices(acc('SCALAR', cubeIndices))
    .setAttribute('POSITION', acc('VEC3', cubePositions))
    .setAttribute('TANGENT', acc('VEC4', new Float32Array(8 * 4)))
    .setAttribute('COLOR_0', acc('VEC4', new Float32Array(8 * 4).fill(1)))
    .setAttribute('JOINTS_0', acc('VEC4', new Float32Array(8 * 4)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(8 * 4)))
    .setMaterial(painted);
  const hull = doc
    .createNode('hull')
    .setMesh(doc.createMesh('hull').addPrimitive(hullPrim))
    .setTranslation([0, 1, 0]);

  const triangle = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]); // faces +Z
  const mastPrim = doc
    .createPrimitive()
    .setMode(4)
    .setAttribute('POSITION', acc('VEC3', triangle.slice()))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array([0, 0, 1, 0, 0, 1])))
    .setAttribute('TEXCOORD_1', acc('VEC2', new Float32Array([1, 0.5, 1, 0.5, 1, 0.5])))
    .setMaterial(doc.createMaterial('mast-flat').setBaseColorFactor([0.2, 0.6, 0.9, 1]));
  const mast = doc
    .createNode('mast')
    .setMesh(doc.createMesh('mast').addPrimitive(mastPrim))
    // 90° about +Y: the authored +Z face normal must arrive pointing +X.
    .setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);

  const finPrim = doc
    .createPrimitive()
    .setMode(4)
    .setAttribute('POSITION', acc('VEC3', triangle.slice()))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])));
  const fin = doc
    .createNode('fin')
    .setMesh(doc.createMesh('fin').addPrimitive(finPrim))
    .setScale([-1, 1, 1]); // mirrored — flips winding against the normal

  const widget = doc
    .createNode('widget')
    .setTranslation([3, 0, 0])
    .addChild(hull)
    .addChild(mast)
    .addChild(fin);
  scene.addChild(widget);
  return doc;
}

// Top-level await rather than an async describe: vitest collects suites
// synchronously, and .mjs test modules may await at module scope.
const doc = buildOffender();
const report = await normalizeDocument(doc, { names: ['widget'] });

describe('normalize repairs a rule-breaking model', () => {
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  const byName = (name) =>
    doc.getRoot().listNodes().find((n) => n.getName() === name).getMesh().listPrimitives()[0];

  it('leaves every primitive with the same attribute set', () => {
    for (const prim of prims) {
      expect(prim.listSemantics().sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0', 'TEXCOORD_1']);
    }
  });

  it('resets every node to identity and bakes the placement into vertices', () => {
    for (const node of doc.getRoot().listNodes()) {
      expect(node.getTranslation()).toEqual([0, 0, 0]);
      expect(node.getRotation()).toEqual([0, 0, 0, 1]);
      expect(node.getScale()).toEqual([1, 1, 1]);
    }
    // hull cube centre = widget [3,0,0] + hull [0,1,0].
    const pos = byName('hull').getAttribute('POSITION').getArray();
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pos.length; i += 3) {
      cx += pos[i];
      cy += pos[i + 1];
    }
    expect(cx / (pos.length / 3)).toBeCloseTo(3, 5);
    expect(cy / (pos.length / 3)).toBeCloseTo(1, 5);
    // mast was authored facing +Z and spun 90° about Y: normals now face +X.
    const nrm = byName('mast').getAttribute('NORMAL').getArray();
    expect(nrm[0]).toBeCloseTo(1, 5);
    expect(nrm[2]).toBeCloseTo(0, 5);
  });

  it('unflips the winding of the mirrored fin so it matches its normals', () => {
    const pos = byName('fin').getAttribute('POSITION').getArray();
    const nrm = byName('fin').getAttribute('NORMAL').getArray();
    const e1 = [pos[3] - pos[0], pos[4] - pos[1], pos[5] - pos[2]];
    const e2 = [pos[6] - pos[0], pos[7] - pos[1], pos[8] - pos[2]];
    const geometric = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const dot = geometric[0] * nrm[0] + geometric[1] * nrm[1] + geometric[2] * nrm[2];
    expect(dot).toBeGreaterThan(0);
  });

  it('box-projects missing UVs at the kit density', () => {
    // The cube's +Z face is 2.5 m square = exactly one atlas tile.
    const prim = byName('hull');
    const pos = prim.getAttribute('POSITION').getArray();
    const nrm = prim.getAttribute('NORMAL').getArray();
    const uv = prim.getAttribute('TEXCOORD_0').getArray();
    expect(pos.length / 3).toBe(36); // de-indexed for flat normals
    const us = [];
    for (let i = 0; i < pos.length / 3; i++) {
      if (nrm[i * 3 + 2] > 0.9) us.push(uv[i * 2]);
    }
    expect(us.length).toBe(6);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(2.5 / UV_METRES_PER_TILE, 5);
  });

  it('zero-fills the motion mask on parts that lack it, and keeps the authored one', () => {
    expect(Array.from(byName('fin').getAttribute('TEXCOORD_1').getArray())).toEqual(
      new Array(6).fill(0),
    );
    expect(byName('mast').getAttribute('TEXCOORD_1').getArray()[0]).toBe(1);
    expect(byName('mast').getAttribute('TEXCOORD_1').getArray()[1]).toBe(0.5);
  });

  it('flattens materials, drops the texture, and says so', () => {
    expect(doc.getRoot().listTextures()).toEqual([]);
    const paint = byName('hull').getMaterial();
    expect(paint.getBaseColorFactor().slice(0, 3)).toEqual([0.8, 0.1, 0.1]);
    expect(report.warnings.some((w) => w.includes("material 'paint'"))).toBe(true);
  });

  it('survives the game merge — the contract, not a proxy for it', async () => {
    const bytes = await createIO().writeBinary(doc);
    const scene = await parseScene(bytes);
    const { merged, parts, attributes } = kitGeometry(scene, 'widget');
    expect(parts).toBe(3);
    expect(attributes).toBe('color,normal,position,uv,uv1');
    // The hull's painted colour reached the baked vertex-colour attribute.
    const colors = merged.getAttribute('color').array;
    let reds = 0;
    for (let i = 0; i < colors.length; i += 3) {
      if (Math.abs(colors[i] - 0.8) < 1e-3) reds += 1;
    }
    expect(reds).toBe(36);
  });

  it('reports the root the registry will assert', () => {
    expect(report.roots).toEqual([
      { name: 'widget', meshes: 3, tris: 14, attributes: 'normal,position,uv,uv1' },
    ]);
  });
});

describe('normalize is a no-op on a kit that already conforms', () => {
  const path = resolve(process.cwd(), 'public', 'assets', 'uplift', 'meshes', 'props', 'creatures.glb');
  // Names duplicated from build-ship.mjs's registry on purpose: importing the
  // registry would run the build.
  const names = ['grazer', 'flier', 'shoal-fish', 'mote', 'nest-mound', 'shell-bed', 'bone-arch'];

  it.skipIf(!existsSync(path))('preserves the creatures kit through a round trip', async () => {
    const original = await parseScene(readFileSync(path));
    const doc = await createIO().read(path);
    const report = await normalizeDocument(doc, { names });
    const scene = await parseScene(await createIO().writeBinary(doc));
    for (const name of names) {
      const before = kitGeometry(original, name);
      const after = kitGeometry(scene, name);
      expect(after.attributes).toBe(before.attributes);
      expect(after.parts).toBe(before.parts);
      expect(after.merged.getAttribute('position').count).toBe(
        before.merged.getAttribute('position').count,
      );
    }
    // Nothing geometric should have needed fixing.
    expect(report.fixes.filter((f) => /baked|winding|normals|UVs|uv1|stripped/.test(f))).toEqual([]);
  });
});
