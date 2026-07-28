import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  PUBLIC_ROOT,
  ensureDir,
  hash32,
  mulberry,
} from './helpers.mjs';

if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    result = null;
    error = null;
    onloadend = null;
    onerror = null;

    readAsArrayBuffer(blob) {
      blob.arrayBuffer()
        .then((result) => {
          this.result = result;
          queueMicrotask(() => this.onloadend?.({ target: this }));
        })
        .catch((error) => {
          this.error = error;
          queueMicrotask(() => this.onerror?.(error));
        });
    }

    readAsDataURL(blob) {
      blob.arrayBuffer()
        .then((result) => {
          this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
          queueMicrotask(() => this.onloadend?.({ target: this }));
        })
        .catch((error) => {
          this.error = error;
          queueMicrotask(() => this.onerror?.(error));
        });
    }
  };
}

const originalObjectAdd = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function checkedAdd(...objects) {
  const invalid = objects.filter((object) => !object?.isObject3D);
  if (invalid.length > 0) {
    throw new TypeError(`Invalid Object3D child added to ${this.name || this.type}: ${invalid.map(String).join(', ')}`);
  }
  return originalObjectAdd.apply(this, objects);
};

const MATERIALS = {
  stone: new THREE.MeshStandardMaterial({ name: 'uplift-stone', color: 0x77746f, roughness: 0.9 }),
  darkStone: new THREE.MeshStandardMaterial({ name: 'uplift-dark-stone', color: 0x34343b, roughness: 0.94 }),
  flora: new THREE.MeshStandardMaterial({ name: 'uplift-flora', color: 0x4c8e65, roughness: 0.88 }),
  metal: new THREE.MeshStandardMaterial({ name: 'uplift-metal', color: 0x8c96af, roughness: 0.52, metalness: 0.55 }),
  darkMetal: new THREE.MeshStandardMaterial({ name: 'uplift-dark-metal', color: 0x202535, roughness: 0.62, metalness: 0.65 }),
  pale: new THREE.MeshStandardMaterial({ name: 'uplift-pale', color: 0xe9eef9, roughness: 0.45, metalness: 0.15 }),
  gold: new THREE.MeshStandardMaterial({ name: 'uplift-gold', color: 0xf5c84c, roughness: 0.4, metalness: 0.55 }),
  cyan: new THREE.MeshStandardMaterial({ name: 'uplift-cyan', color: 0x5ad7e8, roughness: 0.3, metalness: 0.25 }),
  magenta: new THREE.MeshStandardMaterial({ name: 'uplift-magrathea', color: 0xb36bff, roughness: 0.35, metalness: 0.2 }),
  rust: new THREE.MeshStandardMaterial({ name: 'uplift-rust', color: 0x8a5f34, roughness: 0.86, metalness: 0.2 }),
  olive: new THREE.MeshStandardMaterial({ name: 'uplift-vogon', color: 0x8a8f5a, roughness: 0.82, metalness: 0.25 }),
  ceramic: new THREE.MeshStandardMaterial({ name: 'uplift-ceramic', color: 0xdcd6c8, roughness: 0.36 }),
  cloth: new THREE.MeshStandardMaterial({ name: 'uplift-cloth', color: 0x5a9ec5, roughness: 1 }),
  redCloth: new THREE.MeshStandardMaterial({ name: 'uplift-red-cloth', color: 0x672a2f, roughness: 1 }),
};

function mesh(name, geometry, material = MATERIALS.metal, position, scale, rotation) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  if (position) m.position.fromArray(position);
  if (scale) m.scale.fromArray(scale);
  if (rotation) m.rotation.fromArray(rotation);
  return m;
}

function box(name, size, material, position, rotation) {
  return mesh(name, new THREE.BoxGeometry(...size), material, position, undefined, rotation);
}

function cylinder(name, radiusTop, radiusBottom, height, segments, material, position, rotation) {
  return mesh(
    name,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
    position,
    undefined,
    rotation,
  );
}

function cone(name, radius, height, segments, material, position, rotation) {
  return mesh(name, new THREE.ConeGeometry(radius, height, segments), material, position, undefined, rotation);
}

