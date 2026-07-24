import { useEffect, useRef, useState } from 'react';
import { format, is42, type Decimal } from '../engine/num';
import { useGame } from '../state/store';

/** Render a formatted number. 42 renders gold. No explanation is ever given. */
export function Num({ v, precision = 2 }: { v: Decimal | number | string; precision?: number }) {
  const s = typeof v === 'string' ? v : format(v, precision);
  return <span className={`num${is42(s) ? ' gold-42' : ''}`}>{s}</span>;
}

/**
 * A number that glides at display rate while logic runs at 4 Hz:
 * linear extrapolation from the last published value using its rate.
 */
export function useSmoothTu(): string {
  const [text, setText] = useState('0');
  const anchor = useRef({ value: 0, rate: 0, at: 0, big: '' });

  useEffect(() => {
    const sync = () => {
      const { s, d } = useGame.getState();
      const v = s.tu;
      // For very large values the float path loses meaning; fall back to 4 Hz updates.
      const n = v.toNumber();
      anchor.current = {
        value: Number.isFinite(n) && n < 1e15 ? n : NaN,
        rate: d.tuPerSec.toNumber(),
        at: performance.now(),
        big: format(v),
      };
    };
    sync();
    const unsub = useGame.subscribe(sync);

    let raf = 0;
    const frame = () => {
      const a = anchor.current;
      let next: string;
      if (Number.isNaN(a.value)) {
        next = a.big;
      } else {
        const dt = (performance.now() - a.at) / 1000;
        next = format(a.value + a.rate * Math.min(dt, 0.5));
      }
      setText((prev) => (prev === next ? prev : next));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, []);

  return text;
}
