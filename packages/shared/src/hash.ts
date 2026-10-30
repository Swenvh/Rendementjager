import { createHash } from 'node:crypto';

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Normalises free text (captions, scripts) so whitespace-only edits do not change the hash. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

export function captionHash(caption: string): string {
  return sha256(normalizeText(caption));
}

const TOPIC_STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'of', 'van', 'voor', 'in', 'op', 'met', 'je', 'jij', 'jouw', 'ik',
  'wat', 'hoe', 'waarom', 'is', 'zijn', 'doet', 'over', 'aan', 'te', 'bij', 'per', 'the', 'a', 'to',
]);

/**
 * Normalises a topic for dedupe: lowercase, accents stripped, "€" -> "euro", punctuation removed,
 * Dutch/English stopwords dropped, tokens sorted (word order does not matter).
 */
export function normalizeTopic(topic: string): string {
  const tokens = topic
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/€/g, ' euro ')
    .replace(/(\d)[.,](?=\d{3}\b)/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0 && !TOPIC_STOPWORDS.has(t));
  return [...new Set(tokens)].sort().join(' ');
}

export function topicHash(topic: string): string {
  return sha256(normalizeTopic(topic));
}
