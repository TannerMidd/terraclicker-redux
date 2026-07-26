/**
 * The Deep Field in the scene.
 *
 * Distant contacts begin as glints, resolve into bodies on approach, and gain
 * names only after a scan. Resource seams share that navigation pipeline but
 * have a diffuse particulate silhouette so they cannot be mistaken for a
 * derelict or a solid boarding target.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  PointsMaterial,
  Sprite,
} from 'three/webgpu';
import { deepFieldSites, sitePositionAt, type DeepFieldSite } from '../../../engine/deepField';
import {
  isProspected,
  isSeamId,
  seamAsLandmark,
  seamSites,
} from '../../../engine/freight';
import { SEAM_BY_ID } from '../../../content/freight';
import { mulberry } from '../../../engine/rng';
import { isRumoured } from '../../../engine/subEtha';
import { useGame } from '../../../state/store';
import { useUiBus } from '../../fx/uiBus';
import { makeGlowSprite, inspectHandlers } from './shared';
import { DeepFieldBody, tumbleFor } from './DeepFieldObjects';
import { sharedHitProxyMaterial } from './pool';

/** Beyond this the body is not drawn at all, just the glint. */
const BODY_RANGE = 46;
/** The glint fades in over this range; past it, navigation owns discovery. */
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

function seamTint(id: string): number {
  switch (id) {
    case 'seam-chondrite': return 0xc9ad78;
    case 'seam-ferrous': return 0xc47f65;
    case 'seam-cryo': return 0x8ed8ed;
    case 'seam-scrapfall': return 0xb3bdd2;
    case 'seam-heavies': return 0xc39cff;
    case 'seam-improbable': return 0x86e0c0;
    default: return 0xc8b18a;
  }
}

/** A seeded particulate shoal rather than the generic phenomenon polyhedron. */
function SeamBody({ id, radius }: { id: string; radius: number }) {
  const tint = seamTint(id);
  const cloud = useMemo(() => {
    const r = mulberry((id.length * 0x51ea + [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) >>> 0);
    const positions = new Float32Array(132 * 3);
    for (let i = 0; i < positions.length; i += 3) {
      const angle = r() * Math.PI * 2;
      const belt = radius * (0.28 + Math.sqrt(r()) * 0.78);
      positions[i] = Math.cos(angle) * belt;
      positions[i + 1] = (r() - 0.5) * radius * (0.34 + r() * 0.24);
      positions[i + 2] = Math.sin(angle) * belt * (0.62 + r() * 0.44);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: tint,
      size: 0.12 + radius * 0.025,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const points = new Points(geometry, material);
    points.raycast = () => null;
    return points;
  }, [id, radius, tint]);

  useEffect(() => () => {
    cloud.geometry.dispose();
    (cloud.material as PointsMaterial).dispose();
  }, [cloud]);

  return (
    <group>
      <primitive object={cloud} />
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[radius * 0.72, radius * 0.018, 5, 42]} />
        <meshBasicMaterial
          color={tint}
          transparent
          opacity={0.24}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.5, 0.55, 0]} raycast={() => null}>
        <torusGeometry args={[radius * 0.48, radius * 0.012, 5, 32]} />
        <meshBasicMaterial
          color={tint}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function Landmark({ site }: { site: DeepFieldSite }) {
  const { def } = site;
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const glint = useRef<Sprite>(null);
  const seam = isSeamId(def.id);

  const scanned = useGame((game) => seam
    ? isProspected(game.s.expedition, def.id)
    : game.s.expedition.discovered[def.id] !== undefined);
  const serviced = useGame((game) => seam
    ? game.s.expedition.rigs[def.id] !== undefined
    : game.s.expedition.boarded[def.id] !== undefined);
  const rumoured = useGame((game) => !seam
    && game.s.expedition.discovered[def.id] === undefined
    && isRumoured(game.s, def.id));
  const flight = useUiBus((bus) => bus.flightMode);

  const tint = seam ? seamTint(def.id) : (KIND_TINT[def.kind] ?? 0xffffff);
  const glintMat = useMemo(() => makeGlowSprite(tint, 0.9), [tint]);
  const tumble = useMemo(() => tumbleFor(def), [def]);

  useFrame(({ camera, clock }) => {
    const group = root.current;
    if (!group) return;
    const time = clock.elapsedTime;

    const { x, y, z } = camera.position;
    sitePositionAt(site, x, y, z, SITE_POS);
    group.position.set(SITE_POS[0], SITE_POS[1], SITE_POS[2]);
    const distance = camera.position.distanceTo(group.position);

    if (glint.current) {
      const visible = distance < GLINT_RANGE && distance > 10;
      glint.current.visible = visible;
      if (visible) {
        const closeFade = Math.min(1, (distance - 10) / 24);
        const farFade = Math.pow(
          1 - Math.min(1, distance / GLINT_RANGE),
          rumoured || seam ? 1.15 : 1.8,
        );
        glint.current.material.opacity = farFade * closeFade
          * (scanned ? 0.4 : rumoured ? 0.72 : seam ? 0.62 : 0.5);
        const scale = Math.min(2.2, (0.4 + def.radius * 0.2) * (0.6 + distance * 0.09));
        glint.current.scale.set(scale, scale, 1);
      }
    }

    if (body.current) {
      const visible = distance < BODY_RANGE;
      body.current.visible = visible;
      if (visible) {
        body.current.rotation.set(
          tumble.phase[0] + time * tumble.rate[0],
          tumble.phase[1] + time * tumble.rate[1],
          tumble.phase[2] + time * tumble.rate[2],
        );
      }
    }
  });

  const title = scanned ? def.name : 'unidentified contact';
  const noun = seam ? 'resource seam' : (KIND_NOUN[def.kind] ?? 'contact');
  const sub = scanned
    ? serviced
      ? `${noun} \u00b7 ${seam ? 'rig operating' : 'boarded'}`
      : `${noun} \u00b7 ${seam ? 'prospected, no rig' : 'not yet boarded'}`
    : def.contact;

  return (
    <group ref={root}>
      <sprite ref={glint} material={glintMat} raycast={() => null} />
      <group ref={body}>
        {!flight && (
          <mesh {...inspectHandlers(title, sub)}>
            <sphereGeometry args={[def.radius * 1.5, 10, 8]} />
            <primitive object={sharedHitProxyMaterial()} attach="material" />
          </mesh>
        )}
        {seam
          ? <SeamBody id={def.id} radius={def.radius} />
          : <DeepFieldBody def={def} />}
      </group>
    </group>
  );
}

/** All physical contacts understood by the helm and the scene. */
export function flightFieldSites(seed: number): DeepFieldSite[] {
  const seams: DeepFieldSite[] = seamSites(seed).map((site) => ({
    def: seamAsLandmark(SEAM_BY_ID[site.id]!),
    pos: site.pos,
  }));
  return [...deepFieldSites(seed), ...seams];
}

export function DeepField() {
  const seed = useGame((game) => game.s.seed);
  const ceremony = useUiBus((bus) => bus.activeCinematic !== null);
  const sites = useMemo(() => flightFieldSites(seed), [seed]);
  if (ceremony) return null;
  return (
    <group>
      {sites.map((site) => (
        <Landmark key={site.def.id} site={site} />
      ))}
    </group>
  );
}
