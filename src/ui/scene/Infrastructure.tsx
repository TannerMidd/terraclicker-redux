import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sprite, SpriteMaterial, Vector3 } from 'three/webgpu';
import { useGame } from '../../state/store';
import { mulberry } from '../../engine/rng';
import { SCENE_SPRITES } from '../assets';
import { sceneTex } from './spriteTextures';

/** Matches the sun sprite in Stars.tsx — the Stellar Forge works at its limb. */
const SUN_POS = new Vector3(46, 20, 28);

type LaneKind =
  | 'lowOrbit' // probes, seeders — close, quick
  | 'orbit' // stations
  | 'hover' // excavators, just above the surface
  | 'surface' // planet-locked sites
  | 'equator' // temporal compressor rail
  | 'mirrorArc' // one shared inclined ring of mirror petals
  | 'far' // deep thought, distant and slow
  | 'sun' // stellar forge silhouettes at the star
  | 'nightArc' // magrathean scaffolds over the dark side
  | 'wander'; // the Heart of Gold. Wherever it is now.

interface LaneSpec {
  kind: LaneKind;
  scale: number;
  max: number;
  /** Blink/pulse style: 0 none · 1 beacon blink · 2 slow ember · 3 glint */
  pulse?: number;
}

const LANES: Record<string, LaneSpec> = {
  seedProbe: { kind: 'lowOrbit', scale: 0.15, max: 8, pulse: 1 },
  atmoProcessor: { kind: 'surface', scale: 0.17, max: 6 },
  hydroSeeder: { kind: 'lowOrbit', scale: 0.18, max: 6 },
  geoTap: { kind: 'surface', scale: 0.16, max: 6, pulse: 2 },
  bioDome: { kind: 'surface', scale: 0.18, max: 6, pulse: 2 },
  researchLab: { kind: 'orbit', scale: 0.22, max: 5 },
  orbitalMirror: { kind: 'mirrorArc', scale: 0.17, max: 7, pulse: 3 },
  quantumExcavator: { kind: 'hover', scale: 0.19, max: 4 },
  temporalCompressor: { kind: 'equator', scale: 0.21, max: 4 },
  deepThought: { kind: 'far', scale: 0.26, max: 3 },
  stellarForge: { kind: 'sun', scale: 5.2, max: 3 },
  heartOfGold: { kind: 'wander', scale: 0.24, max: 1 },
  magratheanWorkshop: { kind: 'nightArc', scale: 0.32, max: 3 },
  // marvin lives on the moon (Planet.tsx), not in a lane.
};

interface Inst {
  key: string;
  lane: LaneSpec;
  mat: SpriteMaterial;
  radius: number;
  speed: number;
  phase: number;
  tilt: number;
  /** Planet-locked unit direction for surface/nightArc sites. */
  dir: Vector3;
  offset: Vector3;
}

const P = new Vector3();
const NIGHT_DIR = new Vector3(-4.2, -1.8, -2.6).normalize(); // opposite SUN_DIR

function instancesFor(owned: number, max: number): number {
  if (owned <= 0) return 0;
  return Math.min(max, Math.max(1, Math.ceil(2.5 * Math.log10(owned + 1))));
}

/**
 * Diegetic purchases (ART_DIRECTION.md §5, SPRITE_MANIFEST.md §A): every
 * building renders as its own authored sprite in its own lane — probes blink
 * in low orbit, domes glow at surface sites, the mirror array glints along
 * one shared ring, the Heart of Gold is never where you last saw it.
 * Which sprites, how many, and where: all derived from the save.
 */
