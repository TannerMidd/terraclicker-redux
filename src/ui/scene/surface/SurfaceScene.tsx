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
  Euler,
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
  MINING_VERBS,
  stepSurface,
  surfaceDeposits,
  surfaceLive,
  surfaceParams,
  surfaceProspects,
  surfaceSeamCensus,
  surfaceTiers,
  verbHitsNow,
  SHIP_PARK,
  SWING_IMPACT,
} from './surfaceControl';
import { SurfaceWeather } from './WeatherFX';
import { Landmarks } from './Landmarks';
import { Settlements } from './Settlements';
import { Ecology } from './Ecology';
import { Marks } from './Marks';
import { Decals } from './Decals';
import {
  groundBundle,
  GROUND_TYPE_INDEX,
  kitGeometryFit,
  upliftActive,
  upliftFamilyMaterial,
  upliftTex,
  upliftTier,
} from '../uplift/upliftAssets';
import { RefitPods, runaboutGeometry, shipMaterial, skimmerGeometry, type RefitPodSpec } from '../uplift/shipKit';
import type { BufferGeometry } from 'three/webgpu';
import {
  buildTierTextures,
  CLOUD_SLICES,
  createCloudDeckMaterial,
  createCrystalMaterial,
  createDustRingMaterial,
  createLiquidMaterial,
  createPlasmaMaterial,
  createSkyMaterial,
  createTerrainMaterial,
  disposeTierTextures,
  refreshTierTextures,
} from './surfaceMaterial';
import { terrainGeometry } from './terrainMesh';
import {
  heightAt,
  groundNormalAt,
  scatterChunk,
  PLANET_RADIUS_M,
  type SurfaceParams,
  type SurfaceTiers,
} from './terrainField';
import type { DepositSpec } from './surfaceSites';
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
/** The ship's own pose scratch — airborne attitude, or the pad it sits on. */
const SHIP_EUL = new Euler(0, 0, 0, 'YXZ');
const SHIP_Q = new Quaternion();
const SHIP_YAW_Q = new Quaternion();

/** Sun elevation → daylight factor shared by lights, fog and cloud tint. */
function dayOf(sunY: number): number {
  return Math.max(0, Math.min(1, sunY * 1.6 + 0.12));
}

function smooth01Blend(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}

