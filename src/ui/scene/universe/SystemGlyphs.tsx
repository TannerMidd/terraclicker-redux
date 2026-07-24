import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  RingGeometry,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import { useUiBus } from '../../fx/uiBus';
import type { CompletedPlanetRecord } from '../../../engine/types';
import { starClass, starColor, systemGlyphPosition } from '../universeLayout';
import { C } from '../../../content/constants';
import { inspectHandlers, makeGlowSprite } from './shared';

const RING_GEO = new RingGeometry(0.55, 0.585, 48);
const RING_MAT = new MeshBasicMaterial({
  color: 0x8ca0c8,
  transparent: true,
  opacity: 0.28,
  side: DoubleSide,
});

/** A formed system receded into the constellation: star + tilted ring + world-dots. */
function SystemGlyph({
  index,
  records,
  settleDelay,
}: {
  index: number;
  records: CompletedPlanetRecord[];
  settleDelay: number;
}) {
  const seed = records[0]?.seed ?? index + 1;
  const pos = useMemo(() => systemGlyphPosition(index, useGame.getState().s.seed), [index]);
  const color = useMemo(() => starColor(seed), [seed]);
  const glow = useMemo(() => makeGlowSprite(color.getHex(), 0.55), [color]);
  const dots = useMemo(() => {
    const geo = new BufferGeometry();
    const arr = new Float32Array(records.length * 3);
    records.forEach((r, i) => {
      const a = (r.seed % 628) / 100 + i * 1.256;
      const rad = 0.3 + (i / records.length) * 0.5;
      arr[i * 3] = Math.cos(a) * rad;
      arr[i * 3 + 1] = ((r.seed % 17) / 17 - 0.5) * 0.1;
      arr[i * 3 + 2] = Math.sin(a) * rad;
    });
    geo.setAttribute('position', new BufferAttribute(arr, 3));
    return geo;
  }, [records]);

  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const born = useRef<number | null>(null);

  useFrame((state, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.1;
    const g = root.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;
    // Settle in: constellation glyphs pop softly, staggered, on first sight.
    const k = Math.min(1, Math.max(0, (t - born.current - settleDelay) / 0.55));
    g.scale.setScalar(k === 1 ? 1 : 0.001 + (1 - Math.pow(1 - k, 3)) * 0.999);
  });

  const worlds = records
    .map((r) => r.name)
    .slice(0, 3)
    .join(', ');
  return (
    <group ref={root} position={pos} rotation={[0.5, 0, 0.12]}>
      <mesh
        {...inspectHandlers(
          `System ${index + 1}`,
          `${starClass(seed)} · ${records.length} worlds — ${worlds}${records.length > 3 ? '…' : ''}`,
        )}
      >
        <icosahedronGeometry args={[0.16, 1]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <sprite scale={[0.9, 0.9, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
      <group ref={spin}>
        <mesh geometry={RING_GEO} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <primitive object={RING_MAT} attach="material" />
        </mesh>
        <points geometry={dots} raycast={() => null}>
          <pointsMaterial size={1.6} sizeAttenuation={false} color={0xbfe8d4} transparent opacity={0.95} depthWrite={false} />
        </points>
      </group>
    </group>
  );
}

/** Formed systems as a constellation — minus those swallowed by galaxies. */
export function SystemGlyphs() {
  const rev = useGame((g) => g.rev);
  void rev;
  const cine = useUiBus((b) => b.activeCinematic);
  const queue = useUiBus((b) => b.cinematicQueue);
  const { s } = useGame.getState();
  const systems = s.run.systems;
  // Systems consumed by a galaxy whose ceremony is still QUEUED remain in
  // the constellation — they depart (as streaks) when that ceremony starts.
  const queuedGalaxies = queue.filter((j) => j.kind === 'galaxy').map((j) => j.index);
  const consumed =
    (queuedGalaxies.length > 0 ? Math.min(...queuedGalaxies) : s.run.galaxies) *
    C.SYSTEMS_PER_GALAXY;

  const glyphs: { index: number; records: CompletedPlanetRecord[] }[] = [];
  const first = Math.max(consumed, systems - 24);
  for (let i = first; i < systems; i++) {
    // The freshly-formed system stays hidden while its cinematic plays —
    // FormationFX delivers it to this spot, then it appears.
    if (cine?.kind === 'system' && cine.index === i) continue;
    glyphs.push({
      index: i,
      records: s.run.completedPlanets.slice(
        i * C.PLANETS_PER_SYSTEM,
        (i + 1) * C.PLANETS_PER_SYSTEM,
      ),
    });
  }

  return (
    <group>
      {glyphs.map((g, order) => (
        <SystemGlyph key={g.index} index={g.index} records={g.records} settleDelay={order * 0.04} />
      ))}
    </group>
  );
}
