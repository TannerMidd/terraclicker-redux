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
import { RunaboutLamp } from './RunaboutLamp';
import { SceneLamps } from './SceneLamps';
import { RunaboutHull } from './RunaboutHull';
import { ShaderWarmup } from './ShaderWarmup';
import { EventFX } from './EventFX';
import { stepFocusOut } from './universe/shared';
import { clickSuppressed, resetOrbit } from './navControl';
import { useSettings } from '../settings';
import { useUiBus } from '../fx/uiBus';

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

/** Empty-space clicks step out; a quick double-click recenters the orbit. */
let lastMissAt = 0;
function onMissed(): void {
  // At the helm an empty-space click is the steering stick being released.
  if (useUiBus.getState().flightMode) return;
  if (clickSuppressed()) return; // that was the end of a camera drag
  const now = performance.now();
  if (now - lastMissAt < 340) resetOrbit();
  else stepFocusOut();
  lastMissAt = now;
}

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
      camera={{ position: [1.85, 0.25, 6.4], fov: 42, near: 0.1, far: 4200 }}
      onPointerMissed={onMissed}
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer({
          ...(props as ConstructorParameters<typeof THREE.WebGPURenderer>[0]),
          antialias: true,
          powerPreference: 'high-performance',
        });
        await renderer.init();
        // WebGPU allocates its depth attachment during init. On a fresh mobile
        // canvas that can still be the HTML default (300x150) even though CSS
        // has already laid out the real viewport, producing invalid first
        // render passes until R3F's resize observer catches up.
        const canvas = (props as { canvas?: HTMLCanvasElement }).canvas;
        const initialWidth = Math.round(canvas?.clientWidth ?? 0);
        const initialHeight = Math.round(canvas?.clientHeight ?? 0);
        if (initialWidth > 0 && initialHeight > 0) {
          renderer.setSize(initialWidth, initialHeight, false);
        }
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
      {/* At the helm the ship brings its own light; out there, nothing else does. */}
      <RunaboutLamp />
      {/* Every other point light in the game, permanent so the scene never
          recompiles because a star came into view. */}
      <SceneLamps />
      <Stars count={cfg.stars} />
      <Planet detail={cfg.detail} />
      <Infrastructure />
      <Universe />
      <Traffic />
      <EventFX />
      <Bubbles />
      <VogonFleet />
      <CameraRig />
      {/* AFTER CameraRig, deliberately: R3F runs useFrame callbacks in mount
          order, so the hull has to be subscribed later than the rig or it
          poses itself against last frame's camera and visibly swims. */}
      <RunaboutHull />
      <ShaderWarmup />
    </Canvas>
  );
}
