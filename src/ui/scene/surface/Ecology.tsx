/**
 * The living background, drawn. Three instanced families — ground grazers,
 * fliers, and the shoal at the waterline — plus the vignette set-pieces,
 * all silhouette-grade geometry on shared materials: a populated valley
 * costs five draw calls and no NPC owns a thought.
 *
 * Motion is time-parametric and hashed — an individual's whole day is a
 * pure function of (anchor, index, t) — so there is nothing to simulate,
 * nothing to save, and the same creature is grazing the same ellipse when
 * you land here next year. The Guide considers this indistinguishable from
 * real wildlife and rather easier to schedule.
 *
 * Anchors stream in world-fixed hashed cells around the walker (the chunked
 * props' law at a biology-sized budget), so the herd you walked past is
 * still there when you walk back.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
} from 'three/webgpu';
import {
  attribute,
  float,
  instanceIndex,
  positionLocal,
  sin,
  time,
  vec3,
} from 'three/tsl';
import { mulberry } from '../../../engine/rng';
import { kitGeometryFit, upliftActive } from '../uplift/upliftAssets';
import { universeMotion } from '../universe/operationsVisual';
import {
  surfaceAmbientSpecies,
  surfaceLive,
  surfaceVignetteList,
} from './surfaceControl';
import { heightAt, type SurfaceParams, type SurfaceTiers } from './terrainField';
import type { PlanetPalette } from '../planetMaterial';

const SEAT = new Object3D();
const ZERO = new Matrix4().makeScale(0, 0, 0);

const CREATURE_KIT = 'meshes/props/creatures.glb';

/**
 * Extent fits, in metres of longest axis. These reproduce the world sizes the
 * primitive blobs had, so a herd is the same size it always was — only now it
 * has legs. Authored creatures are proportioned, so a kitted seat scales
 * UNIFORMLY; the old non-uniform scales existed to beat a sphere into
 * something animal-shaped and would squash a real one.
 */
const CREATURE_EXTENT = {
  grazer: 1.7,
  flier: 1.05,
  'shoal-fish': 0.55,
  mote: 0.24,
} as const;

/**
 * Movement, from the mask the Blender kit baked into its second UV set.
 *
 * The creatures merge to one static geometry and are drawn instanced, so there
 * is no rig to key and no per-object transform to animate. Instead each vertex
 * carries `uv1 = (weight, phase)` — how much it moves, and which limb it is —
 * and the vertex stage swings it. One shader, one draw call, forty animals.
 *
 * `instanceIndex` desynchronises the herd: without it every grazer in sight
 * plants the same hoof on the same frame, which reads as a chorus line.
 */
function animate(
  material: MeshStandardNodeMaterial | MeshBasicNodeMaterial,
  opts: { rate: number; amp: [number, number, number] },
): void {
  const mask = attribute('uv1', 'vec2');
  const beat = time
    .mul(opts.rate)
    .add(mask.y.mul(Math.PI * 2))
    .add(float(instanceIndex).mul(0.618));
  const swing = sin(beat).mul(mask.x);
  material.positionNode = vec3(
    positionLocal.x.add(swing.mul(opts.amp[0])),
    positionLocal.y.add(swing.mul(opts.amp[1])),
    positionLocal.z.add(swing.mul(opts.amp[2])),
  );
}

/** Ambient pools. Small on purpose: life reads in ones, not in crowds. */
const GROUND_MAX = 40;
const AIR_MAX = 56;
const WATER_MAX = 28;
const VIGNETTE_MAX = 72;

const GROUND_IDS = new Set(['meadow-drifter', 'dune-skink', 'firn-burrower', 'tumbleweave', 'vent-lace']);
const AIR_IDS = new Set(['sky-wisp', 'aurora-moth', 'cinder-wren']);
const WATER_IDS = new Set(['glass-shoal']);

interface AmbientCluster {
  x: number;
  z: number;
  n: number;
  phase: number;
  radius: number;
  speed: number;
}

