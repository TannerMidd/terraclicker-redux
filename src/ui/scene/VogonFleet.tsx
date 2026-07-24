import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Group } from 'three/webgpu';
import { actions, useGame } from '../../state/store';
import { useUiBus } from '../fx/uiBus';
import { mulberry } from '../../engine/rng';

function Slab({ id, seed, hit }: { id: number; seed: number; hit: boolean }) {
  const ref = useRef<Group>(null);
  const pos = useRef(
    (() => {
      const r = mulberry(seed);
      return {
        x: -1.1 + r() * 3.4,
        y: 0.55 + r() * 1.25,
        z: 1.2 + r() * 1.4,
        yaw: (r() - 0.5) * 0.5,
        fall: 0,
      };
    })(),
  );

  useFrame((_state, dt) => {
    const p = pos.current;
    if (hit) {
      // Destroyed ships drop straight down, without dignity.
      p.fall += dt * 6;
    }
    // Otherwise: they hang. They do not float, bob, or ease. That is the joke.
    ref.current?.position.set(p.x, p.y - (hit ? p.fall * p.fall : 0), p.z);
    ref.current?.rotation.set(hit ? p.fall * 0.8 : 0, p.yaw, hit ? p.fall * 0.5 : 0);
    if (ref.current) ref.current.visible = !hit || p.fall < 2.2;
  });

  const onHit = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (hit) return;
    actions.hitVogonShip(id);
    useUiBus.getState().addFloat(e.nativeEvent.clientX, e.nativeEvent.clientY - 10, 'repelled!');
  };

  return (
    <group ref={ref} onPointerDown={onHit}>
      <mesh>
        <boxGeometry args={[0.52, 0.2, 0.34]} />
        <meshStandardMaterial color={0x8a8f5a} roughness={0.85} metalness={0.25} />
      </mesh>
      <mesh position={[0.1, 0.14, 0]}>
        <boxGeometry args={[0.2, 0.1, 0.2]} />
        <meshStandardMaterial color={0x707548} roughness={0.9} metalness={0.2} />
      </mesh>
      <mesh position={[-0.2, -0.08, 0.1]}>
        <boxGeometry args={[0.14, 0.08, 0.1]} />
        <meshStandardMaterial color={0x9a9f68} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Vogon Constructor Fleet: hangs in the sky in much the same way that bricks don't. */
export function VogonFleet() {
  const rev = useGame((g) => g.rev);
  void rev;
  const vogon = useGame.getState().s.vogon;
  if (!vogon) return null;
  return (
    <group>
      {vogon.ships.map((sh) => (
        <Slab key={sh.id} id={sh.id} seed={sh.seed} hit={sh.hit} />
      ))}
    </group>
  );
}
