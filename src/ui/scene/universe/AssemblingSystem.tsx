import { useEffect, useMemo, useRef } from 'react';
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
import {
  CURRENT_SYSTEM_ANCHOR,
  SYSTEM_DETAIL_R,
  SYSTEM_ORBIT_Y,
  SYSTEM_ORBIT_Z,
  SYSTEM_STAR_RADIUS,
  detailWorldRadius,
  orbitSlot,
  starClass,
  starColor,
  systemOrbitOffset,
} from '../universeLayout';
import { C } from '../../../content/constants';
import { inspectHandlers, makeGlowSprite, TYPE_LABEL } from './shared';
import { useLamp } from '../SceneLamps';
import { SettledAtmosphere } from './SettledAtmosphere';
import { OrbitalHardware, SettlementLights, SystemShuttles } from './SettledWorld';
import { SETTLED_SPIN_RATE, worldSpins } from '../navControl';
import { sharedBasicMaterial } from './pool';

/** The tilted circular orbit path a slot's world actually follows.
 * Closed by repeating the first point — the renderer supports Line, not LineLoop. */
function orbitPathGeometry(slot: number): BufferGeometry {
  const o = orbitSlot(slot);
  const n = 96;
  const pts = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const a = ((i % n) / n) * Math.PI * 2;
    pts[i * 3] = CURRENT_SYSTEM_ANCHOR.x + Math.cos(a) * o.radius;
    pts[i * 3 + 1] = CURRENT_SYSTEM_ANCHOR.y + Math.sin(a) * o.radius * SYSTEM_ORBIT_Y;
    pts[i * 3 + 2] = CURRENT_SYSTEM_ANCHOR.z + Math.sin(a) * o.radius * SYSTEM_ORBIT_Z;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pts, 3));
  return geo;
}

const ORBIT_MAT = new LineBasicMaterial({ color: 0x8ca0c8, transparent: true, opacity: 0.2 });

/** One finished world at the same canonical pose used by navigation and collision. */
function MiniWorld({
  record,
  slot,
}: {
  record: CompletedPlanetRecord;
  slot: number;
}) {
  const root = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  // Cached in settledPlanet.ts — do NOT dispose; other views share it.
  const geometry = useMemo(() => settledGeometry(record, 'visit'), [record]);
  const material = useMemo(() => settledMaterial(record), [record]);
  const target = useMemo(() => new Vector3(), []);
  const size = detailWorldRadius(record.size);

  // These worlds are landable from the helm, and their lights ride the
  // spinning mesh — publish the spin exactly as FocusedSystem does, so a
  // groundfall can un-rotate its approach into the record's frame.
  useEffect(() => {
    worldSpins.set(record.lifetimeIndex, 0);
    return () => void worldSpins.delete(record.lifetimeIndex);
  }, [record.lifetimeIndex]);

  useFrame((state) => {
    const group = root.current;
    if (!group) return;
    const t = state.clock.elapsedTime;
    systemOrbitOffset(slot, t, true, target).add(CURRENT_SYSTEM_ANCHOR);
    // The ceremony supplies the motion; the physical world itself never
    // departs from the pose the helm targets and collides with.
    group.position.copy(target);
    group.scale.setScalar(size);
    if (mesh.current) {
      mesh.current.rotation.y = t * SETTLED_SPIN_RATE;
      worldSpins.set(record.lifetimeIndex, mesh.current.rotation.y);
    }
  });

  return (
    <group ref={root} name={`assembling-world-${slot}`}>
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
        <SettlementLights record={record} variant="visit" />
      </mesh>
      <SettledAtmosphere record={record} />
      <OrbitalHardware record={record} variant="visit" />
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
  // The star's light. It goes out between systems — when the last one formed
  // and departed there is no star here yet, and a lit void is worse than a
  // dark one. (The lamp itself is permanent; only its brightness moves.)
  const lamp = useLamp();
  const lit = inSystem.length > 0;
  useEffect(() => {
    lamp.set(CURRENT_SYSTEM_ANCHOR, star, lit ? 9 : 0, SYSTEM_DETAIL_R * 1.8);
  }, [lamp, star, lit]);
  useFrame((state) => {
    const m = flicker.current;
    if (m) m.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.3) * 0.015);
  });

  if (inSystem.length === 0) return null;
  return (
    <group>
      <mesh
        ref={flicker}
        position={CURRENT_SYSTEM_ANCHOR}
        {...inspectHandlers(`System ${s.run.systems + 1}, assembling`, starClass(starSeed))}
      >
        <icosahedronGeometry args={[SYSTEM_STAR_RADIUS, 4]} />
        <primitive object={sharedBasicMaterial({ color: star })} attach="material" />
      </mesh>
      <sprite position={CURRENT_SYSTEM_ANCHOR} scale={[7.6, 7.6, 1]} raycast={() => null}>
        <primitive object={starGlow} attach="material" />
      </sprite>
      {/* Its light comes from the permanent pool — see SceneLamps. */}
      {orbitLines.slice(0, inSystem.length).map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      {inSystem.map((rec, i) => (
        <MiniWorld
          key={`${rec.seed}-${i}`}
          record={rec}
          slot={i}
        />
      ))}
      {/* Even a half-built system runs a commuter service. */}
      <SystemShuttles
        spec={{
          worldPos: (slot, t, out) => {
            systemOrbitOffset(slot, t, true, out).add(CURRENT_SYSTEM_ANCHOR);
          },
          worldCount: inSystem.length,
          ships: 1 + Math.min(2, Math.floor(s.lifetime.planetsCompleted / 10)),
          seed: starSeed,
          scale: 0.12,
        }}
      />
    </group>
  );
}
