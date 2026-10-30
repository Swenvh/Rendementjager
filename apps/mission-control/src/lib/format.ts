const TZ = 'Europe/Amsterdam';
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(iso)) : '—';
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeZone: TZ }).format(new Date(iso)) : '—';
/** Unknown stays unknown: null -> "geen data", never 0. */
export const eurCents = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? 'geen data' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '—');
export const num = (n: number | null | undefined) => (n === null || n === undefined ? 'geen data' : new Intl.NumberFormat('nl-NL').format(n));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? 'geen data' : new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: 1 }).format(n));
export const dur = (ms: number | null | undefined) => (ms ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : '—');
