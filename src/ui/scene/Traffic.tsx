import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { useGame } from '../../state/store';
import { mulberry } from '../../engine/rng';
import { CURRENT_SYSTEM_ANCHOR, galaxyPosition, systemGlyphPosition } from './universeLayout';

const MAX_SHIPS = 44;
const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const DIR = new Vector3();
const NEXT = new Vector3();
const SCALE = new Vector3();
const Z_AXIS = new Vector3(0, 0, 1);

interface Route {
  a: Vector3;
  b: Vector3;
  speed: number;
  phase: number;
  bulge: number;
}

/**
 * Interstellar traffic: freighters running the routes of the civilization
 * you built. Density grows with worlds and systems. Purely decorative,
 * purely derived — the schedule is seeded, never saved.
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
      return {
        a: endpoints[ai]!.clone(),
        b: endpoints[bi]!.clone(),
        speed: 0.028 + r() * 0.05,
        phase: r() + i * 0.13,
        bulge: 0.4 + r() * 1.4,
      };
    });
  }, [planets, systems, galaxies, masterSeed]);

  const mesh = useRef<InstancedMesh>(null);

  useFrame((state) => {
    const im = mesh.current;
    if (!im || routes.length === 0) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i]!;
      const raw = (route.phase + t * route.speed) % 1;
      const k = raw;
      const arc = Math.sin(k * Math.PI) * route.bulge;
      P.copy(route.a).lerp(route.b, k);
      P.y += arc;
      // Point the streak along its direction of travel.
      NEXT.copy(route.a).lerp(route.b, Math.min(1, k + 0.01));
      NEXT.y += Math.sin(Math.min(1, k + 0.01) * Math.PI) * route.bulge;
      DIR.copy(NEXT).sub(P).normalize();
      Q.setFromUnitVectors(Z_AXIS, DIR);
      // Fade-in/out at endpoints by scaling the streak.
      const vis = Math.min(1, Math.min(k, 1 - k) * 8);
      SCALE.set(vis, vis, vis);
      M.compose(P, Q, SCALE);
      im.setMatrixAt(i, M);
    }
    im.count = routes.length;
    im.instanceMatrix.needsUpdate = true;
  });

  if (routes.length === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_SHIPS]} raycast={() => null}>
      <boxGeometry args={[0.012, 0.012, 0.12]} />
      <meshBasicMaterial color={0xbfe0ff} transparent opacity={0.85} />
    </instancedMesh>
  );
}