function sphere(name, radius, width, height, material, position, scale) {
  return mesh(name, new THREE.SphereGeometry(radius, width, height), material, position, scale);
}

function torus(name, radius, tube, radial, tubular, material, position, rotation) {
  return mesh(name, new THREE.TorusGeometry(radius, tube, radial, tubular), material, position, undefined, rotation);
}

function asset(name, children, extras = {}) {
  const g = new THREE.Group();
  g.name = name;
  g.userData = { assetId: name, ...extras };
  if (children.length > 0) g.add(...children);
  return g;
}

async function writeGlb(scene, output, extras = {}) {
  ensureDir(dirname(output));
  scene.userData = {
    generator: 'scripts/generate-uplift-assets.mjs',
    coordinateSystem: 'Y-up, +Z forward',
    ...extras,
  };
  const exporter = new GLTFExporter();
  const data = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    truncateDrawRange: true,
  });
  writeFileSync(output, Buffer.from(data));
  return output;
}

function propVariant(family, type, variant, lod) {
  const r = mulberry(hash32(`${family}:${type}:${variant}:${lod}`));
  const seg = Math.max(3, 8 - lod * 2);
  const scale = 0.72 + r() * 0.7;
  const name = `${type}-${family}-${String(variant + 1).padStart(2, '0')}-lod${lod}`;
  let subject;
  switch (family) {
    case 'rocks':
      subject = mesh(name, new THREE.DodecahedronGeometry(scale, lod === 0 ? 1 : 0), MATERIALS.stone);
      subject.scale.set(0.7 + r(), 0.5 + r() * 0.7, 0.7 + r());
      break;
    case 'boulders':
      subject = mesh(name, new THREE.IcosahedronGeometry(scale * 1.45, lod === 0 ? 1 : 0), MATERIALS.darkStone);
      subject.scale.set(0.9 + r(), 0.65 + r(), 0.85 + r());
      break;
    case 'flora': {
      const g = asset(name, []);
      g.add(cylinder(`${name}-stem`, 0.05, 0.08, 1.1 * scale, seg, MATERIALS.flora, [0, 0.5 * scale, 0]));
      const leaves = lod === 2 ? 2 : lod === 1 ? 3 : 5;
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * Math.PI * 2 + r();
        g.add(cone(
          `${name}-leaf-${i}`,
          0.18 * scale,
          0.75 * scale,
          Math.max(3, seg - 2),
          MATERIALS.flora,
          [Math.cos(a) * 0.16, 0.35 + i * 0.12, Math.sin(a) * 0.16],
          [Math.PI / 2.7, a, 0],
        ));
      }
      return g;
    }
    case 'shrubs': {
      const g = asset(name, []);
      const count = lod === 2 ? 2 : lod === 1 ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + r();
        g.add(cone(
          `${name}-frond-${i}`,
          (0.28 + r() * 0.2) * scale,
          (0.7 + r() * 0.45) * scale,
          Math.max(3, seg - 2),
          MATERIALS.flora,
          [Math.cos(a) * 0.22, 0.35, Math.sin(a) * 0.22],
          [0.2 * (r() - 0.5), a, 0.3 * (r() - 0.5)],
        ));
      }
      return g;
    }
    case 'shards':
      subject = cone(name, 0.38 * scale, 1.6 * scale, Math.max(3, seg - 2), MATERIALS.cyan, [0, 0.8 * scale, 0]);
      subject.rotation.z = (r() - 0.5) * 0.25;
      break;
    case 'vents': {
      const g = asset(name, []);
      g.add(cylinder(`${name}-base`, 0.35 * scale, 0.5 * scale, 0.55 * scale, seg, MATERIALS.darkStone, [0, 0.25, 0]));
      g.add(cone(`${name}-chimney`, 0.28 * scale, 1.25 * scale, seg, MATERIALS.rust, [0.1, 0.85, 0]));
      return g;
    }
    default:
      throw new Error(`Unknown prop family ${family}`);
  }
  subject.rotation.set(r() * 0.35, r() * Math.PI * 2, r() * 0.35);
  return subject;
}

