import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, MeshBasicMaterial, Sprite, Vector3 } from 'three/webgpu';
import { useGame } from '../../../state/store';
import { useUiBus, type CinematicJob } from '../../fx/uiBus';
import { SCENE_SPRITES } from '../../assets';
import { settledGeometry, settledMaterial } from '../settledPlanet';
import { MINI_SIZE } from '../miniPlanet';
import {
  CURRENT_SYSTEM_ANCHOR,
  galaxyPosition,
  orbitSlot,
  starColor,
  systemGlyphPosition,
} from '../universeLayout';
import { C } from '../../../content/constants';
import * as audio from '../../audio/audio';
import { makeGlowSprite, makeTexSprite } from './shared';
import { useLamp } from '../SceneLamps';
import { sharedBasicMaterial } from './pool';

const P = new Vector3();
const DIR = new Vector3();
const Z_AXIS = new Vector3(0, 0, 1);
/** The colour a galaxy is born in. */
const FLASH_COLOR = new Color(0xfff0d0);

function easeInOut(k: number): number {
  return k * k * (3 - 2 * k);
}

/**
 * SYSTEM FORMATION — the five worlds you finished spiral into their star,
 * the star ignites, and the whole arrangement is delivered — as a comet of
 * light — to its permanent seat in the constellation.
 */
