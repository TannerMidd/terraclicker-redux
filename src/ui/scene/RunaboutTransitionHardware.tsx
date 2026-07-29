/**
 * Articulated runabout access and landing hardware.
 *
 * This component is intentionally not mounted here: the landed ship lives in
 * SurfaceScene and owns its world pose. Mount this beside `runaboutGeometry`
 * inside that same ship group, pass the surface phase, and these authored
 * roots align to the existing landed-hull fit.
 *
 * Blender animation is not used. Door, ramp and each gear leg remain rigid
 * GLB roots; code drives their transforms, preserving the kit merge contract.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three/webgpu';
import { kitGeometryRotated, kitMaterial } from './uplift/upliftAssets';
import { useKitGeometry } from './uplift/shipKit';

const TRANSITION_KIT = 'meshes/ships/runabout-cockpit.glb';

export type RunaboutTransitionPhase =
  | 'stowed'
  | 'descent'
  | 'landed'
  | 'walk'
  | 'takeoff';

export interface RunaboutTransitionHardwareProps {
  phase: RunaboutTransitionPhase;
  /** Optional exact drives for cinematic/control code; values are clamped 0–1. */
  gearDeployment?: number;
  accessDeployment?: number;
  /** Parent-space adjustment. The defaults assume a sibling of the landed hull. */
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/**
 * runabout.py authored bounds -> LandedRunabout's fit box:
 *   X -6.44..6.44 -> -0.71..0.71
 *   Z -1.30..2.20 ->  0.00..0.42
 *   Y -8.00..6.00 -> -0.85..0.70 after the vehicle's PI turn
 */
const LANDED_SCALE: [number, number, number] = [
  1.42 / 12.88,
  0.42 / 3.50,
  1.55 / 14.00,
];
const LANDED_SEAT: [number, number, number] = [
  0,
  1.30 * LANDED_SCALE[1],
  -0.85 + 8.00 * LANDED_SCALE[2],
];

function useTransitionPart(name: string) {
  return useKitGeometry(TRANSITION_KIT, () => {
    return kitGeometryRotated(TRANSITION_KIT, name, Math.PI);

  });
}

function targets(phase: RunaboutTransitionPhase): { gear: number; access: number } {
  switch (phase) {
    case 'descent':
      return { gear: 1, access: 0 };
    case 'landed':
      return { gear: 1, access: 0.12 };
    case 'walk':
      return { gear: 1, access: 1 };
    case 'takeoff':
      // Still visibly down while the ship clears the pad; the caller can
      // subsequently switch to stowed or drive an exact deployment value.
      return { gear: 0.68, access: 0 };
    default:
      return { gear: 0, access: 0 };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt * rate));
}

export function RunaboutTransitionHardware({
  phase,
  gearDeployment,
  accessDeployment,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: RunaboutTransitionHardwareProps) {
  const door = useTransitionPart('airlock-door');
  const ramp = useTransitionPart('boarding-ramp');
  const gearPort = useTransitionPart('landing-gear-port');
  const gearStarboard = useTransitionPart('landing-gear-starboard');
  const gearNose = useTransitionPart('landing-gear-nose');

  const doorRef = useRef<Mesh>(null);
  const rampRef = useRef<Mesh>(null);
  const portRef = useRef<Mesh>(null);
  const starboardRef = useRef<Mesh>(null);
  const noseRef = useRef<Mesh>(null);
  const initial = targets(phase);
  const motion = useRef({ gear: initial.gear, access: initial.access });

  useFrame((_, dt) => {
    const desired = targets(phase);
    const gearTarget = clamp01(gearDeployment ?? desired.gear);
    const accessTarget = clamp01(accessDeployment ?? desired.access);
    const m = motion.current;
    m.gear = approach(m.gear, gearTarget, 3.8, dt);
    m.access = approach(m.access, accessTarget, 4.6, dt);

    if (doorRef.current) {
      // The door is authored downward from its upper-track pivot.
      doorRef.current.position.y = 0.62 + m.access * 1.28;
    }
    if (rampRef.current) {
      // Local -Z is first turned outboard (+X), then lowered from vertical
      // against the hull to a shallow ground-reaching angle.
      rampRef.current.rotation.y = -Math.PI / 2;
      rampRef.current.rotation.z = (1 - m.access) * (Math.PI / 2) + m.access * -0.18;
    }
    if (portRef.current) {
      portRef.current.rotation.z = (1 - m.gear) * -1.20;
    }
    if (starboardRef.current) {
      starboardRef.current.rotation.z = (1 - m.gear) * 1.20;
    }
    if (noseRef.current) {
      noseRef.current.rotation.x = (1 - m.gear) * -1.08;
    }
  });

  const material = kitMaterial(
    'runabout-cockpit',
    'textures/ships/cockpit-trim.ktx2',
    {
      roughness: 0.58,
      metalness: 0.52,
      normalRma: 'textures/ships/cockpit-trim-normal-rma.ktx2',
    },
  );

  if (!door && !ramp && !gearPort && !gearStarboard && !gearNose) return null;

  return (
    <group position={position} rotation={rotation}>
      <group position={LANDED_SEAT} scale={LANDED_SCALE}>
        {door && (
          <mesh
            ref={doorRef}
            geometry={door}
            material={material}
            position={[1.92, 0.62, -0.60]}
          />
        )}
        {ramp && (
          <mesh
            ref={rampRef}
            geometry={ramp}
            material={material}
            position={[2.02, -1.00, -0.60]}
          />
        )}
        {gearPort && (
          <mesh
            ref={portRef}
            geometry={gearPort}
            material={material}
            position={[2.30, -0.46, 1.70]}
          />
        )}
        {gearStarboard && (
          <mesh
            ref={starboardRef}
            geometry={gearStarboard}
            material={material}
            position={[-2.30, -0.46, 1.70]}
          />
        )}
        {gearNose && (
          <mesh
            ref={noseRef}
            geometry={gearNose}
            material={material}
            position={[0, -0.40, -3.60]}
          />
        )}
      </group>
    </group>
  );
}
