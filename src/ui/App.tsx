import { Suspense, lazy, useEffect } from 'react';
import { onEffects, useGame } from '../state/store';
import { ErrorBoundary } from './ErrorBoundary';
import { Mk2Shell } from './mk2/Shell';
import { SceneOverlays } from './mk2/SceneOverlays';
import { ColdOpen, MorningCircular } from './mk2/Overlays';
import { SurveyModal } from './hud/SurveyModal';
import { FlightHUD } from './hud/FlightHUD';
import { useUiBus } from './fx/uiBus';
import { EVENT_BY_ID } from '../content/events';
import { SITUATION_BY_ID } from '../content/situations';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { RESEARCH_BY_ID } from '../content/research';
import {
  CONTRACT_TEMPLATE_META,
  FACTION_META,
  SPECIALTY_META,
  contractRewardSentence,
} from '../content/contracts';
import { format } from '../engine/num';
import * as audio from './audio/audio';
import { initAudioOnGesture } from './audio/audio';
import {
  BRAND_ASSETS,
  BUBBLE_ART,
  EVENT_ART,
  VOGON_ART,
  guideIllustration,
  researchIcon,
} from './assets';

const SceneRoot = lazy(() => import('./scene/SceneRoot'));

/** Translate sim effects into toasts, flashes, warps, and sound. */
function useEffectWiring(): void {
  const bus = useUiBus.getState();
  useEffect(() => {
    return onEffects((effects) => {
      for (const e of effects) {
        switch (e.t) {
          case 'planetComplete':
            bus.flash();
            bus.warp();
            bus.addToast({
              kind: 'info',
              kicker: 'PLANET TERRAFORMED',
              title: `${e.name} is alive`,
              body: `Completion bonus +${format(e.bonus)} TU. A new world drifts into view.`,
              ttlMs: 5200,
            });
            audio.completeSting();
            break;
          case 'systemFormed':
            bus.flash();
            bus.queueCinematic('system', e.count - 1);
            bus.addToast({
              kind: 'info',
              kicker: 'SOLAR SYSTEM FORMED',
              title: `System ${e.count} arranged tastefully`,
              body: '+15% production, per system, forever (this run).',
              ttlMs: 5600,
            });
            audio.completeSting();
            break;
          case 'galaxyFormed':
            bus.flash();
            bus.queueCinematic('galaxy', e.count - 1);
            bus.addToast({
              kind: 'info',
              kicker: 'GALAXY FORMED',
              title: `Galaxy ${e.count}. From far away, it is your signature.`,
              body: '×1.5 production. The universe files no objection.',
              ttlMs: 6400,
            });
            audio.completeSting();
            break;
          case 'achievement': {
            const def = ACHIEVEMENT_BY_ID[e.id];
            if (def) {
              bus.addToast({
                kind: 'achievement',
                kicker: 'GUIDE ENTRY ADDED',
                title: def.name,
                body: def.guide,
                art: guideIllustration(def.id),
                artAlt: `${def.name} technical plate`,
                ttlMs: 5600,
              });
              audio.achievementSting();
            }
            break;
          }
          case 'eventStart': {
            const def = EVENT_BY_ID[e.id];
            if (def) {
              bus.addToast({
                kind: 'event',
                kicker: 'IMPROBABILITY EVENT',
                title: def.name,
                body: def.text,
                art: EVENT_ART[def.id],
                artAlt: def.name,
                ttlMs: 5200,
              });
              audio.upgradeSting();
            }
            break;
          }
          case 'bubbleSpawn':
            audio.bubblePing();
            break;
          case 'bubbleCaught':
            audio.bubbleCatchSting();
            if (e.kind === 'petunias') {
              bus.addToast({
                kind: 'info',
                title: 'A bowl of petunias fell',
                body: `It thought: "Oh no, not again." +${format(e.tu)} TU.`,
                art: BUBBLE_ART.petunias,
                artAlt: 'A falling bowl of petunias',
                ttlMs: 5200,
              });
            } else if (e.kind === 'whale') {
              bus.addToast({
                kind: 'info',
                title: 'A sperm whale briefly existed',
                body: 'It was curious about everything. Science greatly advanced.',
                art: BUBBLE_ART.whale,
                artAlt: 'A curious improbable whale',
                ttlMs: 5200,
              });
            } else if (e.kind === 'gargle') {
              bus.addToast({
                kind: 'info',
                title: 'Pan Galactic Gargle Blaster',
                body: 'Your clicks now resemble being hit by a slice of lemon wrapped round a large gold brick.',
                art: BUBBLE_ART.gargle,
                artAlt: 'An improbable lemon-gold drink',
                ttlMs: 5200,
              });
            }
            break;
          case 'vogonStart':
            audio.vogonDrone();
            break;
          case 'vogonEnd':
            bus.addToast({
              kind: 'vogon',
              title: e.cleared ? 'Reading repelled' : 'The reading concludes',
              body: e.cleared
                ? 'The final couplet was never delivered. Historians are grateful.'
                : 'Production resumes. Therapy is available in the Guide.',
              art: VOGON_ART,
              artAlt: 'A blocky bureaucratic constructor fleet',
              ttlMs: 4600,
            });
            break;
          case 'researchDone': {
            const def = RESEARCH_BY_ID[e.id];
            if (def) {
              bus.addToast({
                kind: 'event',
                kicker: 'RESEARCH COMPLETE',
                title: def.name,
                body: def.guide,
                art: researchIcon(def.id),
                artAlt: `${def.name} diagram`,
                ttlMs: 5600,
              });
              audio.upgradeSting();
            }
            break;
          }
          case 'contractAccepted': {
            const active = useGame.getState().s.operations.active;
            if (active?.offer.id === e.id) {
              const template = CONTRACT_TEMPLATE_META[active.offer.templateId];
              const faction = FACTION_META[active.offer.faction];
              bus.addToast({
                kind: 'info',
                kicker: 'CONTRACT FILED',
                title: template.name,
                body: `${faction.office} acknowledged receipt. Exact progress is available in Operations.`,
                ttlMs: 4200,
              });
            }
            break;
          }
          case 'situationOpened': {
            const def = SITUATION_BY_ID[e.id];
            if (def) {
              bus.addToast({
                kind: 'info',
                kicker: 'SOMETHING WANTS AN ANSWER',
                title: def.name,
                body: e.world ? `Concerning ${e.world}.` : 'Concerning nobody in particular.',
                ttlMs: 4200,
              });
              audio.upgradeSting();
            }
            break;
          }
          case 'situationResolved': {
            // The player just made a decision — tell them what it did, rather
            // than filing it quietly on a channel they may not be reading.
            const worse = e.standing < 0;
            bus.addToast({
              kind: worse ? 'info' : 'achievement',
              kicker: worse ? 'NOTED, AND REMEMBERED' : 'SETTLED',
              title: SITUATION_BY_ID[e.id]?.name ?? 'Resolved',
              body: e.text,
              ttlMs: 7000,
            });
            if (worse) audio.upgradeSting();
            else audio.achievementSting();
            break;
          }
          case 'contractCompleted': {
            const template = CONTRACT_TEMPLATE_META[e.templateId];
            const faction = FACTION_META[e.faction];
            bus.addToast({
              kind: 'achievement',
              kicker: 'CONTRACT COMPLETE',
              title: `${template.name} approved`,
              body: `${faction.label} issued ${contractRewardSentence(e.rewardBp, e.rewardReputation)}. No additional form was required.`,
              ttlMs: 6000,
            });
            audio.achievementSting();
            break;
          }
          case 'contractFailed': {
            const template = CONTRACT_TEMPLATE_META[e.templateId];
            bus.addToast({
              kind: 'info',
              kicker: 'FILE CLOSED UNPAID',
              title: template.name,
              body: e.reason === 'deadline'
                ? 'The filing window expired. No TU, BP, or reputation was deducted.'
                : e.reason === 'abandoned'
                  ? 'The filing was withdrawn. Its progress was discarded; no TU, BP, or reputation was deducted.'
                : 'The commission was sold before completion. No TU, BP, or reputation was deducted.',
              ttlMs: 5600,
            });
            break;
          }
          case 'contractBoardRefreshed': {
            const accompaniesOutcome = effects.some(
              (effect) =>
                effect.t === 'contractCompleted'
                || effect.t === 'contractFailed'
                || effect.t === 'prestiged',
            );
            if (accompaniesOutcome) break;
            bus.addToast({
              kind: 'info',
              kicker: 'ACCEPTANCE BOARD',
              title: 'Three replacement filings posted',
              body: `Offer generation ${e.generation} is now available in Operations.`,
              ttlMs: 3600,
            });
            break;
          }
          case 'heritageDesignated': {
            const world = useGame.getState().s.run.completedPlanets.find(
              (candidate) => candidate.lifetimeIndex === e.lifetimeIndex,
            );
            bus.addToast({
              kind: 'info',
              kicker: 'HERITAGE REVIEW',
              title: world ? `${world.name} designated` : `World #${e.lifetimeIndex} designated`,
              body: 'The candidate may be changed in the Commission Atlas until the portfolio is sold.',
              ttlMs: 4600,
            });
            break;
          }
          case 'heritageArchived': {
            const world = useGame.getState().s.operations.heritageWorlds.find(
              (record) => record.lifetimeIndex === e.lifetimeIndex,
            );
            bus.addToast({
              kind: 'achievement',
              kicker: 'HERITAGE WORLD ARCHIVED',
              title: world?.name ?? `World #${e.lifetimeIndex}`,
              body: world
                ? `Its recorded ${SPECIALTY_META[world.bottleneck].label} bottleneck now grants +1% output to that aspect.`
                : 'Its recorded bottleneck now grants +1% output to that aspect.',
              ttlMs: 5600,
            });
            audio.upgradeSting();
            break;
          }
          case 'prestiged':
            bus.flash();
            bus.warp();
            bus.cancelCinematics();
            bus.setFlightMode(false); // the runabout goes back in the garage
            bus.setFocus(null);
            bus.setZoom(0);
            bus.addToast({
              kind: 'info',
              kicker: 'MAGRATHEA',
              title: `Portfolio sold. +${e.t === 'prestiged' ? e.bp : 0} Blueprints.`,
              body: 'The mice paid promptly, which worried everyone. A fresh Terra Prima awaits.',
              ttlMs: 6800,
            });
            audio.completeSting();
            break;
          default:
            break;
        }
      }
    });
    // bus methods are stable (zustand store instance)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function App() {
  useEffectWiring();
  const loadError = useGame((g) => g.loadError);
  const persistenceBlocked = useGame((g) => g.persistenceBlocked);
  const flightMode = useUiBus((b) => b.flightMode);

  useEffect(() => {
    const onFirst = () => initAudioOnGesture();
    window.addEventListener('pointerdown', onFirst, { once: true });
    return () => window.removeEventListener('pointerdown', onFirst);
  }, []);

  useEffect(() => {
    if (loadError) {
      useUiBus.getState().addToast({
        kind: 'info',
        kicker: 'DON’T PANIC',
        title: persistenceBlocked
          ? 'Save not loaded - autosave paused'
          : 'Validated backup loaded',
        body: loadError,
        ttlMs: 16_000,
      });
    }
  }, [loadError, persistenceBlocked]);

  return (
    <ErrorBoundary>
      <div className={flightMode ? 'app in-flight' : 'app'}>
        <div className="scene-layer">
          <Suspense fallback={<BootScreen />}>
            <SceneRoot />
          </Suspense>
        </div>
        {!flightMode && <Mk2Shell />}
        <SceneOverlays />
        <FlightHUD />
        <SurveyModal />
        <MorningCircular />
        {!flightMode && <ColdOpen />}
      </div>
    </ErrorBoundary>
  );
}

function BootScreen() {
  return (
    <div className="dont-panic">
      <div className="dp-inner">
        <img className="dp-art" src={BRAND_ASSETS.dontPanic} alt="" aria-hidden />
        <h1 className="sr-only">DON&rsquo;T PANIC</h1>
        <p className="dp-sub">Compiling improbability drives…</p>
        <p className="dp-tip">
          The Guide advises that a planet is best terraformed one click at a time, and that you
          are already holding the requisite finger.
        </p>
      </div>
    </div>
  );
}
