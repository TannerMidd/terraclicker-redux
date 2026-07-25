import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  Vector3,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import type { CompletedPlanetRecord } from '../../../engine/types';
import { settledGeometry, settledMaterial } from '../settledPlanet';
import { MINI_SIZE } from '../miniPlanet';
import { CURRENT_SYSTEM_ANCHOR, orbitSlot, starClass, starColor } from '../universeLayout';
import { C } from '../../../content/constants';
import { inspectHandlers, makeGlowSprite, TYPE_LABEL } from './shared';
import { SettledAtmosphere } from './SettledAtmosphere';
import { OrbitalHardware, SettlementLights, SystemShuttles } from './SettledWorld';

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
  const root = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  // Cached in settledPlanet.ts — do NOT dispose; other views share it.
  const geometry = useMemo(() => settledGeometry(record, 'mini'), [record]);
  const material = useMemo(() => settledMaterial(record), [record]);
  const born = useRef<number | null>(null);
  const o = orbitSlot(slot);
  const size = MINI_SIZE[record.size];

  useFrame((state) => {
    const group = root.current;
    if (!group) return;
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
      group.position.set(0, 0, 0).lerp(target, ease);
      group.scale.setScalar(1.0 + (size - 1.0) * ease);
    } else {
      group.position.copy(target);
      group.scale.setScalar(size);
    }
    if (mesh.current) mesh.current.rotation.y = t * 0.3;
  });

  return (
    <group ref={root}>
      <mesh
        ref={mesh}
        geometry={geometry}
        material={material}
        {...inspectHandlers(
          record.name,
          `${TYPE_LABEL[record.type] ?? record.type} · ${record.size} · world ${slot + 1} of ${C.PLANETS_PER_SYSTEM}`,
        )}
      >
        {/* Delivered means inhabited: the lights stay on out here too. */}
        <SettlementLights record={record} variant="mini" />
      </mesh>
      <SettledAtmosphere record={record} />
      <OrbitalHardware record={record} variant="mini" />
    </group>
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
      {/* Even a half-built system runs a commuter service. */}
      <SystemShuttles
        spec={{
          worldPos: (slot, t, out) => {
            const o = orbitSlot(slot);
            const a = o.phase + t * o.speed;
            out.set(
              CURRENT_SYSTEM_ANCHOR.x + Math.cos(a) * o.radius,
              CURRENT_SYSTEM_ANCHOR.y + Math.sin(a) * o.radius * 0.22,
              CURRENT_SYSTEM_ANCHOR.z + Math.sin(a) * o.radius * 0.6,
            );
          },
          worldCount: inSystem.length,
          ships: 1 + Math.min(2, Math.floor(s.lifetime.planetsCompleted / 10)),
          seed: starSeed,
          scale: 0.07,
        }}
      />
    </group>
  );
}
