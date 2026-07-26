import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three/webgpu';
import { C } from '../../../content/constants';
import {
  deriveGalaxyNetwork,
  GALAXY_ACCORD_META,
  type GalaxyAccord,
} from '../../../engine/networks';
import { useGame } from '../../../state/store';
import { useUiBus, zoomLive } from '../../fx/uiBus';
import {
  GALAXY_R,
  GALAXY_TILT,
  galaxyPosition,
  galaxySeed,
  memberSeatLocal,
} from '../universeLayout';
import { InstancedPool, pooledMaterial, type PoolInstance } from './pool';
import { universeMotion } from './operationsVisual';

const NEUTRAL_COLOR = 0x52607a;

interface NetworkLink {
  from: Vector3;
  to: Vector3;
  fromColor: number;
  toColor: number;
  pulseColor: number;
  phase: number;
  rate: number;
  pulseScale: number;
}

interface NetworkVisuals {
  links: readonly NetworkLink[];
  halos: readonly PoolInstance[];
}

function accordColor(accord: GalaxyAccord | undefined): number {
  return accord?.kind ? GALAXY_ACCORD_META[accord.kind].color : NEUTRAL_COLOR;
}

function visualData(seed: number, accords: readonly GalaxyAccord[]): NetworkVisuals {
  const links: NetworkLink[] = [];
  const halos: PoolInstance[] = [];
  const origins: Vector3[] = [];
  const colors: number[] = [];
  const haloQuaternion = new Quaternion().setFromEuler(GALAXY_TILT);
  const haloRotation: [number, number, number, number] = [
    haloQuaternion.x,
    haloQuaternion.y,
    haloQuaternion.z,
    haloQuaternion.w,
  ];

  for (const accord of accords) {
    const galaxyIndex = accord.galaxyIndex;
    const origin = galaxyPosition(galaxyIndex, seed);
    const color = accordColor(accord);
    const gSeed = galaxySeed(galaxyIndex, seed);
    const seats = Array.from({ length: C.SYSTEMS_PER_GALAXY }, (_, slot) =>
      memberSeatLocal(slot, gSeed).applyEuler(GALAXY_TILT).add(origin),
    );
    origins.push(origin);
    colors.push(color);

    if (accord.kind) {
      halos.push({
        position: [origin.x, origin.y, origin.z],
        quaternion: haloRotation,
        color,
      });
    }

    for (let slot = 0; slot < seats.length; slot++) {
      const seat = seats[slot]!;
      const next = seats[(slot + 1) % seats.length]!;
      const base = galaxyIndex * 31 + slot * 11;
      links.push({
        from: seat,
        to: next,
        fromColor: color,
        toColor: color,
        pulseColor: color,
        phase: (base % 97) / 97,
        rate: 0.045 + (base % 5) * 0.006,
        pulseScale: 0.85,
      });
      links.push({
        from: origin,
        to: seat,
        fromColor: color,
        toColor: color,
        pulseColor: color,
        phase: ((base + 43) % 101) / 101,
        rate: 0.035 + (base % 7) * 0.004,
        pulseScale: 0.65,
      });
    }
  }

  // A stable backbone makes separate galaxy administrations read as one
  // growing civilization. Endpoint colors show which accord meets which.
  for (let galaxyIndex = 1; galaxyIndex < origins.length; galaxyIndex++) {
    const fromColor = colors[galaxyIndex - 1] ?? NEUTRAL_COLOR;
    const toColor = colors[galaxyIndex] ?? NEUTRAL_COLOR;
    links.push({
      from: origins[galaxyIndex - 1]!,
      to: origins[galaxyIndex]!,
      fromColor,
      toColor,
      pulseColor: toColor,
      phase: ((galaxyIndex * 37) % 89) / 89,
      rate: 0.012 + (galaxyIndex % 4) * 0.002,
      pulseScale: 1.25,
    });
  }

  return { links, halos };
}

