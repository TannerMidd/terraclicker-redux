import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  PointsMaterial,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import { galaxyPosition, protoSwirlPoints } from '../universeLayout';
import { C } from '../../../content/constants';
import { inspectHandlers, makeGlowSprite } from './shared';
import { sharedHitProxyMaterial } from './pool';

/**
 * The next galaxy, pending: loose matter loitering at its future address,
 * thickening with every system you form. Gravity has expressed interest.
 */
export function ProtoGalaxy() {
  const key = useGame((g) => `${g.s.run.systems}:${g.s.run.galaxies}`);
  const [systemsStr, galaxiesStr] = key.split(':') as [string, string];
  const systems = Number(systemsStr);
  const galaxies = Number(galaxiesStr);
  const masterSeed = useGame.getState().s.seed;
  const toward = systems - galaxies * C.SYSTEMS_PER_GALAXY; // 0–4

  const pos = useMemo(() => galaxyPosition(galaxies, masterSeed), [galaxies, masterSeed]);
  const geo = useMemo(() => {
    if (toward <= 0) return null;
    const all = protoSwirlPoints((masterSeed ^ (galaxies * 0xa11)) >>> 0, 480);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(all.slice(0, toward * 120 * 3), 3));
    return g;
  }, [toward, galaxies, masterSeed]);
  const mat = useMemo(
    () =>
      new PointsMaterial({
        size: 1.4,
        sizeAttenuation: false,
        color: 0x9fb4e8,
        transparent: true,
        opacity: 0.1,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const glow = useMemo(() => makeGlowSprite(0x9fb4e8, 0.0), []);

  const swirl = useRef<Group>(null);
  useFrame((state, dt) => {
    if (swirl.current) swirl.current.rotation.y += dt * 0.05;
    const breathe = 0.5 + Math.sin(state.clock.elapsedTime * 0.9) * 0.5;
    mat.opacity = toward > 0 ? 0.08 + toward * 0.05 + breathe * 0.03 : 0;
    glow.opacity = toward > 0 ? 0.05 + toward * 0.045 * breathe : 0;
  });

  if (!geo || toward <= 0) return null;
  return (
    <group position={pos} rotation={[0.7, 0, 0.2]}>
      <group ref={swirl}>
        <points geometry={geo} material={mat} raycast={() => null} />
      </group>
      <sprite scale={[2.2, 2.2, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
      <mesh
        {...inspectHandlers(
          'A galaxy, pending',
          `${toward} of ${C.SYSTEMS_PER_GALAXY} systems gathered · gravity has expressed interest`,
        )}
      >
        <sphereGeometry args={[1.6, 8, 8]} />
        <primitive object={sharedHitProxyMaterial()} attach="material" />
      </mesh>
    </group>
  );
}