export function Infrastructure() {
  const countsKey = useGame((g) => {
    const parts: string[] = [];
    for (const [id, lane] of Object.entries(LANES)) {
      const n = instancesFor(g.s.buildings[id] ?? 0, lane.max);
      if (n > 0) parts.push(`${id}:${n}`);
    }
    // Lab texture upgrades at 25 owned; wrecks appear for veteran runs.
    if ((g.s.buildings['researchLab'] ?? 0) >= 25) parts.push('lab2');
    if (g.s.run.systems >= 3) parts.push('wreck');
    return parts.join('|');
  });
  const planetKey = useGame((g) => `${g.s.planet.seed}:${g.s.planet.size}`);
  const reverse = useGame((g) => g.s.planet.quirks.includes('reverse-spin'));

  const insts = useMemo<Inst[]>(() => {
    const { s } = useGame.getState();
    const sizeScale = { small: 0.86, medium: 1, large: 1.1, huge: 1.2 }[s.planet.size];
    const out: Inst[] = [];
    const lab2 = countsKey.includes('lab2');

    for (const [id, lane] of Object.entries(LANES)) {
      const n = instancesFor(s.buildings[id] ?? 0, lane.max);
      for (let i = 0; i < n; i++) {
        const r = mulberry((s.planet.seed ^ (id.length * 0x9e37) ^ (i * 0x51ed)) >>> 0);
        const url =
          id === 'researchLab' && lab2
            ? SCENE_SPRITES.installationLab2
            : SCENE_SPRITES.installation(id);
        const mat = new SpriteMaterial({
          map: sceneTex(url),
          transparent: true,
          depthWrite: false,
        });
        const inst: Inst = {
          key: `${id}-${i}`,
          lane,
          mat,
          radius: 0,
          speed: 0,
          phase: r() * Math.PI * 2,
          tilt: (r() - 0.5) * 1.4,
          dir: new Vector3(),
          offset: new Vector3(),
        };
        switch (lane.kind) {
          case 'lowOrbit':
            inst.radius = (1.38 + r() * 0.35) * sizeScale;
            inst.speed = (0.1 + r() * 0.18) * (r() < 0.25 ? -1 : 1);
            break;
          case 'orbit':
            inst.radius = (1.8 + r() * 0.35) * sizeScale;
            inst.speed = 0.06 + r() * 0.1;
            break;
          case 'hover':
            inst.radius = 1.24 * sizeScale;
            inst.speed = 0.045; // keeps pace with the ground it is excavating
            break;
          case 'surface':
          case 'nightArc': {
            // A fixed site on the sphere, rotating with the planet's spin.
            const lat = (r() - 0.5) * 1.8;
            const lon = r() * Math.PI * 2;
            inst.dir.set(
              Math.cos(lat) * Math.cos(lon),
              Math.sin(lat) * 0.85,
              Math.cos(lat) * Math.sin(lon),
            ).normalize();
            if (lane.kind === 'nightArc') {
              // Scaffolds hug the dark limb: bias sites toward the anti-sun side.
              inst.dir.lerp(NIGHT_DIR, 0.75).normalize();
            }
            inst.radius = (lane.kind === 'nightArc' ? 1.3 : 1.08) * sizeScale;
            break;
          }
          case 'equator':
            inst.radius = 1.55 * sizeScale;
            inst.speed = 0.05;
            inst.tilt = 0;
            break;
          case 'mirrorArc':
            inst.radius = 2.1 * sizeScale;
            inst.speed = 0.05; // the whole ring drifts together
            inst.phase = -0.6 + i * 0.42; // evenly spaced petals along the arc
            break;
          case 'far':
            inst.radius = (2.7 + r() * 0.6) * sizeScale;
            inst.speed = 0.02 + r() * 0.02;
            inst.mat.opacity = 0.85;
            break;
          case 'sun':
            inst.offset.set((r() - 0.5) * 7, (r() - 0.5) * 5, (r() - 0.5) * 3);
            break;
          case 'wander':
            break;
        }
        out.push(inst);
      }
    }

    // A derelict early probe or two, once this run has seen some history.
    if (countsKey.includes('wreck')) {
      const r = mulberry((s.planet.seed ^ 0xdead) >>> 0);
      out.push({
        key: 'wreck-0',
        lane: { kind: 'orbit', scale: 0.14, max: 1 },
        mat: new SpriteMaterial({
          map: sceneTex(SCENE_SPRITES.misc.wreckSatellite),
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
        radius: 2.4 * sizeScale,
        speed: -0.025,
        phase: r() * Math.PI * 2,
        tilt: 0.9,
        dir: new Vector3(),
        offset: new Vector3(),
      });
    }
    return out;
    // planetKey re-seeds sites when the world changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey, planetKey]);

  const refs = useRef<(Sprite | null)[]>([]);
  const hogState = useRef({ bucket: -1, pos: new Vector3(3, 1.5, 1), teapot: false });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const spinSign = reverse ? -1 : 1;
    for (let i = 0; i < insts.length; i++) {
      const sp = refs.current[i];
      const inst = insts[i]!;
      if (!sp) continue;
      const { lane } = inst;
      let scale = lane.scale;

      switch (lane.kind) {
        case 'lowOrbit':
        case 'orbit':
        case 'far': {
          const a = inst.phase + t * inst.speed;
          sp.position.set(
            Math.cos(a) * inst.radius,
            Math.sin(a * 0.7) * inst.tilt,
            Math.sin(a) * inst.radius,
          );
          break;
        }
        case 'hover': {
          const a = inst.phase + t * inst.speed * spinSign;
          sp.position.set(
            Math.cos(a) * inst.radius,
            Math.sin(t * 0.9 + inst.phase) * 0.05 + inst.tilt * 0.2,
            Math.sin(a) * inst.radius,
          );
          break;
        }
        case 'surface':
        case 'nightArc': {
          const a = t * 0.045 * spinSign;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          P.set(
            inst.dir.x * cos - inst.dir.z * sin,
            inst.dir.y,
            inst.dir.x * sin + inst.dir.z * cos,
          ).multiplyScalar(inst.radius);
          sp.position.copy(P);
          break;
        }
        case 'equator': {
          const a = inst.phase + t * inst.speed;
          sp.position.set(Math.cos(a) * inst.radius, 0, Math.sin(a) * inst.radius);
          break;
        }
        case 'mirrorArc': {
          const a = inst.phase + t * inst.speed;
          sp.position.set(
            Math.cos(a) * inst.radius,
            Math.sin(a) * inst.radius * 0.42,
            Math.sin(a) * inst.radius * 0.62,
          );
          break;
        }
        case 'sun': {
          sp.position
            .copy(SUN_POS)
            .add(inst.offset);
          sp.position.y += Math.sin(t * 0.3 + inst.phase) * 0.5;
          break;
        }
        case 'wander': {
          // The Heart of Gold: teleports every 45s; occasionally, briefly, a teapot.
          const hog = hogState.current;
          const bucket = Math.floor(t / 45);
          if (bucket !== hog.bucket) {
            hog.bucket = bucket;
            const r = mulberry((useGame.getState().s.planet.seed ^ bucket) >>> 0);
            hog.pos.set((r() - 0.5) * 14, -2 + r() * 6, (r() - 0.5) * 6);
            if (hog.pos.length() < 2.4) hog.pos.setLength(2.4 + r());
          }
          const teapot = t % 300 < 0.45;
          if (teapot !== hog.teapot) {
            hog.teapot = teapot;
            inst.mat.map = sceneTex(
              teapot ? SCENE_SPRITES.heartOfGoldTeapot : SCENE_SPRITES.installation('heartOfGold'),
            );
          }
          sp.position.copy(hog.pos);
          sp.position.y += Math.sin(t * 0.5) * 0.15;
          break;
        }
      }

      // Pulse styles — the effect layer the art leaves to code.
      if (lane.pulse === 1) inst.mat.opacity = 0.72 + 0.28 * Math.sin(t * 2.8 + inst.phase);
      else if (lane.pulse === 2) inst.mat.opacity = 0.85 + 0.15 * Math.sin(t * 1.1 + inst.phase);
      else if (lane.pulse === 3) {
        const g = Math.max(0, Math.sin(t * 1.6 + inst.phase));
        scale *= 1 + Math.pow(g, 14) * 0.45; // a petal catches the sun
      }
      sp.scale.set(scale, scale, 1);
    }
  });

  if (insts.length === 0) return null;
  return (
    <group>
      {insts.map((inst, i) => (
        <sprite
          key={inst.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          raycast={() => null}
        >
          <primitive object={inst.mat} attach="material" />
        </sprite>
      ))}
    </group>
  );
}
