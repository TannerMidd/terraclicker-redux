import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Sprite, SpriteMaterial, Vector3 } from 'three/webgpu';
import { useGame } from '../../state/store';
import { mulberry } from '../../engine/rng';
import { CURRENT_SYSTEM_ANCHOR, galaxyPosition, systemGlyphPosition } from './universeLayout';
import { SCENE_SPRITES } from '../assets';
import { sceneTex } from './spriteTextures';
import { useUiBus } from '../fx/uiBus';
import { flightTrafficCount, screenAwareSpriteScale } from './trafficMath';

const FLIGHT_DRAW_RANGE = 320;
const P = new Vector3();
const NEXT = new Vector3();
const DIR = new Vector3();
const S1 = new Vector3();
const S2 = new Vector3();

/** Merchant silhouettes and their intended apparent height in pixels. */
const CLASSES = [
  { url: SCENE_SPRITES.traffic.hauler, pixels: 23 },
  { url: SCENE_SPRITES.traffic.tanker, pixels: 22 },
  { url: SCENE_SPRITES.traffic.courier, pixels: 17, trail: true },
  { url: SCENE_SPRITES.traffic.liner, pixels: 27 },
  { url: SCENE_SPRITES.traffic.tug, pixels: 20 },
  { url: SCENE_SPRITES.traffic.surveyor, pixels: 18 },
] as const;

interface Hub {
  at: Vector3;
  radius: number;
}

interface Route {
  a: Vector3;
  b: Vector3;
  speed: number;
  phase: number;
  bulge: number;
  pixels: number;
  trail: boolean;
  mat: SpriteMaterial;
  trailMat: SpriteMaterial | null;
}

function aroundHub(hub: Hub, angle: number, radius: number, y: number): Vector3 {
  return hub.at.clone().add(new Vector3(
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius,
  ));
}

/**
 * Interstellar traffic: a bounded population of local service loops and long
 * haul routes. Every visible hub receives local craft before more long routes
 * are added, so the player sees a living place rather than ships spread thin
 * across the entire coordinate space.
 */