async function generatePropKits() {
  const families = ['rocks', 'boulders', 'flora', 'shrubs', 'shards', 'vents'];
  const planetTypes = ['terrestrial', 'ice', 'desert', 'volcanic', 'ocean', 'gasgiant'];
  const outputs = [];
  for (const family of families) {
    const scene = new THREE.Scene();
    scene.name = `${family}-prop-family`;
    for (const type of planetTypes) {
      for (let variant = 0; variant < 5; variant++) {
        const root = asset(`${type}-${family}-${String(variant + 1).padStart(2, '0')}`, [], {
          planetType: type,
          family,
          variant: variant + 1,
          atlas: `../../textures/props/${family}-atlas.ktx2`,
        });
        for (let lod = 0; lod < 3; lod++) root.add(propVariant(family, type, variant, lod));
        scene.add(root);
      }
    }
    const output = resolve(PUBLIC_ROOT, 'meshes', 'props', `${family}.glb`);
    await writeGlb(scene, output, { family, lods: 3, variantsPerPlanetType: 5 });
    outputs.push(output);
  }
  return outputs;
}

function settlementAssets() {
  const metal = MATERIALS.darkMetal;
  return [
    asset('hab-shell', [
      box('hab-body', [3.2, 1.7, 2.4], MATERIALS.pale, [0, 0.85, 0]),
      box('hab-panel-break', [3.28, 0.07, 0.1], metal, [0, 0.9, 1.23]),
      cylinder('hab-vent', 0.18, 0.18, 0.75, 8, metal, [1.05, 1.95, 0]),
    ]),
    asset('roof', [
      mesh('roof-wedge', new THREE.ConeGeometry(2.2, 0.8, 4), MATERIALS.darkStone, [0, 0.4, 0], [1, 1, 0.72], [0, Math.PI / 4, 0]),
      box('roof-ridge', [0.14, 0.14, 3.0], metal, [0, 0.82, 0]),
    ]),
    asset('mast', [
      cylinder('mast-column', 0.09, 0.14, 4.8, 8, metal, [0, 2.4, 0]),
      torus('mast-loop', 0.55, 0.07, 6, 16, MATERIALS.cyan, [0, 4.5, 0], [Math.PI / 2, 0, 0]),
      box('mast-box', [0.65, 0.45, 0.5], MATERIALS.pale, [0, 2.2, 0]),
    ]),
    asset('dome', [
      sphere('dome-shell', 1.5, 14, 8, MATERIALS.cyan, [0, 0, 0], [1, 0.58, 1]),
      torus('dome-ring', 1.35, 0.09, 6, 18, metal, [0, 0, 0], [Math.PI / 2, 0, 0]),
    ]),
    asset('deck', [
      box('deck-plate', [4.5, 0.18, 3.5], MATERIALS.darkStone, [0, 0.1, 0]),
      ...[-1.9, 1.9].flatMap((x) => [-1.4, 1.4].map((z, i) =>
        cylinder(`deck-rail-${x}-${i}`, 0.04, 0.04, 1.0, 6, metal, [x, 0.65, z]))),
    ]),
    asset('stilt', [
      cylinder('stilt-column', 0.18, 0.28, 3.2, 8, metal, [0, 1.6, 0]),
      box('stilt-foot', [0.9, 0.14, 0.9], MATERIALS.darkStone, [0, 0.07, 0]),
      box('stilt-brace', [1.2, 0.11, 0.11], metal, [0, 1.1, 0], [0, 0, 0.62]),
    ]),
    asset('works', [
      box('works-body', [2.5, 1.4, 2.2], MATERIALS.rust, [0, 0.7, 0]),
      cylinder('works-stack-a', 0.22, 0.3, 2.5, 8, metal, [-0.7, 2, 0]),
      cylinder('works-stack-b', 0.18, 0.26, 2.0, 8, metal, [0.5, 1.75, 0.35]),
      torus('works-wheel', 0.55, 0.11, 6, 14, MATERIALS.gold, [1.28, 0.7, 0], [0, Math.PI / 2, 0]),
    ]),
    asset('pad', [
      cylinder('pad-disc', 2.6, 2.6, 0.18, 24, MATERIALS.darkStone, [0, 0.09, 0]),
      torus('pad-ring', 1.75, 0.11, 6, 32, MATERIALS.gold, [0, 0.2, 0], [Math.PI / 2, 0, 0]),
      ...[0, 1, 2, 3].map((i) => box(`pad-tick-${i}`, [0.16, 0.05, 0.75], MATERIALS.pale, [Math.cos(i * Math.PI / 2) * 2.1, 0.21, Math.sin(i * Math.PI / 2) * 2.1], [0, -i * Math.PI / 2, 0])),
    ]),
    asset('banner', [
      cylinder('banner-pole', 0.06, 0.08, 3.2, 6, metal, [0, 1.6, 0]),
      box('banner-cloth', [1.55, 1.2, 0.05], MATERIALS.gold, [0.78, 2.25, 0]),
    ]),
    asset('scaffold', [
      ...[-1, 1].flatMap((x) => [-0.8, 0.8].map((z, i) =>
        cylinder(`scaffold-leg-${x}-${i}`, 0.06, 0.06, 3.4, 6, metal, [x, 1.7, z]))),
      box('scaffold-deck', [2.5, 0.12, 2.0], MATERIALS.rust, [0, 2.4, 0]),
      box('scaffold-cross-a', [2.8, 0.08, 0.08], metal, [0, 1.25, -0.82], [0, 0, 0.7]),
      box('scaffold-cross-b', [2.8, 0.08, 0.08], metal, [0, 1.25, 0.82], [0, 0, -0.7]),
    ]),
    asset('window-strip', [
      box('window-panel', [2.8, 0.55, 0.06], MATERIALS.cyan),
      ...[-1.05, -0.35, 0.35, 1.05].map((x) => box(`window-mullion-${x}`, [0.06, 0.62, 0.08], metal, [x, 0, 0])),
    ]),
  ];
}

