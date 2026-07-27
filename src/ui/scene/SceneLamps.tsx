/**
 * Every point light in the scene, permanently, for the whole session.
 *
 * three bakes the scene's light configuration into the shader it compiles for
 * each material, so mounting or unmounting ONE light changes the cache key of
 * every object at once and each one rebuilds its shader inside the render
 * pass. This scene had four lights that came and went with what was on screen
 * — the visited system's star, the assembling system's star, and two ceremony
 * lights — and the cost was exactly what you would expect: clicking a system
 * to go and look at it froze the main thread for 1.45 seconds while the rest
 * of the universe recompiled around one new lamp.
 *
 * So the lights are permanent and the CONSUMERS come and go. A component that
 * wants a light claims a slot, drives it while it lives, and releases it on
 * unmount; an unclaimed slot idles at zero intensity, which costs a few
 * instructions per pixel and no hitches at all. `RunaboutLamp` is the same
 * trick with its own dedicated light, and predates this by a day.
 *
 * If every slot is taken, a claim returns nothing and that consumer simply
 * gets no light — a slightly darker scene, never a crash. Raise COUNT if a
 * new consumer needs one, and never make a light conditional again.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, PointLight, Vector3 } from 'three/webgpu';

/**
 * Claimants: the assembling star, a visited system's star, one ceremony
 * (cinematics are queued, so never two), the shore party's suit lamp and the
 * nearest seam's glow while groundside — plus one spare.
 */
const COUNT = 6;

interface Slot {
  claimed: boolean;
  position: Vector3;
  color: Color;
  intensity: number;
  distance: number;
}

const slots: Slot[] = Array.from({ length: COUNT }, () => ({
  claimed: false,
  position: new Vector3(),
  color: new Color(0xffffff),
  // Distance stays non-zero even when idle: zero means "no falloff" to three,
  // which is a different lighting path, and this light is meant to be inert.
  intensity: 0,
  distance: 1,
}));

/** Drives one lamp. Values persist until changed — set once or every frame. */
export interface LampHandle {
  set(position: Vector3, color: Color, intensity: number, distance: number): void;
  /** Intensity alone, for lights that pulse through a ceremony. */
  setIntensity(intensity: number): void;
}

/**
 * Claim a lamp for the lifetime of the calling component. Safe to call when
 * the pool is exhausted; the handle just does nothing.
 */
export function useLamp(): LampHandle {
  const slot = useRef(-1);

  useEffect(() => {
    const free = slots.findIndex((s) => !s.claimed);
    if (free < 0) return;
    slots[free]!.claimed = true;
    slot.current = free;
    return () => {
      const s = slots[slot.current];
      if (s) {
        s.claimed = false;
        s.intensity = 0;
      }
      slot.current = -1;
    };
  }, []);

  return useMemo<LampHandle>(
    () => ({
      set(position, color, intensity, distance) {
        const s = slots[slot.current];
        if (!s) return;
        s.position.copy(position);
        s.color.copy(color);
        s.intensity = intensity;
        s.distance = distance;
      },
      setIntensity(intensity) {
        const s = slots[slot.current];
        if (s) s.intensity = intensity;
      },
    }),
    [],
  );
}

/** Mount once, near the top of the scene. */
export function SceneLamps() {
  const lights = useRef<(PointLight | null)[]>([]);

  // A dead lamp looks exactly like a dim scene, so make the pool inspectable
  // alongside the other dev hooks (__tc, __tcBus, __tcCam, __tcFlight).
  useEffect(() => {
    if (!import.meta.env?.DEV || typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>)['__tcLamps'] = () =>
      slots.map((s, i) => ({
        claimed: s.claimed,
        want: s.intensity,
        live: lights.current[i]?.intensity ?? null,
        at: s.position.toArray().map((n) => +n.toFixed(2)),
      }));
  }, []);

  useFrame((_, dt) => {
    for (let i = 0; i < COUNT; i++) {
      const light = lights.current[i];
      const slot = slots[i];
      if (!light || !slot) continue;
      light.position.copy(slot.position);
      light.color.copy(slot.color);
      light.distance = slot.distance;
      // Ease rather than snap: a released slot should fade out, not blink.
      const target = slot.claimed ? slot.intensity : 0;
      light.intensity += (target - light.intensity) * Math.min(1, dt * 9);
    }
  });

  return (
    <>
      {slots.map((_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lights.current[i] = el;
          }}
          intensity={0}
          distance={1}
        />
      ))}
    </>
  );
}
