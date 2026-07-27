/**
 * The landmark grammar — two to four authored kinds per planet type, so
 * every region has a few memorable places instead of more rocks.
 *
 * Placement is the seam lattice's construction at a coarser cell size
 * (surface/surfaceLandmarks.ts); this file is only the VOCABULARY: what can
 * grow where, how eagerly, and what the Guide has to say about it. Phase 3's
 * skimmer drives toward these; Phase 5's missions will name them. The ids
 * are load-bearing — the renderer switches on them.
 */
import type { PlanetType } from '../engine/types';

export interface GroundLandmarkDef {
  id: string;
  /** Compass name, definite article included — "the Standing Ring". */
  name: string;
  guide: string;
  types: readonly PlanetType[];
  weight: number;
  /**
   * Coastal kinds stand at the waterline (placement checks the shore band);
   * everything else demands honestly dry ground.
   */
  coastal?: boolean;
  /** Only where the world carries this quirk. */
  quirk?: string;
}

export const GROUND_LANDMARKS: readonly GroundLandmarkDef[] = [
  // — Terrestrial —
  {
    id: 'standing-ring',
    name: 'the Standing Ring',
    guide: 'A circle of monoliths, older than the paperwork. Nobody built it. The planet denies everything.',
    types: ['terrestrial'],
    weight: 3,
  },
  {
    id: 'stone-arch',
    name: 'the Great Arch',
    guide: 'Erosion with a flair for structure. The Guide rates it "load-bearing, probably".',
    types: ['terrestrial', 'desert'],
    weight: 3,
  },
  {
    id: 'perched-boulder',
    name: 'the Perched Boulder',
    guide: 'A very large rock balanced on a considerably smaller one. It has been about to fall for nine million years.',
    types: ['terrestrial'],
    weight: 2.4,
  },
  // — Desert —
  {
    id: 'hoodoo-court',
    name: 'the Hoodoo Court',
    guide: 'Capped stone pillars in loose assembly. They appear to be waiting for a verdict.',
    types: ['desert'],
    weight: 3,
  },
  // — Ice —
  {
    id: 'ice-organ',
    name: 'the Ice Organ',
    guide: 'A rank of blue spires the wind plays badly. The planet is learning.',
    types: ['ice'],
    weight: 3,
  },
  {
    id: 'pressure-ridge',
    name: 'the Pressure Ridge',
    guide: 'Slabs of pack ice shoved upright by an argument between two floes. Neither won.',
    types: ['ice'],
    weight: 3,
  },
  // — Volcanic —
  {
    id: 'basalt-choir',
    name: 'the Basalt Choir',
    guide: 'Hexagonal columns in close formation. Geology, showing off its one party trick.',
    types: ['volcanic'],
    weight: 3,
  },
  {
    id: 'cinder-cone',
    name: 'the Cinder Cone',
    guide: 'A small volcano practising to be a large one. The glow at the top is enthusiasm.',
    types: ['volcanic'],
    weight: 2.6,
  },
  {
    id: 'fumarole-field',
    name: 'the Fumarole Field',
    guide: 'The ground, venting. The Guide advises standing upwind and downhill of your opinions.',
    types: ['volcanic'],
    weight: 2.4,
  },
  // — Ocean —
  {
    id: 'sea-stacks',
    name: 'the Sea Stacks',
    guide: 'Pillars the ocean carved and then forgot to take down. Popular with whatever evolves next.',
    types: ['ocean'],
    weight: 3,
    coastal: true,
  },
  {
    id: 'tide-arch',
    name: 'the Tide Arch',
    guide: 'A doorway the sea uses twice a day. It has never once knocked.',
    types: ['ocean'],
    weight: 2.6,
    coastal: true,
  },
  {
    id: 'blowhole',
    name: 'the Blowhole',
    guide: 'The coast, exhaling. The Guide notes the timing is reliable and the dignity is not.',
    types: ['ocean'],
    weight: 2.2,
    coastal: true,
  },
  // — By decree —
  {
    id: 'award-fjords',
    name: 'the Fjords (award-winning)',
    guide: 'Coastline by Slartibartfast. A small plaque credits the crinkly edges. The view files itself.',
    types: ['terrestrial', 'ice', 'ocean', 'desert'],
    weight: 3.4,
    coastal: true,
    quirk: 'award-winning-fjords',
  },
];

export const LANDMARK_BY_ID: Record<string, GroundLandmarkDef> = Object.fromEntries(
  GROUND_LANDMARKS.map((d) => [d.id, d]),
);
