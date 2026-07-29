/**
 * Authored close-range world detail mounted beside the atmosphere and terrain.
 *
 * Landmarks, deposits, and static ecology set-pieces replace their exact
 * primitive fallbacks once the corresponding kit root is ready. Biome clutter,
 * settlement machinery, creature variants, and reactive weather props are
 * deliberate supplements. A failed request therefore removes nothing.
 *
 * Each root is one InstancedMesh. A planet may contain hundreds of seats but
 * draw-call count remains bounded by the distinct roots actually present.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import {
  attribute,
  float,
  instanceIndex,
  positionLocal,
  sin,
  time,
  vec3,
} from 'three/tsl';
import { speciesPresent } from '../../../content/groundSpecies';
import { mulberry } from '../../../engine/rng';
import {
  kitGeometryFit,
  kitMaterial,
  upliftActive,
  whenKitReady,
} from '../uplift/upliftAssets';
import type { DistrictSpec } from './surfaceSettlements';
import type { LandmarkSpec } from './surfaceLandmarks';
import type { DepositSpec } from './surfaceSites';
import type { VignetteSpec } from './surfaceEcology';
import {
  heightAt,
  type SurfaceParams,
  type SurfaceTiers,
} from './terrainField';

const LANDMARK_KIT = 'meshes/surface/landmark-kit.glb';
const DRESSING_KIT = 'meshes/surface/dressing-kit.glb';
const CREATURE_KIT = 'meshes/surface/creature-variants.glb';
const WEATHER_KIT = 'meshes/surface/weather-props.glb';
const KIT_PATHS = [LANDMARK_KIT, DRESSING_KIT, CREATURE_KIT, WEATHER_KIT] as const;

const LANDMARK_ATLAS = 'textures/surface/landmark-atlas.ktx2';
const LANDMARK_RMA = 'textures/surface/landmark-atlas-normal-rma.ktx2';
const DEPOSIT_ATLAS = 'textures/surface/deposit-atlas.ktx2';
const DEPOSIT_RMA = 'textures/surface/deposit-atlas-normal-rma.ktx2';
const CLUTTER_ATLAS = 'textures/surface/biome-clutter-atlas.ktx2';
const CLUTTER_RMA = 'textures/surface/biome-clutter-atlas-normal-rma.ktx2';
const SETTLEMENT_ATLAS = 'textures/surface/settlement-dressing-atlas.ktx2';
const SETTLEMENT_RMA = 'textures/surface/settlement-dressing-atlas-normal-rma.ktx2';
const ECOLOGY_ATLAS = 'textures/surface/ecology-atlas.ktx2';
const ECOLOGY_RMA = 'textures/surface/ecology-atlas-normal-rma.ktx2';
const WEATHER_ATLAS = 'textures/surface/weather-atlas.ktx2';
const WEATHER_RMA = 'textures/surface/weather-atlas-normal-rma.ktx2';

export type DepositVisualState = 'intact' | 'cracked' | 'depleted';
export type DepositVisualSpec = DepositSpec & { state?: DepositVisualState };

export interface CreatureVisualSpec {
  kind:
    | 'meadow-drifter'
    | 'sky-wisp'
    | 'glass-shoal'
    | 'dune-skink'
    | 'tumbleweave'
    | 'firn-burrower'
    | 'aurora-moth'
    | 'cinder-wren'
    | 'vent-lace'
    | 'settlement-swift';
  x: number;
  y: number;
  z: number;
  rot: number;
  scale?: number;
}

export interface WorldDetailProps {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  landmarks?: readonly LandmarkSpec[];
  deposits?: readonly DepositVisualSpec[];
  districts?: readonly DistrictSpec[];
  vignettes?: readonly VignetteSpec[];
  /**
   * Optional explicit ambient seats. When omitted the component creates a
   * small deterministic biome-appropriate population around the touchdown.
   */
  creatures?: readonly CreatureVisualSpec[];
  /** Current front id, used only to choose static weather dressing. */
  weatherKind?: string;
  /** Terrain stream epoch: re-seat anything that samples heightAt(). */
  epoch?: number;
}

