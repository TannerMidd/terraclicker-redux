/**
 * The Sub-Etha ticker: one quiet line that surfaces when the universe says
 * something, then gets out of the way.
 *
 * Deliberately NOT a toast — toasts announce things you did. This announces
 * things that happened near you, most of which do not concern you, which is
 * the joke. It reads the log rather than subscribing to effects, so an
 * offline burst of two hundred broadcasts surfaces exactly one line (the
 * newest) instead of two hundred.
 *
 * Phones (≤900px) suppress it in CSS: that layout already carries masthead,
 * gauges, caption, buffs, toasts and a 46vh dock sheet, and the Guide's log
 * carries the feature there instead.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../state/store';
import type { SubEthaEntry } from '../../engine/types';
import * as audio from '../audio/audio';

/** How long a line stays up before it fades. */
const HOLD_MS = 9_000;

const KIND_LABEL: Record<SubEthaEntry['kind'], string> = {
  colony: 'colonial',
  guide: 'the guide',
  vogon: 'vogon admin',
  trade: 'freight',
  hitchhiker: 'personal',
  rumour: 'unverified',
  chronicle: 'filed',
};

export function SubEthaTicker() {
  const rev = useGame((g) => g.rev);
  void rev;
  const log = useGame.getState().s.subEtha.log;
  const latest = log.length > 0 ? log[log.length - 1]! : null;

  const [shown, setShown] = useState<{ entry: SubEthaEntry; nonce: number } | null>(null);
  // Whatever was already in the log at boot is history, not news.
  const seen = useRef<number | null>(latest ? latest.id : null);
  const primed = useRef(false);
  const nonce = useRef(0);

  useEffect(() => {
    if (!latest) return;
    if (!primed.current) {
      primed.current = true;
      seen.current = latest.id;
      return;
    }
    if (seen.current === latest.id) return;
    seen.current = latest.id;
    nonce.current += 1;
    setShown({ entry: latest, nonce: nonce.current });
    audio.subEthaBlip(latest.kind === 'rumour');
  }, [latest]);

  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(null), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  const { entry } = shown;
  return (
    <div
      key={shown.nonce}
      className={`subetha-ticker se-${entry.kind}`}
      role="status"
      aria-live="polite"
    >
      <span className="se-kicker">{KIND_LABEL[entry.kind]}</span>
      <span className="se-text">{entry.text}</span>
    </div>
  );
}
