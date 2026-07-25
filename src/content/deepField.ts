/**
 * The Deep Field: things that were already out there.
 *
 * Every other object in the universe is a monument to something the player
 * finished. These are not. They predate the commission, they are indifferent
 * to it, and the only way to learn what they are is to fly out and look.
 *
 * Each landmark is placed once, permanently, by the save seed (engine/deepField
 * .ts) — so a universe's Deep Field is fixed for its whole life, and no two
 * players get the same sky. Scanning writes the Guide entry; boarding recovers
 * salvage, which is spent exclusively on the runabout (content/refit.ts) and
 * never touches production. Exploration is a parallel track, not a gate.
 *
 * Tone rule, same as everywhere: dry documentation. Never wink.
 */

export type DeepFieldKind = 'derelict' | 'relic' | 'phenomenon' | 'structure' | 'creature';

/** Distance band from home. The catalogue is spread across all four. */
export type DeepFieldShell = 'near' | 'mid' | 'far' | 'deep';

export interface DeepFieldDef {
  id: string;
  /** What the console calls it before a scan resolves it. */
  contact: string;
  /** What it turns out to be. */
  name: string;
  kind: DeepFieldKind;
  shell: DeepFieldShell;
  /** Visual half-extent in world units; also sets the boarding envelope. */
  radius: number;
  /** Seconds of held scan at an unmodified analysis suite. */
  scanSeconds: number;
  /** Salvage recovered on boarding. */
  salvage: number;
  /** The Guide entry written the moment the scan resolves. */
  entry: string;
  /** The line the console reads on boarding. */
  boarding: string;
  /** Set on boarding — narrative hooks (the Towel arrives this way too). */
  flag?: string;
  /** Approaches politely fail. There is exactly one of these. */
  unreachable?: boolean;
}

