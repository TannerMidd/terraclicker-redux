import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Euler, Group } from 'three/webgpu';
import { useUiBus } from '../fx/uiBus';
import { flightLive } from './flightControl';

/**
 * The complete company runabout, visible only from the chase camera.
 *
 * It is intentionally native geometry instead of a camera-facing sprite: the
 * silhouette, engine spacing, bank and lighting stay honest from every pitch
 * and turn. The model is small in world units because the flight universe is
 * also the collision space; the chase lens provides the scale.
 */
const EUL = new Euler(0, 0, 0, 'YXZ');
const MODEL_SCALE = 0.2;

export function RunaboutExterior() {
  const flight = useUiBus((bus) => bus.flightMode);
  const root = useRef<Group>(null);
  const plumes = useRef<Group>(null);
  const pulse = useRef(1);

  useFrame(({ clock }, dt) => {
    const ship = root.current;
    if (!ship) return;
    const visible = Boolean(flight && flightLive.cameraMode === 'chase');
    ship.visible = visible;
    if (!visible) return;

    ship.position.copy(flightLive.pos);
    EUL.set(flightLive.pitch, flightLive.yaw, flightLive.roll);
    ship.quaternion.setFromEuler(EUL);

    const drive = 1 + flightLive.boostBlend * 0.55;
    const shimmer = 1 + Math.sin(clock.elapsedTime * (11 + flightLive.speed * 0.08)) * 0.055;
    const target = drive * shimmer;
    pulse.current += (target - pulse.current) * Math.min(1, dt * 12);
    plumes.current?.scale.set(1, 1, pulse.current);
  });

  return (
    <group ref={root} name="runabout-exterior" visible={false} scale={MODEL_SCALE}>
      {/* Low, swept wings give the little utility ship a readable silhouette. */}
      <mesh position={[-0.4, -0.015, 0.1]} rotation={[0, -0.24, -0.025]}>
        <boxGeometry args={[0.62, 0.045, 0.3]} />
        <meshStandardMaterial color={0x34425b} emissive={0x0b1524} emissiveIntensity={0.65} roughness={0.42} metalness={0.68} />
      </mesh>
      <mesh position={[0.4, -0.015, 0.1]} rotation={[0, 0.24, 0.025]}>
        <boxGeometry args={[0.62, 0.045, 0.3]} />
        <meshStandardMaterial color={0x34425b} emissive={0x0b1524} emissiveIntensity={0.65} roughness={0.42} metalness={0.68} />
      </mesh>

      {/* Faceted central pressure hull and forward equipment prow. */}
      <mesh position={[0, 0.035, -0.08]} scale={[0.3, 0.18, 0.72]}>
        <sphereGeometry args={[1, 14, 7]} />
        <meshStandardMaterial
          color={0x313a4d}
          emissive={0x0b1019}
          emissiveIntensity={0.7}
          roughness={0.34}
          metalness={0.72}
          flatShading
        />
      </mesh>
      <mesh position={[0, 0.01, -0.61]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.205, 0.48, 8]} />
        <meshStandardMaterial color={0x252d3f} roughness={0.38} metalness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 0.17, -0.26]} scale={[0.19, 0.105, 0.29]}>
        <sphereGeometry args={[1, 14, 6]} />
        <meshStandardMaterial
          color={0x2a6673}
          emissive={0x123744}
          emissiveIntensity={1.15}
          roughness={0.12}
          metalness={0.28}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Twin drive nacelles make the rear view unmistakably a ship. */}
      {[-0.34, 0.34].map((x) => (
        <group key={x} position={[x, -0.045, 0.28]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.115, 0.62, 10]} />
            <meshStandardMaterial color={0x26344b} emissive={0x091525} emissiveIntensity={0.7} roughness={0.3} metalness={0.82} flatShading />
          </mesh>
          <mesh position={[0, 0, 0.325]}>
            <torusGeometry args={[0.105, 0.022, 6, 14]} />
            <meshStandardMaterial color={0x6f7f96} roughness={0.26} metalness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Dorsal spine, practical armour and a warm company-service stripe. */}
      <mesh position={[0, 0.185, 0.13]}>
        <boxGeometry args={[0.055, 0.055, 0.62]} />
        <meshStandardMaterial color={0x748198} roughness={0.32} metalness={0.72} />
      </mesh>
      <mesh position={[0, 0.218, 0.18]}>
        <boxGeometry args={[0.018, 0.012, 0.44]} />
        <meshStandardMaterial color={0xc28a49} emissive={0x3b210d} emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[-0.69, 0.045, 0.29]}>
        <boxGeometry args={[0.12, 0.13, 0.48]} />
        <meshStandardMaterial color={0x20293a} roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0.69, 0.045, 0.29]}>
        <boxGeometry args={[0.12, 0.13, 0.48]} />
        <meshStandardMaterial color={0x20293a} roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Port/starboard navigation lamps and an amber dorsal service beacon. */}
      <mesh position={[-0.76, 0.09, 0.18]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshBasicMaterial color={0xff4f58} toneMapped={false} />
      </mesh>
      <mesh position={[0.76, 0.09, 0.18]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshBasicMaterial color={0x4fffa6} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.255, 0.36]}>
        <sphereGeometry args={[0.027, 8, 6]} />
        <meshBasicMaterial color={0xffbb65} toneMapped={false} />
      </mesh>

      <group position={[0, -0.045, 0.625]}>
        {[-0.34, 0.34].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <circleGeometry args={[0.092, 16]} />
            <meshBasicMaterial color={0x7fe8ff} toneMapped={false} />
          </mesh>
        ))}
        <group ref={plumes}>
          {[-0.34, 0.34].map((x) => (
            <mesh key={x} position={[x, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.09, 0.34, 12, 1, true]} />
              <meshBasicMaterial
                color={0x5acfea}
                transparent
                opacity={0.3}
                blending={AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
