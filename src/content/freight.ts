/**
 * What the hold can be carrying, and what a seam is worth.
 *
 * Two payload kinds share one system (docs/EXPANSION.md): freight is mass and
 * pays salvage, a passenger is light and pays in a Guide entry and a rumour.
 * Everything between accepting and delivering is identical, which is why they
 * are one manifest slot rather than two subsystems.
 *
 * Every number here is in the FLIGHT economy — salvage, tonnes, seconds. None
 * of it touches TU, Science or planet progress, and nothing in the idle game
 * spends salvage. That seal is the oldest rule this layer has.
 */

export type PayloadKind = 'freight' | 'passenger';

export interface FreightDef {
  id: string;
  kind: PayloadKind;
  /** Manifest line, deadpan. `{from}` and `{to}` are substituted. */
  label: string;
  /** What the client says they are sending. Not always true. */
  note: string;
  /** Tonnes. A passenger and their luggage weigh almost nothing. */
  mass: number;
  /** Salvage paid on delivery, before the distance bonus. */
  salvage: number;
  weight: number;
  /** Whoever posted it, for reputation. */
  faction: 'magrathea' | 'mice' | 'vogon';
  /**
   * How the cargo makes itself felt at the helm.
   *
   * The point of Special Handling is that cargo differs through FLYING rather
   * than through another menu: a fragile load is a load you cannot throttle
   * hard, an awkward one turns like a barn door, a secret one attracts
   * attention, and an improbable one makes the sensors unreliable. None of
   * these is a number in a panel; all of them are something you notice with
   * your hands on the stick. See engine/handling.ts.
   */
  handling?: readonly ('fragile' | 'awkward' | 'secret' | 'improbable')[];
}

export const FREIGHT: readonly FreightDef[] = [
  {
    id: 'ballast',
    kind: 'freight',
    label: 'Ballast, unspecified',
    note: 'Heavy, inert, and nobody will say what it is for. It is for ballast.',
    mass: 18,
    salvage: 4,
    weight: 10,
    faction: 'magrathea',
    handling: ['awkward'],
  },
  {
    id: 'coastline',
    kind: 'freight',
    label: 'Coastline components',
    note: 'Fjord sections, crated. Slartibartfast has signed for them personally and would like them to arrive uncrumpled.',
    mass: 32,
    salvage: 8,
    weight: 8,
    faction: 'magrathea',
    handling: ['awkward'],
  },
  {
    id: 'teaset',
    kind: 'freight',
    label: 'One (1) tea service',
    note: 'Fragile, small, and mysteriously insured for more than the ship.',
    mass: 4,
    salvage: 5,
    weight: 7,
    faction: 'mice',
    handling: ['fragile'],
  },
  {
    id: 'labware',
    kind: 'freight',
    label: 'Laboratory apparatus',
    note: 'Mice-commissioned. Half of it is for measuring, and half of it is for measuring the measuring.',
    mass: 14,
    salvage: 6,
    weight: 8,
    faction: 'mice',
    handling: ['fragile', 'awkward'],
  },
  {
    id: 'forms',
    kind: 'freight',
    label: 'Forms, in triplicate',
    note: 'Eleven tonnes of paperwork about the transport of paperwork. The Vogons pay promptly, which is the unsettling part.',
    mass: 11,
    salvage: 7,
    weight: 9,
    faction: 'vogon',
    handling: ['secret'],
  },
  {
    id: 'anthology',
    kind: 'freight',
    label: 'Collected verse (crated)',
    note: 'Sealed at the client’s insistence. Do not open the crate. Do not read the crate.',
    mass: 26,
    salvage: 11,
    weight: 5,
    faction: 'vogon',
    handling: ['secret'],
  },
  {
    id: 'seedstock',
    kind: 'freight',
    label: 'Seed stock, living',
    note: 'It is alive, it is on a schedule, and it will be extremely obvious if you are late.',
    mass: 9,
    salvage: 6,
    weight: 8,
    faction: 'magrathea',
    handling: ['fragile'],
  },
  {
    id: 'hitchhiker',
    kind: 'passenger',
    label: 'One hitchhiker',
    note: 'Has a towel, a plan, and no money. Will talk the entire way and it will be worth it.',
    mass: 1,
    salvage: 1,
    weight: 9,
    faction: 'magrathea',
  },
  {
    id: 'researcher',
    kind: 'passenger',
    label: 'A Guide field researcher',
    note: 'Between assignments and enormously tired. Pays in citations, which the Guide accepts and banks do not.',
    mass: 1,
    salvage: 1,
    weight: 7,
    faction: 'mice',
  },
  {
    id: 'clerk',
    kind: 'passenger',
    label: 'A junior clerk, reassigned',
    note: 'Carrying their own transfer papers and a small plant. Neither of them wants to be here.',
    mass: 2,
    salvage: 2,
    weight: 6,
    faction: 'vogon',
  },
];

