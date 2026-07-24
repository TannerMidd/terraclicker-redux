import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Sprite, SpriteMaterial, Vector3 } from 'three/webgpu';
import { useGame } from '../../state/store';
import { mulberry } from '../../engine/rng';
import { SCENE_SPRITES } from '../assets';
import { sceneTex } from './spriteTextures';

/** Matches the sun sprite in Stars.tsx. */
const SUN_POS = new Vector3(46, 20, 28);

function mat(url: string, opts: { color?: number; additive?: boolean } = {}): SpriteMaterial {
  const m = new SpriteMaterial({
    map: sceneTex(url),
    color: opts.color ?? 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  if (opts.additive) m.blending = AdditiveBlending;
  return m;
}

/** 0→1 envelope: eases in over 1.2s of life, out over the last 1.5s. */
function useEnvelope(id: string) {
  const born = useRef<number | null>(null);
  return (t: number): number => {
    if (born.current === null) born.current = t;
    const e = useGame.getState().s.activeEvents.find((x) => x.id === id);
    if (!e) return 0;
    return Math.min(1, (t - born.current) / 1.2, e.remainingMs / 1500);
  };
}

/** A pod of vast, gentle originals crossing the sky. They know the way. */
function WhalePod() {
  const mats = useMemo(() => Array.from({ length: 4 }, () => mat(SCENE_SPRITES.event.spaceWhale)), []);
  const refs = useRef<(Sprite | null)[]>([]);
  const env = useEnvelope('whale-migration');
  const SCALES = [2.0, 1.5, 1.25, 1.7];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const fade = env(t);
    for (let i = 0; i < 4; i++) {
      const sp = refs.current[i];
      if (!sp) continue;
      const p = (t * 0.02 + i * 0.16) % 1;
      sp.position.set(-19 + p * 38, 2.4 + i * 0.9 + Math.sin(t * 0.4 + i * 2) * 0.35, -6.5 - i * 1.8);
      const vis = Math.min(1, Math.min(p, 1 - p) * 9);
      mats[i]!.opacity = fade * vis * 0.95;
      mats[i]!.rotation = Math.sin(t * 0.3 + i) * 0.06;
      sp.scale.set(SCALES[i]!, SCALES[i]!, 1);
    }
  });
  return (
    <group>
      {mats.map((m, i) => (
        <sprite key={i} ref={(el) => { refs.current[i] = el; }} raycast={() => null}>
          <primitive object={m} attach="material" />
        </sprite>
      ))}
    </group>
  );
}

/** Two couriers of ice on tidy arcs, cargo strapped and manifest stamped. */
function CometFly() {
  const bodies = useMemo(() => [mat(SCENE_SPRITES.event.comet), mat(SCENE_SPRITES.event.comet)], []);
  const trails = useMemo(
    () => [mat(SCENE_SPRITES.fx.sparkStreak, { color: 0x9fd8ff, additive: true }), mat(SCENE_SPRITES.fx.sparkStreak, { color: 0x9fd8ff, additive: true })],
    [],
  );
  const refs = useRef<(Sprite | null)[]>([]);
  const trailRefs = useRef<(Sprite | null)[]>([]);
  const env = useEnvelope('comet-delivery');

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const fade = env(t);
    for (let i = 0; i < 2; i++) {
      const sp = refs.current[i];
      const tr = trailRefs.current[i];
      if (!sp || !tr) continue;
      const p = (t * 0.045 + i * 0.5) % 1;
      const x = -17 + p * 34;
      const y = 6.2 - i * 2.1 - p * 3.2;
      const z = -8 + i * 3;
      sp.position.set(x, y, z);
      tr.position.set(x - 1.15, y + 0.34, z);
      const vis = Math.min(1, Math.min(p, 1 - p) * 9);
      bodies[i]!.opacity = fade * vis;
      bodies[i]!.rotation = -0.16;
      trails[i]!.opacity = fade * vis * 0.75;
      trails[i]!.rotation = -0.16;
      sp.scale.set(1.2, 1.2, 1);
      tr.scale.set(1.9, 0.34, 1);
    }
  });
  return (
    <group>
      {bodies.map((m, i) => (
        <group key={i}>
          <sprite ref={(el) => { refs.current[i] = el; }} raycast={() => null}>
            <primitive object={m} attach="material" />
          </sprite>
          <sprite ref={(el) => { trailRefs.current[i] = el; }} raycast={() => null}>
            <primitive object={trails[i]!} attach="material" />
          </sprite>
        </group>
      ))}
    </group>
  );
}

/** Nine stones falling politely past, in formation. */
function MeteorFan() {
  const N = 9;
  const mats = useMemo(() => Array.from({ length: N }, () => mat(SCENE_SPRITES.event.meteor)), []);
  const refs = useRef<(Sprite | null)[]>([]);
  const seeds = useMemo(() => {
    const r = mulberry(0x3e7e0);
    return Array.from({ length: N }, () => ({
      x0: 3 + r() * 12,
      y0: 4.5 + r() * 4,
      z: -3.5 - r() * 5,
      speed: 5.5 + r() * 3.5,
      cycle: 2.6 + r() * 2.2,
      off: r() * 5,
      scale: 0.3 + r() * 0.25,
    }));
  }, []);
  const env = useEnvelope('meteor-shower');
  // Travel direction (-1, -0.55): mirrored art, rotated to match.
  const ANG = Math.atan2(-0.55, -1);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const fade = env(t);
    for (let i = 0; i < N; i++) {
      const sp = refs.current[i];
      const sd = seeds[i]!;
      if (!sp) continue;
      const k = ((t + sd.off) % sd.cycle) / sd.cycle;
      const d = k * sd.speed * sd.cycle;
      sp.position.set(sd.x0 - d * 0.876, sd.y0 - d * 0.482, sd.z);
      const vis = Math.min(1, Math.min(k, 1 - k) * 7);
      mats[i]!.opacity = fade * vis * 0.95;
      mats[i]!.rotation = ANG - Math.PI;
      sp.scale.set(-sd.scale, sd.scale, 1);
    }
  });
  return (
    <group>
      {mats.map((m, i) => (
        <sprite key={i} ref={(el) => { refs.current[i] = el; }} raycast={() => null}>
          <primitive object={m} attach="material" />
        </sprite>
      ))}
    </group>
  );
}

