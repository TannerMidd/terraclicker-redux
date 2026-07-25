/**
 * Pooled scene objects — how the universe is allowed to accumulate.
 *
 * `docs/ROADMAP.md` measured the ceiling: 409 worlds drawn by 272 meshes
 * carrying 227 distinct material graphs, with two instanced meshes in the whole
 * scene. Frame time is fine — a locked 60fps everywhere — but every distinct
 * graph compiles its own pipeline, and that is what the 167ms hitch on entering
 * flight is made of.
 *
 * The cause was NOT node materials, which is what the first look assumed: only
 * thirteen of the 227 were node materials. The rest were ordinary
 * `<meshBasicMaterial color={x} />` JSX elements inside components that render
 * once per system, per galaxy, per landmark. React Three Fiber constructs a
 * fresh material for each such element, so eighty-one systems meant eighty-one
 * identical materials — seventeen of one signature, sixteen of another.
 * Sharing them by signature took the count to 205. `TC_OWNERS=1 npm run budget`
 * prints the remaining duplicates, largest first.
 *
 * Everything still to be built accumulates visible objects: settlement lights
 * and weather per world, nebulae and comet trails and debris fields, relay
 * buoys and depots and survey stations, lanes worn into space by repeated
 * flight. Authored the way the scene is currently authored, each of those adds
 * graphs in proportion to how many things it draws, and the hitch grows until
 * the second law in EXPANSION.md stops being affordable.
 *
 * So there are two rules, and this module is what makes them cheap to follow:
 *
 * 1. **A feature gets 2–3 material graphs, however many objects it spawns.**
 *    `pooledMaterial` hands back the *same* material for the same key, so a
 *    feature physically cannot mint one per instance by accident.
 * 2. **More than ~8 objects of a kind must be instanced.** `<InstancedPool>`
 *    draws any number of transforms as a single `InstancedMesh`.
 *
 * Verify with `npm run budget`, which reports distinct graphs and instanced
 * meshes against a 409-world save.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three/webgpu';
import type { Blending } from 'three/webgpu';
import type { BufferGeometry, Material } from 'three/webgpu';

/**
 * One pooled instance. Rotation is optional because most accumulated scenery
 * (lights, buoys, debris motes) does not care which way it faces.
 */
export interface PoolInstance {
  position: [number, number, number];
  scale?: number | [number, number, number];
  quaternion?: [number, number, number, number];
  /** Per-instance tint. Free — it rides the instance colour buffer, not a new graph. */
  color?: number;
}

const MATERIALS = new Map<string, Material>();

/**
 * The same material for the same key, for the life of the page.
 *
 * The factory runs at most once per key. Callers must key on the *kind* of
 * thing being drawn — `settlement-light`, `debris-mote` — and never on the
 * identity of an instance, which is the mistake this exists to prevent.
 */
export function pooledMaterial<T extends Material>(key: string, make: () => T): T {
  const existing = MATERIALS.get(key);
  if (existing) return existing as T;
  const created = make();
  MATERIALS.set(key, created);
  return created;
}

/** Distinct pooled graphs alive right now — the number the budget is about. */
export function pooledMaterialCount(): number {
  return MATERIALS.size;
}

/** Test seam. Never call this from the scene; materials are page-lifetime. */
export function resetPooledMaterials(): void {
  for (const material of MATERIALS.values()) material.dispose();
  MATERIALS.clear();
}

const TMP_MATRIX = new Matrix4();
const TMP_POS = new Vector3();
const TMP_QUAT = new Quaternion();
const TMP_SCALE = new Vector3();
const TMP_COLOR = new Color();

export interface InstancedPoolProps {
  geometry: BufferGeometry;
  material: Material;
  instances: readonly PoolInstance[];
  /**
   * Capacity to allocate. Instance counts that change every frame should pass
   * a stable ceiling here, because growing an InstancedMesh reallocates its
   * buffers — which is exactly the hitch this module exists to avoid.
   */
  capacity?: number;
  frustumCulled?: boolean;
}

/**
 * Draw many copies of one thing in one call.
 *
 * `count` is set to the live instance count rather than the capacity, so an
 * over-allocated pool costs memory but never draws the unused tail.
 */
export function InstancedPool({
  geometry,
  material,
  instances,
  capacity,
  frustumCulled = true,
}: InstancedPoolProps) {
  const ref = useRef<InstancedMesh>(null);
  const size = Math.max(1, capacity ?? instances.length);
  const anyColour = useMemo(() => instances.some((i) => i.color !== undefined), [instances]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const count = Math.min(instances.length, size);
    for (let i = 0; i < count; i++) {
      const inst = instances[i]!;
      TMP_POS.set(inst.position[0], inst.position[1], inst.position[2]);
      if (inst.quaternion) {
        TMP_QUAT.set(inst.quaternion[0], inst.quaternion[1], inst.quaternion[2], inst.quaternion[3]);
      } else {
        TMP_QUAT.identity();
      }
      const s = inst.scale ?? 1;
      if (Array.isArray(s)) TMP_SCALE.set(s[0], s[1], s[2]);
      else TMP_SCALE.set(s, s, s);
      mesh.setMatrixAt(i, TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE));
      if (anyColour) mesh.setColorAt(i, TMP_COLOR.set(inst.color ?? 0xffffff));
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (anyColour && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances, size, anyColour]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, size]}
      frustumCulled={frustumCulled}
    />
  );
}

/**
 * Shared basic/standard materials, keyed by what they actually are.
 *
 * The measured 227 distinct material graphs turned out not to be a node-material
 * problem at all — only 13 of them were node materials. The other 214 were
 * ordinary `<meshBasicMaterial color={x} />` JSX elements inside components
 * that render once per system, per galaxy, per landmark. React Three Fiber
 * constructs a new material for every one of those elements, so eighty-one
 * systems meant eighty-one identical materials, seventeen of one signature and
 * sixteen of another.
 *
 * These helpers hand back one instance per distinct parameter set, so the same
 * JSX renders the same graph however many times it appears. Use with
 * `<primitive object={...} attach="material" />`.
 */
export interface BasicParams {
  /** Hex or a Color — keyed by hex either way, so both dedupe together. */
  color?: number | Color;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  blending?: Blending;
  toneMapped?: boolean;
}

function key(prefix: string, p: BasicParams): string {
  return [
    prefix,
    p.color === undefined ? 'x' : (p.color instanceof Color ? p.color.getHexString() : p.color),
    p.opacity ?? 'x',
    p.transparent ? 't' : '-',
    p.depthWrite === false ? 'nw' : '-',
    p.blending ?? 'x',
    p.toneMapped === false ? 'nt' : '-',
  ].join('|');
}

export function sharedBasicMaterial(p: BasicParams = {}): MeshBasicMaterial {
  return pooledMaterial(key('basic', p), () => new MeshBasicMaterial({
    ...(p.color !== undefined ? { color: p.color } : {}),
    ...(p.opacity !== undefined ? { opacity: p.opacity } : {}),
    ...(p.transparent !== undefined ? { transparent: p.transparent } : {}),
    ...(p.depthWrite !== undefined ? { depthWrite: p.depthWrite } : {}),
    ...(p.blending !== undefined ? { blending: p.blending } : {}),
    ...(p.toneMapped !== undefined ? { toneMapped: p.toneMapped } : {}),
  }));
}

/**
 * The invisible proxy every clickable body carries. One signature, one
 * material, however many bodies — this alone was sixteen of the count.
 */
export function sharedHitProxyMaterial(): MeshBasicMaterial {
  return sharedBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
}
