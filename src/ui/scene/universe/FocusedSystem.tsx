import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from 'three/webgpu';
import { useGame } from '../../../state/store';
import { useUiBus } from '../../fx/uiBus';
import type { CompletedPlanetRecord } from '../../../engine/types';
import { settledGeometry, settledMaterial } from '../settledPlanet';
import { MINI_SIZE } from '../miniPlanet';
import { SettledAtmosphere } from './SettledAtmosphere';
import { focusSeat, starClass, starColor, visitOrbit } from '../universeLayout';
import { C } from '../../../content/constants';
import { worldAnchors } from '../navControl';
import { useLamp } from '../SceneLamps';
import { focusOn, focusSystemIndex, inspectHandlers, makeGlowSprite, TYPE_LABEL, visitHandlers } from './shared';
import { CloseupLife, OrbitalHardware, SettlementLights, SystemShuttles } from './SettledWorld';
import { FreightLane } from './LivingLanes';
import { formatDuration } from '../../../engine/num';
import { QUIRK_BY_ID } from '../../../content/quirks';
import { SURVEY_BY_ID } from '../../../content/surveys';
import {
  SPECIALTY_VISUAL,
  isHeritageWorld,
  specialtyFor,
  specialtySummary,
  universeMotion,
  type SystemSpecialty,
} from './operationsVisual';

const HERITAGE_RING_GEO = new RingGeometry(1.23, 1.3, 56);
const HERITAGE_RING_MAT = new MeshBasicMaterial({
  color: 0xf5c84c,
  transparent: true,
  opacity: 0.55,
  side: DoubleSide,
  depthWrite: false,
});
const DISPATCH_RING_GEO = new RingGeometry(0.255, 0.285, 56);
const DISPATCH_MATS: Record<SystemSpecialty, MeshBasicMaterial> = {
  thermal: dispatchMaterial('thermal'),
  atmo: dispatchMaterial('atmo'),
  hydro: dispatchMaterial('hydro'),
  bio: dispatchMaterial('bio'),
  science: dispatchMaterial('science'),
  production: dispatchMaterial('production'),
};

function dispatchMaterial(specialty: SystemSpecialty): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: SPECIALTY_VISUAL[specialty].color,
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

const orbit = visitOrbit;

const BOTTLENECK_LABEL: Record<CompletedPlanetRecord['bottleneck'], string> = {
  thermal: 'thermal',
  atmo: 'atmospheric',
  hydro: 'hydrologic',
  bio: 'biotic',
};

function memorySummary(
  record: CompletedPlanetRecord,
  slot: number,
  heritage: boolean,
): string {
  const details = [
    TYPE_LABEL[record.type] ?? record.type,
    record.size,
    `career world #${record.lifetimeIndex}`,
    `system world ${slot + 1} of ${C.PLANETS_PER_SYSTEM}`,
    `${BOTTLENECK_LABEL[record.bottleneck]} bottleneck`,
  ];
  for (const id of record.quirks.slice(0, 2)) details.push(QUIRK_BY_ID[id]?.text ?? id);
  const survey = record.survey ? SURVEY_BY_ID[record.survey] : null;
  if (survey) details.push(`surveyed: ${survey.name}`);
  if (record.completionMs > 0) details.push(`delivered in ${formatDuration(record.completionMs)}`);
  if (heritage) details.push('Heritage World · preserved in the Magrathean archive');
  return details.join(' / ');
}

/** Closed ellipse for a visit orbit (Line, not LineLoop — WebGPU renderer). */
function orbitGeometry(radius: number): BufferGeometry {
  const n = 80;
  const pts = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const a = ((i % n) / n) * Math.PI * 2;
    pts[i * 3] = Math.cos(a) * radius;
    pts[i * 3 + 1] = Math.sin(a) * radius * 0.22;
    pts[i * 3 + 2] = Math.sin(a) * radius * 0.6;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pts, 3));
  return geo;
}

