const cache = new Map<string, Intl.NumberFormat>();

function fmt(decimals: number): Intl.NumberFormat {
  const key = String(decimals);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    cache.set(key, f);
  }
  return f;
}

export interface FormatEurOptions {
  /** Fraction digits (default 0 for whole euros; use 2 for cents). */
  decimals?: number;
  /** Replace the non-breaking space Intl puts after "€" with a normal space (default false). */
  plainSpace?: boolean;
}

/**
 * nl-NL EUR formatting via Intl, e.g. 292363.15 -> "€ 292.363" (with U+00A0 after "€").
 * Negative values render as "€ -1.234" (actual Intl nl-NL output).
 */
export function formatEur(amount: number, options: FormatEurOptions = {}): string {
  if (!Number.isFinite(amount)) throw new RangeError(`formatEur: not a finite number: ${amount}`);
  const s = fmt(options.decimals ?? 0).format(amount);
  return options.plainSpace ? s.replace(/\u00a0/g, ' ') : s;
}

export function formatEurCents(cents: number, options: FormatEurOptions = {}): string {
  return formatEur(cents / 100, { decimals: 2, ...options });
}

/** nl-NL percentage, e.g. 0.07 -> "7%", 0.0225 -> "2,25%". */
export function formatPercent(rate: number, maxDecimals = 2): string {
  return new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: maxDecimals }).format(rate);
}

export function toCents(euros: number): number {
  return Math.round(euros * 100);
}