type Batches = Map<string, Matrix4[]>;

const LANDMARK_HEIGHT: Record<string, number> = {
  'standing-ring': 6.0,
  'stone-arch': 8.0,
  'perched-boulder': 8.5,
  'hoodoo-court': 8.0,
  'ice-organ': 10.0,
  'pressure-ridge': 3.6,
  'basalt-choir': 10.0,
  'cinder-cone': 7.0,
  'fumarole-field': 5.0,
  'sea-stacks': 9.0,
  'tide-arch': 6.0,
  blowhole: 2.4,
  'award-fjords': 7.0,
};

const LANDMARK_ROOTS = Object.keys(LANDMARK_HEIGHT);

const DEPOSIT_FAMILIES = [
  'crystal',
  'ferrous',
  'fossil',
  'brine',
  'sulfur',
  'biologic',
] as const;
const DEPOSIT_STATES: DepositVisualState[] = ['intact', 'cracked', 'depleted'];
const DEPOSIT_ROOTS = DEPOSIT_FAMILIES.flatMap((family) =>
  DEPOSIT_STATES.map((state) => `deposit-${family}-${state}`),
);

const CLUTTER_BY_TYPE: Record<string, readonly string[]> = {
  terrestrial: ['clutter-terrestrial-roots', 'clutter-terrestrial-pebbles'],
  ice: ['clutter-ice-slab', 'clutter-ice-needles'],
  desert: ['clutter-desert-scrub', 'clutter-desert-ribs'],
  volcanic: ['clutter-volcanic-slag', 'clutter-volcanic-bomb'],
  ocean: ['clutter-ocean-shells', 'clutter-ocean-coral'],
  gasgiant: ['clutter-exotic-shards', 'clutter-expedition-debris'],
};
const CLUTTER_ROOTS = [
  ...new Set(Object.values(CLUTTER_BY_TYPE).flat()),
  'clutter-expedition-debris',
];

const SETTLEMENT_HEIGHT: Record<string, number> = {
  'settlement-airlock': 2.3,
  'settlement-cargo-stack': 1.4,
  'settlement-service-tank': 2.4,
  'settlement-pipe-run': 1.0,
  'settlement-railing': 1.15,
  'settlement-sign': 1.8,
  'settlement-worklight': 2.0,
  'settlement-cable-reel': 1.1,
  'settlement-service-drone': 1.15,
  'settlement-awning': 2.2,
};
const SETTLEMENT_ROOTS = Object.keys(SETTLEMENT_HEIGHT);

const VIGNETTE_ROOTS = [
  'vignette-spore-bloom',
  'vignette-brine-garden',
  'vignette-tide-chorus',
  'vignette-ember-swarm',
  'vignette-burrow',
  'vignette-lichen-colony',
  'vignette-nesting-colony',
  'vignette-grazer-ring',
];

const CREATURE_EXTENT: Record<CreatureVisualSpec['kind'], number> = {
  'meadow-drifter': 1.8,
  'sky-wisp': 1.1,
  'glass-shoal': 0.58,
  'dune-skink': 1.15,
  tumbleweave: 0.95,
  'firn-burrower': 1.25,
  'aurora-moth': 1.0,
  'cinder-wren': 0.72,
  'vent-lace': 1.15,
  'settlement-swift': 0.68,
};
const CREATURE_ROOTS = Object.keys(CREATURE_EXTENT);

const WEATHER_HEIGHT: Record<string, number> = {
  'weather-windsock': 2.4,
  'weather-banner': 2.5,
  'weather-dust-streamer': 1.3,
  'weather-loose-straps': 0.8,
  'weather-storm-vane': 2.1,
  'weather-icicles': 1.3,
  'weather-snow-drift': 0.55,
  'weather-puddle': 0.08,
  'weather-rain-catcher': 1.7,
  'weather-drain-chain': 1.9,
};
const WEATHER_ROOTS = Object.keys(WEATHER_HEIGHT);