function lineGeometry(links: readonly NetworkLink[]): BufferGeometry {
  const positions = new Float32Array(links.length * 6);
  const colors = new Float32Array(links.length * 6);
  const fromColor = new Color();
  const toColor = new Color();
  links.forEach((link, index) => {
    const offset = index * 6;
    positions.set(
      [link.from.x, link.from.y, link.from.z, link.to.x, link.to.y, link.to.z],
      offset,
    );
    fromColor.set(link.fromColor);
    toColor.set(link.toColor);
    colors.set(
      [fromColor.r, fromColor.g, fromColor.b, toColor.r, toColor.g, toColor.b],
      offset,
    );
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function NetworkPulses({
  links,
  geometry,
  material,
}: {
  links: readonly NetworkLink[];
  geometry: OctahedronGeometry;
  material: MeshBasicMaterial;
}) {
  const flight = useUiBus((bus) => bus.flightMode);
  const ref = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => new Matrix4(), []);
  const position = useMemo(() => new Vector3(), []);
  const rotation = useMemo(() => new Quaternion(), []);
  const scale = useMemo(() => new Vector3(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new Color();
    mesh.count = links.length;
    links.forEach((link, index) => mesh.setColorAt(index, color.set(link.pulseColor)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [links]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = !universeMotion.reduced && (flight || zoomLive.v > 0.36);
    if (!mesh.visible) return;
    const elapsed = state.clock.elapsedTime;
    links.forEach((link, index) => {
      const progress = (link.phase + elapsed * link.rate) % 1;
      position.copy(link.from).lerp(link.to, progress);
      const flicker = 0.82 + Math.sin((elapsed + link.phase * 13) * 3.2) * 0.18;
      scale.setScalar(link.pulseScale * flicker);
      mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, links.length)]}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}

/**
 * Persistent visible infrastructure derived from system charters. It can be
 * mounted anywhere under the universe Canvas and owns no simulation state.
 */
export function CivilizationNetwork() {
  const flight = useUiBus((bus) => bus.flightMode);
  const localFlight = useUiBus(
    (bus) => bus.flightMode
      && (bus.flightNearGalaxy !== null || bus.flightNearSystem !== null),
  );
  const rev = useGame((game) => game.rev);
  void rev;
  const { s } = useGame.getState();
  const charterSignature = JSON.stringify(s.run.charters);
  const visuals = useMemo(() => {
    const state = useGame.getState().s;
    return visualData(state.seed, deriveGalaxyNetwork(state).galaxies);
  }, [s.seed, s.run.galaxies, charterSignature]);

  const geometry = useMemo(() => lineGeometry(visuals.links), [visuals.links]);
  const lineMaterial = useMemo(
    () => pooledMaterial(
      'civilization-network-lines',
      () => new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    ),
    [],
  );
  const lines = useMemo(() => {
    const object = new LineSegments(geometry, lineMaterial);
    object.raycast = () => null;
    return object;
  }, [geometry, lineMaterial]);
  const haloGeometry = useMemo(
    () => new RingGeometry(GALAXY_R * 0.9, GALAXY_R * 0.915, 96).rotateX(Math.PI / 2),
    [],
  );
  const haloMaterial = useMemo(
    () => pooledMaterial(
      'civilization-network-halos',
      () => new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    ),
    [],
  );
  const pulseGeometry = useMemo(() => new OctahedronGeometry(GALAXY_R * 0.012, 0), []);
  const pulseMaterial = useMemo(
    () => pooledMaterial(
      'civilization-network-pulses',
      () => new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    ),
    [],
  );
  const root = useRef<Group>(null);

  useEffect(() => () => {
    geometry.dispose();
  }, [geometry]);
  useEffect(() => () => {
    haloGeometry.dispose();
    pulseGeometry.dispose();
  }, [haloGeometry, pulseGeometry]);

  useFrame(() => {
    const mapReveal = Math.max(0, Math.min(1, (zoomLive.v - 0.38) / 0.24));
    // Flight clears map focus and may begin from a low zoom band. Keep the
    // civilization the player built legible at the helm instead of allowing
    // that mode change to turn every lane and trade pulse off.
    const reveal = flight
      ? localFlight ? Math.max(0.14, mapReveal * 0.28) : Math.max(0.62, mapReveal)
      : mapReveal;
    lineMaterial.opacity = reveal * (flight ? 0.36 : 0.28);
    haloMaterial.opacity = reveal * (flight ? 0.28 : 0.22);
    pulseMaterial.opacity = reveal * 0.92;
    if (root.current) root.current.visible = reveal > 0 && visuals.links.length > 0;
  });

  if (visuals.links.length === 0) return null;
  return (
    <group ref={root}>
      <primitive object={lines} />
      <InstancedPool
        geometry={haloGeometry}
        material={haloMaterial}
        instances={visuals.halos}
        frustumCulled={false}
      />
      <NetworkPulses
        links={visuals.links}
        geometry={pulseGeometry}
        material={pulseMaterial}
      />
    </group>
  );
}
