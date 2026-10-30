import { euroToDutch, numberToDutch, parseDutchNumber } from './numbers.js';

export interface PronunciationEntry {
  /** Term as written in a script. */
  term: string;
  /** Spoken form for any provider. */
  spoken: string;
  /** Match case-sensitively (acronyms). Default false. */
  caseSensitive?: boolean;
}

/** Finance terms that TTS voices commonly mispronounce in Dutch. */
export const pronunciationDictionary: PronunciationEntry[] = [
  { term: 'ETFs', spoken: 'ee-tee-efs', caseSensitive: true },
  { term: "ETF's", spoken: 'ee-tee-efs', caseSensitive: true },
  { term: 'ETF', spoken: 'ee-tee-ef', caseSensitive: true },
  { term: 'ECB', spoken: 'ee-cee-bee', caseSensitive: true },
  { term: 'AEX', spoken: 'aa-ee-iks', caseSensitive: true },
  { term: 'S&P 500', spoken: 'es en pee vijfhonderd', caseSensitive: true },
  { term: 'FIRE', spoken: 'faijer', caseSensitive: true },
  { term: 'financial independence', spoken: 'financial independence' },
  { term: 'samengestelde rente', spoken: 'samengestelde rente' },
  { term: 'dividend', spoken: 'dividend' },
  { term: 'obligaties', spoken: 'obligaties' },
  { term: 'inflatie', spoken: 'inflatie' },
  { term: 'rendement', spoken: 'rendement' },
  { term: 'p/m', spoken: 'per maand' },
  { term: 'p/j', spoken: 'per jaar' },
  { term: 'bijv.', spoken: 'bijvoorbeeld' },
  { term: 'o.a.', spoken: 'onder andere' },
  { term: 'ca.', spoken: 'circa' },
];

export type NormalizeTarget = 'default';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function applyDictionary(text: string, target: NormalizeTarget, dict: PronunciationEntry[]): string {
  // Longest terms first so "samengestelde rente" wins over parts of it.
  const sorted = [...dict].sort((a, b) => b.term.length - a.term.length);
  let out = text;
  for (const e of sorted) {
    const spoken = e.spoken;
    const startB = /^\w/.test(e.term) ? '(?<![\\p{L}\\d])' : '';
    const endB = /\w$/.test(e.term) ? '(?![\\p{L}\\d])' : '';
    const re = new RegExp(`${startB}${escapeRe(e.term)}${endB}`, e.caseSensitive ? 'gu' : 'giu');
    out = out.replace(re, spoken);
  }
  return out;
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;
const SCALE = String.raw`(?:\s*(miljoen|miljard|duizend))?`;

/**
 * Normalize script text for speech: dictionary terms, euro amounts, percentages and numbers
 * become Dutch words. "€250" → "tweehonderdvijftig euro", "7%" → "zeven procent".
 */
export function normalizeForSpeech(
  text: string,
  target: NormalizeTarget = 'default',
  dict: PronunciationEntry[] = pronunciationDictionary,
): string {
  let out = text.normalize('NFC');
  out = out.replace(/@(\w+)/g, '$1'); // "@rendementjager" → "rendementjager"
  out = applyDictionary(out, target, dict);

  // Euro amounts: "€ 1,5 miljoen", "€250", "€292.382", "€12,50"
  out = out.replace(new RegExp(String.raw`€\s?(${NUM})${SCALE}`, 'g'), (_m, num: string, scale?: string) => {
    const value = parseDutchNumber(num);
    return scale ? `${numberToDutch(value)} ${scale} euro` : euroToDutch(value);
  });
  // "250 euro" keeps "euro"; numbers handled below.
  // Percentages: "7%", "2,5 %", "7 procent"
  out = out.replace(new RegExp(String.raw`(${NUM})\s?%`, 'g'), (_m, num: string) => `${numberToDutch(parseDutchNumber(num))} procent`);
  // Remaining numbers
  out = out.replace(new RegExp(String.raw`(?<![\p{L}])(${NUM})(?![\p{L}\d])`, 'gu'), (_m, num: string) =>
    numberToDutch(parseDutchNumber(num)),
  );
  // Tidy whitespace and symbols TTS reads literally
  out = out.replace(/[–—]/g, ', ').replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
  return out;
}
