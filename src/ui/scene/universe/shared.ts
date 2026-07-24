/** Shared bits for the universe view: glow sprites, tooltip plumbing. */
import { AdditiveBlending, CanvasTexture, SpriteMaterial } from 'three/webgpu';
import type { ThreeEvent } from '@react-three/fiber';
import { useUiBus } from '../../fx/uiBus';

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

export const TYPE_LABEL: Record<string, string> = {
  terrestrial: 'terrestrial',
  ice: 'ice world',
  desert: 'desert world',
  volcanic: 'volcanic world',
  ocean: 'ocean world',
  gasgiant: 'gas giant',
};
