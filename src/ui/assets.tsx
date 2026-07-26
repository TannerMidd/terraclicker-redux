import type { CSSProperties } from 'react';
import type { AspectId, BubbleKind } from '../engine/types';

const asset = (relative: string): string => `${import.meta.env.BASE_URL}assets/${relative}`;

export const BRAND_ASSETS = {
  wordmark: asset('brand/terraclicker-wordmark.svg'),
  dontPanic: asset('brand/dont-panic.svg'),
} as const;

export const COCKPIT_ASSETS = {
  fascia: asset('cockpit/console-fascia.webp'),
} as const;

export const TEXTURE_ASSETS = {
  lensDirt: asset('textures/lens-dirt.webp'),
} as const;

const sprite = (relative: string): string => asset(`sprites/${relative}`);

/** In-scene billboard art (SPRITE_MANIFEST.md). Loaded via sceneTex(), never useLoader. */
export const SCENE_SPRITES = {
  installation: (id: string) => sprite(`installations/${id}.webp`),
  installationLab2: sprite('installations/researchLab-2.webp'),
  heartOfGoldTeapot: sprite('installations/heartOfGold-teapot.webp'),
  traffic: {
    hauler: sprite('traffic/hauler.webp'),
    tanker: sprite('traffic/tanker.webp'),
    courier: sprite('traffic/courier.webp'),
    liner: sprite('traffic/liner.webp'),
    tug: sprite('traffic/tug.webp'),
    surveyor: sprite('traffic/surveyor.webp'),
  },
  vogon: {
    constructor: sprite('vogon/constructor.webp'),
    escort: sprite('vogon/escort.webp'),
  },
  bubble: {
    whale: sprite('bubbles/whale-core.webp'),
    petunias: sprite('bubbles/petunias-core.webp'),
    gargle: sprite('bubbles/gargle-core.webp'),
    golden: sprite('bubbles/golden-core.webp'),
  },
  event: {
    comet: sprite('events/comet.webp'),
    meteor: sprite('events/meteor.webp'),
    spaceWhale: sprite('events/space-whale.webp'),
    flareArc: sprite('events/flare-arc.webp'),
    probabilityShard: sprite('events/probability-shard.webp'),
  },
  fx: {
    glowSoft: sprite('fx/glow-soft.webp'),
    shockwaveRing: sprite('fx/shockwave-ring.webp'),
    sparkStreak: sprite('fx/spark-streak.webp'),
    auroraRibbon: sprite('fx/aurora-ribbon.webp'),
    starCorona: sprite('fx/star-corona.webp'),
  },
  misc: {
    petAsteroid: sprite('misc/pet-asteroid.webp'),
    wreckSatellite: sprite('misc/wreck-satellite.webp'),
  },
} as const;

export function buildingIcon(id: string): string {
  return asset(`icons/buildings/${id}.svg`);
}

export function researchIcon(id: string): string {
  return asset(`icons/research/${id}.svg`);
}

const CLICK_UPGRADE_IDS = new Set([
  'terraforming-gloves',
  'reinforced-gauntlets',
  'hydraulic-servos',
  'neural-lace',
  'stellar-conductor',
  'electronic-thumb',
  'improbable-digits',
]);

export function upgradeIcon(id: string): string {
  if (CLICK_UPGRADE_IDS.has(id)) return asset(`icons/upgrades/${id}.svg`);
  if (id.startsWith('milestone-')) return asset('icons/upgrades/milestone.svg');
  if (id.startsWith('syn-')) return asset('icons/upgrades/synergy.svg');

  const efficiency = /^(.+)-eff-\d+$/.exec(id);
  if (efficiency) return buildingIcon(efficiency[1]!);
  return asset('icons/upgrades/milestone.svg');
}

export function aspectIcon(id: AspectId): string {
  return asset(`icons/aspects/${id}.svg`);
}

export function AspectGlyph({
  aspect,
  label,
  className = '',
}: {
  aspect: AspectId;
  label?: string;
  className?: string;
}) {
  const style = {
    // Absolute URL: this var is consumed by a mask in the stylesheet, and
    // relative url()s in custom properties resolve against the stylesheet's
    // own location in production builds (/assets/…), not the document.
    '--aspect-glyph': `url("${new URL(aspectIcon(aspect), document.baseURI).href}")`,
  } as CSSProperties;
  return (
    <span
      className={`aspect-glyph ${className}`.trim()}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export const EVENT_ART: Record<string, string> = {
  'solar-flare': asset('illustrations/events/solar-flare.webp'),
  'comet-delivery': asset('illustrations/events/comet-delivery.webp'),
  'aurora-storm': asset('illustrations/events/aurora-storm.webp'),
  'meteor-shower': asset('illustrations/events/meteor-shower.webp'),
  'whale-migration': asset('illustrations/events/whale-migration.webp'),
  'probability-squall': asset('illustrations/events/probability-squall.webp'),
};

export const BUBBLE_ART: Partial<Record<BubbleKind, string>> = {
  whale: asset('illustrations/events/bubble-whale.webp'),
  petunias: asset('illustrations/events/bubble-petunias.webp'),
  gargle: asset('illustrations/events/bubble-gargle.webp'),
};

export const VOGON_ART = asset('illustrations/events/vogon-reading.webp');

const GUIDE_GROUPS: Record<string, string> = {
  'tu-1': 'first-contact',
  'tu-1k': 'blue-dawn',
  'tu-1m': 'ocean-invention',
  'tu-1b': 'biosphere-online',
  'tu-1t': 'planetary-portfolio',
  'tu-1qa': 'planetary-portfolio',
  'tu-1qi': 'planetary-portfolio',
  'click-1': 'manual-terraforming',
  'click-1k': 'manual-terraforming',
  'click-10k': 'manual-terraforming',
  'planet-1': 'first-world',
  'planet-5': 'system-builder',
  'planet-10': 'planet-series',
  'planet-25': 'planet-series',
  'life-universe-everything': 'earth-42',
  'planet-100': 'planet-series',
  'first-system': 'system-builder',
  'first-galaxy': 'galaxy-formation',
  'galaxy-4': 'galaxy-formation',
  'buildings-50': 'infrastructure',
  'buildings-200': 'infrastructure',
  'six-by-nine': 'six-by-nine',
  'marvin-hired': 'marvin',
  'bubble-1': 'bubbles',
  'bubble-50': 'bubbles',
  'oh-no-not-again': 'petunias',
  'resistance-is-useless': 'vogon',
  'endured-poetry': 'vogon',
  'research-5': 'research',
  'the-answer-ach': 'research',
  'first-prestige': 'magrathea',
  'prestige-5': 'magrathea',
  towel: 'towel',
};

export function guideIllustration(achievementId: string): string {
  return asset(`illustrations/guide/${GUIDE_GROUPS[achievementId] ?? 'first-contact'}.webp`);
}