/** Hashed clusters on world-fixed cells inside reach of a point. */
function clustersAround(
  seed: number,
  salt: number,
  px: number,
  pz: number,
  cellM: number,
  reachM: number,
  p: number,
  maxN: number,
): AmbientCluster[] {
  const out: AmbientCluster[] = [];
  const c0x = Math.floor((px - reachM) / cellM);
  const c1x = Math.floor((px + reachM) / cellM);
  const c0z = Math.floor((pz - reachM) / cellM);
  const c1z = Math.floor((pz + reachM) / cellM);
  for (let iz = c0z; iz <= c1z; iz++) {
    for (let ix = c0x; ix <= c1x; ix++) {
      const r = mulberry(
        (seed ^ salt ^ Math.imul(ix + 7919, 0x85ebca6b) ^ Math.imul(iz + 104729, 0xc2b2ae35)) >>> 0,
      );
      if (r() >= p) continue;
      const x = (ix + 0.15 + r() * 0.7) * cellM;
      const z = (iz + 0.15 + r() * 0.7) * cellM;
      const dx = x - px;
      const dz = z - pz;
      if (dx * dx + dz * dz > reachM * reachM) continue;
      out.push({
        x,
        z,
        n: 2 + Math.floor(r() * 3),
        phase: r() * Math.PI * 2,
        radius: 4 + r() * 9,
        speed: 0.05 + r() * 0.08,
      });
      if (out.length >= maxN) return out;
    }
  }
  return out;
}

