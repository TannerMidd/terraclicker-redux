/**
 * The authored first-person runabout interior.
 *
 * Static furniture is merged into a handful of shared-material meshes. Every
 * control that moves remains a separate named GLB root, so the frame loop can
 * articulate rigid parts without a rig or a new material per object. The DOM
 * console still owns live text and interaction; this component supplies the
 * physical depth, parallax and reflected light around it.
 */
import { useEffect, useRef } from 'react';
import type { Mesh } from 'three/webgpu';
import {
  AdditiveBlending,
  DoubleSide,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import { mix, vec3, vertexColor } from 'three/tsl';
import { useFrame } from '@react-three/fiber';
import { useUiBus } from '../fx/uiBus';
import { flightInput, flightLive } from './flightControl';
import { surfaceInput, surfaceLive } from './surface/surfaceControl';
import {
  cockpitDisplayMaterials,
  updateCockpitDisplays,
} from './cockpitDisplays';
import {
  cockpitPhysicalVisible,
  setCockpitVisualReady,
} from './cockpitVisualState';
import {
  kitGeometryRotated,
  kitMaterial,
  upliftNode,
} from './uplift/upliftAssets';
import { useKitGeometry } from './uplift/shipKit';

export const RUNABOUT_COCKPIT_KIT = 'meshes/ships/runabout-cockpit.glb';

let glassMat: MeshBasicNodeMaterial | null = null;
let glowMat: MeshBasicNodeMaterial | null = null;
let trimMat: ReturnType<typeof kitMaterial> | null = null;

function cockpitGlassMaterial(): MeshBasicNodeMaterial {
  if (glassMat) return glassMat;
  const m = new MeshBasicNodeMaterial();
  const glass = upliftNode('textures/ships/cockpit-glass.ktx2', undefined, {
    repeat: true,
    placeholder: 'clear',
  });
  m.colorNode = vertexColor().mul(vec3(0.68, 0.92, 1.15)).mul(mix(vec3(1), glass.rgb.mul(1.4), 0.24));
  m.transparent = true;
  m.opacityNode = glass.a.mul(0.09).add(0.025);
  m.depthWrite = false;
  m.side = DoubleSide;
  m.blending = AdditiveBlending;
  m.toneMapped = false;
  glassMat = m;
  return m;
}

function cockpitGlowMaterial(): MeshBasicNodeMaterial {
  if (glowMat) return glowMat;
  const m = new MeshBasicNodeMaterial();
  // Instrument lamps use their authored vertex colours directly. Sampling
  // the old atlas across auto-unwrapped boxes produced the giant meaningless
  // glyphs that made the dashboard read like a flat placeholder image.
  m.colorNode = vertexColor().mul(1.65);
  m.transparent = true;
  m.opacity = 0.86;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  m.toneMapped = false;
  glowMat = m;
  return m;
}

function cockpitTrimMaterial(): ReturnType<typeof kitMaterial> {
  if (trimMat) return trimMat;
  const m = kitMaterial(
    'runabout-cockpit-interior',
    'textures/ships/cockpit-trim.ktx2',
    {
      roughness: 0.58,
      metalness: 0.52,
      normalRma: 'textures/ships/cockpit-trim-normal-rma.ktx2',
    },
  );
  // Subtle self-light keeps the pressure tub readable in black space and
  // storms without changing the scene's active light set on camera swaps.
  m.emissiveNode = vertexColor().mul(0.075) as unknown as typeof m.emissiveNode;
  trimMat = m;
  return m;
}

/**
 * Cockpit geometry is authored using the vehicle convention: Blender -Y is
 * forward, which exports as +Z. Rotate the clone once so it faces the scene's
 * camera-forward -Z. Cloning leaves the shared kit cache immutable.
 */
function useCockpitPart(name: string) {
  return useKitGeometry(RUNABOUT_COCKPIT_KIT, () => {
    return kitGeometryRotated(RUNABOUT_COCKPIT_KIT, name, Math.PI);

  });
}

function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt * rate));
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function RunaboutCockpit() {
  const shell = useCockpitPart('cockpit-shell');
  const frame = useCockpitPart('canopy-frame');
  const glass = useCockpitPart('canopy-glass');
  const dashboard = useCockpitPart('dashboard');
  const lights = useCockpitPart('cockpit-lights');
  const displayPrimary = useCockpitPart('display-primary');
  const displayNav = useCockpitPart('display-nav');
  const displaySystems = useCockpitPart('display-systems');
  const stick = useCockpitPart('flight-stick');
  const throttle = useCockpitPart('throttle-lever');
  const brake = useCockpitPart('brake-lever');
  const trim = useCockpitPart('trim-wheel');
  const rocker = useCockpitPart('autopilot-rocker');
  const pedalPort = useCockpitPart('pedal-port');
  const pedalStarboard = useCockpitPart('pedal-starboard');

  const stickRef = useRef<Mesh>(null);
  const throttleRef = useRef<Mesh>(null);
  const brakeRef = useRef<Mesh>(null);
  const trimRef = useRef<Mesh>(null);
  const rockerRef = useRef<Mesh>(null);
  const pedalPortRef = useRef<Mesh>(null);
  const pedalStarboardRef = useRef<Mesh>(null);
  const displaysWereVisible = useRef(false);
  const motion = useRef({
    steerX: 0,
    steerY: 0,
    throttle: 0,
    brake: 0,
    trim: 0,
    autopilot: 0,
  });

  // The shell and dashboard are the minimum believable upgrade. Keeping the
  // old plates until both exist also covers a corrupt-but-partially-loadable
  // GLB rather than exposing an empty lower frame.
  useEffect(() => {
    const ready = shell !== null
      && frame !== null
      && dashboard !== null
      && displayPrimary !== null
      && displayNav !== null
      && displaySystems !== null;
    setCockpitVisualReady(ready);
    return () => setCockpitVisualReady(false);
  }, [dashboard, displayNav, displayPrimary, displaySystems, frame, shell]);

  useFrame((state, dt) => {
    const visible = cockpitPhysicalVisible();
    if (!visible) {
      displaysWereVisible.current = false;
      return;
    }
    updateCockpitDisplays(state.clock.elapsedTime, !displaysWereVisible.current);
    displaysWereVisible.current = true;
    const f = flightLive;
    const m = motion.current;
    const surfaceFlight = useUiBus.getState().groundfall !== null
      && surfaceLive.phase === 'fly';
    const surfaceSteerY = surfaceInput.rise ? -0.65 : surfaceInput.descend ? 0.65 : 0;
    const steerX = surfaceFlight
      ? clampUnit(surfaceInput.strafe)
      : clampUnit(flightInput.steerX + f.yawRate * 0.9);
    const steerY = surfaceFlight
      ? surfaceSteerY
      : clampUnit(flightInput.steerY + f.pitchRate * 0.9);
    const thrust = surfaceFlight
      ? Math.max(Math.abs(surfaceInput.fwd), Math.abs(surfaceInput.strafe) * 0.45, surfaceInput.run ? 1 : 0)
      : Math.max(flightInput.thrust, flightInput.cruise, f.boostBlend * 0.92);
    const brakeInput = surfaceFlight
      ? (surfaceInput.descend ? 1 : 0)
      : Math.max(flightInput.brake, f.station ? 0.55 : 0);
    const trimInput = surfaceFlight
      ? surfaceLive.roll * 2.4
      : f.yawRate * 0.45 + f.pitchRate * 0.25;
    const autopilot = surfaceFlight ? 0 : f.autopilotPhase !== 'off' ? 1 : 0;
    const glowBoost = surfaceFlight ? (surfaceInput.run ? 1 : 0) : f.boostBlend;

    m.steerX = approach(m.steerX, steerX, 12, dt);
    m.steerY = approach(m.steerY, steerY, 12, dt);
    m.throttle = approach(m.throttle, thrust, 7, dt);
    m.brake = approach(m.brake, brakeInput, 11, dt);
    m.trim = approach(m.trim, trimInput, 5, dt);
    m.autopilot = approach(m.autopilot, autopilot, 14, dt);

    if (stickRef.current) {
      stickRef.current.rotation.x = m.steerY * 0.18;
      stickRef.current.rotation.z = -m.steerX * 0.22;
    }
    if (throttleRef.current) {
      throttleRef.current.rotation.x = -0.20 + m.throttle * 0.56;
    }
    if (brakeRef.current) {
      brakeRef.current.rotation.x = -m.brake * 0.46;
    }
    if (trimRef.current) {
      trimRef.current.rotation.x += m.trim * dt * 4.2;
    }
    if (rockerRef.current) {
      rockerRef.current.rotation.x = (m.autopilot - 0.5) * 0.34;
    }
    if (pedalPortRef.current) {
      pedalPortRef.current.rotation.x = -m.steerX * 0.14;
    }
    if (pedalStarboardRef.current) {
      pedalStarboardRef.current.rotation.x = m.steerX * 0.14;
    }
    // Boost raises the reflected instrument light without flashing the actual
    // DOM readouts. This singleton is used by one cockpit mesh.
    cockpitGlowMaterial().opacity = 0.80 + glowBoost * 0.18;
  });

  const trimMaterial = cockpitTrimMaterial();
  const glowMaterial = cockpitGlowMaterial();
  const displayMaterials = cockpitDisplayMaterials();

  return (
    <>

      {shell && (
        <mesh
          geometry={shell}
          material={trimMaterial}
          position={[0, -0.105, 0]}
          frustumCulled={false}
          renderOrder={12}
        />
      )}
      {frame && (
        <mesh geometry={frame} material={trimMaterial} frustumCulled={false} renderOrder={13} />
      )}
      {dashboard && (
        <mesh
          geometry={dashboard}
          material={trimMaterial}
          position={[0, -0.065, 0]}
          frustumCulled={false}
          renderOrder={14}
        />
      )}
      {displayPrimary && (
        <mesh
          geometry={displayPrimary}
          material={displayMaterials.primaryFlight}
          position={[0, -0.065, 0]}
          frustumCulled={false}
          renderOrder={17}
        />
      )}
      {displayNav && (
        <mesh
          geometry={displayNav}
          material={displayMaterials.navigation}
          position={[0, -0.065, 0]}
          frustumCulled={false}
          renderOrder={17}
        />
      )}
      {displaySystems && (
        <mesh
          geometry={displaySystems}
          material={displayMaterials.systems}
          position={[0, -0.065, 0]}
          frustumCulled={false}
          renderOrder={17}
        />
      )}
      {glass && (
        <mesh
          geometry={glass}
          material={cockpitGlassMaterial()}
          frustumCulled={false}
          renderOrder={15}
        />
      )}
      {lights && (
        <mesh
          geometry={lights}
          material={glowMaterial}
          position={[0, -0.065, 0]}
          frustumCulled={false}
          renderOrder={16}
        />
      )}
      {stick && (
        <mesh
          ref={stickRef}
          geometry={stick}
          material={trimMaterial}
          position={[0.285, -0.315, -0.300]}
          scale={0.52}
          frustumCulled={false}
          renderOrder={15}
        />
      )}
      {throttle && (
        <mesh
          ref={throttleRef}
          geometry={throttle}
          material={trimMaterial}
          position={[-0.305, -0.225, -0.315]}
          scale={0.56}
          frustumCulled={false}
          renderOrder={15}
        />
      )}
      {brake && (
        <mesh
          ref={brakeRef}
          geometry={brake}
          material={trimMaterial}
          position={[-0.250, -0.235, -0.322]}
          scale={0.54}
          frustumCulled={false}
          renderOrder={15}
        />
      )}
      {trim && (
        <mesh
          ref={trimRef}
          geometry={trim}
          material={trimMaterial}
          position={[0.300, -0.210, -0.340]}
          scale={0.62}
          frustumCulled={false}
          renderOrder={15}
        />
      )}
      {rocker && (
        <mesh
          ref={rockerRef}
          geometry={rocker}
          material={trimMaterial}
          position={[0.245, -0.130, -0.450]}
          scale={0.86}
          frustumCulled={false}
          renderOrder={15}
        />
      )}
      {pedalPort && (
        <mesh
          ref={pedalPortRef}
          geometry={pedalPort}
          material={trimMaterial}
          position={[-0.125, -0.370, -0.475]}
          frustumCulled={false}
          renderOrder={13}
        />
      )}
      {pedalStarboard && (
        <mesh
          ref={pedalStarboardRef}
          geometry={pedalStarboard}
          material={trimMaterial}
          position={[0.125, -0.370, -0.475]}
          frustumCulled={false}
          renderOrder={13}
        />
      )}
    </>
  );
}
