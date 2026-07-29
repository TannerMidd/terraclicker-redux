/**
 * Near-ground contact effects: the missing half of precipitation and movement.
 * A single instanced atlas pool carries boot prints, skimmer tracks, rain
 * ripples, mining chips, dust puffs and lightning contact flashes.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import {
  floor,
  instancedBufferAttribute,
  uv,
  vec2,
} from 'three/tsl';
import { mulberry } from '../../../engine/rng';
import { upliftActive, upliftNode } from '../uplift/upliftAssets';
import { surfaceLive } from './surfaceControl';
import {
  groundNormalAt,
  heightAt,
  type SurfaceParams,
  type SurfaceTiers,
} from './terrainField';

const CONTACT_MAX = 56;
const SEAT = new Object3D();
const UP = new Vector3(0, 1, 0);
const NORMAL = new Vector3();
const YAW = new Quaternion();
const ZERO = new Matrix4().makeScale(0, 0, 0);

const CELL = {
  rainA: 0,
  rainB: 1,
  lightning: 2,
  footprint: 3,
  skimmerTrack: 4,
  debris: 5,
} as const;

interface ContactMark {
  x: number;
  z: number;
  yaw: number;
  size: number;
  cell: number;
  age: number;
  duration: number;
  expand: number;
}

function contactMaterial(
  cells: InstancedBufferAttribute,
  lives: InstancedBufferAttribute,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  const cell = instancedBufferAttribute(cells);
  const life = instancedBufferAttribute(lives);
  const cellX = cell.mod(3);
  const cellY = floor(cell.div(3));
  const sourceUv = uv();
  const atlasUv = vec2(
    sourceUv.x.add(cellX).div(3),
    sourceUv.y.oneMinus().add(cellY).div(2),
  );
  const sample = upliftNode('textures/ground/contact-fx.ktx2', atlasUv, {
    placeholder: 'clear',
    srgb: true,
  });
  material.colorNode = sample.rgb;
  material.opacityNode = sample.a.mul(life).mul(0.84);
  return material;
}

export function SurfaceContactFX({
  p,
  tiers,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const marks = useRef<ContactMark[]>([]);
  const lastFoot = useRef({ x: surfaceLive.pos.x, z: surfaceLive.pos.z, side: 0 });
  const lastSkim = useRef({ x: surfaceLive.pos.x, z: surfaceLive.pos.z });
  const lastHit = useRef(surfaceLive.hitNonce);
  const lastFlash = useRef(false);
  const rainClock = useRef(0);
  const random = useMemo(() => mulberry((p.seed ^ 0xc07ac7) >>> 0), [p.seed]);

  const built = useMemo(() => {
    if (!upliftActive()) return null;
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const cells = new InstancedBufferAttribute(new Float32Array(CONTACT_MAX), 1);
    const lives = new InstancedBufferAttribute(new Float32Array(CONTACT_MAX), 1);
    cells.setUsage(DynamicDrawUsage);
    lives.setUsage(DynamicDrawUsage);
    geometry.setAttribute('contactCell', cells);
    geometry.setAttribute('contactLife', lives);
    return { geometry, cells, lives, material: contactMaterial(cells, lives) };
  }, []);

  useEffect(() => {
    return () => {
      built?.geometry.dispose();
      built?.material.dispose();
    };
  }, [built]);

  useFrame((_, dtRaw) => {
    const target = mesh.current;
    if (!target || !built) return;
    const dt = Math.min(dtRaw, 0.1);
    const live = surfaceLive;
    const list = marks.current;
    const add = (mark: Omit<ContactMark, 'age'>) => {
      if (list.length >= CONTACT_MAX) list.shift();
      list.push({ ...mark, age: 0 });
    };

    if (live.phase === 'walk' && live.grounded) {
      const walked = Math.hypot(live.pos.x - lastFoot.current.x, live.pos.z - lastFoot.current.z);
      if (walked > 1.28 && live.skimSpeed < 0.5) {
        lastFoot.current.side ^= 1;
        const side = lastFoot.current.side ? 0.18 : -0.18;
        add({
          x: live.pos.x + Math.cos(live.yaw) * side,
          z: live.pos.z - Math.sin(live.yaw) * side,
          yaw: -live.yaw,
          size: 0.55,
          cell: CELL.footprint,
          duration: 9,
          expand: 0,
        });
        lastFoot.current.x = live.pos.x;
        lastFoot.current.z = live.pos.z;
      }
    }

    if (live.skimSpeed > 1.5) {
      const travelled = Math.hypot(live.pos.x - lastSkim.current.x, live.pos.z - lastSkim.current.z);
      if (travelled > 2.3) {
        add({
          x: live.pos.x,
          z: live.pos.z,
          yaw: -live.yaw,
          size: 1.9,
          cell: CELL.skimmerTrack,
          duration: 12,
          expand: 0,
        });
        lastSkim.current.x = live.pos.x;
        lastSkim.current.z = live.pos.z;
      }
    } else {
      lastSkim.current.x = live.pos.x;
      lastSkim.current.z = live.pos.z;
    }

    if (live.hitNonce !== lastHit.current) {
      lastHit.current = live.hitNonce;
      add({
        x: live.hitAt.x,
        z: live.hitAt.z,
        yaw: random() * Math.PI * 2,
        size: 1.1,
        cell: CELL.debris,
        duration: 1.4,
        expand: 0.7,
      });
    }

    const wet = live.weather.kind === 'rain' || live.weather.kind === 'storm';
    rainClock.current -= dt;
    if (wet && live.weather.intensity > 0.08 && rainClock.current <= 0) {
      rainClock.current = 0.22 / Math.max(0.25, live.weather.intensity);
      const angle = random() * Math.PI * 2;
      const distance = 2 + Math.sqrt(random()) * 17;
      add({
        x: live.pos.x + Math.cos(angle) * distance,
        z: live.pos.z + Math.sin(angle) * distance,
        yaw: random() * Math.PI * 2,
        size: 0.45 + random() * 0.85,
        cell: random() < 0.5 ? CELL.rainA : CELL.rainB,
        duration: 0.9,
        expand: 1.5,
      });
    }

    const flashing = live.skyFlash > 0.55;
    if (flashing && !lastFlash.current) {
      const angle = random() * Math.PI * 2;
      const distance = 12 + random() * 24;
      add({
        x: live.pos.x + Math.cos(angle) * distance,
        z: live.pos.z + Math.sin(angle) * distance,
        yaw: angle,
        size: 3.4,
        cell: CELL.lightning,
        duration: 1.8,
        expand: 0.45,
      });
    }
    lastFlash.current = flashing;

    let count = 0;
    for (const mark of list) {
      mark.age += dt;
      if (mark.age >= mark.duration || count >= CONTACT_MAX) continue;
      const life = 1 - mark.age / mark.duration;
      const size = mark.size * (1 + mark.expand * (1 - life));
      const y = heightAt(p, tiers, mark.x, mark.z);
      groundNormalAt(p, tiers, mark.x, mark.z, NORMAL);
      SEAT.position.set(mark.x, y + 0.065, mark.z);
      SEAT.quaternion.setFromUnitVectors(UP, NORMAL.lerp(UP, 0.3).normalize());
      SEAT.quaternion.multiply(YAW.setFromAxisAngle(UP, mark.yaw));
      SEAT.scale.setScalar(size);
      SEAT.updateMatrix();
      target.setMatrixAt(count, SEAT.matrix);
      built.cells.setX(count, mark.cell);
      built.lives.setX(count, Math.min(1, life * 2.2));
      count++;
    }
    marks.current = list.filter((mark) => mark.age < mark.duration).slice(-CONTACT_MAX);
    for (let i = count; i < CONTACT_MAX; i++) {
      target.setMatrixAt(i, ZERO);
      built.lives.setX(i, 0);
    }
    target.count = CONTACT_MAX;
    target.instanceMatrix.needsUpdate = true;
    built.cells.needsUpdate = true;
    built.lives.needsUpdate = true;
  });

  if (!built) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[built.geometry, built.material, CONTACT_MAX]}
      frustumCulled={false}
      renderOrder={5}
    />
  );
}