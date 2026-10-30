/** Dutch number-to-words for TTS. Integers up to the billions plus decimals. */

const UNITS = [
  'nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen',
  'tien', 'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien',
];
const TENS = ['', '', 'twintig', 'dertig', 'veertig', 'vijftig', 'zestig', 'zeventig', 'tachtig', 'negentig'];

function below100(n: number): string {
  if (n < 20) return UNITS[n]!;
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return TENS[t]!;
  const unit = UNITS[u]!;
  // "tweeëntwintig", "drieëndertig": trema when the unit ends in an e
  const joiner = unit.endsWith('e') ? 'ën' : 'en';
  return `${unit}${joiner}${TENS[t]}`;
}

function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h === 1 ? 'honderd' : `${UNITS[h]}honderd`;
  return rest === 0 ? head : `${head}${below100(rest)}`;
}

function below1e6(n: number): string {
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = th === 1 ? 'duizend' : `${below1000(th)}duizend`;
  return rest === 0 ? head : `${head} ${below1000(rest)}`;
}

/** Integer to Dutch words, e.g. 292382 → "tweehonderdtweeënnegentigduizend driehonderdtweeëntachtig". */
export function integerToDutch(value: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error(`Not an integer: ${value}`);
  if (value < 0) return `min ${integerToDutch(-value)}`;
  if (value < 1e6) return below1e6(value);
  const parts: string[] = [];
  let n = value;
  const billions = Math.floor(n / 1e9);
  n %= 1e9;
  const millions = Math.floor(n / 1e6);
  n %= 1e6;
  if (billions > 0) parts.push(`${below1e6(billions)} miljard`);
  if (millions > 0) parts.push(`${below1e6(millions)} miljoen`);
  if (n > 0) parts.push(below1e6(n));
  return parts.join(' ');
}

/**
 * Parse a number written in Dutch notation ("292.382", "2,5", "1.250,75") or plain ("7", "2.5" with
 * one decimal group is treated as decimal only when it is not a thousands group).
 */
export function parseDutchNumber(raw: string): number {
  const s = raw.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  throw new Error(`Cannot parse number: ${raw}`);
}

/** Number (may have decimals) to words: 2.5 → "twee komma vijf". */
export function numberToDutch(value: number): string {
  if (Number.isInteger(value)) return integerToDutch(value);
  const [intPart, decPart = ''] = String(value).split('.');
  const digits = decPart.split('').map((d) => UNITS[Number(d)]!).join(' ');
  return `${integerToDutch(Number(intPart))} komma ${digits}`;
}

/** Euro amount to words: 12.5 → "twaalf euro vijftig", 250 → "tweehonderdvijftig euro". */
export function euroToDutch(value: number): string {
  const cents = Math.round(value * 100);
  const euros = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  const head = `${integerToDutch(euros)} euro`;
  return rest === 0 ? head : `${head} ${integerToDutch(rest)}`;
}
