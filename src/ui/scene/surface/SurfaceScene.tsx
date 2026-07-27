/**
 * The landed world, composed.
 *
 * Mounts when a groundfall session begins and starts baking the height field
 * immediately — the entry plasma exists partly to be beautiful and partly to
 * be a loading screen with a temperature. Everything visible derives from
 * the session descriptor plus the baked tiers: terrain, the liquid line, the
 * sky, the weather, the props, the seams, and the runabout you walk back to.
 *
 * Lighting borrows the scene's permanent rig (sceneLightRig / SceneLamps)
 * instead of mounting lights of its own, because a mounted light recompiles
 * every shader in the game — see SceneLamps.tsx for the receipts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Color,
  Fog,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import { useUiBus, type GroundfallSession } from '../../fx/uiBus';
import { paletteFor } from '../planetMaterial';
import {
  applySurfaceCamera,
  attachSurfaceInput,
  hitsNeeded,
  stepSurface,
  surfaceDeposits,
  surfaceLive,
  surfaceParams,
  surfaceTiers,
  SHIP_PARK,
  SWING_IMPACT,
} from './surfaceControl';
import {
  buildTierTextures,
  createCloudDeckMaterial,
  createCrystalMaterial,
  createDustRingMaterial,
  createLiquidMaterial,
  createPlasmaMaterial,
  createSkyMaterial,
  createTerrainMaterial,
  disposeTierTextures,
} from './surfaceMaterial';
import { terrainGeometry } from './terrainMesh';
import { heightAt, groundNormalAt, scatterSites, PLANET_RADIUS_M, type DepositSpec } from './terrainField';
import { lightRig, releaseLightRig } from '../sceneLightRig';
import { useLamp } from '../SceneLamps';
import { restoreFlightAfterGroundfall } from '../flightControl';

const V1 = new Vector3();
const V2 = new Vector3();
const V3 = new Vector3();
const Q1 = new Quaternion();
const M1 = new Matrix4();
const SEAT = new Object3D();
const UP = new Vector3(0, 1, 0);

/** Sun elevation → daylight factor shared by lights, fog and cloud tint. */
function dayOf(sunY: number): number {
  return Math.max(0, Math.min(1, sunY * 1.6 + 0.12));
}

export function SurfaceScene() {
  const session = useUiBus((b) => b.groundfall);
  if (!session) return null;
  const key = `${session.worldKey}:${session.dir.map((d) => d.toFixed(3)).join(',')}`;
  return <SurfaceSceneInner key={key} session={session} />;
}

