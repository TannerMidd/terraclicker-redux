/**
 * Cloud banks — modelled weather in the band you actually fly through.
 *
 * The cloud deck above these is a 64 km plane at 1400 m with a flow-mapped
 * shader. It is the right tool for a ceiling and the wrong one for anything
 * else: being effectively infinite, it has no near side, so there is nothing
 * to fly past. Low flight tops out at 1800 m — above the deck — and until now
 * the whole ascent had no parallax in it at all.
 *
 * So: three authored banks, instanced on world-fixed hashed cells between 520
 * and 1050 m, streaming with the walker exactly as the props do. Three draw
 * calls, one unlit material, no light mounted (mounting one would invalidate
 * every material in the scene, which is a rule this project learned the hard
 * way).
 *
 * The shading is baked into the geometry: pale lobes on top, grey-blue
 * underneath, turned into a vertex gradient by the kit merge. All this
 * material does is tint that gradient by the sky's own colour and let the
 * scene fog take the distant ones.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, MeshBasicNodeMaterial, Matrix4, Object3D } from 'three/webgpu';
import { mulberry } from '../../../engine/rng';
import { universeMotion } from '../universe/operationsVisual';
import { surfaceLive } from './surfaceControl';
import { heightAt, type SurfaceTiers } from './terrainField';
import type { SurfaceParams } from './terrainField';
import type { PlanetPalette } from '../planetMaterial';
import { kitGeometryFit, upliftActive } from '../uplift/upliftAssets';

const CLOUD_KIT = 'meshes/sky/cloud-banks.glb';
const SEAT = new Object3D();
const ZERO = new Matrix4().makeScale(0, 0, 0);

/**
 * The band, below the deck at 1400. Measured against the GROUND under each
 * bank as well as against sea level: on a high landing the sea-level figure
 * alone puts clouds among the hilltops, where they stop reading as sky and
 * start reading as snow.
 */
const FLOOR_M = 520;
const AGL_MIN_M = 430;
const BAND_M = 530;

/**
 * One bank shape. Each takes its own cell salt, so the three families do not
 * land on top of each other, and its own size range — a torn scrap has no
 * business being three hundred metres across.
 */
interface BankDef {
  asset: string;
  salt: number;
  /** Cell edge and reach, metres. Bigger cells, fewer and lonelier clouds. */
  cellM: number;
  reachM: number;
  /** Chance a cell holds one at full coverage. */
  chance: number;
  size: [number, number];
  max: number;
}

const BANKS: BankDef[] = [
  { asset: 'cloud-bank-a', salt: 0x51a3, cellM: 1500, reachM: 5200, chance: 0.55, size: [150, 330], max: 10 },
  { asset: 'cloud-bank-b', salt: 0x7c19, cellM: 2100, reachM: 5600, chance: 0.42, size: [190, 420], max: 8 },
  { asset: 'cloud-bank-c', salt: 0x2e77, cellM: 1200, reachM: 4200, chance: 0.5, size: [90, 190], max: 10 },
];

/** How much cloud the sky is carrying, from the deck's own coverage figure. */
function bankLoad(coverage: number): number {
  return Math.min(1, Math.max(0, coverage * 1.35));
}

function Bank({
  def,
  p,
  tiers,
  material,
  coverage,
}: {
  def: BankDef;
  p: SurfaceParams;
  tiers: SurfaceTiers;
  material: MeshBasicNodeMaterial;
  coverage: { value: number };
}) {
  const ref = useRef<InstancedMesh>(null);
  // Per-session, like the rest of the surface: a kit that has not landed
  // leaves this landing with the deck alone, which is what it always had.
  const geometry = useMemo(
    () => (upliftActive() ? kitGeometryFit(CLOUD_KIT, def.asset, { mode: 'extent', extent: 1 }) : null),
    [def.asset],
  );

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = universeMotion.reduced ? 0 : state.clock.elapsedTime;
    const live = surfaceLive;
    const load = bankLoad(coverage.value);
    let i = 0;
    if (load > 0.02) {
      const { cellM, reachM } = def;
      const c0x = Math.floor((live.pos.x - reachM) / cellM);
      const c1x = Math.floor((live.pos.x + reachM) / cellM);
      const c0z = Math.floor((live.pos.z - reachM) / cellM);
      const c1z = Math.floor((live.pos.z + reachM) / cellM);
      for (let iz = c0z; iz <= c1z && i < def.max; iz++) {
        for (let ix = c0x; ix <= c1x && i < def.max; ix++) {
          const r = mulberry(
            (p.seed ^ def.salt ^ Math.imul(ix + 7919, 0x85ebca6b) ^ Math.imul(iz + 104729, 0xc2b2ae35)) >>> 0,
          );
          if (r() >= def.chance * load) continue;
          const x = (ix + 0.2 + r() * 0.6) * cellM;
          const z = (iz + 0.2 + r() * 0.6) * cellM;
          const dx = x - live.pos.x;
          const dz = z - live.pos.z;
          if (dx * dx + dz * dz > reachM * reachM) continue;
          const phase = r() * Math.PI * 2;
          const size = def.size[0] + r() * (def.size[1] - def.size[0]);
          // A sway rather than a drift. A cloud that truly translated would
          // wander out of the cell that spawned it and pop when the cell
          // streamed out; at this distance a sway reads the same and cannot.
          const sway = Math.sin(t * 0.021 + phase) * size * 0.22;
          const base = Math.max(
            p.seaLevelM + FLOOR_M,
            heightAt(p, tiers, x, z) + AGL_MIN_M,
          );
          SEAT.position.set(
            x + sway,
            base + r() * BAND_M,
            z + Math.cos(t * 0.017 + phase) * size * 0.16,
          );
          SEAT.rotation.set(0, phase, 0);
          // The authored bank is already three times wider than tall, so this
          // only varies it — squash it further and it reads as a pancake.
          SEAT.scale.set(size, size * (0.78 + r() * 0.34), size);
          SEAT.updateMatrix();
          mesh.setMatrixAt(i++, SEAT.matrix);
        }
      }
    }
    for (let k = i; k < def.max; k++) mesh.setMatrixAt(k, ZERO);
    mesh.count = def.max;
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!geometry) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, def.max]}
      material={material}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}

export function CloudBanks({
  p,
  tiers,
  palette,
  coverage,
  day,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  palette: PlanetPalette;
  /** The deck's live coverage — the banks answer to the same weather. */
  coverage: { value: number };
  /** 1 by day, 0 at night; these clouds are lit by the sky, having no light. */
  day: { value: number };
}) {
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.vertexColors = true;
    m.color = new Color(0xffffff);
    m.fog = true;
    return m;
  }, []);

  const lit = useMemo(() => palette.atmosphere.clone().lerp(new Color(0xffffff), 0.55), [palette]);
  const dark = useMemo(() => palette.atmosphere.clone().multiplyScalar(0.17), [palette]);

  useFrame(() => {
    material.color.copy(dark).lerp(lit, day.value);
  });

  return (
    <>
      {BANKS.map((def) => (
        <Bank
          key={def.asset}
          def={def}
          p={p}
          tiers={tiers}
          material={material}
          coverage={coverage}
        />
      ))}
    </>
  );
}
