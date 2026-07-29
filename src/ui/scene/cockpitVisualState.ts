import { useSyncExternalStore } from 'react';
import { useUiBus } from '../fx/uiBus';
import { flightLive } from './flightControl';
import { surfaceLive } from './surface/surfaceControl';

/**
 * Tiny bridge between the WebGPU scene and the DOM canopy.
 *
 * The raster cockpit plates are the loading/low-quality fallback. The R3F
 * cockpit flips this only after its core GLB roots have merged successfully,
 * so a failed or disabled uplift never leaves the pilot with an empty dash.
 */
let cockpitVisualReady = false;
const listeners = new Set<() => void>();

/** One visibility predicate shared by the camera mount and live displays. */
export function cockpitPhysicalVisible(): boolean {
  const state = useUiBus.getState();
  if (state.groundfall !== null) {
    return surfaceLive.phase === 'entry'
      || (surfaceLive.phase === 'fly' && !surfaceLive.chaseView);
  }
  return Boolean(state.flightMode) && flightLive.cameraMode === 'cockpit';
}

export function setCockpitVisualReady(next: boolean): void {
  if (next === cockpitVisualReady) return;
  cockpitVisualReady = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): boolean {
  return cockpitVisualReady;
}

export function useCockpitVisualReady(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
