import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Sprite, SpriteMaterial, Vector3 } from 'three/webgpu';
import { useGame } from '../../state/store';
import { mulberry } from '../../engine/rng';
import { CURRENT_SYSTEM_ANCHOR, galaxyPosition, systemGlyphPosition } from './universeLayout';
import { SCENE_SPRITES } from '../assets';
import { sceneTex } from './spriteTextures';

const MAX_SHIPS = 30;
const P = new Vector3();
const NEXT = new Vector3();
const DIR = new Vector3();
const S1 = new Vector3();
const S2 = new Vector3();

/** The merchant classes of the civilization you built (SPRITE_MANIFEST.md §B). */
const CLASSES = [
  { url: SCENE_SPRITES.traffic.hauler, scale: 0.44 },
  { url: SCENE_SPRITES.traffic.tanker, scale: 0.4 },
  { url: SCENE_SPRITES.traffic.courier, scale: 0.3, trail: true },
  { url: SCENE_SPRITES.traffic.liner, scale: 0.48 },
  { url: SCENE_SPRITES.traffic.tug, scale: 0.42 },
  { url: SCENE_SPRITES.traffic.surveyor, scale: 0.34 },
] as const;

interface Route {
  a: Vector3;
  b: Vector3;
  speed: number;
  phase: number;
  bulge: number;
  scale: number;
  trail: boolean;
  mat: SpriteMaterial;
  trailMat: SpriteMaterial | null;
}

/**
 * Interstellar traffic: freighters, tankers, liners, and one impatient
 * courier class running the routes of the civilization you built. Density
 * and class mix grow with worlds, systems, and galaxies. Purely decorative,
 * purely derived — the schedule and the shipping manifest are seeded.
 */
export function Traffic() {
  const counts = useGame(
    (g) => `${g.s.run.completedPlanets.length}:${g.s.run.systems}:${g.s.run.galaxies}`,
  );
  const [planetsStr, systemsStr, galaxiesStr] = counts.split(':') as [string, string, string];
  const planets = Number(planetsStr);
  const systems = Number(systemsStr);
  const galaxies = Number(galaxiesStr);
  const masterSeed = useGame.getState().s.seed;

  const routes = useMemo<Route[]>(() => {
    if (planets === 0) return [];
    const endpoints: Vector3[] = [new Vector3(0, 0, 0), CURRENT_SYSTEM_ANCHOR.clone()];
    for (let i = Math.max(0, systems - 24); i < systems; i++) {
      endpoints.push(systemGlyphPosition(i, masterSeed));
    }
    // Long-haul lines to the galaxies: commerce follows the terraformers.
    for (let i = Math.max(0, galaxies - 6); i < galaxies; i++) {
      endpoints.push(galaxyPosition(i, masterSeed));
    }
    const shipCount = Math.min(MAX_SHIPS, 2 + planets * 2 + systems * 3 + galaxies * 2);
    const r = mulberry((masterSeed ^ 0x7fa11c) >>> 0);
    return Array.from({ length: shipCount }, (_, i) => {
      const ai = Math.floor(r() * endpoints.length);
      let bi = Math.floor(r() * endpoints.length);
      if (bi === ai) bi = (bi + 1) % endpoints.length;
      const cls = CLASSES[Math.floor(r() * CLASSES.length)]!;
      const trail = 'trail' in cls && cls.trail === true;
      return {
        a: endpoints[ai]!.clone(),
        b: endpoints[bi]!.clone(),
        speed: 0.028 + r() * 0.05,
        phase: r() + i * 0.13,
        bulge: 0.4 + r() * 1.4,
        scale: cls.scale,
        trail,
        mat: new SpriteMaterial({ map: sceneTex(cls.url), transparent: true, depthWrite: false }),
        trailMat: trail
          ? new SpriteMaterial({
              map: sceneTex(SCENE_SPRITES.fx.sparkStreak),
              color: 0xbfe0ff,
              transparent: true,
              blending: AdditiveBlending,
              depthWrite: false,
            })
          : null,
      };
    });
  }, [planets, systems, galaxies, masterSeed]);

  const shipRefs = useRef<(Sprite | null)[]>([]);
  const trailRefs = useRef<(Sprite | null)[]>([]);

  useFrame((state) => {
    if (routes.length === 0) return;
    const t = state.clock.elapsedTime;
    const w = state.size.width;
    const h = state.size.height;
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i]!;
      const sp = shipRefs.current[i];
      if (!sp) continue;
      const k = (route.phase + t * route.speed) % 1;
      const arcAt = (kk: number) => Math.sin(kk * Math.PI) * route.bulge;
      P.copy(route.a).lerp(route.b, k);
      P.y += arcAt(k);
      const ahead = Math.min(1, k + 0.01);
      NEXT.copy(route.a).lerp(route.b, ahead);
      NEXT.y += arcAt(ahead);
      DIR.copy(NEXT).sub(P).normalize();
      sp.position.copy(P);

      // Point the hull along its screen-space heading; ships flying left are
      // mirrored so nobody hauls cargo upside-down.
      S1.copy(P).project(state.camera);
      S2.copy(NEXT).project(state.camera);
      const ang = Math.atan2((S2.y - S1.y) * h, (S2.x - S1.x) * w);
      const mirror = Math.cos(ang) < 0;
      route.mat.rotation = mirror ? ang - Math.PI : ang;
      const vis = Math.min(1, Math.min(k, 1 - k) * 8);
      route.mat.opacity = vis * 0.95;
      sp.scale.set(mirror ? -route.scale : route.scale, route.scale, 1);

      const tr = trailRefs.current[i];
      if (tr && route.trailMat) {
        tr.position.copy(P).addScaledVector(DIR, -0.26);
        route.trailMat.rotation = route.mat.rotation;
        route.trailMat.opacity = vis * 0.7;
        tr.scale.set(mirror ? -0.5 : 0.5, 0.13, 1);
      }
    }
  });

  if (routes.length === 0) return null;
  return (
    <group>
      {routes.map((route, i) => (
        <group key={i}>
          <sprite
            ref={(el) => {
              shipRefs.current[i] = el;
            }}
            raycast={() => null}
          >
            <primitive object={route.mat} attach="material" />
          </sprite>
          {route.trailMat && (
            <sprite
              ref={(el) => {
                trailRefs.current[i] = el;
              }}
              raycast={() => null}
            >
              <primitive object={route.trailMat} attach="material" />
            </sprite>
          )}
        </group>
      ))}
    </group>
  );
}
