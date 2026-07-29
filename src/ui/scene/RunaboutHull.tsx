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
 * It rides the camera and is deliberately TINY in world units — a few
 * centimetres of the scene's scale — which the flight near plane (0.02) now
 * permits. It also lags: the whole assembly leans against acceleration and
 * banks into turns, because a thing that answers to physics reads as a
 * physical object and a thing welded to the lens reads as a HUD decal.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three/webgpu';
import { useUiBus } from '../fx/uiBus';
import { flightLive } from './flightControl';
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
const LEAN = 0.006; // metres of sway per unit of acceleration
const LEAN_RESP = 7;
/** Collision edits velocity outright; without this that lands as a flinch. */
const ACCEL_CLAMP = 24;

const FWD = new Vector3();
const RIGHT = new Vector3();
const UP = new Vector3();
const PREV_VEL = new Vector3();
const ACCEL = new Vector3();

export function RunaboutHull() {
  const flight = useUiBus((b) => b.flightMode);
  const groundfall = useUiBus((b) => b.groundfall);
  const active = flight || groundfall !== null;
  const cockpitReady = useCockpitVisualReady();
  const root = useRef<Group>(null);
  const sway = useRef({ x: 0, y: 0, roll: 0 });
  /** True until the first frame at the helm has a previous velocity to use. */
  const fresh = useRef(true);

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

  useFrame(({ camera }, dt) => {
    const g = root.current;
    if (!g || !active) {
      fresh.current = true;
      return;
    }
    const f = flightLive;

    // Orbital and atmospheric flight share this one physical pilot station.
    // The surface scene owns its own chase flag and camera pose, so visibility
    // cannot be inferred from flightLive while a groundfall session is active.
    const onSurface = useUiBus.getState().groundfall !== null;
    g.visible = cockpitPhysicalVisible();
    if (!g.visible) {
      fresh.current = true;
      return;
    }

    // SurfaceScene already applied airframe roll, shake and the final camera
    // pose. Copy that pose without adding stale orbital acceleration sway.
    if (onSurface) {
      fresh.current = true;
      g.position.copy(camera.position);
      g.quaternion.copy(camera.quaternion);
      return;
    }

    // Acceleration in the ship's own frame, so the lean is always "backwards"
    // relative to the pilot rather than to the universe.
    //
    // Two things make this jump if taken literally: the first frame after
    // taking the helm (no previous velocity to difference against) and any
    // frame the collision governor edits velocity directly, which reads as an
    // impulse of thousands. Both used to arrive as a visible flinch.
    if (fresh.current) {
      fresh.current = false;
      PREV_VEL.copy(f.vel);
      sway.current.x = sway.current.y = sway.current.roll = 0;
    }
    ACCEL.copy(f.vel).sub(PREV_VEL).divideScalar(Math.max(dt, 1e-4));
    PREV_VEL.copy(f.vel);
    if (ACCEL.lengthSq() > ACCEL_CLAMP * ACCEL_CLAMP) ACCEL.setLength(ACCEL_CLAMP);
    camera.getWorldDirection(FWD);
    RIGHT.crossVectors(FWD, camera.up).normalize();
    UP.crossVectors(RIGHT, FWD).normalize();

    const k = 1 - Math.exp(-dt * LEAN_RESP);
    const targetX = -ACCEL.dot(RIGHT) * LEAN;
    const targetY = -ACCEL.dot(UP) * LEAN;
    const targetRoll = -f.yawRate * 0.16;
    sway.current.x += (targetX - sway.current.x) * k;
    sway.current.y += (targetY - sway.current.y) * k;
    sway.current.roll += (targetRoll - sway.current.roll) * k;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.translateX(Math.max(-0.012, Math.min(0.012, sway.current.x)));
    g.translateY(Math.max(-0.012, Math.min(0.012, sway.current.y)));
    g.rotateZ(sway.current.roll);
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
