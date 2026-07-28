/**
 * The settlement, drawn. Eleven instanced families cover every district in
 * sight — hab shells, roofs, lit windows (warm and cool, the orbit's own
 * hexes), masts, domes, pads, stilts, works, banners, scaffolding — so a
 * town costs about a dozen draw calls and zero mid-walk shader builds
 * (materials are shared standard/basic nodes, per the sharing law; lighting
 * is borrowed, never mounted).
 *
 * The moving parts are deliberately cheap: mast beacons pulse, windows dim
 * politely at dawn, and a few maintenance drones fly their rounds over lit
 * districts — silhouettes and sprites selling a civilization the frame
 * budget can afford, exactly as the spec orders. No NPC is simulated. The
 * drones are not going anywhere in particular, which the Guide notes makes
 * them indistinguishable from most commuters.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Sprite,
} from 'three/webgpu';
import type { BufferGeometry } from 'three/webgpu';
import {
  SETTLEMENT_COOL_HEX,
  SETTLEMENT_WARM_HEX,
} from '../../../engine/settlements';
import { mulberry } from '../../../engine/rng';
import type { GroundfallSession } from '../../fx/uiBus';
import { sharedGlowSprite } from '../universe/shared';
import { universeMotion } from '../universe/operationsVisual';
import { buildSettlementSeats, type FacilityKitKind } from './surfaceSettlements';
import { surfaceLive, surfaceSettlementList } from './surfaceControl';
import type { SurfaceParams, SurfaceTiers } from './terrainField';
import type { PlanetPalette } from '../planetMaterial';
import * as audio from '../../audio/audio';
import {
  kitGeometry,
  kitGeometryFit,
  upliftActive,
  upliftFamilyMaterial,
  upliftTex,
  upliftWindowMaterial,
  type KitFit,
} from '../uplift/upliftAssets';

const SETTLEMENT_KIT = 'meshes/settlements/settlement-kit.glb';
const FACILITY_KIT = 'meshes/facilities/facility-kit.glb';
/** The unit frames of the primitives each kit family replaces. */
const FIT_BOX: KitFit = { mode: 'box', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
const FIT_MAST: KitFit = { mode: 'box', min: [-0.7, -0.5, -0.7], max: [0.7, 0.5, 0.7] };
const FIT_STILT: KitFit = { mode: 'box', min: [-0.6, -0.5, -0.6], max: [0.6, 0.5, 0.6] };
const FIT_DOME: KitFit = { mode: 'box', min: [-1, -0.063, -1], max: [1, 1, 1] };
const FIT_PAD: KitFit = { mode: 'box', min: [-1, -0.5, -1], max: [1, 0.5, 1] };

function useSeatMesh(seats: Matrix4[]) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    seats.forEach((matrix, i) => m.setMatrixAt(i, matrix));
    m.count = seats.length;
    m.instanceMatrix.needsUpdate = true;
  }, [seats]);
  return ref;
}

/**
 * Split one family's seats across its shape variants, by position.
 *
 * Hashed off the seat's own translation rather than its index, so a given hut
 * keeps its shape when the terrain re-centres and the seats are rebuilt — the
 * alternative is a village that reshuffles itself every time you walk far
 * enough east. Quantised first so floating-point drift in the re-derive cannot
 * flip a building to a different variant.
 */
function variantBuckets(seats: Matrix4[], count: number): Matrix4[][] {
  const out: Matrix4[][] = Array.from({ length: count }, () => []);
  if (count <= 1) return [seats];
  for (const m of seats) {
    const x = Math.round(m.elements[12] * 4);
    const z = Math.round(m.elements[14] * 4);
    const h = Math.abs(Math.imul(x, 73856093) ^ Math.imul(z, 19349663));
    out[h % count]!.push(m);
  }
  return out;
}

/**
 * One instanced batch. A family renders one of these per variant, all sharing
 * the family's single material — the one-material-per-family law is about
 * materials, not geometries, so extra shapes cost a draw call and no shader.
 */
function SeatBatch({
  geometry,
  seats,
  material,
  children,
}: {
  geometry: BufferGeometry | null;
  seats: Matrix4[];
  /** Banners take a basic material; every other family is standard. */
  material: MeshStandardNodeMaterial | MeshBasicNodeMaterial;
  children?: ReactNode;
}) {
  const ref = useSeatMesh(seats);
  if (seats.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry ?? undefined, undefined, seats.length]}
      material={material}
      frustumCulled={false}
    >
      {geometry ? null : children}
    </instancedMesh>
  );
}

