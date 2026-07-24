import { useMemo, useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  PointsMaterial,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import { useUiBus } from '../../fx/uiBus';
import { mulberry } from '../../../engine/rng';
import { galaxyCorePoints, galaxyPoints, galaxyPosition } from '../universeLayout';
import { C } from '../../../content/constants';
import { inspectHandlers, makeGlowSprite } from './shared';

const APP_T0 = performance.now();
const DETAILED = 8; // most recent galaxies get the full treatment
const MAX_SHOWN = 24; // older ones shine on as simple beacons

/** Arm points colored core→edge with a seeded personality hue. */
function armGeometry(seed: number): BufferGeometry {
  const pos = galaxyPoints(seed, 850);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const r = mulberry(seed ^ 0x4a1c);
  const warm = new Color(0xfff2d9);
  const cool = new Color().setHSL(0.55 + r() * 0.16, 0.35 + r() * 0.3, 0.72);
  const edge = new Color().setHSL(0.6 + r() * 0.2, 0.5, 0.6);
  const colors = new Float32Array(pos.length);
  const c = new Color();
  for (let i = 0; i < pos.length / 3; i++) {
    const rad = Math.hypot(pos[i * 3]!, pos[i * 3 + 2]!) / 3.45;
    c.copy(warm).lerp(cool, Math.min(1, rad * 2.2)).lerp(edge, Math.max(0, rad - 0.55) * 1.6);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}

function Galaxy({ index }: { index: number }) {
  const masterSeed = useGame.getState().s.seed;
  const seed = (masterSeed ^ (index * 7919)) >>> 0;
  const pos = useMemo(() => galaxyPosition(index, masterSeed), [index, masterSeed]);
  const arms = useMemo(() => armGeometry(seed), [seed]);
  const core = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(galaxyCorePoints(seed), 3));
    return geo;
  }, [seed]);
  const armMat = useMemo(
    () =>
      new PointsMaterial({
        size: 2.0,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const coreMat = useMemo(
    () =>
      new PointsMaterial({
        size: 2.1,
        sizeAttenuation: false,
        color: 0xffe9c9,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const glow = useMemo(() => makeGlowSprite(0xfff0d0, 0.62), []);

  const root = useRef<Group>(null);
  const spinner = useRef<Group>(null);
  // Galaxies present at page load appear formed; new ones are BORN —
  // scale-up with a fast spin that relaxes into the eternal drift.
  const isNewborn = useRef(performance.now() - APP_T0 > 4000);
  const born = useRef<number | null>(null);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;
    const age = t - born.current;
    if (spinner.current) {
      const spinUp = isNewborn.current ? Math.exp(-age * 1.1) * 0.5 : 0;
      spinner.current.rotation.y += dt * (0.03 + spinUp);
    }
    const g = root.current;
    if (g && isNewborn.current) {
      const k = Math.min(1, age / 2.2);
      const e = 1 - Math.pow(1 - k, 3);
      g.scale.setScalar(0.02 + e * 0.98);
      armMat.opacity = 0.15 + e * 0.65;
    }
  });

  return (
    <group
      ref={root}
      position={pos}
      rotation={[0.7, 0, 0.2]}
      {...inspectHandlers(
        `Galaxy ${index + 1}`,
        `${C.SYSTEMS_PER_GALAXY * C.PLANETS_PER_SYSTEM} worlds · ×${C.GALAXY_MULT} production · yours`,
      )}
    >
      <group ref={spinner}>
        <points geometry={arms} material={armMat} raycast={() => null} />
        <points geometry={core} material={coreMat} raycast={() => null} />
      </group>
      <sprite scale={[2.6, 2.6, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
      <mesh raycast={() => null}>
        <icosahedronGeometry args={[0.22, 1]} />
        <meshBasicMaterial color={0xfff2d9} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

/** An older galaxy, receded to a beacon: glow + nucleus, no arm cloud. */
function BeaconGalaxy({ index }: { index: number }) {
  const masterSeed = useGame.getState().s.seed;
  const pos = useMemo(() => galaxyPosition(index, masterSeed), [index, masterSeed]);
  const glow = useMemo(() => makeGlowSprite(0xffedc9, 0.4), []);
  return (
    <group position={pos}>
      <sprite scale={[1.8, 1.8, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
      <mesh {...inspectHandlers(`Galaxy ${index + 1}`, 'settled · still yours')}>
        <icosahedronGeometry args={[0.2, 1]} />
        <meshBasicMaterial color={0xfff2d9} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

export function Galaxies() {
  const galaxies = useGame((g) => g.s.run.galaxies);
  const cine = useUiBus((b) => b.activeCinematic);
  const queue = useUiBus((b) => b.cinematicQueue);
  // A galaxy whose formation ceremony is still playing OR still queued
  // hasn't happened on screen yet — it appears when the bloom does.
  const unborn = new Set(
    [cine, ...queue].filter((j) => j?.kind === 'galaxy').map((j) => j!.index),
  );
  const items: ReactElement[] = [];
  const from = Math.max(0, galaxies - MAX_SHOWN);
  for (let i = from; i < galaxies; i++) {
    if (unborn.has(i)) continue;
    if (i >= galaxies - DETAILED) items.push(<Galaxy key={i} index={i} />);
    else items.push(<BeaconGalaxy key={i} index={i} />);
  }
  return <group>{items}</group>;
}
