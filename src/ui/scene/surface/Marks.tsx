/**
 * The marks you left, drawn — and the resonator, when a lead is asking.
 *
 * Beacons, stations, shelters and repairs render as five instanced families
 * (masts, lamp heads, frames, domes, plates) with shared materials, so a
 * world you have thoroughly waymarked still costs five draw calls and zero
 * shader builds. Seats re-derive on the terrain epoch like every other
 * placed thing, and on `markNonce` so a mark planted this stay stands the
 * same frame the toast fires.
 *
 * The beacon's head pulses. That is the entire point of a beacon, and the
 * scene would be lying if it did not.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
  type Mesh,
} from 'three/webgpu';
import { heightAt, type SurfaceParams, type SurfaceTiers } from './terrainField';
import { surfaceLead, surfaceLive, surfaceMarks } from './surfaceControl';
import type { PlanetPalette } from '../planetMaterial';
import { kitGeometry, upliftActive, upliftFamilyMaterial } from '../uplift/upliftAssets';

const MARK_KIT = 'meshes/marks/mark-kit.glb';

const M = new Matrix4();
const P = new Vector3();
const Q = new Quaternion();
const S = new Vector3();
const AXIS_Y = new Vector3(0, 1, 0);

function seat(
  list: Matrix4[],
  x: number,
  y: number,
  z: number,
  yaw: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  P.set(x, y, z);
  Q.setFromAxisAngle(AXIS_Y, yaw);
  S.set(sx, sy, sz);
  list.push(M.compose(P, Q, S).clone());
}

interface MarkSeats {
  mast: Matrix4[]; // beacon poles + station masts
  lamp: Matrix4[]; // beacon heads (the pulse)
  frame: Matrix4[]; // station tripod legs + instrument boxes + repair plinths
  dome: Matrix4[]; // shelters
  plate: Matrix4[]; // repair panels + station dishes
  /** Whole-asset seats when the mark kit is loaded (ASSET_UPLIFT.md 2.6). */
  kit: Record<'beacon' | 'station' | 'shelter' | 'repair', Matrix4[]>;
}

function buildMarkSeats(p: SurfaceParams, tiers: SurfaceTiers, kits: boolean): MarkSeats {
  const seats: MarkSeats = {
    mast: [], lamp: [], frame: [], dome: [], plate: [],
    kit: { beacon: [], station: [], shelter: [], repair: [] },
  };
  for (const m of surfaceMarks()) {
    const y = heightAt(p, tiers, m.x, m.z);
    // A stable, boring yaw from the position: marks do not fidget.
    const yaw = ((Math.abs(m.x * 13.37 + m.z * 7.91) % 6.283) + 6.283) % 6.283;
    if (kits && (KIT_KINDS as readonly string[]).includes(m.kind)) {
      // The kit was authored to the composed silhouettes' proportions: one
      // base-origin seat per mark, scale 1. The lamp overlays keep the pulse.
      seat(seats.kit[m.kind as keyof MarkSeats['kit']], m.x, y, m.z, yaw, 1, 1, 1);
      if (m.kind === 'beacon') seat(seats.lamp, m.x, y + 4.75, m.z, yaw, 0.42, 0.42, 0.42);
      if (m.kind === 'shelter') {
        seat(seats.lamp, m.x + Math.cos(yaw) * 1.7, y + 0.75, m.z + Math.sin(yaw) * 1.7, yaw, 0.2, 0.2, 0.2);
      }
      continue;
    }
    switch (m.kind) {
      case 'beacon': {
        seat(seats.mast, m.x, y + 2.3, m.z, yaw, 0.14, 4.6, 0.14);
        seat(seats.lamp, m.x, y + 4.75, m.z, yaw, 0.42, 0.42, 0.42);
        // Three guy-feet, because a mast that simply stands looks pasted on.
        for (let i = 0; i < 3; i++) {
          const a = yaw + (i / 3) * Math.PI * 2;
          seat(seats.frame, m.x + Math.cos(a) * 0.55, y + 0.18, m.z + Math.sin(a) * 0.55, a, 0.12, 0.36, 0.12);
        }
        break;
      }
      case 'station': {
        // Tripod: three leaning legs under an instrument body and a dish.
        for (let i = 0; i < 3; i++) {
          const a = yaw + (i / 3) * Math.PI * 2;
          seat(seats.frame, m.x + Math.cos(a) * 0.62, y + 0.75, m.z + Math.sin(a) * 0.62, a, 0.14, 1.5, 0.14);
        }
        seat(seats.frame, m.x, y + 1.62, m.z, yaw, 0.85, 0.6, 0.85);
        seat(seats.mast, m.x, y + 2.35, m.z, yaw, 0.08, 1.2, 0.08);
        seat(seats.plate, m.x, y + 2.05, m.z, yaw + 0.7, 0.72, 0.1, 0.72);
        break;
      }
      case 'shelter': {
        seat(seats.dome, m.x, y + 0.28, m.z, yaw, 2.1, 1.35, 2.1);
        seat(seats.lamp, m.x + Math.cos(yaw) * 1.7, y + 0.75, m.z + Math.sin(yaw) * 1.7, yaw, 0.2, 0.2, 0.2);
        break;
      }
      case 'repair': {
        // A mended thing is mostly the town's; the mark is a plinth, a fresh
        // plate, and the small implication that somebody climbed something.
        seat(seats.frame, m.x, y + 0.35, m.z, yaw, 0.7, 0.7, 0.7);
        seat(seats.plate, m.x, y + 0.86, m.z, yaw + 0.35, 0.9, 0.08, 0.62);
        break;
      }
    }
  }
  return seats;
}