function SystemFormation({ job }: { job: CinematicJob }) {
  const s = useGame.getState().s;
  const records = useMemo(
    () =>
      s.run.completedPlanets.slice(
        job.index * C.PLANETS_PER_SYSTEM,
        (job.index + 1) * C.PLANETS_PER_SYSTEM,
      ),
    // records are immutable once formed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job.index],
  );
  // Cached in settledPlanet.ts — do NOT dispose; other views share them.
  const geoms = useMemo(() => records.map((r) => settledGeometry(r, 'mini')), [records]);
  const mats = useMemo(() => records.map((r) => settledMaterial(r)), [records]);

  const star = useMemo(() => starColor(records[0]?.seed ?? s.seed), [records, s.seed]);
  const target = useMemo(() => systemGlyphPosition(job.index, s.seed), [job.index, s.seed]);

  const worlds = useRef<(Mesh | null)[]>([]);
  const starRef = useRef<Mesh>(null);
  const flareRef = useRef<Sprite>(null);
  const shockRef = useRef<Sprite>(null);
  const streakGlow = useRef<Sprite>(null);
  const streakTrail = useRef<Mesh>(null);
  const arriveRef = useRef<Sprite>(null);
  const lamp = useLamp();
  const t0 = useRef<number | null>(null);
  const ignited = useRef(false);

  const flareMat = useMemo(() => makeGlowSprite(star.getHex(), 0), [star]);
  const streakMat = useMemo(() => makeGlowSprite(0xfff6e0, 0.9), []);
  const shockMat = useMemo(
    () => makeTexSprite(SCENE_SPRITES.fx.shockwaveRing, { color: star.getHex(), opacity: 0, additive: true }),
    [star],
  );
  const arriveMat = useMemo(
    () => makeTexSprite(SCENE_SPRITES.fx.shockwaveRing, { color: 0xbfd4ff, opacity: 0, additive: true }),
    [],
  );
  const trailMat = useMemo(
    () => new MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0, depthWrite: false }),
    [],
  );

  const SPIRAL_END = 1.5;
  const FLARE_T = 1.42;
  const FLARE_LEN = 0.55;
  const STREAK_A = 1.9;
  const STREAK_B = 3.15;
  const END = 4.3;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t0.current === null) t0.current = t;
    const e = t - t0.current;

    // Phase 1 — the spiral-in. Orbits tighten and quicken; five separate
    // histories become one address.
    for (let i = 0; i < records.length; i++) {
      const mesh = worlds.current[i];
      if (!mesh) continue;
      const o = orbitSlot(i);
      const k = Math.min(1, e / SPIRAL_END);
      const pull = k * k;
      const a = o.phase + t * o.speed + pull * (6.5 - i * 0.5);
      const radius = o.radius * (1 - pull) + 0.14 * pull;
      mesh.position.set(
        CURRENT_SYSTEM_ANCHOR.x + Math.cos(a) * radius,
        CURRENT_SYSTEM_ANCHOR.y + Math.sin(a) * radius * 0.22,
        CURRENT_SYSTEM_ANCHOR.z + Math.sin(a) * radius * 0.6,
      );
      mesh.rotation.y = t * 0.6;
      const size = MINI_SIZE[records[i]!.size];
      const fade = e > FLARE_T ? Math.max(0, 1 - (e - FLARE_T) / 0.3) : 1;
      mesh.scale.setScalar(size * (1 - 0.35 * pull) * fade);
    }

    // Phase 2 — ignition.
    if (e >= FLARE_T && !ignited.current) {
      ignited.current = true;
      audio.igniteSting();
    }
    const f = Math.max(0, Math.min(1, (e - FLARE_T) / FLARE_LEN));
    const flare = Math.sin(Math.PI * f);
    if (flareRef.current) {
      flareRef.current.scale.setScalar(0.5 + flare * 6);
      flareMat.opacity = flare * 0.95;
    }
    // The star departs WITH the comet — nothing stays behind but the address.
    const departure = Math.max(0, Math.min(1, (e - STREAK_A) / 0.45));
    if (starRef.current)
      starRef.current.scale.setScalar((0.34 + flare * 0.5) * (1 - departure));
    if (shockRef.current) {
      shockRef.current.scale.setScalar(0.5 + f * 12);
      shockMat.opacity = f > 0 ? (1 - f) * 0.7 : 0;
    }

    // Phase 3 — delivery. One comet, one address label being typed.
    const sk = Math.max(0, Math.min(1, (e - STREAK_A) / (STREAK_B - STREAK_A)));
    const se = easeInOut(sk);
    P.copy(CURRENT_SYSTEM_ANCHOR).lerp(target, se);
    P.y += Math.sin(Math.PI * se) * 2.4;
    if (streakGlow.current) {
      streakGlow.current.position.copy(P);
      const vis = sk > 0 && sk < 1 ? 1 : 0;
      streakGlow.current.scale.setScalar(2.1 * vis + 0.001);
      streakMat.opacity = vis * 0.95;
    }
    if (streakTrail.current) {
      // Point the trail along the direction of travel.
      const ahead = Math.min(1, se + 0.02);
      DIR.copy(CURRENT_SYSTEM_ANCHOR).lerp(target, ahead);
      DIR.y += Math.sin(Math.PI * ahead) * 2.4;
      DIR.sub(P);
      const len = Math.max(0.001, DIR.length());
      DIR.normalize();
      streakTrail.current.position.copy(P).addScaledVector(DIR, -1.1);
      streakTrail.current.quaternion.setFromUnitVectors(Z_AXIS, DIR);
      streakTrail.current.scale.set(1, 1, 1 + len * 24);
      trailMat.opacity = sk > 0 && sk < 1 ? 0.6 : 0;
    }
    // The ceremony's own light rides the new star out to its seat.
    lamp.set(
      sk > 0 ? P : CURRENT_SYSTEM_ANCHOR,
      star,
      sk > 0 ? 8 * (1 - sk * 0.6) : 5 + flare * 70,
      12,
    );

    // Phase 4 — arrival ring at the constellation seat.
    const ak = Math.max(0, Math.min(1, (e - STREAK_B) / (END - STREAK_B)));
    if (arriveRef.current) {
      arriveRef.current.scale.setScalar(0.5 + ak * 7.5);
      arriveMat.opacity = ak > 0 ? (1 - ak) * 0.85 : 0;
    }

    if (e >= END) useUiBus.getState().finishCinematic();
  });

  return (
    <group>
      {records.map((r, i) => (
        <mesh
          key={`${r.seed}-${i}`}
          ref={(el) => {
            worlds.current[i] = el;
          }}
          geometry={geoms[i]}
          material={mats[i]}
          raycast={() => null}
        />
      ))}
      <mesh ref={starRef} position={CURRENT_SYSTEM_ANCHOR} raycast={() => null}>
        <icosahedronGeometry args={[1, 2]} />
        <primitive object={sharedBasicMaterial({ color: star })} attach="material" />
      </mesh>
      <sprite ref={flareRef} position={CURRENT_SYSTEM_ANCHOR} raycast={() => null}>
        <primitive object={flareMat} attach="material" />
      </sprite>
      <sprite ref={shockRef} position={CURRENT_SYSTEM_ANCHOR} raycast={() => null}>
        <primitive object={shockMat} attach="material" />
      </sprite>
      <sprite ref={streakGlow} raycast={() => null}>
        <primitive object={streakMat} attach="material" />
      </sprite>
      <mesh ref={streakTrail} raycast={() => null}>
        <boxGeometry args={[0.035, 0.035, 0.1]} />
        <primitive object={trailMat} attach="material" />
      </mesh>
      <sprite ref={arriveRef} position={target} raycast={() => null}>
        <primitive object={arriveMat} attach="material" />
      </sprite>
      {/* Ceremony light: pool slot, driven above — see SceneLamps. */}
    </group>
  );
}

