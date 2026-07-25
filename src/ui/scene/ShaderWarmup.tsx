/**
 * Pipeline warm-up.
 *
 * three builds a render pipeline the first time an object is actually drawn,
 * synchronously, inside the render pass. Profiling flight in a 409-world
 * universe put 6.8% of all frame time in `createRenderPipeline` →
 * `getProgramParameter`, arriving as ~400ms hitches exactly when something
 * new came into view — a system revealing its worlds, a zoom band fading in
 * a hundred glyphs.
 *
 * `compileAsync` builds those pipelines off the critical path, and this runs
 * it whenever the scene gains a batch of objects that were not there before
 * (boot, taking the helm, a near-system reveal, the universe growing).
 *
 * Measured honestly: this did NOT remove the remaining first-visit cost of
 * sweeping across a 409-world universe at boost — three compiles only what is
 * visible, and most of what hitches later is hidden at warm-up time (bodies
 * out of sensor range, faded glyphs, worlds in an unrevealed system). Forcing
 * everything visible for a synchronous compile pass was tried and measured no
 * better, so it was removed rather than kept as unproven complexity. Every
 * repeat pass over the same scenery is a locked 60fps; the cost amortises.
 *
 * It is an optimisation and always safe to skip — every failure path here is
 * a silent return.
 */
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useUiBus } from '../fx/uiBus';
import { useGame } from '../../state/store';

interface CompilableRenderer {
  compileAsync?: (scene: object, camera: object) => Promise<unknown>;
  compile?: (scene: object, camera: object) => unknown;
}

export function ShaderWarmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  // Re-warm when the population of the scene meaningfully changes.
  const flight = useUiBus((b) => b.flightMode);
  const nearSystem = useUiBus((b) => b.flightNearSystem);
  const focus = useUiBus((b) => b.focus);
  const systems = useGame((g) => g.s.run.systems);
  const galaxies = useGame((g) => g.s.run.galaxies);
  const worlds = useGame((g) => g.s.run.completedPlanets.length);

  const pending = useRef(0);

  useEffect(() => {
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>)['__tcRenderer'] = gl;
      // Scene and camera alongside the renderer, so scripts/scene-budget.mjs
      // can count distinct material graphs. That count is the one that matters
      // here: this scene is node-material based, so each distinct graph
      // compiles its own pipeline, and `info.programs` is a WebGL-only field
      // that reads -1 on the WebGPU backend players actually run.
      (window as unknown as Record<string, unknown>)['__tcScene'] = { scene, camera };
    }
  }, [gl, scene, camera]);

  useEffect(() => {
    // A short delay lets React finish mounting whatever triggered this, so
    // the pass sees the new objects rather than the ones it replaced.
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      const r = gl as unknown as CompilableRenderer;
      try {
        if (typeof r.compileAsync === 'function') void r.compileAsync(scene, camera);
        else r.compile?.(scene, camera);
      } catch {
        /* warm-up never breaks the scene */
      }
    }, 350);
    return () => window.clearTimeout(pending.current);
  }, [gl, scene, camera, flight, nearSystem, focus, systems, galaxies, worlds]);

  return null;
}