export const DEEP_FIELD: readonly DeepFieldDef[] = [
  {
    id: 'sofa',
    contact: 'small object, tumbling',
    name: 'A Chesterfield Sofa',
    kind: 'relic',
    shell: 'near',
    radius: 0.5,
    scanSeconds: 2.5,
    salvage: 3,
    entry:
      'A Chesterfield sofa, upholstered in buttoned oxblood leather, rotating slowly about its long axis at a considerable distance from anything at all. Analysis confirms that it is a sofa, and that it is in space. Neither observation has ever led anywhere.',
    boarding: 'You sit down. It is, against all reasonable expectation, comfortable.',
  },
  {
    id: 'buoy42',
    contact: 'repeating transmission',
    name: 'Navigation Buoy 42',
    kind: 'structure',
    shell: 'near',
    radius: 0.4,
    scanSeconds: 3,
    salvage: 4,
    entry:
      'A standard-pattern navigation buoy transmitting, on every channel and at considerable expense, the number forty-two. It has done so without interruption for an estimated nine hundred thousand years. No accompanying information has ever been recovered, and the Guide has stopped asking.',
    boarding: 'The transmitter is in excellent repair. The message has not changed.',
  },
  {
    id: 'nutrimatic',
    contact: 'derelict service platform',
    name: 'Sirius Cybernetics Refreshment Platform',
    kind: 'derelict',
    shell: 'near',
    radius: 0.7,
    scanSeconds: 3.5,
    salvage: 5,
    entry:
      'An unmanned beverage platform of the Sirius Cybernetics Corporation, operational after four centuries without a customer, still dispensing a liquid that is almost, but not quite, entirely unlike tea. Its Genuine People Personality remains delighted to serve you, and has remained delighted to serve you for four hundred years.',
    boarding: '"Share and Enjoy," says the platform. You accept the cup. You do not drink it.',
  },
  {
    id: 'towelDrift',
    contact: 'soft object, negligible mass',
    name: 'An Unattended Towel',
    kind: 'relic',
    shell: 'near',
    radius: 0.3,
    scanSeconds: 2,
    salvage: 6,
    entry:
      'A towel, drifting. It is dry, warm, and folded, none of which conditions vacuum is known to preserve. The Guide records that a towel is the most massively useful thing an interstellar hitchhiker can carry, and declines to speculate on how this one came to be out here, ahead of you, waiting.',
    boarding: 'You take the towel. Somewhere, a form is quietly marked complete.',
    flag: 'towelEarned',
  },
  {
    id: 'teapot',
    contact: 'small ceramic, elliptical orbit',
    name: 'A Teapot',
    kind: 'relic',
    shell: 'mid',
    radius: 0.35,
    scanSeconds: 3,
    salvage: 7,
    entry:
      'A china teapot in elliptical orbit about a star of no importance, too small to be detected by any instrument not already pointed directly at it. Its existence has been the subject of a long and heated philosophical correspondence conducted entirely by people who could have come and looked.',
    boarding: 'It is a teapot. It is empty. You had, on balance, hoped otherwise.',
  },
  {
    id: 'petuniaBowl',
    contact: 'ceramic object, decelerating',
    name: 'The Original Bowl of Petunias',
    kind: 'relic',
    shell: 'mid',
    radius: 0.6,
    scanSeconds: 4,
    salvage: 8,
    entry:
      'A bowl of petunias arrested mid-fall, its terminal velocity indefinitely postponed by a local improbability fault. Instrumentation recovers one repeated thought from the moment of arrest. The thought is "oh no, not again." The Guide has never established what the petunias knew, only that they were correct.',
    boarding: 'The petunias decline to elaborate.',
  },
  {
    id: 'whale',
    contact: 'large biological mass, brief',
    name: 'A Sperm Whale, Briefly',
    kind: 'creature',
    shell: 'mid',
    radius: 1.4,
    scanSeconds: 5,
    salvage: 10,
    entry:
      'A sperm whale, called into existence some distance above nothing in particular, occupied with the enthusiastic business of working out what it is, what the rushing sound might be, and whether the rapidly approaching thing below will turn out to be a friend. It exists for precisely as long as somebody is looking at it, which is a form of immortality if you are not fussy.',
    boarding: 'It wonders what you are. You wonder the same. Neither of you settles it in time.',
  },
  {
    id: 'generationShip',
    contact: 'large derelict, powered',
    name: 'The Perpetual, Generation Ship',
    kind: 'derelict',
    shell: 'mid',
    radius: 1.8,
    scanSeconds: 6,
    salvage: 16,
    entry:
      'A generation ship of unremarkable design: ninety-one decks, all of them empty, running a recorded safety announcement on a loop of nine hundred years standing. The announcement concerns the correct disposal of towels. The vessel completed its journey four centuries ago. Nobody aboard noticed, and the announcement has now outlived every person it was recorded to protect.',
    boarding: 'Deck ninety-one is dark. The announcement begins again, politely, for you.',
  },
  {
    id: 'bArk',
    contact: 'fleet transponder, obsolete',
    name: 'Golgafrincham Ark Fleet Ship B',
    kind: 'derelict',
    shell: 'mid',
    radius: 2.2,
    scanSeconds: 6,
    salvage: 18,
    entry:
      'The B-Ark, dispatched by the planet Golgafrincham bearing its telephone sanitisers, management consultants and hairdressers, on the clear understanding that the A and C Arks would follow shortly. They did not. Golgafrincham was subsequently wiped out by a virulent disease contracted from an unsanitised telephone, and the Guide files the whole affair under "vindication, posthumous."',
    boarding: 'A committee has been formed to determine what you are. It has scheduled a first meeting.',
  },
  {
    id: 'improbShadow',
    contact: 'instrument fault, localised',
    name: 'An Improbability Shadow',
    kind: 'phenomenon',
    shell: 'far',
    radius: 3.5,
    scanSeconds: 5,
    salvage: 14,
    entry:
      'A region of space in which unlikely things have already happened and the paperwork has not caught up. Instruments inside the shadow report values that are entirely correct for somewhere else. Navigation is unaffected, provided you do not look at the navigation.',
    boarding: 'For a moment every gauge on the console reads forty-two. Then it stops, and denies it.',
  },
  {
    id: 'fjordWorkshop',
    contact: 'orbital manufactory, cold',
    name: 'Magrathean Coastline Workshop №7',
    kind: 'structure',
    shell: 'far',
    radius: 2.6,
    scanSeconds: 7,
    salvage: 24,
    entry:
      'A Magrathean fabrication floor mothballed mid-commission, its gantries still holding an unfinished coastline in a state of permanent near-completion. The fjords are of the award-winning kind. A plaque by the entrance credits the designer and notes, without further comment, that he preferred the ones with the crinkly edges.',
    boarding: 'The coastline is beautiful and unfinished. You leave it that way.',
  },
  {
    id: 'wicketGate',
    contact: 'artificial barrier, unbounded',
    name: 'The Gate at the Edge of Krikkit',
    kind: 'structure',
    shell: 'far',
    radius: 2,
    scanSeconds: 7,
    salvage: 26,
    entry:
      'A wall with a small gate in it. The wall has no ends and no thickness worth measuring, and there is nothing whatsoever on either side of it. The people it was built to contain regarded the rest of the universe as an oversight. The gate opens outward.',
    boarding: 'The gate is unlocked. This is somehow worse.',
  },
  {
    id: 'coolingArray',
    contact: 'megastructure, thermal signature',
    name: "Deep Thought's Decommissioned Cooling Array",
    kind: 'structure',
    shell: 'far',
    radius: 3.2,
    scanSeconds: 8,
    salvage: 30,
    entry:
      'Eleven kilometres of heat exchanger, built to keep a computer cool while it thought about the Ultimate Question of Life, the Universe and Everything, and decommissioned promptly upon delivery of the answer. The array is still faintly warm. Whatever it was cooling has been switched off for a very long time and has not entirely stopped.',
    boarding: 'Inside, the ducts still hum at the frequency of a very old, very slow idea.',
  },
  {
    id: 'signpost',
    contact: 'shaped metal, deliberate',
    name: 'A Signpost',
    kind: 'relic',
    shell: 'deep',
    radius: 0.8,
    scanSeconds: 4,
    salvage: 18,
    entry:
      'A signpost, planted in vacuum, pointing. There is no road. There is nothing in the direction indicated for a distance instruments decline to summarise. The lettering has weathered away entirely, which the Guide considers a mercy, since somebody would otherwise have been obliged to go there.',
    boarding: 'You sight along the arm. There is nothing there. You make a note of it anyway.',
  },
  {
    id: 'milliways',
    contact: 'lights, dressed for dinner',
    name: 'Milliways',
    kind: 'structure',
    shell: 'deep',
    radius: 2.8,
    scanSeconds: 9,
    salvage: 0,
    unreachable: true,
    entry:
      'The Restaurant at the End of the Universe: visible from every point in space and reachable from none of them, on account of being situated not elsewhere but elsewhen. Reservations are made retrospectively, after you have already dined, which is the only sensible way to run a restaurant and an absolute nightmare to audit.',
    boarding: 'Your table is not ready. It will have been.',
  },
];

export const DEEP_FIELD_BY_ID: Record<string, DeepFieldDef> = Object.fromEntries(
  DEEP_FIELD.map((d) => [d.id, d]),
);

/** Everything that can actually be boarded (Milliways, forever, cannot). */
export const DEEP_FIELD_BOARDABLE = DEEP_FIELD.filter((d) => !d.unreachable);