const POS = new Vector3();
const SCALE = new Vector3();
const ROT = new Quaternion();
const Y_AXIS = new Vector3(0, 1, 0);

function matrix(
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
): Matrix4 {
  POS.set(x, y, z);
  ROT.setFromAxisAngle(Y_AXIS, yaw);
  SCALE.setScalar(scale);
  return new Matrix4().compose(POS, ROT, SCALE);
}

function addBatch(batches: Batches, root: string, seat: Matrix4): void {
  const list = batches.get(root);
  if (list) list.push(seat);
  else batches.set(root, [seat]);
}

function InstancedRoot({
  geometry,
  material,
  matrices,
}: {
  geometry: BufferGeometry;
  material: MeshStandardNodeMaterial;
  matrices: readonly Matrix4[];
}) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((seat, index) => mesh.setMatrixAt(index, seat));
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [matrices]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, matrices.length)]}
    />
  );
}

function useKitRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!upliftActive()) return;
    let live = true;
    for (const path of KIT_PATHS) {
      void whenKitReady(path).then(() => {
        if (live) setRevision((value) => value + 1);
      });
    }
    return () => {
      live = false;
    };
  }, []);
  return revision;
}

function geometryMap(
  kit: string,
  roots: readonly string[],
  fit: 'height' | 'extent',
): Map<string, BufferGeometry> {
  const out = new Map<string, BufferGeometry>();
  for (const root of roots) {
    const geometry = kitGeometryFit(
      kit,
      root,
      fit === 'height' ? { mode: 'height', height: 1 } : { mode: 'extent', extent: 1 },
    );
    if (geometry) out.set(root, geometry);
  }
  return out;
}

function depositFamily(kind: string): (typeof DEPOSIT_FAMILIES)[number] {
  switch (kind) {
    case 'ferrous-drift':
      return 'ferrous';
    case 'fossil-atmosphere':
    case 'reef-chalk':
      return 'fossil';
    case 'cryogenic-brine':
    case 'polar-firn':
    case 'glacier-core':
      return 'brine';
    case 'vent-sulphur':
      return 'sulfur';
    case 'living-basalt':
    case 'biotite-loam':
      return 'biologic';
    default:
      return 'crystal';
  }
}

function landmarkBatches(landmarks: readonly LandmarkSpec[]): Batches {
  const out: Batches = new Map();
  for (const landmark of landmarks) {
    if (!(landmark.kind in LANDMARK_HEIGHT)) continue;
    const height = LANDMARK_HEIGHT[landmark.kind]! * landmark.scale;
    addBatch(
      out,
      landmark.kind,
      matrix(landmark.x, landmark.y + height * 0.5, landmark.z, landmark.rot, height),
    );
  }
  return out;
}

function depositBatches(deposits: readonly DepositVisualSpec[]): Batches {
  const out: Batches = new Map();
  for (const deposit of deposits) {
    const family = depositFamily(deposit.kind);
    const state = deposit.state ?? 'intact';
    const root = `deposit-${family}-${state}`;
    const height = (state === 'depleted' ? 0.55 : state === 'cracked' ? 0.95 : 1.35)
      * deposit.scale;
    addBatch(
      out,
      root,
      matrix(deposit.x, deposit.y + height * 0.47, deposit.z, deposit.rot, height),
    );
  }
  return out;
}

