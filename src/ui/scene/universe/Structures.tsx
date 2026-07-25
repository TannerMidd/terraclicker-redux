/**
 * The things you left out there: survey rigs on their seams, and the
 * megaprojects standing over the home world.
 *
 * Both exist because of the law this project keeps returning to — the
 * universe must visibly accumulate. A rig that only appeared as a row in a
 * panel would be a number pretending to be a place, and a megaproject you
 * waited eighteen hours for has to be something you can fly up to and look
 * at afterwards.
 *
 * Materials are shared instances, deliberately: these mount in batches (six
 * seams, five projects) and a material per structure is a node graph per
 * structure, which is what made the universe freeze before — see
 * settledPlanet.ts and planetMaterial.ts for the full account.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three/webgpu';
import { useGame } from '../../../state/store';
import { seamSites } from '../../../engine/freight';
import { buildProgress, isBuilding, isBuilt } from '../../../engine/megaprojects';
import { MEGAPROJECTS } from '../../../content/megaprojects';
import { SEAM_BY_ID } from '../../../content/freight';
import { inspectHandlers, sharedGlowSprite } from './shared';
import { universeMotion } from './operationsVisual';

const RIG_BODY = new MeshStandardMaterial({ color: 0x8d97a8, roughness: 0.6, metalness: 0.35 });
const RIG_WORK = new MeshBasicMaterial({ color: 0x58d68a, transparent: true, opacity: 0.9 });
const MEGA_SCAFFOLD = new MeshStandardMaterial({ color: 0x6b7488, roughness: 0.75 });
const MEGA_DONE = new MeshStandardMaterial({
  color: 0xd8c79a,
  roughness: 0.4,
  metalness: 0.5,
  emissive: new Color(0x2a2113),
});

/** One rig, turning slowly over its seam, with a working light. */
function Rig({ id, pos }: { id: string; pos: readonly [number, number, number] }) {
  const spin = useRef<Group>(null);
  const seam = SEAM_BY_ID[id];
  const glow = useMemo(() => sharedGlowSprite(0x58d68a, 0.5), []);
  const banked = useGame((g) => g.s.expedition.rigs[id]?.banked ?? 0);
  const full = seam ? banked >= seam.cap : false;

  useFrame((state, dt) => {
    if (spin.current && !universeMotion.reduced) spin.current.rotation.y += dt * 0.25;
    void state;
  });

  return (
    <group position={[pos[0], pos[1], pos[2]]}>
      <mesh
        {...inspectHandlers(
          seam?.name ?? id,
          `survey rig · ${Math.floor(banked)} salvage banked${full ? ' · full, and waiting' : ''}`,
        )}
      >
        <cylinderGeometry args={[0.5, 0.75, 2.2, 8]} />
        <primitive object={RIG_BODY} attach="material" />
      </mesh>
      <group ref={spin}>
        <mesh position={[0, 1.5, 0]} raycast={() => null}>
          <boxGeometry args={[3.4, 0.12, 0.12]} />
          <primitive object={RIG_BODY} attach="material" />
        </mesh>
        <mesh position={[0, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
          <boxGeometry args={[3.4, 0.12, 0.12]} />
          <primitive object={RIG_BODY} attach="material" />
        </mesh>
      </group>
      {/* The working light: on while it is still filling, steady when full. */}
      <mesh position={[0, 1.9, 0]} scale={full ? 0.16 : 0.11} raycast={() => null}>
        <icosahedronGeometry args={[1, 1]} />
        <primitive object={RIG_WORK} attach="material" />
      </mesh>
      <sprite scale={[3.2, 3.2, 1]} raycast={() => null}>
        <primitive object={glow} attach="material" />
      </sprite>
    </group>
  );
}

export function Rigs() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const ids = Object.keys(s.expedition.rigs);
  const sites = useMemo(() => seamSites(s.seed), [s.seed]);
  if (ids.length === 0) return null;
  return (
    <group>
      {ids.map((id) => {
        const site = sites.find((x) => x.id === id);
        if (!site) return null;
        return <Rig key={id} id={id} pos={site.pos} />;
      })}
    </group>
  );
}

/**
 * A megaproject over the home world: a scaffold that fills in as it builds,
 * and a finished structure that stays lit for good. Placed on a ring above
 * the hero planet so they are the first thing in the sky at the home band.
 */
function Megaproject({ id, index }: { id: string; index: number }) {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const def = MEGAPROJECTS.find((m) => m.id === id)!;
  const done = isBuilt(s, id);
  const progress = buildProgress(s, id);
  const root = useRef<Group>(null);

  // Close enough to the hero planet to be part of its sky rather than
  // scenery at the edge of frame: a shade outside the atmosphere shell, on a
  // ring the default framing actually contains.
  const seat = useMemo(() => {
    const a = (index / MEGAPROJECTS.length) * Math.PI * 2 + 0.4;
    return new Vector3(Math.cos(a) * 2.05, 0.45 + (index % 3) * 0.32, Math.sin(a) * 2.05);
  }, [index]);

  useFrame((state, dt) => {
    if (root.current && !universeMotion.reduced) root.current.rotation.y += dt * 0.05;
    void state;
    void dt;
  });

  // Segments appear as the build progresses, so a half-built project looks
  // half-built rather than faded.
  const segments = Math.max(1, Math.round(progress * 5));

  return (
    <group position={seat}>
      <group
        ref={root}
        {...inspectHandlers(
          def.name,
          done ? `${def.effectText} · standing` : `under construction · ${Math.floor(progress * 100)}%`,
        )}
      >
        {Array.from({ length: segments }, (_, i) => (
          <mesh key={i} position={[0, i * 0.19, 0]} raycast={() => null}>
            <boxGeometry args={[0.3 - i * 0.035, 0.17, 0.3 - i * 0.035]} />
            <primitive object={done ? MEGA_DONE : MEGA_SCAFFOLD} attach="material" />
          </mesh>
        ))}
        {/* A hit volume, since the tower itself is thin. */}
        <mesh visible={false}>
          <sphereGeometry args={[0.7, 8, 8]} />
        </mesh>
      </group>
    </group>
  );
}

export function Megaprojects() {
  const rev = useGame((g) => g.rev);
  void rev;
  const { s } = useGame.getState();
  const shown = MEGAPROJECTS.map((m, i) => ({ m, i })).filter(
    ({ m }) => isBuilt(s, m.id) || isBuilding(s, m.id),
  );
  if (shown.length === 0) return null;
  return (
    <group>
      {shown.map(({ m, i }) => (
        <Megaproject key={m.id} id={m.id} index={i} />
      ))}
    </group>
  );
}
