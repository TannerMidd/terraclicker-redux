/**
 * A delivered world is a CIVILIZATION, not a marble. These components dress
 * every remembered world in the life its record proves: settlement lights
 * that thicken as your career matures, the actual installations recorded at
 * delivery still orbiting on station, shuttles commuting between worlds,
 * and freight running the dispatch lanes. Everything is deterministic from
 * the save — the scene stays derived state.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Sprite, Vector3 } from 'three/webgpu';
import type { CompletedPlanetRecord } from '../../../engine/types';
import { mulberry } from '../../../engine/rng';
import { standingOf } from '../../../engine/situations';
import { useGame } from '../../../state/store';
import { SCENE_SPRITES } from '../../assets';
import { sharedGlowSprite, sharedTexSprite } from './shared';
import { universeMotion } from './operationsVisual';

export type CivilizationVariant = 'mini' | 'visit' | 'closeup';

const GOLDEN = 2.39996;
const WARM = 0xffd9a0;
const COOL = 0x9fdcff;

/** Career maturity of a world: later deliveries carry denser settlement. */
function maturity(record: CompletedPlanetRecord): number {
  return 0.5 + 0.5 * Math.min(1, record.lifetimeIndex / 30);
}

const LIGHT_BASE: Record<CompletedPlanetRecord['size'], number> = {
  small: 6,
  medium: 9,
  large: 12,
  huge: 16,
};

const LIGHT_COUNT_MULT: Record<CivilizationVariant, number> = {
  mini: 0.6,
  visit: 1,
  closeup: 1.25,
};

/** Farther viewpoints need larger glows for the lights to read at all. */
const LIGHT_SCALE_MULT: Record<CivilizationVariant, number> = {
  mini: 2.2,
  visit: 1.6,
  closeup: 1,
};

const INSTALL_CAP: Record<CivilizationVariant, number> = {
  mini: 2,
  visit: 3,
  closeup: 5,
};

interface LightSpot {
  pos: [number, number, number];
  scale: number;
  cool: boolean;
}

/**
 * Seeded settlement sites on the sphere (planet-local, radius 1).
 *
 * `standing` is how the stakes become visible. A neglected world does not
 * change colour or get a badge — its lights go out, a few at a time, in the
 * same places they always were, and come back when it is looked after again.
 * The spots themselves are unchanged and still seeded from the world, so a
 * recovered world lights up exactly the settlements it used to have.
 */
function settlementSpots(
  record: CompletedPlanetRecord,
  variant: CivilizationVariant,
  standing: number,
): LightSpot[] {
  const r = mulberry((record.seed ^ 0x11f5) >>> 0);
  const full = Math.round(LIGHT_BASE[record.size] * maturity(record) * LIGHT_COUNT_MULT[variant]);
  // Never all the way dark: somebody is always still there.
  const count = Math.max(full > 0 ? 1 : 0, Math.round(full * standing));
  const hasLab = record.installations.includes('researchLab');
  const spots: LightSpot[] = [];
  for (let i = 0; i < count; i++) {
    // Uniform on the sphere, nudged off the deep poles where nobody builds.
    const z = (r() * 2 - 1) * 0.86;
    const a = r() * Math.PI * 2;
    const k = Math.sqrt(Math.max(0, 1 - z * z));
    spots.push({
      pos: [Math.cos(a) * k * 1.03, z * 1.03, Math.sin(a) * k * 1.03],
      scale: (0.055 + r() * 0.05) * LIGHT_SCALE_MULT[variant],
      cool: hasLab && r() < 0.22, // a science quarter glows cooler
    });
  }
  return spots;
}

/**
 * Warm settlement glows on the surface. Mount INSIDE the rotating planet
 * mesh so the lights turn with the world they're built on.
 */
export function SettlementLights({
  record,
  variant,
}: {
  record: CompletedPlanetRecord;
  variant: CivilizationVariant;
}) {
  // Subscribed, not read once: a world that dims (or recovers) has to change
  // on screen the moment it happens.
  const standing = useGame((g) => standingOf(g.s, record.lifetimeIndex));
  const spots = useMemo(
    () => settlementSpots(record, variant, standing),
    [record, variant, standing],
  );
  const warmMat = useMemo(() => sharedGlowSprite(WARM, 0.85), []);
  const coolMat = useMemo(() => sharedGlowSprite(COOL, 0.8), []);
  useEffect(
    () => () => {
      warmMat.dispose();
      coolMat.dispose();
    },
    [warmMat, coolMat],
  );
  return (
    <>
      {spots.map((spot, i) => (
        <sprite
          key={i}
          position={spot.pos}
          scale={[spot.scale, spot.scale, 1]}
          raycast={() => null}
        >
          <primitive object={spot.cool ? coolMat : warmMat} attach="material" />
        </sprite>
      ))}
    </>
  );
}

