/**
 * Planetary field projects: small authored chains assembled over real worlds.
 *
 * These are deliberately not crafting recipes. A source observation is a
 * proof that a system contains a usable capability; the project then carries
 * one tagged consignment in its own sparse state and leaves a visible module
 * at the receiving settlement. Salvage and reputation are the only numeric
 * pay. The lasting reward is a place, a service, and a route.
 */
import type {
  FactionId,
  FieldProjectId,
  GroundProjectKind,
  PlanetType,
} from '../engine/types';

export interface FieldProjectDef {
  id: FieldProjectId;
  name: string;
  guide: string;
  receiverTypes: readonly PlanetType[];
  sourceTypes: readonly PlanetType[];
  sourceSamples?: readonly string[];
  sourceSpecies?: readonly string[];
  /** A preserved source site can satisfy stewardship-led work. */
  allowPreserve?: boolean;
  result: GroundProjectKind;
  service: string;
  faction: FactionId;
  salvage: number;
  reputation: number;
  investigate: string;
  sourceBrief: string;
  returnBrief: string;
  complete: string;
  routeNoun: string;
}

export const FIELD_PROJECTS: readonly FieldProjectDef[] = [
  {
    id: 'cold-chain',
    name: 'The Cold Chain',
    guide:
      'A desert condenser is losing an argument with noon. The answer exists on an ice world, where noon is regarded as a rumour.',
    receiverTypes: ['desert'],
    sourceTypes: ['ice'],
    sourceSamples: ['cryogenic-brine', 'glacier-core'],
    result: 'greenhouse',
    service: 'weather bureau and fog-orchard landing brief',
    faction: 'magrathea',
    salvage: 48,
    reputation: 2,
    investigate: 'Consult the settlement terminal, then take three separated condenser readings.',
    sourceBrief: 'Recover a precision ice or brine sample on the named ice world.',
    returnBrief: 'Return to the desert settlement, consult the terminal, and take one calibration reading.',
    complete: 'The condenser now waters a fog orchard. It remains deeply suspicious of noon.',
    routeNoun: 'Cold Chain',
  },
  {
    id: 'heat-without-fire',
    name: 'Heat Without Fire',
    guide:
      'An ice settlement requires warmth that will not also require evacuation. A volcanic field office has offered a distinction.',
    receiverTypes: ['ice'],
    sourceTypes: ['volcanic'],
    sourceSamples: ['vent-sulphur', 'living-basalt'],
    result: 'heat-exchanger',
    service: 'thermal refuge and rough-field service point',
    faction: 'magrathea',
    salvage: 52,
    reputation: 2,
    investigate: 'Consult the settlement terminal, then map three heat-loss readings around the district.',
    sourceBrief: 'Certify a volcanic source with a core or carefully prospected sample.',
    returnBrief: 'Return to the ice settlement and calibrate the exchanger from the field.',
    complete: 'The exchanger is warm, stable, and no longer described in evacuation plans.',
    routeNoun: 'Thermal Exchange',
  },
  {
    id: 'reef-memory',
    name: 'Reef Memory',
    guide:
      'A terrestrial wetland has forgotten how to be wet in the interesting sense. An ocean world still remembers.',
    receiverTypes: ['terrestrial'],
    sourceTypes: ['ocean'],
    sourceSpecies: ['tide-chorus', 'nesting-colony', 'glass-shoal'],
    allowPreserve: true,
    result: 'wetland',
    service: 'conservatory and biologger blind',
    faction: 'mice',
    salvage: 46,
    reputation: 3,
    investigate: 'Consult the conservancy terminal and compare three readings across the dry basin.',
    sourceBrief: 'Record a compatible ocean species or preserve a living shoreline site.',
    returnBrief: 'Return with the field record and calibrate the restored waterline.',
    complete: 'The basin has become a wetland again. Wildlife has filed no objection and several arrivals.',
    routeNoun: 'Living Corridor',
  },
  {
    id: 'glass-for-the-tide',
    name: 'Glass for the Tide',
    guide:
      'An ocean harbour requires an optic that remains visible through spray. The desert produces glass by leaving the polishing to weather.',
    receiverTypes: ['ocean'],
    sourceTypes: ['desert'],
    sourceSamples: ['ferrous-drift', 'ridge-quartz'],
    result: 'harbour-beacon',
    service: 'precise harbour approach and dock dispatch',
    faction: 'vogon',
    salvage: 44,
    reputation: 2,
    investigate: 'Consult the harbour terminal and take three line-of-sight readings around the dark approach.',
    sourceBrief: 'Recover desert optical material and file its provenance in person.',
    returnBrief: 'Return to the harbour, consult the terminal, and align the beacon.',
    complete: 'The harbour beacon now reaches through spray, fog, and most forms of paperwork.',
    routeNoun: 'Tideglass Run',
  },
  {
    id: 'system-seed-bank',
    name: 'The System Seed Bank',
    guide:
      'One world has life to spare and another has a dome full of labelled optimism. The missing component is a ship.',
    receiverTypes: ['desert', 'ice', 'volcanic', 'ocean'],
    sourceTypes: ['terrestrial'],
    sourceSamples: ['biotite-loam'],
    sourceSpecies: ['grazer-ring', 'spore-bloom', 'meadow-drifter'],
    allowPreserve: true,
    result: 'seed-bank',
    service: 'seed archive and ecological project desk',
    faction: 'mice',
    salvage: 50,
    reputation: 3,
    investigate: 'Consult the settlement terminal and take three habitat readings outside the dome.',
    sourceBrief: 'Catalogue viable terrestrial life, rich loam, or a deliberately preserved habitat.',
    returnBrief: 'Return to the receiving world and calibrate the seed archive against local conditions.',
    complete: 'The archive contains enough future to make the present slightly self-conscious.',
    routeNoun: 'Seed Corridor',
  },
] as const;

export const FIELD_PROJECT_BY_ID: Record<FieldProjectId, FieldProjectDef> = Object.fromEntries(
  FIELD_PROJECTS.map((project) => [project.id, project]),
) as Record<FieldProjectId, FieldProjectDef>;

export const PROJECT_SERVICE_BY_KIND: Record<GroundProjectKind, string> = Object.fromEntries(
  FIELD_PROJECTS.map((project) => [project.result, project.service]),
) as Record<GroundProjectKind, string>;
