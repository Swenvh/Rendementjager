// nl-NL formatting used on screen. Values come from props (finance engine output), never typed by hand.
const eur0 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const num0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });

export const formatEuroCents = (cents: number): string => eur0.format(Math.round(cents / 100));
export const formatEuro = (euros: number): string => eur0.format(Math.round(euros));
export const formatNumber = (n: number): string => num0.format(n);
export const formatPct = (pct: number): string => `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(pct)}%`;
/** Axis label: €100.000 → "€ 100k" style is not Dutch; use "€ 100.000" without decimals. */
export const formatAxisEuro = (euros: number): string => formatEuro(euros);
export const formatDateNl = (iso: string): string =>
  new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));