/** The local star files an elegant complaint. */
function FlareArc() {
  const m = useMemo(() => mat(SCENE_SPRITES.event.flareArc, { additive: true }), []);
  const ref = useRef<Sprite>(null);
  const env = useEnvelope('solar-flare');
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const fade = env(t);
    const sp = ref.current;
    if (!sp) return;
    sp.position.copy(SUN_POS);
    sp.position.y += 2;
    const s = 15 + Math.sin(t * 0.8) * 1.6;
    sp.scale.set(s, s, 1);
    m.opacity = fade * 0.9;
    m.rotation = Math.sin(t * 0.23) * 0.1;
  });
  return (
    <sprite ref={ref} raycast={() => null}>
      <primitive object={m} attach="material" />
    </sprite>
  );
}

/** Curtains over the poles: the atmosphere applauds. */
function Aurora() {
  const N = 8; // five north, three south
  const mats = useMemo(
    () =>
      Array.from({ length: N }, (_, i) =>
        mat(SCENE_SPRITES.fx.auroraRibbon, { color: i % 2 ? 0x58d68a : 0x5ad7e8, additive: true }),
      ),
    [],
  );
  const refs = useRef<(Sprite | null)[]>([]);
  const env = useEnvelope('aurora-storm');
  const sizeScale = useGame(
    (g) => ({ small: 0.86, medium: 1, large: 1.1, huge: 1.2 })[g.s.planet.size],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const fade = env(t);
    for (let i = 0; i < N; i++) {
      const sp = refs.current[i];
      if (!sp) continue;
      const north = i < 5;
      const idx = north ? i : i - 5;
      const count = north ? 5 : 3;
      const a = (idx / count) * Math.PI * 2 + t * 0.1 * (north ? 1 : -1);
      const rad = 0.42 * sizeScale;
      sp.position.set(
        Math.cos(a) * rad,
        (north ? 1.16 : -1.16) * sizeScale,
        Math.sin(a) * rad,
      );
      const sy = (0.95 + Math.sin(t * 1.3 + i * 1.7) * 0.18) * (north ? 1 : -1);
      sp.scale.set(0.5, sy, 1);
      mats[i]!.opacity = fade * (0.4 + 0.2 * Math.sin(t * 0.9 + i));
    }
  });
  return (
    <group>
      {mats.map((m, i) => (
        <sprite key={i} ref={(el) => { refs.current[i] = el; }} raycast={() => null}>
          <primitive object={m} attach="material" />
        </sprite>
      ))}
    </group>
  );
}

/** Geometry stops agreeing with itself in the planet's general vicinity. */
function Squall() {
  const N = 7;
  const mats = useMemo(() => Array.from({ length: N }, () => mat(SCENE_SPRITES.event.probabilityShard)), []);
  const refs = useRef<(Sprite | null)[]>([]);
  const env = useEnvelope('probability-squall');

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const fade = env(t);
    for (let i = 0; i < N; i++) {
      const sp = refs.current[i];
      if (!sp) continue;
      const a = i * 0.9 + t * (0.22 + (i % 3) * 0.08);
      const rad = 1.85 + (i % 4) * 0.22 + Math.sin(t * 3.1 + i * 2) * 0.1;
      sp.position.set(
        Math.cos(a) * rad + Math.sin(t * 7 + i) * 0.08,
        Math.sin(a * 0.7 + i) * 0.9 + Math.cos(t * 5.3 + i) * 0.08,
        Math.sin(a) * rad * 0.7,
      );
      mats[i]!.opacity = fade * (0.55 + 0.4 * Math.sin(t * 9 + i * 3));
      mats[i]!.rotation = t * (0.7 + (i % 3) * 0.25);
      const s = 0.24 + (i % 3) * 0.05;
      sp.scale.set(s, s, 1);
    }
  });
  return (
    <group>
      {mats.map((m, i) => (
        <sprite key={i} ref={(el) => { refs.current[i] = el; }} raycast={() => null}>
          <primitive object={m} attach="material" />
        </sprite>
      ))}
    </group>
  );
}

const CHOREOGRAPHY: Record<string, () => React.JSX.Element> = {
  'whale-migration': WhalePod,
  'comet-delivery': CometFly,
  'meteor-shower': MeteorFan,
  'solar-flare': FlareArc,
  'aurora-storm': Aurora,
  'probability-squall': Squall,
};

/**
 * Events happen in the SKY, not just in a toast (SPRITE_MANIFEST.md §E):
 * whale pods cross behind the planet, meteors fan past, the flare rides the
 * sun's limb, auroras crown the poles, probability stops behaving.
 */
export function EventFX() {
  const rev = useGame((g) => g.rev);
  void rev;
  const active = useGame.getState().s.activeEvents;
  return (
    <group>
      {active.map((e) => {
        const Fx = CHOREOGRAPHY[e.id];
        return Fx ? <Fx key={e.id} /> : null;
      })}
    </group>
  );
}
