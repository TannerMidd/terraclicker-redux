import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Line,
  LineBasicMaterial,
  MeshBasicMaterial,
  PointsMaterial,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import { useUiBus } from '../../fx/uiBus';
import { mulberry } from '../../../engine/rng';
import {
  GALAXY_R,
  GALAXY_TILT,
  galaxyCorePoints,
  galaxyPoints,
  galaxyPosition,
  galaxySeed,
  memberSeatLocal,
  MINI_SIZE,
  starClass,
  starColor,
  visitOrbit,
} from '../universeLayout';
import { C } from '../../../content/constants';
import { distantGeometry, distantMaterial } from '../settledPlanet';
import { focusOn, makeGlowSprite, visitHandlers, visitOrbitGeometry } from './shared';
import { universeMotion } from './operationsVisual';
import { sharedBasicMaterial } from './pool';

const APP_T0 = performance.now();
const DETAILED = 8; // most recent galaxies get the full treatment
const MAX_SHOWN = 24; // older ones shine on as simple beacons

/** Stand-in for a world whose material is still queued. Never drawn. */
const PENDING_MATERIAL = new MeshBasicMaterial({ visible: false });

/** Arm points colored core→edge with a seeded personality hue. */
function armGeometry(seed: number): BufferGeometry {
  const pos = galaxyPoints(seed, 850);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const r = mulberry(seed ^ 0x4a1c);
  const warm = new Color(0xfff2d9);
  const cool = new Color().setHSL(0.55 + r() * 0.16, 0.35 + r() * 0.3, 0.72);
  const edge = new Color().setHSL(0.6 + r() * 0.2, 0.5, 0.6);
  const colors = new Float32Array(pos.length);
  const c = new Color();
  for (let i = 0; i < pos.length / 3; i++) {
    // Normalised by the galaxy's own radius. This was a hardcoded 3.45 from
    // when a whole galaxy was three units across, which after the re-scale
    // put every point past the end of the ramp — the lerps overshot and the
    // core→edge gradient collapsed into one flat edge colour.
    const rad = Math.hypot(pos[i * 3]!, pos[i * 3 + 2]!) / GALAXY_R;
    c.copy(warm).lerp(cool, Math.min(1, rad * 2.2)).lerp(edge, Math.max(0, rad - 0.55) * 1.6);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}

/**
 * One member system inside a visited galaxy — a real system, at true scale.
 *
 * These used to be bare points of light: a galaxy was one place you could go
 * and four dots that suggested places. There is room for the real thing now
 * (a galaxy is 78 units across and a system 8), so each seat gets its star,
 * its actual orbit ellipses and the five worlds you actually delivered,
 * turning at the radii they turn at everywhere else.
 *
 * What it does NOT get is the civic layer — atmospheres, settlement lights,
 * orbiting hardware, freight. From the galaxy's whole-disc framing a world is
 * about four pixels across, so that detail would cost real work to render
 * something nobody can see. Approaching hands the seat to FocusedSystem,
 * which brings all of it. Detail by distance; the geometry underneath is
 * identical either way, so the handover doesn't move anything.
 */
function MemberSystem({
  globalIndex,
  slot,
  gSeed,
  dimmed,
}: {
  globalIndex: number;
  slot: number;
  gSeed: number;
  /** A sibling system is being inspected — recede politely. */
  dimmed: boolean;
}) {
  const records = useGame
    .getState()
    .s.run.completedPlanets.slice(
      globalIndex * C.PLANETS_PER_SYSTEM,
      (globalIndex + 1) * C.PLANETS_PER_SYSTEM,
    );
  const seed = records[0]?.seed ?? globalIndex + 1;
  const color = useMemo(() => starColor(seed), [seed]);
  const glow = useMemo(() => makeGlowSprite(color.getHex(), 0.6), [color]);
  const pos = useMemo(() => memberSeatLocal(slot, gSeed), [slot, gSeed]);
  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const worlds = useRef<(Mesh | null)[]>([]);
  const born = useRef<number | null>(null);

  // Orbit paths, shared with every other system in the game.
  const lineMat = useMemo(
    () => new LineBasicMaterial({ color: 0x8ca0c8, transparent: true, opacity: 0 }),
    [],
  );
  const orbits = useMemo(
    () =>
      records.map((_, i) => {
        const l = new Line(visitOrbitGeometry(i), lineMat);
        l.raycast = () => null;
        return l;
      }),
    [records, lineMat],
  );
  useEffect(() => () => lineMat.dispose(), [lineMat]);

  const dimK = useRef(1);
  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;
    // Systems surface out of the arm-glow one by one as you arrive.
    const k = Math.min(1, Math.max(0, (t - born.current - 0.25 - slot * 0.09) / 0.45));
    g.scale.setScalar(k === 1 ? 1 : 0.001 + (1 - Math.pow(1 - k, 3)) * 0.999);
    // While a sibling is inspected these lower their lights rather than
    // shrinking away — a solar system twenty units off is SUPPOSED to look
    // like a solar system now. Only the brightness yields the frame.
    dimK.current += ((dimmed ? 0.3 : 1) - dimK.current) * (1 - Math.exp(-dt * 5));
    glow.opacity = 0.6 * dimK.current;
    lineMat.opacity = Math.min(1, (t - born.current) / 0.9) * 0.16 * dimK.current;

    const drift = universeMotion.reduced ? 0 : t;
    if (spin.current) spin.current.rotation.y = drift * 0.01;
    for (let i = 0; i < worlds.current.length; i++) {
      const w = worlds.current[i];
      if (!w) continue;
      // Same orbit math as FocusedSystem, so a world does not jump when the
      // seat is handed over.
      const o = visitOrbit(i);
      const a = o.phase + drift * o.speed;
      w.position.set(
        Math.cos(a) * o.radius,
        Math.sin(a) * o.radius * 0.22,
        Math.sin(a) * o.radius * 0.6,
      );
      w.scale.setScalar(MINI_SIZE[records[i]!.size] * 0.85);
      w.rotation.y = drift * 0.35;
      // A world appears once its material has been built — a few per frame
      // across the whole galaxy, so arriving never costs a freeze. Reasserted
      // every frame rather than once, so a React re-render cannot undo it.
      const mat = distantMaterial(records[i]!.type, t);
      if (mat) {
        if (w.material !== mat) w.material = mat;
        w.visible = true;
      }
    }
  });

  const names = records.map((r) => r.name).slice(0, 2).join(', ');
  return (
    <group ref={root} position={pos}>
      <mesh raycast={() => null}>
        <icosahedronGeometry args={[0.11, 1]} />
        <primitive object={sharedBasicMaterial({ color })} attach="material" />
      </mesh>
      <sprite scale={[0.6, 0.6, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
      <mesh
        visible={false}
        {...visitHandlers(
          `System ${globalIndex + 1}`,
          `${starClass(seed)} · ${records.length} worlds — ${names}… · click to visit`,
          () => focusOn({ kind: 'system', index: globalIndex }),
        )}
      >
        {/* Big enough to catch a click at galaxy framing, small enough not to
            swallow one meant for the neighbouring seat. */}
        <sphereGeometry args={[2.4, 10, 10]} />
      </mesh>
      <group ref={spin}>
        {orbits.map((l, i) => (
          <primitive key={i} object={l} />
        ))}
        {records.map((rec, i) => (
          // Shared sphere, own colours (distantGeometry); hidden until its
          // material has been built, which the frame budget stages out.
          <mesh
            key={`${rec.seed}-${i}`}
            ref={(el) => {
              worlds.current[i] = el;
            }}
            visible={false}
            geometry={distantGeometry()}
            material={PENDING_MATERIAL}
            raycast={() => null}
          />
        ))}
      </group>
    </group>
  );
}

function Galaxy({
  index,
  visited = false,
  drilledIndex = null,
}: {
  index: number;
  visited?: boolean;
  drilledIndex?: number | null;
}) {
  const masterSeed = useGame.getState().s.seed;
  const seed = galaxySeed(index, masterSeed);
  const pos = useMemo(() => galaxyPosition(index, masterSeed), [index, masterSeed]);
  const arms = useMemo(() => armGeometry(seed), [seed]);
  const core = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(galaxyCorePoints(seed), 3));
    return geo;
  }, [seed]);
  const armMat = useMemo(
    () =>
      new PointsMaterial({
        size: 2.0,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const coreMat = useMemo(
    () =>
      new PointsMaterial({
        size: 2.1,
        sizeAttenuation: false,
        color: 0xffe9c9,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const glow = useMemo(() => makeGlowSprite(0xfff0d0, 0.62), []);
  const nucMat = useMemo(
    () => new MeshBasicMaterial({ color: 0xfff2d9, transparent: true, opacity: 0.9 }),
    [],
  );

  const root = useRef<Group>(null);
  const spinner = useRef<Group>(null);
  // Galaxies present at page load appear formed; new ones are BORN —
  // scale-up with a fast spin that relaxes into the eternal drift.
  const isNewborn = useRef(performance.now() - APP_T0 > 4000);
  const born = useRef<number | null>(null);
  const dim = useRef(1);
  const drilled = visited && drilledIndex !== null;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;
    const age = t - born.current;
    if (spinner.current) {
      const spinUp = isNewborn.current ? Math.exp(-age * 1.1) * 0.5 : 0;
      spinner.current.rotation.y += dt * (0.03 + spinUp);
    }
    const g = root.current;
    let baseArm = 0.92;
    if (g && isNewborn.current) {
      const k = Math.min(1, age / 2.2);
      const e = 1 - Math.pow(1 - k, 3);
      g.scale.setScalar(0.02 + e * 0.98);
      baseArm = 0.15 + e * 0.65;
    }
    // While a member system is being inspected, the rest of the galaxy
    // lowers its lights so the visited worlds carry the frame.
    dim.current += ((drilled ? 0.4 : 1) - dim.current) * (1 - Math.exp(-dt * 5));
    armMat.opacity = baseArm * dim.current;
    coreMat.opacity = 0.85 * dim.current;
    glow.opacity = 0.62 * dim.current;
    // The nucleus can end up right over the visiting camera's shoulder —
    // at low alpha it reads as core-shine instead of a faceted ball.
    nucMat.opacity = 0.9 * dim.current * dim.current;
  });

  return (
    <group ref={root} position={pos} rotation={GALAXY_TILT}>
      <group ref={spinner}>
        <points geometry={arms} material={armMat} raycast={() => null} />
        <points geometry={core} material={coreMat} raycast={() => null} />
      </group>
      <sprite scale={[2.6, 2.6, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
      <mesh raycast={() => null}>
        <icosahedronGeometry args={[0.22, 1]} />
        <primitive object={nucMat} attach="material" />
      </mesh>
      {/* Whole-disc hit volume; retired while visiting so member stars get the pointer. */}
      {!visited && (
        <mesh
          visible={false}
          {...visitHandlers(
            `Galaxy ${index + 1}`,
            `${C.SYSTEMS_PER_GALAXY * C.PLANETS_PER_SYSTEM} worlds · ×${C.GALAXY_MULT} production · yours — click to enter`,
            () => focusOn({ kind: 'galaxy', index }),
          )}
        >
          <sphereGeometry args={[2.6, 10, 10]} />
        </mesh>
      )}
      {visited &&
        Array.from({ length: C.SYSTEMS_PER_GALAXY }, (_, k) => {
          const gi = index * C.SYSTEMS_PER_GALAXY + k;
          if (gi === drilledIndex) return null; // FocusedSystem holds this seat
          return <MemberSystem key={k} globalIndex={gi} slot={k} gSeed={seed} dimmed={drilled} />;
        })}
    </group>
  );
}

/** An older galaxy, receded to a beacon: glow + nucleus, no arm cloud. */
function BeaconGalaxy({ index }: { index: number }) {
  const masterSeed = useGame.getState().s.seed;
  const pos = useMemo(() => galaxyPosition(index, masterSeed), [index, masterSeed]);
  const glow = useMemo(() => makeGlowSprite(0xffedc9, 0.4), []);
  return (
    <group position={pos}>
      <sprite scale={[1.8, 1.8, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
      <mesh raycast={() => null}>
        <icosahedronGeometry args={[0.2, 1]} />
        <primitive object={sharedBasicMaterial({ color: 0xfff2d9, transparent: true, opacity: 0.85 })} attach="material" />
      </mesh>
      <mesh
        visible={false}
        {...visitHandlers(`Galaxy ${index + 1}`, 'settled · still yours — click to enter', () =>
          focusOn({ kind: 'galaxy', index }),
        )}
      >
        <sphereGeometry args={[2.2, 10, 10]} />
      </mesh>
    </group>
  );
}

export function Galaxies() {
  const galaxies = useGame((g) => g.s.run.galaxies);
  const cine = useUiBus((b) => b.activeCinematic);
  const queue = useUiBus((b) => b.cinematicQueue);
  const focus = useUiBus((b) => b.focus);
  // The galaxy being visited — directly, or via one of its member systems.
  const visitedGalaxy = !focus
    ? null
    : focus.kind === 'galaxy'
      ? focus.index
      : focus.index < galaxies * C.SYSTEMS_PER_GALAXY
        ? Math.floor(focus.index / C.SYSTEMS_PER_GALAXY)
        : null;
  const drilledIndex = focus?.kind === 'system' ? focus.index : null;
  // A galaxy whose formation ceremony is still playing OR still queued
  // hasn't happened on screen yet — it appears when the bloom does.
  const unborn = new Set(
    [cine, ...queue].filter((j) => j?.kind === 'galaxy').map((j) => j!.index),
  );
  const items: ReactElement[] = [];
  const from = Math.max(0, galaxies - MAX_SHOWN);
  for (let i = from; i < galaxies; i++) {
    if (unborn.has(i)) continue;
    // Visiting promotes even a settled beacon back to the full spiral.
    if (i >= galaxies - DETAILED || i === visitedGalaxy)
      items.push(
        <Galaxy key={i} index={i} visited={i === visitedGalaxy} drilledIndex={drilledIndex} />,
      );
    else items.push(<BeaconGalaxy key={i} index={i} />);
  }
  return <group>{items}</group>;
}
