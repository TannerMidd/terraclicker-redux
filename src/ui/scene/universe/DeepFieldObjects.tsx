/**
 * The bodies of the Deep Field.
 *
 * Every other object in this scene is something the player made. These are
 * the things that were already here — so they are deliberately built from a
 * different vocabulary: dull metal, cold plate, no settlement lights, no
 * civilization. Nothing here glows because it is thriving; it glows because
 * somebody left it switched on.
 *
 * Each body is two to four primitives. They are read at range through a glow
 * sprite and resolved up close, so silhouette matters far more than detail.
 */
import { useMemo } from 'react';
import { mulberry } from '../../../engine/rng';
import type { DeepFieldDef } from '../../../content/deepField';
import { makeGlowSprite } from './shared';
import { kitGeometryFit, kitMaterial, upliftActive } from '../uplift/upliftAssets';

/** Catalogue id → deep-field kit asset (ASSET_UPLIFT.md 5.4). */
const KIT_NAME: Record<string, string> = {
  sofa: 'sofa',
  buoy42: 'buoy42',
  nutrimatic: 'nutrimatic',
  towelDrift: 'towel-drift',
  teapot: 'teapot',
  petuniaBowl: 'petunia-bowl',
  whale: 'whale',
  generationShip: 'generation-ship',
  bArk: 'b-ark',
  improbShadow: 'improbability-shadow',
  fjordWorkshop: 'fjord-workshop',
  wicketGate: 'wicket-gate',
  coolingArray: 'cooling-array',
  signpost: 'signpost',
  milliways: 'milliways',
};

/** The hand-tuned port lamps each landmark keeps, in units of its radius. */
const KIT_LAMPS: Record<string, Array<{ at: [number, number, number]; color?: number; scale: number }>> = {
  buoy42: [{ at: [0, 1.05, 0], color: 0xffb733, scale: 2.4 }],
  nutrimatic: [{ at: [0, 0.35, 0.56], color: 0x63e0d0, scale: 1.5 }],
  generationShip: [
    { at: [1.5, 0.2, 0.3], scale: 0.5 },
    { at: [-0.4, -0.3, 0.35], color: 0x9fd0ff, scale: 0.35 },
  ],
  bArk: [{ at: [1.55, 0.1, 0], color: 0xffb066, scale: 0.55 }],
  improbShadow: [{ at: [0, 0, 0], color: 0xb98cff, scale: 2.6 }],
  fjordWorkshop: [{ at: [1.15, 0.95, 0], color: 0xbfe0ff, scale: 0.5 }],
  wicketGate: [{ at: [0, -1.3, 0.1], color: 0x8fb6ff, scale: 0.7 }],
  coolingArray: [{ at: [0, 0, 0], color: 0xd88a4a, scale: 1.4 }],
  milliways: [{ at: [0, 0, 0], color: 0xffbb66, scale: 3.4 }],
};

const HULL = 0x8b8e99;
const HULL_DARK = 0x4a4d57;
const CERAMIC = 0xdcd6c8;
const COLD = 0x6f7a8c;

/** A lit port on a derelict — the only warm thing out here. */
function Lamp({
  at,
  color = 0xffcf8a,
  scale = 0.1,
}: {
  at: [number, number, number];
  color?: number;
  scale?: number;
}) {
  const mat = useMemo(() => makeGlowSprite(color, 0.85), [color]);
  return <sprite position={at} scale={[scale, scale, 1]} material={mat} raycast={() => null} />;
}

/**
 * Bodies by id. Radius is the catalogue's half-extent, so each shape is
 * authored in units of `r` and the placement math stays in one place.
 */
