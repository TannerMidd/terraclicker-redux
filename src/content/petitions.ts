/**
 * Petitions — what a finished world writes to you about.
 *
 * The same machinery as situations (they are `SituationDef`s, resolved by the
 * same engine code) with three deliberate differences:
 *
 *   Sourced by a WORLD, and keyed to what that world actually is — its
 *   recorded bottleneck, its quirks — so it is unmistakably from a place you
 *   built rather than from the weather.
 *
 *   QUEUED, not one at a time. Several can be waiting, because these are
 *   requests, not emergencies, and a world should be able to ask while
 *   another world is also asking.
 *
 *   GENTLER, with long windows. Answering lifts standing; letting one lapse
 *   only lets it slip. The consequence is a world that slowly stops writing,
 *   which is worse than a penalty and costs nothing.
 *
 * Costs are in seconds of current production, as everywhere else, so a
 * request costs the same slice of an afternoon at every stage of the game.
 */
import type { AspectId, PlanetType } from '../engine/types';
import type { SituationDef } from './situations';

/** A petition keyed to the bottleneck the world was delivered against. */
export interface PetitionDef extends SituationDef {
  /** Only offered by worlds whose recorded bottleneck is this. */
  bottleneck: AspectId | null;
  /** Only offered by worlds carrying this quirk. */
  quirk?: string;
  /** Only offered by worlds of these types (ground work is type-shaped). */
  types?: readonly PlanetType[];
}

const WINDOW = 15 * 60_000;
/** Ground petitions get longer windows: the answer involves a spacesuit. */
const GROUND_WINDOW = 25 * 60_000;

