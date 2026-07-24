import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three/webgpu';
import { heroScreen, useUiBus, zoomLive, type FocusTarget } from '../fx/uiBus';
import { useGame } from '../../state/store';
import { C } from '../../content/constants';
import {
  BAND_STOPS,
  bandAt,
  focusFraming,
  focusSeat,
  GALAXY_TILT,
  galaxyPosition,
  galaxySeed,
  memberSeatLocal,
  sampleJourney,
  visitWorldAnchor,
} from './universeLayout';
import { focusOn, hopSibling, stepFocusOut } from './universe/shared';
import { universeMotion } from './universe/operationsVisual';
import { navLive, nudgeOrbit, orbitEngaged, resetOrbit, worldAnchors } from './navControl';
import { MINI_SIZE } from './miniPlanet';
import * as audio from '../audio/audio';

const CAM = new Vector3();
const LOOK = new Vector3();
const FCAM = new Vector3();
const FLOOK = new Vector3();
const FROMC = new Vector3();
const FROML = new Vector3();
const LOOK_LAST = new Vector3(1.28, 0.02, 0);
const PAN_T = new Vector3();
const PAN_S = new Vector3();
const V1 = new Vector3();
const V2 = new Vector3();
const V3 = new Vector3();
const OFF = new Vector3();
const OFFL = new Vector3();
const PIVOT = new Vector3();
const QYAW = new Quaternion();
const QPITCH = new Quaternion();
const UP = new Vector3(0, 1, 0);
const WORLD_DIR = new Vector3(0.35, 0.28, 1).normalize();
const NDC = new Vector2();
const RAY = new Raycaster();
const PLANE = new Plane();

const SIZE_SCALE: Record<string, number> = { small: 0.86, medium: 1, large: 1.1, huge: 1.2 };