async function generateSettlementKit() {
  const scene = new THREE.Scene();
  scene.name = 'settlement-kit';
  scene.add(...settlementAssets());
  const output = resolve(PUBLIC_ROOT, 'meshes', 'settlements', 'settlement-kit.glb');
  await writeGlb(scene, output, { atlas: '../../textures/settlements/settlement-atlas.ktx2' });
  return output;
}

function facilityAssets() {
  return [
    asset('seed-probe', [
      cylinder('seed-probe-plinth', 0.9, 1.15, 0.45, 10, MATERIALS.darkStone, [0, 0.2, 0]),
      cylinder('seed-probe-body', 0.42, 0.58, 2.8, 10, MATERIALS.pale, [0, 1.75, 0]),
      cone('seed-probe-nose', 0.42, 0.9, 10, MATERIALS.gold, [0, 3.55, 0]),
      ...[-1, 1].map((s) => box(`seed-probe-fin-${s}`, [0.08, 0.8, 0.8], MATERIALS.darkMetal, [s * 0.62, 0.9, 0], [0, 0, s * 0.35])),
    ]),
    asset('atmo-processor', [
      box('atmo-base', [3, 0.6, 2.2], MATERIALS.darkMetal, [0, 0.3, 0]),
      ...[-0.85, 0, 0.85].map((x, i) => cylinder(`atmo-stack-${i}`, 0.24, 0.38, 3.5 + i * 0.35, 10, MATERIALS.pale, [x, 2.1 + i * 0.17, 0])),
      torus('atmo-intake', 0.75, 0.12, 8, 18, MATERIALS.cyan, [0, 1.1, 1.15], [0, 0, 0]),
    ]),
    asset('deep-thought', [
      box('deep-thought-core', [4.2, 3.1, 2.6], MATERIALS.darkMetal, [0, 1.55, 0]),
      ...[-1, 1].map((s) => box(`deep-thought-brow-${s}`, [1.2, 0.26, 0.35], MATERIALS.gold, [s * 1.15, 2.35, 1.36], [0, 0, s * 0.08])),
      cylinder('deep-thought-vent', 0.35, 0.45, 1.5, 8, MATERIALS.metal, [0, 3.85, -0.45]),
    ]),
    asset('petition-crane', [
      cylinder('crane-mast', 0.13, 0.2, 5.8, 8, MATERIALS.rust, [0, 2.9, 0]),
      box('crane-boom', [5.2, 0.2, 0.22], MATERIALS.rust, [1.65, 5.45, 0]),
      box('crane-counterweight', [0.8, 0.7, 0.7], MATERIALS.darkMetal, [-1.2, 5.1, 0]),
      cylinder('crane-cable', 0.025, 0.025, 3.0, 5, MATERIALS.darkMetal, [3.8, 3.95, 0]),
      box('crane-hook', [0.25, 0.35, 0.12], MATERIALS.gold, [3.8, 2.45, 0]),
    ]),
    asset('petition-scaffolding', settlementAssets().find((a) => a.name === 'scaffold').children.map((child) => child.clone())),
  ];
}

