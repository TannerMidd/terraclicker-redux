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
import type { AspectId } from '../engine/types';
import type { SituationDef } from './situations';

/** A petition keyed to the bottleneck the world was delivered against. */
export interface PetitionDef extends SituationDef {
  /** Only offered by worlds whose recorded bottleneck is this. */
  bottleneck: AspectId | null;
  /** Only offered by worlds carrying this quirk. */
  quirk?: string;
}

const WINDOW = 15 * 60_000;

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

export const PETITION_BY_ID: Record<string, PetitionDef> = Object.fromEntries(
  PETITIONS.map((p) => [p.id, p]),
);

/** Petitions a given world could plausibly file. */
export function petitionsFor(
  bottleneck: AspectId,
  quirks: readonly string[],
): PetitionDef[] {
  return PETITIONS.filter((p) => {
    if (p.quirk && !quirks.includes(p.quirk)) return false;
    if (p.bottleneck && p.bottleneck !== bottleneck) return false;
    return true;
  });
}
