import type {
  CompletedPlanetRecord,
  GameState,
  OperationsState,
  SystemSpecialty,
} from '../../../engine/types';
export type { SystemSpecialty } from '../../../engine/types';

export interface SpecialtyVisual {
  color: number;
  label: string;
  shortLabel: string;
  bonus: string;
}

export const SPECIALTY_VISUAL: Record<SystemSpecialty, SpecialtyVisual> = {
  thermal: {
    color: 0xff8a3d,
    label: 'Thermal dispatch',
    shortLabel: 'thermal',
    bonus: '+8% thermal production',
  },
  atmo: {
    color: 0x5ad7e8,
    label: 'Atmospheric dispatch',
    shortLabel: 'atmospheric',
    bonus: '+8% atmosphere production',
  },
  hydro: {
    color: 0x4d8dff,
    label: 'Hydrologic dispatch',
    shortLabel: 'hydrologic',
    bonus: '+8% hydro production',
  },
  bio: {
    color: 0x58d68a,
    label: 'Biotic dispatch',
    shortLabel: 'biotic',
    bonus: '+8% bio production',
  },
  science: {
    color: 0xf5c84c,
    label: 'Science dispatch',
    shortLabel: 'science',
    bonus: '+10% science production',
  },
  production: {
    color: 0xd7e4ff,
    label: 'General production dispatch',
    shortLabel: 'general production',
    bonus: '+4% all production',
  },
};

/**
 * One shared media-query state for every universe glyph. This avoids one
 * listener (or one matchMedia allocation per frame) for every formed system.
 */
export const universeMotion = { reduced: false };

if (typeof window !== 'undefined') {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => {
    universeMotion.reduced = media.matches;
  };
  update();
  media.addEventListener('change', update);
}

export function operationsVisual(state: GameState): OperationsState {
  return state.operations;
}

export function specialtyFor(
  state: GameState,
  systemIndex: number,
): SystemSpecialty | null {
  return operationsVisual(state).systemSpecialties[String(systemIndex)] ?? null;
}

export function specialtySummary(specialty: SystemSpecialty | null): string | null {
  if (!specialty) return null;
  const visual = SPECIALTY_VISUAL[specialty];
  return `${visual.label} · ${visual.bonus}`;
}

/**
 * Persistent archive entries are not rendered on their own. A marker only
 * appears when the same career-world record is also present in this run.
 */
export function isHeritageWorld(state: GameState, record: CompletedPlanetRecord): boolean {
  const operations = operationsVisual(state);
  return (
    operations.heritageCandidateLifetimeIndex === record.lifetimeIndex ||
    operations.heritageWorlds.some(
      (heritage) => heritage.lifetimeIndex === record.lifetimeIndex,
    )
  );
}
