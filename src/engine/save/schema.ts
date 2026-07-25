import { z } from 'zod';

/** A Decimal serialized as a string ("0", "1.5e42", …). */
const dec = z.string().regex(/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i);

const aspectRecord = z.object({
  thermal: dec,
  atmo: dec,
  hydro: dec,
  bio: dec,
});

const aspectId = z.enum(['thermal', 'atmo', 'hydro', 'bio']);
const factionId = z.enum(['magrathea', 'mice', 'vogon']);
const contractTemplateId = z.enum([
  'delivery',
  'system',
  'bottleneck',
  'survey',
  'lean',
  'timed',
]);
const systemSpecialty = z.enum([
  'thermal',
  'atmo',
  'hydro',
  'bio',
  'science',
  'production',
]);
const positiveCount = z.number().int().min(1);
const contractObjective = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('planets'), count: positiveCount }),
  z.object({ kind: z.literal('systems'), count: positiveCount }),
  z.object({
    kind: z.literal('bottleneck'),
    aspect: aspectId,
    count: positiveCount,
  }),
  z.object({ kind: z.literal('surveyed'), count: positiveCount }),
  z.object({
    kind: z.literal('lean'),
    maxBuildings: z.number().int().min(0),
    count: positiveCount,
  }),
  z.object({
    kind: z.literal('timed'),
    count: positiveCount,
    durationMs: z.number().int().positive(),
  }),
]);
const contractOffer = z.object({
  id: z.string(),
  templateId: contractTemplateId,
  faction: factionId,
  objective: contractObjective,
  rewardBp: z.number().int().min(0),
  rewardReputation: z.number().int().min(0),
});
const completedPlanetRecord = z.object({
  lifetimeIndex: z.number().int().min(1),
  seed: z.number().int(),
  type: z.enum(['terrestrial', 'ice', 'desert', 'volcanic', 'ocean', 'gasgiant']),
  size: z.enum(['small', 'medium', 'large', 'huge']),
  name: z.string(),
  quirks: z.array(z.string()),
  survey: z.string().nullable(),
  completionMs: z.number().int().min(0),
  bottleneck: aspectId,
  installations: z.array(z.string()),
});

const situationInstance = z.object({
  uid: z.number().int(),
  id: z.string(),
  remainingMs: z.number(),
  world: z.number().int().min(0),
  worldName: z.string(),
});

const jobOffer = z.object({
  uid: z.number().int(),
  id: z.string(),
  from: z.number().int(),
  to: z.number().int(),
  fromName: z.string(),
  toName: z.string(),
  distance: z.number(),
  salvage: z.number(),
  expiresAtMs: z.number(),
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
    contracts: z.number(),
    subetha: z.number(),
    situations: z.number(),
    freight: z.number(),
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
    startedAtGameMs: z.number().min(0),
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
    completedPlanets: z.array(completedPlanetRecord),
    /** World lifetimeIndex → standing. Sparse: only worlds below 1 appear. */
    standing: z.record(z.string(), z.number().min(0).max(1)),
    petitions: z.array(situationInstance),
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
    situationsAnswered: z.number().int().min(0),
    situationsIgnored: z.number().int().min(0),
    deliveries: z.number().int().min(0),
    rigsPlaced: z.number().int().min(0),
    megaprojectsBuilt: z.number().int().min(0),
    prestiges: z.number().int().min(0),
  }),
  prestige: z.object({
    bp: z.number().min(0),
    bpEarned: z.number().min(0),
    catalogue: z.record(z.string(), z.number().int().min(0)),
  }),
  operations: z.object({
    offers: z.array(contractOffer),
    active: z
      .object({
        offer: contractOffer,
        acceptedAtGameMs: z.number().min(0),
        startPlanets: z.number().int().min(0),
        startSystems: z.number().int().min(0),
        progress: z.number().int().min(0),
        deadlineAtGameMs: z.number().min(0).nullable(),
      })
      .nullable(),
    completed: z.array(
      z.object({
        id: z.string(),
        templateId: contractTemplateId,
        faction: factionId,
        completedAtGameMs: z.number().min(0),
        rewardBp: z.number().int().min(0),
        rewardReputation: z.number().int().min(0),
      }),
    ),
    reputation: z.object({
      magrathea: z.number().int().min(0),
      mice: z.number().int().min(0),
      vogon: z.number().int().min(0),
    }),
    offerGeneration: z.number().int().min(0),
    rerolledAtSystem: z.number().int().min(-1),
    systemSpecialties: z.record(z.string(), systemSpecialty),
    heritageCandidateLifetimeIndex: z.number().int().min(1).nullable(),
    heritageWorlds: z.array(
      completedPlanetRecord.extend({
        commissionNumber: z.number().int().min(1),
        preservedAtGameMs: z.number().min(0),
      }),
    ),
  }),
  expedition: z.object({
    discovered: z.record(z.string(), z.number().min(0)),
    boarded: z.record(z.string(), z.number().min(0)),
    salvage: z.number().min(0),
    refits: z.record(z.string(), z.number().int().min(0)),
    manifest: jobOffer.extend({ acceptedAtMs: z.number() }).nullable(),
    jobs: z.array(jobOffer),
    seams: z.record(z.string(), z.number().min(0)),
    rigs: z.record(
      z.string(),
      z.object({
        placedAtMs: z.number().min(0),
        banked: z.number().min(0),
        lastTickMs: z.number().min(0),
      }),
    ),
    interdictions: z.number().int().min(0),
    deliveries: z.number().int().min(0),
    nextJobMs: z.number(),
    pinned: z.string().nullable(),
    visited: z.record(z.string(), z.number().min(0)),
  }),
  megaprojects: z.record(
    z.string(),
    z.object({
      startedAtMs: z.number().min(0),
      builtMs: z.number().min(0),
      done: z.boolean(),
    }),
  ),
  worldRecords: z.record(
    z.string(),
    z.object({
      lifetimeIndex: z.number().int().min(1),
      name: z.string(),
      type: z.enum(['terrestrial', 'ice', 'desert', 'volcanic', 'ocean', 'gasgiant']),
      bottleneck: aspectId,
      commissionNumber: z.number().int().min(1),
      deliveredAtGameMs: z.number().min(0),
      installationCount: z.number().int().min(0),
      quirkCount: z.number().int().min(0),
      survey: z.string().nullable(),
      history: z.array(
        z.object({
          kind: z.enum([
            'petitionAnswered',
            'petitionIgnored',
            'situationResolved',
            'visited',
            'charter',
          ]),
          id: z.string(),
          atGameMs: z.number().min(0),
        }),
      ),
    }),
  ),
  subEtha: z.object({
    log: z.array(
      z.object({
        id: z.number(),
        atMs: z.number().min(0),
        kind: z.enum(['colony', 'guide', 'vogon', 'trade', 'hitchhiker', 'rumour', 'chronicle']),
        text: z.string(),
        site: z.string().optional(),
      }),
    ),
    nextBroadcastMs: z.number(),
    recent: z.array(z.string()),
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
  situations: z.array(situationInstance),
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
    nextSituationMs: z.number(),
    nextPetitionMs: z.number(),
    nextVogonMs: z.number(),
    stallMs: z.number(),
    sinceBubbleCatchMs: z.number(),
    nextIdCounter: z.number().int(),
    tickCarryMs: z.number(),
  }),
  flags: z.record(z.string(), z.union([z.number(), z.boolean()])),
});

export type SaveShape = z.infer<typeof saveSchema>;