/** One remembered world, back at full presence, wearing its name. */
function VisitWorld({
  record,
  slot,
  globalIndex,
  heritage,
  delay,
}: {
  record: CompletedPlanetRecord;
  slot: number;
  /** Index into run.completedPlanets — the world-focus target. */
  globalIndex: number;
  heritage: boolean;
  delay: number;
}) {
  const root = useRef<Group>(null);
  const planet = useRef<Mesh>(null);
  const heritageRing = useRef<Mesh>(null);
  // The camera parked at this exact world earns the full civic treatment.
  const isCloseup = useUiBus(
    (b) => b.focus?.kind === 'world' && b.focus.index === globalIndex,
  );
  // Detail 3: these are the worlds you came to look at — give them curvature.
  // Hero-grade now, and cached — do NOT dispose; other views share it.
  const geometry = useMemo(
    () => settledGeometry(record, isCloseup ? 'closeup' : 'visit'),
    [record, isCloseup],
  );
  const material = useMemo(() => settledMaterial(record), [record]);
  // Publish this world's exact position for the camera to descend onto.
  useEffect(() => {
    worldAnchors.set(globalIndex, new Vector3());
    return () => void worldAnchors.delete(globalIndex);
  }, [globalIndex]);
  const born = useRef<number | null>(null);
  const o = orbit(slot);
  const size = MINI_SIZE[record.size] * 0.85;

  useFrame((state) => {
    const group = root.current;
    if (!group) return;
    const clock = state.clock.elapsedTime;
    if (born.current === null) born.current = clock;
    const t = universeMotion.reduced ? 0 : clock;
    const k = universeMotion.reduced
      ? 1
      : Math.min(1, Math.max(0, (clock - born.current - delay) / 0.5));
    const ease = 1 - Math.pow(1 - k, 3);
    const a = o.phase + t * o.speed;
    group.position.set(
      Math.cos(a) * o.radius,
      Math.sin(a) * o.radius * 0.22,
      Math.sin(a) * o.radius * 0.6,
    );
    group.scale.setScalar(0.001 + ease * size);
    const anchor = worldAnchors.get(globalIndex);
    if (anchor) group.getWorldPosition(anchor);
    if (planet.current) planet.current.rotation.y = universeMotion.reduced ? 0 : t * 0.35;
    if (heritageRing.current && !universeMotion.reduced) {
      heritageRing.current.rotation.z = slot * 0.7 - t * 0.16;
    }
  });

  return (
    <group ref={root}>
      <mesh
        ref={planet}
        geometry={geometry}
        material={material}
        {...visitHandlers(
          record.name,
          memorySummary(record, slot, heritage),
          () => focusOn({ kind: 'world', index: globalIndex }),
        )}
      >
        {/* Generous invisible hit volume — these worlds are small and precious. */}
        <mesh visible={false}>
          <sphereGeometry args={[1.9, 8, 8]} />
        </mesh>
        {/* Settlements ride the surface, turning with the world. */}
        <SettlementLights record={record} variant={isCloseup ? 'closeup' : 'visit'} />
      </mesh>
      <SettledAtmosphere record={record} />
      {/* The hardware recorded at delivery, still on station. */}
      <OrbitalHardware record={record} variant={isCloseup ? 'closeup' : 'visit'} />
      {isCloseup && <CloseupLife record={record} />}
      {heritage && (
        <mesh
          ref={heritageRing}
          geometry={HERITAGE_RING_GEO}
          material={HERITAGE_RING_MAT}
          rotation={[Math.PI / 2.35, 0, slot * 0.7]}
          raycast={() => null}
        />
      )}
    </group>
  );
}

/**
 * A visited system: the five worlds you actually terraformed, rebuilt from
 * their records, orbiting the star they were delivered to. Works at a
 * constellation glyph and equally deep inside a formed galaxy's disc.
 * Also carries the deepest ladder rung: a `world` focus renders its parent
 * system while the camera goes nose-to-nose with one planet. In manual
 * flight the same treatment greets the runabout: fly close to any formed
 * system and its worlds materialize around you.
 */
export function FocusedSystem() {
  const focus = useUiBus((b) => b.focus);
  const flightSystem = useUiBus((b) => (b.flightMode ? b.flightNearSystem : null));
  const rev = useGame((g) => g.rev);
  void rev;
  const systemIndex =
    flightSystem ?? (focus && focus.kind !== 'galaxy' ? focusSystemIndex(focus) : null);
  if (systemIndex === null) return null;
  return <FocusedSystemInner key={systemIndex} index={systemIndex} />;
}

