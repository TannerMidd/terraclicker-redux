/**
 * Commission Dossiers — what this particular commission is *for*.
 *
 * Every run currently opens identically: the same Terra Prima, the same
 * distribution of worlds after it, the same contract board, the same
 * appraisal. Prestige therefore gives you a faster version of the run you just
 * finished rather than a different one, and "the previous commission, but one
 * system longer" is not an identity.
 *
 * A dossier is the brief. Magrathea files three at every appraisal, you accept
 * one, and it holds for that whole commission. Each changes four things and
 * only four, so the difference is legible rather than a fog of modifiers:
 *
 *   1. **Which worlds arrive** — a portfolio weighting.
 *   2. **What the board asks for** — a contract bias.
 *   3. **One economic rule** — exactly one, named in the brief.
 *   4. **What appraisal will accept** — the terms of the sale.
 *
 * The rule is the interesting slot and the one that must stay small. Every
 * dossier rule lands on top of the additive BP curve from Phase 0.1, and the
 * whole reason that fix came first is so these could be added without any of
 * them compounding into the others.
 *
 * Tone: a departmental brief that has been through several hands and retains
 * the fingerprints of all of them.
 */
import type { PlanetType, ContractTemplateId } from '../engine/types';

export type DossierRule =
  /** Production multiplier for the whole commission. */
  | { kind: 'prodMult'; v: number }
  /** Science multiplier. */
  | { kind: 'scienceMult'; v: number }
  /** Installation costs scale by this. Below 1 is a discount. */
  | { kind: 'costMult'; v: number }
  /** Every world arrives this fraction pre-terraformed. */
  | { kind: 'headStart'; v: number }
  /** Completion bonus scaling — how much finishing a world pays. */
  | { kind: 'completionMult'; v: number };

export interface DossierDef {
  id: string;
  name: string;
  /** The filed brief, in the department's own words. */
  brief: string;
  /** One line naming the rule, shown as the terms. */
  terms: string;
  /** Relative weight per planet type. Absent types keep their base weight. */
  planetWeights?: Partial<Record<PlanetType, number>>;
  /** Contract templates this commission's board favours. */
  contractBias?: readonly ContractTemplateId[];
  rule: DossierRule;
  /** Systems added to (or removed from) the appraisal requirement. */
  systemsDelta?: number;
}

export const DOSSIERS: readonly DossierDef[] = [
  {
    id: 'luxury-ocean',
    name: 'A Luxury Ocean Portfolio',
    brief:
      'The client wants water. All of it, everywhere, and preferably with a coastline '
      + 'that photographs well from orbit. They have seen the fjords and they were not, '
      + 'they say, entirely convinced.',
    terms: 'Oceans are common. Biotic work pays; the sea does half of it for you.',
    planetWeights: { ocean: 5, desert: 0.4, volcanic: 0.5 },
    contractBias: ['delivery', 'survey'],
    rule: { kind: 'completionMult', v: 1.35 },
  },
  {
    id: 'vogon-minimum',
    name: 'Minimum Infrastructure Filing (Vogon)',
    brief:
      'A commission specified entirely in terms of what must not be present. The client '
      + 'is the Vogon Department of Works, the requirement is austerity, and the '
      + 'inspection schedule is described as "continuous and unannounced".',
    terms: 'Installations cost 25% less. The board wants lean deliveries and clocks.',
    planetWeights: { terrestrial: 3, gasgiant: 0.4 },
    contractBias: ['lean', 'timed'],
    rule: { kind: 'costMult', v: 0.75 },
  },
  {
    id: 'experimental-cluster',
    name: 'The Experimental Cluster',
    brief:
      'A research consortium requires a spread of difficult worlds. They have been '
      + 'explicit that the least efficient of them will be the most scientifically '
      + 'valuable, and equally explicit that this is not their problem.',
    terms: 'Science doubles. The worlds are worse. Both of those are the point.',
    planetWeights: { volcanic: 3, ice: 3, gasgiant: 2.5, terrestrial: 0.4 },
    contractBias: ['survey', 'bottleneck'],
    rule: { kind: 'scienceMult', v: 2 },
    systemsDelta: -1,
  },
  {
    id: 'independent-moons',
    name: 'Moons, Acting Independently',
    brief:
      'Somewhere in the drafting, the moons of this commission acquired independent '
      + 'purchasing authority. Nobody will say how. They have been buying materials in '
      + 'bulk and at a discount, and the department has decided to be pleased about it.',
    terms: 'Every world arrives 12% pre-terraformed, courtesy of its own moons.',
    planetWeights: { gasgiant: 4, ice: 2 },
    contractBias: ['system', 'delivery'],
    rule: { kind: 'headStart', v: 0.12 },
  },
  {
    id: 'flagship',
    name: 'A Flagship Commission',
    brief:
      'Everything about this one is larger, including the expectations, the budget, and '
      + 'the number of people who will be standing about at the ribbon-cutting looking '
      + 'as though they contributed.',
    terms: 'Production +40%. Appraisal wants one more system than usual.',
    contractBias: ['system', 'lean'],
    rule: { kind: 'prodMult', v: 1.4 },
    systemsDelta: 1,
  },
  {
    id: 'quiet-contract',
    name: 'A Quiet Contract',
    brief:
      'Small worlds, no client presence, and a note in the margin asking that the work '
      + 'be done without ceremony. It is the only brief on file that has ever said '
      + 'thank you in advance.',
    terms: 'Appraisal accepts one system fewer. Nothing else changes, and that is the offer.',
    planetWeights: { terrestrial: 2, ocean: 1.5 },
    contractBias: ['delivery', 'bottleneck'],
    rule: { kind: 'prodMult', v: 1.1 },
    systemsDelta: -1,
  },
];

export const DOSSIER_BY_ID: Record<string, DossierDef> = Object.fromEntries(
  DOSSIERS.map((d) => [d.id, d]),
);

/** How many briefs Magrathea files at each appraisal. */
export const DOSSIER_OFFER_COUNT = 3;