function clutterBatches(
  p: SurfaceParams,
  tiers: SurfaceTiers,
): Batches {
  const out: Batches = new Map();
  const roots = CLUTTER_BY_TYPE[p.type] ?? CLUTTER_BY_TYPE.terrestrial!;
  const random = mulberry((p.seed ^ 0x51c77e2) >>> 0);
  for (let index = 0; index < 54; index++) {
    const angle = random() * Math.PI * 2;
    const reach = 74 + Math.sqrt(random()) * 560;
    const x = Math.cos(angle) * reach;
    const z = Math.sin(angle) * reach;
    const y = heightAt(p, tiers, x, z);
    if (y < p.seaLevelM + (p.type === 'ocean' ? -1 : 2)) continue;
    const root = index % 17 === 0
      ? 'clutter-expedition-debris'
      : roots[index % roots.length]!;
    const height = root.includes('pebbles') || root.includes('slag')
      ? 0.22 + random() * 0.28
      : 0.48 + random() * 0.78;
    addBatch(out, root, matrix(x, y + height * 0.48, z, random() * Math.PI * 2, height));
  }
  return out;
}

function settlementBatches(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  districts: readonly DistrictSpec[],
): Batches {
  const out: Batches = new Map();
  for (const district of districts) {
    const random = mulberry((p.seed ^ Math.imul(district.index + 1, 0x6d2b79f5)) >>> 0);
    SETTLEMENT_ROOTS.forEach((root, index) => {
      const angle = random() * Math.PI * 2;
      const reach = 8 + index * 1.65 + random() * 5;
      const x = district.x + Math.cos(angle) * reach;
      const z = district.z + Math.sin(angle) * reach;
      const ground = heightAt(p, tiers, x, z);
      const height = SETTLEMENT_HEIGHT[root]!;
      addBatch(out, root, matrix(x, ground + height * 0.5, z, angle + Math.PI, height));
    });
  }
  return out;
}

function vignetteBatches(vignettes: readonly VignetteSpec[]): Batches {
  const out: Batches = new Map();
  for (const vignette of vignettes) {
    const root = `vignette-${vignette.kind}`;
    if (!VIGNETTE_ROOTS.includes(root)) continue;
    const height = (root === 'vignette-tide-chorus' ? 1.2 : 1.6) * vignette.scale;
    addBatch(
      out,
      root,
      matrix(vignette.x, vignette.y + height * 0.48, vignette.z, vignette.rot, height),
    );
  }
  return out;
}

