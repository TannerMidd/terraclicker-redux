/**
 * The economy, visible: dispatch freight lanes out of specialized systems
 * and trade lanes pulsing between the member systems of a formed galaxy.
 * Deterministic from the save, like everything else in the sky.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Sprite,
  Vector3,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import { useUiBus } from '../../fx/uiBus';
import { mulberry } from '../../../engine/rng';
import { SCENE_SPRITES } from '../../assets';
import {
  GALAXY_TILT,
  SYSTEM_DETAIL_R,
  galaxyPosition,
  galaxySeed,
  memberSeatLocal,
} from '../universeLayout';
import { C } from '../../../content/constants';
import { makeGlowSprite, makeTexSprite } from './shared';
import { universeMotion, SPECIALTY_VISUAL, type SystemSpecialty } from './operationsVisual';
import { screenAwareSpriteScale } from '../trafficMath';

function lineBetween(a: Vector3, b: Vector3, material: LineBasicMaterial): Line {
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]), 3),
  );
  const line = new Line(geo, material);
  line.raycast = () => null;
  return line;
}

/**
 * A specialized system works its route: a faint lane in the specialty's
 * color with freighters running both directions and a gate glow at the far
 * end. Mount at the system's seat (local origin = the star).
 */
export function FreightLane({
  specialty,
  seed,
}: {
  specialty: SystemSpecialty;
  seed: number;
}) {
  const color = SPECIALTY_VISUAL[specialty].color;
  const spec = useMemo(() => {
    const r = mulberry((seed ^ 0xf8e1) >>> 0);
    const phi = r() * Math.PI * 2;
    const dir = new Vector3(Math.cos(phi), (r() - 0.5) * 0.3, Math.sin(phi)).normalize();
    return {
      dir,
      near: 2.1,
      far: SYSTEM_DETAIL_R * (0.42 + r() * 0.08),
      ships: Array.from({ length: 3 }, (_, i) => ({
        period: 9 + r() * 6,
        phase: r() * 30,
        outbound: i % 2 === 0,
        tex: r() < 0.5 ? SCENE_SPRITES.traffic.hauler : SCENE_SPRITES.traffic.tanker,
      })),
    };
  }, [seed]);
  const laneMat = useMemo(
    () => new LineBasicMaterial({ color, transparent: true, opacity: 0.16 }),
    [color],
  );
  const lane = useMemo(() => {
    const a = spec.dir.clone().multiplyScalar(spec.near);
    const b = spec.dir.clone().multiplyScalar(spec.far);
    return lineBetween(a, b, laneMat);
  }, [spec, laneMat]);
  const gateMat = useMemo(() => makeGlowSprite(color, 0.75), [color]);
  const shipMats = useMemo(() => spec.ships.map((s) => makeTexSprite(s.tex)), [spec]);
  useEffect(
    () => () => {
      lane.geometry.dispose();
      laneMat.dispose();
      gateMat.dispose();
      shipMats.forEach((m) => m.dispose());
    },
    [lane, laneMat, gateMat, shipMats],
  );
  const ships = useRef<(Sprite | null)[]>([]);
  const gate = useRef<Sprite>(null);

  useFrame((state) => {
    const t = universeMotion.reduced ? 0 : state.clock.elapsedTime;
    spec.ships.forEach((ship, i) => {
      const sprite = ships.current[i];
      if (!sprite) return;
      if (universeMotion.reduced) {
        sprite.visible = false;
        return;
      }
      const u = ((t + ship.phase) % ship.period) / ship.period;
      const k = ship.outbound ? u : 1 - u;
      sprite.position.copy(spec.dir).multiplyScalar(spec.near + (spec.far - spec.near) * k);
      sprite.visible = true;
    });
    if (gate.current) {
      const pulse = universeMotion.reduced ? 1 : 0.85 + Math.sin(t * 1.7) * 0.15;
      gate.current.scale.setScalar(0.6 * pulse);
    }
  });

  return (
    <group>
      <primitive object={lane} />
      <sprite
        ref={gate}
        position={spec.dir.clone().multiplyScalar(spec.far)}
        raycast={() => null}
      >
        <primitive object={gateMat} attach="material" />
      </sprite>
      {spec.ships.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            ships.current[i] = el;
          }}
          scale={[0.18, 0.18, 1]}
          raycast={() => null}
        >
          <primitive object={shipMats[i]!} attach="material" />
        </sprite>
      ))}
    </group>
  );
}