export const PETITIONS: readonly PetitionDef[] = [
  {
    id: 'petition-thermal-winter',
    bottleneck: 'thermal',
    name: 'A Long Winter',
    text: '{world} reports that the winters are longer than the brochure implied, and would like to know whether that was a decision.',
    emoji: '❄️',
    weight: 8,
    severity: 'opportunity',
    targeted: true,
    windowMs: WINDOW,
    options: [
      {
        id: 'warm',
        label: 'Send thermal crews',
        detail: 'Re-task a rig for a season. They will feel it by spring.',
        costSeconds: 40,
        outcome: {
          text: 'The crews stayed through to the thaw. {world} has renamed a month after the shift supervisor, who is embarrassed about it.',
          standing: 0.18,
        },
      },
      {
        id: 'adapt',
        label: 'Send designs instead',
        detail: 'Cheaper. They build for the winter they have.',
        costSeconds: 12,
        outcome: {
          text: '{world} has built for its winter rather than against it, and is quietly proud of the result.',
          standing: 0.08,
          scienceSeconds: 90,
        },
      },
    ],
    ignored: {
      text: 'No reply went to {world} about the winters. They have stopped mentioning them.',
      standing: -0.1,
    },
  },
  {
    id: 'petition-atmo-smell',
    bottleneck: 'atmo',
    name: 'A Note About the Air',
    text: 'The air on {world} is entirely breathable and, according to eleven thousand signatures, wrong. Nobody can say how.',
    emoji: '🌬️',
    weight: 8,
    severity: 'opportunity',
    targeted: true,
    windowMs: WINDOW,
    options: [
      {
        id: 'retune',
        label: 'Retune the mix',
        detail: 'A specialist, a season, and a great many opinions.',
        costSeconds: 45,
        outcome: {
          text: 'Nobody on {world} can say what changed either, but the signatures have stopped and the parks are full.',
          standing: 0.2,
        },
      },
      {
        id: 'explain',
        label: 'Publish the analysis',
        detail: 'Show them the numbers. The numbers are fine.',
        outcome: {
          text: 'The analysis was thorough, correct, and received on {world} with the enthusiasm usually reserved for weather reports.',
          standing: 0.03,
        },
      },
    ],
    ignored: {
      text: 'The petition about the air on {world} has expired unanswered. A second one is being drafted, more formally.',
      standing: -0.1,
    },
  },
  {
    id: 'petition-hydro-fishing',
    bottleneck: 'hydro',
    name: 'A Question of Fishing Rights',
    text: 'Two settlements on {world} have discovered they were both promised the same sea, and are being extremely polite about it in writing.',
    emoji: '🎣',
    weight: 8,
    severity: 'opportunity',
    targeted: true,
    windowMs: WINDOW,
    options: [
      {
        id: 'survey',
        label: 'Survey and divide it',
        detail: 'Do it properly. Both sides get a line on a chart.',
        costSeconds: 50,
        outcome: {
          text: 'The sea around {world} now has a line down the middle of it that everyone can see on a chart and nobody can see from a boat. It is working.',
          standing: 0.2,
        },
      },
      {
        id: 'share',
        label: 'Tell them to share it',
        detail: 'Free, and they will sort it out. Probably.',
        outcome: {
          text: 'They are sharing it. There is a rota. The rota has a subcommittee. {world} is fine.',
          standing: 0.06,
        },
      },
    ],
    ignored: {
      text: 'Nobody ruled on the sea. Both settlements on {world} have concluded, separately, that they lost.',
      standing: -0.12,
    },
  },
  {
    id: 'petition-bio-garden',
    bottleneck: 'bio',
    name: 'An Application to Plant Something',
    text: 'A school on {world} would like to plant a garden on the ridge and has drawn you a picture of it, to scale, with the shed labelled.',
    emoji: '🌱',
    weight: 9,
    severity: 'opportunity',
    targeted: true,
    windowMs: WINDOW,
    options: [
      {
        id: 'approve',
        label: 'Approve it, and send seed',
        detail: 'Costs almost nothing. Worth more than almost nothing.',
        costSeconds: 8,
        outcome: {
          text: 'The garden on {world} is in. The shed is exactly where the drawing said. There is a plaque with your name spelled wrong.',
          standing: 0.25,
        },
      },
      {
        id: 'file',
        label: 'File it properly',
        detail: 'It will be approved. Eventually. Correctly.',
        outcome: {
          text: 'The application from {world} is progressing through the correct channels and the children have grown up.',
          standing: -0.02,
        },
      },
    ],
    ignored: {
      text: 'Nobody answered the school on {world}. They planted it anyway, which is the only good news in this report.',
      standing: -0.08,
    },
  },
  {
    id: 'petition-name',
    bottleneck: null,
    name: 'A Matter of Naming',
    text: '{world} has been calling its second continent something unofficial for years and would like it made official before the maps are reprinted.',
    emoji: '🗺️',
    weight: 7,
    severity: 'opportunity',
    targeted: true,
    windowMs: WINDOW,
    options: [
      {
        id: 'ratify',
        label: 'Ratify the local name',
        detail: 'Free. It costs a signature and means a great deal.',
        outcome: {
          text: 'It is official. {world} has celebrated by printing the maps it had already printed.',
          standing: 0.16,
        },
      },
      {
        id: 'formal',
        label: 'Assign a survey designation',
        detail: 'Correct, consistent, and thoroughly resented.',
        costSeconds: 10,
        outcome: {
          text: 'The continent on {world} is now officially designated 2-B. Everybody still calls it the other thing.',
          standing: -0.05,
          scienceSeconds: 60,
        },
      },
    ],
    ignored: {
      text: 'The maps of {world} were reprinted with the old name. Nobody involved is surprised.',
      standing: -0.06,
    },
  },
  {
    id: 'petition-heritage-fjords',
    bottleneck: null,
    quirk: 'award-winning-fjords',
    name: 'Concerning the Fjords',
    text: 'The fjords of {world} have won something again. {world} would like to hold a festival about it and is asking, very transparently, for a budget.',
    emoji: '🏔️',
    weight: 10,
    severity: 'opportunity',
    targeted: true,
    windowMs: WINDOW,
    options: [
      {
        id: 'fund',
        label: 'Fund the festival',
        detail: 'They earned it. Slartibartfast will hear about this.',
        costSeconds: 35,
        outcome: {
          text: 'The festival on {world} ran for nine days. There were boats. Slartibartfast sent a note, which is framed.',
          standing: 0.3,
        },
      },
      {
        id: 'attend',
        label: 'Send congratulations',
        detail: 'Warm, free, and everyone will notice which one you chose.',
        outcome: {
          text: 'The congratulations were read aloud on {world} and applauded politely, at length, by people who had budgeted for more.',
          standing: 0.05,
        },
      },
    ],
    ignored: {
      text: 'The fjord festival on {world} went ahead on local funds. You were not mentioned in the programme.',
      standing: -0.12,
    },
  },
];