const KIT_KINDS = ['beacon', 'station', 'shelter', 'repair'] as const;
const KIT_ASSET: Record<(typeof KIT_KINDS)[number], string> = {
  beacon: 'beacon-mast',
  station: 'survey-station',
  shelter: 'shelter',
  repair: 'repair-rig',
};

/** One authored mark kind, instanced against the shared mark material. */
function MarkKitSeats({
  kind,
  seats,
  material,
}: {
  kind: (typeof KIT_KINDS)[number];
  seats: Matrix4[];
  material: MeshStandardNodeMaterial;
}) {
  const ref = useSeatMesh(seats);
  const geometry = useMemo(() => kitGeometry(MARK_KIT, KIT_ASSET[kind]), [kind]);
  if (seats.length === 0 || !geometry) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, seats.length]} material={material} frustumCulled={false} />
  );
}

function useSeatMesh(seats: Matrix4[]) {
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

export function Marks({
  p,
  tiers,
  palette,
  epoch = 0,
  nonce = 0,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  palette: PlanetPalette;
  /** Terrain re-centre epoch: seats re-derive when the ground rolls. */
  epoch?: number;
  /** Bumped by surfaceControl when a mark plants mid-stay. */
  nonce?: number;
}) {
  const kitReady = useMemo(
    () => upliftActive() && kitGeometry(MARK_KIT, 'beacon-mast') !== null,
    [],
  );
  const seats = useMemo(() => {
    void epoch;
    void nonce;
    return buildMarkSeats(p, tiers, kitReady);
  }, [p, tiers, epoch, nonce, kitReady]);

  const kitMat = useMemo(
    () =>
      upliftFamilyMaterial({
        atlas: 'textures/marks/mark-atlas.ktx2',
        tint: new Color(0x969696),
        gain: 1.15,
        roughness: 0.6,
        metalness: 0.35,
      }),
    [],
  );

  const metal = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x9aa4ad);
    m.roughness = 0.55;
    m.metalness = 0.6;
    m.flatShading = true;
    return m;
  }, []);
  const lampMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(0xffb347);
    m.transparent = true;
    return m;
  }, []);
  const canvasMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.low.clone().multiplyScalar(0.5).lerp(new Color(0xb8b0a2), 0.6);
    m.roughness = 0.95;
    m.flatShading = true;
    return m;
  }, [palette]);
  const plateMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0xd9dee2);
    m.roughness = 0.3;
    m.metalness = 0.75;
    m.flatShading = true;
    return m;
  }, []);

  const mast = useSeatMesh(seats.mast);
  const lamp = useSeatMesh(seats.lamp);
  const frame = useSeatMesh(seats.frame);
  const dome = useSeatMesh(seats.dome);
  const plate = useSeatMesh(seats.plate);

  // The broadcast: every lamp breathes together, brighter after dark. One
  // material, one uniform, no per-instance work.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    lampMat.opacity =
      0.55 + Math.sin(t * 2.6) * 0.35 + Math.max(0, -surfaceLive.sunUp) * 0.1;
  });

  return (
    <group name="ground-marks">
      {seats.mast.length > 0 && (
        <instancedMesh ref={mast} args={[undefined, undefined, seats.mast.length]} material={metal} frustumCulled={false}>
          <cylinderGeometry args={[1, 1, 1, 6]} />
        </instancedMesh>
      )}
      {seats.lamp.length > 0 && (
        <instancedMesh ref={lamp} args={[undefined, undefined, seats.lamp.length]} material={lampMat} frustumCulled={false}>
          <octahedronGeometry args={[1, 0]} />
        </instancedMesh>
      )}
      {seats.frame.length > 0 && (
        <instancedMesh ref={frame} args={[undefined, undefined, seats.frame.length]} material={metal} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {seats.dome.length > 0 && (
        <instancedMesh ref={dome} args={[undefined, undefined, seats.dome.length]} material={canvasMat} frustumCulled={false}>
          <sphereGeometry args={[1, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        </instancedMesh>
      )}
      {seats.plate.length > 0 && (
        <instancedMesh ref={plate} args={[undefined, undefined, seats.plate.length]} material={plateMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {KIT_KINDS.map((kind) => (
        <MarkKitSeats key={kind} kind={kind} seats={seats.kit[kind]} material={kitMat} />
      ))}
      <LeadResonator p={p} tiers={tiers} epoch={epoch} />
    </group>
  );
}

/**
 * The resonator: a shard of ground that has opinions about music. Stands
 * only while this landing is the lead's open question; hums by scale, not
 * by shader, because one object gets no pipeline of its own.
 */
function LeadResonator({
  p,
  tiers,
  epoch = 0,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  epoch?: number;
}) {
  const lead = surfaceLead();
  const ref = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const at = useMemo(() => {
    void epoch;
    if (!lead) return null;
    return { x: lead.x, y: heightAt(p, tiers, lead.x, lead.z), z: lead.z };
  }, [p, tiers, epoch, lead?.x, lead?.z]); // eslint-disable-line react-hooks/exhaustive-deps

  const shardMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x2c3438);
    m.emissive = new Color(0x6fe0c8);
    m.emissiveIntensity = 0.9;
    m.roughness = 0.35;
    m.flatShading = true;
    return m;
  }, []);
  const glowMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(0x6fe0c8);
    m.transparent = true;
    m.opacity = 0.16;
    m.depthWrite = false;
    return m;
  }, []);

  // Four notes a century, sped up for the impatient: a slow breathing scale
  // and a glow that quietens once the reading is aboard.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const read = surfaceLive.leadDone;
    const k = read ? 0.35 : 1;
    shardMat.emissiveIntensity = (0.7 + Math.sin(t * 1.7) * 0.35) * k;
    glowMat.opacity = (0.12 + Math.sin(t * 1.7) * 0.06) * k;
    if (ref.current) {
      const s = 1 + Math.sin(t * 1.7) * 0.015 * k;
      // The tall stance is baked here — the hum must not flatten the shard.
      ref.current.scale.set(0.72 * s, 1.9, 0.72 * s);
    }
    if (glow.current) glow.current.rotation.y = t * 0.22;
  });

  if (!at) return null;
  return (
    <group position={[at.x, at.y, at.z]} name="lead-resonator">
      <mesh ref={ref} material={shardMat} position={[0, 1.9, 0]} scale={[0.72, 1.9, 0.72]}>
        <octahedronGeometry args={[1.1, 0]} />
      </mesh>
      <mesh material={shardMat} position={[0.9, 0.55, -0.3]} rotation={[0.2, 0.9, 0.15]}>
        <octahedronGeometry args={[0.45, 0]} />
      </mesh>
      <mesh ref={glow} material={glowMat} position={[0, 1.9, 0]}>
        <octahedronGeometry args={[1.65, 0]} />
      </mesh>
    </group>
  );
}
