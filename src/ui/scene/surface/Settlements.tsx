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
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Sprite,
} from 'three/webgpu';
import {
  SETTLEMENT_COOL_HEX,
  SETTLEMENT_WARM_HEX,
} from '../../../engine/settlements';
import { mulberry } from '../../../engine/rng';
import type { GroundfallSession } from '../../fx/uiBus';
import { sharedGlowSprite } from '../universe/shared';
import { universeMotion } from '../universe/operationsVisual';
import { buildSettlementSeats } from './surfaceSettlements';
import { surfaceLive, surfaceSettlementList } from './surfaceControl';
import type { SurfaceParams, SurfaceTiers } from './terrainField';
import type { PlanetPalette } from '../planetMaterial';
import * as audio from '../../audio/audio';

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
  const seats = useMemo(() => {
    void epoch; // every foot re-samples the (possibly re-baked) ground
    return buildSettlementSeats(p, tiers, surfaceSettlementList(), session);
  }, [p, tiers, session, epoch]);

  const wallMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    // Local plaster over local stone: the palette, civilised a shade.
    m.color = palette.high.clone().multiplyScalar(0.58).lerp(new Color(0xcabfa8), 0.35);
    m.roughness = 0.86;
    m.flatShading = true;
    return m;
  }, [palette]);
  const roofMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.low.clone().multiplyScalar(0.5).lerp(new Color(0x37404a), 0.5);
    m.roughness = 0.92;
    m.flatShading = true;
    return m;
  }, [palette]);
  const windowWarmMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(SETTLEMENT_WARM_HEX);
    return m;
  }, []);
  const windowCoolMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(SETTLEMENT_COOL_HEX);
    return m;
  }, []);
  const mastMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x39414b);
    m.roughness = 0.6;
    m.flatShading = true;
    return m;
  }, []);
  const domeMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = palette.atmosphere.clone().multiplyScalar(0.5).lerp(new Color(0x9aa8b4), 0.5);
    m.roughness = 0.34;
    m.flatShading = true;
    return m;
  }, [palette]);
  const padMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x2c3036);
    m.roughness = 1;
    return m;
  }, []);
  const worksMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x4c4842);
    m.roughness = 0.78;
    m.flatShading = true;
    return m;
  }, []);
  const bannerMat = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    m.color = new Color(SETTLEMENT_WARM_HEX).multiplyScalar(0.9);
    return m;
  }, []);
  const scaffoldMat = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color(0x6f5f3c);
    m.roughness = 0.82;
    m.flatShading = true;
    return m;
  }, []);

  const wall = useSeatMesh(seats.wall);
  const roof = useSeatMesh(seats.roof);
  const windowWarm = useSeatMesh(seats.windowWarm);
  const windowCool = useSeatMesh(seats.windowCool);
  const mast = useSeatMesh(seats.mast);
  const dome = useSeatMesh(seats.dome);
  const pad = useSeatMesh(seats.pad);
  const stilt = useSeatMesh(seats.stilt);
  const works = useSeatMesh(seats.works);
  const banner = useSeatMesh(seats.banner);
  const scaffold = useSeatMesh(seats.scaffold);

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
      {seats.wall.length > 0 && (
        <instancedMesh ref={wall} args={[undefined, undefined, seats.wall.length]} material={wallMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {seats.roof.length > 0 && (
        <instancedMesh ref={roof} args={[undefined, undefined, seats.roof.length]} material={roofMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
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
      {seats.mast.length > 0 && (
        <instancedMesh ref={mast} args={[undefined, undefined, seats.mast.length]} material={mastMat} frustumCulled={false}>
          <cylinderGeometry args={[0.5, 0.7, 1, 6]} />
        </instancedMesh>
      )}
      {seats.dome.length > 0 && (
        <instancedMesh ref={dome} args={[undefined, undefined, seats.dome.length]} material={domeMat} frustumCulled={false}>
          <sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        </instancedMesh>
      )}
      {seats.pad.length > 0 && (
        <instancedMesh ref={pad} args={[undefined, undefined, seats.pad.length]} material={padMat} frustumCulled={false}>
          <cylinderGeometry args={[1, 1, 1, 18]} />
        </instancedMesh>
      )}
      {seats.stilt.length > 0 && (
        <instancedMesh ref={stilt} args={[undefined, undefined, seats.stilt.length]} material={mastMat} frustumCulled={false}>
          <cylinderGeometry args={[0.5, 0.6, 1, 5]} />
        </instancedMesh>
      )}
      {seats.works.length > 0 && (
        <instancedMesh ref={works} args={[undefined, undefined, seats.works.length]} material={worksMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {seats.banner.length > 0 && (
        <instancedMesh ref={banner} args={[undefined, undefined, seats.banner.length]} material={bannerMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {seats.scaffold.length > 0 && (
        <instancedMesh ref={scaffold} args={[undefined, undefined, seats.scaffold.length]} material={scaffoldMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
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