function markAssets() {
  return [
    asset('beacon-mast', [
      cylinder('beacon-pole', 0.08, 0.14, 4.6, 8, MATERIALS.metal, [0, 2.3, 0]),
      mesh('beacon-head', new THREE.OctahedronGeometry(0.42, 0), MATERIALS.gold, [0, 4.75, 0]),
      ...[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return cylinder(`beacon-foot-${i}`, 0.05, 0.08, 1.1, 6, MATERIALS.darkMetal, [Math.cos(a) * 0.65, 0.45, Math.sin(a) * 0.65], [0, 0, a * 0.15]);
      }),
    ]),
    asset('survey-station', [
      ...[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return cylinder(`station-leg-${i}`, 0.05, 0.08, 1.8, 6, MATERIALS.metal, [Math.cos(a) * 0.55, 0.8, Math.sin(a) * 0.55]);
      }),
      box('station-body', [1.2, 0.65, 1.0], MATERIALS.pale, [0, 1.45, 0]),
      torus('station-dish', 0.62, 0.08, 6, 20, MATERIALS.cyan, [0, 2.25, 0], [Math.PI / 2.5, 0, 0]),
    ]),
    asset('shelter', [
      sphere('shelter-dome', 1.7, 14, 8, MATERIALS.cloth, [0, 0.15, 0], [1, 0.62, 1]),
      box('shelter-door', [0.7, 1.2, 0.18], MATERIALS.darkMetal, [0, 0.6, 1.45]),
    ]),
    asset('repair-rig', [
      box('repair-plinth', [1.4, 0.7, 1.4], MATERIALS.darkMetal, [0, 0.35, 0]),
      box('repair-plate', [1.8, 0.12, 1.25], MATERIALS.pale, [0, 1.0, 0], [0.15, 0.35, 0]),
      torus('repair-handle', 0.38, 0.07, 6, 14, MATERIALS.gold, [0.55, 1.25, 0.15], [Math.PI / 2, 0, 0]),
    ]),
    asset('prospect-stake', [
      cylinder('stake', 0.07, 0.09, 2.2, 6, MATERIALS.rust, [0, 1.1, 0]),
      box('stake-flag', [0.75, 0.48, 0.04], MATERIALS.gold, [0.38, 1.8, 0]),
      cone('stake-foot', 0.18, 0.5, 6, MATERIALS.darkMetal, [0, 0.25, 0]),
    ]),
  ];
}

function seamAssets() {
  const out = [];
  const materials = [MATERIALS.cyan, MATERIALS.gold, MATERIALS.magenta, MATERIALS.pale];
  const kinds = ['improbability', 'tidal-glass', 'field-crystal', 'ridge-quartz'];
  kinds.forEach((kind, k) => {
    for (const worked of [false, true]) {
      const name = `${kind}-${worked ? 'worked' : 'intact'}`;
      const parts = [];
      const count = worked ? 3 : 6;
      for (let i = 0; i < count; i++) {
        const r = mulberry(hash32(`${name}:${i}`));
        parts.push(mesh(
          `${name}-shard-${i}`,
          new THREE.OctahedronGeometry(0.25 + r() * 0.38, 0),
          materials[k],
          [(r() - 0.5) * 1.8, (worked ? 0.16 : 0.35) + r() * 0.65, (r() - 0.5) * 1.8],
          [0.7 + r(), worked ? 0.4 + r() * 0.4 : 1.1 + r() * 1.4, 0.7 + r()],
          [r(), r() * 2, r()],
        ));
      }
      out.push(asset(name, parts, { state: worked ? 'worked' : 'intact', tintIndex: k }));
    }
  });
  return out;
}

