import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Mesh, SpriteMaterial } from 'three/webgpu';
import { actions, useGame } from '../../state/store';
import { useUiBus } from '../fx/uiBus';
import { mulberry } from '../../engine/rng';
import type { BubbleKind } from '../../engine/types';
import { SCENE_SPRITES } from '../assets';
import { sceneTex } from './spriteTextures';

const KIND_STYLE: Record<BubbleKind, { color: number; emissive: number; scale: number }> = {
  normal: { color: 0x9ecfff, emissive: 0x3a6ea8, scale: 1 },
  golden: { color: 0xf5c84c, emissive: 0xb08a1a, scale: 1.15 },
  whale: { color: 0x7a9eff, emissive: 0x2a3a8a, scale: 1.5 },
  petunias: { color: 0xd88ab8, emissive: 0x8a3a6a, scale: 0.9 },
  gargle: { color: 0xaef29a, emissive: 0x3a8a2a, scale: 1.05 },
};

/** Rare bubbles carry their contents (SPRITE_MANIFEST.md §D). */
const CORE_ART: Partial<Record<BubbleKind, string>> = {
  whale: SCENE_SPRITES.bubble.whale,
  petunias: SCENE_SPRITES.bubble.petunias,
  gargle: SCENE_SPRITES.bubble.gargle,
  golden: SCENE_SPRITES.bubble.golden,
};

function BubbleMesh({ id, kind, seed }: { id: number; kind: BubbleKind; seed: number }) {
  const ref = useRef<Mesh>(null);
  const path = useRef(
    (() => {
      const r = mulberry(seed);
      return {
        radius: 1.9 + r() * 0.9,
        angle: r() * Math.PI * 2,
        speed: (0.05 + r() * 0.06) * (r() < 0.5 ? -1 : 1),
        y0: (r() - 0.45) * 1.4,
        bob: 0.2 + r() * 0.3,
        bobSpeed: 0.6 + r(),
      };
    })(),
  );

  const coreMat = useMemo(() => {
    const url = CORE_ART[kind];
    return url
      ? new SpriteMaterial({ map: sceneTex(url), transparent: true, depthWrite: false })
      : null;
  }, [kind]);

  useFrame((state) => {
    const p = path.current;
    const t = state.clock.elapsedTime;
    const a = p.angle + t * p.speed;
    ref.current?.position.set(
      Math.cos(a) * p.radius + 0.55,
      p.y0 + Math.sin(t * p.bobSpeed) * p.bob,
      Math.sin(a) * p.radius * 0.5 + 1.4,
    );
    const wobble = 1 + Math.sin(t * 2.2 + seed) * 0.04;
    ref.current?.scale.setScalar(KIND_STYLE[kind].scale * wobble * 0.22);
    // The contents drift lazily; the bubble does the traveling.
    if (coreMat) coreMat.rotation = Math.sin(t * 1.1 + seed) * 0.2;
  });

  const onCatch = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    actions.catchBubble(id);
    useUiBus.getState().addFloat(e.nativeEvent.clientX, e.nativeEvent.clientY - 10, 'improbable!');
  };

  const style = KIND_STYLE[kind];
  return (
    <mesh ref={ref} onPointerDown={onCatch}>
      <icosahedronGeometry args={[1, 3]} />
      <meshStandardMaterial
        color={style.color}
        emissive={style.emissive}
        emissiveIntensity={0.9}
        transparent
        opacity={0.42}
        roughness={0.1}
        metalness={0.1}
        depthWrite={false}
      />
      {coreMat && (
        <sprite scale={[1.2, 1.2, 1]} raycast={() => null}>
          <primitive object={coreMat} attach="material" />
        </sprite>
      )}
    </mesh>
  );
}

/** Improbability Bubbles: catchable concentrated luck, drifting on seeded splines. */
export function Bubbles() {
  const rev = useGame((g) => g.rev);
  void rev;
  const bubbles = useGame.getState().s.bubbles;
  return (
    <group>
      {bubbles.map((b) => (
        <BubbleMesh key={b.id} id={b.id} kind={b.kind} seed={b.seed} />
      ))}
    </group>
  );
}