/**
 * A settlement family: its seats, spread over however many variants the kit
 * actually shipped. With no kit (Tier C, or still in flight) this collapses to
 * a single batch drawing the primitive fallback, exactly as before.
 */
function KitFamily({
  variants,
  seats,
  material,
  children,
}: {
  variants: Array<BufferGeometry | null>;
  seats: Matrix4[];
  /** Banners take a basic material; every other family is standard. */
  material: MeshStandardNodeMaterial | MeshBasicNodeMaterial;
  children?: ReactNode;
}) {
  const usable = variants.filter((g): g is BufferGeometry => g !== null);
  const buckets = useMemo(
    () => variantBuckets(seats, Math.max(1, usable.length)),
    [seats, usable.length],
  );
  return (
    <>
      {buckets.map((bucket, i) => (
        <SeatBatch key={i} geometry={usable[i] ?? null} seats={bucket} material={material}>
          {children}
        </SeatBatch>
      ))}
    </>
  );
}

function basicColor(hex: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.color = new Color(hex);
  return m;
}

/** One authored facility kind, instanced. Always mounted so hook order holds. */
function FacilitySeats({
  kind,
  seats,
  material,
}: {
  kind: FacilityKitKind;
  seats: { kind: FacilityKitKind; matrix: Matrix4 }[];
  material: MeshStandardNodeMaterial;
}) {
  const mine = useMemo(() => seats.filter((f) => f.kind === kind).map((f) => f.matrix), [seats, kind]);
  const ref = useSeatMesh(mine);
  const geometry = useMemo(() => kitGeometry(FACILITY_KIT, kind), [kind]);
  if (mine.length === 0 || !geometry) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, mine.length]}
      material={material}
      frustumCulled={false}
    />
  );
}

const FACILITY_KINDS: readonly FacilityKitKind[] = [
  'seed-probe',
  'atmo-processor',
  'deep-thought',
  'petition-crane',
];

/** Hashed drone round: a slow ellipse over the district at hover height. */
interface DroneTrack {
  homeX: number;
  homeZ: number;
  y: number;
  rx: number;
  rz: number;
  h: number;
  speed: number;
  phase: number;
}