/** Installation sprites that survived every art pass; anything else falls
 * back to the seed probe so an unknown id never renders a broken image. */
const KNOWN_INSTALLATIONS = new Set([
  'seedProbe',
  'atmoProcessor',
  'hydroSeeder',
  'geoTap',
  'bioDome',
  'researchLab',
  'orbitalMirror',
  'marvin',
  'quantumExcavator',
  'temporalCompressor',
  'deepThought',
  'stellarForge',
  'heartOfGold',
  'magratheanWorkshop',
]);

/**
 * The world's recorded hardware, still on station: each installation from
 * the delivery snapshot orbits on its own slightly inclined track. Mount as
 * a SIBLING of the planet mesh (world-local space, planet radius 1).
 */
export function OrbitalHardware({
  record,
  variant,
}: {
  record: CompletedPlanetRecord;
  variant: CivilizationVariant;
}) {
  const rig = useRef<Group>(null);
  const ids = useMemo(
    () =>
      record.installations
        .filter((id) => KNOWN_INSTALLATIONS.has(id))
        .slice(0, INSTALL_CAP[variant]),
    [record, variant],
  );
  const seeds = useMemo(() => {
    const r = mulberry((record.seed ^ 0x0b17) >>> 0);
    return ids.map((_, i) => ({
      radius: 1.65 + i * 0.34 + r() * 0.12,
      phase: i * GOLDEN + r() * 0.6,
      speed: (0.22 / (1 + i * 0.45)) * (r() < 0.25 ? -1 : 1),
      tilt: (r() - 0.5) * 0.55,
      scale: variant === 'closeup' ? 0.36 : 0.42,
    }));
  }, [ids, record.seed, variant]);
  const mats = useMemo(
    () => ids.map((id) => sharedTexSprite(SCENE_SPRITES.installation(id))),
    [ids],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  const sprites = useRef<(Sprite | null)[]>([]);

  useFrame((state) => {
    const t = universeMotion.reduced ? 0 : state.clock.elapsedTime;
    seeds.forEach((o, i) => {
      const sprite = sprites.current[i];
      if (!sprite) return;
      const a = o.phase + t * o.speed;
      sprite.position.set(
        Math.cos(a) * o.radius,
        Math.sin(a) * o.radius * 0.28 + Math.sin(a * 0.5) * o.tilt,
        Math.sin(a) * o.radius * 0.72,
      );
    });
  });

  if (ids.length === 0) return null;
  return (
    <group ref={rig}>
      {ids.map((id, i) => (
        <sprite
          key={`${id}-${i}`}
          ref={(el) => {
            sprites.current[i] = el;
          }}
          scale={[seeds[i]!.scale, seeds[i]!.scale, 1]}
          raycast={() => null}
        >
          <primitive object={mats[i]!} attach="material" />
        </sprite>
      ))}
    </group>
  );
}

/**
 * Close-up-only life: a shuttle on a launch → orbit → landing cycle, a
 * pulsing harbor beacon, and the pet asteroid for worlds that kept one.
 */
export function CloseupLife({ record }: { record: CompletedPlanetRecord }) {
  const shuttle = useRef<Sprite>(null);
  const beacon = useRef<Sprite>(null);
  const pet = useRef<Sprite>(null);
  const hasPet = record.quirks.includes('pet-asteroid');
  const seeds = useMemo(() => {
    const r = mulberry((record.seed ^ 0x5417) >>> 0);
    const site = (): Vector3 => {
      const z = (r() * 2 - 1) * 0.8;
      const a = r() * Math.PI * 2;
      const k = Math.sqrt(Math.max(0, 1 - z * z));
      return new Vector3(Math.cos(a) * k, z, Math.sin(a) * k);
    };
    return { a: site(), b: site(), period: 10 + r() * 5, phase: r() * 20 };
  }, [record.seed]);
  const shuttleMat = useMemo(() => sharedTexSprite(SCENE_SPRITES.traffic.courier), []);
  const beaconMat = useMemo(() => sharedGlowSprite(0xaef2c8, 0.9), []);
  const petMat = useMemo(() => sharedTexSprite(SCENE_SPRITES.misc.petAsteroid), []);
  useEffect(
    () => () => {
      shuttleMat.dispose();
      beaconMat.dispose();
      petMat.dispose();
    },
    [shuttleMat, beaconMat, petMat],
  );
  const V = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    const t = universeMotion.reduced ? 0 : state.clock.elapsedTime;
    const s = shuttle.current;
    if (s) {
      if (universeMotion.reduced) {
        s.visible = false;
      } else {
        // One commute per period: up from site A, an arc, down at site B.
        const u = ((t + seeds.phase) % seeds.period) / seeds.period;
        if (u < 0.72) {
          const k = u / 0.72;
          const lift = 1.06 + Math.sin(Math.PI * k) * 0.85;
          V.copy(seeds.a).lerp(seeds.b, k * k * (3 - 2 * k)).normalize().multiplyScalar(lift);
          s.position.copy(V);
          s.visible = true;
        } else {
          s.visible = false; // turnaround at the harbor
        }
      }
    }
    const b = beacon.current;
    if (b) {
      const pulse = universeMotion.reduced ? 0.8 : 0.65 + Math.sin(t * 2.1) * 0.35;
      b.scale.setScalar(0.11 * pulse);
    }
    const p = pet.current;
    if (p && !universeMotion.reduced) {
      const a = t * 0.11 + 2.1;
      p.position.set(Math.cos(a) * 2.5, Math.sin(t * 0.4) * 0.3, Math.sin(a) * 2.5);
    }
  });

  return (
    <>
      <sprite ref={shuttle} scale={[0.24, 0.24, 1]} raycast={() => null}>
        <primitive object={shuttleMat} attach="material" />
      </sprite>
      <sprite
        ref={beacon}
        position={seeds.a.clone().multiplyScalar(1.08)}
        raycast={() => null}
      >
        <primitive object={beaconMat} attach="material" />
      </sprite>
      {hasPet && (
        <sprite ref={pet} scale={[0.3, 0.3, 1]} raycast={() => null}>
          <primitive object={petMat} attach="material" />
        </sprite>
      )}
    </>
  );
}