export const FREIGHT_BY_ID: Record<string, FreightDef> = Object.fromEntries(
  FREIGHT.map((f) => [f.id, f]),
);

/** Salvage per unit distance, so a long run is worth more than a short one. */
export const FREIGHT_DISTANCE_PAY = 0.035;
/** How long a job stays on the board once offered. */
export const JOB_TTL_MS = 30 * 60_000;
/** Jobs on the board at once. */
export const JOB_BOARD_SIZE = 4;

// ————— Seams —————

/**
 * What a mining rig stands on. Seams are seeded from the master seed like
 * Deep Field landmarks — they were always out there — so a universe's map of
 * them is fixed for its lifetime.
 */
export interface SeamDef {
  id: string;
  name: string;
  guide: string;
  /** Salvage per hour, before the rig's own efficiency. */
  yieldPerHour: number;
  /** How much the rig can bank before it stops and waits for you. */
  cap: number;
  /** Salvage to place a rig here. */
  rigCost: number;
  /** Held-scan seconds to prospect. */
  scanSeconds: number;
  /** Distance band from home, like Deep Field shells. */
  shell: 'near' | 'mid' | 'far';
}

export const SEAMS: readonly SeamDef[] = [
  {
    id: 'seam-chondrite',
    name: 'Chondrite Drift',
    guide:
      'A slow river of gravel that has been going the same way since before anybody was available to notice. Rich enough, dull enough, and it never argues.',
    yieldPerHour: 6,
    cap: 60,
    rigCost: 8,
    scanSeconds: 3,
    shell: 'near',
  },
  {
    id: 'seam-ferrous',
    name: 'The Iron Shoal',
    guide:
      'Dense, magnetic, and responsible for the compass on your console spinning in a way the fitter described as "characterful".',
    yieldPerHour: 11,
    cap: 110,
    rigCost: 14,
    scanSeconds: 4,
    shell: 'near',
  },
  {
    id: 'seam-cryo',
    name: 'Cryogenic Fines',
    guide:
      'Ice with things in it. The things are worth more than the ice, which the ice appears to resent.',
    yieldPerHour: 15,
    cap: 150,
    rigCost: 20,
    scanSeconds: 5,
    shell: 'mid',
  },
  {
    id: 'seam-scrapfall',
    name: 'The Scrapfall',
    guide:
      'Somebody lost an argument with a shipyard here, a very long time ago. The rig does not so much mine it as tidy it up.',
    yieldPerHour: 22,
    cap: 200,
    rigCost: 28,
    scanSeconds: 5,
    shell: 'mid',
  },
  {
    id: 'seam-heavies',
    name: 'Transuranic Pocket',
    guide:
      'Elements that should not persist, persisting. The rig is fitted with a warning light that means "good news" and looks exactly like the one that does not.',
    yieldPerHour: 34,
    cap: 300,
    rigCost: 40,
    scanSeconds: 7,
    shell: 'far',
  },
  {
    id: 'seam-improbable',
    name: 'An Unlikely Vein',
    guide:
      'Assays differently every time it is measured, and the average is spectacular. Research has asked everyone to stop measuring it in case it notices.',
    yieldPerHour: 48,
    cap: 420,
    rigCost: 58,
    scanSeconds: 8,
    shell: 'far',
  },
];

export const SEAM_BY_ID: Record<string, SeamDef> = Object.fromEntries(
  SEAMS.map((s) => [s.id, s]),
);