/**
 * Inside a formed galaxy the member systems trade: faint lanes between
 * neighboring stars with light pulses running them. Rendered only while a
 * galaxy (or one of its systems) is being visited — it's their close-up.
 */
export function GalaxyTradeLanes() {
  const focus = useUiBus((b) => b.focus);
  const flightGalaxy = useUiBus((b) => b.flightMode ? b.flightNearGalaxy : null);
  const flightSystem = useUiBus((b) => b.flightMode ? b.flightNearSystem : null);
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  let galaxyIndex: number | null = null;
  if (flightSystem !== null
    && flightSystem < s.run.galaxies * C.SYSTEMS_PER_GALAXY) {
    galaxyIndex = Math.floor(flightSystem / C.SYSTEMS_PER_GALAXY);
  } else if (flightGalaxy !== null) {
    galaxyIndex = flightGalaxy;
  } else if (focus) {
    if (focus.kind === 'galaxy') galaxyIndex = focus.index;
    else {
      const system =
        focus.kind === 'world'
          ? Math.floor(focus.index / C.PLANETS_PER_SYSTEM)
          : focus.index;
      if (system < s.run.galaxies * C.SYSTEMS_PER_GALAXY) {
        galaxyIndex = Math.floor(system / C.SYSTEMS_PER_GALAXY);
      }
    }
  }
  if (galaxyIndex === null) return null;
  return <GalaxyTradeLanesInner key={galaxyIndex} galaxyIndex={galaxyIndex} seed={s.seed} />;
}

function GalaxyTradeLanesInner({
  galaxyIndex,
  seed,
}: {
  galaxyIndex: number;
  seed: number;
}) {
  const flight = useUiBus((b) => b.flightMode);
  const seats = useMemo(() => {
    const gSeed = galaxySeed(galaxyIndex, seed);
    const origin = galaxyPosition(galaxyIndex, seed);
    return Array.from({ length: C.SYSTEMS_PER_GALAXY }, (_, k) =>
      memberSeatLocal(k, gSeed).applyEuler(GALAXY_TILT).add(origin),
    );
  }, [galaxyIndex, seed]);
  const laneMat = useMemo(
    () => new LineBasicMaterial({ color: 0x8ca0c8, transparent: true, opacity: 0.11 }),
    [],
  );
  const lanes = useMemo(
    () =>
      seats.map((seat, k) =>
        lineBetween(seat, seats[(k + 1) % seats.length]!, laneMat),
      ),
    [seats, laneMat],
  );
  const pulses = useMemo(() => {
    const r = mulberry((seed ^ (galaxyIndex * 0x91e)) >>> 0);
    return Array.from({ length: 3 }, () => {
      const a = Math.floor(r() * seats.length);
      return {
        a,
        b: (a + 1) % seats.length,
        period: 5.5 + r() * 3.5,
        phase: r() * 20,
      };
    });
  }, [seed, galaxyIndex, seats.length]);
  const pulseMat = useMemo(() => makeGlowSprite(0xffe2ae, 0.9), []);
  useEffect(
    () => () => {
      lanes.forEach((l) => l.geometry.dispose());
      laneMat.dispose();
      pulseMat.dispose();
    },
    [lanes, laneMat, pulseMat],
  );
  const sprites = useRef<(Sprite | null)[]>([]);

  useFrame((state) => {
    laneMat.opacity = flight ? 0.26 : 0.11;
    pulseMat.opacity = flight ? 1 : 0.9;
    if (universeMotion.reduced) return;
    const t = state.clock.elapsedTime;
    const fov = (state.camera as { fov?: number }).fov ?? 42;
    pulses.forEach((pulse, i) => {
      const sprite = sprites.current[i];
      if (!sprite) return;
      const u = ((t + pulse.phase) % pulse.period) / pulse.period;
      sprite.position.copy(seats[pulse.a]!).lerp(seats[pulse.b]!, u);
      if (flight) {
        const distance = sprite.position.distanceTo(state.camera.position);
        const scale = screenAwareSpriteScale(distance, fov, state.size.height, 13, 0.12, 1.5);
        sprite.scale.set(scale, scale, 1);
      } else {
        sprite.scale.set(0.15, 0.15, 1);
      }
    });
  });

  return (
    <group>
      {lanes.map((lane, i) => (
        <primitive key={i} object={lane} />
      ))}
      {pulses.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            sprites.current[i] = el;
          }}
          scale={[0.15, 0.15, 1]}
          raycast={() => null}
        >
          <primitive object={pulseMat} attach="material" />
        </sprite>
      ))}
    </group>
  );
}
