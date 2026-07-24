import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three/webgpu';
import { useUiBus, zoomLive } from '../fx/uiBus';
import { useGame } from '../../state/store';
import { bandAt, focusFraming, focusSeat, sampleJourney } from './universeLayout';
import { exitFocus, stepFocusOut } from './universe/shared';
import * as audio from '../audio/audio';

const CAM = new Vector3();
const LOOK = new Vector3();
const FCAM = new Vector3();
const FLOOK = new Vector3();

function smoothstep(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}

/** Where the camera auto-travels to watch each formation cinematic —
 * wide enough to frame both the ignition and the constellation seat. */
const CINEMATIC_ZOOM: Record<'system' | 'galaxy', number> = { system: 0.46, galaxy: 0.72 };

/**
 * The perspective journey: HERO shot at z=0 (slow drift, breathing dolly,
 * click punch), then scroll/pinch pulls back through four scale bands —
 * system → constellation → galaxies → the cosmic web. A hand-held Total
 * Perspective Vortex. Formation cinematics borrow the camera; any input
 * takes it back.
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
  /** Visit flight: eased camera pose + blend weight off the journey rail. */
  const focusPose = useRef({ cam: new Vector3(), look: new Vector3(), b: 0 });

  useEffect(() => {
    if (punchNonce !== lastNonce.current) {
      lastNonce.current = punchNonce;
      punch.current.vel -= 2.4; // dolly impulse toward the planet
    }
  }, [punchNonce]);

  useEffect(() => {
    const overUi = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest('.dock, .modal, .modal-veil, .zoom-rail');

    const userInput = () => {
      // Any deliberate zoom input reclaims the camera from a cinematic.
      cineOverride.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (overUi(e.target)) return;
      // Trackpad pinch arrives as ctrl+wheel; keep it from zooming the page.
      if (e.ctrlKey) e.preventDefault();
      const bus = useUiBus.getState();
      // Scroll is the journey's input: the first notch releases any visit.
      if (bus.focus) {
        exitFocus();
        userInput();
        return;
      }
      const factor = e.ctrlKey ? 0.0032 : 0.0009;
      bus.setZoom(bus.zoom + e.deltaY * factor);
      userInput();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && el.closest?.('input, textarea, select, [contenteditable]')) return;
      // Step back out: system → its galaxy → the open journey.
      stepFocusOut();
    };

    // Touch: pinch to travel. Tracked with pointer events so a lone tap
    // still clicks the planet; two fingers become a zoom gesture.
    const touches = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || overUi(e.target)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const t = touches.get(e.pointerId);
        if (!t) return;
        t.x = e.clientX;
        t.y = e.clientY;
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          if (pinchDist > 0) {
            const bus = useUiBus.getState();
            if (bus.focus) {
              exitFocus(); // pinch reclaims the journey, like scroll
            } else {
              bus.setZoom(bus.zoom - (d - pinchDist) * 0.0028);
            }
            userInput();
          }
          pinchDist = d;
        }
      } else {
        // Mouse parallax: a little head movement, more the deeper you are.
        pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      }
    };
    const onPointerEnd = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinchDist = 0;
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
  }, []);

  // Headless-verification hook: project a focus seat to screen pixels so
  // scripts/shot.mjs can aim real clicks at real objects.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>)['__tcCam'] = {
      screenPos: (kind: 'galaxy' | 'system', index: number) => {
        const st = useGame.getState().s;
        const v = focusSeat({ kind, index }, st.seed, st.run.galaxies).project(camera);
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, z: v.z };
      },
    };
  }, [camera, size]);

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

    // Visit flight: a click on a galaxy or system eases the camera off the
    // journey rail and parks it at the object; releasing eases it back.
    const fp = focusPose.current;
    const focus = bus.focus;
    if (focus) {
      const st = useGame.getState().s;
      focusFraming(focus, st.seed, st.run.galaxies, wide, FCAM, FLOOK);
      if (fp.b <= 0.001) {
        fp.cam.copy(CAM); // depart from wherever the journey had us
        fp.look.copy(LOOK);
      }
      const fk = 1 - Math.exp(-d * 2.6);
      fp.cam.lerp(FCAM, fk);
      fp.look.lerp(FLOOK, fk);
    }
    fp.b += ((focus ? 1 : 0) - fp.b) * (1 - Math.exp(-d * (focus ? 2.4 : 3.1)));
    const fS = smoothstep(fp.b);
    if (fS > 0.0001) {
      CAM.lerp(fp.cam, fS);
      LOOK.lerp(fp.look, fS);
    }

    // A visiting camera holds steadier: breathing shrinks, parallax tightens.
    const calm = 1 - fS * 0.82;
    const reachF = reach * calm + 0.3 * fS;

    camera.position.set(
      CAM.x + Math.sin(t * 0.05) * (0.09 + z * 0.5) * calm + pt.sx * reachF,
      CAM.y + Math.sin(t * 0.083) * (0.06 + z * 0.35) * calm - pt.sy * reachF * 0.6,
      CAM.z + Math.sin(t * 0.031) * 0.1 * calm + p.v * 0.05 * (1 - z) * (1 - fS),
    );
    camera.lookAt(LOOK.x, LOOK.y, LOOK.z);
  });

  return null;
}
