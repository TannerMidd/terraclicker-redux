import { useMemo } from 'react';
import { Canvas, extend } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { Planet, SUN_DIR } from './Planet';
import { Stars } from './Stars';
import { CameraRig } from './CameraRig';
import { Bubbles } from './Bubbles';
import { VogonFleet } from './VogonFleet';
import { Infrastructure } from './Infrastructure';
import { Universe } from './Universe';
import { Traffic } from './Traffic';
import { useSettings } from '../settings';

// Register the three/webgpu namespace for R3F JSX intrinsics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
extend(THREE as any);

type Tier = 'high' | 'medium' | 'low';

function detectTier(): Tier {
  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) return 'high';
  } catch {
    /* fall through */
  }
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return cores >= 6 ? 'medium' : 'low';
}

const TIER_CONFIG: Record<Tier, { detail: number; stars: number; dpr: [number, number] }> = {
  high: { detail: 5, stars: 2600, dpr: [1, 2] },
  medium: { detail: 4, stars: 1400, dpr: [1, 1.5] },
  low: { detail: 3, stars: 700, dpr: [1, 1] },
};

export default function SceneRoot() {
  const quality = useSettings((s) => s.quality);
  const tier: Tier = useMemo(
    () => (quality === 'auto' ? detectTier() : quality),
    [quality],
  );
  const cfg = TIER_CONFIG[tier];

  return (
    <Canvas
      dpr={cfg.dpr}
      camera={{ position: [1.85, 0.25, 6.4], fov: 42, near: 0.1, far: 650 }}
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer({
          ...(props as ConstructorParameters<typeof THREE.WebGPURenderer>[0]),
          antialias: true,
          powerPreference: 'high-performance',
        });
        await renderer.init();
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.toneMappingExposure = 1.15;
        return renderer;
      }}
    >
      <color attach="background" args={[0x05060a]} />
      <ambientLight intensity={0.34} color={0x8aa4d4} />
      <directionalLight position={SUN_DIR} intensity={3.1} color={0xfff2dc} />
      {/* Cool fill so the night side reads as form, not absence. */}
      <directionalLight position={[-4.5, -1, -3]} intensity={0.4} color={0x3a5a8e} />
      <Stars count={cfg.stars} />
      <Planet detail={cfg.detail} />
      <Infrastructure />
      <Universe />
      <Traffic />
      <Bubbles />
      <VogonFleet />
      <CameraRig />
    </Canvas>
  );
}
