import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu';
import { mulberry } from '../../engine/rng';
import { useGame } from '../../state/store';
import { useUiBus } from '../fx/uiBus';
import { SCENE_SPRITES } from '../assets';
import { sceneTex } from './spriteTextures';

const RIPPLE_COUNT = 5;
const SPARK_COUNT = 18;
const SPARKS_PER_BURST = 4;
const TAU = Math.PI * 2;

const Z_AXIS = new Vector3(0, 0, 1);
const Y_AXIS = new Vector3(0, 1, 0);
const SIDE_AXIS = new Vector3();
const TANGENT = new Vector3();
const BITANGENT = new Vector3();
const SPARK_DIRECTION = new Vector3();
const INSTANCE_COLOR = new Color();

interface RippleSlot {
  age: number;
  life: number;
  position: Vector3;
  quaternion: Quaternion;
}

interface SparkSlot {
  age: number;
  life: number;
  position: Vector3;
  velocity: Vector3;
}

export interface PlanetClickFxHandle {
  /** `normal` is a unit vector in the planet's rotating local space. */
  burst: (normal: Vector3) => void;
}

/**
 * A live media-query ref rather than React state: the render loop can honor a
 * preference change immediately without making the whole scene reconcile.
 */
export function useReducedMotionRef(): MutableRefObject<boolean> {
  const reduced = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reduced.current = media.matches;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

/**
 * Fixed-size impact pools. A click only resets existing vectors and lifetimes:
 * no React state, objects, meshes, or materials are allocated in the hot path.
 */
export const PlanetClickFX = forwardRef<
  PlanetClickFxHandle,
  { reducedMotion: MutableRefObject<boolean> }
>(function PlanetClickFX({ reducedMotion }, ref) {
  const rippleMesh = useRef<InstancedMesh>(null);
  const sparkMesh = useRef<InstancedMesh>(null);
  const rippleCursor = useRef(0);
  const sparkCursor = useRef(0);
  const serial = useRef(0);

  const ripples = useMemo<RippleSlot[]>(
    () =>
      Array.from({ length: RIPPLE_COUNT }, () => ({
        age: -1,
        life: 0.5,
        position: new Vector3(),
        quaternion: new Quaternion(),
      })),
    [],
  );
  const sparks = useMemo<SparkSlot[]>(
    () =>
      Array.from({ length: SPARK_COUNT }, () => ({
        age: -1,
        life: 0.42,
        position: new Vector3(),
        velocity: new Vector3(),
      })),
    [],
  );
  const dummy = useMemo(() => new Object3D(), []);
  const rippleGeometry = useMemo(() => new RingGeometry(0.72, 1, 40), []);
  const rippleMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        vertexColors: true,
      }),
    [],
  );
  const sparkGeometry = useMemo(() => new ConeGeometry(0.12, 1, 4), []);
  const sparkMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: 0xf5c84c,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      rippleGeometry.dispose();
      rippleMaterial.dispose();
      sparkGeometry.dispose();
      sparkMaterial.dispose();
    },
    [rippleGeometry, rippleMaterial, sparkGeometry, sparkMaterial],
  );

  useImperativeHandle(
    ref,
    () => ({
      burst(normal) {
        const reduced = reducedMotion.current;
        const ripple = ripples[rippleCursor.current];
        rippleCursor.current = (rippleCursor.current + 1) % RIPPLE_COUNT;
        if (ripple) {
          ripple.age = 0;
          ripple.life = reduced ? 0.14 : 0.5;
          ripple.position.copy(normal).multiplyScalar(1.026);
          ripple.quaternion.setFromUnitVectors(Z_AXIS, normal);
        }

        if (reduced) return;

        SIDE_AXIS.set(0, 1, 0);
        if (Math.abs(normal.y) > 0.86) SIDE_AXIS.set(1, 0, 0);
        TANGENT.crossVectors(normal, SIDE_AXIS).normalize();
        BITANGENT.crossVectors(normal, TANGENT).normalize();
        const clickPhase = serial.current++ * 2.399963;

        for (let i = 0; i < SPARKS_PER_BURST; i++) {
          const spark = sparks[sparkCursor.current];
          sparkCursor.current = (sparkCursor.current + 1) % SPARK_COUNT;
          if (!spark) continue;
          const angle = clickPhase + (i / SPARKS_PER_BURST) * TAU;
          const lateral = 0.31 + ((serial.current + i * 3) % 5) * 0.025;
          spark.age = 0;
          spark.life = 0.32 + ((serial.current + i) % 4) * 0.035;
          spark.position.copy(normal).multiplyScalar(1.045);
          spark.velocity
            .copy(normal)
            .multiplyScalar(0.22)
            .addScaledVector(TANGENT, Math.cos(angle) * lateral)
            .addScaledVector(BITANGENT, Math.sin(angle) * lateral);
        }
      },
    }),
    [reducedMotion, ripples, sparks],
  );

  useFrame((_state, dt) => {
    const d = Math.min(dt, 0.05);
    const rings = rippleMesh.current;
    if (rings) {
      for (let i = 0; i < RIPPLE_COUNT; i++) {
        const ripple = ripples[i];
        if (!ripple || ripple.age < 0) {
          dummy.scale.setScalar(0);
          INSTANCE_COLOR.setRGB(0, 0, 0);
        } else {
          ripple.age += d;
          const p = Math.min(1, ripple.age / ripple.life);
          const fade = (1 - p) * (1 - p);
          const scale =
            (reducedMotion.current ? 0.12 : 0.08 + p * 0.38) * (0.8 + fade * 0.2);
          dummy.position.copy(ripple.position);
          dummy.quaternion.copy(ripple.quaternion);
          dummy.scale.setScalar(scale);
          INSTANCE_COLOR.setRGB(1 * fade, 0.54 * fade, 0.24 * fade);
          if (p >= 1) ripple.age = -1;
        }
        dummy.updateMatrix();
        rings.setMatrixAt(i, dummy.matrix);
        rings.setColorAt(i, INSTANCE_COLOR);
      }
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    }

    const particles = sparkMesh.current;
    if (particles) {
      for (let i = 0; i < SPARK_COUNT; i++) {
        const spark = sparks[i];
        if (!spark || spark.age < 0 || reducedMotion.current) {
          dummy.scale.setScalar(0);
        } else {
          spark.age += d;
          const p = Math.min(1, spark.age / spark.life);
          const fade = (1 - p) * (1 - p);
          spark.position.addScaledVector(spark.velocity, d);
          spark.velocity.multiplyScalar(Math.exp(-d * 3.5));
          SPARK_DIRECTION.copy(spark.velocity).normalize();
          dummy.position.copy(spark.position);
          dummy.quaternion.setFromUnitVectors(Y_AXIS, SPARK_DIRECTION);
          dummy.scale.set(0.035 * fade, 0.18 * fade, 0.035 * fade);
          if (p >= 1) spark.age = -1;
        }
        dummy.updateMatrix();
        particles.setMatrixAt(i, dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group raycast={() => null}>
      <instancedMesh
        ref={rippleMesh}
        args={[rippleGeometry, rippleMaterial, RIPPLE_COUNT]}
        frustumCulled={false}
        raycast={() => null}
      />
      <instancedMesh
        ref={sparkMesh}
        args={[sparkGeometry, sparkMaterial, SPARK_COUNT]}
        frustumCulled={false}
        raycast={() => null}
      />
    </group>
  );
});

let sentientTexture: CanvasTexture | null = null;

/** One shared, tiny runtime texture: cloud cover with a politely pleased face. */
function sentientCloudTexture(): CanvasTexture {
  if (sentientTexture) return sentientTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    sentientTexture = new CanvasTexture(canvas);
    return sentientTexture;
  }

  ctx.shadowColor = 'rgba(90, 215, 232, 0.38)';
  ctx.shadowBlur = 18;
  const cloud = ctx.createLinearGradient(0, 26, 0, 110);
  cloud.addColorStop(0, 'rgba(248, 253, 255, 0.94)');
  cloud.addColorStop(1, 'rgba(158, 207, 231, 0.72)');
  ctx.fillStyle = cloud;
  const puffs: Array<[number, number, number]> = [
    [58, 78, 29],
    [89, 61, 39],
    [128, 54, 45],
    [168, 65, 36],
    [198, 82, 27],
    [126, 87, 48],
  ];
  for (const [x, y, radius] of puffs) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(13, 16, 32, 0.72)';
  ctx.beginPath();
  ctx.arc(108, 69, 4.5, 0, TAU);
  ctx.arc(149, 69, 4.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(13, 16, 32, 0.62)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(128, 70, 24, 0.25, Math.PI - 0.25);
  ctx.stroke();

  sentientTexture = new CanvasTexture(canvas);
  sentientTexture.colorSpace = SRGBColorSpace;
  sentientTexture.needsUpdate = true;
  return sentientTexture;
}

interface CloudSpec {
  phase: number;
  latitude: number;
  speed: number;
  scale: number;
  tilt: number;
}

/** Sentient cloud fronts visibly patrol the atmosphere and maintain morale. */
export function SentientClouds({
  seed,
  reducedMotion,
}: {
  seed: number;
  reducedMotion: MutableRefObject<boolean>;
}) {
  const specs = useMemo<CloudSpec[]>(() => {
    const random = mulberry((seed ^ 0xc10d5) >>> 0);
    return Array.from({ length: 3 }, () => ({
      phase: random() * TAU,
      latitude: (random() - 0.5) * 1.15,
      speed: 0.025 + random() * 0.018,
      scale: 0.38 + random() * 0.09,
      tilt: (random() - 0.5) * 0.16,
    }));
  }, [seed]);
  const materials = useMemo(
    () =>
      specs.map(
        () =>
          new SpriteMaterial({
            map: sentientCloudTexture(),
            color: 0xdff7ff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
      ),
    [specs],
  );
  const refs = useRef<(Sprite | null)[]>([]);

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
    },
    [materials],
  );

  useFrame((state) => {
    const planet = useGame.getState().s.planet;
    const target = planet.targets.atmo;
    const progress = target.lte(0) ? 1 : Math.min(1, planet.gauges.atmo.div(target).toNumber());
    const t = reducedMotion.current ? 0 : state.clock.elapsedTime;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const sprite = refs.current[i];
      const material = materials[i];
      if (!spec || !sprite || !material) continue;
      const angle = spec.phase + t * spec.speed;
      const latitude =
        spec.latitude + (reducedMotion.current ? 0 : Math.sin(t * 0.17 + i) * 0.035);
      const radius = 1.075;
      const horizontal = Math.cos(latitude) * radius;
      sprite.position.set(
        Math.cos(angle) * horizontal,
        Math.sin(latitude) * radius,
        Math.sin(angle) * horizontal,
      );
      const breathe =
        reducedMotion.current ? 1 : 1 + Math.sin(t * 0.5 + spec.phase) * 0.025;
      sprite.scale.set(spec.scale * breathe, spec.scale * 0.5 * breathe, 1);
      material.opacity = 0.16 + progress * 0.42;
      material.rotation =
        spec.tilt + (reducedMotion.current ? 0 : Math.sin(t * 0.21 + i) * 0.025);
    }
  });

  return (
    <group>
      {materials.map((material, i) => (
        <sprite
          key={i}
          ref={(element) => {
            refs.current[i] = element;
          }}
          raycast={() => null}
        >
          <primitive object={material} attach="material" />
        </sprite>
      ))}
    </group>
  );
}

interface AuroraSpec {
  phase: number;
  north: boolean;
  speed: number;
  scale: number;
}

/**
 * The habitual aurora is always faintly legible, then files a brighter
 * celebration every seventh manual intervention.
 */
export function HabitualAuroras({
  seed,
  reducedMotion,
}: {
  seed: number;
  reducedMotion: MutableRefObject<boolean>;
}) {
  const specs = useMemo<AuroraSpec[]>(() => {
    const random = mulberry((seed ^ 0xa0704a) >>> 0);
    return Array.from({ length: 6 }, (_, i) => ({
      phase: (i % 3) * (TAU / 3) + random() * 0.28,
      north: i < 3,
      speed: 0.055 + random() * 0.025,
      scale: 0.34 + random() * 0.08,
    }));
  }, [seed]);
  const materials = useMemo(
    () =>
      specs.map(
        (_, i) =>
          new SpriteMaterial({
            map: sceneTex(SCENE_SPRITES.fx.auroraRibbon),
            color: i % 2 ? 0x58d68a : 0x5ad7e8,
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
      ),
    [specs],
  );
  const refs = useRef<(Sprite | null)[]>([]);
  const pulse = useRef(0);
  const lastMilestone = useRef(Math.floor(useUiBus.getState().punchNonce / 7));

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
    },
    [materials],
  );

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    const nonce = useUiBus.getState().punchNonce;
    const milestone = Math.floor(nonce / 7);
    if (milestone > lastMilestone.current) {
      lastMilestone.current = milestone;
      if (!reducedMotion.current) pulse.current = 1;
    }
    pulse.current = reducedMotion.current ? 0 : Math.max(0, pulse.current - d * 0.55);

    const planet = useGame.getState().s.planet;
    const target = planet.targets.atmo;
    const progress = target.lte(0) ? 1 : Math.min(1, planet.gauges.atmo.div(target).toNumber());
    const t = reducedMotion.current ? 0 : state.clock.elapsedTime;
    const celebration = pulse.current * pulse.current;

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const sprite = refs.current[i];
      const material = materials[i];
      if (!spec || !sprite || !material) continue;
      const direction = spec.north ? 1 : -1;
      const angle = spec.phase + t * spec.speed * direction;
      const radius = 0.39;
      sprite.position.set(
        Math.cos(angle) * radius,
        direction * 1.105,
        Math.sin(angle) * radius,
      );
      const flutter =
        reducedMotion.current ? 1 : 1 + Math.sin(t * 1.15 + spec.phase) * 0.11;
      sprite.scale.set(spec.scale, direction * spec.scale * 1.75 * flutter, 1);
      material.rotation =
        reducedMotion.current ? 0 : Math.sin(t * 0.23 + i) * 0.08;
      material.opacity =
        0.07 +
        progress * 0.13 +
        celebration * (0.34 + 0.08 * Math.sin(t * 2.1 + i));
    }
  });

  return (
    <group>
      {materials.map((material, i) => (
        <sprite
          key={i}
          ref={(element) => {
            refs.current[i] = element;
          }}
          raycast={() => null}
        >
          <primitive object={material} attach="material" />
        </sprite>
      ))}
    </group>
  );
}
