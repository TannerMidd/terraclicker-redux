/**
 * Ship roles and salvage-built infrastructure.
 *
 * Refits are a linear ladder: buy them all and every runabout in every universe
 * ends up identical. The ship stops being *yours* at exactly the point you have
 * invested the most in it.
 *
 * Roles fix that without taking anything away. Every refit you bought stays
 * bought; a role is a configuration laid over them, switchable at any time and
 * free to change, that trades one capability for another. A courier is fast and
 * carries almost nothing. A heavy hauler is the reverse. Nobody is ever locked
 * out of a refit they paid for — they have simply decided what this ship is
 * for today.
 *
 * Infrastructure is the other half: salvage can be spent on things that stay
 * where you left them. Every one of them improves navigation, storage or
 * convenience and none of them touches production, because the sealed economy
 * is the oldest rule this layer has.
 */

export interface ShipRole {
  id: string;
  name: string;
  text: string;
  /** Speed cap multiplier. */
  speed: number;
  /** Cargo capacity multiplier. */
  capacity: number;
  /** Sensor range multiplier. */
  sensors: number;
  /** Steering rate multiplier. */
  agility: number;
}

export const SHIP_ROLES: readonly ShipRole[] = [
  {
    id: 'general',
    name: 'General Duties',
    text: 'The configuration it left the yard in. Adequate at everything, which is a decision.',
    speed: 1, capacity: 1, sensors: 1, agility: 1,
  },
  {
    id: 'courier',
    name: 'Courier',
    text:
      'Everything not bolted down has been taken out, including some things that were. '
      + 'It goes like a scalded thing and carries almost nothing.',
    speed: 1.35, capacity: 0.45, sensors: 1, agility: 1.25,
  },
  {
    id: 'hauler',
    name: 'Heavy Hauler',
    text:
      'The hold has been extended into space the crew used to consider theirs. It carries '
      + 'a great deal and stops eventually.',
    speed: 0.8, capacity: 1.8, sensors: 0.9, agility: 0.75,
  },
  {
    id: 'survey',
    name: 'Survey Vessel',
    text:
      'Sensors turned all the way up, at the cost of most of the hold and some of the '
      + 'paint. It notices things well before you would like it to.',
    speed: 0.95, capacity: 0.7, sensors: 1.7, agility: 1,
  },
  {
    id: 'nuisance',
    name: 'Improbable Nuisance',
    text:
      'Nobody will say what was done to it. It handles beautifully, reads oddly on every '
      + 'instrument including its own, and customs have started recognising it.',
    speed: 1.15, capacity: 0.9, sensors: 1.3, agility: 1.4,
  },
];

export const ROLE_BY_ID: Record<string, ShipRole> = Object.fromEntries(
  SHIP_ROLES.map((r) => [r.id, r]),
);

// ————— Infrastructure —————

export type InfrastructureEffect =
  /** Sensor range, everywhere. */
  | { kind: 'sensors'; v: number }
  /** Salvage the rigs can bank before they stop. */
  | { kind: 'rigCap'; v: number }
  /** Cargo capacity, everywhere. */
  | { kind: 'capacity'; v: number };

export interface InfrastructureDef {
  id: string;
  name: string;
  text: string;
  /** Salvage. Never TU — this is built with what the Deep Field paid. */
  cost: number;
  effect: InfrastructureEffect;
  /** How many may stand at once. */
  max: number;
}

export const INFRASTRUCTURE: readonly InfrastructureDef[] = [
  {
    id: 'relay-buoy',
    name: 'Relay Buoy',
    text:
      'A pole with an aerial and an opinion about where everything is. Improves what the '
      + 'sensors can reach from anywhere, which is more than the department expected.',
    cost: 40,
    effect: { kind: 'sensors', v: 1.12 },
    max: 4,
  },
  {
    id: 'depot',
    name: 'Small Depot',
    text:
      'Somewhere to put things down. The single most requested piece of infrastructure in '
      + 'the history of hauling anything.',
    cost: 70,
    effect: { kind: 'capacity', v: 1.15 },
    max: 3,
  },
  {
    id: 'survey-station',
    name: 'Survey Station',
    text:
      'A shed that watches a seam and tells it to keep going. Rigs fill further before '
      + 'they politely stop.',
    cost: 90,
    effect: { kind: 'rigCap', v: 1.25 },
    max: 3,
  },
];

export const INFRASTRUCTURE_BY_ID: Record<string, InfrastructureDef> = Object.fromEntries(
  INFRASTRUCTURE.map((i) => [i.id, i]),
);
