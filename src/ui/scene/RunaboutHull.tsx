/**
 * The bit of the ship you can see out of the window.
 *
 * Until now the helm was a disembodied camera: nothing in the frame had a
 * known size, so the eye had nothing to measure a planet against and settled
 * on the only interpretation available — that the viewer is roughly as big
 * as the thing filling the glass. A nose in the near field fixes that for
 * free, the same way it does in every cockpit ever built: you are not judging
 * the planet against nothing, you are judging it against your own hull.
 *
 * It rides the final camera pose and is deliberately TINY in world units — a
 * few centimetres of the scene's scale — which the flight near plane (0.02)
 * permits. The pressure tub stays rigidly camera-relative; only its controls
 * articulate, so thrust can never pull the pilot viewpoint out of the ship.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three/webgpu';
import { useUiBus } from '../fx/uiBus';
import { kitGeometryFit, upliftActive } from './uplift/upliftAssets';
import { RUNABOUT_KIT, shipMaterial, useKitGeometry } from './uplift/shipKit';
import { RunaboutCockpit } from './RunaboutCockpit';
import {
  cockpitPhysicalVisible,
  useCockpitVisualReady,
} from './cockpitVisualState';

/**
 * Where the nose sits relative to the eye. Z must clear the flight near
 * plane (0.02); Y is tuned so the spine enters the bottom of a 42° frame at
 * roughly four fifths of the way down — present, not obstructive.
 */
const NOSE_Z = -0.085;
const NOSE_Y = -0.03;

export function RunaboutHull() {
  const flight = useUiBus((b) => b.flightMode);
  const groundfall = useUiBus((b) => b.groundfall);
  const active = flight || groundfall !== null;
  const cockpitReady = useCockpitVisualReady();
  const root = useRef<Group>(null);

  // The kit's faceted prow (3.1) in the main nose box's exact bounds — the
  // bounds ARE the point here (see below), so the fit preserves them. Mounts
  // with the app, so it upgrades once when the kit lands.
  const kitNose = useKitGeometry(RUNABOUT_KIT, () =>
    upliftActive()
      ? kitGeometryFit(RUNABOUT_KIT, 'hull-nose', {
          mode: 'box',
          min: [-0.029, -0.01, -0.065],
          max: [0.029, 0.01, 0.065],
          rotateY: Math.PI,
        })
      : null,
  );

  useFrame(({ camera }) => {
    const g = root.current;
    if (!g || !active) return;

    g.visible = cockpitPhysicalVisible();
    if (!g.visible) return;

    // The pressure tub is a rigid part of the ship. Follow the final camera
    // pose exactly; control motion belongs to the stick/throttle, never to the
    // entire cockpit. Positional or rotational lag reads as the camera tearing
    // free of the hull as soon as thrust is applied.
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
  });

  if (!flight && groundfall === null) return null;

  return (
    <group ref={root}>
      {/* The physical interior upgrades independently from the prow. Its
          component owns the raster-plate readiness handshake with FlightHUD,
          so a low-quality tier or failed GLB retains the old cockpit. */}
      <RunaboutCockpit />

      <group visible={!cockpitReady}>
      {/* Boxes, not cones: exact bounds are the whole point here. The top
          face lands about two thirds of the way down a 42° frame, so you see
          the spine of your own nose and nothing else. The kit prow keeps the
          same bounds — panel lines where the flat lid was. */}
      {kitNose ? (
        <mesh position={[0, NOSE_Y, NOSE_Z]} geometry={kitNose} material={shipMaterial()} />
      ) : (
        <mesh position={[0, NOSE_Y, NOSE_Z]}>
          <boxGeometry args={[0.058, 0.02, 0.13]} />
          <meshStandardMaterial
            color={0x1b2130}
            emissive={0x0f1420}
            emissiveIntensity={1}
            roughness={0.45}
            metalness={0.6}
            flatShading
          />
        </mesh>
      )}
      {/* A narrower section further out, so the nose reads as tapering. */}
      <mesh position={[0, NOSE_Y - 0.002, NOSE_Z - 0.085]}>
        <boxGeometry args={[0.03, 0.013, 0.06]} />
        <meshStandardMaterial
          color={0x171c29}
          emissive={0x0d1119}
          emissiveIntensity={1}
          roughness={0.5}
          metalness={0.6}
          flatShading
        />
      </mesh>
      {/* A lit strip along the spine, so the hull reads even in full dark. */}
      <mesh position={[0, NOSE_Y + 0.0102, NOSE_Z + 0.036]}>
        <boxGeometry args={[0.004, 0.0008, 0.045]} />
        <meshStandardMaterial color={0x3c4c63} emissive={0x18223a} emissiveIntensity={1.3} />
      </mesh>
      {/* Nav lights: red to port, green to starboard, as required. */}
      <mesh position={[-0.03, NOSE_Y + 0.011, NOSE_Z + 0.05]}>
        <sphereGeometry args={[0.0022, 6, 5]} />
        <meshStandardMaterial color={0xff4a4a} emissive={0xff2a2a} emissiveIntensity={4} />
      </mesh>
      <mesh position={[0.03, NOSE_Y + 0.011, NOSE_Z + 0.05]}>
        <sphereGeometry args={[0.0022, 6, 5]} />
        <meshStandardMaterial color={0x4affa0} emissive={0x2aff8a} emissiveIntensity={4} />
      </mesh>
    </group>
      </group>
  );
}
