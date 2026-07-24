import Decimal from 'break_infinity.js';

export { Decimal };

/** Construct a Decimal from anything reasonable. */
export const D = (v: number | string | Decimal): Decimal => new Decimal(v);

export const DZERO = new Decimal(0);
export const DONE = new Decimal(1);

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg',
];

/**
 * Human formatting: plain below 1000, short-scale suffixes to ~1e66,
 * scientific beyond. `precision` = significant decimals in the mantissa.
 */
export function format(value: Decimal | number, precision = 2): string {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (d.lt(0)) return '-' + format(d.neg(), precision);
  const n = d.toNumber();
  if (Number.isFinite(n) && n < 1000) {
    if (n === Math.floor(n)) return String(Math.floor(n));
    if (n < 10) return n.toFixed(precision);
    if (n < 100) return n.toFixed(1);
    return String(Math.floor(n));
  }
  const exp = Math.floor(d.log10());
  const tier = Math.floor(exp / 3);
  if (tier < SUFFIXES.length) {
    const scaled = d.div(Decimal.pow(10, tier * 3)).toNumber();
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : precision;
    return `${scaled.toFixed(digits)}${SUFFIXES[tier]}`;
  }
  const mantissa = d.div(Decimal.pow(10, exp)).toNumber();
  return `${mantissa.toFixed(precision)}e${exp}`;
}

/** Whole-number formatting with thousands separators for small values. */
export function formatInt(value: Decimal | number): string {
  const d = value instanceof Decimal ? value : new Decimal(value);
  const n = d.toNumber();
  if (Number.isFinite(n) && n < 1e6) return Math.floor(n).toLocaleString('en-US');
  return format(d, 2);
}

/** Duration like "1h 23m", "4m 20s", "12s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '∞';
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  const days = Math.floor(h / 24);
  return `${days}d ${h % 24}h`;
}

/** The number 42 renders gold, everywhere, forever. No explanation is ever given. */
export function is42(display: string): boolean {
  return display === '42' || display === '42.0' || display === '42.00';
}