// ————— Ground petitions (Phase 5): requests whose real answer is boots —————

/**
 * The provenance table: the sample kind a delivered world of each type
 * reliably yields somewhere in any landing region, and where to look for it.
 * Derived from content/groundSamples.ts first-match order at full gauges.
 */
export const PROVENANCE: Record<
  Exclude<PlanetType, 'gasgiant'>,
  { kind: string; kindName: string; hint: string }
> = {
  terrestrial: { kind: 'biotite-loam', kindName: 'Biotite Loam', hint: 'the soil is up to something almost everywhere' },
  ice: { kind: 'glacier-core', kindName: 'Glacier Core', hint: 'inland ice, below the polar cap' },
  desert: { kind: 'ferrous-drift', kindName: 'Ferrous Drift', hint: 'any dune with opinions' },
  volcanic: { kind: 'living-basalt', kindName: 'Living Basalt', hint: 'warm stone with tenants' },
  ocean: { kind: 'reef-chalk', kindName: 'Reef Chalk', hint: 'dry ground above the tide line' },
};

const GROUND_PETITIONS: readonly PetitionDef[] = [
  {
    id: 'ground-survey',
    bottleneck: null,
    name: 'The Unmapped Mile',
    text: 'The cartography club of {world} notes that their backcountry has only ever been surveyed from orbit, and would like it walked by somebody with an instrument and, ideally, boots.',
    emoji: '🥾',
    weight: 9,
    severity: 'opportunity',
    targeted: true,
    windowMs: GROUND_WINDOW,
    ground: {
      kind: 'survey',
      n: 5,
      brief: 'land there and bank 5 survey credit in one stay',
      text: 'The backcountry of {world} has been walked, sampled, and pronounced "hilly, in places". The cartography club has framed the readout. Nobody frames orbital data.',
    },
    options: [
      {
        id: 'orbital',
        label: 'Commission an orbital re-scan',
        detail: 'Thorough, expensive, and nobody has to wear a suit.',
        costSeconds: 35,
        outcome: {
          text: 'The re-scan of {world} is complete and correct. The cartography club has accepted it the way one accepts a postcard from a place a friend went without you.',
          standing: 0.08,
        },
      },
      {
        id: 'defer',
        label: 'Add it to the schedule',
        detail: 'Free. The schedule is famous, and famously long.',
        outcome: {
          text: 'The survey of {world} has joined the schedule at position anything-but-next. The club meets fortnightly to discuss it.',
          standing: 0.02,
        },
      },
    ],
    ignored: {
      text: 'Nobody surveyed the backcountry of {world}. The club has started drawing it from memory, which the Guide describes as "brave cartography".',
      standing: -0.08,
    },
  },
  {
    id: 'ground-census',
    bottleneck: 'bio',
    name: 'The Census of Small Things',
    text: 'The naturalists of {world} are certain the wildlife outnumbers the paperwork, and would like a field biologist to stand outside and prove it.',
    emoji: '🐾',
    weight: 9,
    severity: 'opportunity',
    targeted: true,
    windowMs: GROUND_WINDOW,
    ground: {
      kind: 'species',
      n: 3,
      brief: 'land there and catalogue 3 species in one stay',
      text: 'Three species on {world} are now officially real, including one the naturalists had been calling "probably the wind". It is not the wind. It has been named after the wind anyway.',
    },
    options: [
      {
        id: 'drones',
        label: 'Deploy census drones',
        detail: 'They count everything, including each other.',
        costSeconds: 30,
        outcome: {
          text: 'The drones over {world} report a wildlife population of "several". A field team would have done better, but the drones did wear matching livery.',
          standing: 0.07,
        },
      },
      {
        id: 'forms',
        label: 'Send self-reporting forms',
        detail: 'For the wildlife to fill in. It has worked before, once.',
        outcome: {
          text: 'The forms sent to {world} were eaten, which the naturalists have logged as "one confirmed herbivore". Science advances.',
          standing: 0.03,
          scienceSeconds: 45,
        },
      },
    ],
    ignored: {
      text: 'The census of {world} did not happen. The wildlife remains uncounted and, according to the naturalists, is getting cocky about it.',
      standing: -0.07,
    },
  },
  {
    id: 'ground-recovery',
    bottleneck: null,
    name: 'Lost, Presumed Scenic',
    text: 'A commemorative plaque intended for a landmark on {world} has been in transit for some years. The residents would settle for somebody official simply standing at the landmark and being seen to.',
    emoji: '⌖',
    weight: 8,
    severity: 'opportunity',
    targeted: true,
    windowMs: GROUND_WINDOW,
    ground: {
      kind: 'landmark',
      brief: 'land there and stand at any named landmark',
      text: 'An official presence has now stood at the landmark on {world}, looked at it properly, and said "yes, that\'s it, all right". The residents consider this better than the plaque, which is fortunate, because the plaque is still in transit.',
    },
    options: [
      {
        id: 'replacement',
        label: 'Cast a replacement plaque',
        detail: 'It will also be shipped. Lessons have not been learned.',
        costSeconds: 25,
        outcome: {
          text: 'A second plaque is now in transit to {world}. The two consignments are, according to tracking, circling each other.',
          standing: 0.06,
        },
      },
      {
        id: 'certificate',
        label: 'Issue a certificate of scenicness',
        detail: 'Free, laminated, and legally meaningless.',
        outcome: {
          text: 'The landmark on {world} is now certified scenic. The certificate hangs in the town hall, slightly off-level, where everyone can worry about it.',
          standing: 0.03,
        },
      },
    ],
    ignored: {
      text: 'Nobody stood at the landmark on {world}. It continues to stand there anyway, out of habit.',
      standing: -0.06,
    },
  },
  {
    id: 'ground-call',
    bottleneck: null,
    name: 'An Invitation, Engraved',
    text: '{world} has sent an invitation to visit. It is engraved, it is polite, and it has clearly been drafted by a committee that voted on every comma. They would like somebody to actually come.',
    emoji: '💌',
    weight: 8,
    severity: 'opportunity',
    targeted: true,
    windowMs: GROUND_WINDOW,
    ground: {
      kind: 'civic',
      brief: 'land there and walk into a settlement',
      text: 'You went. You walked into town, on legs, in weather, past the sign with the population number on it. {world} has updated the sign to include you, temporarily, which is the highest honour the committee could agree on.',
    },
    options: [
      {
        id: 'card',
        label: 'Send a card',
        detail: 'Warm regards, engraved slightly less well.',
        costSeconds: 8,
        outcome: {
          text: 'The card was received on {world} and displayed on the civic mantelpiece. The committee has begun drafting a response, and several members have strong feelings about the salutation.',
          standing: 0.06,
        },
      },
      {
        id: 'hologram',
        label: 'Attend by hologram',
        detail: 'Present, in the way that a photograph of soup is dinner.',
        costSeconds: 15,
        outcome: {
          text: 'Your hologram attended {world}, smiled at the correct moments, and walked through a table. The committee has minuted the table.',
          standing: 0.04,
        },
      },
    ],
    ignored: {
      text: 'The invitation from {world} lapsed. The committee has engraved a follow-up, with one comma fewer, which everybody involved understands to be an escalation.',
      standing: -0.09,
    },
  },
  {
    id: 'ground-repair',
    bottleneck: null,
    name: 'A Ladder Problem',
    text: 'Something tall on {world} has stopped working at the top, and the residents\' ladder committee has resolved, unanimously, that it is somebody else\'s ladder. They have heard you own a spacesuit.',
    emoji: '🔧',
    weight: 9,
    severity: 'nuisance',
    targeted: true,
    windowMs: GROUND_WINDOW,
    ground: {
      kind: 'repair',
      brief: 'land there and make a repair at the settlement (Liaison I)',
      text: 'The tall thing on {world} works again, mended by hand, at height, in person. The ladder committee watched the whole operation from a safe distance and has voted you an honorary rung.',
    },
    options: [
      {
        id: 'crew',
        label: 'Dispatch a maintenance crew',
        detail: 'They bring their own ladder. It is a very good ladder.',
        costSeconds: 40,
        outcome: {
          text: 'The crew fixed the tall thing on {world} and left before anyone could thank them, which the residents found efficient and faintly wounding.',
          standing: 0.1,
        },
      },
      {
        id: 'manual',
        label: 'Send the manual',
        detail: 'Page 1: "Do not attempt without a crew."',
        outcome: {
          text: 'The manual arrived on {world} and has been read aloud at three consecutive committee meetings. The tall thing remains decorative.',
          standing: -0.02,
        },
      },
    ],
    ignored: {
      text: 'The tall thing on {world} is still broken. The residents have begun referring to it as "the monument", which is how civilisations cope.',
      standing: -0.1,
    },
  },
  {
    id: 'ground-beacon',
    bottleneck: null,
    name: 'A Light for the Charts',
    text: 'The shipping interests of {world} report that their stretch of the charts is famous for being nowhere, and would like a beacon raised on the ground so that it can be somewhere instead.',
    emoji: '📡',
    weight: 8,
    severity: 'opportunity',
    targeted: true,
    windowMs: GROUND_WINDOW,
    ground: {
      kind: 'beacon',
      brief: 'land there and raise a beacon (Mobility I)',
      text: 'A beacon now stands on {world}, put there by hand, which the shipping interests describe as "the old way" with visible emotion. The charts have been amended from "nowhere" to "here".',
    },
    options: [
      {
        id: 'buoy',
        label: 'Drop an orbital buoy',
        detail: 'From orbit. The modern way. Nobody waves at it.',
        costSeconds: 30,
        outcome: {
          text: 'A buoy now orbits {world}, beeping correctly. The shipping interests concede it works and have not once mentioned it since.',
          standing: 0.07,
        },
      },
      {
        id: 'listing',
        label: 'Amend the charts by form',
        detail: 'The stretch becomes "nowhere (registered)".',
        outcome: {
          text: 'The charts now list {world}\'s stretch as officially registered nowhere. The shipping interests have framed the form, out of spite.',
          standing: 0.02,
        },
      },
    ],
    ignored: {
      text: 'No light was raised over {world}. Ships continue to find it by asking each other, which works, and which everyone agrees is no way to run a galaxy.',
      standing: -0.07,
    },
  },
  {
    id: 'ground-logistics',
    bottleneck: null,
    name: 'Anything, Frankly',
    text: 'The dock crew of {world} report that nothing has arrived by ship in living memory, and that the arrivals board has started showing sunsets. They would take delivery of, and they are quoting, "anything, frankly".',
    emoji: '📦',
    weight: 7,
    severity: 'opportunity',
    targeted: true,
    windowMs: GROUND_WINDOW,
    ground: {
      kind: 'logistics',
      brief: 'fly any freight job to its docks',
      text: 'A ship landed on {world} with cargo aboard, and the dock crew turned out in full to watch it be signed for. The arrivals board shows the delivery on a loop. The sunsets have been moved to weekends.',
    },
    options: [
      {
        id: 'schedule',
        label: 'Add them to a trade schedule',
        detail: 'Regular service, starting eventually.',
        costSeconds: 25,
        outcome: {
          text: '{world} is now on a schedule. The dock crew have read the schedule. They liked the part with their name in it.',
          standing: 0.08,
        },
      },
      {
        id: 'postcard',
        label: 'Send confirmation of receipt of request',
        detail: 'It will arrive by ship. Technically that counts.',
        outcome: {
          text: 'The confirmation arrived at {world} by courier drone, which the dock crew signed for with great ceremony and mild disappointment.',
          standing: 0.03,
        },
      },
    ],
    ignored: {
      text: 'Nothing came to the docks of {world}. The arrivals board has been repurposed to show the departures board, which is also blank, but in a way the crew describe as "aspirational".',
      standing: -0.06,
    },
  },
  // — The weather watch: one per sky that can actually produce it —
  ...([
    {
      types: ['terrestrial', 'ocean'] as const,
      what: 'rain',
      id: 'ground-weather-rain',
      name: 'The Rain Ombudsman',
      text: 'The residents of {world} have filed a formal complaint about the rain — not its volume, which is correct, but its attitude. They would like it experienced by somebody impartial.',
      brief: 'land there and stand in the rain',
      done: 'An impartial observer has now stood in the rain of {world}, at length, in a suit rated for vacuum. Finding: the rain is wet, persistent, and, the report concedes, "a little pointed". The residents feel heard.',
      opt1: 'The meteorological audit of {world} confirms the rain is within specification. The residents have appealed the specification.',
      lapse: 'Nobody stood in the rain of {world}. It continues, unaudited, and has recently been joined by a wind with similar views.',
    },
    {
      types: ['desert'] as const,
      what: 'dust',
      id: 'ground-weather-dust',
      name: 'The Dust Inquiry',
      text: 'The dust on {world} has been getting into things it was not previously getting into, and an inquiry has been opened. The inquiry would like a witness who has stood in it.',
      brief: 'land there and stand in a dust front',
      done: 'Testimony has been entered into the inquiry of {world}: the dust is ambitious, coordinated, and currently inside a suit that was sealed to laboratory standard. The inquiry has adjourned to sweep.',
      opt1: 'The remote analysis of {world}\'s dust found nothing unusual, which the inquiry has entered into evidence as "exactly what the dust would want".',
      lapse: 'The inquiry on {world} closed without testimony. The dust was not available for comment, being busy inside the filing cabinet.',
    },
    {
      types: ['ice'] as const,
      what: 'whiteout',
      id: 'ground-weather-whiteout',
      name: 'The Whiteout Question',
      text: 'The settlers of {world} disagree about whether the winter whiteouts are "weather" or "a place". The dispute has reached the stage where an outside opinion, physically present, is the only acceptable instrument.',
      brief: 'land there and stand in a whiteout',
      done: 'The question of {world} is settled: a whiteout is a place. It has an inside, no outside, and a way of returning the visitor\'s own compass with its pockets emptied. Both factions have accepted the ruling and formed a new dispute about who won.',
      opt1: 'The satellite study of {world}\'s whiteouts concluded "weather, probably". The faction that lost has questioned the satellite\'s commitment.',
      lapse: 'No ruling came to {world}. The factions have merged out of exhaustion and now dispute something about fish.',
    },
    {
      types: ['volcanic'] as const,
      what: 'tremor',
      id: 'ground-weather-tremor',
      name: 'A Matter of Footing',
      text: 'The ground of {world} has opinions, expressed at intervals, through everyone\'s knees. The residents have adapted; their insurers have not; a standing assessment — briefly, repeatedly standing — is required.',
      brief: 'land there and stand through tremors',
      done: 'The assessment of {world} is filed: the ground moves, the residents sway, and the local architecture has been doing both for years without mentioning it. The insurers have introduced a new premium category: "rhythmic".',
      opt1: 'The seismographs of {world} report the tremors are regular, moderate, and rhythmically interesting. The insurers have asked the seismographs to stop editorialising.',
      lapse: 'Nobody stood on {world} for the assessment. The insurers have set the premium by guesswork, and the guess has upset everyone evenly.',
    },
  ].map(
    (w): PetitionDef => ({
      id: w.id,
      bottleneck: null,
      types: w.types,
      name: w.name,
      text: w.text,
      emoji: '🌦️',
      weight: 8,
      severity: 'opportunity',
      targeted: true,
      windowMs: GROUND_WINDOW,
      ground: { kind: 'weather', what: w.what, brief: w.brief, text: w.done },
      options: [
        {
          id: 'remote',
          label: 'Commission remote analysis',
          detail: 'Instruments experience it so nobody has to.',
          costSeconds: 30,
          outcome: { text: w.opt1, standing: 0.06 },
        },
        {
          id: 'note',
          label: 'Acknowledge receipt',
          detail: 'The weather is noted. The weather does not care.',
          outcome: {
            text: 'Receipt was acknowledged. The weather of {world} continues unmoved, which everyone involved privately expected.',
            standing: 0.02,
          },
        },
      ],
      ignored: { text: w.lapse, standing: -0.07 },
    }),
  ) satisfies PetitionDef[]),
  // — Provenance: one per type, asking for the ground itself —
  ...(Object.entries(PROVENANCE).map(
    ([type, p]): PetitionDef => ({
      id: `ground-provenance-${type}`,
      bottleneck: null,
      types: [type as PlanetType],
      name: 'A Question of Provenance',
      text: `A museum on {world} wishes to exhibit its own ground and has discovered, to institutional embarrassment, that every sample in the collection is imported. They would like two of the real thing — ${p.kindName}, collected by hand.`,
      emoji: '🪨',
      weight: 8,
      severity: 'opportunity',
      targeted: true,
      windowMs: GROUND_WINDOW,
      ground: {
        kind: 'sample',
        what: p.kind,
        n: 2,
        brief: `land there and bring aboard 2× ${p.kindName} (${p.hint})`,
        text: `The museum of {world} now exhibits two pieces of its own ground, collected on its own ground, by somebody who stood on its own ground to do it. The provenance card is one word long: "here". Attendance has tripled.`,
      },
      options: [
        {
          id: 'procure',
          label: 'Procure certified samples',
          detail: 'From a supplier. The provenance card will be longer.',
          costSeconds: 30,
          outcome: {
            text: 'The museum of {world} has its samples, certified authentic by a supplier four systems away. The provenance card runs to two paragraphs and nobody reads past the first.',
            standing: 0.06,
          },
        },
        {
          id: 'loan',
          label: 'Arrange a museum loan',
          detail: 'Somebody else\'s ground, temporarily.',
          outcome: {
            text: 'The loan exhibit at the museum of {world} is well attended and clearly labelled "not from here", which the curators read aloud in a special voice.',
            standing: 0.03,
          },
        },
      ],
      ignored: {
        text: 'The museum of {world} has filled the empty case with a mirror and the label "local ground, in context". The Guide has given the exhibit four stars.',
        standing: -0.06,
      },
    }),
  ) satisfies PetitionDef[]),
];

