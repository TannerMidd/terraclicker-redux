/**
 * The scene's three global lights — ambient, sun, cool fill — mounted once,
 * forever, and driven imperatively.
 *
 * Same law as SceneLamps and RunaboutLamp: lights are never conditional,
 * because mounting one invalidates every material's compiled shader at once.
 * What CAN change freely is where a light is and what colour it is, so a
 * groundfall does not bring its own sun — it borrows the one the universe
 * already had, aims it along the landing site's sky, and gives it back on
 * takeoff with nobody recompiling anything.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Vector3, type AmbientLight, type DirectionalLight } from 'three/webgpu';
import { SUN_DIR } from './Planet';

interface RigState {
  /** When true, the override values below drive the lights. */
  override: boolean;
  sunPos: Vector3;
  sunColor: Color;
  sunIntensity: number;
  ambientColor: Color;
  ambientIntensity: number;
  fillPos: Vector3;
  fillColor: Color;
  fillIntensity: number;
}

const DEFAULT_SUN = new Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);

/** Written by the surface scene each frame while it owns the sky. */
export const lightRig: RigState = {
  override: false,
  sunPos: new Vector3().copy(DEFAULT_SUN),
  sunColor: new Color(0xfff2dc),
  sunIntensity: 3.1,
  ambientColor: new Color(0x8aa4d4),
  ambientIntensity: 0.34,
  fillPos: new Vector3(-4.5, -1, -3),
  fillColor: new Color(0x3a5a8e),
  fillIntensity: 0.4,
};

/** Hand the lights back to the universe exactly as SceneRoot mounted them. */
export function releaseLightRig(): void {
  lightRig.override = false;
  lightRig.sunPos.copy(DEFAULT_SUN);
  lightRig.sunColor.set(0xfff2dc);
  lightRig.sunIntensity = 3.1;
  lightRig.ambientColor.set(0x8aa4d4);
  lightRig.ambientIntensity = 0.34;
  lightRig.fillPos.set(-4.5, -1, -3);
  lightRig.fillColor.set(0x3a5a8e);
  lightRig.fillIntensity = 0.4;
}

export function GlobalLights() {
  const ambient = useRef<AmbientLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);

  useFrame(() => {
    // Copy unconditionally: the rig state is the single source of truth for
    // these lights whether the universe or a landing site is on screen.
    if (ambient.current) {
      ambient.current.color.copy(lightRig.ambientColor);
      ambient.current.intensity = lightRig.ambientIntensity;
    }
    if (sun.current) {
      sun.current.position.copy(lightRig.sunPos);
      sun.current.color.copy(lightRig.sunColor);
      sun.current.intensity = lightRig.sunIntensity;
    }
    if (fill.current) {
      fill.current.position.copy(lightRig.fillPos);
      fill.current.color.copy(lightRig.fillColor);
      fill.current.intensity = lightRig.fillIntensity;
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.34} color={0x8aa4d4} />
      <directionalLight ref={sun} position={SUN_DIR} intensity={3.1} color={0xfff2dc} />
      <directionalLight ref={fill} position={[-4.5, -1, -3]} intensity={0.4} color={0x3a5a8e} />
    </>
  );
}
