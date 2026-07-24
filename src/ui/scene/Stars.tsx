import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, MeshBasicNodeMaterial, PointsMaterial, SpriteMaterial } from 'three/webgpu';
import { mix, mx_fractal_noise_float, normalLocal, smoothstep, vec3 } from 'three/tsl';
import { mulberry } from '../../engine/rng';
import { useGame } from '../../state/store';
import { zoomLive } from '../fx/uiBus';

function starPoints(seed: number, count: number, rMin: number, rMax: number): BufferGeometry {
  const rand = mulberry(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = rMin + rand() * (rMax - rMin);
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = s * Math.cos(phi) * r;
    positions[i * 3 + 1] = u * r;
    positions[i * 3 + 2] = s * Math.sin(phi) * r;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  return geo;
}

/** Starfield + a seeded nebula dome. The nebula regenerates per galaxy. */
export function Stars({ count }: { count: number }) {
  const galaxySeed = useGame((g) => g.s.seed + g.s.run.galaxies * 101);

  const far = useMemo(() => starPoints(galaxySeed ^ 0xaaaa, count, 55, 95), [galaxySeed, count]);
  const near = useMemo(
    () => starPoints(galaxySeed ^ 0xbbbb, Math.floor(count / 4), 30, 55),
    [galaxySeed, count],
  );
  // The shell beyond your galaxies — company for the cosmic web band.
  const deep = useMemo(
    () => starPoints(galaxySeed ^ 0xcccc, Math.floor(count / 2), 150, 290),
    [galaxySeed, count],
  );

  const nebulaMat = useMemo(() => {
    const r = mulberry(galaxySeed ^ 0xcafe);
    // Deep-space restraint: cool hues only, whisper-level luminance.
    const hue1 = 0.55 + r() * 0.22; // teal → violet
    const hue2 = (hue1 + 0.08 + r() * 0.1) % 1;
    const c1 = new Color().setHSL(hue1, 0.45, 0.055);
    const c2 = new Color().setHSL(hue2, 0.5, 0.045);
    const m = new MeshBasicNodeMaterial();
    const n = mx_fractal_noise_float(normalLocal.mul(2.1 + r() * 1.2), 4, 2.2, 0.55, 1)
      .mul(0.5)
      .add(0.5);
    const n2 = mx_fractal_noise_float(normalLocal.mul(4.6).add(vec3(7.7, 1.3, 4.2)), 3, 2.0, 0.5, 1)
      .mul(0.5)
      .add(0.5);
    const base = mix(vec3(0.008, 0.009, 0.02), vec3(c1.r, c1.g, c1.b), smoothstep(0.55, 0.95, n));
    m.colorNode = mix(base, vec3(c2.r, c2.g, c2.b), smoothstep(0.68, 0.98, n2).mul(0.55));
    m.side = 1; // BackSide
    m.depthWrite = false;
    return m;
  }, [galaxySeed]);

  const sunTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const g = canvas.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,252,240,1)');
    grad.addColorStop(0.18, 'rgba(255,238,200,0.9)');
    grad.addColorStop(0.45, 'rgba(255,196,120,0.28)');
    grad.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new CanvasTexture(canvas);
  }, []);

  const sunSprite = useMemo(
    () =>
      new SpriteMaterial({
        map: sunTexture,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    [sunTexture],
  );

  const nearMat = useMemo(
    () => new PointsMaterial({ size: 1.0, sizeAttenuation: true, color: 0xf2f4fa, transparent: true, opacity: 0.9, depthWrite: false }),
    [],
  );

  // Local landmarks bow out on the way to the deep bands: the sun sprite is
  // a neighbor, not a feature of the cosmic web.
  useFrame(() => {
    const z = zoomLive.v;
    sunSprite.opacity = Math.max(0, 1 - (z - 0.3) / 0.3);
    nearMat.opacity = 0.9 * Math.max(0.25, 1 - (z - 0.5) / 0.4);
  });

  return (
    <group>
      <mesh raycast={() => null}>
        <icosahedronGeometry args={[320, 2]} />
        <primitive object={nebulaMat} attach="material" />
      </mesh>
      <points geometry={far} raycast={() => null}>
        <pointsMaterial size={0.5} sizeAttenuation color={0xdde4f2} transparent opacity={0.75} depthWrite={false} />
      </points>
      <points geometry={near} material={nearMat} raycast={() => null} />
      <points geometry={deep} raycast={() => null}>
        <pointsMaterial size={1.4} sizeAttenuation color={0xd0daf0} transparent opacity={0.65} depthWrite={false} />
      </points>
      <sprite position={[46, 20, 28]} scale={[16, 16, 1]} raycast={() => null}>
        <primitive object={sunSprite} attach="material" />
      </sprite>
    </group>
  );
}