function generatedCreatures(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  districts: readonly DistrictSpec[],
): CreatureVisualSpec[] {
  const out: CreatureVisualSpec[] = [];
  const ambient = speciesPresent(p.type, p.aspects.bio, 'ambient')
    .filter((species) => species.id in CREATURE_EXTENT);
  for (const species of ambient) {
    const kind = species.id as CreatureVisualSpec['kind'];
    const random = mulberry((p.seed ^ species.id.split('').reduce(
      (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
      2166136261,
    )) >>> 0);
    const count = kind === 'sky-wisp' || kind === 'aurora-moth' || kind === 'cinder-wren' ? 9 : 7;
    for (let index = 0; index < count; index++) {
      const angle = random() * Math.PI * 2;
      const reach = 110 + random() * 430;
      const x = Math.cos(angle) * reach;
      const z = Math.sin(angle) * reach;
      const ground = heightAt(p, tiers, x, z);
      const airborne = kind === 'sky-wisp' || kind === 'aurora-moth' || kind === 'cinder-wren';
      const water = kind === 'glass-shoal';
      out.push({
        kind,
        x,
        y: water ? p.seaLevelM + 0.4 + random() * 0.8 : ground + (airborne ? 7 + random() * 14 : 0.35),
        z,
        rot: random() * Math.PI * 2,
        scale: 0.82 + random() * 0.38,
      });
    }
  }
  if (p.aspects.bio >= 0.2) {
    for (const district of districts) {
      for (let index = 0; index < 4; index++) {
        const angle = index * Math.PI * 0.5 + district.sizeRoll;
        out.push({
          kind: 'settlement-swift',
          x: district.x + Math.cos(angle) * 11,
          y: district.y + 8 + index * 1.3,
          z: district.z + Math.sin(angle) * 11,
          rot: angle + Math.PI * 0.5,
          scale: 0.9,
        });
      }
    }
  }
  return out;
}

function creatureBatches(creatures: readonly CreatureVisualSpec[]): Batches {
  const out: Batches = new Map();
  for (const creature of creatures) {
    const extent = CREATURE_EXTENT[creature.kind] * (creature.scale ?? 1);
    addBatch(out, creature.kind, matrix(
      creature.x,
      creature.y,
      creature.z,
      creature.rot,
      extent,
    ));
  }
  return out;
}

function weatherRoots(type: string, weatherKind: string | undefined): string[] {
  const out = ['weather-windsock', 'weather-storm-vane'];
  if (type === 'ice' || weatherKind === 'whiteout') {
    out.push('weather-icicles', 'weather-snow-drift');
  }
  if (type === 'desert' || weatherKind === 'dust') {
    out.push('weather-dust-streamer', 'weather-loose-straps');
  }
  if (type === 'ocean' || weatherKind === 'rain' || weatherKind === 'storm') {
    out.push('weather-puddle', 'weather-rain-catcher', 'weather-drain-chain');
  }
  if (type === 'terrestrial') out.push('weather-banner', 'weather-rain-catcher');
  if (type === 'volcanic') out.push('weather-loose-straps', 'weather-dust-streamer');
  return [...new Set(out)];
}

function weatherBatches(
  p: SurfaceParams,
  tiers: SurfaceTiers,
  districts: readonly DistrictSpec[],
  weatherKind: string | undefined,
): Batches {
  const out: Batches = new Map();
  const roots = weatherRoots(p.type, weatherKind);
  const anchors = districts.length > 0
    ? districts
    : [{ index: 0, x: 72, y: heightAt(p, tiers, 72, -58), z: -58 }];
  anchors.forEach((anchor, anchorIndex) => {
    roots.forEach((root, index) => {
      const angle = index * 2.39996 + anchorIndex * 0.73;
      const reach = 7 + index * 1.4;
      const x = anchor.x + Math.cos(angle) * reach;
      const z = anchor.z + Math.sin(angle) * reach;
      const ground = heightAt(p, tiers, x, z);
      const height = WEATHER_HEIGHT[root]!;
      addBatch(out, root, matrix(x, ground + height * 0.5, z, angle, height));
    });
  });
  return out;
}

function animatedMaterial(
  family: string,
  atlas: string,
  normalRma: string,
  rate: number,
  amplitude: [number, number, number],
): MeshStandardNodeMaterial {
  const material = kitMaterial(family, atlas, {
    normalRma,
    roughness: 0.78,
    metalness: 0.08,
  });
  const mask = attribute('uv1', 'vec2');
  const beat = time
    .mul(rate)
    .add(mask.y.mul(Math.PI * 2))
    .add(float(instanceIndex).mul(0.618));
  const swing = sin(beat).mul(mask.x);
  material.positionNode = vec3(
    positionLocal.x.add(swing.mul(amplitude[0])),
    positionLocal.y.add(swing.mul(amplitude[1])),
    positionLocal.z.add(swing.mul(amplitude[2])),
  );
  return material;
}

function BatchLayer({
  batches,
  geometry,
  material,
}: {
  batches: Batches;
  geometry: Map<string, BufferGeometry>;
  material: MeshStandardNodeMaterial;
}) {
  return [...batches].map(([root, matrices]) => {
    const rootGeometry = geometry.get(root);
    if (!rootGeometry || matrices.length === 0) return null;
    return (
      <InstancedRoot
        key={root}
        geometry={rootGeometry}
        material={material}
        matrices={matrices}
      />
    );
  });
}

export function WorldDetail({
  p,
  tiers,
  landmarks = [],
  deposits = [],
  districts = [],
  vignettes = [],
  creatures,
  weatherKind,
  epoch = 0,
}: WorldDetailProps) {
  const revision = useKitRevision();

  const geometries = useMemo(() => {
    void revision;
    if (!upliftActive()) return null;
    return {
      landmarks: geometryMap(LANDMARK_KIT, LANDMARK_ROOTS, 'height'),
      dressing: geometryMap(DRESSING_KIT, [
        ...DEPOSIT_ROOTS,
        ...CLUTTER_ROOTS,
        ...SETTLEMENT_ROOTS,
        ...VIGNETTE_ROOTS,
      ], 'height'),
      creatures: geometryMap(CREATURE_KIT, CREATURE_ROOTS, 'extent'),
      weather: geometryMap(WEATHER_KIT, WEATHER_ROOTS, 'height'),
    };
  }, [revision]);

  const materials = useMemo(() => upliftActive() ? ({
    landmark: kitMaterial('surface-landmarks', LANDMARK_ATLAS, {
      normalRma: LANDMARK_RMA,
      roughness: 0.91,
      metalness: 0.03,
    }),
    deposit: kitMaterial('surface-deposits', DEPOSIT_ATLAS, {
      normalRma: DEPOSIT_RMA,
      roughness: 0.72,
      metalness: 0.12,
    }),
    clutter: kitMaterial('surface-biome-clutter', CLUTTER_ATLAS, {
      normalRma: CLUTTER_RMA,
      roughness: 0.89,
      metalness: 0.03,
    }),
    settlement: kitMaterial('surface-settlement-dressing', SETTLEMENT_ATLAS, {
      normalRma: SETTLEMENT_RMA,
      roughness: 0.67,
      metalness: 0.34,
    }),
    vignette: kitMaterial('surface-ecology-vignettes', ECOLOGY_ATLAS, {
      normalRma: ECOLOGY_RMA,
      roughness: 0.81,
      metalness: 0.02,
    }),
    creature: animatedMaterial(
      'surface-creature-variants',
      ECOLOGY_ATLAS,
      ECOLOGY_RMA,
      3.2,
      [0.08, 0.12, 0.05],
    ),
    weather: animatedMaterial(
      'surface-weather-props',
      WEATHER_ATLAS,
      WEATHER_RMA,
      2.0,
      [0.14, 0.025, 0.18],
    ),
  }) : null, []);

  const batches = useMemo(() => {
    void epoch;
    const creatureSeats = creatures ?? generatedCreatures(p, tiers, districts);
    return {
      landmarks: landmarkBatches(landmarks),
      deposits: depositBatches(deposits),
      clutter: clutterBatches(p, tiers),
      settlement: settlementBatches(p, tiers, districts),
      vignettes: vignetteBatches(vignettes),
      creatures: creatureBatches(creatureSeats),
      weather: weatherBatches(p, tiers, districts, weatherKind),
    };
  }, [
    p,
    tiers,
    landmarks,
    deposits,
    districts,
    vignettes,
    creatures,
    weatherKind,
    epoch,
  ]);

  // The parent scene's primitive layers remain the fallback until each root
  // arrives. Missing roots are skipped one by one rather than blanking a kit.
  if (!geometries || !materials) return null;
  return (
    <group name="world-detail">
      <BatchLayer batches={batches.landmarks} geometry={geometries.landmarks} material={materials.landmark} />
      <BatchLayer batches={batches.deposits} geometry={geometries.dressing} material={materials.deposit} />
      <BatchLayer batches={batches.clutter} geometry={geometries.dressing} material={materials.clutter} />
      <BatchLayer batches={batches.settlement} geometry={geometries.dressing} material={materials.settlement} />
      <BatchLayer batches={batches.vignettes} geometry={geometries.dressing} material={materials.vignette} />
      <BatchLayer batches={batches.creatures} geometry={geometries.creatures} material={materials.creature} />
      <BatchLayer batches={batches.weather} geometry={geometries.weather} material={materials.weather} />
    </group>
  );
}
