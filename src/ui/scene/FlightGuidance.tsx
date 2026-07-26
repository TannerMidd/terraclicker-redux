import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three/webgpu';
import { useUiBus } from '../fx/uiBus';
import { flightLive, flightNavTarget } from './flightControl';

const TARGET = new Vector3();

/**
 * A billboard at the active route's actual world position. The bearing ribbon
 * gets the pilot facing the right way; this beacon answers the next question:
 * which light in that direction is mine?
 */
export function FlightGuidance() {
  const flight = useUiBus((bus) => bus.flightMode);
  const group = useRef<Group>(null);
  const outer = useRef<Mesh>(null);
  const outerMat = useRef<MeshBasicMaterial>(null);
  const innerMat = useRef<MeshBasicMaterial>(null);

  useFrame(({ camera, clock }) => {
    const root = group.current;
    if (!root) return;
    const visible = flight && flightNavTarget(TARGET);
    root.visible = visible;
    if (!visible) return;

    root.position.copy(TARGET);
    root.quaternion.copy(camera.quaternion);
    const distance = camera.position.distanceTo(TARGET);
    // Roughly constant screen size from a moon's orbit to a galaxy crossing,
    // with sane limits close to the hull and at the edge of the universe.
    const scale = Math.max(0.72, Math.min(22, distance * 0.023));
    root.scale.setScalar(scale);

    const phase = clock.elapsedTime;
    if (outer.current) outer.current.rotation.z = phase * 0.42;
    if (outerMat.current) {
      outerMat.current.opacity = 0.38 + Math.sin(phase * 3.1) * 0.12;
      outerMat.current.color.setHex(flightLive.courseHold ? 0x7fd1c8 : 0xaec7ff);
    }
    if (innerMat.current) {
      innerMat.current.opacity = flightLive.courseHold ? 0.82 : 0.58;
      innerMat.current.color.setHex(flightLive.courseHold ? 0x7fd1c8 : 0xaec7ff);
    }
  });

  return (
    <group ref={group} visible={false} renderOrder={120}>
      <mesh ref={outer} raycast={() => null}>
        <ringGeometry args={[0.76, 0.83, 48]} />
        <meshBasicMaterial
          ref={outerMat}
          transparent
          opacity={0.5}
          depthTest={false}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh raycast={() => null}>
        <ringGeometry args={[0.27, 0.32, 40]} />
        <meshBasicMaterial
          ref={innerMat}
          transparent
          opacity={0.62}
          depthTest={false}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {([0, 1, 2, 3] as const).map((side) => (
        <mesh
          key={side}
          position={[Math.cos(side * Math.PI / 2) * 0.58, Math.sin(side * Math.PI / 2) * 0.58, 0]}
          rotation={[0, 0, side * Math.PI / 2]}
          raycast={() => null}
        >
          <planeGeometry args={[0.2, 0.035]} />
          <meshBasicMaterial
            color={0xaec7ff}
            transparent
            opacity={0.7}
            depthTest={false}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}
