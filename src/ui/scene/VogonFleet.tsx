import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Sprite, SpriteMaterial } from 'three/webgpu';
import { actions, useGame } from '../../state/store';
import { useUiBus } from '../fx/uiBus';
import { mulberry } from '../../engine/rng';
import { SCENE_SPRITES } from '../assets';
import { sceneTex } from './spriteTextures';

function Slab({
  id,
  seed,
  hit,
  flagship,
}: {
  id: number;
  seed: number;
  hit: boolean;
  flagship: boolean;
}) {
  const ref = useRef<Sprite>(null);
  const mat = useMemo(
    () =>
      new SpriteMaterial({
        map: sceneTex(flagship ? SCENE_SPRITES.vogon.constructor : SCENE_SPRITES.vogon.escort),
        transparent: true,
        depthWrite: false,
      }),
    [flagship],
  );
  const pos = useRef(
    (() => {
      const r = mulberry(seed);
      return {
        x: -1.1 + r() * 3.4,
        y: 0.55 + r() * 1.25,
        z: 1.2 + r() * 1.4,
        lean: (r() - 0.5) * 0.14,
        fall: 0,
      };
    })(),
  );
  const scale = flagship ? 0.95 : 0.56;

  useFrame((_state, dt) => {
    const p = pos.current;
    if (hit) {
      // Destroyed ships drop straight down, without dignity.
      p.fall += dt * 6;
      mat.rotation = p.lean + p.fall * 0.55;
      mat.opacity = Math.max(0, 1 - p.fall / 2.4);
    } else {
      // Otherwise: they hang. They do not float, bob, or ease. That is the joke.
      mat.rotation = p.lean;
    }
    ref.current?.position.set(p.x, p.y - (hit ? p.fall * p.fall : 0), p.z);
    if (ref.current) ref.current.visible = !hit || p.fall < 2.2;
  });

  const onHit = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (hit) return;
    actions.hitVogonShip(id);
    useUiBus.getState().addFloat(e.nativeEvent.clientX, e.nativeEvent.clientY - 10, 'repelled!');
  };

  return (
    <sprite ref={ref} scale={[scale, scale, 1]} onPointerDown={onHit}>
      <primitive object={mat} attach="material" />
    </sprite>
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
      {vogon.ships.map((sh, i) => (
        <Slab key={sh.id} id={sh.id} seed={sh.seed} hit={sh.hit} flagship={i === 0} />
      ))}
    </group>
  );
}
