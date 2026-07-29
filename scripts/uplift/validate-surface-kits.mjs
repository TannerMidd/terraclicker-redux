/**
 * Standalone contract check for the surface-world kits.
 *
 * This uses the same load + named-root merge as runtime/build-ship.mjs without
 * changing the shared registry while parallel asset work is in flight.
 */
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC_ROOT } from './helpers.mjs';
import { kitGeometry, loadKit } from './kit-contract.mjs';

const states = ['intact', 'cracked', 'depleted'];
const depositNames = ['crystal', 'ferrous', 'fossil', 'brine', 'sulfur', 'biologic']
  .flatMap((family) => states.map((state) => `deposit-${family}-${state}`));

const SPECS = [
  {
    id: 'surface-landmarks',
    glb: 'meshes/surface/landmark-kit.glb',
    names: [
      'standing-ring',
      'stone-arch',
      'perched-boulder',
      'hoodoo-court',
      'ice-organ',
      'pressure-ridge',
      'basalt-choir',
      'cinder-cone',
      'fumarole-field',
      'sea-stacks',
      'tide-arch',
      'blowhole',
      'award-fjords',
    ],
    budget: 900,
  },
  {
    id: 'surface-dressing',
    glb: 'meshes/surface/dressing-kit.glb',
    names: [
      ...depositNames,
      'clutter-desert-scrub',
      'clutter-desert-ribs',
      'clutter-ice-slab',
      'clutter-ice-needles',
      'clutter-volcanic-slag',
      'clutter-volcanic-bomb',
      'clutter-ocean-shells',
      'clutter-ocean-coral',
      'clutter-terrestrial-roots',
      'clutter-terrestrial-pebbles',
      'clutter-exotic-shards',
      'clutter-expedition-debris',
      'settlement-airlock',
      'settlement-cargo-stack',
      'settlement-service-tank',
      'settlement-pipe-run',
      'settlement-railing',
      'settlement-sign',
      'settlement-worklight',
      'settlement-cable-reel',
      'settlement-service-drone',
      'settlement-awning',
      'vignette-spore-bloom',
      'vignette-brine-garden',
      'vignette-tide-chorus',
      'vignette-ember-swarm',
      'vignette-burrow',
      'vignette-lichen-colony',
      'vignette-nesting-colony',
      'vignette-grazer-ring',
    ],
    budget: 900,
  },
  {
    id: 'creature-variants',
    glb: 'meshes/surface/creature-variants.glb',
    names: [
      'meadow-drifter',
      'sky-wisp',
      'glass-shoal',
      'dune-skink',
      'tumbleweave',
      'firn-burrower',
      'aurora-moth',
      'cinder-wren',
      'vent-lace',
      'settlement-swift',
    ],
    budget: 900,
    attributes: ['uv1'],
  },
  {
    id: 'weather-props',
    glb: 'meshes/surface/weather-props.glb',
    names: [
      'weather-windsock',
      'weather-banner',
      'weather-dust-streamer',
      'weather-loose-straps',
      'weather-storm-vane',
      'weather-icicles',
      'weather-snow-drift',
      'weather-puddle',
      'weather-rain-catcher',
      'weather-drain-chain',
    ],
    budget: 900,
    attributes: ['uv1'],
  },
];

let failed = false;
for (const spec of SPECS) {
  const path = resolve(PUBLIC_ROOT, spec.glb);
  const scene = await loadKit(path);
  const present = [];
  scene.traverse((object) => present.push(object.name));
  const missing = spec.names.filter((name) => !present.includes(name));
  if (missing.length) {
    failed = true;
    console.error(`${spec.id}: missing roots: ${missing.join(', ')}`);
    continue;
  }

  let total = 0;
  let largest = ['', 0];
  for (const name of spec.names) {
    try {
      const { merged, attributes } = kitGeometry(scene, name);
      const tris = merged.getAttribute('position').count / 3;
      total += tris;
      if (tris > largest[1]) largest = [name, tris];
      const list = attributes.split(',');
      for (const attribute of ['uv', ...(spec.attributes ?? [])]) {
        if (!list.includes(attribute)) {
          failed = true;
          console.error(`${spec.id}/${name}: missing ${attribute}; attrs [${attributes}]`);
        }
      }
      if (tris > spec.budget) {
        failed = true;
        console.error(`${spec.id}/${name}: ${tris} tris exceeds ${spec.budget}`);
      }
    } catch (error) {
      failed = true;
      console.error(`${spec.id}/${name}: merge failed: ${error.message}`);
    }
  }
  const kb = (statSync(path).size / 1024).toFixed(0);
  console.log(
    `${spec.id}: ${spec.names.length} roots, ${total} tris, ${kb} KB; `
    + `largest ${largest[0]} ${largest[1]} tris`,
  );
}

if (failed) process.exitCode = 1;
else console.log('Surface kit contract: OK');
