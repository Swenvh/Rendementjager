import { formatEur } from '@rj/finance-engine';
import { sha256 } from '@rj/shared';

/** JSON with sorted keys: the same value always serialises to the same bytes. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, sortKeys(x)]),
    );
  }
  return v;
}

export const hashOf = (value: unknown): string => sha256(canonical(value));

/** "€ 292.363" (NBSP) -> "€292.363". */
export function eur(v: number): string {
  return formatEur(v).replace(/€[\s ]*/, '€');
}

/** nl-NL percentage with up to 2 decimals: 0.002 -> "0,2%". */
export function pct(rate: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: 2 }).format(rate);
}

/**
 * Spoken rounding that never overstates: 292.363 -> "ruim €292.000", 161.800 -> "bijna €162.000".
 * Step: 1.000 from 20.000 up, 100 from 2.000, 10 below.
 */
export function spokenEur(v: number): string {
  const step = v >= 20_000 ? 1000 : v >= 2000 ? 100 : 10;
  const floor = Math.floor(v / step) * step;
  return v - floor < step / 2 ? `ruim ${eur(floor)}` : `bijna ${eur(floor + step)}`;
}

/** Spoken rounding candidates for a value: exact euros plus the floor/ceil used by `spokenEur`. */
export function eurRoundings(v: number): number[] {
  const step = v >= 20_000 ? 1000 : v >= 2000 ? 100 : 10;
  const floor = Math.floor(v / step) * step;
  return [Math.round(v), floor, floor + step];
}

/** Stable small integer from a string (for deterministic phrase rotation). */
export function pick(key: string, modulo: number): number {
  return parseInt(sha256(key).slice(0, 8), 16) % modulo;
}

/** Splits a hook into at most 4 short lines for the on-screen hook; highlights the line with the first amount. */
export function splitHook(text: string): { lines: string[]; highlight: number } {
  const words = text.split(/\s+/);
  for (let width = 14; width <= 60; width += 2) {
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > width) {
        lines.push(cur);
        cur = w;
      } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    if (lines.length <= 4) {
      const idx = lines.findIndex((l) => /[€%]/.test(l));
      return { lines, highlight: idx >= 0 ? idx : Math.min(1, lines.length - 1) };
    }
  }
  return { lines: [text], highlight: 0 };
}