async function generateSmallKits() {
  const outputs = [];
  const kits = [
    ['facilities', 'facility-kit.glb', facilityAssets(), '../../textures/facilities/facility-atlas.ktx2'],
    ['marks', 'mark-kit.glb', markAssets(), '../../textures/marks/mark-atlas.ktx2'],
    ['seams', 'crystal-seam-kit.glb', seamAssets(), '../../textures/seams/crystal-seam.ktx2'],
  ];
  for (const [dir, file, assets, atlas] of kits) {
    const scene = new THREE.Scene();
    scene.name = file.replace('.glb', '');
    scene.add(...assets);
    const output = resolve(PUBLIC_ROOT, 'meshes', dir, file);
    await writeGlb(scene, output, { atlas });
    outputs.push(output);
  }
  return outputs;
}

function runaboutRefits() {
  return [
    asset('skimmer-cradle', [
      box('cradle-rail-a', [0.16, 0.2, 3.1], MATERIALS.metal, [-0.55, 0.1, 0]),
      box('cradle-rail-b', [0.16, 0.2, 3.1], MATERIALS.metal, [0.55, 0.1, 0]),
      torus('cradle-clamp', 0.72, 0.08, 6, 16, MATERIALS.gold, [0, 0.35, 0], [Math.PI / 2, 0, 0]),
    ]),
    asset('cargo-pod', [
      box('cargo-shell', [2.6, 1.4, 2.0], MATERIALS.pale),
      ...[-0.75, 0, 0.75].map((x) => box(`cargo-rib-${x}`, [0.09, 1.52, 2.1], MATERIALS.darkMetal, [x, 0, 0])),
    ]),
    asset('rig-bay', [
      box('rig-bay-shell', [2.5, 1.1, 1.8], MATERIALS.darkMetal),
      ...[-0.55, 0, 0.55].map((x) => cylinder(`rig-canister-${x}`, 0.26, 0.26, 1.45, 8, MATERIALS.rust, [x, 0, 0], [Math.PI / 2, 0, 0])),
    ]),
    asset('dispersal-field-emitters', [
      ...[-1, 1].map((s) => torus(`emitter-${s}`, 0.55, 0.12, 8, 20, MATERIALS.magenta, [s * 0.8, 0, 0], [Math.PI / 2, 0, 0])),
    ]),
    asset('atmo-intakes', [
      ...[-1, 1].map((s) => box(`intake-${s}`, [0.85, 0.45, 1.75], MATERIALS.cyan, [s * 0.75, 0, 0], [0.1, 0, s * 0.04])),
    ]),
  ];
}

function skimmerParts() {
  return asset('survey-skimmer', [
    box('skimmer-deck', [3.5, 0.25, 1.5], MATERIALS.darkMetal, [0, 0.45, 0]),
    mesh('skimmer-nose', new THREE.ConeGeometry(0.78, 1.5, 6), MATERIALS.pale, [0, 0.45, 2.45], [1, 1, 1], [Math.PI / 2, 0, 0]),
    ...[-1, 1].map((s) => cylinder(`skimmer-cushion-${s}`, 0.32, 0.42, 2.8, 10, MATERIALS.metal, [s * 1.35, 0, 0], [Math.PI / 2, 0, 0])),
    cylinder('skimmer-mast', 0.05, 0.08, 1.5, 6, MATERIALS.metal, [0, 1.2, -0.45]),
    torus('skimmer-sensor', 0.36, 0.07, 6, 16, MATERIALS.cyan, [0, 1.9, -0.45], [Math.PI / 2, 0, 0]),
    box('skimmer-handle', [1.2, 0.08, 0.08], MATERIALS.gold, [0, 1.2, 0.5]),
  ]);
}

