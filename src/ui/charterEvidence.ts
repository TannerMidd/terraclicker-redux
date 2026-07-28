import {
  charterOfferWeightsFor,
  systemFieldProfile,
  type SystemFieldSignal,
} from '../engine/charters';
import type { GameState } from '../engine/types';

const SIGNAL_LABEL: Record<SystemFieldSignal, string> = {
  charted: 'charted',
  stewarded: 'stewarded',
  waymarked: 'waymarked',
  prospected: 'prospected',
};

function signalEvidence(
  signal: SystemFieldSignal,
  profile: ReturnType<typeof systemFieldProfile>,
): string {
  switch (signal) {
    case 'charted':
      return `${profile.surveyedWorlds} surveys and ${profile.sampleKinds + profile.speciesKinds} catalogue records`;
    case 'stewarded':
      return `${profile.preservedSites} preserved sites, ${profile.speciesKinds} life records, and ${profile.repairs} repairs`;
    case 'waymarked':
      return `${profile.marks} field marks and ${profile.repairs} repairs`;
    case 'prospected':
      return `${profile.prospectedSites + profile.workedSites} prospected or worked sites and ${profile.sampleKinds} sample records`;
  }
}

/**
 * Player-facing evidence for why ground practice affected a Charter draw.
 * This derives from the same read-only profile and weights as offer generation,
 * so the card explains the rule instead of maintaining a second summary.
 */
export function charterGroundEvidence(
  state: GameState,
  systemIndex: number,
  charterId: string,
): { influenced: boolean; label: string; detail: string } {
  const profile = systemFieldProfile(state, systemIndex);
  const weight = charterOfferWeightsFor(state, systemIndex)
    .find((entry) => entry.id === charterId);
  const signals = weight?.fieldSignals ?? [];

  if (signals.length === 0) {
    return {
      influenced: false,
      label: 'Field influence · none',
      detail:
        'No qualifying ground signal changed this article’s offer weight; it came from system history or the neutral article pool.',
    };
  }

  return {
    influenced: true,
    label: `Field influence · ${signals.map((signal) => SIGNAL_LABEL[signal]).join(' + ')}`,
    detail: signals
      .map((signal) => `${SIGNAL_LABEL[signal]}: ${signalEvidence(signal, profile)}`)
      .join(' · '),
  };
}
