/**
 * The runabout, skimmer and refit hardware from the ship kits
 * (ASSET_UPLIFT.md 3.1/3.2/3.4/3.5) — shared across every call site that
 * draws the ship, which is the entire argument for them: one asset, one
 * material, three cameras.
 *
 * The hull material is a singleton (law 1): vertex part-tints × the
 * runabout PBR atlas, with the hull-decal sheet blended over it so the
 * registration stripes and the Guide sticker ride every hull at every scale.
 */
import { useEffect, useMemo, useState } from 'react';
import { Color, MeshStandardNodeMaterial } from 'three/webgpu';
import { mix, vec3, vertexColor } from 'three/tsl';
import type { BufferGeometry } from 'three/webgpu';
import { useGame } from '../../../state/store';
import { kitGeometryFit, upliftActive, upliftNode, whenKitReady } from './upliftAssets';

const SHIP_KIT = 'meshes/ships/runabout.glb';
const REFIT_KIT = 'meshes/ships/runabout-refits.glb';
const SKIMMER_KIT = 'meshes/ships/skimmer.glb';

let hullMat: MeshStandardNodeMaterial | null = null;

/** The one hull material every runabout/skimmer/refit mesh shares. */
export function shipMaterial(): MeshStandardNodeMaterial {
  if (hullMat) return hullMat;
  const m = new MeshStandardNodeMaterial();
  m.roughness = 0.44;
  m.metalness = 0.62;
  m.emissive = new Color(0x0b1524);
  m.emissiveIntensity = 0.5;
  const atlas = upliftNode('textures/ships/runabout-pbr.ktx2', undefined, { repeat: true, srgb: true });
  const decals = upliftNode('textures/ships/hull-decals.ktx2', undefined, { placeholder: 'clear' });
  const base = vertexColor().mul(mix(vec3(1), atlas.rgb.mul(2.0), 0.3));
  m.colorNode = mix(base, decals.rgb.mul(0.8), decals.a.mul(0.35));
  hullMat = m;
  return m;
}

interface Envelope {
  min: [number, number, number];
  max: [number, number, number];
}

/** The whole runabout fitted to a call site's envelope (nose −Z). */
export function runaboutGeometry(fit: Envelope): BufferGeometry | null {
  if (!upliftActive()) return null;
  return kitGeometryFit(SHIP_KIT, 'runabout', { mode: 'box', ...fit, rotateY: Math.PI });
}

export function skimmerGeometry(fit: Envelope): BufferGeometry | null {
  if (!upliftActive()) return null;
  return kitGeometryFit(SKIMMER_KIT, 'survey-skimmer', { mode: 'box', ...fit, rotateY: Math.PI });
}

/**
 * A kit geometry for a component that may mount BEFORE the GLB arrives —
 * the always-mounted call sites (chase exterior, cockpit nose). Starts with
 * whatever is cached and upgrades once when the kit lands; per-session
 * components can keep using the plain getters.
 */
export function useKitGeometry(
  kit: string,
  build: () => BufferGeometry | null,
): BufferGeometry | null {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(build);
  useEffect(() => {
    if (geometry || !upliftActive()) return;
    let alive = true;
    void whenKitReady(kit).then(() => {
      if (alive) setGeometry(build());
    });
    return () => {
      alive = false;
    };
    // build is stable per call site; re-running on geometry avoids loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, kit]);
  return geometry;
}

export const RUNABOUT_KIT = SHIP_KIT;
export const SKIMMER_KIT_PATH = SKIMMER_KIT;

/** Refit id → the kit asset that makes the purchase visible on the hull. */
const REFIT_ASSETS: Record<string, string> = {
  skimmer: 'skimmer-cradle',
  cargoHold: 'cargo-pod',
  rigBay: 'rig-bay',
  deterrent: 'dispersal-field-emitters',
  atmo: 'atmo-intakes',
};

export interface RefitPodSpec {
  id: string;
  position: [number, number, number];
  height: number;
}

/**
 * The refit hardware the expedition has actually bought, hung on the hull —
 * salvage made visible (3.2). Reads `expedition.refits` reactively; a refit
 * bought mid-session appears on the next render.
 */
export function RefitPods({ pods }: { pods: RefitPodSpec[] }) {
  const refits = useGame((g) => g.s.expedition.refits);
  const fitted = useMemo(() => {
    if (!upliftActive()) return [];
    return pods
      .filter((pod) => (refits[pod.id] ?? 0) > 0)
      .map((pod) => ({
        pod,
        geometry: kitGeometryFit(REFIT_KIT, REFIT_ASSETS[pod.id] ?? pod.id, {
          mode: 'height',
          height: pod.height,
          rotateY: Math.PI,
        }),
      }))
      .filter((x): x is { pod: RefitPodSpec; geometry: BufferGeometry } => x.geometry !== null);
  }, [pods, refits]);
  if (fitted.length === 0) return null;
  return (
    <>
      {fitted.map(({ pod, geometry }) => (
        <mesh key={pod.id} geometry={geometry} material={shipMaterial()} position={pod.position} />
      ))}
    </>
  );
}