/** Prospect stakes the instance pool can seat. A region rarely grows ten. */
const STAKE_MAX = 32;

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
  const sweepRing = useRef<Mesh>(null);
  const sweepBornAt = useRef(-10);
  const lastSweep = useRef(surfaceLive.sweepNonce);
  const dustBornAt = useRef(-10);
  const lastTouchdown = useRef(surfaceLive.touchdownNonce);
  /** Ground pose of the parked ship, recomputed only when the pad moves. */
  const padKey = useRef('');
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
    // The Tier-1 pack, if quality wants it AND it has finished transcoding —
    // a session that bakes before the pack lands simply stays procedural,
    // which is the fallback law working as written.
    const assetTier = upliftTier();
    const bundle = assetTier ? groundBundle() : null;
    const ground = bundle
      ? { bundle, typeIndex: GROUND_TYPE_INDEX[session.type] ?? 0, rich: assetTier === 'a' }
      : null;
    const terrainB = createTerrainMaterial(palette, tiers, tex, ground);
    const liquidB = createLiquidMaterial(palette, tiers, tex, bundle?.shore ?? null);
    // The sky's own pack (4.1/4.3/4.6): each piece is optional and the dome
    // degrades to arithmetic per piece — same fallback law as the ground.
    const skyLut = assetTier ? upliftTex('textures/sky/sky-gradient-luts.ktx2', { layers: 6, srgb: true }) : null;
    const skyB = createSkyMaterial(
      palette,
      skyLut
        ? {
            lut: skyLut,
            typeIndex: GROUND_TYPE_INDEX[session.type] ?? 0,
            aurora: upliftTex('textures/sky/aurora-bioluminescence-ramp.ktx2', {}),
          }
        : null,
    );
    const cloudDeckTex = assetTier ? upliftTex('textures/sky/cloud-deck-array.ktx2', { repeat: true, layers: 4 }) : null;
    const cloudFlowTex = assetTier ? upliftTex('textures/sky/cloud-flow.ktx2', { repeat: true }) : null;
    const cloudsB = createCloudDeckMaterial(
      cloudDeckTex && cloudFlowTex ? { deck: cloudDeckTex, flow: cloudFlowTex } : null,
    );
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
    // Aurora strength: the Biotic gauge, once it has something to glow with.
    (skyB.uniforms.aurora as { value: number }).value =
      session.type === 'gasgiant' ? 0 : Math.max(0, a.bio - 0.5) * 2;
    // No air, no weather: the deck only exists once the Atmo gauge does.
    const baseCoverage = Math.min(0.85, a.atmo * (0.3 + a.hydro * 0.55));
    (cloudsB.uniforms.coverage as { value: number }).value = baseCoverage;
    (cloudsB.uniforms.sunTint as { value: Color }).value = new Color(session.starHex);

    return { p, tiers, tex, terrainB, liquidB, skyB, cloudsB, crystalB, dustB, baseCoverage };
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

  // Fog must exist BEFORE the warm-up compiles a single pipeline: the node
  // renderer bakes fog support into the shader graph at build time, so a
  // material warmed against a fogless scene ignores scene.fog forever after
  // — measured as a dust front with 400 m visibility and a crisp horizon.
  // Declared above the warm-up effect on purpose; React runs them in order.
  useEffect(() => {
    if (!built) return;
    if (!fogRef.current) fogRef.current = new Fog(0x000000, 400, 24_000);
    scene.fog = fogRef.current;
  }, [built, scene]);

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

  // Prop density knob shared by the chunked families (bio gates greenery).
  const bioK = useMemo(() => {
    const a = session.aspects;
    return a.bio * ({ terrestrial: 1, ocean: 0.8, desert: 0.42, ice: 0.25, volcanic: 0.2, gasgiant: 0 }[session.type] ?? 1);
  }, [session]);

  // The mark kit's flagged prospect stake (2.6), seated exactly like the pole
  // it replaces — centred, 1.35 m tall, the instance matrices unchanged.
  const stakeKit = useMemo(() => {
    if (!upliftActive()) return null;
    const geometry = kitGeometryFit('meshes/marks/mark-kit.glb', 'prospect-stake', { mode: 'height', height: 1.35 });
    if (!geometry) return null;
    return {
      geometry,
      material: upliftFamilyMaterial({ tint: new Color(0xd98d2b), gain: 2.2, roughness: 0.8 }),
    };
  }, []);

  // Site ids are planet-fixed strings; instances are numbered seats. The slot
  // map is the bridge, built once per landing from the CENSUS order — the
  // census includes buried seams, so a dust front can raise them into seats
  // that already exist instead of anybody reallocating an instance buffer.
  const seams = useMemo(() => (built ? surfaceSeamCensus() : []), [built]);
  const seamSlots = useMemo(
    () => new Map(seams.map((d, i) => [d.id, i])),
    [seams],
  );

  // The authored seam cluster (2.7), fitted to the octahedron's own extent so
  // the seats keep working. Per-session like the rest of the surface: a kit
  // that has not landed leaves this landing on primitives.
  const seamShard = useMemo(
    () =>
      upliftActive()
        ? kitGeometryFit('meshes/seams/crystal-seam-kit.glb', 'crystal-shard', {
            mode: 'extent',
            extent: 1.4,
          })
        : null,
    [],
  );
  /**
   * Cross-section of a seated shard. The octahedron was a fat solid squeezed
   * thin (0.28); the modelled cluster is already slender inside its own box,
   * so it needs far less squeezing to end up the same width on screen. The
   * HEIGHT term is unchanged — both geometries are fitted to the same extent.
   */
  const seamWidth = seamShard ? 0.62 : 0.28;

  // Crystal instance seats (4 shards per seam). `crack` 0–1 tilts and sinks
  // the shards as the pick works them — the seam visibly losing the argument.
  const writeSeamMatrices = (mesh: InstancedMesh, d: DepositSpec, slot: number, crack: number) => {
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
      const w = seamWidth * d.scale * shrink;
      SEAT.scale.set(w, (0.55 + (s % 3) * 0.35) * d.scale * shrink, w);
      SEAT.updateMatrix();
      mesh.setMatrixAt(slot * 4 + s, SEAT.matrix);
    }
  };

  useEffect(() => {
    const mesh = crystals.current;
    if (!mesh || !built) return;
    seams.forEach((d, i) => {
      if (d.buried && !surfaceLive.buriedRevealed) {
        for (let s = 0; s < 4; s++) {
          M1.makeScale(0, 0, 0);
          mesh.setMatrixAt(i * 4 + s, M1);
        }
      } else {
        writeSeamMatrices(mesh, d, i, 0);
      }
    });
    mesh.count = seams.length * 4;
    mesh.instanceMatrix.needsUpdate = true;
    // The effect writes by census slot, so the count must cover the last one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, seams]);

  const minedShown = useRef(new Set<string>());
  const lastHitShown = useRef(surfaceLive.hitNonce);
  const hitFlash = useRef(0);
  const lastReveal = useRef(surfaceLive.revealNonce);
  /** Terrain re-centre epoch mirrored into React for the memoised seats. */
  const [epoch, setEpoch] = useState(0);
  const epochShown = useRef(0);
  /** Mark plantings mirrored the same way — a mark stands the frame it lands. */
  const [markSeat, setMarkSeat] = useState(0);
  const marksShown = useRef(0);
  /** Smoothed weather visibility so a front arrives instead of switching on. */
  const visSmooth = useRef(1);
  /** Prospect stakes standing (prior landings + this stay). */
  const stakes = useRef<InstancedMesh>(null);
  const stakesShown = useRef(-1);

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

    // The weather standing over the walk, smoothed so fronts ARRIVE.
    const wx = live.weather;
    visSmooth.current += (wx.visibility - visSmooth.current) * Math.min(1, dt * 0.9);
    const vis = visSmooth.current;
    const gloom = Math.min(1, (1 - vis) * 1.15);

    // The borrowed global lights. A front eats the sun; lightning gives some
    // of it back for a frame or two.
    lightRig.override = true;
    lightRig.sunPos.copy(V1).multiplyScalar(80_000);
    lightRig.sunColor.set(session.starHex).lerp(new Color(0xff7a3d), Math.max(0, 1 - day) * 0.55);
    lightRig.sunIntensity = (0.1 + day * 3.4) * (1 - gloom * 0.55);
    lightRig.ambientColor.set(palette.atmosphere).lerp(new Color(0x1c2438), 1 - day * 0.72);
    lightRig.ambientIntensity =
      0.1 + day * 0.42 * (0.35 + session.aspects.atmo * 0.65) + live.skyFlash * 1.7;
    lightRig.fillPos.copy(V1).multiplyScalar(-40_000).setY(20_000);
    lightRig.fillColor.set(palette.atmosphere);
    lightRig.fillIntensity = 0.1 + day * 0.16;

    // Fog breathes with daylight and AIR — the whole point of the Atmo gauge
    // down here. A world without an atmosphere has nothing to scatter: the
    // horizon stays knife-sharp and space-dark. A thick one closes visibility
    // to a proper planetary haze. Weather closes it further: a whiteout is
    // the fog doing exactly what the word says.
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
    if (gloom > 0.01) {
      const tint =
        wx.kind === 'dust'
          ? FOG_SCRATCH.copy(palette.low).multiplyScalar(0.55 + day * 0.5)
          : WEATHER_FOG[wx.kind];
      if (tint) fog.color.lerp(tint, gloom * 0.8);
    }
    const hazyRange = 7_000 + day * 9_000;
    let far = 90_000 - (90_000 - hazyRange) * density;
    if (gloom > 0.01) {
      // Weather imposes an ABSOLUTE ceiling, not a multiplier: an airless
      // world's fog is nearly infinite and a fraction of infinite is still
      // no dust front. A hard front closes to a few hundred metres; clear
      // skies on the same world keep their knife-sharp horizon untouched.
      const cap = 120 + 9_000 * vis * vis * vis;
      const bite = smooth01Blend(gloom / 0.5);
      far += (Math.min(far, cap) - far) * bite;
    }
    fog.far = far;
    fog.near = Math.max(24, far * (0.012 + 0.04 * vis));

    // Sky + cloud uniforms. The dome wears the same tint as the fog, so the
    // haze on the ground and the ceiling overhead are one weather system.
    (built.skyB.uniforms.sunDir as { value: Vector3 }).value.copy(V1);
    (built.skyB.uniforms.flash as { value: number }).value = live.skyFlash;
    (built.skyB.uniforms.gloom as { value: number }).value = gloom;
    if (gloom > 0.01) {
      const gt = built.skyB.uniforms.gloomTint as { value: Color };
      gt.value.copy(fog.color);
      // The fog colour already carries day; brighten a touch so the dome
      // reads as lit cloud rather than a lid of the same mud as the ground.
      gt.value.multiplyScalar(1.25);
    }
    (built.cloudsB.uniforms.day as { value: number }).value = day;
    const stormy =
      wx.kind === 'rain' || wx.kind === 'storm' || wx.kind === 'ash' || wx.kind === 'whiteout';
    (built.cloudsB.uniforms.coverage as { value: number }).value = Math.min(
      0.92,
      built.baseCoverage + (stormy ? wx.intensity * 0.4 : 0),
    );
    // The weather picks which authored sheet the deck wears (4.1).
    (built.cloudsB.uniforms.slice as { value: number }).value =
      wx.kind === 'dust'
        ? CLOUD_SLICES.dust
        : stormy
          ? CLOUD_SLICES.storm
          : built.baseCoverage < 0.28
            ? CLOUD_SLICES.cirrus
            : CLOUD_SLICES.cumulus;
    (built.crystalB.uniforms.night as { value: number }).value = 1 - day;

    // The ground rolled under a traveller: a tier re-centre committed. Push
    // the fresh arrays to the GPU, move the sampling centres, and re-seat
    // everything that stands on baked height — the control layer already
    // re-read seam and landmark y from the more honest ground.
    if (live.terrainEpoch !== epochShown.current) {
      epochShown.current = live.terrainEpoch;
      refreshTierTextures(built.tex, built.tiers, live.terrainEpochTier);
      const meshE = crystals.current;
      if (meshE) {
        seams.forEach((d, i) => {
          if (live.mined.has(d.id)) return;
          if (d.buried && !live.buriedRevealed) return;
          const crack = Math.min(1, (live.hits.get(d.id) ?? 0) / hitsNeeded(d.richness));
          writeSeamMatrices(meshE, d, i, crack);
        });
        meshE.instanceMatrix.needsUpdate = true;
      }
      stakesShown.current = -1; // stakes re-seat on their next pass
      setEpoch(live.terrainEpoch); // landmarks + ship pose re-memoise
    }

    if (live.markNonce !== marksShown.current) {
      marksShown.current = live.markNonce;
      setMarkSeat(live.markNonce);
    }

    // A dust front has moved the sand: seat the seams it uncovered.
    if (live.revealNonce !== lastReveal.current) {
      lastReveal.current = live.revealNonce;
      const mesh0 = crystals.current;
      if (mesh0) {
        seams.forEach((d, i) => {
          if (d.buried && !live.mined.has(d.id)) writeSeamMatrices(mesh0, d, i, 0);
        });
        mesh0.instanceMatrix.needsUpdate = true;
      }
    }

    // Domes follow the walker; the ground plane of the sky stays put.
    skyDome.current?.position.set(camera.position.x, 0, camera.position.z);
    if (cloudDeck.current) {
      cloudDeck.current.position.set(camera.position.x, 1400, camera.position.z);
      cloudDeck.current.visible =
        (built.cloudsB.uniforms.coverage as { value: number }).value > 0.04;
    }
    terrain.current?.position.set(camera.position.x, 0, camera.position.z);
    liquid.current?.position.set(camera.position.x, built.p.seaLevelM, camera.position.z);

    // Suit lamp: the night makes it earn its place on the pool. Airborne in
    // the chase seat it changes jobs and becomes a hull flood — the scene is
    // lit for a landscape, and a dark ship in front of one is a silhouette
    // with a canopy, which is not what anybody bought.
    if (live.phase === 'fly' && live.chaseView) {
      // Above and behind, on the camera's side of the hull — the sun is
      // wherever the sun is, and the flank you are looking at is usually
      // the one it is not on.
      V3.set(0, 0, -1).applyQuaternion(camera.quaternion);
      V2.copy(live.pos).addScaledVector(V3, -7);
      V2.y += 4.5;
      suitLamp.set(V2, LAMP_WARM, 95, 30);
    } else {
      V2.copy(camera.position);
      V3.set(0, 0, -1).applyQuaternion(camera.quaternion);
      V2.addScaledVector(V3, 2.2);
      V2.y += 0.4;
      suitLamp.set(
        V2,
        LAMP_WARM,
        Math.max(0, 1 - day * 1.5) * 30 * (live.phase === 'walk' || live.phase === 'skim' ? 1 : 0),
        34,
      );
    }

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

    // Each landed hit cracks the seam a little further. The crack tracks the
    // ACTIVE verb's swing count — a precision core cracks slowly on purpose.
    if (live.hitNonce !== lastHitShown.current) {
      lastHitShown.current = live.hitNonce;
      hitFlash.current = 26;
      const mesh2 = crystals.current;
      const worked = live.target;
      const slot = worked ? seamSlots.get(worked.id) : undefined;
      if (mesh2 && worked && slot !== undefined && !live.mined.has(worked.id)) {
        const verb = MINING_VERBS[live.verbIdx] ?? 'break';
        const crack = (live.hits.get(worked.id) ?? 0) / verbHitsNow(verb, worked.richness);
        writeSeamMatrices(mesh2, worked, slot, Math.min(1, crack));
        mesh2.instanceMatrix.needsUpdate = true;
      }
    }

    // Newly spent seams collapse out of the instance list.
    const mesh = crystals.current;
    if (mesh && live.mined.size !== minedShown.current.size) {
      for (const id of live.mined) {
        if (minedShown.current.has(id)) continue;
        minedShown.current.add(id);
        const slot = seamSlots.get(id);
        if (slot === undefined) continue;
        for (let s = 0; s < 4; s++) {
          M1.makeScale(0, 0, 0);
          mesh.setMatrixAt(slot * 4 + s, M1);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Prospect stakes: what earlier landings marked, plus this stay's marks —
    // the first persistent, visible change a walker leaves on a world.
    const stakeMesh = stakes.current;
    if (stakeMesh) {
      const marks = surfaceProspects();
      if (marks.length !== stakesShown.current) {
        stakesShown.current = marks.length;
        const shown = Math.min(marks.length, STAKE_MAX);
        for (let i = 0; i < shown; i++) {
          const d = marks[i]!;
          SEAT.position.set(d.x, d.y + 0.62, d.z);
          SEAT.quaternion.setFromAxisAngle(V1.set(Math.sin(d.rot), 0, Math.cos(d.rot)).normalize(), 0.08);
          SEAT.scale.set(1, 1, 1);
          SEAT.updateMatrix();
          stakeMesh.setMatrixAt(i, SEAT.matrix);
        }
        stakeMesh.count = shown;
        stakeMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Touchdown dust — at whichever pad the gear last took the weight on.
    if (live.touchdownNonce !== lastTouchdown.current) {
      lastTouchdown.current = live.touchdownNonce;
      dustBornAt.current = t;
      if (dustRing.current) {
        const px = live.shipAt.x;
        const pz = live.shipAt.z;
        dustRing.current.position.set(px, heightAt(built.p, built.tiers, px, pz) + 0.6, pz);
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

    // The belly sweep's ping: a ring on the ground where the sensor resolved
    // something. Rides the dust material, because it is the same idea — a
    // circle of ground briefly having opinions about you.
    if (live.sweepNonce !== lastSweep.current) {
      lastSweep.current = live.sweepNonce;
      sweepBornAt.current = t;
      if (sweepRing.current) {
        sweepRing.current.position.set(
          live.pos.x,
          heightAt(built.p, built.tiers, live.pos.x, live.pos.z) + 1.2,
          live.pos.z,
        );
        sweepRing.current.scale.setScalar(Math.max(8, live.sweepM));
      }
    }
    if (sweepRing.current) {
      const age = t - sweepBornAt.current;
      sweepRing.current.visible = age < 0.9 && live.phase === 'fly';
    }

    // The ship: parked on its pad, or the thing the chase camera is behind.
    const ship = shipGroup.current;
    if (ship) {
      if (live.phase === 'fly') {
        // In the seat you are inside it, so it is not drawn; from the chase
        // seat it is the only reason the landscape has a scale at all.
        ship.visible = live.chaseView;
        if (ship.visible) {
          ship.position.copy(live.pos);
          SHIP_EUL.set(live.pitch * 0.5, live.yaw, live.roll);
          ship.quaternion.setFromEuler(SHIP_EUL);
          padKey.current = ''; // force a re-seat when it lands again
        }
      } else {
        ship.visible = true;
        const key = `${live.shipAt.x.toFixed(1)}:${live.shipAt.z.toFixed(1)}:${epoch}`;
        if (key !== padKey.current) {
          padKey.current = key;
          const px = live.shipAt.x;
          const pz = live.shipAt.z;
          ship.position.set(px, heightAt(built.p, built.tiers, px, pz), pz);
          groundNormalAt(built.p, built.tiers, px, pz, V1);
          SHIP_Q.setFromUnitVectors(UP, V1.lerp(UP, 0.6).normalize());
          SHIP_YAW_Q.setFromAxisAngle(UP, live.shipAt.yaw);
          ship.quaternion.copy(SHIP_Q).multiply(SHIP_YAW_Q);
        }
      }
      const beacon = ship.getObjectByName('gf-beacon') as Mesh | null;
      const mat = beacon?.material as MeshBasicMaterial | undefined;
      if (mat) mat.opacity = 0.55 + Math.sin(t * 2.6) * 0.45;
    }
  });

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

            <ChunkedProps p={built.p} tiers={built.tiers} palette={palette} type={session.type} bioK={bioK} seed={session.seed} />

            <instancedMesh
              ref={crystals}
              args={[seamShard ?? undefined, undefined, seams.length * 4]}
              material={built.crystalB.mat}
              frustumCulled={false}
            >
              {seamShard ? null : <octahedronGeometry args={[0.7, 0]} />}
            </instancedMesh>

            {/* Prospect stakes: the mark kit's flagged stake, or the pole. */}
            <instancedMesh
              ref={stakes}
              args={[stakeKit?.geometry ?? undefined, undefined, STAKE_MAX]}
              material={stakeKit?.material}
              frustumCulled={false}
            >
              {stakeKit ? null : (
                <>
                  <cylinderGeometry args={[0.024, 0.05, 1.35, 5]} />
                  <meshBasicMaterial color="#d98d2b" />
                </>
              )}
            </instancedMesh>

            <mesh ref={dustRing} visible={false} material={built.dustB.mat} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2, 2]} />
            </mesh>
            <mesh ref={sweepRing} visible={false} material={built.dustB.mat} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2, 2]} />
            </mesh>

            <Decals p={built.p} tiers={built.tiers} />
            <Pickaxe />
            <SkimmerDash />
            <ParkedSkimmer p={built.p} tiers={built.tiers} />
            <ImpactShards gravity={built.p.gravity} />
            <SurfaceWeather session={session} palette={palette} />
            <Landmarks p={built.p} tiers={built.tiers} palette={palette} epoch={epoch} />
            <Settlements p={built.p} tiers={built.tiers} palette={palette} session={session} epoch={epoch} />
            <Ecology p={built.p} tiers={built.tiers} palette={palette} bio={session.aspects.bio} epoch={epoch} />
            <Marks p={built.p} tiers={built.tiers} palette={palette} epoch={epoch} nonce={markSeat} />

            {/* Posed by the frame loop: the pad moves now (Phase 6). */}
            <group ref={shipGroup} position={[SHIP_PARK.x, 0, SHIP_PARK.z]}>
              <LandedRunabout />
            </group>
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
const FOG_SCRATCH = new Color();
/** What each front does to the air's colour. Dust is palette-derived. */
const WEATHER_FOG: Record<string, Color | undefined> = {
  rain: new Color(0x5a6570),
  storm: new Color(0x424c58),
  fog: new Color(0x9aa4ac),
  whiteout: new Color(0xdde4ea),
  ash: new Color(0x33343a),
};

// ————— Props: chunked, streamed with the traveller —————

/** One prop family's streaming parameters. */
interface PropFamilyDef {
  /** Deterministic stream id (kept from the old scatter for continuity). */
  stream: number;
  /** Chunk edge, metres. */
  chunkM: number;
  /** Chunks live while their centre is inside this radius of the walker. */
  reachM: number;
  /** Placement attempts per chunk (rejections thin naturally). */
  tries: number;
  maxSlopeY: number;
  shore: number;
  scale: [number, number];
  squash: number;
  lift: number;
}

/** Chunks the reach disc can hold, with a ring of margin. */
function chunkCapacity(def: PropFamilyDef): number {
  const r = def.reachM / def.chunkM + 1.5;
  return Math.ceil(Math.PI * r * r);
}

/**
 * One instanced family fed by world-fixed chunks around the walker. Chunk
 * slots own fixed instance ranges; a chunk streaming out zero-scales its
 * range and returns the slot. A terrain epoch re-generates every resident
 * chunk (same rocks — the hash owns position — standing on re-baked ground).
 * A few chunks a frame keeps the work invisible at any legal speed.
 */
function PropChunks({
  p,
  tiers,
  def,
  material,
  geometry,
  children,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  def: PropFamilyDef;
  material: MeshStandardNodeMaterial;
  /** Kit geometry (ASSET_UPLIFT.md 2.1) — the primitive children otherwise. */
  geometry?: BufferGeometry | null;
  children?: React.ReactNode;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const capChunks = useMemo(() => chunkCapacity(def), [def]);
  const capSeats = capChunks * def.tries;

  const st = useMemo(() => {
    const free: number[] = [];
    for (let i = capChunks - 1; i >= 0; i--) free.push(i);
    return {
      slots: new Map<string, number>(),
      free,
      lastCX: Number.POSITIVE_INFINITY,
      lastCZ: Number.POSITIVE_INFINITY,
      queue: [] as { ix: number; iz: number; key: string; d2: number }[],
      epoch: -1,
      cleared: false,
    };
  }, [capChunks, def]);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const live = surfaceLive;

    // Everything parks at zero scale until a chunk claims it — an instance
    // buffer is born full of identity matrices, which render as a heap of
    // unit props at the origin. Once, before anything else.
    if (!st.cleared) {
      st.cleared = true;
      M1.makeScale(0, 0, 0);
      for (let i = 0; i < capSeats; i++) m.setMatrixAt(i, M1);
      m.count = capSeats;
      m.instanceMatrix.needsUpdate = true;
    }

    const cx = Math.floor(live.pos.x / def.chunkM);
    const cz = Math.floor(live.pos.z / def.chunkM);
    const epochChanged = st.epoch !== live.terrainEpoch;
    if (cx !== st.lastCX || cz !== st.lastCZ || epochChanged) {
      st.lastCX = cx;
      st.lastCZ = cz;
      st.epoch = live.terrainEpoch;
      const reach = Math.ceil(def.reachM / def.chunkM);
      const wanted = new Set<string>();
      st.queue.length = 0;
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        for (let ix = cx - reach; ix <= cx + reach; ix++) {
          const wx = (ix + 0.5) * def.chunkM - live.pos.x;
          const wz = (iz + 0.5) * def.chunkM - live.pos.z;
          const d2 = wx * wx + wz * wz;
          if (d2 > def.reachM * def.reachM) continue;
          const key = `${ix}:${iz}`;
          wanted.add(key);
          if (!st.slots.has(key) || epochChanged) st.queue.push({ ix, iz, key, d2 });
        }
      }
      st.queue.sort((a, b) => a.d2 - b.d2);
      for (const [key, slot] of st.slots) {
        if (wanted.has(key)) continue;
        st.slots.delete(key);
        st.free.push(slot);
        M1.makeScale(0, 0, 0);
        for (let i = 0; i < def.tries; i++) m.setMatrixAt(slot * def.tries + i, M1);
        m.instanceMatrix.needsUpdate = true;
      }
    }

    let budget = 3;
    while (st.queue.length > 0 && budget-- > 0) {
      const c = st.queue.shift()!;
      let slot = st.slots.get(c.key);
      if (slot === undefined) {
        slot = st.free.pop();
        if (slot === undefined) break; // pool momentarily full; next frame
        st.slots.set(c.key, slot);
      }
      const seats = scatterChunk(p, tiers, def.stream, def.chunkM, c.ix, c.iz, {
        tries: def.tries,
        maxSlopeY: def.maxSlopeY,
        shore: def.shore,
        scale: def.scale,
        clearR: 26,
      });
      const n = seats.length / 5;
      for (let i = 0; i < def.tries; i++) {
        if (i < n) {
          const k = i * 5;
          const s = seats[k + 3]!;
          SEAT.position.set(
            seats[k]!,
            seats[k + 1]! + def.lift * s * def.squash * 0.5 - 0.12,
            seats[k + 2]!,
          );
          SEAT.quaternion.setFromAxisAngle(UP, seats[k + 4]!);
          SEAT.scale.set(s, s * def.squash, s);
          SEAT.updateMatrix();
          m.setMatrixAt(slot * def.tries + i, SEAT.matrix);
        } else {
          M1.makeScale(0, 0, 0);
          m.setMatrixAt(slot * def.tries + i, M1);
        }
      }
      m.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry ?? undefined, undefined, capSeats]}
      material={material}
      frustumCulled={false}
    >
      {geometry ? null : children}
    </instancedMesh>
  );
}

function ChunkedProps({
  p,
  tiers,
  palette,
  type,
  bioK,
  seed,
}: {
  p: SurfaceParams;
  tiers: SurfaceTiers;
  palette: ReturnType<typeof paletteFor>;
  type: string;
  bioK: number;
  seed: number;
}) {
  // Kit geometry (2.1): one authored variant per family per world, seeded so
  // neighbouring worlds see different rocks. LOD0 spends its triangles on
  // Tier A only. Null (kit still in flight, or Tier C) keeps the primitives.
  const kitGeo = useMemo(() => {
    if (!upliftActive()) return null;
    const variant = String(1 + (Math.abs(seed) % 5)).padStart(2, '0');
    const lod = upliftTier() === 'a' ? 0 : 1;
    const pick = (family: string, height: number) =>
      kitGeometryFit(
        `meshes/props/${family}.glb`,
        `${type}-${family}-${variant}-lod${lod}`,
        { mode: 'height', height },
      );
    return {
      rocks: pick('rocks', 2),
      boulders: pick('boulders', 2),
      flora: pick('flora', 1),
      shrubs: pick('shrubs', 1.4),
      shards: pick('shards', 1.2),
      vents: pick('vents', 1.4),
    };
  }, [type, seed]);

  const rockMat = useMemo(() => {
    if (kitGeo?.rocks) {
      return upliftFamilyMaterial({
        atlas: 'textures/props/rocks-atlas.ktx2',
        tint: palette.high.clone().multiplyScalar(0.82),
        roughness: 0.96,
      });
    }
    const m = new MeshStandardNodeMaterial();
    m.color = palette.high.clone().multiplyScalar(0.82);
    m.roughness = 0.96;
    m.flatShading = true;
    return m;
  }, [palette, kitGeo]);
  const boulderMat = useMemo(() => {
    if (kitGeo?.boulders) {
      return upliftFamilyMaterial({
        atlas: 'textures/props/boulders-atlas.ktx2',
        tint: palette.high.clone().multiplyScalar(0.82),
        roughness: 0.97,
      });
    }
    return rockMat;
  }, [palette, kitGeo, rockMat]);
  const floraMat = useMemo(() => {
    if (kitGeo?.flora) {
      return upliftFamilyMaterial({
        atlas: 'textures/props/flora-atlas.ktx2',
        tint: palette.vegetation.clone(),
        gain: 2.6,
        roughness: 0.9,
      });
    }
    const m = new MeshStandardNodeMaterial();
    m.color = palette.vegetation.clone();
    m.roughness = 0.9;
    m.flatShading = true;
    return m;
  }, [palette, kitGeo]);
  const shrubMat = useMemo(() => {
    if (kitGeo?.shrubs) {
      return upliftFamilyMaterial({
        atlas: 'textures/props/shrubs-atlas.ktx2',
        tint: palette.vegetation.clone().multiplyScalar(0.72),
        gain: 2.6,
        roughness: 0.95,
      });
    }
    const m = new MeshStandardNodeMaterial();
    m.color = palette.vegetation.clone().multiplyScalar(0.72);
    m.roughness = 0.95;
    m.flatShading = true;
    return m;
  }, [palette, kitGeo]);
  const shardMat = useMemo(() => {
    if (kitGeo?.shards) {
      return upliftFamilyMaterial({
        atlas: 'textures/props/shards-atlas.ktx2',
        tint: palette.ice.clone(),
        roughness: 0.18,
        metalness: 0.15,
      });
    }
    const m = new MeshStandardNodeMaterial();
    m.color = palette.ice.clone();
    m.roughness = 0.18;
    m.flatShading = true;
    return m;
  }, [palette, kitGeo]);
  const ventMat = useMemo(() => {
    const emissive = palette.emissive.getHex() === 0 ? new Color(0xff4d1a) : palette.emissive.clone();
    if (kitGeo?.vents) {
      return upliftFamilyMaterial({
        atlas: 'textures/props/vents-atlas.ktx2',
        tint: new Color(0x6b5a50),
        roughness: 0.9,
        emissive,
        emissiveIntensity: 0.55,
      });
    }
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x241a17);
    m.emissive = emissive;
    m.emissiveIntensity = 1.4;
    m.roughness = 0.9;
    m.flatShading = true;
    return m;
  }, [palette, kitGeo]);

  // Densities carry the old scatter's counts per area; reach is what grew.
  // (rocks: 460 over r950 ≈ 11 a chunk; flora: 340 over r780 ≈ 12; and so on.)
  const defs = useMemo(() => {
    const floraTries = bioK > 0.04 ? Math.max(1, Math.round(12 * Math.min(1, bioK + 0.12))) : 0;
    const shrubTries = bioK > 0.04 ? Math.max(1, Math.round(10 * Math.min(1, bioK + 0.2))) : 0;
    return {
      rocks: { stream: 0x11a, chunkM: 256, reachM: 1200, tries: 11, maxSlopeY: 0.5, shore: 0.4, scale: [0.35, 2.4], squash: 0.62, lift: 0 } as PropFamilyDef,
      boulders: { stream: 0x22b, chunkM: 512, reachM: 3100, tries: 2, maxSlopeY: 0.55, shore: 0.6, scale: [2.2, 7.5], squash: 0.7, lift: 0 } as PropFamilyDef,
      flora: { stream: 0x33c, chunkM: 256, reachM: 1150, tries: floraTries, maxSlopeY: 0.74, shore: 2.2, scale: [0.8, 2.3], squash: 3.4, lift: 1 } as PropFamilyDef,
      shrubs: { stream: 0x44d, chunkM: 256, reachM: 900, tries: shrubTries, maxSlopeY: 0.7, shore: 1.4, scale: [0.5, 1.4], squash: 0.75, lift: 0.5 } as PropFamilyDef,
      shards: { stream: 0x55e, chunkM: 256, reachM: 1150, tries: 6, maxSlopeY: 0.6, shore: 0.5, scale: [0.8, 3.2], squash: 2.6, lift: 0.55 } as PropFamilyDef,
      vents: { stream: 0x66f, chunkM: 256, reachM: 1150, tries: 3, maxSlopeY: 0.65, shore: 3, scale: [0.7, 1.8], squash: 0.9, lift: 0.85 } as PropFamilyDef,
    };
  }, [bioK]);

  return (
    <>
      <PropChunks p={p} tiers={tiers} def={defs.rocks} material={rockMat} geometry={kitGeo?.rocks}>
        <icosahedronGeometry args={[1, 1]} />
      </PropChunks>
      <PropChunks p={p} tiers={tiers} def={defs.boulders} material={boulderMat} geometry={kitGeo?.boulders}>
        <icosahedronGeometry args={[1, 1]} />
      </PropChunks>
      {defs.flora.tries > 0 && (
        <PropChunks p={p} tiers={tiers} def={defs.flora} material={floraMat} geometry={kitGeo?.flora}>
          <coneGeometry args={[0.5, 1, 6]} />
        </PropChunks>
      )}
      {defs.shrubs.tries > 0 && (
        <PropChunks p={p} tiers={tiers} def={defs.shrubs} material={shrubMat} geometry={kitGeo?.shrubs}>
          <icosahedronGeometry args={[0.7, 0]} />
        </PropChunks>
      )}
      {type === 'ice' && (
        <PropChunks p={p} tiers={tiers} def={defs.shards} material={shardMat} geometry={kitGeo?.shards}>
          <octahedronGeometry args={[0.6, 0]} />
        </PropChunks>
      )}
      {type === 'volcanic' && (
        <PropChunks p={p} tiers={tiers} def={defs.vents} material={ventMat} geometry={kitGeo?.vents}>
          <coneGeometry args={[1, 1.4, 7]} />
        </PropChunks>
      )}
    </>
  );
}

