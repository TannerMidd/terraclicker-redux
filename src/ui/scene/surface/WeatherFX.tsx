/**
 * The weather, embodied: everything that falls, streaks, flashes or rumbles.
 *
 * Reads `surfaceLive.weather` — the control layer's per-frame snapshot of
 * engine/weather.ts — and never decides anything itself. One instanced pool
 * carries every precipitation kind (rain, snow, dust, ash) by changing
 * uniforms and shapes; meteors get a small additive pool of their own on a
 * distant shell. Lightning is `surfaceLive.skyFlash`, already deterministic,
 * expressed here as a lamp, a sky uniform (the scene wires that) and a
 * thunderclap that arrives politely late.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, Color, InstancedMesh, Matrix4, Object3D, Vector3 } from 'three/webgpu';
import { surfaceLive } from './surfaceControl';
import { createPrecipMaterial } from './surfaceMaterial';
import { mulberry } from '../../../engine/rng';
import type { GroundfallSession } from '../../fx/uiBus';
import type { PlanetPalette } from '../planetMaterial';
import { useLamp } from '../SceneLamps';
import * as audio from '../../audio/audio';

const PRECIP_MAX = 540;
const METEOR_MAX = 26;
const BOX = { x: 26, y: 19, z: 26 };

interface PrecipStyle {
  fall: number; // m/s downward
  windK: number; // multiplier on the front's wind
  w: number;
  h: number;
  tint: number | 'dust';
  fade: number;
  /** Fraction of the pool actually shown at full intensity. */
  density: number;
}

const STYLES: Record<string, PrecipStyle> = {
  rain: { fall: 21, windK: 1, w: 0.02, h: 0.62, tint: 0x9db8d8, fade: 0.5, density: 1 },
  storm: { fall: 24, windK: 1.2, w: 0.022, h: 0.7, tint: 0x8fa6c4, fade: 0.55, density: 1 },
  whiteout: { fall: 2.6, windK: 1.7, w: 0.075, h: 0.075, tint: 0xf4f8fd, fade: 0.85, density: 1 },
  dust: { fall: 1.2, windK: 2.6, w: 0.17, h: 0.05, tint: 'dust', fade: 0.42, density: 0.9 },
  ash: { fall: 2.8, windK: 1.1, w: 0.06, h: 0.06, tint: 0x54555a, fade: 0.6, density: 0.8 },
};

const SEAT = new Object3D();
const M0 = new Matrix4().makeScale(0, 0, 0);
const M2 = new Matrix4();
const LIGHTNING = new Color(0xcfe0ff);
const V = new Vector3();
const ALONG = new Vector3();
const TO_CAM = new Vector3();
const SIDE = new Vector3();
const FACE = new Vector3();

