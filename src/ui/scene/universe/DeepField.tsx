/**
 * The Deep Field in the scene.
 *
 * Placement comes straight from the engine (a pure function of the save seed),
 * so these objects sit in exactly the same places for the whole life of a
 * universe. The rendering rule is the important part:
 *
 *   far away → an anonymous glint, no name, no silhouette
 *   closer   → the body resolves, but the console still calls it a contact
 *   scanned  → it has a name, and hovering says so
 *
 * That progression is the entire hook. You see something odd out there, you
 * go and look, and only then does the Guide have anything to say about it.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Sprite } from 'three/webgpu';
import { deepFieldSites, sitePositionAt, type DeepFieldSite } from '../../../engine/deepField';
import { isRumoured } from '../../../engine/subEtha';
import { useGame } from '../../../state/store';
import { useUiBus } from '../../fx/uiBus';
import { makeGlowSprite, inspectHandlers } from './shared';
import { DeepFieldBody, tumbleFor } from './DeepFieldObjects';

/** Beyond this the body is not drawn at all — just the glint. */
const BODY_RANGE = 46;
/** The glint fades in over this range; past it, nothing is visible. */
const GLINT_RANGE = 240;

const KIND_TINT: Record<string, number> = {
  derelict: 0x9fb4d8,
  relic: 0xd8cfae,
  phenomenon: 0xb98cff,
  structure: 0x8fd6ff,
  creature: 0x7fa8ff,
};

const KIND_NOUN: Record<string, string> = {
  derelict: 'derelict',
  relic: 'artefact',
  phenomenon: 'phenomenon',
  structure: 'structure',
  creature: 'lifesign',
};

const SITE_POS: [number, number, number] = [0, 0, 0];

function Landmark({ site }: { site: DeepFieldSite }) {
  const { def } = site;
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const glint = useRef<Sprite>(null);

  const scanned = useGame((g) => g.s.expedition.discovered[def.id] !== undefined);
  const boarded = useGame((g) => g.s.expedition.boarded[def.id] !== undefined);
  // A landmark the Sub-Etha has named holds a steadier light — you know
  // roughly what you are looking for, so you can pick it out further away.
  const rumoured = useGame((g) => !scanned && isRumoured(g.s, def.id));
  // At the helm the pointer is the steering stick, not a cursor — and the
  // console already names whatever is under the reticle.
  const flight = useUiBus((b) => b.flightMode);

  const glintMat = useMemo(
    () => makeGlowSprite(KIND_TINT[def.kind] ?? 0xffffff, 0.9),
    [def.kind],
  );
  const tumble = useMemo(() => tumbleFor(def), [def]);

  useFrame(({ camera, clock }) => {
    const g = root.current;
    if (!g) return;
    const t = clock.elapsedTime;

    // Resolved through the engine so the scene and the helm never disagree
    // about how far away dinner is (Milliways declines to be approached).
    const { x, y, z } = camera.position;
    sitePositionAt(site, x, y, z, SITE_POS);
    g.position.set(SITE_POS[0], SITE_POS[1], SITE_POS[2]);

    const d = camera.position.distanceTo(g.position);

    // The glint is a LONG-RANGE affordance only: the anonymous speck that is
    // worth a detour. Once the body is legible the glint is gone entirely —
    // these are cold junk, not shrines, and a halo over the hull would lie.
    // Scale is driven by distance rather than size so it stays a dot on screen
    // instead of swelling into a haze in front of the big structures.
    if (glint.current) {
      const vis = d < GLINT_RANGE && d > 10;
      glint.current.visible = vis;
      if (vis) {
        const closeFade = Math.min(1, (d - 10) / 24);
        // Distant things are DIM, not merely smaller. A linear fade left the
        // catalogue reading as a field of nebulae from the universe band,
        // competing with the galaxies the player actually built.
        const farFade = Math.pow(1 - Math.min(1, d / GLINT_RANGE), rumoured ? 1.15 : 1.8);
        glint.current.material.opacity =
          farFade * closeFade * (scanned ? 0.34 : rumoured ? 0.72 : 0.5);
        // Capped so it stays a point of light instead of swelling into a smear.
        const s = Math.min(2.2, (0.4 + def.radius * 0.2) * (0.6 + d * 0.09));
        glint.current.scale.set(s, s, 1);
      }
    }

    // The body resolves only when you are genuinely near it.
    if (body.current) {
      const vis = d < BODY_RANGE;
      body.current.visible = vis;
      if (vis) {
        body.current.rotation.set(
          tumble.phase[0] + t * tumble.rate[0],
          tumble.phase[1] + t * tumble.rate[1],
          tumble.phase[2] + t * tumble.rate[2],
        );
      }
    }
  });

  const title = scanned ? def.name : 'unidentified contact';
  const sub = scanned
    ? boarded
      ? `${KIND_NOUN[def.kind]} · boarded`
      : `${KIND_NOUN[def.kind]} · not yet boarded`
    : def.contact;

  return (
    <group ref={root}>
      <sprite ref={glint} material={glintMat} raycast={() => null} />
      <group ref={body}>
        {/* An invisible hull for hovering: the real bodies are too spindly. */}
        {!flight && (
          <mesh {...inspectHandlers(title, sub)}>
            <sphereGeometry args={[def.radius * 1.5, 10, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        <DeepFieldBody def={def} />
      </group>
    </group>
  );
}

export function DeepField() {
  const seed = useGame((g) => g.s.seed);
  // Ceremonies own the stage; the Deep Field politely stands down for them.
  const ceremony = useUiBus((b) => b.activeCinematic !== null);
  const sites = useMemo(() => deepFieldSites(seed), [seed]);
  if (ceremony) return null;
  return (
    <group>
      {sites.map((site) => (
        <Landmark key={site.def.id} site={site} />
      ))}
    </group>
  );
}
