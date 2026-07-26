import { useEffect, useRef, useState } from 'react';
import { flightLive, firstSortieTargetId, restartFirstSortieFlight } from '../scene/flightControl';
import { actions, useGame } from '../../state/store';
import { waypointId } from '../../engine/waypoints';
import {
  FIRST_SORTIE,
  SORTIE_COMPLETE_TEXT,
  SORTIE_FLAG,
  SORTIE_PROGRESS_FLAG,
  type SortieStep,
} from '../../content/firstSortie';

const HOME_WAYPOINT = waypointId('home', 'planet');
const BOARD_SPEED = 4.5;

function savedStep(): number {
  const raw = Number(useGame.getState().s.flags[SORTIE_PROGRESS_FLAG] ?? 0);
  return Math.max(0, Math.min(FIRST_SORTIE.length - 1, Math.floor(raw)));
}

/** Every phase refers to the same deterministic contact. */
function satisfied(step: SortieStep, targetId: string, homeDist: number): boolean {
  const f = flightLive;
  const expedition = useGame.getState().s.expedition;
  const contact = f.contacts.find((candidate) => candidate.id === targetId);
  switch (step.goal.kind) {
    case 'moveAway':
      return homeDist >= step.goal.distance;
    case 'lockTrainingContact':
      return f.locked?.id === targetId;
    case 'scanTrainingContact':
      return expedition.discovered[targetId] !== undefined;
    case 'approachTrainingContact':
      return Boolean(contact?.inRange) && f.speed <= BOARD_SPEED;
    case 'boardTrainingContact':
      return expedition.boarded[targetId] !== undefined;
    case 'returnHome':
      return homeDist <= step.goal.within;
  }
}

export function FirstSortie({ onOpenRefit }: { onOpenRefit: () => void }) {
  const rev = useGame((game) => game.rev);
  void rev;
  const done = Boolean(useGame.getState().s.flags[SORTIE_FLAG]);
  const [index, setIndex] = useState(savedStep);
  const [finished, setFinished] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const filing = useRef(false);

  useEffect(() => {
    if (done || finished) return;
    const id = window.setInterval(() => {
      const step = FIRST_SORTIE[index];
      const targetId = firstSortieTargetId();
      if (!step || !targetId || !satisfied(step, targetId, flightLive.pos.length())) return;

      // Once resolved, the training contact becomes a real stable chart pin.
      if (step.goal.kind === 'scanTrainingContact') {
        actions.setWaypoint(waypointId('landmark', targetId));
      }
      if (step.goal.kind === 'boardTrainingContact') {
        actions.setWaypoint(HOME_WAYPOINT);
      }

      if (index + 1 < FIRST_SORTIE.length) {
        const next = index + 1;
        actions.setFlag(SORTIE_PROGRESS_FLAG, next);
        setIndex(next);
        return;
      }

      if (!filing.current) {
        filing.current = true;
        setFinished(true);
        actions.completeFirstSortie();
      }
    }, 160);
    return () => window.clearInterval(id);
  }, [done, finished, index]);

  if (dismissed || (done && !finished)) return null;

  if (finished) {
    return (
      <div className="fh-sortie complete" role="status" aria-live="polite">
        <div className="fs-kicker">induction complete</div>
        <p>{SORTIE_COMPLETE_TEXT}</p>
        <div className="fs-actions">
          <button onClick={onOpenRefit}>open refit bay</button>
          <button onClick={() => setDismissed(true)}>keep flying</button>
        </div>
      </div>
    );
  }

  const step = FIRST_SORTIE[index];
  if (!step) return null;

  return (
    <div className="fh-sortie" role="status" aria-live="polite">
      <div className="fs-kicker">
        first sortie · {index + 1} of {FIRST_SORTIE.length}
      </div>
      <p>{step.text}</p>
      <div className="fs-hint">{step.hint}</div>
      <div className="fs-actions secondary">
        <button
          onClick={() => {
            actions.setFlag(SORTIE_PROGRESS_FLAG, 0);
            setIndex(0);
            restartFirstSortieFlight();
          }}
        >
          restart
        </button>
        <button
          onClick={() => {
            actions.completeFirstSortie();
            setDismissed(true);
          }}
        >
          skip induction
        </button>
      </div>
    </div>
  );
}