function SurfaceSceneInner({ session }: { session: GroundfallSession }) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const [ready, setReady] = useState(surfaceLive.ready);

  const root = useRef<Group>(null);
  const terrain = useRef<Mesh>(null);
  const liquid = useRef<Mesh>(null);
  const skyDome = useRef<Mesh>(null);
  const cloudDeck = useRef<Mesh>(null);
  const plasmaQuad = useRef<Mesh>(null);
  const dustRing = useRef<Mesh>(null);
  const crystals = useRef<InstancedMesh>(null);
  const shipGroup = useRef<Group>(null);
  const dustBornAt = useRef(-10);
  const lastTouchdown = useRef(surfaceLive.touchdownNonce);
  const warmed = useRef(false);
  const fogRef = useRef<Fog | null>(null);
  /** Slow diurnal drift: the sun crawls, shadows live. */
  const sunDrift = useRef(0);

  const suitLamp = useLamp();
  const seamLamp = useLamp();

  const palette = useMemo(() => paletteFor(session.type, session.seed), [session]);

  // Plasma is needed from the first entry frame; it never waits for the bake.
  const plasma = useMemo(() => createPlasmaMaterial(), []);

  // Everything that reads the baked tiers waits for `ready`.
  const built = useMemo(() => {
    if (!ready) return null;
    const p = surfaceParams();
    const tiers = surfaceTiers();
    if (!p || !tiers) return null;
    const tex = buildTierTextures(tiers);
    const terrainB = createTerrainMaterial(palette, tiers, tex);
    const liquidB = createLiquidMaterial(palette, tiers, tex);
    const skyB = createSkyMaterial(palette);
    const cloudsB = createCloudDeckMaterial();
    const crystalB = createCrystalMaterial();
    const dustB = createDustRingMaterial();

    // Session statics.
    const a = session.aspects;
    terrainB.uniforms.seaLevel.value = p.seaLevelM;
    liquidB.uniforms.seaLevel.value = p.seaLevelM;
    const lava = session.type === 'volcanic' ? 1 : 0;
    terrainB.uniforms.lavaOn.value = lava;
    liquidB.uniforms.lavaOn.value = lava;
    const curv = 1 / (2 * PLANET_RADIUS_M[session.size]);
    terrainB.uniforms.curvR2.value = curv;
    liquidB.uniforms.curvR2.value = curv;
    // The snow line: thermal pushes it up; latitude drags it down; an ice
    // world keeps it at the beach no matter what the thermometer says.
    const latDrop = p.latitude * p.latitude * 2600;
    const snow = session.type === 'ice'
      ? -300
      : 220 + a.thermal * 3100 - latDrop;
    terrainB.uniforms.snowLine.value = snow;
    terrainB.uniforms.frost.value =
      Math.max(0, 1 - a.thermal / 0.55) * palette.frostMax * (0.5 + p.latitude * 0.9);
    const vegType: Record<string, number> = {
      terrestrial: 1, ocean: 0.85, desert: 0.5, ice: 0.35, volcanic: 0.28, gasgiant: 0,
    };
    terrainB.uniforms.vegDensity.value = a.bio * (vegType[session.type] ?? 1);
    (skyB.uniforms.density as { value: number }).value = 0.12 + a.atmo * 0.88;
    (skyB.uniforms.sunTint as { value: Color }).value = new Color(session.starHex);
    // No air, no weather: the deck only exists once the Atmo gauge does.
    (cloudsB.uniforms.coverage as { value: number }).value =
      Math.min(0.85, a.atmo * (0.3 + a.hydro * 0.55));
    (cloudsB.uniforms.sunTint as { value: Color }).value = new Color(session.starHex);

    return { p, tiers, tex, terrainB, liquidB, skyB, cloudsB, crystalB, dustB };
  }, [ready, palette, session]);

  // Bake progress → React exactly once.
  useFrame(() => {
    if (!ready && surfaceLive.ready) setReady(true);
  });

  // The walker's hands: pointer-lock look and the shared movement bindings.
  useEffect(() => {
    const canvas = (gl as unknown as { domElement?: HTMLElement }).domElement;
    if (!canvas) return;
    return attachSurfaceInput(canvas);
  }, [gl]);

  // Warm every surface pipeline while the plasma still owns the screen.
  useEffect(() => {
    if (!built || warmed.current || !root.current) return;
    warmed.current = true;
    const r = gl as unknown as { compileAsync?: (s: object, c: object) => Promise<unknown> };
    try {
      void r.compileAsync?.(root.current, camera);
    } catch {
      /* warm-up is never allowed to break the scene */
    }
  }, [built, gl, camera]);

  // Fog + light rig teardown with the session.
  useEffect(() => {
    return () => {
      scene.fog = null;
      fogRef.current = null;
      releaseLightRig();
      if (built) disposeTierTextures(built.tex);
    };
    // built is stable once set; the teardown wants its latest value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, built]);

  // Static prop placements, once the ground exists to stand them on.
  const props = useMemo(() => {
    if (!built) return null;
    const { p, tiers } = built;
    const a = session.aspects;
    const bioK = a.bio * ({ terrestrial: 1, ocean: 0.8, desert: 0.42, ice: 0.25, volcanic: 0.2, gasgiant: 0 }[session.type] ?? 1);
    return {
      rocks: scatterSites(p, tiers, 0x11a, 460, { minR: 5, maxR: 950, maxSlopeY: 0.5, shore: 0.4, scale: [0.35, 2.4] }),
      boulders: scatterSites(p, tiers, 0x22b, 150, { minR: 40, maxR: 2800, maxSlopeY: 0.55, shore: 0.6, scale: [2.2, 7.5] }),
      flora: bioK > 0.04
        ? scatterSites(p, tiers, 0x33c, Math.round(340 * Math.min(1, bioK + 0.12)), { minR: 9, maxR: 780, maxSlopeY: 0.74, shore: 2.2, scale: [0.8, 2.3] })
        : new Float32Array(0),
      shrubs: bioK > 0.04
        ? scatterSites(p, tiers, 0x44d, Math.round(300 * Math.min(1, bioK + 0.2)), { minR: 6, maxR: 520, maxSlopeY: 0.7, shore: 1.4, scale: [0.5, 1.4] })
        : new Float32Array(0),
      shards: session.type === 'ice'
        ? scatterSites(p, tiers, 0x55e, 180, { minR: 12, maxR: 800, maxSlopeY: 0.6, shore: 0.5, scale: [0.8, 3.2] })
        : new Float32Array(0),
      vents: session.type === 'volcanic'
        ? scatterSites(p, tiers, 0x66f, 90, { minR: 20, maxR: 900, maxSlopeY: 0.65, shore: 3, scale: [0.7, 1.8] })
        : new Float32Array(0),
    };
  }, [built, session]);

  // Crystal instance seats (4 shards per seam). `crack` 0–1 tilts and sinks
  // the shards as the pick works them — the seam visibly losing the argument.
  const writeSeamMatrices = (mesh: InstancedMesh, d: DepositSpec, crack: number) => {
    for (let s = 0; s < 4; s++) {
      const a = d.rot + s * 1.7;
      const lean = 0.22 + ((s * 37) % 10) / 21 + crack * (0.28 + (s % 2) * 0.14);
      SEAT.position.set(
        d.x + Math.cos(a) * 0.55 * d.scale,
        d.y - 0.15 - crack * 0.22 * d.scale,
        d.z + Math.sin(a) * 0.55 * d.scale,
      );
      SEAT.quaternion.setFromAxisAngle(V1.set(Math.cos(a + 1.2), 0, Math.sin(a + 1.2)).normalize(), lean);
      const shrink = 1 - crack * 0.16;
      SEAT.scale.set(0.28 * d.scale * shrink, (0.55 + (s % 3) * 0.35) * d.scale * shrink, 0.28 * d.scale * shrink);
      SEAT.updateMatrix();
      mesh.setMatrixAt(d.id * 4 + s, SEAT.matrix);
    }
  };

  useEffect(() => {
    const mesh = crystals.current;
    if (!mesh || !built) return;
    const seams = surfaceDeposits();
    for (const d of seams) writeSeamMatrices(mesh, d, 0);
    mesh.count = seams.length * 4;
    mesh.instanceMatrix.needsUpdate = true;
    // The effect writes by deposit id, so the count must cover the last one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  const minedShown = useRef(new Set<number>());
  const lastHitShown = useRef(surfaceLive.hitNonce);
  const hitFlash = useRef(0);

  // ————— The frame loop: step the state machine, drive every uniform —————
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const t = state.clock.elapsedTime;
    const live = surfaceLive;

    // The rig steps flight during 'entry'; the surface steps itself after.
    if (live.phase !== 'entry') {
      const res = stepSurface(dt, t);
      if (res.done) {
        restoreFlightAfterGroundfall(res.done.pos, res.done.yaw, res.done.pitch);
        return;
      }
      applySurfaceCamera(camera, t);
    }

    const grounded = live.phase !== 'entry';
    if (root.current) root.current.visible = grounded;

    // Plasma quad rides the lens in every phase (it is the transition).
    const pq = plasmaQuad.current;
    if (pq) {
      pq.visible = live.plasma > 0.004;
      if (pq.visible) {
        pq.position.copy(camera.position);
        pq.quaternion.copy(camera.quaternion);
        pq.translateZ(-0.8);
        (plasma.uniforms.intensity as { value: number }).value = live.plasma;
        (plasma.uniforms.tint as { value: Color }).value.copy(palette.atmosphere).lerp(PLASMA_HOT, 0.55);
      }
    }
    if (!built || !grounded) return;

    // Sun: captured at landing, then a slow honest drift.
    sunDrift.current += dt * 0.00045;
    V1.set(session.sunLocal[0], session.sunLocal[1], session.sunLocal[2]).normalize();
    V2.set(0, 0, 1); // drift axis: roughly the site's north-south line
    V1.applyQuaternion(Q1.setFromAxisAngle(V2, sunDrift.current));
    const day = dayOf(V1.y);
    live.sunUp = V1.y;

    // The borrowed global lights.
    lightRig.override = true;
    lightRig.sunPos.copy(V1).multiplyScalar(80_000);
    lightRig.sunColor.set(session.starHex).lerp(new Color(0xff7a3d), Math.max(0, 1 - day) * 0.55);
    lightRig.sunIntensity = 0.1 + day * 3.4;
    lightRig.ambientColor.set(palette.atmosphere).lerp(new Color(0x1c2438), 1 - day * 0.72);
    lightRig.ambientIntensity = 0.1 + day * 0.42 * (0.35 + session.aspects.atmo * 0.65);
    lightRig.fillPos.copy(V1).multiplyScalar(-40_000).setY(20_000);
    lightRig.fillColor.set(palette.atmosphere);
    lightRig.fillIntensity = 0.1 + day * 0.16;

    // Fog breathes with daylight and AIR — the whole point of the Atmo gauge
    // down here. A world without an atmosphere has nothing to scatter: the
    // horizon stays knife-sharp and space-dark. A thick one closes visibility
    // to a proper planetary haze.
    if (!fogRef.current) {
      fogRef.current = new Fog(0x000000, 400, 24_000);
      scene.fog = fogRef.current;
    }
    const fog = fogRef.current;
    const density = 0.12 + session.aspects.atmo * 0.88;
    fog.color
      .set(palette.atmosphere)
      .multiplyScalar((0.24 + day * 0.62) * (0.2 + density * 0.8))
      .lerp(FOG_NIGHT, 1 - day * 0.9);
    const hazyRange = 7_000 + day * 9_000;
    fog.far = 90_000 - (90_000 - hazyRange) * density;
    fog.near = Math.max(180, fog.far * 0.05);

    // Sky + cloud uniforms.
    (built.skyB.uniforms.sunDir as { value: Vector3 }).value.copy(V1);
    (built.cloudsB.uniforms.day as { value: number }).value = day;
    (built.crystalB.uniforms.night as { value: number }).value = 1 - day;

    // Domes follow the walker; the ground plane of the sky stays put.
    skyDome.current?.position.set(camera.position.x, 0, camera.position.z);
    if (cloudDeck.current) {
      cloudDeck.current.position.set(camera.position.x, 1400, camera.position.z);
      cloudDeck.current.visible =
        (built.cloudsB.uniforms.coverage as { value: number }).value > 0.04;
    }
    terrain.current?.position.set(camera.position.x, 0, camera.position.z);
    liquid.current?.position.set(camera.position.x, built.p.seaLevelM, camera.position.z);

    // Suit lamp: the night makes it earn its place on the pool.
    V2.copy(camera.position);
    V3.set(0, 0, -1).applyQuaternion(camera.quaternion);
    V2.addScaledVector(V3, 2.2);
    V2.y += 0.4;
    suitLamp.set(V2, LAMP_WARM, Math.max(0, 1 - day * 1.5) * 30 * (live.phase === 'walk' ? 1 : 0), 34);

    // The nearest live seam glows on the lamp pool; a landing pick spikes it.
    hitFlash.current *= Math.exp(-dt * 9);
    let nearSeam = null as { x: number; y: number; z: number } | null;
    let nearD = 65;
    for (const d of surfaceDeposits()) {
      if (live.mined.has(d.id)) continue;
      const dd = Math.hypot(d.x - camera.position.x, d.z - camera.position.z);
      if (dd < nearD) {
        nearD = dd;
        nearSeam = d;
      }
    }
    if (nearSeam) {
      V2.set(nearSeam.x, nearSeam.y + 1.6, nearSeam.z);
      seamLamp.set(V2, LAMP_SEAM, 6 + (1 - day) * 16 + hitFlash.current, 26);
    } else {
      seamLamp.setIntensity(0);
    }

    // Each landed hit cracks the seam a little further.
    if (live.hitNonce !== lastHitShown.current) {
      lastHitShown.current = live.hitNonce;
      hitFlash.current = 26;
      const mesh2 = crystals.current;
      const worked = live.target;
      if (mesh2 && worked && !live.mined.has(worked.id)) {
        const crack = (live.hits.get(worked.id) ?? 0) / hitsNeeded(worked.richness);
        writeSeamMatrices(mesh2, worked, Math.min(1, crack));
        mesh2.instanceMatrix.needsUpdate = true;
      }
    }

    // Newly worked seams collapse out of the instance list.
    const mesh = crystals.current;
    if (mesh && live.mined.size !== minedShown.current.size) {
      for (const id of live.mined) {
        if (minedShown.current.has(id)) continue;
        minedShown.current.add(id);
        for (let s = 0; s < 4; s++) {
          M1.makeScale(0, 0, 0);
          mesh.setMatrixAt(id * 4 + s, M1);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Touchdown dust.
    if (live.touchdownNonce !== lastTouchdown.current) {
      lastTouchdown.current = live.touchdownNonce;
      dustBornAt.current = t;
      if (dustRing.current) {
        dustRing.current.position.set(SHIP_PARK.x, heightAt(built.p, built.tiers, SHIP_PARK.x, SHIP_PARK.z) + 0.6, SHIP_PARK.z);
      }
    }
    const dustAge = t - dustBornAt.current;
    if (dustRing.current) {
      const alive = dustAge < 2.4;
      dustRing.current.visible = alive;
      if (alive) {
        const k = dustAge / 2.4;
        dustRing.current.scale.setScalar(4 + k * 30);
        (built.dustB.uniforms.life as { value: number }).value = k;
        (built.dustB.uniforms.tint as { value: Color }).value.copy(palette.low).multiplyScalar(0.5 + day * 0.6);
      }
    }

    // The ship's beacon breathes; its floods come on for the night.
    const ship = shipGroup.current;
    if (ship) {
      const beacon = ship.getObjectByName('gf-beacon') as Mesh | null;
      const mat = beacon?.material as MeshBasicMaterial | undefined;
      if (mat) mat.opacity = 0.55 + Math.sin(t * 2.6) * 0.45;
    }
  });

  // ————— Static composition —————
  const shipPose = useMemo(() => {
    if (!built) return null;
    const y = heightAt(built.p, built.tiers, SHIP_PARK.x, SHIP_PARK.z);
    groundNormalAt(built.p, built.tiers, SHIP_PARK.x, SHIP_PARK.z, V1);
    const q = new Quaternion().setFromUnitVectors(UP, V1.clone().lerp(UP, 0.6).normalize());
    return { y, q };
  }, [built]);

  return (
    <>
      {/* The transition rides outside the world group: it exists in every phase. */}
      <mesh ref={plasmaQuad} visible={false} frustumCulled={false} renderOrder={999} material={plasma.mat}>
        <planeGeometry args={[3.4, 2.2]} />
      </mesh>

      <group ref={root} visible={false} name="groundfall">
        {built && (
          <>
            <mesh ref={terrain} geometry={terrainGeometry()} material={built.terrainB.mat} frustumCulled={false} />
            <mesh ref={liquid} material={built.liquidB.mat} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
              <planeGeometry args={[70_000, 70_000, 1, 1]} />
            </mesh>
            <mesh ref={skyDome} material={built.skyB.mat} frustumCulled={false} renderOrder={-10}>
              <sphereGeometry args={[52_000, 48, 24]} />
            </mesh>
            <mesh ref={cloudDeck} material={built.cloudsB.mat} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
              <planeGeometry args={[64_000, 64_000, 1, 1]} />
            </mesh>

            {props && <ScatterProps palette={palette} props={props} />}

            <instancedMesh
              ref={crystals}
              args={[undefined, undefined, surfaceDeposits().length * 4]}
              material={built.crystalB.mat}
              frustumCulled={false}
            >
              <octahedronGeometry args={[0.7, 0]} />
            </instancedMesh>

            <mesh ref={dustRing} visible={false} material={built.dustB.mat} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2, 2]} />
            </mesh>

            <Pickaxe />
            <ImpactShards gravity={built.p.gravity} />

            {shipPose && (
              <group ref={shipGroup} position={[SHIP_PARK.x, shipPose.y, SHIP_PARK.z]} quaternion={shipPose.q}>
                <LandedRunabout />
              </group>
            )}
          </>
        )}
      </group>
    </>
  );
}

const LAMP_WARM = new Color(0xffe8c4);
const LAMP_SEAM = new Color(0x6fe0ff);
const PLASMA_HOT = new Color(0xff7a33);
const FOG_NIGHT = new Color(0x05060a);

// ————— Props —————

function ScatterProps({
  palette,
  props,
}: {
  palette: ReturnType<typeof paletteFor>;
  props: {
    rocks: Float32Array;
    boulders: Float32Array;
    flora: Float32Array;
    shrubs: Float32Array;
    shards: Float32Array;
    vents: Float32Array;
  };
}) {
  const rockMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.high.clone().multiplyScalar(0.82);
    m.roughness = 0.96;
    m.flatShading = true;
    return m;
  }, [palette]);
  const floraMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.vegetation.clone();
    m.roughness = 0.9;
    m.flatShading = true;
    return m;
  }, [palette]);
  const shrubMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.vegetation.clone().multiplyScalar(0.72);
    m.roughness = 0.95;
    m.flatShading = true;
    return m;
  }, [palette]);
  const shardMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.ice.clone();
    m.roughness = 0.18;
    m.flatShading = true;
    return m;
  }, [palette]);
  const ventMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x241a17);
    m.emissive = palette.emissive.getHex() === 0 ? new Color(0xff4d1a) : palette.emissive.clone();
    m.emissiveIntensity = 1.4;
    m.roughness = 0.9;
    m.flatShading = true;
    return m;
  }, [palette]);

  return (
    <>
      <PropCloud seats={props.rocks} material={rockMat} squash={0.62}>
        <icosahedronGeometry args={[1, 1]} />
      </PropCloud>
      <PropCloud seats={props.boulders} material={rockMat} squash={0.7}>
        <icosahedronGeometry args={[1, 1]} />
      </PropCloud>
      <PropCloud seats={props.flora} material={floraMat} squash={3.4} lift={1}>
        <coneGeometry args={[0.5, 1, 6]} />
      </PropCloud>
      <PropCloud seats={props.shrubs} material={shrubMat} squash={0.75} lift={0.5}>
        <icosahedronGeometry args={[0.7, 0]} />
      </PropCloud>
      <PropCloud seats={props.shards} material={shardMat} squash={2.6} lift={0.55}>
        <octahedronGeometry args={[0.6, 0]} />
      </PropCloud>
      <PropCloud seats={props.vents} material={ventMat} squash={0.9} lift={0.85}>
        <coneGeometry args={[1, 1.4, 7]} />
      </PropCloud>
    </>
  );
}