// ————— Shuttle traffic between the worlds of a system —————

const SHUTTLE_TEXTURES = [
  SCENE_SPRITES.traffic.courier,
  SCENE_SPRITES.traffic.tug,
  SCENE_SPRITES.traffic.surveyor,
] as const;

export interface ShuttleLaneSpec {
  /** Write world `slot`'s CURRENT local position at clock `t` into `out`. */
  worldPos: (slot: number, t: number, out: Vector3) => void;
  worldCount: number;
  /** Ships on duty (the empire's busyness, decided by the caller). */
  ships: number;
  seed: number;
  /** Sprite scale in local units. */
  scale: number;
}

/**
 * Small craft commuting between the worlds of one system. Mount in the SAME
 * local space the world positions are expressed in (e.g. inside the spin
 * group of a visited system), so endpoints stay exact while everything turns.
 */
export function SystemShuttles({ spec }: { spec: ShuttleLaneSpec }) {
  const routes = useMemo(() => {
    const r = mulberry((spec.seed ^ 0x7a1f) >>> 0);
    return Array.from({ length: Math.min(spec.ships, 4) }, () => {
      const a = Math.floor(r() * spec.worldCount);
      let b = Math.floor(r() * (spec.worldCount - 1));
      if (b >= a) b += 1;
      return {
        a,
        b,
        period: 16 + r() * 10,
        phase: r() * 40,
        lift: 0.14 + r() * 0.2,
        tex: SHUTTLE_TEXTURES[Math.floor(r() * SHUTTLE_TEXTURES.length)]!,
      };
    });
  }, [spec.seed, spec.ships, spec.worldCount]);
  const mats = useMemo(() => routes.map((route) => sharedTexSprite(route.tex)), [routes]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  const sprites = useRef<(Sprite | null)[]>([]);
  const A = useMemo(() => new Vector3(), []);
  const B = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    const t = universeMotion.reduced ? 0 : state.clock.elapsedTime;
    routes.forEach((route, i) => {
      const sprite = sprites.current[i];
      if (!sprite) return;
      if (universeMotion.reduced) {
        sprite.visible = false;
        return;
      }
      const u = ((t + route.phase) % route.period) / route.period;
      // Out on the first leg, home on the second, brief harbor stops between.
      let k: number;
      let from = route.a;
      let to = route.b;
      if (u < 0.44) k = u / 0.44;
      else if (u < 0.5) k = 1;
      else if (u < 0.94) {
        from = route.b;
        to = route.a;
        k = (u - 0.5) / 0.44;
      } else {
        from = route.b;
        to = route.a;
        k = 1;
      }
      const e = k * k * (3 - 2 * k);
      spec.worldPos(from, t, A);
      spec.worldPos(to, t, B);
      sprite.position.copy(A).lerp(B, e);
      sprite.position.y += Math.sin(Math.PI * e) * route.lift;
      sprite.visible = true;
    });
  });

  if (spec.worldCount < 2) return null;
  return (
    <>
      {routes.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            sprites.current[i] = el;
          }}
          scale={[spec.scale, spec.scale, 1]}
          raycast={() => null}
        >
          <primitive object={mats[i]!} attach="material" />
        </sprite>
      ))}
    </>
  );
}
