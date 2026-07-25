/**
 * Special Handling — cargo you can feel through the stick.
 *
 * Freight currently differs only in mass and pay. Everything else about
 * carrying three kilometres of coastline is identical to carrying a tea
 * service, which means the hold is a number rather than a thing you are
 * responsible for.
 *
 * The rule this module follows, and the reason it is not a menu: **every
 * handling trait changes how the ship flies, never what a panel says.** A
 * fragile load is one you cannot throttle hard; an awkward one turns like a
 * barn door; a secret one attracts attention; an improbable one makes the
 * sensors unreliable. You learn what is in the hold by flying it.
 *
 * Kept free of three.js so the numbers are testable without a canvas — the
 * flight layer reads these and applies them.
 */
import { FREIGHT_BY_ID } from '../content/freight';
import type { ExpeditionState } from './types';

export interface HandlingProfile {
  /**
   * Cap on how fast velocity may be *changed*, as a multiple of normal. Below
   * 1 means the throttle and the brakes both bite more gently — a fragile load
   * is not slower, it is less willing to be hurried.
   */
  responseMult: number;
  /** Steering rate multiplier. Below 1 turns wide. */
  turnMult: number;
  /** Multiplies how often customs takes an interest. */
  inspectionMult: number;
  /** 0–1. Sensor ranges wobble by up to this fraction, unpredictably. */
  sensorNoise: number;
  /** The traits in force, for the cockpit to name. */
  traits: readonly string[];
}

export const NEUTRAL_HANDLING: HandlingProfile = {
  responseMult: 1,
  turnMult: 1,
  inspectionMult: 1,
  sensorNoise: 0,
  traits: [],
};

/** What the current manifest does to the ship. Empty hold flies as it always did. */
export function handlingFor(expedition: ExpeditionState): HandlingProfile {
  const manifest = expedition.manifest;
  if (!manifest) return NEUTRAL_HANDLING;
  const def = FREIGHT_BY_ID[manifest.id];
  const traits = def?.handling ?? [];
  if (traits.length === 0) return NEUTRAL_HANDLING;

  const profile: HandlingProfile = { ...NEUTRAL_HANDLING, traits: [...traits] };
  for (const trait of traits) {
    switch (trait) {
      case 'fragile':
        // Not slower — less willing to be hurried, in both directions.
        profile.responseMult *= 0.6;
        break;
      case 'awkward':
        profile.turnMult *= 0.62;
        break;
      case 'secret':
        profile.inspectionMult *= 2.2;
        break;
      case 'improbable':
        profile.sensorNoise = Math.max(profile.sensorNoise, 0.35);
        break;
    }
  }
  return profile;
}

/** One line for the cockpit, or empty when the hold is ordinary. */
export function handlingLabel(profile: HandlingProfile): string {
  if (profile.traits.length === 0) return '';
  const words: Record<string, string> = {
    fragile: 'fragile — do not hurry it',
    awkward: 'awkward — turns wide',
    secret: 'attracting attention',
    improbable: 'sensors unreliable',
  };
  return profile.traits.map((t) => words[t] ?? t).join(' · ');
}
