import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { useGame } from '../../state/store';
import { mulberry } from '../../engine/rng';

const MAX_INSTANCES = 72;
const M = new Matrix4();
const Q = new Quaternion();
const S = new Vector3(1, 1, 1);
const P = new Vector3();

/**
 * Diegetic purchases (ART_DIRECTION.md §5): your installations orbit the
 * planet as tiny glinting satellites — log-scaled so early buys are huge
 * news and the thousandth is a skyline.
 */
export function Infrastructure() {
  const total = useGame((g) => {
    let n = 0;
    for (const v of Object.values(g.s.buildings)) n += v;
    return n;
  });
  const seed = useGame((g) => g.s.seed);

  const count = Math.min(MAX_INSTANCES, Math.ceil(10 * Math.log10(total + 1)));

  const orbits = useMemo(() => {
    const r = mulberry(seed ^ 0x0b17);
    return Array.from({ length: MAX_INSTANCES }, () => ({
      radius: 1.32 + r() * 0.85,
      speed: (0.12 + r() * 0.5) * (r() < 0.3 ? -1 : 1),
      phase: r() * Math.PI * 2,
      incl: (r() - 0.5) * 1.9,
      size: 0.011 + r() * 0.016,
    }));
  }, [seed]);

  const mesh = useRef<InstancedMesh>(null);

  useFrame((state) => {
    const im = mesh.current;
    if (!im) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const o = orbits[i]!;
      const a = o.phase + t * o.speed;
      P.set(
        Math.cos(a) * o.radius,
        Math.sin(a) * Math.sin(o.incl) * o.radius,
        Math.sin(a) * Math.cos(o.incl) * o.radius,
      );
      S.setScalar(o.size / 0.014);
      M.compose(P, Q, S);
      im.setMatrixAt(i, M);
    }
    im.count = count;
    im.instanceMatrix.needsUpdate = true;
  });

  if (total <= 0) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_INSTANCES]} raycast={() => null}>
      <boxGeometry args={[0.014, 0.014, 0.028]} />
      <meshStandardMaterial color={0xcdd6e8} emissive={0x88aacc} emissiveIntensity={0.35} roughness={0.4} metalness={0.8} />
    </instancedMesh>
  );
}
