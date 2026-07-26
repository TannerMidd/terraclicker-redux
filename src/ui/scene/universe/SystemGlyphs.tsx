import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import { useUiBus } from '../../fx/uiBus';
import type { CompletedPlanetRecord } from '../../../engine/types';
import { starClass, starColor, systemGlyphPosition } from '../universeLayout';
import { C } from '../../../content/constants';
import { focusOn, focusSystemIndex, makeGlowSprite, visitHandlers } from './shared';
import { sharedBasicMaterial } from './pool';
import {
  SPECIALTY_VISUAL,
  specialtyFor,
  specialtySummary,
  universeMotion,
  type SystemSpecialty,
} from './operationsVisual';

const GLINT_MAT = makeGlowSprite(0xffe2ae, 0.85);
const RING_GEO = new RingGeometry(0.55, 0.585, 48);
const RING_MAT = new MeshBasicMaterial({
  color: 0x8ca0c8,
  transparent: true,
  opacity: 0.28,
  side: DoubleSide,
});

const DISPATCH_RING_GEO = new RingGeometry(0.655, 0.682, 64);
const DISPATCH_MATS: Record<SystemSpecialty, MeshBasicMaterial> = {
  thermal: dispatchMaterial('thermal'),
  atmo: dispatchMaterial('atmo'),
  hydro: dispatchMaterial('hydro'),
  bio: dispatchMaterial('bio'),
  science: dispatchMaterial('science'),
  production: dispatchMaterial('production'),
};

function dispatchMaterial(specialty: SystemSpecialty): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: SPECIALTY_VISUAL[specialty].color,
    transparent: true,
    opacity: 0.42,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** A formed system receded into the constellation: star + tilted ring + world-dots. */
function SystemGlyph({
  index,
  records,
  specialty,
  settleDelay,
}: {
  index: number;
  records: CompletedPlanetRecord[];
  specialty: SystemSpecialty | null;
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
  const dispatch = useRef<Group>(null);
  const glint = useRef<Sprite>(null);
  const born = useRef<number | null>(null);
  const glintOrbit = useMemo(
    () => ({ phase: (seed % 628) / 100, speed: 0.24 + ((seed >>> 3) % 10) * 0.014 }),
    [seed],
  );

  useFrame((state, dt) => {
    if (!universeMotion.reduced) {
      if (spin.current) spin.current.rotation.y += dt * 0.1;
      if (dispatch.current) dispatch.current.rotation.y -= dt * 0.055;
      // A patrol glint: somebody is still out here, running errands.
      const g2 = glint.current;
      if (g2) {
        const a = glintOrbit.phase + state.clock.elapsedTime * glintOrbit.speed;
        g2.position.set(Math.cos(a) * 0.72, Math.sin(a * 1.7) * 0.06, Math.sin(a) * 0.72);
      }
    }
    const g = root.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;
    // Settle in: constellation glyphs pop softly, staggered, on first sight.
    const k = universeMotion.reduced
      ? 1
      : Math.min(1, Math.max(0, (t - born.current - settleDelay) / 0.55));
    g.scale.setScalar(k === 1 ? 1 : 0.001 + (1 - Math.pow(1 - k, 3)) * 0.999);
  });

  const worlds = records
    .map((r) => r.name)
    .slice(0, 3)
    .join(', ');
  const dispatchSummary = specialtySummary(specialty);
  const hoverSummary = `${starClass(seed)} · ${records.length} worlds — ${worlds}${
    records.length > 3 ? '…' : ''
  }${dispatchSummary ? ` · ${dispatchSummary}` : ''} · click to visit`;

  return (
    <group ref={root} position={pos} rotation={[0.5, 0, 0.12]}>
      <mesh raycast={() => null}>
        <icosahedronGeometry args={[0.16, 1]} />
        <primitive object={sharedBasicMaterial({ color })} attach="material" />
      </mesh>
      <mesh
        visible={false}
        {...visitHandlers(
          `System ${index + 1}`,
          hoverSummary,
          () => focusOn({ kind: 'system', index }),
        )}
      >
        <sphereGeometry args={[0.78, 8, 8]} />
      </mesh>
      <sprite scale={[0.9, 0.9, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
      <sprite ref={glint} scale={[0.075, 0.075, 1]} raycast={() => null}>
        <primitive object={GLINT_MAT} attach="material" />
      </sprite>
      <group ref={spin}>
        <mesh geometry={RING_GEO} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <primitive object={RING_MAT} attach="material" />
        </mesh>
        <points geometry={dots} raycast={() => null}>
          <pointsMaterial
            size={1.6}
            sizeAttenuation={false}
            color={0xbfe8d4}
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </points>
      </group>
      {specialty && (
        <group ref={dispatch}>
          <mesh
            geometry={DISPATCH_RING_GEO}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <primitive object={DISPATCH_MATS[specialty]} attach="material" />
          </mesh>
          {/* Two restrained dispatch markers make the otherwise symmetric halo legible. */}
          <mesh position={[0.67, 0, 0]} scale={0.035} raycast={() => null}>
            <tetrahedronGeometry args={[1, 0]} />
            <primitive object={DISPATCH_MATS[specialty]} attach="material" />
          </mesh>
          <mesh position={[-0.67, 0, 0]} scale={0.025} raycast={() => null}>
            <tetrahedronGeometry args={[1, 0]} />
            <primitive object={DISPATCH_MATS[specialty]} attach="material" />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Formed systems as a constellation — minus those swallowed by galaxies. */
export function SystemGlyphs() {
  const rev = useGame((g) => g.rev);
  void rev;
  const cine = useUiBus((b) => b.activeCinematic);
  const queue = useUiBus((b) => b.cinematicQueue);
  const focus = useUiBus((b) => b.focus);
  const flightSystem = useUiBus((b) => (b.flightMode ? b.flightNearSystem : null));
  const { s } = useGame.getState();
  const systems = s.run.systems;
  // Systems consumed by a galaxy whose ceremony is still QUEUED remain in
  // the constellation — they depart (as streaks) when that ceremony starts.
  const queuedGalaxies = queue.filter((j) => j.kind === 'galaxy').map((j) => j.index);
  const consumed =
    (queuedGalaxies.length > 0 ? Math.min(...queuedGalaxies) : s.run.galaxies) *
    C.SYSTEMS_PER_GALAXY;

  const glyphs: {
    index: number;
    records: CompletedPlanetRecord[];
    specialty: SystemSpecialty | null;
  }[] = [];
  const first = Math.max(consumed, systems - 24);
  for (let i = first; i < systems; i++) {
    // The freshly-formed system stays hidden while its cinematic plays —
    // FormationFX delivers it to this spot, then it appears.
    if (cine?.kind === 'system' && cine.index === i) continue;
    // A glyph being visited (or one of its worlds) yields its seat to the
    // full FocusedSystem view — otherwise the close-up camera stands inside
    // the marker ring.
    if (focus && focus.kind !== 'galaxy' && focusSystemIndex(focus) === i) continue;
    if (flightSystem === i) continue;
    glyphs.push({
      index: i,
      records: s.run.completedPlanets.slice(
        i * C.PLANETS_PER_SYSTEM,
        (i + 1) * C.PLANETS_PER_SYSTEM,
      ),
      specialty: specialtyFor(s, i),
    });
  }

  return (
    <group>
      {glyphs.map((g, order) => (
        <SystemGlyph
          key={g.index}
          index={g.index}
          records={g.records}
          specialty={g.specialty}
          settleDelay={order * 0.04}
        />
      ))}
    </group>
  );
}