// ————— The parked runabout, at human scale —————

/** Where bought refit hardware hangs on the parked hull (local frame). */
const LANDED_PODS: RefitPodSpec[] = [
  { id: 'skimmer', position: [0, 0.36, 0.34], height: 0.09 },
  { id: 'cargoHold', position: [0, 0.07, 0.18], height: 0.16 },
  { id: 'rigBay', position: [0, 0.07, -0.2], height: 0.13 },
  { id: 'deterrent', position: [0, 0.43, 0.05], height: 0.07 },
  { id: 'atmo', position: [0, 0.18, -0.38], height: 0.09 },
];

/**
 * The same silhouette the chase camera knows, seven times larger and standing
 * on legs. With the ship kit loaded it IS the same asset (3.1) — one hull,
 * three call sites; otherwise the hand-placed geometry stands in.
 */
/**
 * The ship on the ground, and — in the 'fly' phase — the same ship in the air.
 * It carries no yaw of its own: the frame loop owns the heading, and airborne
 * that heading is where she is actually going. The parked angle belongs to the
 * pad, as SHIP_PARK_YAW.
 */
function LandedRunabout() {
  // Gear included: the kit hull carries its struts and feet, fitted so the
  // pads rest at local y=0 exactly where the hand-built gear stood.
  const kitHull = useMemo(
    () => runaboutGeometry({ min: [-0.71, 0, -0.85], max: [0.71, 0.42, 0.7] }),
    [],
  );
  return (
    <group scale={5.5}>
      {kitHull ? (
        <>
          <mesh geometry={kitHull} material={shipMaterial()} />
          <RefitPods pods={LANDED_PODS} />
        </>
      ) : (
        <>
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
          {/* Service stripe over the spine. */}
          <mesh position={[0, 0.37, 0.18]}>
            <boxGeometry args={[0.018, 0.012, 0.44]} />
            <meshStandardMaterial color={0xc28a49} emissive={0x3b210d} emissiveIntensity={1.1} />
          </mesh>
        </>
      )}
      {/* The beacon the frame loop breathes — kit or no kit. */}
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

// ————— The Survey Skimmer —————

/**
 * The sled itself, origin at deck centre, nose toward -Z — the same
 * hand-placed-boxes school as the runabout, at running-board scale. Parked
 * it is a world object; ridden it is not drawn at all (the dash viewmodel
 * carries the cockpit), which neatly spends zero polygons on your own hull.
 */
function SkimmerSled() {
  // The authored sled (3.4), fitted to the hand-built envelope; the scanner
  // ball stays separate because the frame loop breathes it.
  const kitSled = useMemo(
    () => skimmerGeometry({ min: [-0.93, 0, -1.9], max: [0.93, 2.05, 1.35] }),
    [],
  );
  if (kitSled) {
    return (
      <group>
        <mesh geometry={kitSled} material={shipMaterial()} />
        {/* Emitters, so outside the merge — the shared kit material cannot
            glow. Seated on the authored hull: the ball caps the sensor mast
            and the strips light the running boards. `npm run assets:ship`
            prints these anchors whenever the sled changes. */}
        <mesh name="sk-scanner" position={[0, 2.02, 1.18]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshBasicMaterial color={0x6fe0ff} transparent opacity={0.85} toneMapped={false} />
        </mesh>
        {[-0.68, 0.68].map((x) => (
          <mesh key={x} position={[x, 0.653, -0.158]}>
            <boxGeometry args={[0.05, 0.02, 1.95]} />
            <meshBasicMaterial color={0xd98d2b} transparent opacity={0.6} toneMapped={false} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group>
      {/* Deck and nose cowl. */}
      <mesh position={[0, 0.42, 0.1]}>
        <boxGeometry args={[1.4, 0.16, 2.7]} />
        <meshStandardMaterial color={0x35435c} emissive={0x0b1524} emissiveIntensity={0.6} roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.5, -1.5]} rotation={[-Math.PI / 2.35, 0, 0]}>
        <coneGeometry args={[0.5, 0.8, 4]} />
        <meshStandardMaterial color={0x2b3850} emissive={0x0a121f} emissiveIntensity={0.6} roughness={0.42} metalness={0.7} flatShading />
      </mesh>
      {/* Side skids: the cushion's shoes. */}
      {[-0.78, 0.78].map((x) => (
        <mesh key={x} position={[x, 0.22, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 2.3, 8]} />
          <meshStandardMaterial color={0x27324a} emissive={0x0a1220} emissiveIntensity={0.7} roughness={0.35} metalness={0.8} flatShading />
        </mesh>
      ))}
      {/* Saddle and the survey mast, scanner ball on top. */}
      <mesh position={[0, 0.62, 0.55]}>
        <boxGeometry args={[0.44, 0.24, 0.9]} />
        <meshStandardMaterial color={0x3d3226} emissive={0x140f08} emissiveIntensity={0.5} roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.3, 1.2]}>
        <cylinderGeometry args={[0.03, 0.045, 1.5, 6]} />
        <meshStandardMaterial color={0x596579} roughness={0.5} metalness={0.7} />
      </mesh>
      <mesh name="sk-scanner" position={[0, 2.1, 1.2]}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshBasicMaterial color={0x6fe0ff} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {/* Handlebar arch over the bow. */}
      <mesh position={[0, 0.78, -0.62]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.9, 0.07, 0.09]} />
        <meshStandardMaterial color={0x212c40} emissive={0x0a1220} emissiveIntensity={0.7} roughness={0.4} metalness={0.75} />
      </mesh>
      {/* Deck edge rails: parked at night it reads as a vehicle, not litter. */}
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, 0.51, 0.1]}>
          <boxGeometry args={[0.05, 0.02, 2.6]} />
          <meshBasicMaterial color={0xd98d2b} transparent opacity={0.6} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The sled where you left it: standing on its skids, scanner breathing. */
function ParkedSkimmer({ p, tiers }: { p: SurfaceParams; tiers: SurfaceTiers }) {
  const root = useRef<Group>(null);

  useFrame((state) => {
    const g = root.current;
    if (!g) return;
    const live = surfaceLive;
    const at = live.skimmerAt;
    const visible = at != null && live.phase !== 'skim';
    g.visible = visible;
    if (!visible || !at) return;
    g.position.set(at.x, heightAt(p, tiers, at.x, at.z), at.z);
    g.rotation.set(0, at.yaw, 0);
    const scanner = g.getObjectByName('sk-scanner') as Mesh | null;
    const mat = scanner?.material as MeshBasicMaterial | undefined;
    if (mat) mat.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 2.1) * 0.35;
  });

  return (
    <group ref={root} visible={false}>
      <SkimmerSled />
    </group>
  );
}

/**
 * The rider's share of the skimmer: a cowl, a handlebar, a console strip
 * that burns brighter with speed. A viewmodel like the pick — welded to the
 * lens with depth privileges, trailing the eyes by a beat, leaning into the
 * turn just enough to say the machine noticed.
 */
function SkimmerDash() {
  const camera = useThree((s) => s.camera);
  const root = useRef<Group>(null);
  const lag = useRef({ yaw: 0, x: 0 });
  const consoleMat = useRef<MeshStandardNodeMaterial | null>(null);

  const consoleMaterial = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x28344c);
    m.emissive = new Color(0x2a8fa8);
    m.emissiveIntensity = 0.7;
    m.roughness = 0.4;
    m.metalness = 0.6;
    m.depthTest = false;
    consoleMat.current = m;
    return m;
  }, []);

  useFrame((state, dtRaw) => {
    const g = root.current;
    if (!g) return;
    const live = surfaceLive;
    const visible = live.phase === 'skim';
    g.visible = visible;
    if (!visible) return;
    const dt = Math.min(dtRaw, 0.1);

    const l = lag.current;
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const dy = wrap(live.yaw - l.yaw);
    l.yaw = live.yaw;
    const k = 1 - Math.exp(-dt * 8);
    l.x += (-dy * 0.5 - l.x) * k;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.translateX(l.x * 0.3);
    g.translateY(-0.42 + Math.sin(state.clock.elapsedTime * 9.2) * 0.004);
    g.translateZ(-0.62);
    g.rotation.z -= l.x * 0.6;

    if (consoleMat.current) {
      consoleMat.current.emissiveIntensity =
        0.25 + Math.min(1, live.skimSpeed / 29) * 0.8;
    }
  });

  const metal = { color: 0x2b3750, emissive: 0x0d1526, emissiveIntensity: 0.8, roughness: 0.38, metalness: 0.8, depthTest: false } as const;
  return (
    <group ref={root} visible={false}>
      {/* Cowl: a shallow V of panels under the sightline. */}
      <mesh position={[-0.24, -0.02, 0]} rotation={[0.34, 0, 0.18]} renderOrder={520}>
        <boxGeometry args={[0.42, 0.05, 0.3]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0.24, -0.02, 0]} rotation={[0.34, 0, -0.18]} renderOrder={520}>
        <boxGeometry args={[0.42, 0.05, 0.3]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Grips, rising toward the rider's hands. */}
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} position={[x, 0.04, 0.1]} rotation={[0.9, 0, x < 0 ? 0.3 : -0.3]} renderOrder={521}>
          <cylinderGeometry args={[0.02, 0.024, 0.16, 6]} />
          <meshStandardMaterial color={0x3a332b} emissive={0x120e09} emissiveIntensity={0.6} roughness={0.9} metalness={0} depthTest={false} />
        </mesh>
      ))}
      {/* The console: speed burns on it (material driven by the frame loop). */}
      <mesh position={[0, -0.015, 0.02]} rotation={[0.5, 0, 0]} renderOrder={521} material={consoleMaterial}>
        <boxGeometry args={[0.13, 0.014, 0.07]} />
      </mesh>
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