export const PETITION_BY_ID: Record<string, PetitionDef> = Object.fromEntries(
  [...PETITIONS, ...GROUND_PETITIONS].map((p) => [p.id, p]),
);

/** Everything a world could be asked, desk-answerable and ground-answerable. */
export const ALL_PETITIONS: readonly PetitionDef[] = [...PETITIONS, ...GROUND_PETITIONS];

/** The facts eligibility reads. Assembled by the spawner; content stays pure. */
export interface PetitionWorldFacts {
  type: PlanetType;
  bottleneck: AspectId;
  quirks: readonly string[];
  /** The world has facilities standing (repairs need something to mend). */
  hasInstallations: boolean;
  /** The world has at least one settlement (civic and repair work needs one). */
  hasSettlements: boolean;
  /** Field Certification ranks — a request for a verb you lack is just spite. */
  certs: Readonly<Record<string, number>>;
}

/** Petitions a given world could plausibly file. */
export function petitionsFor(facts: PetitionWorldFacts): PetitionDef[] {
  return ALL_PETITIONS.filter((p) => {
    if (p.quirk && !facts.quirks.includes(p.quirk)) return false;
    if (p.bottleneck && p.bottleneck !== facts.bottleneck) return false;
    if (p.types && !p.types.includes(facts.type)) return false;
    if (p.ground) {
      // Ground work needs ground. A gas giant files only desk-answerable mail.
      if (facts.type === 'gasgiant') return false;
      switch (p.ground.kind) {
        case 'civic':
          if (!facts.hasSettlements) return false;
          break;
        case 'repair':
          if (!facts.hasSettlements || !facts.hasInstallations) return false;
          if ((facts.certs['liaison'] ?? 0) < 1) return false;
          break;
        case 'beacon':
          if ((facts.certs['mobility'] ?? 0) < 1) return false;
          break;
        default:
          break;
      }
    }
    return true;
  });
}
