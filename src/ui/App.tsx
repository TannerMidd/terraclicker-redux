import { Suspense, lazy, useEffect } from 'react';
import { onEffects, useGame } from '../state/store';
import { ErrorBoundary } from './ErrorBoundary';
import { HUD } from './hud/HUD';
import { Dock } from './panels/Dock';
import { OfflineModal } from './hud/OfflineModal';
import { SurveyModal } from './hud/SurveyModal';
import { useUiBus } from './fx/uiBus';
import { EVENT_BY_ID } from '../content/events';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { RESEARCH_BY_ID } from '../content/research';
import { format } from '../engine/num';
import * as audio from './audio/audio';
import { initAudioOnGesture } from './audio/audio';

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
                title: `${def.emoji} ${def.name}`,
                body: def.text,
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
                ttlMs: 5200,
              });
            } else if (e.kind === 'whale') {
              bus.addToast({
                kind: 'info',
                title: 'A sperm whale briefly existed',
                body: 'It was curious about everything. Science greatly advanced.',
                ttlMs: 5200,
              });
            } else if (e.kind === 'gargle') {
              bus.addToast({
                kind: 'info',
                title: 'Pan Galactic Gargle Blaster',
                body: 'Your clicks now resemble being hit by a slice of lemon wrapped round a large gold brick.',
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
                ttlMs: 5600,
              });
              audio.upgradeSting();
            }
            break;
          }
          case 'prestiged':
            bus.flash();
            bus.warp();
            bus.cancelCinematics();
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
        title: 'Save recovery',
        body: `(${loadError}) — the Guide kept a copy, as the Guide does.`,
        ttlMs: 8000,
      });
    }
  }, [loadError]);

  return (
    <ErrorBoundary>
      <div className="app">
        <div className="scene-layer">
          <Suspense fallback={<BootScreen />}>
            <SceneRoot />
          </Suspense>
        </div>
        <HUD />
        <Dock />
        <SurveyModal />
        <OfflineModal />
      </div>
    </ErrorBoundary>
  );
}

function BootScreen() {
  return (
    <div className="dont-panic">
      <div className="dp-inner">
        <h1>DON&rsquo;T PANIC</h1>
        <p className="dp-sub">Compiling improbability drives…</p>
        <p className="dp-tip">
          The Guide advises that a planet is best terraformed one click at a time, and that you
          are already holding the requisite finger.
        </p>
      </div>
    </div>
  );
}
