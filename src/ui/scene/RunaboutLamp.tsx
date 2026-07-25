/**
 * The runabout's landing lights.
 *
 * The scene is lit for the hero planet — one sun, at the origin, aimed at the
 * thing you are terraforming. Fly forty units out to a derelict and there is
 * nothing to light it by, which is correct for space and useless for looking
 * at things. So the ship carries its own lamp: a short-range point light that
 * rides the camera and only ever reaches what you have actually flown up to.
 *
 * It exists only at the helm. The map view keeps the sun it always had.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PointLight } from 'three/webgpu';
import { useUiBus } from '../fx/uiBus';
import { flightLive } from './flightControl';

/**
 * Reach of the lamp. Past this, things stay honestly dark. The soft decay is
 * deliberately shallower than physical falloff — a real inverse-square lamp
 * blows out the hull you have parked against and leaves everything past ten
 * units invisible, which is accurate and no use to anybody.
 */
const LAMP_DISTANCE = 34;
const LAMP_INTENSITY = 14;
const LAMP_DECAY = 1.4;

/**
 * The lamp is ALWAYS in the scene and merely dims to nothing outside flight.
 *
 * Mounting and unmounting it on the flight toggle changes the scene's light
 * configuration, which invalidates every material in the scene and forces a
 * full shader rebuild — measured as a 200ms hitch on the first second at the
 * helm, plus smaller ones as each material recompiled. An unused light at
 * zero intensity costs a few instructions per pixel and no hitches at all.
 */
export function RunaboutLamp() {
  const flight = useUiBus((b) => b.flightMode);
  const lamp = useRef<PointLight>(null);

  useFrame(({ camera }, dt) => {
    const l = lamp.current;
    if (!l) return;
    // Slightly ahead and below the eye, so approaching hulls get a raking
    // light and read as shape rather than a flat disc.
    l.position.copy(camera.position);
    l.position.y -= 0.35;
    // Fade the lamp out against a surface. Falloff is a power of distance, so
    // at a tenth of a unit off a planet this thing delivers a couple of
    // hundred times its nominal illuminance and the terrain washes out to
    // white — which looked exactly like a shader bug and was not one. Close
    // in, the sun is doing the work anyway; the lamp is for the void, where
    // derelicts have nothing else to light them.
    const surfaceFade = Math.max(0, Math.min(1, (flightLive.altitude - 0.2) / 1.3));
    // Boost brightens the lamp a touch — the drive spills light either way.
    const target = flight
      ? LAMP_INTENSITY * (1 + flightLive.boostBlend * 0.35) * surfaceFade
      : 0;
    l.intensity += (target - l.intensity) * Math.min(1, dt * 4);
  });

  return (
    <pointLight
      ref={lamp}
      color={0xdce8ff}
      intensity={0}
      distance={LAMP_DISTANCE}
      decay={LAMP_DECAY}
    />
  );
}
