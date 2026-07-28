import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, MeshBasicNodeMaterial, PointsMaterial, SpriteMaterial, SpriteNodeMaterial, TextureLoader } from 'three/webgpu';
import { acos, atan, clamp, mix, mx_fractal_noise_float, normalLocal, smoothstep, uv, vec2, vec3 } from 'three/tsl';
import { mulberry } from '../../engine/rng';
import { useGame } from '../../state/store';
import { zoomLive } from '../fx/uiBus';
import { SCENE_SPRITES, TEXTURE_ASSETS } from '../assets';
import { sceneTex } from './spriteTextures';
import { upliftActive, upliftNode } from './uplift/upliftAssets';

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
  // Loaded imperatively, NOT via useLoader: suspending inside the Canvas
  // (with our async WebGPU renderer factory) detaches R3F's pointer events
  // from the live canvas — every scene handler, planet clicks included,
  // silently dies. The texture pops in when ready; it's a decorative layer.
  const lensTexture = useMemo(() => new TextureLoader().load(TEXTURE_ASSETS.lensDirt), []);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let col: any = mix(base, vec3(c2.r, c2.g, c2.b), smoothstep(0.68, 0.98, n2).mul(0.55));
    if (upliftActive()) {
      // The authored plate (4.4): equirect star field + nebula wash sampled
      // by direction, under the procedural haze. Placeholders keep the dome
      // procedural-only until the KTX2s land — no rebuild either way.
      const equirect = vec2(
        atan(normalLocal.z, normalLocal.x).div(Math.PI * 2).add(0.5),
        acos(clamp(normalLocal.y, -1, 1)).div(Math.PI),
      );
      const plate = upliftNode('textures/sky/starfield-equirect.ktx2', equirect, { placeholder: 'clear', srgb: true });
      const wash = upliftNode('textures/sky/nebula-wash.ktx2', equirect, { placeholder: 'clear', srgb: true });
      // Whisper weights: the dome's whole personality is restraint, and the
      // first render of the wash at 0.65 measured as a purple flood.
      col = col.add(plate.rgb.mul(0.4)).add(wash.rgb.mul(wash.a).mul(0.16));
    }
    m.colorNode = col;
    m.side = 1; // BackSide
    m.depthWrite = false;
    return m;
  }, [galaxySeed]);

  // The authored corona (SPRITE_MANIFEST.md §F), tinted warm; the painted
  // petal lobes replace the old flat radial gradient.
  const sunSprite = useMemo(
    () =>
      new SpriteMaterial({
        map: sceneTex(SCENE_SPRITES.fx.starCorona),
        color: 0xffe7c2,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    [],
  );

  const lensSprite = useMemo(
    () =>
      new SpriteMaterial({
        map: lensTexture,
        color: 0xffd49b,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.18,
      }),
    [lensTexture],
  );

  // The glare set (4.5): the bloom kernel and the anamorphic streak, cut
  // from the sun-glare sheet by UV window. Invisible until the KTX2 lands.
  const glareSprites = useMemo(() => {
    if (!upliftActive()) return null;
    const windowed = (u0: number, v0: number, u1: number, v1: number) => {
      const m = new SpriteNodeMaterial();
      m.blending = AdditiveBlending;
      m.depthWrite = false;
      m.transparent = true;
      const winUV = vec2(uv().x.mul(u1 - u0).add(u0), uv().y.mul(v1 - v0).add(v0));
      const s = upliftNode('textures/sky/sun-glare.ktx2', winUV, { placeholder: 'clear' });
      m.colorNode = s.rgb.mul(vec3(1.0, 0.93, 0.8));
      m.opacityNode = s.a;
      return m;
    };
    return { bloom: windowed(0.02, 0.02, 0.48, 0.48), streak: windowed(0.5, 0.22, 0.97, 0.28) };
  }, []);

  const nearMat = useMemo(
    () => new PointsMaterial({ size: 1.0, sizeAttenuation: true, color: 0xf2f4fa, transparent: true, opacity: 0.9, depthWrite: false }),
    [],
  );

  // Local landmarks bow out on the way to the deep bands: the sun sprite is
  // a neighbor, not a feature of the cosmic web.
  useFrame(() => {
    const z = zoomLive.v;
    sunSprite.opacity = Math.max(0, 1 - (z - 0.3) / 0.3);
    lensSprite.opacity = 0.18 * Math.max(0, 1 - (z - 0.22) / 0.3);
    nearMat.opacity = 0.9 * Math.max(0.25, 1 - (z - 0.5) / 0.4);
    if (glareSprites) {
      const near = Math.max(0, 1 - (z - 0.3) / 0.3);
      glareSprites.bloom.opacity = near * 0.5;
      glareSprites.streak.opacity = near * 0.3;
    }
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
      <sprite position={[46, 20, 27.9]} scale={[23, 23, 1]} raycast={() => null}>
        <primitive object={lensSprite} attach="material" />
      </sprite>
      {glareSprites && (
        <>
          <sprite position={[46, 20, 27.8]} scale={[34, 34, 1]} raycast={() => null}>
            <primitive object={glareSprites.bloom} attach="material" />
          </sprite>
          <sprite position={[46, 20, 27.7]} scale={[54, 6, 1]} raycast={() => null}>
            <primitive object={glareSprites.streak} attach="material" />
          </sprite>
        </>
      )}
    </group>
  );
}
