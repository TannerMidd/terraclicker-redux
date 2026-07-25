/**
 * Megaprojects — the things that take days.
 *
 * The game had no reason to still be there on Thursday. Everything else
 * resolves inside a session: a world in minutes, a system in an evening, a
 * situation in three minutes flat. A megaproject is commissioned once and then
 * builds through real time, offline included, and is visible in the sky the
 * whole while — half-built when you come back, and finished one morning
 * without you.
 *
 * Two rules make them worth the wait:
 *
 *   They BUILD OFFLINE. Alone among this game's systems, and deliberately:
 *   the entire point is being something that happened while you were gone.
 *
 *   They SURVIVE PRESTIGE. Magrathea buys the portfolio, not the monuments.
 *   A finished megaproject keeps its effect and stays in the sky across every
 *   commission that follows, which is the only permanent thing you can build.
 *
 * Gated on faction reputation, because reputation had nothing to spend itself
 * on and this is the most expensive thing in the game.
 */
import type { FactionId } from '../engine/types';

export interface MegaprojectDef {
  id: string;
  name: string;
  /** The pitch, in Guide voice. */
  guide: string;
  /** What it does once it stands. */
  effectText: string;
  /** Who has to trust you before they will let you start. */
  faction: FactionId;
  reputationRequired: number;
  /** TU to commission, as a string for Decimal. */
  cost: string;
  /** Real time to build, in ms. */
  buildMs: number;
  /** Permanent global production multiplier once finished. */
  prodMult?: number;
  /** Permanent science multiplier once finished. */
  scienceMult?: number;
  /** Permanent flat addition to offline cap, in ms. */
  offlineCapAddMs?: number;
  /** Permanent salvage per hour, paid into the Deep Field economy. */
  salvagePerHour?: number;
}

const HOUR = 3_600_000;

export const MEGAPROJECTS: readonly MegaprojectDef[] = [
  {
    id: 'orbital-gantry',
    name: 'The Orbital Gantry',
    guide:
      'A scaffold big enough to build other scaffolds in, hung above the work. Magrathea has three of these and considers a fourth to be showing off, which it is.',
    effectText: 'Everything you produce, permanently, by a fifth.',
    faction: 'magrathea',
    reputationRequired: 6,
    cost: '2.5e9',
    buildMs: 8 * HOUR,
    prodMult: 1.2,
  },
  {
    id: 'deep-archive',
    name: 'The Deep Archive',
    guide:
      'Somewhere to put what you learned, on the theory that you will want it later. The mice have offered to index it, which is either generous or the entire reason they suggested it.',
    effectText: 'Research output, permanently, by a third.',
    faction: 'mice',
    reputationRequired: 6,
    cost: '4e9',
    buildMs: 12 * HOUR,
    scienceMult: 1.33,
  },
  {
    id: 'standing-office',
    name: 'A Permanent Filing Office',
    guide:
      'Staffed, lit, and open at hours nobody asked for. While it stands, the paperwork continues without you — which the Vogons regard as the highest form of civilisation.',
    effectText: 'Eight more hours of credited absence, permanently.',
    faction: 'vogon',
    reputationRequired: 8,
    cost: '1e10',
    buildMs: 18 * HOUR,
    offlineCapAddMs: 8 * HOUR,
  },
  {
    id: 'reclamation-yard',
    name: 'The Reclamation Yard',
    guide:
      'Takes in what the Deep Field gives up and sorts it, endlessly, without being asked twice. The first structure you have built that pays you in something the planet cannot use.',
    effectText: 'Salvage, hourly, forever — even while you are planetside.',
    faction: 'magrathea',
    reputationRequired: 12,
    cost: '5e10',
    buildMs: 24 * HOUR,
    salvagePerHour: 30,
  },
  {
    id: 'improbability-spire',
    name: 'The Improbability Spire',
    guide:
      'Tall, thin, and statistically unlikely to be standing at all, which is exactly the principle it operates on. Everyone who worked on it has agreed not to look directly at the top.',
    effectText: 'Everything, permanently, by half again — and the sky is never quiet.',
    faction: 'mice',
    reputationRequired: 16,
    cost: '2e11',
    buildMs: 36 * HOUR,
    prodMult: 1.5,
    scienceMult: 1.2,
  },
];

export const MEGAPROJECT_BY_ID: Record<string, MegaprojectDef> = Object.fromEntries(
  MEGAPROJECTS.map((m) => [m.id, m]),
);
