import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Group, Mesh, RingGeometry, DoubleSide, MeshBasicMaterial } from 'three/webgpu';
import { actions, useGame } from '../../state/store';
import { useUiBus, zoomLive } from '../fx/uiBus';
import { ASPECTS, type AspectId } from '../../engine/types';
import { format } from '../../engine/num';
import { mulberry } from '../../engine/rng';
import { createPlanetGeometry } from './planetGeometry';
import {
  createAtmosphereMaterial,
  createCloudMaterial,
  createPlanetMaterial,
  paletteFor,
} from './planetMaterial';
import * as audio from '../audio/audio';

const SUN_DIR: [number, number, number] = [4.2, 1.8, 2.6];

function gaugeFrac(a: AspectId): number {
  const p = useGame.getState().s.planet;
  const t = p.targets[a];
  return t.lte(0) ? 1 : Math.min(1, p.gauges[a].div(t).toNumber());
}

export function Planet({ detail }: { detail: number }) {
  // Re-mount planet visuals when the world itself changes.
  const planetKey = useGame((g) => `${g.s.planet.seed}:${g.s.planet.type}:${g.s.planet.lifetimeIndex}`);
  const [seedStr, type] = planetKey.split(':') as [string, import('../../engine/types').PlanetType, string];
  const seed = Number(seedStr);
  const isEarth = useGame.getState().s.planet.lifetimeIndex === 42;
  const quirks = useGame.getState().s.planet.quirks;
  const sizeScale = { small: 0.86, medium: 1, large: 1.1, huge: 1.2 }[
    useGame.getState().s.planet.size
  ];

  const fjords = quirks.includes('award-winning-fjords') ? 1 : 0;
  const reverse = quirks.includes('reverse-spin');
  const ringed = quirks.includes('pet-asteroid');

  const geometry = useMemo(
    () => createPlanetGeometry(seed, type, detail, fjords),
    [seed, type, detail, fjords],
  );
  const palette = useMemo(() => paletteFor(type, seed), [type, seed]);
  const surface = useMemo(() => createPlanetMaterial(palette, seed, isEarth), [palette, seed, isEarth]);
  const atmosphere = useMemo(() => createAtmosphereMaterial(palette), [palette]);
  const clouds = useMemo(() => createCloudMaterial(seed), [seed]);

  const decor = useMemo(() => {
    const r = mulberry(seed ^ 0xdeca);
    const moonCount = isEarth ? 1 : Math.floor(r() * 3.2);
    const moons = Array.from({ length: moonCount }, (_, i) => ({
      size: 0.05 + r() * 0.07,
      orbit: 1.9 + i * 0.55 + r() * 0.3,
      speed: (0.12 + r() * 0.18) * (r() < 0.2 ? -1 : 1),
      phase: r() * Math.PI * 2,
      tilt: (r() - 0.5) * 0.7,
    }));
    return { moons, hasRing: ringed || r() < 0.24 };
  }, [seed, isEarth, ringed]);

  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const scaleRef = useRef({ v: 0.01, vel: 0 });
  const moonRefs = useRef<(Mesh | null)[]>([]);

  // Hooks must not live inside conditional JSX (hook-order law).
  const ringGeometry = useMemo(() => new RingGeometry(1.42, 1.86, 96), []);
  const ringMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: 0xcabb9e,
        transparent: true,
        opacity: 0.11,
        side: DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  useMemo(() => {
    // New planet: warp in from a point.
    scaleRef.current = { v: 0.01, vel: 0 };
  }, [planetKey]);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    // Aspect uniforms glide toward the real gauges.
    const k = 1 - Math.exp(-d * 2.2);
    const u = surface.uniforms;
    u.thermal.value += (gaugeFrac('thermal') - (u.thermal.value as number)) * k;
    u.atmo.value += (gaugeFrac('atmo') - (u.atmo.value as number)) * k;
    u.hydro.value += (gaugeFrac('hydro') - (u.hydro.value as number)) * k;
    u.bio.value += (gaugeFrac('bio') - (u.bio.value as number)) * k;
    atmosphere.atmo.value = u.atmo.value;
    clouds.coverage.value = Math.min(
      1,
      (u.atmo.value as number) * 0.75 + (u.hydro.value as number) * 0.35,
    );

    // Warp-in spring.
    const s = scaleRef.current;
    const stiffness = 26;
    const damping = 7.4;
    const accel = (1 - s.v) * stiffness - s.vel * damping;
    s.vel += accel * d;
    s.v += s.vel * d;
    // On the perspective journey the current world recedes toward a dot —
    // the Total Perspective Vortex, performed rather than described.
    const zz = Math.max(0, Math.min(1, (zoomLive.v - 0.5) / 0.5));
    const vortex = 1 - (zz * zz * (3 - 2 * zz)) * 0.7;
    if (group.current)
      group.current.scale.setScalar(Math.max(0.01, s.v) * sizeScale * vortex);

    // Rotation (occasionally, allegedly, reversed).
    if (spin.current) spin.current.rotation.y += d * 0.045 * (reverse ? -1 : 1);

    // Moons orbit.
    const t = state.clock.elapsedTime;
    decor.moons.forEach((m, i) => {
      const mesh = moonRefs.current[i];
      if (!mesh) return;
      const a = m.phase + t * m.speed;
      mesh.position.set(Math.cos(a) * m.orbit, Math.sin(a * 0.7) * m.tilt, Math.sin(a) * m.orbit);
    });
  });

  const onClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const { d } = useGame.getState();
    actions.click();
    audio.thock();
    const bus = useUiBus.getState();
    bus.punch();
    bus.addFloat(e.nativeEvent.clientX, e.nativeEvent.clientY - 12, `+${format(d.clickPower)}`);
  };

  const marvin = useGame((g) => (g.s.buildings['marvin'] ?? 0) > 0);

  return (
    <group ref={group}>
      <group ref={spin}>
        <mesh geometry={geometry} onPointerDown={onClick}>
          <primitive object={surface.mat} attach="material" />
        </mesh>
        <mesh scale={1.035} raycast={() => null}>
          <icosahedronGeometry args={[1, Math.max(3, detail - 1)]} />
          <primitive object={clouds.mat} attach="material" />
        </mesh>
      </group>
      <mesh scale={1.18} raycast={() => null}>
        <icosahedronGeometry args={[1, 4]} />
        <primitive object={atmosphere.mat} attach="material" />
      </mesh>
      {decor.hasRing && (
        <mesh rotation={[Math.PI / 2.35, 0, 0.2]} raycast={() => null}>
          <primitive object={ringGeometry} attach="geometry" />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      )}
      {decor.moons.map((m, i) => (
        <mesh
          key={i}
          ref={(el) => {
            moonRefs.current[i] = el;
          }}
          raycast={() => null}
        >
          <icosahedronGeometry args={[m.size, 2]} />
          <meshStandardMaterial color={0x8d8d94} roughness={0.95} />
          {i === 0 && marvin && (
            /* Marvin sits on the nearest moon. He never animates. He has asked us not to. */
            <mesh position={[0, m.size + 0.012, 0]} raycast={() => null}>
              <boxGeometry args={[0.018, 0.03, 0.012]} />
              <meshStandardMaterial color={0x3a3f4a} roughness={0.6} metalness={0.7} />
            </mesh>
          )}
        </mesh>
      ))}
    </group>
  );
}

export { SUN_DIR, ASPECTS };
