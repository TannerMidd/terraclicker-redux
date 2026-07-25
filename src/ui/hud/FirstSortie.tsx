import { useEffect, useRef, useState } from 'react';
import { flightLive } from '../scene/flightControl';
import { actions, useGame } from '../../state/store';
import {
  FIRST_SORTIE,
  SORTIE_COMPLETE_TEXT,
  SORTIE_FLAG,
  type SortieStep,
} from '../../content/firstSortie';

/**
 * The induction. Runs once, the first time anybody takes the helm, and never
 * again unless the flag is cleared.
 *
 * Progress is checked against live flight state on a slow interval rather than
 * every frame: these are all "have you got there yet" questions and five times
 * a second is more than enough to feel immediate. Nothing here blocks input,
 * traps the camera, or refuses to let the player leave — the sortie is
 * abandoned by flying away from it, and abandoning it costs nothing.
 */
function satisfied(step: SortieStep, pinned: string | null, homeDist: number): boolean {
  const f = flightLive;
  switch (step.goal.kind) {
    case 'moveAway':
      return homeDist >= step.goal.distance;
    case 'pinAnything':
      return pinned !== null;
    case 'approachPin':
      return f.nav !== null && f.nav.distance <= step.goal.within;
    case 'scanAnything':
      return f.contacts.some((c) => c.scanned);
    case 'returnHome':
      return homeDist <= step.goal.within;
  }
}

export function FirstSortie() {
  const rev = useGame((g) => g.rev);
  void rev;
  const done = Boolean(useGame.getState().s.flags[SORTIE_FLAG]);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const filed = useRef(false);

  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => {
      const step = FIRST_SORTIE[index];
      if (!step) return;
      const pinned = useGame.getState().s.expedition.pinned;
      const homeDist = flightLive.pos.length();
      if (!satisfied(step, pinned, homeDist)) return;

      if (index + 1 < FIRST_SORTIE.length) {
        setIndex(index + 1);
        return;
      }
      setFinished(true);
      // The flag is set once. A second interval tick must not re-file it.
      if (!filed.current) {
        filed.current = true;
        actions.setFlag(SORTIE_FLAG, 1);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [index, done]);

  if (done) return null;

  if (finished) {
    return (
      <div className="fh-sortie complete" role="status">
        <div className="fs-kicker">induction complete</div>
        <p>{SORTIE_COMPLETE_TEXT}</p>
      </div>
    );
  }

  const step = FIRST_SORTIE[index];
  if (!step) return null;

  return (
    <div className="fh-sortie" role="status">
      <div className="fs-kicker">
        first sortie · {index + 1} of {FIRST_SORTIE.length}
      </div>
      <p>{step.text}</p>
      <div className="fs-hint">{step.hint}</div>
    </div>
  );
}
