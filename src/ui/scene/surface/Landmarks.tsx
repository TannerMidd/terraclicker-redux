/**
 * The region's memorable places, drawn. Seven instanced families cover the
 * whole grammar — monolith boxes, columns, ice shards, cones, boulders,
 * emissive vents and translucent plumes — so a horizon full of landmarks
 * costs seven draw calls and zero shader builds (materials are shared
 * standard/basic nodes with palette colours, per the sharing law).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { buildLandmarkSeats, type LandmarkSeats } from './surfaceLandmarks';
import { surfaceLandmarkList, surfaceLive } from './surfaceControl';
import type { SurfaceParams, SurfaceTiers } from './terrainField';
import type { PlanetPalette } from '../planetMaterial';

function useSeatMesh(seats: LandmarkSeats[keyof LandmarkSeats]) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    seats.forEach((matrix, i) => m.setMatrixAt(i, matrix));
    m.count = seats.length;
    m.instanceMatrix.needsUpdate = true;
  }, [seats]);
  return ref;
}

export function Landmarks({
  p,
  tiers,
  palette,
  epoch = 0,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  palette: PlanetPalette;
  /** Terrain re-centre epoch: seats re-derive when the ground rolls. */
  epoch?: number;
}) {
  const seats = useMemo(
    () => {
      void epoch; // every foot re-samples the (possibly re-baked) ground
      return buildLandmarkSeats(p, tiers, surfaceLandmarkList());
    },
    [p, tiers, epoch],
  );

  const stone = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.high.clone().multiplyScalar(0.68);
    m.roughness = 0.92;
    m.flatShading = true;
    return m;
  }, [palette]);
  const columnMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.peak.clone().multiplyScalar(0.62);
    m.roughness = 0.88;
    m.flatShading = true;
    return m;
  }, [palette]);
  const shardMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.ice.clone();
    m.roughness = 0.22;
    m.flatShading = true;
    return m;
  }, [palette]);
  const ventMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x2a1c16);
    m.emissive = palette.emissive.getHex() === 0 ? new Color(0xff5a22) : palette.emissive.clone();
    m.emissiveIntensity = 1.6;
    m.roughness = 0.85;
    m.flatShading = true;
    return m;
  }, [palette]);
  const plumeMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(0xdfe4e8);
    m.transparent = true;
    m.opacity = 0.14;
    m.depthWrite = false;
    return m;
  }, []);

  const box = useSeatMesh(seats.box);
  const column = useSeatMesh(seats.column);
  const shard = useSeatMesh(seats.shard);
  const cone = useSeatMesh(seats.cone);
  const rock = useSeatMesh(seats.rock);
  const vent = useSeatMesh(seats.vent);
  const plume = useSeatMesh(seats.plume);

  // Plumes breathe; vents glow harder at night. Cheap uniform work only.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    plumeMat.opacity = 0.1 + Math.sin(t * 0.7) * 0.03 + Math.max(0, -surfaceLive.sunUp) * 0.05;
    ventMat.emissiveIntensity = 1.3 + Math.max(0, -surfaceLive.sunUp) * 1.4 + Math.sin(t * 2.3) * 0.15;
  });

  return (
    <group name="landmarks">
      {seats.box.length > 0 && (
        <instancedMesh ref={box} args={[undefined, undefined, seats.box.length]} material={stone} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {seats.column.length > 0 && (
        <instancedMesh ref={column} args={[undefined, undefined, seats.column.length]} material={columnMat} frustumCulled={false}>
          <cylinderGeometry args={[0.82, 1.05, 1, 6]} />
        </instancedMesh>
      )}
      {seats.shard.length > 0 && (
        <instancedMesh ref={shard} args={[undefined, undefined, seats.shard.length]} material={shardMat} frustumCulled={false}>
          <octahedronGeometry args={[1, 0]} />
        </instancedMesh>
      )}
      {seats.cone.length > 0 && (
        <instancedMesh ref={cone} args={[undefined, undefined, seats.cone.length]} material={stone} frustumCulled={false}>
          <coneGeometry args={[1, 1, 9]} />
        </instancedMesh>
      )}
      {seats.rock.length > 0 && (
        <instancedMesh ref={rock} args={[undefined, undefined, seats.rock.length]} material={stone} frustumCulled={false}>
          <icosahedronGeometry args={[1, 1]} />
        </instancedMesh>
      )}
      {seats.vent.length > 0 && (
        <instancedMesh ref={vent} args={[undefined, undefined, seats.vent.length]} material={ventMat} frustumCulled={false}>
          <coneGeometry args={[1, 1, 7]} />
        </instancedMesh>
      )}
      {seats.plume.length > 0 && (
        <instancedMesh ref={plume} args={[undefined, undefined, seats.plume.length]} material={plumeMat} frustumCulled={false}>
          <coneGeometry args={[1, 1, 8, 1, true]} />
        </instancedMesh>
      )}
    </group>
  );
}
