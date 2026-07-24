import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import type { CompletedPlanetRecord } from '../../../engine/types';
import { createMiniPlanetGeometry, MINI_SIZE } from '../miniPlanet';
import { CURRENT_SYSTEM_ANCHOR, orbitSlot, starClass, starColor } from '../universeLayout';
import { C } from '../../../content/constants';
import { inspectHandlers, makeGlowSprite, TYPE_LABEL } from './shared';

const MINI_MATERIAL = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
const TRANSIT_MS = 1900;

/** The tilted, squashed orbit path a slot's world actually follows.
 * Closed by repeating the first point — the renderer supports Line, not LineLoop. */
function orbitPathGeometry(slot: number): BufferGeometry {
  const o = orbitSlot(slot);
  const n = 96;
  const pts = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const a = ((i % n) / n) * Math.PI * 2;
    pts[i * 3] = CURRENT_SYSTEM_ANCHOR.x + Math.cos(a) * o.radius;
    pts[i * 3 + 1] = CURRENT_SYSTEM_ANCHOR.y + Math.sin(a) * o.radius * 0.22;
    pts[i * 3 + 2] = CURRENT_SYSTEM_ANCHOR.z + Math.sin(a) * o.radius * 0.6;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pts, 3));
  return geo;
}

const ORBIT_MAT = new LineBasicMaterial({ color: 0x8ca0c8, transparent: true, opacity: 0.13 });

/** One finished world, orbiting its slot. The newest flies in from the hero position. */
function MiniWorld({
  record,
  slot,
  isNewest,
}: {
  record: CompletedPlanetRecord;
  slot: number;
  isNewest: boolean;
}) {
  const ref = useRef<Mesh>(null);
  const geometry = useMemo(() => createMiniPlanetGeometry(record), [record]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const born = useRef<number | null>(null);
  const o = orbitSlot(slot);
  const size = MINI_SIZE[record.size];

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const a = o.phase + t * o.speed;
    const target = new Vector3(
      CURRENT_SYSTEM_ANCHOR.x + Math.cos(a) * o.radius,
      CURRENT_SYSTEM_ANCHOR.y + Math.sin(a) * o.radius * 0.22,
      CURRENT_SYSTEM_ANCHOR.z + Math.sin(a) * o.radius * 0.6,
    );
    if (isNewest) {
      if (born.current === null) born.current = t;
      const k = Math.min(1, ((t - born.current) * 1000) / TRANSIT_MS);
      const ease = 1 - Math.pow(1 - k, 3);
      // Fly from the hero planet's position out to the system slot, shrinking.
      mesh.position.set(0, 0, 0).lerp(target, ease);
      mesh.scale.setScalar(1.0 + (size - 1.0) * ease);
    } else {
      mesh.position.copy(target);
      mesh.scale.setScalar(size);
    }
    mesh.rotation.y = t * 0.3;
  });

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={MINI_MATERIAL}
      {...inspectHandlers(
        record.name,
        `${TYPE_LABEL[record.type] ?? record.type} · ${record.size} · world ${slot + 1} of ${C.PLANETS_PER_SYSTEM}`,
      )}
    />
  );
}

/** The system currently assembling: a star, orbit paths, and your finished worlds. */
export function AssemblingSystem() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const all = s.run.completedPlanets;
  const inSystem = all.slice(s.run.systems * C.PLANETS_PER_SYSTEM);
  const newestIndex = inSystem.length - 1;

  const starSeed = inSystem[0]?.seed ?? s.seed;
  const star = useMemo(() => starColor(starSeed), [starSeed]);
  const starGlow = useMemo(() => makeGlowSprite(star.getHex(), 0.8), [star]);
  const orbitLines = useMemo(
    () =>
      Array.from({ length: C.PLANETS_PER_SYSTEM }, (_, i) => {
        const l = new Line(orbitPathGeometry(i), ORBIT_MAT);
        l.raycast = () => null;
        return l;
      }),
    [],
  );

  const flicker = useRef<Mesh>(null);
  useFrame((state) => {
    const m = flicker.current;
    if (m) m.scale.setScalar(0.34 + Math.sin(state.clock.elapsedTime * 2.3) * 0.015);
  });

  if (inSystem.length === 0) return null;
  return (
    <group>
      <mesh
        ref={flicker}
        position={CURRENT_SYSTEM_ANCHOR}
        {...inspectHandlers(`System ${s.run.systems + 1}, assembling`, starClass(starSeed))}
      >
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial color={star} />
      </mesh>
      <sprite position={CURRENT_SYSTEM_ANCHOR} scale={[1.6, 1.6, 1]} raycast={() => null}>
        <primitive object={starGlow} attach="material" />
      </sprite>
      <pointLight position={CURRENT_SYSTEM_ANCHOR} color={star} intensity={5} distance={7} />
      {orbitLines.slice(0, inSystem.length).map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      {inSystem.map((rec, i) => (
        <MiniWorld
          key={`${rec.seed}-${i}`}
          record={rec}
          slot={i}
          isNewest={i === newestIndex && i === inSystem.length - 1}
        />
      ))}
    </group>
  );
}
