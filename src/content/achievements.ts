import { D } from '../engine/num';
import type { Derived, GameState } from '../engine/types';

export interface AchievementDef {
  id: string;
  name: string;
  guide: string;
  hidden?: boolean;
  cond: (s: GameState, d: Derived) => boolean;
}

const tuAch = (id: string, name: string, amount: number, guide: string): AchievementDef => ({
  id,
  name,
  guide,
  cond: (s) => s.lifetime.tuEarned.gte(D(amount)),
});

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // — TU ladder —
  tuAch('tu-1', 'First Touch', 1, 'You terraformed something, slightly. The universe pretends not to notice.'),
  tuAch('tu-1k', 'Blue Dawn', 1e3, 'A thousand Terraform Units. The sky has opinions about its new color.'),
  tuAch('tu-1m', 'Oceans Forming', 1e6, 'A million TU. Somewhere, a coastline is being invented.'),
  tuAch('tu-1b', 'Biosphere Online', 1e9, 'A billion TU. The moss is ambitious now.'),
  tuAch('tu-1t', 'Planetary Concern', 1e12, 'A trillion TU. Magrathea has opened a file on you.'),
  tuAch('tu-1qa', 'Sector Notable', 1e15, 'A quadrillion TU. You are mentioned in shipping forecasts.'),
  tuAch('tu-1qi', 'Cosmic Fixture', 1e18, 'A quintillion TU. Star charts now route around your ego.'),

  // — Clicks —
  {
    id: 'click-1',
    name: 'Hands-On Management',
    guide: 'One manual terraform. Consultants charge extra for this.',
    cond: (s) => s.lifetime.clicks >= 1,
  },
  {
    id: 'click-1k',
    name: 'Calloused Thumbs',
    guide: 'A thousand manual terraforms. Your gloves have filed for hazard pay.',
    cond: (s) => s.lifetime.clicks >= 1_000,
  },
  {
    id: 'click-10k',
    name: 'Artisanal Geology',
    guide: 'Ten thousand manual terraforms. Each mountain, lovingly pressed by hand.',
    cond: (s) => s.lifetime.clicks >= 10_000,
  },

  // — Planets —
  {
    id: 'planet-1',
    name: 'One Down',
    guide: 'Your first completed planet. It is doing very well and asks after you.',
    cond: (s) => s.lifetime.planetsCompleted >= 1,
  },
  {
    id: 'planet-5',
    name: 'System Builder',
    guide: 'Five planets — a full solar system, arranged tastefully.',
    cond: (s) => s.lifetime.planetsCompleted >= 5,
  },
  {
    id: 'planet-10',
    name: 'Serial Terraformer',
    guide: 'Ten planets. At parties, you are no longer asked what you do.',
    cond: (s) => s.lifetime.planetsCompleted >= 10,
  },
  {
    id: 'planet-25',
    name: 'A Modest Portfolio',
    guide: 'Twenty-five planets. Magrathea sends a fruit basket, invoiced.',
    cond: (s) => s.lifetime.planetsCompleted >= 25,
  },
  {
    id: 'life-universe-everything',
    name: 'Life, the Universe and Everything',
    guide: 'Completed the forty-second planet. It was blue-green, familiar, and mostly harmless.',
    cond: (s) => s.lifetime.planetsCompleted >= 42,
  },
  {
    id: 'planet-100',
    name: 'Centiworld',
    guide: 'One hundred planets. You have a favorite. You deny having a favorite.',
    cond: (s) => s.lifetime.planetsCompleted >= 100,
  },

  // — Meta ladder —
  {
    id: 'first-system',
    name: 'Local Arrangement',
    guide: 'Formed a solar system. The star seems flattered.',
    cond: (s) => s.lifetime.systems >= 1,
  },
  {
    id: 'first-galaxy',
    name: 'Spiral Tendencies',
    guide: 'Formed a galaxy. From far enough away, it is your signature.',
    cond: (s) => s.lifetime.galaxies >= 1,
  },
  {
    id: 'galaxy-4',
    name: 'Halfway to Everywhere',
    guide: 'Four galaxies. The Total Perspective Vortex rates your progress "measurable".',
    cond: (s) => s.lifetime.bestGalaxies >= 4,
  },

  // — Buildings —
  {
    id: 'buildings-50',
    name: 'Infrastructure Enthusiast',
    guide: 'Fifty installations humming at once.',
    cond: (_s, d) => d.totalBuildings >= 50,
  },
  {
    id: 'buildings-200',
    name: 'Skyline Included',
    guide: 'Two hundred installations. The planet now has commute traffic.',
    cond: (_s, d) => d.totalBuildings >= 200,
  },
  {
    id: 'six-by-nine',
    name: 'Six by Nine',
    guide: 'Owned exactly 42 of one building. Something is wrong with mathematics.',
    hidden: true,
    cond: (s) => Object.values(s.buildings).some((n) => n === 42),
  },
  {
    id: 'marvin-hired',
    name: 'Genuine People Personality',
    guide: 'Employed Marvin. He estimates the work will take him 0.002 seconds of attention per year, and resents each one.',
    cond: (s) => (s.buildings['marvin'] ?? 0) >= 1,
  },

  // — Improbability —
  {
    id: 'bubble-1',
    name: 'Caught One',
    guide: 'Caught an Improbability Bubble. It felt like winning an argument with statistics.',
    cond: (s) => s.lifetime.bubblesCaught >= 1,
  },
  {
    id: 'bubble-50',
    name: 'Probability Poacher',
    guide: 'Fifty bubbles caught. Casinos three sectors away have banned you preemptively.',
    cond: (s) => s.lifetime.bubblesCaught >= 50,
  },
  {
    id: 'oh-no-not-again',
    name: 'Oh No, Not Again',
    guide: 'Caught a second bowl of petunias. You are beginning to see a pattern, and it is beginning to see you.',
    hidden: true,
    cond: (s) => s.lifetime.petuniasCaught >= 2,
  },

  // — Vogons —
  {
    id: 'resistance-is-useless',
    name: 'Resistance Is Useless',
    guide: 'Repelled an entire Vogon reading. The final couplet was never delivered. Historians are grateful.',
    cond: (s) => Boolean(s.flags['vogonCleared']),
  },
  {
    id: 'endured-poetry',
    name: 'Sat Through It',
    guide: 'Endured a full Vogon poetry reading without repelling every ship. A plaque is being engraved, slowly.',
    cond: (s) => s.lifetime.vogonReadingsEndured >= 1,
  },

  // — Research —
  {
    id: 'research-5',
    name: 'Peer Reviewed',
    guide: 'Completed five research projects. The mice are pleased with your progress.',
    cond: (s) => s.research.completed.length >= 5,
  },
  {
    id: 'the-answer-ach',
    name: 'Deep Thought Delivers',
    guide: 'After forty-two hours of computation: 42. You checked the working. The working checks out.',
    hidden: true,
    cond: (s) => s.research.completed.includes('the-answer'),
  },

  // — Prestige —
  {
    id: 'first-prestige',
    name: 'So Long, and Thanks for All the Fish',
    guide: 'Sold your first portfolio to Magrathea. The mice paid promptly, which worried everyone.',
    cond: (s) => s.lifetime.prestiges >= 1,
  },
  {
    id: 'prestige-5',
    name: 'Repeat Customer',
    guide: 'Five commissions completed. Magrathea has upgraded you from "client" to "phenomenon".',
    cond: (s) => s.lifetime.prestiges >= 5,
  },

  // — Towel —
  {
    id: 'towel',
    name: 'Knows Where Their Towel Is',
    guide: 'A towel arrives by post, pre-warmed. Offline cap +42%. You did not order a towel. You needed one.',
    hidden: true,
    cond: (s) => Boolean(s.flags['towelEarned']) || Object.keys(s.achievements).length >= 42,
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