export function Traffic() {
  const counts = useGame(
    (game) => `${game.s.run.completedPlanets.length}:${game.s.run.systems}:${game.s.run.galaxies}`,
  );
  const flight = useUiBus((bus) => bus.flightMode);
  const [planetsStr, systemsStr, galaxiesStr] = counts.split(':') as [string, string, string];
  const planets = Number(planetsStr);
  const systems = Number(systemsStr);
  const galaxies = Number(galaxiesStr);
  const masterSeed = useGame.getState().s.seed;

  const routes = useMemo<Route[]>(() => {
    const shipCount = flightTrafficCount(planets, systems, galaxies);
    if (shipCount === 0) return [];

    const hubs: Hub[] = [
      { at: new Vector3(0, 0, 0), radius: 5.5 },
      { at: CURRENT_SYSTEM_ANCHOR.clone(), radius: 7.5 },
    ];
    for (let i = Math.max(0, systems - 24); i < systems; i++) {
      hubs.push({ at: systemGlyphPosition(i, masterSeed), radius: 7 });
    }
    for (let i = Math.max(0, galaxies - 6); i < galaxies; i++) {
      hubs.push({ at: galaxyPosition(i, masterSeed), radius: 24 });
    }

    const r = mulberry((masterSeed ^ 0x7fa11c) >>> 0);
    // Most craft work short routes. At least one is assigned to every rendered
    // hub before the remainder becomes long-haul commerce.
    const localCount = Math.min(
      shipCount,
      Math.max(hubs.length, Math.ceil(shipCount * 0.74)),
    );

    return Array.from({ length: shipCount }, (_, index) => {
      const cls = CLASSES[Math.floor(r() * CLASSES.length)]!;
      const trail = 'trail' in cls && cls.trail === true;
      let a: Vector3;
      let b: Vector3;
      let speed: number;
      let bulge: number;

      if (index < localCount) {
        const hub = hubs[index % hubs.length]!;
        const angle = r() * Math.PI * 2;
        const radiusA = hub.radius * (0.42 + r() * 0.68);
        const radiusB = hub.radius * (0.42 + r() * 0.68);
        const sweep = (0.7 + r() * 1.5) * (r() < 0.5 ? -1 : 1);
        a = aroundHub(hub, angle, radiusA, (r() - 0.5) * hub.radius * 0.32);
        b = aroundHub(hub, angle + sweep, radiusB, (r() - 0.5) * hub.radius * 0.32);
        speed = 0.035 + r() * 0.045;
        bulge = hub.radius * (0.05 + r() * 0.12);
      } else {
        const ai = Math.floor(r() * hubs.length);
        let bi = Math.floor(r() * hubs.length);
        if (bi === ai) bi = (bi + 1) % hubs.length;
        a = hubs[ai]!.at.clone();
        b = hubs[bi]!.at.clone();
        speed = 0.018 + r() * 0.035;
        bulge = 0.7 + r() * 2.4;
      }

      return {
        a,
        b,
        speed,
        phase: r() + index * 0.13,
        bulge,
        pixels: cls.pixels,
        trail,
        mat: new SpriteMaterial({
          map: sceneTex(cls.url),
          transparent: true,
          depthWrite: false,
        }),
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

  useEffect(() => () => {
    routes.forEach((route) => {
      route.mat.dispose();
      route.trailMat?.dispose();
    });
  }, [routes]);

  const shipRefs = useRef<(Sprite | null)[]>([]);
  const trailRefs = useRef<(Sprite | null)[]>([]);

  useFrame((state) => {
    if (routes.length === 0) return;
    const t = state.clock.elapsedTime;
    const width = state.size.width;
    const height = state.size.height;
    const fov = (state.camera as { fov?: number }).fov ?? 42;

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i]!;
      const sprite = shipRefs.current[i];
      if (!sprite) continue;
      const k = (route.phase + t * route.speed) % 1;
      const arcAt = (progress: number) => Math.sin(progress * Math.PI) * route.bulge;
      P.copy(route.a).lerp(route.b, k);
      P.y += arcAt(k);
      const ahead = Math.min(1, k + 0.01);
      NEXT.copy(route.a).lerp(route.b, ahead);
      NEXT.y += arcAt(ahead);
      DIR.copy(NEXT).sub(P).normalize();
      sprite.position.copy(P);

      const distance = P.distanceTo(state.camera.position);
      const inLocalRange = !flight || distance < FLIGHT_DRAW_RANGE;
      sprite.visible = inLocalRange;
      const trailSprite = trailRefs.current[i];
      if (trailSprite) trailSprite.visible = inLocalRange;
      if (!inLocalRange) continue;

      // Hull rotation follows its screen-space path. Mirroring keeps a ship
      // travelling left upright without requiring a second texture.
      S1.copy(P).project(state.camera);
      S2.copy(NEXT).project(state.camera);
      const angle = Math.atan2((S2.y - S1.y) * height, (S2.x - S1.x) * width);
      const mirror = Math.cos(angle) < 0;
      route.mat.rotation = mirror ? angle - Math.PI : angle;

      const nearFade = Math.max(0, Math.min(1, (distance - 0.25) / 0.75));
      const rangeFade = flight
        ? Math.max(0, Math.min(1, (FLIGHT_DRAW_RANGE - distance) / 50))
        : 1;
      const endpointFade = Math.min(1, Math.min(k, 1 - k) * 9);
      const visibility = nearFade * rangeFade * endpointFade;
      route.mat.opacity = visibility * 0.95;

      const targetPixels = route.pixels * (flight ? 1 : 0.68);
      const scale = screenAwareSpriteScale(
        distance,
        fov,
        height,
        targetPixels,
        0.08,
        flight ? 4.2 : 7,
      );
      sprite.scale.set(mirror ? -scale : scale, scale, 1);

      if (trailSprite && route.trailMat) {
        trailSprite.position.copy(P).addScaledVector(DIR, -scale * 0.58);
        route.trailMat.rotation = route.mat.rotation;
        route.trailMat.opacity = visibility * 0.66;
        trailSprite.scale.set(mirror ? -scale * 1.6 : scale * 1.6, scale * 0.34, 1);
      }
    }
  });

  if (routes.length === 0) return null;
  return (
    <group>
      {routes.map((route, index) => (
        <group key={index}>
          <sprite
            ref={(element) => {
              shipRefs.current[index] = element;
            }}
            raycast={() => null}
          >
            <primitive object={route.mat} attach="material" />
          </sprite>
          {route.trailMat && (
            <sprite
              ref={(element) => {
                trailRefs.current[index] = element;
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
