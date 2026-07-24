/** Shared bits for the universe view: glow sprites, tooltip plumbing, visits. */
import { AdditiveBlending, CanvasTexture, SpriteMaterial } from 'three/webgpu';
import type { ThreeEvent } from '@react-three/fiber';
import { useUiBus, type FocusTarget } from '../../fx/uiBus';
import { useGame } from '../../../state/store';
import { C } from '../../../content/constants';
import { BAND_STOPS } from '../universeLayout';
import { clickSuppressed, navLive } from '../navControl';
import * as audio from '../../audio/audio';
import { sceneTex } from '../spriteTextures';

let glowTex: CanvasTexture | null = null;

/** Soft radial glow, white — tint via material color. Shared, made once. */
export function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(canvas);
  return glowTex;
}

export function makeGlowSprite(color: number, opacity = 1): SpriteMaterial {
  return new SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

/** Sprite material over an authored texture (SPRITE_MANIFEST.md art). */
export function makeTexSprite(
  url: string,
  opts: { color?: number; opacity?: number; additive?: boolean } = {},
): SpriteMaterial {
  const mat = new SpriteMaterial({
    map: sceneTex(url),
    color: opts.color ?? 0xffffff,
    transparent: true,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
  });
  if (opts.additive) mat.blending = AdditiveBlending;
  return mat;
}

/** Pointer handlers that surface a nameplate tooltip in the DOM HUD. */
export function inspectHandlers(title: string, sub: string) {
  const show = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useUiBus.getState().setInspect({
      title,
      sub,
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
    });
  };
  return {
    onPointerOver: show,
    onPointerMove: show,
    onPointerOut: () => useUiBus.getState().setInspect(null),
  };
}

/** inspectHandlers plus a pointer cursor and a click — for visitable things. */
export function visitHandlers(title: string, sub: string, onVisit: () => void) {
  const base = inspectHandlers(title, sub);
  return {
    ...base,
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      base.onPointerOver(e);
      if (!navLive.dragging) document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      base.onPointerOut();
      if (!navLive.dragging) document.body.style.cursor = '';
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (clickSuppressed()) return; // that click was the end of a camera drag
      onVisit();
    },
  };
}

/** True if a formed system has been folded into a galaxy already. */
export function isConsumed(systemIndex: number): boolean {
  return systemIndex < useGame.getState().s.run.galaxies * C.SYSTEMS_PER_GALAXY;
}

/** The parent system index of any focus target (galaxies return -1). */
export function focusSystemIndex(target: FocusTarget): number {
  if (target.kind === 'galaxy') return -1;
  return target.kind === 'world'
    ? Math.floor(target.index / C.PLANETS_PER_SYSTEM)
    : target.index;
}

/**
 * Travel to an object. Also parks the underlying journey at the object's
 * scale band, so releasing the camera later leaves you standing nearby
 * rather than yanked back to wherever you scrolled from.
 */
export function focusOn(target: FocusTarget): void {
  const bus = useUiBus.getState();
  // Clicking a place from the helm hands the camera back and visits it.
  if (bus.flightMode) bus.setFlightMode(false);
  const prev = bus.focus;
  if (prev && prev.kind === target.kind && prev.index === target.index) return;
  const galaxyish =
    target.kind === 'galaxy' || isConsumed(focusSystemIndex(target));
  bus.setZoom(galaxyish ? BAND_STOPS[3] : BAND_STOPS[2]);
  bus.setFocus(target);
  audio.zoomWhoosh(1, target.kind === 'world' ? 1 : galaxyish ? 3 : 2);
}

/** Step one level out: world → its system → its galaxy → the open journey. */
export function stepFocusOut(): void {
  const bus = useUiBus.getState();
  const f = bus.focus;
  if (!f) return;
  if (f.kind === 'world') {
    bus.setFocus({ kind: 'system', index: focusSystemIndex(f) });
    audio.zoomWhoosh(-1, 2);
  } else if (f.kind === 'system' && isConsumed(f.index)) {
    bus.setFocus({ kind: 'galaxy', index: Math.floor(f.index / C.SYSTEMS_PER_GALAXY) });
    audio.zoomWhoosh(-1, 3);
  } else {
    bus.setFocus(null);
    audio.zoomWhoosh(-1, f.kind === 'galaxy' ? 3 : 2);
  }
}

/**
 * Fly to the previous/next sibling: worlds cycle within their system,
 * systems within their galaxy (or the open constellation), galaxies among
 * themselves. The little-spaceship commute, one keypress per stop.
 */
export function hopSibling(dir: 1 | -1): void {
  const f = useUiBus.getState().focus;
  if (!f) return;
  const s = useGame.getState().s;
  const per = C.PLANETS_PER_SYSTEM;
  if (f.kind === 'world') {
    const sys = Math.floor(f.index / per);
    const worlds = Math.min(per, s.run.completedPlanets.length - sys * per);
    if (worlds <= 1) return;
    const slot = (((f.index % per) + dir) % worlds + worlds) % worlds;
    focusOn({ kind: 'world', index: sys * per + slot });
  } else if (f.kind === 'system') {
    const consumed = s.run.galaxies * C.SYSTEMS_PER_GALAXY;
    if (f.index < consumed) {
      const g = Math.floor(f.index / C.SYSTEMS_PER_GALAXY);
      const slot =
        (((f.index % C.SYSTEMS_PER_GALAXY) + dir) % C.SYSTEMS_PER_GALAXY
          + C.SYSTEMS_PER_GALAXY) % C.SYSTEMS_PER_GALAXY;
      focusOn({ kind: 'system', index: g * C.SYSTEMS_PER_GALAXY + slot });
    } else {
      const loose = s.run.systems - consumed;
      if (loose <= 1) return;
      const k = f.index - consumed;
      focusOn({ kind: 'system', index: consumed + (((k + dir) % loose + loose) % loose) });
    }
  } else {
    const n = s.run.galaxies;
    if (n <= 1) return;
    focusOn({ kind: 'galaxy', index: ((f.index + dir) % n + n) % n });
  }
}

/** Release the camera entirely (scroll input, prestige, cinematics). */
export function exitFocus(): void {
  const bus = useUiBus.getState();
  if (!bus.focus) return;
  audio.zoomWhoosh(-1, bus.focus.kind === 'galaxy' ? 3 : 2);
  bus.setFocus(null);
}

export const TYPE_LABEL: Record<string, string> = {
  terrestrial: 'terrestrial',
  ice: 'ice world',
  desert: 'desert world',
  volcanic: 'volcanic world',
  ocean: 'ocean world',
  gasgiant: 'gas giant',
};