export function DeepFieldBody({ def }: { def: DeepFieldDef }) {
  const r = def.radius;

  // The authored landmark (5.4): the highest narrative payoff per asset in
  // the whole pack, per the production list. Uniform-fit to the catalogue's
  // half-extent; the tuned port lamps stay. Null falls through to primitives.
  const kitGeo = useMemo(() => {
    const name = KIT_NAME[def.id];
    if (!name || !upliftActive()) return null;
    return kitGeometryFit('meshes/deep-field/deep-field-kit.glb', name, {
      mode: 'extent',
      extent: r * 2.1,
    });
  }, [def.id, r]);
  if (kitGeo) {
    return (
      <group>
        <mesh
          geometry={kitGeo}
          material={kitMaterial('deep-field', 'textures/deep-field/deep-field-atlas.ktx2', { roughness: 0.72, metalness: 0.28 })}
        />
        {(KIT_LAMPS[def.id] ?? []).map((lamp, i) => (
          <Lamp
            key={i}
            at={[lamp.at[0] * r, lamp.at[1] * r, lamp.at[2] * r]}
            color={lamp.color}
            scale={lamp.scale * r}
          />
        ))}
      </group>
    );
  }

  switch (def.id) {
    case 'sofa':
      return (
        <group>
          <mesh>
            <boxGeometry args={[r * 2, r * 0.5, r * 0.9]} />
            <meshStandardMaterial color={0x6b2b2b} roughness={0.85} />
          </mesh>
          <mesh position={[0, r * 0.42, -r * 0.34]}>
            <boxGeometry args={[r * 2, r * 0.75, r * 0.22]} />
            <meshStandardMaterial color={0x5e2525} roughness={0.85} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * r * 0.92, r * 0.3, 0]}>
              <boxGeometry args={[r * 0.22, r * 0.6, r * 0.9]} />
              <meshStandardMaterial color={0x5e2525} roughness={0.85} />
            </mesh>
          ))}
        </group>
      );

    case 'buoy42':
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[r * 0.28, r * 0.34, r * 1.7, 8]} />
            <meshStandardMaterial color={HULL} roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0, r * 1.05, 0]}>
            <sphereGeometry args={[r * 0.3, 10, 8]} />
            <meshStandardMaterial color={0xffc14d} emissive={0xffa020} emissiveIntensity={1.6} />
          </mesh>
          <Lamp at={[0, r * 1.05, 0]} color={0xffb733} scale={r * 2.4} />
        </group>
      );

    case 'nutrimatic':
      return (
        <group>
          <mesh>
            <boxGeometry args={[r * 1.1, r * 1.6, r * 0.9]} />
            <meshStandardMaterial color={HULL_DARK} roughness={0.7} metalness={0.35} />
          </mesh>
          <mesh position={[0, r * 0.35, r * 0.5]}>
            <boxGeometry args={[r * 0.75, r * 0.5, r * 0.08]} />
            <meshStandardMaterial color={0x2b6f6a} emissive={0x1d5f58} emissiveIntensity={0.9} />
          </mesh>
          <Lamp at={[0, r * 0.35, r * 0.56]} color={0x63e0d0} scale={r * 1.5} />
        </group>
      );

    case 'towelDrift':
      return (
        <mesh rotation={[0.4, 0.2, 0.7]}>
          <boxGeometry args={[r * 1.8, r * 0.14, r * 1.2]} />
          <meshStandardMaterial color={0x63a7c8} roughness={1} />
        </mesh>
      );

    case 'teapot':
      return (
        <group>
          <mesh>
            <sphereGeometry args={[r, 12, 10]} />
            <meshStandardMaterial color={CERAMIC} roughness={0.35} />
          </mesh>
          <mesh position={[-r * 1.05, r * 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r * 0.45, r * 0.11, 6, 12]} />
            <meshStandardMaterial color={CERAMIC} roughness={0.35} />
          </mesh>
          <mesh position={[r * 0.95, r * 0.15, 0]} rotation={[0, 0, -0.6]}>
            <coneGeometry args={[r * 0.22, r * 0.7, 8]} />
            <meshStandardMaterial color={CERAMIC} roughness={0.35} />
          </mesh>
        </group>
      );

    case 'petuniaBowl':
      return (
        <group>
          <mesh rotation={[Math.PI, 0, 0]}>
            <sphereGeometry args={[r, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <meshStandardMaterial color={0xb9814f} roughness={0.7} side={2} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = i * 1.257;
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * r * 0.45, r * 0.35, Math.sin(a) * r * 0.45]}
              >
                <sphereGeometry args={[r * 0.2, 8, 6]} />
                <meshStandardMaterial color={0xd97fb8} emissive={0x7a3060} emissiveIntensity={0.5} />
              </mesh>
            );
          })}
        </group>
      );

    case 'whale':
      return (
        <group>
          <mesh scale={[1.9, 0.72, 0.72]}>
            <sphereGeometry args={[r, 16, 12]} />
            <meshStandardMaterial color={0x5c6b8c} roughness={0.85} />
          </mesh>
          <mesh position={[-r * 2, 0, 0]} rotation={[0, 0, 0.5]}>
            <boxGeometry args={[r * 0.7, r * 0.08, r * 1.1]} />
            <meshStandardMaterial color={0x4c5877} roughness={0.9} />
          </mesh>
          <mesh position={[r * 1.4, r * 0.22, r * 0.3]}>
            <sphereGeometry args={[r * 0.09, 6, 6]} />
            <meshStandardMaterial color={0x101018} />
          </mesh>
        </group>
      );

    case 'generationShip':
      return (
        <group rotation={[0, 0, 0.14]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[r * 0.36, r * 0.36, r * 3.4, 12]} />
            <meshStandardMaterial color={HULL} roughness={0.55} metalness={0.5} />
          </mesh>
          <mesh position={[r * 0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[r * 0.95, r * 0.13, 8, 20]} />
            <meshStandardMaterial color={HULL_DARK} roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[-r * 1.8, 0, 0]}>
            <cylinderGeometry args={[r * 0.5, r * 0.28, r * 0.5, 10]} />
            <meshStandardMaterial color={HULL_DARK} roughness={0.7} metalness={0.4} />
          </mesh>
          <Lamp at={[r * 1.5, r * 0.2, r * 0.3]} scale={r * 0.5} />
          <Lamp at={[-r * 0.4, -r * 0.3, r * 0.35]} color={0x9fd0ff} scale={r * 0.35} />
        </group>
      );

    case 'bArk':
      return (
        <group rotation={[0.1, 0, -0.08]}>
          <mesh>
            <boxGeometry args={[r * 3.2, r * 0.7, r * 0.9]} />
            <meshStandardMaterial color={0x7d7466} roughness={0.75} metalness={0.3} />
          </mesh>
          {[-1, 0, 1].map((i) => (
            <mesh key={i} position={[i * r * 0.9, -r * 0.55, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[r * 0.26, r * 0.26, r * 0.5, 8]} />
              <meshStandardMaterial color={HULL_DARK} roughness={0.7} metalness={0.4} />
            </mesh>
          ))}
          <Lamp at={[r * 1.55, r * 0.1, 0]} color={0xffb066} scale={r * 0.55} />
        </group>
      );

    case 'improbShadow':
      // No solid body: a fault in the sky, not an object in it.
      return (
        <group>
          <mesh>
            <icosahedronGeometry args={[r * 0.85, 1]} />
            <meshStandardMaterial
              color={0x9a6fd0}
              emissive={0x5b2f9a}
              emissiveIntensity={0.7}
              transparent
              opacity={0.16}
              wireframe
            />
          </mesh>
          <Lamp at={[0, 0, 0]} color={0xb98cff} scale={r * 2.6} />
        </group>
      );

    case 'fjordWorkshop':
      return (
        <group rotation={[0.2, 0.5, 0]}>
          <mesh>
            <boxGeometry args={[r * 2.4, r * 0.12, r * 1.7]} />
            <meshStandardMaterial color={COLD} roughness={0.7} metalness={0.3} />
          </mesh>
          {/* The coastline on the gantry: unfinished, award-winning. */}
          <mesh position={[0, r * 0.16, 0]}>
            <boxGeometry args={[r * 1.7, r * 0.16, r * 1.1]} />
            <meshStandardMaterial color={0x3f6f5c} roughness={0.95} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * r * 1.15, r * 0.5, 0]}>
              <boxGeometry args={[r * 0.14, r * 0.9, r * 0.14]} />
              <meshStandardMaterial color={HULL_DARK} roughness={0.6} metalness={0.5} />
            </mesh>
          ))}
          <Lamp at={[r * 1.15, r * 0.95, 0]} color={0xbfe0ff} scale={r * 0.5} />
        </group>
      );

    case 'wicketGate':
      return (
        <group>
          {/* A wall with no ends. The plane is far larger than the body. */}
          <mesh>
            <boxGeometry args={[r * 7, r * 4.4, r * 0.06]} />
            <meshStandardMaterial
              color={0x2a2f3d}
              roughness={0.95}
              transparent
              opacity={0.72}
              side={2}
            />
          </mesh>
          <mesh position={[0, -r * 1.3, 0]}>
            <boxGeometry args={[r * 0.55, r * 0.9, r * 0.12]} />
            <meshStandardMaterial color={0x111520} roughness={1} />
          </mesh>
          <Lamp at={[0, -r * 1.3, r * 0.1]} color={0x8fb6ff} scale={r * 0.7} />
        </group>
      );

    case 'coolingArray':
      return (
        <group rotation={[0.3, 0, 0.2]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[r * 0.14, r * 0.14, r * 3.4, 8]} />
            <meshStandardMaterial color={HULL_DARK} roughness={0.6} metalness={0.6} />
          </mesh>
          {[-1.2, -0.4, 0.4, 1.2].map((z, i) => (
            <mesh key={z} position={[0, 0, z * r]} rotation={[0, 0, i * 0.4]}>
              <torusGeometry args={[r * (0.95 - Math.abs(z) * 0.18), r * 0.09, 6, 18]} />
              <meshStandardMaterial
                color={0x5d5148}
                emissive={0x7a3a12}
                emissiveIntensity={0.22}
                roughness={0.78}
                metalness={0.35}
              />
            </mesh>
          ))}
          <Lamp at={[0, 0, 0]} color={0xd88a4a} scale={r * 1.4} />
        </group>
      );

    case 'signpost':
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[r * 0.07, r * 0.07, r * 2.4, 6]} />
            <meshStandardMaterial color={0x77716a} roughness={0.9} />
          </mesh>
          <mesh position={[r * 0.5, r * 0.95, 0]}>
            <boxGeometry args={[r * 1.1, r * 0.3, r * 0.06]} />
            <meshStandardMaterial color={0x8d867c} roughness={0.9} />
          </mesh>
        </group>
      );

    case 'milliways':
      return (
        <group rotation={[0.5, 0, 0.1]}>
          <mesh>
            <cylinderGeometry args={[r, r * 0.75, r * 0.28, 24]} />
            <meshStandardMaterial
              color={0x2a2233}
              emissive={0x6b4a2a}
              emissiveIntensity={0.5}
              roughness={0.5}
              metalness={0.4}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r * 1.25, r * 0.05, 6, 32]} />
            <meshStandardMaterial color={0xffca7a} emissive={0xffa848} emissiveIntensity={1.4} />
          </mesh>
          <Lamp at={[0, 0, 0]} color={0xffbb66} scale={r * 3.4} />
        </group>
      );

    default:
      return (
        <mesh>
          <icosahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color={HULL} roughness={0.8} metalness={0.3} />
        </mesh>
      );
  }
}

/** Seeded idle tumble, so nothing out there is perfectly still. */
export function tumbleFor(def: DeepFieldDef): {
  rate: [number, number, number];
  phase: [number, number, number];
} {
  const r = mulberry((def.id.length * 0x9e37 + def.radius * 1000) >>> 0);
  const slow = def.radius > 2 ? 0.35 : 1;
  return {
    rate: [
      (r() - 0.5) * 0.06 * slow,
      (0.02 + r() * 0.07) * slow,
      (r() - 0.5) * 0.04 * slow,
    ],
    phase: [r() * 6.28, r() * 6.28, r() * 6.28],
  };
}