function smoothstep(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Where the camera auto-travels to watch each formation cinematic —
 * wide enough to frame both the ignition and the constellation seat. */
const CINEMATIC_ZOOM: Record<'system' | 'galaxy', number> = { system: 0.46, galaxy: 0.72 };

/** Focus dolly range: 1 = the standard framing; small = nose to the glass. */
const DOLLY_MAX = 2.6;
const DOLLY_ASCEND = 2.45;
const dollyMin = (kind: FocusTarget['kind']): number => (kind === 'world' ? 0.5 : 0.34);

/**
 * The camera. One continuous ladder from the hero planet out to the cosmic
 * web: scroll travels, and while visiting an object scroll dives INTO it —
 * galaxy → the member system under your cursor → a single remembered world —
 * or back out again. Drag orbits around whatever you're looking at. Focus
 * changes fly a banked arc, small-spaceship style. Formation cinematics
 * borrow the camera; any input takes it back.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const punchNonce = useUiBus((b) => b.punchNonce);
  const punch = useRef({ v: 0, vel: 0 });
  const zoomSmooth = useRef(0);
  const lastNonce = useRef(0);
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const cineOverride = useRef(false);
  const lastCineId = useRef(0);
  const lastBand = useRef(0);
  /** Visit hold: eased camera pose + blend weight off the journey rail. */
  const focusPose = useRef({ cam: new Vector3(), look: new Vector3(), b: 0 });
  const focusKey = useRef('journey');
  /** Wheel dolly while visiting (multiplies the framing distance). */
  const dolly = useRef({ v: 1, t: 1, preset: false });
  const ladderCooldownUntil = useRef(0);
  const cursorPx = useRef({ x: 0, y: 0 });
  /** R3F clock time as of the last frame — for event-handler anchor math. */
  const clockNow = useRef(0);
  /** A focus-to-focus (or journey-to-focus) flight in progress. */
  const flight = useRef({
    active: false,
    s: 0,
    dur: 1,
    bank: 0,
    from: new Vector3(),
    fromLook: new Vector3(),
    ctrl: new Vector3(),
  });
  const roll = useRef(0);

  useEffect(() => {
    if (punchNonce !== lastNonce.current) {
      lastNonce.current = punchNonce;
      punch.current.vel -= 2.4; // dolly impulse toward the planet
    }
  }, [punchNonce]);

  // ————— Ladder helpers (wheel-through-the-scales) —————

  /** Project a world-space point to CSS pixels; Infinity when behind us. */
  const projectPx = (p: Vector3): { x: number; y: number; behind: boolean } => {
    V3.copy(p).project(camera);
    return {
      x: ((V3.x + 1) / 2) * window.innerWidth,
      y: ((1 - V3.y) / 2) * window.innerHeight,
      behind: V3.z > 1,
    };
  };

  /** The member system of a focused galaxy nearest the cursor (or center). */
  const pickMemberSystem = (galaxyIndex: number, cx: number, cy: number): number => {
    const st = useGame.getState().s;
    const gSeed = galaxySeed(galaxyIndex, st.seed);
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < C.SYSTEMS_PER_GALAXY; k++) {
      V1.copy(memberSeatLocal(k, gSeed))
        .applyEuler(GALAXY_TILT)
        .add(galaxyPosition(galaxyIndex, st.seed));
      const p = projectPx(V1);
      if (p.behind) continue;
      const dd = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = k;
      }
    }
    return galaxyIndex * C.SYSTEMS_PER_GALAXY + best;
  };

  /** A focused world's live position (registry preferred, analytic fallback). */
  const worldAnchor = (idx: number, clockT: number): Vector3 => {
    const reg = worldAnchors.get(idx);
    if (reg && reg.lengthSq() > 0) return reg; // written by FocusedSystem
    const st = useGame.getState().s;
    const t = universeMotion.reduced ? 0 : clockT;
    return visitWorldAnchor(idx, st.seed, st.run.galaxies, t, V1);
  };

  /** The world of a focused system nearest the cursor (or center). */
  const pickWorld = (systemIndex: number, cx: number, cy: number): number => {
    const st = useGame.getState().s;
    const start = systemIndex * C.PLANETS_PER_SYSTEM;
    const count = Math.min(C.PLANETS_PER_SYSTEM, st.run.completedPlanets.length - start);
    let best = start;
    let bestD = Infinity;
    for (let k = 0; k < count; k++) {
      const idx = start + k;
      const anchor = worldAnchor(idx, clockNow.current);
      const p = projectPx(anchor);
      if (p.behind) continue;
      const dd = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = idx;
      }
    }
    return best;
  };

  /** Dive one rung toward whatever sits under (cx, cy). */
  const descend = (cx: number, cy: number): void => {
    const f = useUiBus.getState().focus;
    if (!f) return;
    if (f.kind === 'galaxy') {
      focusOn({ kind: 'system', index: pickMemberSystem(f.index, cx, cy) });
    } else if (f.kind === 'system') {
      const st = useGame.getState().s;
      if (st.run.completedPlanets.length > f.index * C.PLANETS_PER_SYSTEM) {
        focusOn({ kind: 'world', index: pickWorld(f.index, cx, cy) });
      }
    }
  };

  useEffect(() => {
    const overUi = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest('.dock, .modal, .modal-veil, .zoom-rail, .uni-caption-wrap');

    const userInput = () => {
      // Any deliberate camera input reclaims it from a cinematic.
      cineOverride.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (overUi(e.target)) return;
      // Trackpad pinch arrives as ctrl+wheel; keep it from zooming the page.
      if (e.ctrlKey) e.preventDefault();
      userInput();
      cursorPx.current.x = e.clientX;
      cursorPx.current.y = e.clientY;
      const bus = useUiBus.getState();

      if (bus.focus) {
        // Visiting: the wheel dives into the object or climbs back out.
        const dl = dolly.current;
        const factor = e.ctrlKey ? 0.0036 : 0.00115;
        dl.t = clamp(dl.t * Math.exp(e.deltaY * factor), dollyMin(bus.focus.kind), DOLLY_MAX);
        const now = performance.now();
        if (now < ladderCooldownUntil.current) return;
        if (dl.t >= DOLLY_ASCEND) {
          ladderCooldownUntil.current = now + 420;
          const wasGalaxy = bus.focus.kind === 'galaxy';
          stepFocusOut();
          // Arrive at the parent already pulled back a little, mid-climb.
          const stillFocused = useUiBus.getState().focus !== null;
          dl.t = dl.v = stillFocused ? 1.4 : 1;
          dl.preset = true;
          if (!stillFocused) {
            // Hand the climb to the journey at the matching scale band, so
            // the next wheel notch keeps rising instead of teleporting.
            useUiBus.getState().setZoom(wasGalaxy ? BAND_STOPS[3] : BAND_STOPS[2]);
          }
        } else if (dl.t <= dollyMin(bus.focus.kind) + 0.005 && bus.focus.kind !== 'world') {
          ladderCooldownUntil.current = now + 420;
          descend(e.clientX, e.clientY);
          dl.t = dl.v = 1;
          dl.preset = true;
        }
        return;
      }

      // The open journey: scroll travels, and zooming-in leans toward the
      // point under the cursor so you steer WHERE you are diving.
      const factor = e.ctrlKey ? 0.0032 : 0.0009;
      const prev = bus.zoom;
      bus.setZoom(prev + e.deltaY * factor);
      const z = useUiBus.getState().zoom;
      if (z >= prev) {
        // Zooming out relaxes the lean back toward the rail's composition.
        PAN_T.multiplyScalar(Math.max(0, 1 - (z - prev) * 7));
        return;
      }
      NDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      RAY.setFromCamera(NDC, camera);
      camera.getWorldDirection(V1);
      PLANE.setFromNormalAndCoplanarPoint(V1, LOOK_LAST);
      if (RAY.ray.intersectPlane(PLANE, V2)) {
        const pull = Math.min(0.55, (prev - z) * 9);
        V2.sub(LOOK_LAST);
        V2.y *= 0.55; // mostly steer sideways; the rail owns altitude
        PAN_T.addScaledVector(V2, pull);
        const maxPan = z * 20;
        if (PAN_T.length() > maxPan) PAN_T.setLength(maxPan);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest?.('input, textarea, select, [contenteditable]')) return;
      const focus = useUiBus.getState().focus;
      if (e.key === 'Escape') {
        if (focus) stepFocusOut();
        else if (orbitEngaged()) resetOrbit();
        return;
      }
      if (!focus) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        userInput();
        hopSibling(e.key === 'ArrowLeft' ? -1 : 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepFocusOut();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        descend(window.innerWidth / 2, window.innerHeight / 2);
      }
    };

    // Pointer input: one finger / left button drags to orbit; two fingers
    // pinch to travel; taps and stationary clicks stay clicks.
    const touches = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    const drag = { possible: false, id: -1, x: 0, y: 0, moved: 0 };
    const endDrag = () => {
      if (navLive.dragging) {
        navLive.dragging = false;
        navLive.lastDragEndAt = performance.now();
        document.body.style.cursor = '';
      }
      drag.possible = false;
      drag.id = -1;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (overUi(e.target)) return;
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          endDrag(); // a second finger turns the gesture into a pinch
          return;
        }
        if (touches.size > 2) return;
      } else if (e.button !== 0) {
        return;
      }
      drag.possible = true;
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const t = touches.get(e.pointerId);
        if (t) {
          t.x = e.clientX;
          t.y = e.clientY;
          if (touches.size === 2) {
            const [a, b] = [...touches.values()];
            const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            if (pinchDist > 0) {
              const bus = useUiBus.getState();
              if (bus.focus) {
                const dl = dolly.current;
                dl.t = clamp(
                  dl.t * Math.exp((pinchDist - d) * 0.004),
                  dollyMin(bus.focus.kind),
                  DOLLY_MAX,
                );
              } else {
                bus.setZoom(bus.zoom - (d - pinchDist) * 0.0028);
              }
              userInput();
            }
            pinchDist = d;
            return;
          }
        }
      } else if (!navLive.dragging) {
        // Mouse parallax: a little head movement, more the deeper you are.
        pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      }

      if (drag.possible && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!navLive.dragging) {
          drag.moved += Math.abs(dx) + Math.abs(dy);
          if (drag.moved > 7) {
            navLive.dragging = true;
            document.body.style.cursor = 'grabbing';
          }
        }
        if (navLive.dragging) {
          nudgeOrbit(dx, dy);
          userInput();
        }
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinchDist = 0;
      if (e.pointerId === drag.id) endDrag();
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('keydown', onKey);
    };
  }, [camera]);

  // Headless-verification hook: project a focus seat to screen pixels so
  // scripts/shot.mjs can aim real clicks at real objects.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>)['__tcCam'] = {
      screenPos: (kind: 'galaxy' | 'system' | 'world', index: number) => {
        const st = useGame.getState().s;
        const v = focusSeat({ kind, index }, st.seed, st.run.galaxies).project(camera);
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, z: v.z };
      },
      orbit: (yaw: number, pitch: number) => {
        navLive.tYaw = yaw;
        navLive.tPitch = pitch;
      },
      dolly: (t: number) => {
        dolly.current.t = t;
      },
    };
  }, [camera, size]);

  /** Framing for the current visit, dolly applied; FCAM/FLOOK out-params. */
  const computeFocusPose = (focus: FocusTarget, wide: boolean, clockT: number): void => {
    const st = useGame.getState().s;
    if (focus.kind === 'world') {
      const rec = st.run.completedPlanets[focus.index];
      const anchor = worldAnchor(focus.index, clockT);
      const sizeK = rec ? MINI_SIZE[rec.size] * 0.85 : 0.14;
      const dist = Math.max(0.42, sizeK * 7.2) * dolly.current.v;
      FCAM.copy(anchor).addScaledVector(WORLD_DIR, dist);
      FLOOK.copy(anchor);
      if (!wide) FLOOK.y -= dist * 0.1;
      return;
    }
    focusFraming(focus, st.seed, st.run.galaxies, wide, FCAM, FLOOK);
    FCAM.sub(FLOOK).multiplyScalar(dolly.current.v).add(FLOOK);
  };

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    const t = state.clock.elapsedTime;
    const bus = useUiBus.getState();

    // Punch spring.
    const p = punch.current;
    p.vel += (-p.v * 90 - p.vel * 12) * d;
    p.v += p.vel * d;

    // A fresh cinematic claims the camera until the player objects.
    // (Under prefers-reduced-motion the ceremonies play, the camera stays.)
    const cine = bus.activeCinematic;
    if (cine && cine.id !== lastCineId.current) {
      lastCineId.current = cine.id;
      cineOverride.current = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    const zTarget =
      cine && cineOverride.current && !bus.focus ? CINEMATIC_ZOOM[cine.kind] : bus.zoom;

    zoomSmooth.current += (zTarget - zoomSmooth.current) * (1 - Math.exp(-d * (cine ? 2.2 : 4)));
    const z = zoomSmooth.current;
    zoomLive.v = z;
    const band = bandAt(z);
    if (band !== lastBand.current) {
      audio.zoomWhoosh(band > lastBand.current ? 1 : -1, band);
      lastBand.current = band;
    }
    zoomLive.band = band;

    // Parallax eases toward the pointer; its reach grows with depth.
    const pt = pointer.current;
    const pk = 1 - Math.exp(-d * 3);
    pt.sx += (pt.x - pt.sx) * pk;
    pt.sy += (pt.y - pt.sy) * pk;
    const reach = 0.12 + z * 2.4;

    const wide = size.width > 900;
    sampleJourney(z, wide, CAM, LOOK);

    clockNow.current = t;

    // Cursor lean: the zoom-toward-the-thing-you-point-at offset.
    const focus = bus.focus;
    if (focus || z < 0.05 || (cine && cineOverride.current)) {
      PAN_T.multiplyScalar(Math.exp(-d * 3));
    }
    PAN_S.lerp(PAN_T, 1 - Math.exp(-d * 5));
    CAM.add(PAN_S);
    LOOK.add(PAN_S);

    // Dolly chase.
    const dl = dolly.current;
    dl.v += (dl.t - dl.v) * (1 - Math.exp(-d * 6));

    // Visit framing (recomputed every frame — worlds keep orbiting).
    const fp = focusPose.current;
    if (focus) computeFocusPose(focus, wide, t);

    // Focus transitions become flights: a banked arc, spaceship-style.
    const key = focus ? `${focus.kind}:${focus.index}` : 'journey';
    if (key !== focusKey.current) {
      focusKey.current = key;
      if (!dl.preset) {
        dl.t = dl.v = 1;
      }
      dl.preset = false;
      if (focus) {
        const fl = flight.current;
        const fS0 = smoothstep(fp.b);
        FROMC.copy(CAM).lerp(fp.cam, fS0);
        FROML.copy(LOOK).lerp(fp.look, fS0);
        const dist = FROMC.distanceTo(FCAM);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        fl.active = true;
        fl.s = 0;
        fl.dur = reduced ? 0.32 : clamp(0.55 + dist * 0.05, 0.65, 2.0);
        fl.from.copy(FROMC);
        fl.fromLook.copy(FROML);
        // Arc control point: over the top, with a sideways lean for banking.
        const altSign = focus.index % 2 === 0 ? 1 : -1;
        V1.copy(FCAM).sub(FROMC);
        V2.copy(V1).cross(UP).normalize();
        if (V2.lengthSq() < 0.5) V2.set(1, 0, 0);
        fl.ctrl
          .copy(FROMC)
          .addScaledVector(V1, 0.5)
          .addScaledVector(UP, reduced ? 0 : Math.min(3.6, 0.4 + dist * 0.14))
          .addScaledVector(V2, reduced ? 0 : dist * 0.1 * altSign);
        fl.bank = reduced ? 0 : clamp(0.04 + dist * 0.012, 0.05, 0.15) * -altSign;
      }
      // Leaving focus for the journey keeps the old ease-back (fp.b decays).
    }

    const fl = flight.current;
    let rollTarget = 0;
    if (fl.active && focus) {
      fl.s += d / fl.dur;
      const e = easeInOutCubic(clamp(fl.s, 0, 1));
      const inv = 1 - e;
      // Quadratic bezier toward the (possibly moving) framing.
      CAM.set(
        inv * inv * fl.from.x + 2 * inv * e * fl.ctrl.x + e * e * FCAM.x,
        inv * inv * fl.from.y + 2 * inv * e * fl.ctrl.y + e * e * FCAM.y,
        inv * inv * fl.from.z + 2 * inv * e * fl.ctrl.z + e * e * FCAM.z,
      );
      LOOK.copy(fl.fromLook).lerp(FLOOK, smoothstep(e));
      rollTarget = fl.bank * Math.sin(Math.PI * e);
      fp.cam.copy(CAM);
      fp.look.copy(LOOK);
      fp.b = 1;
      if (fl.s >= 1) fl.active = false;
      navLive.flying = fl.active;
    } else {
      navLive.flying = false;
      if (fl.active) fl.active = false;
      // Visit hold: ease onto the framing; released, ease back to the rail.
      if (focus) {
        if (fp.b <= 0.001) {
          fp.cam.copy(CAM); // depart from wherever the journey had us
          fp.look.copy(LOOK);
        }
        const fk = 1 - Math.exp(-d * 3.2);
        fp.cam.lerp(FCAM, fk);
        fp.look.lerp(FLOOK, fk);
      }
      fp.b += ((focus ? 1 : 0) - fp.b) * (1 - Math.exp(-d * (focus ? 2.8 : 3.1)));
      const fS = smoothstep(fp.b);
      if (fS > 0.0001) {
        CAM.lerp(fp.cam, fS);
        LOOK.lerp(fp.look, fS);
      }
    }
    roll.current += (rollTarget - roll.current) * (1 - Math.exp(-d * 5));
    const fS = smoothstep(fp.b);

    // Orbit: drag has handed us yaw/pitch around the current subject. On the
    // hero shot the subject is the PLANET (origin), not the composed look
    // point — otherwise dragging swings the world across the frame. Both the
    // camera and the look point rotate about the pivot, so the composition
    // rides along instead of sliding.
    navLive.yaw += (navLive.tYaw - navLive.yaw) * (1 - Math.exp(-d * 8));
    navLive.pitch += (navLive.tPitch - navLive.pitch) * (1 - Math.exp(-d * 8));
    if (Math.abs(navLive.yaw) > 1e-4 || Math.abs(navLive.pitch) > 1e-4) {
      const pivotK = focus ? 1 : smoothstep(Math.min(1, z / 0.22));
      PIVOT.copy(LOOK).multiplyScalar(pivotK); // origin → look-point blend
      OFF.copy(CAM).sub(PIVOT);
      OFFL.copy(LOOK).sub(PIVOT);
      QYAW.setFromAxisAngle(UP, navLive.yaw);
      OFF.applyQuaternion(QYAW);
      OFFL.applyQuaternion(QYAW);
      V1.copy(OFFL).sub(OFF).normalize(); // view forward after yaw
      V2.copy(V1).cross(UP);
      if (V2.lengthSq() > 1e-6) {
        // Negative: dragging down pulls the scene down, so the camera rises.
        QPITCH.setFromAxisAngle(V2.normalize(), -navLive.pitch);
        OFF.applyQuaternion(QPITCH);
        OFFL.applyQuaternion(QPITCH);
      }
      CAM.copy(PIVOT).add(OFF);
      LOOK.copy(PIVOT).add(OFFL);
    }

    LOOK_LAST.copy(LOOK);

    // A visiting camera holds steadier: breathing shrinks, parallax tightens.
    const calm = 1 - fS * 0.82;
    const reachF = reach * calm + 0.3 * fS;

    camera.position.set(
      CAM.x + Math.sin(t * 0.05) * (0.09 + z * 0.5) * calm + pt.sx * reachF,
      CAM.y + Math.sin(t * 0.083) * (0.06 + z * 0.35) * calm - pt.sy * reachF * 0.6,
      CAM.z + Math.sin(t * 0.031) * 0.1 * calm + p.v * 0.05 * (1 - z) * (1 - fS),
    );
    camera.lookAt(LOOK.x, LOOK.y, LOOK.z);
    if (Math.abs(roll.current) > 1e-4) camera.rotateZ(roll.current);

    // Publish the hero planet's screen placement for the diegetic gauges.
    camera.updateMatrixWorld();
    const st = useGame.getState().s;
    V1.set(0, 0, 0).project(camera);
    const behind = V1.z > 1;
    const hx = ((V1.x + 1) / 2) * size.width;
    const hy = ((1 - V1.y) / 2) * size.height;
    const zz = clamp((z - 0.5) / 0.5, 0, 1);
    const vortex = 1 - zz * zz * (3 - 2 * zz) * 0.7;
    const rWorld = 1.34 * (SIZE_SCALE[st.planet.size] ?? 1) * vortex;
    V2.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(rWorld).project(camera);
    const ex = ((V2.x + 1) / 2) * size.width;
    const ey = ((1 - V2.y) / 2) * size.height;
    heroScreen.x = hx;
    heroScreen.y = hy;
    heroScreen.r = Math.hypot(ex - hx, ey - hy);
    const fade = clamp(1 - (z - 0.05) / 0.12, 0, 1);
    const flightHide = fl.active ? clamp(1 - fl.s * 2.5, 0, 1) : 1;
    heroScreen.o = behind ? 0 : fade * (1 - fS) * flightHide;
  });

  return null;
}