export function SurfaceWeather({
  session,
  palette,
}: {
  session: GroundfallSession;
  palette: PlanetPalette;
}) {
  const camera = useThree((s) => s.camera);
  const precip = useRef<InstancedMesh>(null);
  const meteors = useRef<InstancedMesh>(null);
  const bolt = useLamp();

  const precipMat = useMemo(() => createPrecipMaterial(), []);
  const meteorMat = useMemo(() => {
    const m = createPrecipMaterial();
    (m.uniforms.glow as { value: number }).value = 1;
    (m.uniforms.fade as { value: number }).value = 0.9;
    m.mat.blending = AdditiveBlending; // hot things add
    return m;
  }, []);
  const dustTint = useMemo(
    () => palette.low.clone().lerp(new Color(0xffffff), 0.25),
    [palette],
  );

  // The pool: world positions plus a per-particle drift personality.
  const pool = useMemo(() => {
    const r = mulberry((session.seed ^ 0x9a1e) >>> 0);
    return {
      pos: Float32Array.from({ length: PRECIP_MAX * 3 }, () => (r() - 0.5) * 2 * BOX.x),
      drift: Float32Array.from({ length: PRECIP_MAX * 2 }, () => (r() - 0.5) * 1.6),
      vary: Float32Array.from({ length: PRECIP_MAX }, () => 0.6 + r() * 0.8),
    };
  }, [session.seed]);

  const shower = useMemo(() => {
    // The shower's radiant: one deterministic heading per world.
    const r = mulberry((session.seed ^ 0x3e7e0) >>> 0);
    const az = r() * Math.PI * 2;
    return { az, meteors: [] as { pos: Vector3; vel: Vector3; life: number }[] };
  }, [session.seed]);

  const lastFlash = useRef(0);

  useEffect(() => () => {
    audio.weatherPrecipStop();
    audio.tremorRumbleStop();
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const live = surfaceLive;
    const w = live.weather;
    const k = w.intensity;
    const grounded = live.phase === 'walk' || live.phase === 'descent';

    // — Audio: the sky's register, all of it driven from the snapshot. —
    if (grounded) {
      switch (w.kind) {
        case 'rain':
          audio.weatherPrecipSet(k * 0.9, 0.75);
          break;
        case 'storm':
          audio.weatherPrecipSet(k * 0.6, 0.8);
          break;
        case 'whiteout':
          audio.weatherPrecipSet(k * 0.7, 0.3);
          break;
        case 'dust':
          audio.weatherPrecipSet(k * 0.6, 0.55);
          break;
        case 'ash':
          audio.weatherPrecipSet(k * 0.4, 0.25);
          break;
        default:
          audio.weatherPrecipSet(0, 0.5);
      }
      audio.tremorRumbleSet(live.groundShake);
      if (live.phase === 'walk') {
        const windy = w.kind === 'dust' || w.kind === 'whiteout' || w.kind === 'storm' ? 1 : 0.4;
        audio.surfaceWindSet(0.45 + k * 0.5 * windy, live.sunUp);
      }
    }

    // — Thunder rides the flash's rising edge, a beat behind the light. —
    if (live.skyFlash > 0.5 && lastFlash.current <= 0.5) {
      audio.thunder(0.4 + Math.random() * 1.3);
    }
    lastFlash.current = live.skyFlash;

    // — The bolt: a huge brief lamp somewhere upwind of the walker. —
    if (live.skyFlash > 0.02) {
      V.set(camera.position.x + w.wind[0] * 40, camera.position.y + 900, camera.position.z - w.wind[1] * 40);
      bolt.set(V, LIGHTNING, live.skyFlash * 260, 4200);
    } else {
      bolt.setIntensity(0);
    }

    // — Precipitation. —
    const mesh = precip.current;
    const style = STYLES[w.kind];
    if (mesh) {
      mesh.visible = Boolean(style) && k > 0.03 && grounded;
      if (mesh.visible && style) {
        const tint = precipMat.uniforms.tint as { value: Color };
        if (style.tint === 'dust') tint.value.copy(dustTint);
        else tint.value.set(style.tint);
        (precipMat.uniforms.fade as { value: number }).value = style.fade * Math.min(1, k * 1.5);

        const shown = Math.round(PRECIP_MAX * style.density * Math.min(1, k * 1.4));
        // Wind arrives in the landing frame: +x east, +z south (north = −z).
        const wx = w.wind[0] * style.windK;
        const wz = -w.wind[1] * style.windK;
        const camYaw = live.yaw;
        const lean = Math.atan2(Math.hypot(wx, wz), style.fall) * 0.8;
        const leanAxis = Math.atan2(wx, wz);
        for (let i = 0; i < PRECIP_MAX; i++) {
          if (i >= shown) {
            mesh.setMatrixAt(i, M0);
            continue;
          }
          const j = i * 3;
          const vary = pool.vary[i]!;
          pool.pos[j]! += (wx + pool.drift[i * 2]!) * vary * dt;
          pool.pos[j + 1]! -= style.fall * vary * dt;
          pool.pos[j + 2]! += (wz + pool.drift[i * 2 + 1]!) * vary * dt;

          // Wrap into the camera box, top-in for fallers.
          let x = pool.pos[j]! - camera.position.x;
          let y = pool.pos[j + 1]! - camera.position.y;
          let z = pool.pos[j + 2]! - camera.position.z;
          if (x > BOX.x) pool.pos[j]! -= 2 * BOX.x;
          else if (x < -BOX.x) pool.pos[j]! += 2 * BOX.x;
          if (y < -BOX.y * 0.35) pool.pos[j + 1]! += BOX.y * 1.35;
          else if (y > BOX.y) pool.pos[j + 1]! -= BOX.y * 1.35;
          if (z > BOX.z) pool.pos[j + 2]! -= 2 * BOX.z;
          else if (z < -BOX.z) pool.pos[j + 2]! += 2 * BOX.z;
          x = pool.pos[j]!;
          y = pool.pos[j + 1]!;
          z = pool.pos[j + 2]!;

          SEAT.position.set(x, y, z);
          SEAT.rotation.set(0, camYaw, 0);
          if (style.fall > 8) {
            // Rain leans with the wind it is falling through.
            SEAT.rotateOnWorldAxis(V.set(Math.cos(leanAxis), 0, -Math.sin(leanAxis)).normalize(), lean);
          }
          SEAT.scale.set(style.w * vary, style.h * vary, 1);
          SEAT.updateMatrix();
          mesh.setMatrixAt(i, SEAT.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // — Meteors: brief, bright, and honestly outside the weather budget. —
    const mmesh = meteors.current;
    if (mmesh) {
      const active = w.kind === 'meteors' && k > 0.05;
      mmesh.visible = active || shower.meteors.length > 0;
      if (active && shower.meteors.length < METEOR_MAX && Math.random() < k * 0.5) {
        // Streaks appear anywhere in the sky; the RADIANT is what they share
        // — every one flies the same way, which is what makes it a shower.
        const az = Math.random() * Math.PI * 2;
        const el = 0.25 + Math.random() * 0.75;
        const dist = 4000 + Math.random() * 3500;
        const pos = new Vector3(
          camera.position.x + Math.cos(az) * Math.cos(el) * dist,
          camera.position.y + Math.sin(el) * dist,
          camera.position.z + Math.sin(az) * Math.cos(el) * dist,
        );
        const vel = new Vector3(
          -Math.cos(shower.az) * 0.7 + (Math.random() - 0.5) * 0.2,
          -0.75,
          -Math.sin(shower.az) * 0.7 + (Math.random() - 0.5) * 0.2,
        ).normalize().multiplyScalar(2400);
        shower.meteors.push({ pos, vel, life: 1 });
      }
      let alive = 0;
      for (const m of shower.meteors) {
        m.life -= dt / 1.5;
        m.pos.addScaledVector(m.vel, dt);
      }
      shower.meteors = shower.meteors.filter((m) => m.life > 0);
      for (const m of shower.meteors) {
        // Axial billboard: the streak's long axis rides the velocity and the
        // face rolls toward the camera — a velocity-aligned quad is edge-on
        // otherwise, which is how a meteor shower renders as nothing at all.
        const fadeK = Math.sin(Math.min(1, m.life) * Math.PI);
        ALONG.copy(m.vel).normalize();
        TO_CAM.copy(camera.position).sub(m.pos).normalize();
        SIDE.crossVectors(ALONG, TO_CAM);
        if (SIDE.lengthSq() < 1e-8) SIDE.set(1, 0, 0);
        SIDE.normalize();
        FACE.crossVectors(SIDE, ALONG).normalize();
        M2.makeBasis(
          SIDE.multiplyScalar(26 * fadeK),
          ALONG.multiplyScalar(430 * fadeK),
          FACE,
        );
        M2.setPosition(m.pos);
        mmesh.setMatrixAt(alive++, M2);
      }
      for (let i = alive; i < METEOR_MAX; i++) mmesh.setMatrixAt(i, M0);
      mmesh.instanceMatrix.needsUpdate = true;
    }
    void state;
  });

  return (
    <>
      <instancedMesh ref={precip} args={[undefined, undefined, PRECIP_MAX]} material={precipMat.mat} frustumCulled={false} visible={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      <instancedMesh ref={meteors} args={[undefined, undefined, METEOR_MAX]} material={meteorMat.mat} frustumCulled={false} visible={false} renderOrder={-5}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
    </>
  );
}
