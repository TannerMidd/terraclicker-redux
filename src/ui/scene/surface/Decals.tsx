/**
 * Ground scars (ASSET_UPLIFT.md 1.6): a small instanced pool of atlas quads
 * the session hangs on the nonces that already fire — a set-down stamps gear
 * marks under the pads, a worked seam stamps spoil. Scars persist for the
 * stay; the pool recycles the oldest when it runs out, which nobody has ever
 * noticed on a walk.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import { MINING_VERBS, surfaceLive } from './surfaceControl';
import { createGroundDecalMaterial, DECAL_CELLS } from './surfaceMaterial';
import { groundNormalAt, heightAt, type SurfaceParams, type SurfaceTiers } from './terrainField';
import { upliftTex } from '../uplift/upliftAssets';

const DECAL_MAX = 24;
const SEAT = new Object3D();
const UP = new Vector3(0, 1, 0);
const N1 = new Vector3();
const Q1 = new Quaternion();
const M0 = new Matrix4().makeScale(0, 0, 0);

export function Decals({ p, tiers }: { p: SurfaceParams; tiers: SurfaceTiers }) {
  const atlas = useMemo(() => upliftTex('textures/ground/ground-decals.ktx2'), []);
  const mesh = useRef<InstancedMesh>(null);
  const next = useRef(0);
  const cleared = useRef(false);
  const lastTouchdown = useRef(surfaceLive.touchdownNonce);
  const lastMine = useRef(surfaceLive.mineNonce);

  const built = useMemo(() => {
    if (!atlas) return null;
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const cells = new InstancedBufferAttribute(new Float32Array(DECAL_MAX), 1);
    cells.setUsage(DynamicDrawUsage);
    geometry.setAttribute('decalCell', cells);
    const material = createGroundDecalMaterial(atlas, cells);
    return { geometry, cells, material };
  }, [atlas]);

  useFrame(() => {
    const m = mesh.current;
    if (!m || !built) return;
    const live = surfaceLive;

    if (!cleared.current) {
      cleared.current = true;
      for (let i = 0; i < DECAL_MAX; i++) m.setMatrixAt(i, M0);
      m.count = DECAL_MAX;
      m.instanceMatrix.needsUpdate = true;
    }

    const stamp = (x: number, z: number, cell: number, size: number, yaw: number) => {
      const i = next.current;
      next.current = (i + 1) % DECAL_MAX;
      const y = heightAt(p, tiers, x, z);
      groundNormalAt(p, tiers, x, z, N1);
      SEAT.position.set(x, y + 0.07, z);
      SEAT.quaternion.setFromUnitVectors(UP, N1.lerp(UP, 0.35).normalize());
      SEAT.quaternion.multiply(Q1.setFromAxisAngle(UP, yaw));
      SEAT.scale.setScalar(size);
      SEAT.updateMatrix();
      m.setMatrixAt(i, SEAT.matrix);
      built.cells.setX(i, cell);
      built.cells.needsUpdate = true;
      m.instanceMatrix.needsUpdate = true;
    };

    // A set-down leaves gear marks under the pads.
    if (live.touchdownNonce !== lastTouchdown.current) {
      lastTouchdown.current = live.touchdownNonce;
      stamp(live.shipAt.x, live.shipAt.z, DECAL_CELLS.landingGear, 7.5, live.shipAt.yaw);
    }

    // A yielded seam leaves what the verb made of it.
    if (live.mineNonce !== lastMine.current) {
      lastMine.current = live.mineNonce;
      const verb = MINING_VERBS[live.verbIdx] ?? 'break';
      const cell =
        verb === 'core' ? DECAL_CELLS.drillSpatter
        : verb === 'break' ? DECAL_CELLS.seamSpoil
        : DECAL_CELLS.footprint;
      stamp(live.hitAt.x, live.hitAt.z, cell, 3.4, Math.random() * Math.PI * 2);
    }
  });

  if (!built) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[built.geometry, built.material, DECAL_MAX]}
      frustumCulled={false}
      renderOrder={4}
    />
  );
}