/** One instanced prop family placed on its precomputed seats. */
function PropCloud({
  seats,
  material,
  squash,
  lift = 0,
  children,
}: {
  seats: Float32Array;
  material: MeshStandardNodeMaterial;
  squash: number;
  lift?: number;
  children: React.ReactNode;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const count = seats.length / 5;
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      const k = i * 5;
      const s = seats[k + 3]!;
      // lift=1 stands a unit-height prop's base on the ground; 0 half-buries.
      SEAT.position.set(seats[k]!, seats[k + 1]! + lift * s * squash * 0.5 - 0.12, seats[k + 2]!);
      SEAT.quaternion.setFromAxisAngle(UP, seats[k + 4]!);
      SEAT.scale.set(s, s * squash, s);
      SEAT.updateMatrix();
      m.setMatrixAt(i, SEAT.matrix);
    }
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
  }, [seats, squash, lift, count]);
  if (count === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} material={material} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
}

// ————— The parked runabout, at human scale —————

/**
 * The same silhouette the chase camera knows, seven times larger and standing
 * on legs. Deliberately hand-placed geometry rather than a reuse of
 * RunaboutExterior, which is welded to flightLive.
 */
function LandedRunabout() {
  return (
    <group scale={5.5} rotation={[0, 0.6, 0]}>
      {/* Emissive floors match the flight exterior: parked at night, the hull
          still reads as a ship rather than a hole in the landscape. */}
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 0.14, 0.1]} rotation={[0, x < 0 ? -0.24 : 0.24, x < 0 ? -0.025 : 0.025]}>
          <boxGeometry args={[0.62, 0.045, 0.3]} />
          <meshStandardMaterial color={0x34425b} emissive={0x0b1524} emissiveIntensity={0.65} roughness={0.42} metalness={0.68} />
        </mesh>
      ))}
      <mesh position={[0, 0.19, -0.08]} scale={[0.3, 0.18, 0.72]}>
        <sphereGeometry args={[1, 14, 7]} />
        <meshStandardMaterial color={0x313a4d} emissive={0x0b1019} emissiveIntensity={0.7} roughness={0.34} metalness={0.72} flatShading />
      </mesh>
      <mesh position={[0, 0.16, -0.61]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.205, 0.48, 8]} />
        <meshStandardMaterial color={0x252d3f} emissive={0x090d16} emissiveIntensity={0.6} roughness={0.38} metalness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 0.33, -0.26]} scale={[0.19, 0.105, 0.29]}>
        <sphereGeometry args={[1, 14, 6]} />
        <meshStandardMaterial color={0x2a6673} emissive={0x123744} emissiveIntensity={1.15} roughness={0.12} metalness={0.28} transparent opacity={0.92} />
      </mesh>
      {[-0.34, 0.34].map((x) => (
        <group key={x} position={[x, 0.11, 0.28]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.115, 0.62, 10]} />
            <meshStandardMaterial color={0x26344b} emissive={0x091525} emissiveIntensity={0.7} roughness={0.3} metalness={0.82} flatShading />
          </mesh>
        </group>
      ))}
      {/* Landing gear: three struts and their pads. */}
      {[[-0.42, 0.34], [0.42, 0.34], [0, -0.52]].map(([x, z], i) => (
        <group key={i} position={[x!, 0, z!]}>
          <mesh position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.022, 0.03, 0.16, 6]} />
            <meshStandardMaterial color={0x596579} roughness={0.5} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.005, 0]}>
            <cylinderGeometry args={[0.085, 0.1, 0.02, 8]} />
            <meshStandardMaterial color={0x39414f} roughness={0.7} metalness={0.5} />
          </mesh>
        </group>
      ))}
      {/* Service stripe and the beacon the frame loop breathes. */}
      <mesh position={[0, 0.37, 0.18]}>
        <boxGeometry args={[0.018, 0.012, 0.44]} />
        <meshStandardMaterial color={0xc28a49} emissive={0x3b210d} emissiveIntensity={1.1} />
      </mesh>
      <mesh name="gf-beacon" position={[0, 0.42, 0.36]}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <meshBasicMaterial color={0xffbb65} transparent opacity={0.8} toneMapped={false} />
      </mesh>
      {/* Boarding floods: warm cones of light-colored geometry, not lights. */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.1, 0.52]} rotation={[0.9, 0, 0]}>
          <coneGeometry args={[0.06, 0.2, 8, 1, true]} />
          <meshBasicMaterial color={0xffe2b0} transparent opacity={0.16} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ————— The pick —————