export function Ecology({
  p,
  tiers,
  palette,
  bio,
  epoch = 0,
  hideVignetteFallback = false,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  palette: PlanetPalette;
  /** Bio gauge at landing — density and presence both ride it. */
  bio: number;
  epoch?: number;
  /** The authored dressing kit replaces only the static primitive set-pieces. */
  hideVignetteFallback?: boolean;
}) {
  const groundRef = useRef<InstancedMesh>(null);
  const airRef = useRef<InstancedMesh>(null);
  const waterRef = useRef<InstancedMesh>(null);
  const vignetteRef = useRef<InstancedMesh>(null);
  const moteRef = useRef<InstancedMesh>(null);

  const present = surfaceAmbientSpecies();
  const hasGround = present.some((s) => GROUND_IDS.has(s.id));
  const hasAir = present.some((s) => AIR_IDS.has(s.id));
  const hasWater = present.some((s) => WATER_IDS.has(s.id));

  // The authored ecology. Null on Tier C or until the GLB lands, and every
  // family keeps its primitive fallback — a valley of blobs is the old look,
  // not a broken one.
  const kit = useMemo(() => {
    if (!upliftActive()) return null;
    const fit = (name: keyof typeof CREATURE_EXTENT) =>
      kitGeometryFit(CREATURE_KIT, name, {
        mode: 'extent',
        extent: CREATURE_EXTENT[name],
        rotateY: Math.PI,
      });
    const grazer = fit('grazer');
    if (!grazer) return null;
    return {
      grazer,
      flier: fit('flier'),
      fish: fit('shoal-fish'),
      mote: fit('mote'),
    };
  }, []);

  const critterMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.low.clone().multiplyScalar(0.42).lerp(new Color(0x2e2a26), 0.5);
    m.roughness = 0.95;
    m.flatShading = true;
    // A walk: legs fore-and-aft, and only as far as a leg goes.
    if (kit?.grazer) animate(m, { rate: 5.2, amp: [0, 0.05, 0.16] });
    return m;
  }, [palette, kit]);
  const flierMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(0x1c2026);
    // A wingbeat: fast, and almost entirely vertical.
    if (kit?.flier) animate(m, { rate: 11, amp: [0, 0.22, 0.02] });
    return m;
  }, [kit]);
  const shoalMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = palette.ice.clone().lerp(new Color(0xaef2ff), 0.5);
    m.transparent = true;
    m.opacity = 0.7;
    // A tail beat: sideways, quick, small.
    if (kit?.fish) animate(m, { rate: 9, amp: [0.06, 0, 0] });
    return m;
  }, [palette, kit]);
  const moteMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(0xffe9a8);
    m.transparent = true;
    m.opacity = 0.8;
    return m;
  }, []);

  // Vignette set-pieces: static seats per epoch (spires, mounds, beds), plus
  // a moving layer written per frame (herds circling, birds, embers).
  const vignetteSeats = useMemo(() => {
    void epoch;
    const seats: Matrix4[] = [];
    for (const vg of surfaceVignetteList()) {
      const r = mulberry((p.seed ^ (vg.vary * 2654435761)) >>> 0);
      const s = vg.scale;
      const ground = (x: number, z: number) => heightAt(p, tiers, x, z);
      const put = (x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) => {
        SEAT.position.set(x, y, z);
        SEAT.rotation.set(0, yaw, 0);
        SEAT.scale.set(sx, sy, sz);
        SEAT.updateMatrix();
        seats.push(SEAT.matrix.clone());
      };
      switch (vg.kind) {
        case 'nesting-colony': {
          // Guano-capped spires the colony argues over.
          const count = 3 + Math.floor(r() * 3);
          for (let i = 0; i < count; i++) {
            const a = r() * Math.PI * 2;
            const d = 2 + r() * 7 * s;
            const x = vg.x + Math.cos(a) * d;
            const z = vg.z + Math.sin(a) * d;
            const h = (3 + r() * 4) * s;
            put(x, ground(x, z) + h * 0.45, z, a, 1.1 * s, h, 1.1 * s);
          }
          break;
        }
        case 'grazer-ring': {
          // The spring they still believe in: a low mound and a worn track.
          put(vg.x, ground(vg.x, vg.z) + 0.25, vg.z, vg.rot, 3.4 * s, 0.5, 3.4 * s);
          break;
        }
        case 'spore-bloom': {
          const count = 4 + Math.floor(r() * 3);
          for (let i = 0; i < count; i++) {
            const a = r() * Math.PI * 2;
            const d = 1.5 + r() * 5 * s;
            const x = vg.x + Math.cos(a) * d;
            const z = vg.z + Math.sin(a) * d;
            put(x, ground(x, z) + 0.7 * s, z, a, 0.9 * s, 1.6 * s, 0.9 * s);
          }
          break;
        }
        case 'tide-chorus': {
          const count = 5 + Math.floor(r() * 3);
          for (let i = 0; i < count; i++) {
            const a = vg.rot + (i / count) * Math.PI * 2;
            const x = vg.x + Math.cos(a) * 3.2 * s;
            const z = vg.z + Math.sin(a) * 3.2 * s;
            put(x, ground(x, z) + 0.5, z, a, 0.7 * s, 1.1 * s, 0.7 * s);
          }
          break;
        }
        case 'brine-garden': {
          const count = 6 + Math.floor(r() * 5);
          for (let i = 0; i < count; i++) {
            const a = r() * Math.PI * 2;
            const d = r() * 5 * s;
            const x = vg.x + Math.cos(a) * d;
            const z = vg.z + Math.sin(a) * d;
            const h = (0.8 + r() * 1.6) * s;
            put(x, ground(x, z) + h * 0.4, z, a, 0.5, h, 0.5);
          }
          break;
        }
        case 'ember-swarm': {
          // The cooling flow they court: one dark slab.
          put(vg.x, ground(vg.x, vg.z) + 0.3, vg.z, vg.rot, 4 * s, 0.5, 2.6 * s);
          break;
        }
      }
    }
    return seats.slice(0, VIGNETTE_MAX);
  }, [p, tiers, epoch]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const live = surfaceLive;
    const still = universeMotion.reduced;
    const wx = live.weather;
    const airGrounded =
      still || wx.kind === 'whiteout' || (wx.kind === 'storm' && wx.intensity > 0.5);
    const density = Math.min(1, 0.25 + bio * 0.75);

    // — Ground critters: slow ellipses around their patch, plus any herd
    //   vignette in range — same silhouette family, same material. —
    const gm = groundRef.current;
    if (gm) {
      let i = 0;
      if (hasGround) {
        const clusters = clustersAround(p.seed, 0x91a7, live.pos.x, live.pos.z, 192, 430, 0.4 * density, 12);
        for (const c of clusters) {
          for (let k = 0; k < c.n && i < GROUND_MAX; k++) {
            const a = c.phase + k * 2.1 + (still ? 0 : t * c.speed);
            const x = c.x + Math.cos(a) * c.radius;
            const z = c.z + Math.sin(a * 0.83) * c.radius;
            const y = heightAt(p, tiers, x, z);
            if (y < p.seaLevelM + 0.3) continue; // grazing, not snorkelling
            const gait = still ? 0 : Math.abs(Math.sin(t * 1.7 + k * 2)) * 0.08;
            SEAT.position.set(x, y + 0.42 + gait, z);
            SEAT.rotation.set(0, -a, 0);
            if (kit?.grazer) SEAT.scale.setScalar(1); else SEAT.scale.set(0.9, 0.62, 1.4);
            SEAT.updateMatrix();
            gm.setMatrixAt(i++, SEAT.matrix);
          }
        }
      }
      for (const vg of surfaceVignetteList()) {
        if (vg.kind !== 'grazer-ring') continue;
        if (Math.hypot(vg.x - live.pos.x, vg.z - live.pos.z) > 900) continue;
        for (let k = 0; k < 6 && i < GROUND_MAX; k++) {
          const a = vg.rot + k * 1.05 + (still ? 0 : t * 0.05);
          const x = vg.x + Math.cos(a) * 11 * vg.scale;
          const z = vg.z + Math.sin(a) * 11 * vg.scale;
          const y = heightAt(p, tiers, x, z);
          if (y < p.seaLevelM + 0.3) continue;
          SEAT.position.set(x, y + 0.5, z);
          SEAT.rotation.set(0, -a, 0);
          if (kit?.grazer) SEAT.scale.setScalar(1.22); else SEAT.scale.set(1.1, 0.8, 1.7);
          SEAT.updateMatrix();
          gm.setMatrixAt(i++, SEAT.matrix);
        }
      }
      for (let k = i; k < GROUND_MAX; k++) gm.setMatrixAt(k, ZERO);
      gm.count = GROUND_MAX;
      gm.instanceMatrix.needsUpdate = true;
    }

    // — Fliers: flocks on lissajous rounds, plus any nesting colony's wheel
    //   in range. Grounded together by serious weather. —
    const am = airRef.current;
    if (am) {
      let i = 0;
      if (hasAir && !airGrounded) {
        const flocks = clustersAround(p.seed, 0x3f2b, live.pos.x, live.pos.z, 320, 620, 0.35 * density, 5);
        for (const c of flocks) {
          const height = 13 + (c.radius - 4) * 1.6;
          for (let k = 0; k < 8 && i < AIR_MAX; k++) {
            const a = c.phase + t * (0.22 + c.speed) + k * 0.5;
            const x = c.x + Math.cos(a) * (c.radius + 6 + Math.sin(k * 3.7) * 3);
            const z = c.z + Math.sin(a * 1.13) * (c.radius + 6);
            const y = heightAt(p, tiers, c.x, c.z) + height + Math.sin(a * 2.3 + k) * 2.4;
            SEAT.position.set(x, y, z);
            SEAT.rotation.set(0, -a, Math.sin(t * 6 + k) * 0.4);
            if (kit?.flier) SEAT.scale.setScalar(1); else SEAT.scale.set(0.5, 0.12, 0.26);
            SEAT.updateMatrix();
            am.setMatrixAt(i++, SEAT.matrix);
          }
        }
      }
      if (!airGrounded) {
        for (const vg of surfaceVignetteList()) {
          if (vg.kind !== 'nesting-colony') continue;
          if (Math.hypot(vg.x - live.pos.x, vg.z - live.pos.z) > 900) continue;
          for (let k = 0; k < 9 && i < AIR_MAX; k++) {
            const a = vg.rot + t * 0.5 + k * 0.7;
            const x = vg.x + Math.cos(a) * (7 + (k % 3) * 3) * vg.scale;
            const z = vg.z + Math.sin(a * 1.2) * (7 + (k % 3) * 3) * vg.scale;
            const y = heightAt(p, tiers, vg.x, vg.z) + 6 + Math.sin(a * 2.1) * 2.5;
            SEAT.position.set(x, y, z);
            SEAT.rotation.set(0, -a, Math.sin(t * 7 + k) * 0.5);
            if (kit?.flier) SEAT.scale.setScalar(0.8); else SEAT.scale.set(0.4, 0.1, 0.2);
            SEAT.updateMatrix();
            am.setMatrixAt(i++, SEAT.matrix);
          }
        }
      }
      for (let k = i; k < AIR_MAX; k++) am.setMatrixAt(k, ZERO);
      am.count = AIR_MAX;
      am.instanceMatrix.needsUpdate = true;
    }

    // — The shoal: sparks riding just under the waterline, shore only. —
    const wm = waterRef.current;
    if (wm) {
      let i = 0;
      if (hasWater) {
        const beds = clustersAround(p.seed, 0x77c1, live.pos.x, live.pos.z, 256, 520, 0.45 * density, 6);
        for (const c of beds) {
          const ground = heightAt(p, tiers, c.x, c.z);
          const depth = p.seaLevelM - ground;
          if (depth < 0.4 || depth > 14) continue; // the shallows, only
          for (let k = 0; k < 5 && i < WATER_MAX; k++) {
            const a = c.phase + (still ? 0 : t * (c.speed * 3)) + k * 1.26;
            const x = c.x + Math.cos(a) * c.radius * 0.6;
            const z = c.z + Math.sin(a * 1.4) * c.radius * 0.6;
            SEAT.position.set(x, p.seaLevelM - 0.18, z);
            SEAT.rotation.set(0, -a, 0);
            if (kit?.fish) SEAT.scale.setScalar(1); else SEAT.scale.set(0.42, 0.08, 0.14);
            SEAT.updateMatrix();
            wm.setMatrixAt(i++, SEAT.matrix);
          }
        }
      }
      for (let k = i; k < WATER_MAX; k++) wm.setMatrixAt(k, ZERO);
      wm.count = WATER_MAX;
      wm.instanceMatrix.needsUpdate = true;
    }

    // — The bright layer: embers court the flow, spores rise and drift. —
    const mm = moteRef.current;
    if (mm) {
      let i = 0;
      const MOTE_MAX = 48;
      for (const vg of surfaceVignetteList()) {
        const dd = Math.hypot(vg.x - live.pos.x, vg.z - live.pos.z);
        if (dd > 900) continue;
        if (vg.kind === 'ember-swarm' && !still) {
          for (let k = 0; k < 12 && i < MOTE_MAX; k++) {
            const a = t * 0.7 + k * 0.52;
            const x = vg.x + Math.cos(a + k) * 3.4 * vg.scale;
            const z = vg.z + Math.sin(a * 1.31 + k * 2) * 3.4 * vg.scale;
            const y = heightAt(p, tiers, vg.x, vg.z) + 1.4 + Math.sin(a * 1.7 + k) * 1.1;
            SEAT.position.set(x, y, z);
            SEAT.rotation.set(0, 0, 0);
            const tw = 0.1 + Math.abs(Math.sin(t * 3.1 + k * 1.3)) * 0.12;
            SEAT.scale.set(tw, tw, tw);
            SEAT.updateMatrix();
            mm.setMatrixAt(i++, SEAT.matrix);
          }
        } else if (vg.kind === 'spore-bloom' && !still) {
          for (let k = 0; k < 7 && i < MOTE_MAX; k++) {
            const a = t * 0.16 + k * 0.9;
            const x = vg.x + Math.cos(a) * (2 + k * 0.9) * vg.scale;
            const z = vg.z + Math.sin(a * 0.77) * (2 + k * 0.9) * vg.scale;
            const y = heightAt(p, tiers, vg.x, vg.z) + 2.2 + ((t * 0.35 + k * 1.7) % 6);
            SEAT.position.set(x, y, z);
            SEAT.rotation.set(0, 0, 0);
            SEAT.scale.setScalar(kit?.mote ? 1 : 0.16);
            SEAT.updateMatrix();
            mm.setMatrixAt(i++, SEAT.matrix);
          }
        }
      }
      for (let k = i; k < MOTE_MAX; k++) mm.setMatrixAt(k, ZERO);
      mm.count = MOTE_MAX;
      mm.instanceMatrix.needsUpdate = true;
    }
  });

  const anyAmbient = hasGround || hasAir || hasWater;
  if (!anyAmbient && surfaceVignetteList().length === 0) return null;
  return (
    <group name="ecology">
      {hasGround && (
        <instancedMesh ref={groundRef} args={[kit?.grazer ?? undefined, undefined, GROUND_MAX]} material={critterMat} frustumCulled={false}>
          {kit?.grazer ? null : <icosahedronGeometry args={[0.6, 0]} />}
        </instancedMesh>
      )}
      {hasAir && (
        <instancedMesh ref={airRef} args={[kit?.flier ?? undefined, undefined, AIR_MAX]} material={flierMat} frustumCulled={false}>
          {kit?.flier ? null : <octahedronGeometry args={[1, 0]} />}
        </instancedMesh>
      )}
      {hasWater && (
        <instancedMesh ref={waterRef} args={[kit?.fish ?? undefined, undefined, WATER_MAX]} material={shoalMat} frustumCulled={false}>
          {kit?.fish ? null : <octahedronGeometry args={[1, 0]} />}
        </instancedMesh>
      )}
      {!hideVignetteFallback && vignetteSeats.length > 0 && (
        <instancedMesh
          ref={(el) => {
            vignetteRef.current = el;
            if (!el) return;
            vignetteSeats.forEach((m, i) => el.setMatrixAt(i, m));
            el.count = vignetteSeats.length;
            el.instanceMatrix.needsUpdate = true;
          }}
          args={[undefined, undefined, Math.max(1, vignetteSeats.length)]}
          material={critterMat}
          frustumCulled={false}
        >
          <coneGeometry args={[1, 1, 7]} />
        </instancedMesh>
      )}
      {surfaceVignetteList().length > 0 && (
        <instancedMesh ref={moteRef} args={[kit?.mote ?? undefined, undefined, 48]} material={moteMat} frustumCulled={false}>
          {kit?.mote ? null : <octahedronGeometry args={[1, 0]} />}
        </instancedMesh>
      )}
    </group>
  );
}