async function generateShipKits() {
  const outputs = [];
  // runabout.glb is NOT here: the hull (3.1) is modelled in Blender, from
  // assets-source/uplift/blender/runabout.py via `npm run assets:ship`. It is
  // the one asset a player looks at from two metres away, and primitives could
  // not carry the panel breaks. Leaving it out means running this generator
  // without Blender installed no longer flattens that model back to boxes.
  const specs = [
    ['runabout-refits.glb', runaboutRefits(), { atlas: '../../textures/ships/runabout-pbr.ktx2' }],
    ['skimmer.glb', [skimmerParts()], { triangleBudget: 1500 }],
  ];
  for (const [file, assets, extras] of specs) {
    const scene = new THREE.Scene();
    scene.name = file.replace('.glb', '');
    scene.add(...assets);
    const output = resolve(PUBLIC_ROOT, 'meshes', 'ships', file);
    await writeGlb(scene, output, extras);
    outputs.push(output);
  }
  return outputs;
}

function deepFieldAssets() {
  return [
    asset('sofa', [
      box('sofa-seat', [3.8, 0.65, 1.7], MATERIALS.redCloth, [0, 0.35, 0]),
      box('sofa-back', [3.8, 1.35, 0.35], MATERIALS.redCloth, [0, 1.0, -0.7]),
      ...[-1, 1].map((s) => box(`sofa-arm-${s}`, [0.35, 0.95, 1.7], MATERIALS.redCloth, [s * 1.82, 0.65, 0])),
    ]),
    asset('buoy42', [
      cylinder('buoy-body', 0.35, 0.45, 2.6, 8, MATERIALS.metal, [0, 1.3, 0]),
      sphere('buoy-lamp', 0.42, 10, 8, MATERIALS.gold, [0, 2.95, 0]),
    ]),
    asset('nutrimatic', [
      box('nutrimatic-body', [1.8, 2.6, 1.4], MATERIALS.darkMetal, [0, 1.3, 0]),
      box('nutrimatic-screen', [1.2, 0.8, 0.08], MATERIALS.cyan, [0, 1.6, 0.74]),
      cylinder('nutrimatic-spout', 0.08, 0.12, 0.55, 8, MATERIALS.metal, [0, 0.65, 0.92], [Math.PI / 2, 0, 0]),
    ]),
    asset('towel-drift', [box('towel', [3.0, 0.08, 1.8], MATERIALS.cloth, [0, 0, 0], [0.35, 0.2, 0.65])]),
    asset('teapot', [
      sphere('teapot-body', 0.9, 14, 10, MATERIALS.ceramic),
      torus('teapot-handle', 0.55, 0.13, 6, 16, MATERIALS.ceramic, [-1.0, 0, 0], [Math.PI / 2, 0, 0]),
      cone('teapot-spout', 0.3, 1.1, 8, MATERIALS.ceramic, [1.05, 0.1, 0], [0, 0, -Math.PI / 2]),
      cylinder('teapot-lid', 0.35, 0.42, 0.16, 12, MATERIALS.ceramic, [0, 0.94, 0]),
    ]),
    asset('petunia-bowl', [
      sphere('petunia-bowl-body', 1.0, 14, 8, MATERIALS.rust, [0, 0, 0], [1, 0.55, 1]),
      ...[0, 1, 2, 3, 4].map((i) => sphere(`petunia-${i}`, 0.25, 8, 6, MATERIALS.magenta, [Math.cos(i * 1.257) * 0.45, 0.55, Math.sin(i * 1.257) * 0.45])),
    ]),
    asset('whale', [
      sphere('whale-body', 1.2, 14, 10, MATERIALS.cloth, [0, 0, 0], [1.9, 0.72, 0.72]),
      box('whale-tail', [0.85, 0.1, 1.4], MATERIALS.cloth, [-2.5, 0, 0], [0.2, 0, 0.5]),
      sphere('whale-eye', 0.1, 6, 6, MATERIALS.darkMetal, [1.62, 0.2, 0.42]),
    ]),
    asset('generation-ship', [
      cylinder('generation-hull', 0.55, 0.55, 4.8, 12, MATERIALS.metal, [0, 0, 0], [0, 0, Math.PI / 2]),
      torus('generation-ring', 1.15, 0.16, 8, 22, MATERIALS.darkMetal, [0.45, 0, 0], [0, Math.PI / 2, 0]),
      cone('generation-drive', 0.75, 0.8, 10, MATERIALS.gold, [-2.75, 0, 0], [0, 0, Math.PI / 2]),
    ]),
    asset('b-ark', [
      box('b-ark-hull', [4.8, 1.05, 1.45], MATERIALS.olive),
      ...[-1.4, 0, 1.4].map((x) => cylinder(`b-ark-pod-${x}`, 0.38, 0.38, 0.8, 8, MATERIALS.darkMetal, [x, -0.78, 0])),
    ]),
    asset('improbability-shadow', [
      mesh('improbability-wire', new THREE.IcosahedronGeometry(1.5, 1), MATERIALS.magenta),
      torus('improbability-ring', 2.0, 0.07, 6, 28, MATERIALS.gold, [0, 0, 0], [0.4, 0.2, 0.7]),
    ]),
    asset('fjord-workshop', [
      box('fjord-gantry', [4.2, 0.18, 2.8], MATERIALS.metal),
      box('fjord-continent', [2.8, 0.16, 1.8], MATERIALS.flora, [0, 0.25, 0], [0, 0.25, 0]),
      ...[-1, 1].map((s) => cylinder(`fjord-crane-${s}`, 0.08, 0.1, 2.4, 6, MATERIALS.darkMetal, [s * 1.9, 1.1, 0])),
    ]),
    asset('wicket-gate', [
      box('wicket-wall', [7.5, 4.8, 0.12], MATERIALS.darkMetal),
      box('wicket-door', [0.75, 1.35, 0.18], MATERIALS.cyan, [0, -1.3, 0.1]),
    ]),
    asset('cooling-array', [
      ...[-1.5, -0.5, 0.5, 1.5].map((x) => box(`cooling-fin-${x}`, [0.2, 3.6, 2.0], MATERIALS.metal, [x, 0, 0])),
      cylinder('cooling-spine', 0.18, 0.18, 4.8, 8, MATERIALS.darkMetal, [0, 0, 0], [0, 0, Math.PI / 2]),
    ]),
    asset('signpost', [
      cylinder('signpost-pole', 0.08, 0.11, 3.2, 6, MATERIALS.metal, [0, 1.6, 0]),
      ...[-0.75, 0, 0.75].map((y, i) => box(`signpost-board-${i}`, [2.4 - i * 0.25, 0.38, 0.12], i === 1 ? MATERIALS.gold : MATERIALS.pale, [i % 2 ? -0.35 : 0.35, 2.1 + y, 0], [0, i * 0.5, i * 0.05])),
    ]),
    asset('milliways', [
      cylinder('milliways-hub', 1.25, 1.25, 0.7, 18, MATERIALS.darkMetal),
      torus('milliways-ring-a', 2.0, 0.16, 8, 28, MATERIALS.gold, [0, 0, 0], [Math.PI / 2, 0, 0]),
      torus('milliways-ring-b', 2.55, 0.12, 8, 32, MATERIALS.cyan, [0, 0, 0], [0.4, 0.1, 0.2]),
      ...[0, 1, 2, 3, 4, 5].map((i) => box(`milliways-pavilion-${i}`, [0.55, 0.35, 0.75], MATERIALS.pale, [Math.cos(i * Math.PI / 3) * 2.0, 0.25, Math.sin(i * Math.PI / 3) * 2.0], [0, -i * Math.PI / 3, 0])),
    ]),
  ];
}

async function generateDeepFieldKit() {
  const scene = new THREE.Scene();
  scene.name = 'deep-field-landmark-kit';
  scene.add(...deepFieldAssets());
  const output = resolve(PUBLIC_ROOT, 'meshes', 'deep-field', 'deep-field-kit.glb');
  await writeGlb(scene, output, {
    atlas: '../../textures/deep-field/deep-field-atlas.ktx2',
    authoredObjects: 15,
  });
  return output;
}

export async function generateMeshes() {
  const outputs = [];
  outputs.push(...await generatePropKits());
  outputs.push(await generateSettlementKit());
  outputs.push(...await generateSmallKits());
  outputs.push(...await generateShipKits());
  outputs.push(await generateDeepFieldKit());
  return outputs;
}

