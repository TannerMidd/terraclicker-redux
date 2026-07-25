/**
 * The sky a delivered world keeps.
 *
 * The hero planet has always had a cloud deck and an atmospheric rim; a world
 * you finished had neither, so the moment it left your commission it went
 * from a living planet to a painted marble. That reads as a downgrade for
 * doing well, which is exactly backwards — a delivered world is supposed to
 * be the one that made it.
 *
 * Two shells, both shared instances (a revealed system mounts five worlds at
 * once, and a material per world is a shader link per world, mid-flight):
 *
 *   clouds  ×1.045 — weather, drifting, with storms that build and break
 *   air     ×1.16  — a fresnel rim, tinted by planet type
 *
 * Variety comes from the MESH, not the material: each world spins its deck at
 * its own rate from its own starting angle, so two ocean worlds side by side
 * never show the same front twice.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BackSide,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  type Mesh,
} from 'three/webgpu';
import {
  abs,
  cameraPosition,
  dot,
  float,
  mx_fractal_noise_float,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  sub,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import { paletteFor } from '../planetMaterial';
import { mulberry } from '../../../engine/rng';
import type { CompletedPlanetRecord, PlanetType } from '../../../engine/types';
import { universeMotion } from './operationsVisual';

type V = Parameters<typeof mx_fractal_noise_float>[0];

/**
 * Weather. Two bands drifting at different rates and directions, so fronts
 * form and break up rather than sliding past as one rigid sheet, plus a
 * sparser, denser band for storms. Local position, not world: these worlds
 * orbit, and a world-space pattern would have the weather swim across the
 * surface as the planet travels.
 */
function createCloudMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  const p = normalize(positionLocal);
  const drift = time.mul(0.016);

  const n1 = mx_fractal_noise_float(
    p.mul(3.2).add(vec3(drift, 0, drift.mul(0.6))) as unknown as V,
    3,
    2.2,
    0.55,
    1,
  );
  const n2 = mx_fractal_noise_float(
    p.mul(7.6).add(vec3(drift.mul(-1.9), drift.mul(0.5), 0)) as unknown as V,
    2,
    2.4,
    0.5,
    1,
  );
  const cover = n1.mul(0.64).add(n2.mul(0.36)).mul(0.5).add(0.5);

  // Storms: rarer, tighter, and slower moving than the general cover.
  const stormField = mx_fractal_noise_float(
    p.mul(2.1).add(vec3(drift.mul(0.45), drift.mul(-0.25), 0)) as unknown as V,
    2,
    2.3,
    0.5,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const storm = smoothstep(0.66, 0.82, stormField);

  mat.colorNode = vec3(1, 1, 1);
  mat.opacityNode = smoothstep(0.5, 0.74, cover)
    .mul(0.5)
    .add(storm.mul(0.4)) as unknown as typeof mat.opacityNode;
  mat.roughnessNode = float(1) as unknown as typeof mat.roughnessNode;
  mat.transparent = true;
  mat.depthWrite = false;
  return mat;
}

const CLOUD_MATERIAL = createCloudMaterial();

/** Atmospheric rim. Type-driven hue, so an ice world's sky is not an ocean's. */
const airCache = new Map<PlanetType, MeshBasicNodeMaterial>();

function airMaterial(type: PlanetType): MeshBasicNodeMaterial {
  let mat = airCache.get(type);
  if (mat) return mat;
  // `atmosphere` is the one palette entry that is not seed-jittered, so a
  // single material per type is exactly right rather than an approximation.
  // The hue is a uniform rather than a literal so all six types still share
  // one compiled shader (see createPlanetMaterial).
  const pal = paletteFor(type, 0);
  mat = new MeshBasicNodeMaterial();
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const rim = pow(sub(1.0, abs(dot(normalWorld, viewDir))), 2.6);
  mat.colorNode = uniform(pal.atmosphere).mul(rim).mul(0.85);
  mat.side = BackSide;
  mat.transparent = true;
  mat.blending = AdditiveBlending;
  mat.depthWrite = false;
  airCache.set(type, mat);
  return mat;
}

/** Drop inside a settled world's group, as a sibling of its surface mesh. */
export function SettledAtmosphere({ record }: { record: CompletedPlanetRecord }) {
  const clouds = useRef<Mesh>(null);
  const spin = useMemo(() => {
    const r = mulberry((record.seed ^ 0x5c1e) >>> 0);
    return { phase: r() * Math.PI * 2, speed: 0.035 + r() * 0.05, tilt: (r() - 0.5) * 0.5 };
  }, [record.seed]);

  useFrame((state) => {
    const m = clouds.current;
    if (!m) return;
    const t = universeMotion.reduced ? 0 : state.clock.elapsedTime;
    m.rotation.y = spin.phase + t * spin.speed;
    m.rotation.z = spin.tilt;
  });

  return (
    <>
      <mesh ref={clouds} scale={1.045} material={CLOUD_MATERIAL} raycast={() => null}>
        <icosahedronGeometry args={[1, 3]} />
      </mesh>
      <mesh scale={1.16} material={airMaterial(record.type)} raycast={() => null}>
        <icosahedronGeometry args={[1, 3]} />
      </mesh>
    </>
  );
}