/**
 * GALAXY FORMATION — five settled stars leave the constellation at once,
 * converge on a point that was recently just a rumor of gravity, and
 * become somebody's spiral. Yours, technically.
 */
function GalaxyFormation({ job }: { job: CinematicJob }) {
  const s = useGame.getState().s;
  const sources = useMemo(
    () =>
      Array.from({ length: C.SYSTEMS_PER_GALAXY }, (_, k) =>
        systemGlyphPosition(job.index * C.SYSTEMS_PER_GALAXY + k, s.seed),
      ),
    // positions are pure functions of index+seed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job.index],
  );
  const colors = useMemo(
    () =>
      Array.from({ length: C.SYSTEMS_PER_GALAXY }, (_, k) => {
        const si = job.index * C.SYSTEMS_PER_GALAXY + k;
        const rec = s.run.completedPlanets[si * C.PLANETS_PER_SYSTEM];
        return starColor(rec ? rec.seed : si + 1);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job.index],
  );
  const target = useMemo(() => galaxyPosition(job.index, s.seed), [job.index, s.seed]);

  const streaks = useRef<(Sprite | null)[]>([]);
  const streakMats = useMemo(() => colors.map((c) => makeGlowSprite(c.getHex(), 0.9)), [colors]);
  const flashRef = useRef<Sprite>(null);
  const flashMat = useMemo(() => makeGlowSprite(0xfff0d0, 0), []);
  const shockRef = useRef<Sprite>(null);
  const shockMat = useMemo(
    () => makeTexSprite(SCENE_SPRITES.fx.shockwaveRing, { color: 0xffe9c0, opacity: 0, additive: true }),
    [],
  );
  const lamp = useLamp();
  const t0 = useRef<number | null>(null);
  const boomed = useRef(false);
  // Parked on the birth site; only the flash moves it (setIntensity, below).
  useEffect(() => {
    lamp.set(target, FLASH_COLOR, 0, 20);
  }, [lamp, target]);

  const CONVERGE = 1.75;
  const FLASH_T = 1.8;
  const FLASH_LEN = 0.55;
  const END = 2.7;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t0.current === null) t0.current = t;
    const e = t - t0.current;

    for (let i = 0; i < sources.length; i++) {
      const sp = streaks.current[i];
      if (!sp) continue;
      const start = i * 0.11;
      const k = Math.max(0, Math.min(1, (e - start) / (CONVERGE - start - 0.1)));
      const se = easeInOut(k);
      sp.position.copy(sources[i]!).lerp(target, se);
      sp.position.y += Math.sin(Math.PI * se) * (0.8 + i * 0.3);
      const vis = k < 1 ? 1 : 0;
      sp.scale.setScalar((1.5 + Math.sin(Math.PI * se) * 0.7) * vis + 0.001);
      streakMats[i]!.opacity = vis * 0.95;
    }

    if (e >= FLASH_T && !boomed.current) {
      boomed.current = true;
      audio.galaxySting();
    }
    const f = Math.max(0, Math.min(1, (e - FLASH_T) / FLASH_LEN));
    const flash = Math.sin(Math.PI * f);
    if (flashRef.current) {
      flashRef.current.scale.setScalar(0.5 + flash * 8);
      flashMat.opacity = flash;
    }
    if (shockRef.current) {
      shockRef.current.scale.setScalar(0.7 + f * 16);
      shockMat.opacity = f > 0 ? (1 - f) * 0.65 : 0;
    }
    lamp.setIntensity(flash * 90);

    if (e >= END) useUiBus.getState().finishCinematic();
  });

  return (
    <group>
      {sources.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            streaks.current[i] = el;
          }}
          raycast={() => null}
        >
          <primitive object={streakMats[i]!} attach="material" />
        </sprite>
      ))}
      <sprite ref={flashRef} position={target} raycast={() => null}>
        <primitive object={flashMat} attach="material" />
      </sprite>
      <sprite ref={shockRef} position={target} raycast={() => null}>
        <primitive object={shockMat} attach="material" />
      </sprite>
      {/* Ceremony light: pool slot, driven above — see SceneLamps. */}
    </group>
  );
}

/** Formation cinematics, one at a time, driven by the uiBus queue. */
export function FormationFX() {
  const cine = useUiBus((b) => b.activeCinematic);
  if (!cine) return null;
  return cine.kind === 'system' ? (
    <SystemFormation key={cine.id} job={cine} />
  ) : (
    <GalaxyFormation key={cine.id} job={cine} />
  );
}
