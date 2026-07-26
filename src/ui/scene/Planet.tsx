import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three/webgpu';
import { actions, useGame } from '../../state/store';
import { useUiBus, zoomLive } from '../fx/uiBus';
import { ASPECTS, type AspectId } from '../../engine/types';
import { format } from '../../engine/num';
import { mulberry } from '../../engine/rng';
import { createPlanetGeometry } from './planetGeometry';
import { heroMoonPosition, heroMoons, heroWorldRadius } from './universeLayout';
import {
  createAtmosphereMaterial,
  createCloudMaterial,
  createPlanetMaterial,
  paletteFor,
} from './planetMaterial';
import * as audio from '../audio/audio';
import { SCENE_SPRITES } from '../assets';
import { sceneTex } from './spriteTextures';
import {
  HabitualAuroras,
  PlanetClickFX,
  SentientClouds,
  useReducedMotionRef,
  type PlanetClickFxHandle,
} from './PlanetFX';

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
  const sizeScale = heroWorldRadius(useGame.getState().s.planet.size);
  const flightMode = useUiBus((b) => b.flightMode);

  const fjords = quirks.includes('award-winning-fjords') ? 1 : 0;
  const reverse = quirks.includes('reverse-spin');
  const ringed = quirks.includes('pet-asteroid');
  const sentientClouds = quirks.includes('sentient-clouds');
  const auroraHabit = quirks.includes('aurora-habit');

  const geometry = useMemo(
    () => createPlanetGeometry(seed, type, detail, fjords),
    [seed, type, detail, fjords],
  );
  const palette = useMemo(() => paletteFor(type, seed), [type, seed]);
  const surface = useMemo(() => createPlanetMaterial(palette, seed, isEarth), [palette, seed, isEarth]);
  const atmosphere = useMemo(() => createAtmosphereMaterial(palette), [palette]);
  const clouds = useMemo(() => createCloudMaterial(seed), [seed]);

  const decor = useMemo(() => {
    // Moons come from universeLayout so the helm collides with them exactly
    // where they are drawn; the ring roll must follow the same stream.
    const moons = heroMoons(seed, isEarth);
    const r = mulberry(seed ^ 0xdeca);
    if (!isEarth) r();
    for (let i = 0; i < moons.length * 5; i++) r();
    return { moons, hasRing: ringed || r() < 0.24 };
  }, [seed, isEarth, ringed]);

  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const impact = useRef<PlanetClickFxHandle>(null);
  const clickNormal = useMemo(() => new Vector3(), []);
  const reducedMotion = useReducedMotionRef();
  const scaleRef = useRef({ v: 0.01, vel: 0 });
  const squashRef = useRef({ v: 0, vel: 0 });
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

    // A click compresses the world by a few percent, then lets it settle.
    const squash = squashRef.current;
    if (reducedMotion.current) {
      squash.v = 0;
      squash.vel = 0;
    } else {
      squash.vel += (-squash.v * 82 - squash.vel * 13) * d;
      squash.v += squash.vel * d;
    }

    // On the perspective journey the current world recedes toward a dot —
    // the Total Perspective Vortex, performed rather than described.
    const zz = Math.max(0, Math.min(1, (zoomLive.v - 0.5) / 0.5));
    const vortex = flightMode ? 1 : 1 - (zz * zz * (3 - 2 * zz)) * 0.7;
    if (group.current) {
      const base = Math.max(0.01, s.v) * sizeScale * vortex;
      const q = Math.max(-0.18, Math.min(0.42, squash.v));
      group.current.scale.set(
        base * (1 + q * 0.05),
        base * (1 - q * 0.075),
        base * (1 + q * 0.05),
      );
    }

    // Rotation (occasionally, allegedly, reversed).
    if (spin.current) spin.current.rotation.y += d * 0.045 * (reverse ? -1 : 1);

    // The pet asteroid follows its planet around like a very slow dog.
    const pet = petRef.current;
    if (pet) {
      const a = state.clock.elapsedTime * 0.09 + 1.2;
      pet.position.set(
        Math.cos(a) * 2.35,
        Math.sin(state.clock.elapsedTime * 0.5) * 0.18,
        Math.sin(a) * 2.35,
      );
    }

    // Moons orbit.
    const t = state.clock.elapsedTime;
    decor.moons.forEach((m, i) => {
      const mesh = moonRefs.current[i];
      if (!mesh) return;
      heroMoonPosition(m, t, mesh.position);
    });
  });

  const onClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const { d } = useGame.getState();
    actions.click();
    audio.thock();
    const bus = useUiBus.getState();
    if (!reducedMotion.current) {
      bus.punch();
      squashRef.current.vel = Math.min(8, squashRef.current.vel + 5.4);
    }
    if (spin.current) {
      spin.current.worldToLocal(clickNormal.copy(e.point)).normalize();
      impact.current?.burst(clickNormal);
    }
    bus.addFloat(e.nativeEvent.clientX, e.nativeEvent.clientY - 12, `+${format(d.clickPower)}`);
  };

  const marvin = useGame((g) => (g.s.buildings['marvin'] ?? 0) > 0);
  const marvinMat = useMemo(
    () => new SpriteMaterial({ map: sceneTex(SCENE_SPRITES.installation('marvin')), transparent: true, depthWrite: false }),
    [],
  );
  const petMat = useMemo(
    () => new SpriteMaterial({ map: sceneTex(SCENE_SPRITES.misc.petAsteroid), transparent: true, depthWrite: false }),
    [],
  );
  const petRef = useRef<Sprite>(null);

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
        <PlanetClickFX ref={impact} reducedMotion={reducedMotion} />
      </group>
      <mesh scale={1.18} raycast={() => null}>
        <icosahedronGeometry args={[1, 4]} />
        <primitive object={atmosphere.mat} attach="material" />
      </mesh>
      {sentientClouds && (
        <SentientClouds
          key={`sentient-${planetKey}`}
          seed={seed}
          reducedMotion={reducedMotion}
        />
      )}
      {auroraHabit && (
        <HabitualAuroras
          key={`aurora-${planetKey}`}
          seed={seed}
          reducedMotion={reducedMotion}
        />
      )}
      {decor.hasRing && (
        <mesh rotation={[Math.PI / 2.35, 0, 0.2]} raycast={() => null}>
          <primitive object={ringGeometry} attach="geometry" />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      )}
      {ringed && (
        /* The pet asteroid. It has a collar. Nobody discusses this. */
        <sprite ref={petRef} scale={[0.13, 0.13, 1]} raycast={() => null}>
          <primitive object={petMat} attach="material" />
        </sprite>
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
            <sprite position={[0, m.size + 0.028, 0]} scale={[0.06, 0.06, 1]} raycast={() => null}>
              <primitive object={marvinMat} attach="material" />
            </sprite>
          )}
        </mesh>
      ))}
    </group>
  );
}

export { SUN_DIR, ASPECTS };
