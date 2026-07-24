import { z } from 'zod';

/** A Decimal serialized as a string ("0", "1.5e42", …). */
const dec = z.string().regex(/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i);

const aspectRecord = z.object({
  thermal: dec,
  atmo: dec,
  hydro: dec,
  bio: dec,
});

export const saveSchema = z.object({
  version: z.number().int().min(1),
  seed: z.number().int(),
  rng: z.object({
    planets: z.number(),
    bubbles: z.number(),
    events: z.number(),
    vogons: z.number(),
    visuals: z.number(),
  }),
  gameTimeMs: z.number().min(0),
  createdAtWall: z.number(),
  savedAtWall: z.number(),
  tu: dec,
  science: dec,
  buildings: z.record(z.string(), z.number().int().min(0)),
  upgrades: z.record(z.string(), z.number().int().min(0)),
  research: z.object({
    completed: z.array(z.string()),
    active: z.object({ id: z.string(), remainingMs: z.number() }).nullable(),
  }),
  achievements: z.record(z.string(), z.number()),
  planet: z.object({
    index: z.number().int().min(0),
    lifetimeIndex: z.number().int().min(1),
    seed: z.number().int(),
    type: z.enum(['terrestrial', 'ice', 'desert', 'volcanic', 'ocean', 'gasgiant']),
    size: z.enum(['small', 'medium', 'large', 'huge']),
    name: z.string(),
    quirks: z.array(z.string()),
    survey: z.string().nullable(),
    surveyOptions: z.array(z.string()).nullable(),
    gauges: aspectRecord,
    targets: aspectRecord,
  }),
  run: z.object({
    number: z.number().int().min(1),
    planetsCompleted: z.number().int().min(0),
    systems: z.number().int().min(0),
    galaxies: z.number().int().min(0),
    tuEarned: dec,
    completedPlanets: z.array(
      z.object({
        seed: z.number().int(),
        type: z.enum(['terrestrial', 'ice', 'desert', 'volcanic', 'ocean', 'gasgiant']),
        size: z.enum(['small', 'medium', 'large', 'huge']),
        name: z.string(),
      }),
    ),
  }),
  lifetime: z.object({
    tuEarned: dec,
    clicks: z.number().min(0),
    planetsCompleted: z.number().int().min(0),
    systems: z.number().int().min(0),
    galaxies: z.number().int().min(0),
    bestGalaxies: z.number().int().min(0),
    bubblesCaught: z.number().int().min(0),
    petuniasCaught: z.number().int().min(0),
    vogonShipsRepelled: z.number().int().min(0),
    vogonReadingsEndured: z.number().int().min(0),
    prestiges: z.number().int().min(0),
  }),
  prestige: z.object({
    bp: z.number().min(0),
    bpEarned: z.number().min(0),
    catalogue: z.record(z.string(), z.number().int().min(0)),
  }),
  buffs: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      mult: z.number(),
      clickMult: z.number(),
      remainingMs: z.number(),
    }),
  ),
  bubbles: z.array(
    z.object({
      id: z.number(),
      kind: z.enum(['normal', 'golden', 'whale', 'petunias', 'gargle']),
      seed: z.number(),
      remainingMs: z.number(),
    }),
  ),
  activeEvents: z.array(z.object({ id: z.string(), remainingMs: z.number() })),
  vogon: z
    .object({
      remainingMs: z.number(),
      ships: z.array(z.object({ id: z.number(), seed: z.number(), hit: z.boolean() })),
      poemSeed: z.number(),
    })
    .nullable(),
  timers: z.object({
    nextBubbleMs: z.number(),
    nextEventMs: z.number(),
    nextVogonMs: z.number(),
    stallMs: z.number(),
    sinceBubbleCatchMs: z.number(),
    nextIdCounter: z.number().int(),
    tickCarryMs: z.number(),
  }),
  flags: z.record(z.string(), z.union([z.number(), z.boolean()])),
});

export type SaveShape = z.infer<typeof saveSchema>;