/** Piecewise swing: wind up, strike hard, recover soft. Radians about X. */
function swingAngle(s: number): number {
  const REST = -0.66;
  const WINDUP = -1.42;
  const STRIKE = 0.82;
  if (s <= 0) return REST;
  if (s < 0.35) {
    const k = s / 0.35;
    return REST + (WINDUP - REST) * (1 - (1 - k) * (1 - k));
  }
  if (s < SWING_IMPACT) {
    const k = (s - 0.35) / (SWING_IMPACT - 0.35);
    return WINDUP + (STRIKE - WINDUP) * k * k * k;
  }
  const k = Math.min(1, (s - SWING_IMPACT) / (1 - SWING_IMPACT));
  const soft = k * k * (3 - 2 * k);
  return STRIKE + (REST - STRIKE) * soft;
}

/**
 * The first-person pickaxe. A viewmodel in the classic sense: welded to the
 * lens with its own depth privileges so a wall can never amputate it, swaying
 * against look and stride, and swinging on the cadence the control layer
 * dictates — the impact frame there is the impact frame here.
 */
function Pickaxe() {
  const camera = useThree((s) => s.camera);
  const root = useRef<Group>(null);
  const pivot = useRef<Group>(null);
  const lag = useRef({ yaw: 0, pitch: 0, x: 0, y: 0 });

  useFrame((state, dtRaw) => {
    const g = root.current;
    const p = pivot.current;
    if (!g || !p) return;
    const live = surfaceLive;
    const visible = live.phase === 'walk';
    g.visible = visible;
    if (!visible) return;
    const dt = Math.min(dtRaw, 0.1);

    // Look lag: the tool trails the eyes by a beat and settles.
    const l = lag.current;
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const dy = wrap(live.yaw - l.yaw);
    const dp = live.pitch - l.pitch;
    l.yaw = live.yaw;
    l.pitch = live.pitch;
    const k = 1 - Math.exp(-dt * 9);
    l.x += (-dy * 0.6 - l.x) * k;
    l.y += (dp * 0.5 - l.y) * k;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.translateX(0.3 + l.x * 0.4);
    g.translateY(-0.34 + live.bob * 0.5 + l.y * 0.4 - live.kick * 0.02);
    g.translateZ(-0.52);

    const ang = swingAngle(live.swing);
    p.rotation.set(ang, -0.3 + ang * 0.08 + l.x, -0.22 + ang * 0.05);
    void state;
  });

  // A viewmodel is its own worst lighting rig — the camera side is always the
  // shadow side — so the metals carry a faint self-light to stay legible
  // against bright ground.
  const steel = { color: 0xb8c2ce, emissive: 0x2a323d, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.85, depthTest: false } as const;
  const haft = { color: 0x6a5138, emissive: 0x1e150b, emissiveIntensity: 0.6, roughness: 0.8, metalness: 0.05, depthTest: false } as const;
  return (
    <group ref={root} visible={false}>
      <group ref={pivot} position={[0, -0.06, 0]} rotation={[-0.66, -0.3, -0.22]} scale={0.72}>
        {/* Haft, grip wrap, and the head assembly at the top. */}
        <mesh position={[0, 0.22, 0]} renderOrder={520}>
          <cylinderGeometry args={[0.016, 0.02, 0.5, 8]} />
          <meshStandardMaterial {...haft} />
        </mesh>
        <mesh position={[0, 0.03, 0]} renderOrder={520}>
          <cylinderGeometry args={[0.021, 0.022, 0.13, 8]} />
          <meshStandardMaterial color={0x3a332b} emissive={0x120e09} emissiveIntensity={0.6} roughness={0.9} metalness={0} depthTest={false} />
        </mesh>
        <mesh position={[0, 0.47, 0]} renderOrder={521}>
          <boxGeometry args={[0.045, 0.05, 0.2]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {/* The business end: a spike forward, a chisel back. */}
        <mesh position={[0, 0.47, -0.2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={521}>
          <coneGeometry args={[0.026, 0.22, 6]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        <mesh position={[0, 0.47, 0.14]} renderOrder={521}>
          <boxGeometry args={[0.06, 0.028, 0.1]} />
          <meshStandardMaterial {...steel} />
        </mesh>
      </group>
    </group>
  );
}

// ————— Impact shards —————

const SHARD_MAX = 48;

/**
 * Crystal chips. A tiny CPU pool: each landed hit throws a handful from the
 * impact point, a broken seam throws a fistful, gravity does the rest.
 */
function ImpactShards({ gravity }: { gravity: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const pool = useMemo(
    () => ({
      pos: new Float32Array(SHARD_MAX * 3),
      vel: new Float32Array(SHARD_MAX * 3),
      life: new Float32Array(SHARD_MAX),
      size: new Float32Array(SHARD_MAX),
      spin: new Float32Array(SHARD_MAX),
      next: 0,
    }),
    [],
  );
  const lastHit = useRef(surfaceLive.hitNonce);
  const lastBreak = useRef(surfaceLive.mineNonce);

  useFrame((state, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.1);
    const live = surfaceLive;

    const burst = (count: number, speed: number, size: number) => {
      for (let n = 0; n < count; n++) {
        const i = pool.next;
        pool.next = (pool.next + 1) % SHARD_MAX;
        const a = Math.random() * Math.PI * 2;
        const up = 0.35 + Math.random() * 0.65;
        const horiz = Math.sqrt(Math.max(0, 1 - up * up));
        pool.pos[i * 3] = live.hitAt.x;
        pool.pos[i * 3 + 1] = live.hitAt.y;
        pool.pos[i * 3 + 2] = live.hitAt.z;
        const v = speed * (0.6 + Math.random() * 0.8);
        pool.vel[i * 3] = Math.cos(a) * horiz * v;
        pool.vel[i * 3 + 1] = up * v;
        pool.vel[i * 3 + 2] = Math.sin(a) * horiz * v;
        pool.life[i] = 1;
        pool.size[i] = size * (0.6 + Math.random() * 0.9);
        pool.spin[i] = (Math.random() - 0.5) * 14;
      }
    };
    if (live.hitNonce !== lastHit.current) {
      lastHit.current = live.hitNonce;
      burst(9, 2.6, 0.045);
    }
    if (live.mineNonce !== lastBreak.current) {
      lastBreak.current = live.mineNonce;
      burst(24, 4.2, 0.085);
    }

    const t = state.clock.elapsedTime;
    for (let i = 0; i < SHARD_MAX; i++) {
      if (pool.life[i]! <= 0) {
        M1.makeScale(0, 0, 0);
        m.setMatrixAt(i, M1);
        continue;
      }
      pool.life[i]! -= dt / 0.75;
      pool.vel[i * 3 + 1]! -= gravity * dt;
      pool.pos[i * 3]! += pool.vel[i * 3]! * dt;
      pool.pos[i * 3 + 1]! += pool.vel[i * 3 + 1]! * dt;
      pool.pos[i * 3 + 2]! += pool.vel[i * 3 + 2]! * dt;
      SEAT.position.set(pool.pos[i * 3]!, pool.pos[i * 3 + 1]!, pool.pos[i * 3 + 2]!);
      SEAT.quaternion.setFromAxisAngle(UP, t * pool.spin[i]!);
      const s = pool.size[i]! * Math.max(0, pool.life[i]!);
      SEAT.scale.set(s, s, s);
      SEAT.updateMatrix();
      m.setMatrixAt(i, SEAT.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SHARD_MAX]} frustumCulled={false}>
      <tetrahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={0x9ff0ff}
        emissive={0x48c8e8}
        emissiveIntensity={0.9}
        roughness={0.25}
        metalness={0.1}
      />
    </instancedMesh>
  );
}

