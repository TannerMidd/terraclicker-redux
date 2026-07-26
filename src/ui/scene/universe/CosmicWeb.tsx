import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointsMaterial,
  RingGeometry,
  DoubleSide,
  Vector3,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import { useUiBus, zoomLive } from '../../fx/uiBus';
import { cosmicWeb } from '../universeLayout';
import { makeGlowSprite } from './shared';

/**
 * The deepest shell: the rest of the universe. Filaments of dark matter-of-
 * fact, studded with unlit nodes — every one a galaxy nobody has terraformed.
 * Your lifetime galaxies light nodes one by one, and they STAY lit across
 * prestiges: Magrathea buys the portfolio, not the light. The marker shows
 * where you are. It is not a large place.
 */
export function CosmicWeb() {
  const masterSeed = useGame((g) => g.s.seed);
  const litCount = useGame((g) => Math.max(g.s.lifetime.galaxies, g.s.run.galaxies));
  const localFlight = useUiBus(
    (b) => b.flightMode && (b.flightNearGalaxy !== null || b.flightNearSystem !== null),
  );

  const web = useMemo(() => cosmicWeb(masterSeed), [masterSeed]);

  const filamentGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(web.filaments, 3));
    return g;
  }, [web]);
  const unlitGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(web.nodes, 3));
    return g;
  }, [web]);
  const litPositions = useMemo(() => {
    const n = Math.min(litCount, web.order.length);
    const out: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const idx = web.order[i]!;
      out.push([web.nodes[idx * 3]!, web.nodes[idx * 3 + 1]!, web.nodes[idx * 3 + 2]!]);
    }
    return out;
  }, [web, litCount]);
  const litGeo = useMemo(() => {
    const arr = new Float32Array(litPositions.length * 3);
    litPositions.forEach((p, i) => arr.set(p, i * 3));
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(arr, 3));
    return g;
  }, [litPositions]);

  const filamentMat = useMemo(
    () =>
      new PointsMaterial({
        size: 1.1,
        sizeAttenuation: false,
        color: 0x3c4a6e,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const unlitMat = useMemo(
    () =>
      new PointsMaterial({
        size: 2.3,
        sizeAttenuation: false,
        color: 0x55618a,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const litMat = useMemo(
    () =>
      new PointsMaterial({
        size: 4,
        sizeAttenuation: false,
        color: 0xffe9c0,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  // One glow sprite per lit node (the map-on-points path is unreliable on
  // the WebGPU renderer). Lifetime galaxies stay a modest number; this is cheap.
  const litGlowMat = useMemo(() => makeGlowSprite(0xffd98f, 0), []);

  // "YOU ARE HERE": a patient ring around your newest galaxy's node — or,
  // before any exist, around the modest node reserved for your local group.
  const markerPos = useMemo(() => {
    const idx = web.order[Math.max(0, Math.min(litCount, web.order.length) - 1)] ?? web.order[0]!;
    return new Vector3(web.nodes[idx * 3]!, web.nodes[idx * 3 + 1]!, web.nodes[idx * 3 + 2]!);
  }, [web, litCount]);
  const markerGeo = useMemo(() => new RingGeometry(1.5, 1.62, 48), []);
  const markerMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: 0xf5c84c,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        depthWrite: false,
      }),
    [],
  );
  const marker = useRef<Mesh>(null);
  const root = useRef<Group>(null);

  useFrame((state) => {
    // The web belongs to the deep bands; it breathes in as you approach.
    const z = zoomLive.v;
    const reveal = Math.max(0, Math.min(1, (z - 0.55) / 0.3));
    const r = reveal * reveal;
    const localFade = localFlight ? 0.12 : 1;
    filamentMat.opacity = r * 0.42 * localFade;
    unlitMat.opacity = r * 0.5 * localFade;
    litMat.opacity = Math.min(1, r * 1.4) * localFade;
    litGlowMat.opacity = r * 0.5 * localFade;
    const m = marker.current;
    if (m) {
      m.quaternion.copy(state.camera.quaternion);
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.7) * 0.18;
      m.scale.setScalar(pulse);
      markerMat.opacity = Math.max(0, (z - 0.8) / 0.2)
        * (0.5 + Math.sin(state.clock.elapsedTime * 1.7) * 0.2) * localFade;
    }
    if (root.current) root.current.visible = z > 0.35;
  });

  return (
    <group ref={root}>
      <points geometry={filamentGeo} material={filamentMat} raycast={() => null} />
      <points geometry={unlitGeo} material={unlitMat} raycast={() => null} />
      {litCount > 0 && <points geometry={litGeo} material={litMat} raycast={() => null} />}
      {litPositions.map((p, i) => (
        <sprite key={i} position={p} scale={[3.2, 3.2, 1]} raycast={() => null}>
          <primitive object={litGlowMat} attach="material" />
        </sprite>
      ))}
      <mesh ref={marker} position={markerPos} geometry={markerGeo} material={markerMat} raycast={() => null} />
    </group>
  );
}
