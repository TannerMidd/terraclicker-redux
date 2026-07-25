import { C } from '../content/constants';
import { PLANET_TYPES, PLANET_TYPE_BY_ID } from '../content/planetTypes';
import { QUIRKS } from '../content/quirks';
import { SURVEYS } from '../content/surveys';
import { EARTH_NAME, FIRST_PLANET_NAME, generatePlanetName } from '../content/naming';
import { D, DZERO, Decimal } from './num';
import { pickWeighted, randInt, sample, type RngState } from './rng';
import { ASPECTS, type AspectId, type PlanetSize, type PlanetState, type PlanetType } from './types';

const SIZES: readonly { id: PlanetSize; weight: number }[] = [
  { id: 'small', weight: 25 },
  { id: 'medium', weight: 40 },
  { id: 'large', weight: 25 },
  { id: 'huge', weight: 10 },
];

/** Gauge targets: T(n) = GAUGE_BASE × GAUGE_GROWTH^n × sizeMod × typeBias × quirkBias. */
export function gaugeTargets(
  runIndex: number,
  type: string,
  size: PlanetSize,
  quirkIds: string[],
): Record<AspectId, Decimal> {
  const typeDef = PLANET_TYPE_BY_ID[type];
  const base = D(C.GAUGE_BASE).mul(Decimal.pow(C.GAUGE_GROWTH, runIndex)).mul(C.SIZE_MODS[size]);
  const targets = {} as Record<AspectId, Decimal>;
  for (const a of ASPECTS) {
    let bias = typeDef?.targetBias[a] ?? 1;
    for (const qid of quirkIds) {
      // Quirk target multipliers are rare; look up lazily to avoid an import cycle.
      const q = QUIRKS.find((qq) => qq.id === qid);
      const m = q?.targetMult?.[a];
      if (m) bias *= m;
    }
    targets[a] = base.mul(bias);
  }
  return targets;
}

export interface NewPlanetOpts {
  runIndex: number;
  lifetimeIndex: number;
  /** Simulated time when this planet became the active commission. */
  startedAtGameMs: number;
  /** Gauge head start (0–1) from Fjord Certification / surveys. */
  headStart: number;
  /** Per-type multipliers from the commission's brief. See engine/dossiers.ts. */
  planetWeights?: Partial<Record<PlanetType, number>>;
}

/**
 * Generate the next planet, deterministically, from the planets stream.
 * Planet 1 of a run is always Terra Prima (terrestrial, medium, tutorial-calm).
 * Lifetime planet #42 is always Earth. Mostly harmless.
 */
export function generatePlanet(rng: RngState, opts: NewPlanetOpts): PlanetState {
  const { runIndex, lifetimeIndex } = opts;
  const isFirst = runIndex === 0;
  const isEarth = lifetimeIndex === 42;

  let type: string;
  let size: PlanetSize;
  let name: string;
  let quirks: string[];
  const seed = randInt(rng, 'planets', 1, 2 ** 31);

  if (isEarth) {
    type = 'terrestrial';
    size = 'medium';
    name = EARTH_NAME;
    quirks = ['mostly-harmless'];
  } else if (isFirst) {
    type = 'terrestrial';
    size = 'medium';
    name = FIRST_PLANET_NAME;
    quirks = [];
  } else {
    // The brief shifts which worlds arrive by MULTIPLYING the base weights,
    // never replacing them: a luxury ocean portfolio that could produce
    // nothing but oceans would stop being a portfolio.
    const weighted = PLANET_TYPES.map((t) => ({
      ...t,
      weight: t.weight * (opts.planetWeights?.[t.id as PlanetType] ?? 1),
    }));
    type = pickWeighted(rng, 'planets', weighted).id;
    size = pickWeighted(rng, 'planets', SIZES).id;
    name = generatePlanetName(rng);
    const rollable = QUIRKS.filter((q) => q.weight > 0);
    const count = 1 + randInt(rng, 'planets', 0, 3); // 1–3
    quirks = sample(rng, 'planets', rollable, count).map((q) => q.id);
  }

  const targets = gaugeTargets(runIndex, type, size, quirks);
  const gauges = {} as Record<AspectId, Decimal>;
  for (const a of ASPECTS) {
    gauges[a] = opts.headStart > 0 ? targets[a].mul(Math.min(0.5, opts.headStart)) : DZERO;
  }

  // Orbital Survey: pick 1 of 3, offered from planet #4 of a run. Earth is never surveyed;
  // its report was filed long ago and reads, in full, "mostly harmless".
  const offersSurvey = runIndex >= C.SURVEY_FROM_INDEX && !isEarth;
  const surveyOptions = offersSurvey
    ? sample(rng, 'planets', SURVEYS, 3).map((s) => s.id)
    : null;

  return {
    index: runIndex,
    lifetimeIndex,
    seed,
    type: type as PlanetState['type'],
    size,
    name,
    startedAtGameMs: opts.startedAtGameMs,
    quirks,
    survey: null,
    surveyOptions,
    gauges,
    targets,
  };
}

/** All four gauges full? */
export function planetComplete(p: PlanetState): boolean {
  return ASPECTS.every((a) => p.gauges[a].gte(p.targets[a]));
}

/** The gauge with the lowest fill fraction (clicks and Marvin aim here). */
export function lowestGauge(p: PlanetState): AspectId {
  let best: AspectId = 'thermal';
  let bestFrac = Infinity;
  for (const a of ASPECTS) {
    const target = p.targets[a];
    const frac = target.lte(0) ? 1 : p.gauges[a].div(target).toNumber();
    if (frac < bestFrac) {
      bestFrac = frac;
      best = a;
    }
  }
  return best;
}