export function Settlements({
  p,
  tiers,
  palette,
  session,
  epoch = 0,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  palette: PlanetPalette;
  session: GroundfallSession;
  /** Terrain re-centre epoch: seats re-derive when the ground rolls. */
  epoch?: number;
}) {
  // The settlement kit (2.3), fitted to the exact unit frames of the
  // primitives it replaces: every seat matrix keeps its silhouette, and the
  // layout code above never learns the geometry changed. Null while the GLB
  // is in flight (or on Tier C) — that session stays primitive.
  const kit = useMemo(() => {
    if (!upliftActive()) return null;
    const wall = kitGeometryFit(SETTLEMENT_KIT, 'hab-shell', FIT_BOX);
    if (!wall) return null;
    // Variants are OPTIONAL: `-b`/`-c` return null when the kit does not carry
    // them, and KitFamily just spreads the seats over whatever exists. So the
    // Blender kit can grow new shapes without this file changing.
    const variants = (name: string, fit: KitFit, extra: string[]) =>
      [name, ...extra]
        .map((n) => kitGeometryFit(SETTLEMENT_KIT, n, fit))
        .filter((g): g is NonNullable<typeof g> => g !== null);
    return {
      wall: variants('hab-shell', FIT_BOX, ['hab-shell-b', 'hab-shell-c']),
      roof: variants('roof', FIT_BOX, ['roof-b', 'roof-c']),
      mast: variants('mast', FIT_MAST, []),
      dome: variants('dome', FIT_DOME, ['dome-b']),
      pad: variants('pad', FIT_PAD, []),
      stilt: variants('stilt', FIT_STILT, ['stilt-b']),
      works: variants('works', FIT_BOX, ['works-b']),
      banner: variants('banner', FIT_BOX, []),
      scaffold: variants('scaffold', FIT_BOX, []),
      atlas: upliftTex('textures/settlements/settlement-atlas.ktx2', { repeat: true, srgb: true }),
    };
  }, []);
  const facilityKitReady = useMemo(
    () => upliftActive() && kitGeometry(FACILITY_KIT, 'seed-probe') !== null,
    [],
  );

  const seats = useMemo(() => {
    void epoch; // every foot re-samples the (possibly re-baked) ground
    return buildSettlementSeats(p, tiers, surfaceSettlementList(), session, facilityKitReady);
  }, [p, tiers, session, epoch, facilityKitReady]);

  /** Palette-derived family material; kit geometry adds part tints + atlas. */
  const family = (
    color: Color,
    roughness: number,
    kitted: boolean,
    opts: { metalness?: number } = {},
  ) => {
    const m = new MeshStandardNodeMaterial();
    m.color = color;
    m.roughness = roughness;
    if (opts.metalness !== undefined) m.metalness = opts.metalness;
    if (kitted) {
      m.vertexColors = true;
      if (kit?.atlas) {
        m.map = kit.atlas;
        m.color.multiplyScalar(1.7);
      }
    } else {
      m.flatShading = true;
    }
    return m;
  };

  const wallMat = useMemo(
    // Local plaster over local stone: the palette, civilised a shade.
    () => family(palette.high.clone().multiplyScalar(0.58).lerp(new Color(0xcabfa8), 0.35), 0.86, !!kit?.wall.length),
    [palette, kit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const roofMat = useMemo(
    () => family(palette.low.clone().multiplyScalar(0.5).lerp(new Color(0x37404a), 0.5), 0.92, !!kit?.roof.length),
    [palette, kit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const windowWarmMat = useMemo(
    () => (kit ? upliftWindowMaterial(SETTLEMENT_WARM_HEX) : basicColor(SETTLEMENT_WARM_HEX)),
    [kit],
  );
  const windowCoolMat = useMemo(
    () => (kit ? upliftWindowMaterial(SETTLEMENT_COOL_HEX) : basicColor(SETTLEMENT_COOL_HEX)),
    [kit],
  );
  const mastMat = useMemo(
    () => family(new Color(0x39414b), 0.6, !!kit?.mast.length),
    [kit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const domeMat = useMemo(
    () => family(palette.atmosphere.clone().multiplyScalar(0.5).lerp(new Color(0x9aa8b4), 0.5), 0.34, !!kit?.dome.length),
    [palette, kit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const padMat = useMemo(
    () => family(new Color(0x2c3036), 1, !!kit?.pad.length),
    [kit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const worksMat = useMemo(
    () => family(new Color(0x4c4842), 0.78, !!kit?.works.length),
    [kit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bannerMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(SETTLEMENT_WARM_HEX).multiplyScalar(0.9);
    if (kit?.banner.length) m.vertexColors = true;
    return m;
  }, [kit]);
  const scaffoldMat = useMemo(
    () => family(new Color(0x6f5f3c), 0.82, !!kit?.scaffold.length),
    [kit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const facilityMat = useMemo(
    () =>
      upliftFamilyMaterial({
        atlas: 'textures/facilities/facility-atlas.ktx2',
        tint: new Color(0x8f8f8f),
        gain: 1.15,
        roughness: 0.58,
        metalness: 0.3,
      }),
    [],
  );

  const windowWarm = useSeatMesh(seats.windowWarm);
  const windowCool = useSeatMesh(seats.windowCool);

  const beaconMat = sharedGlowSprite(0xaef2c8, 0.9);
  const droneMat = sharedGlowSprite(SETTLEMENT_WARM_HEX, 0.8);
  const beaconRefs = useRef<(Sprite | null)[]>([]);
  const droneRefs = useRef<(Sprite | null)[]>([]);

  const droneTracks = useMemo<DroneTrack[]>(() => {
    const tracks: DroneTrack[] = [];
    for (const home of seats.drones) {
      const r = mulberry(home.seed);
      for (let i = 0; i < home.count; i++) {
        tracks.push({
          homeX: home.x,
          homeZ: home.z,
          y: home.deckY,
          rx: 12 + r() * 16,
          rz: 12 + r() * 16,
          h: 8 + r() * 8,
          speed: (0.16 + r() * 0.14) * (r() < 0.5 ? 1 : -1),
          phase: r() * Math.PI * 2,
        });
      }
    }
    return tracks;
  }, [seats]);

  // Hum bookkeeping: the loop must stop when the town scrolls out of the
  // stay, including on unmount.
  useEffect(() => () => audio.settlementHumStop(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const day = Math.max(0, Math.min(1, surfaceLive.sunUp * 1.6 + 0.12));

    // Windows read strongest at night — daylight politely absorbs them.
    const glow = 0.55 + (1 - day) * 0.45;
    windowWarmMat.color.setHex(SETTLEMENT_WARM_HEX).multiplyScalar(glow);
    windowCoolMat.color.setHex(SETTLEMENT_COOL_HEX).multiplyScalar(glow);

    // Beacons breathe, out of phase with each other.
    seats.beacons.forEach((b, i) => {
      const s = beaconRefs.current[i];
      if (!s) return;
      const pulse = 0.6 + Math.sin(t * 2.2 + i * 1.7) * 0.4;
      s.scale.setScalar(1.1 * (0.5 + pulse * 0.5));
      s.position.set(b.x, b.y, b.z);
    });

    // Drones fly their rounds — grounded by whiteouts, storms, and the
    // reduced-motion preference, in that order of meteorological respect.
    const grounded =
      universeMotion.reduced
      || surfaceLive.weather.kind === 'whiteout'
      || (surfaceLive.weather.kind === 'storm' && surfaceLive.weather.intensity > 0.5);
    droneTracks.forEach((d, i) => {
      const s = droneRefs.current[i];
      if (!s) return;
      s.visible = !grounded;
      if (grounded) return;
      const a = d.phase + t * d.speed;
      s.position.set(
        d.homeX + Math.cos(a) * d.rx,
        d.y + d.h + Math.sin(t * 0.9 + d.phase) * 1.2,
        d.homeZ + Math.sin(a) * d.rz,
      );
    });

    // The civic hum rises as you walk in among the lights.
    let nearest = Infinity;
    for (const d of surfaceSettlementList()) {
      if (!d.lit) continue;
      const dd = Math.hypot(d.x - surfaceLive.pos.x, d.z - surfaceLive.pos.z);
      if (dd < nearest) nearest = dd;
    }
    audio.settlementHumSet(nearest > 220 ? 0 : (1 - nearest / 220) * (0.4 + 0.6 * session.standing));
  });

  if (surfaceSettlementList().length === 0) return null;
  return (
    <group name="settlements">
      <KitFamily variants={kit?.wall ?? []} seats={seats.wall} material={wallMat}>
        <boxGeometry args={[1, 1, 1]} />
      </KitFamily>
      <KitFamily variants={kit?.roof ?? []} seats={seats.roof} material={roofMat}>
        <boxGeometry args={[1, 1, 1]} />
      </KitFamily>
      {/* Windows stay quads on purpose: the pane detail is the emissive
          atlas (2.4), which costs zero triangles. */}
      {seats.windowWarm.length > 0 && (
        <instancedMesh ref={windowWarm} args={[undefined, undefined, seats.windowWarm.length]} material={windowWarmMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {seats.windowCool.length > 0 && (
        <instancedMesh ref={windowCool} args={[undefined, undefined, seats.windowCool.length]} material={windowCoolMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      <KitFamily variants={kit?.mast ?? []} seats={seats.mast} material={mastMat}>
        <cylinderGeometry args={[0.5, 0.7, 1, 6]} />
      </KitFamily>
      <KitFamily variants={kit?.dome ?? []} seats={seats.dome} material={domeMat}>
        <sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
      </KitFamily>
      <KitFamily variants={kit?.pad ?? []} seats={seats.pad} material={padMat}>
        <cylinderGeometry args={[1, 1, 1, 18]} />
      </KitFamily>
      <KitFamily variants={kit?.stilt ?? []} seats={seats.stilt} material={mastMat}>
        <cylinderGeometry args={[0.5, 0.6, 1, 5]} />
      </KitFamily>
      <KitFamily variants={kit?.works ?? []} seats={seats.works} material={worksMat}>
        <boxGeometry args={[1, 1, 1]} />
      </KitFamily>
      <KitFamily variants={kit?.banner ?? []} seats={seats.banner} material={bannerMat}>
        <boxGeometry args={[1, 1, 1]} />
      </KitFamily>
      <KitFamily variants={kit?.scaffold ?? []} seats={seats.scaffold} material={scaffoldMat}>
        <boxGeometry args={[1, 1, 1]} />
      </KitFamily>
      {FACILITY_KINDS.map((kind) => (
        <FacilitySeats key={kind} kind={kind} seats={seats.facilityKit} material={facilityMat} />
      ))}
      {seats.beacons.map((b, i) => (
        <sprite
          key={`b${i}`}
          ref={(el) => {
            beaconRefs.current[i] = el;
          }}
          position={[b.x, b.y, b.z]}
          scale={[1.1, 1.1, 1]}
          raycast={() => null}
        >
          <primitive object={beaconMat} attach="material" />
        </sprite>
      ))}
      {droneTracks.map((_, i) => (
        <sprite
          key={`d${i}`}
          ref={(el) => {
            droneRefs.current[i] = el;
          }}
          scale={[0.65, 0.65, 1]}
          raycast={() => null}
        >
          <primitive object={droneMat} attach="material" />
        </sprite>
      ))}
    </group>
  );
}