function FocusedSystemInner({ index }: { index: number }) {
  // The dispatch halo circles the star at system scale; from a world
  // close-up you are standing inside it, so it bows out.
  const worldFocused = useUiBus((b) => b.focus?.kind === 'world');
  const { s } = useGame.getState();
  const records = useMemo(
    () =>
      s.run.completedPlanets.slice(
        index * C.PLANETS_PER_SYSTEM,
        (index + 1) * C.PLANETS_PER_SYSTEM,
      ),
    // records are immutable once the system has formed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index],
  );
  const seat = useMemo(
    () => focusSeat({ kind: 'system', index }, s.seed, s.run.galaxies),
    // seat only moves if the galaxy count changes, which clears focus anyway
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index],
  );
  const star = useMemo(() => starColor(records[0]?.seed ?? s.seed), [records, s.seed]);
  const glowMat = useMemo(() => makeGlowSprite(star.getHex(), 0.9), [star]);
  const specialty = specialtyFor(s, index);
  const dispatchSummary = specialtySummary(specialty);
  const lineMat = useMemo(
    () => new LineBasicMaterial({ color: 0x8ca0c8, transparent: true, opacity: 0 }),
    [],
  );
  const orbits = useMemo(
    () =>
      records.map((_, i) => {
        const l = new Line(orbitGeometry(orbit(i).radius), lineMat);
        l.raycast = () => null;
        return l;
      }),
    [records, lineMat],
  );
  useEffect(
    () => () => {
      orbits.forEach((l) => l.geometry.dispose());
      lineMat.dispose();
    },
    [orbits, lineMat],
  );

  // Stale focus (prestige raced the click, records gone) — let the camera go.
  useEffect(() => {
    if (records.length === 0) useUiBus.getState().setFocus(null);
  }, [records]);

  // The star lights its own worlds. `seat` is already a world position, so
  // the lamp needs no parent transform.
  const lamp = useLamp();
  useEffect(() => {
    lamp.set(seat, star, 3.6, 5.5);
  }, [lamp, seat, star]);

  const spin = useRef<Group>(null);
  const dispatch = useRef<Group>(null);
  const born = useRef<number | null>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;
    // Orbit lines fade in as the camera arrives.
    lineMat.opacity = universeMotion.reduced
      ? 0.2
      : Math.min(1, (t - born.current) / 0.9) * 0.2;
    if (!universeMotion.reduced) {
      if (spin.current) spin.current.rotation.y += dt * 0.01;
      if (dispatch.current) dispatch.current.rotation.z -= dt * 0.12;
    }
  });

  if (records.length === 0) return null;
  return (
    <group position={seat}>
      <mesh
        {...inspectHandlers(
          `System ${index + 1}`,
          `${starClass(records[0]!.seed)}${dispatchSummary ? ` · ${dispatchSummary}` : ''}`,
        )}
      >
        <icosahedronGeometry args={[0.17, 2]} />
        <meshBasicMaterial color={star} />
      </mesh>
      <sprite scale={[1.2, 1.2, 1]} raycast={() => null}>
        <primitive object={glowMat} attach="material" />
      </sprite>
      {specialty && !worldFocused && (
        <group ref={dispatch} rotation={[0.52, 0, 0.16]}>
          <mesh
            geometry={DISPATCH_RING_GEO}
            material={DISPATCH_MATS[specialty]}
            raycast={() => null}
          />
          <mesh position={[0.27, 0, 0]} scale={0.025} raycast={() => null}>
            <tetrahedronGeometry args={[1, 0]} />
            <primitive object={DISPATCH_MATS[specialty]} attach="material" />
          </mesh>
        </group>
      )}
      {/* The star's light comes from the permanent pool — see SceneLamps. */}
      {/* A specialized system visibly works its dispatch route. At a world
          close-up the system-scale traffic yields the frame. */}
      {specialty && !worldFocused && (
        <FreightLane specialty={specialty} seed={records[0]!.seed} />
      )}
      <group ref={spin}>
        {orbits.map((l, i) => (
          <primitive key={i} object={l} />
        ))}
        {records.map((rec, i) => (
          <VisitWorld
            key={`${rec.seed}-${i}`}
            record={rec}
            slot={i}
            globalIndex={index * C.PLANETS_PER_SYSTEM + i}
            heritage={isHeritageWorld(s, rec)}
            delay={0.12 + i * 0.07}
          />
        ))}
        {/* Commuters thread between the worlds, endpoints exact in spin space. */}
        {!worldFocused && (
        <SystemShuttles
          spec={{
            worldPos: (slot, t, out) => {
              const o = orbit(slot);
              const a = o.phase + t * o.speed;
              out.set(
                Math.cos(a) * o.radius,
                Math.sin(a) * o.radius * 0.22,
                Math.sin(a) * o.radius * 0.6,
              );
            },
            worldCount: records.length,
            ships: 1 + Math.min(3, Math.floor(s.lifetime.planetsCompleted / 10)),
            seed: records[0]!.seed,
            scale: 0.07,
          }}
        />
        )}
      </group>
    </group>
  );
}
