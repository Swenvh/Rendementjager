import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { manifestPath } from './paths.js';

/**
 * Licence gate. Only these licences may be used for backgrounds. Anything else is refused by the
 * validator, so it can never reach a render. There is NO entry for "Standard YouTube License",
 * "all rights reserved", "unknown" or "found online".
 */
export const ALLOWED_LICENCES = ['Pexels License', 'Pixabay Content License', 'CC0', 'CC BY', 'Owner-provided'] as const;
export type Licence = (typeof ALLOWED_LICENCES)[number];

/** Official licence pages (the Pexels and Pixabay pages are the ones the providers publish). */
export const LICENCE_URLS: Record<Exclude<Licence, 'Owner-provided'>, string> = {
  'Pexels License': 'https://www.pexels.com/license/',
  'Pixabay Content License': 'https://pixabay.com/service/license-summary/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY': 'https://creativecommons.org/licenses/by/3.0/',
};

export type ClipProvider = 'pexels' | 'pixabay' | 'youtube-cc' | 'owner';

export interface Clip {
  id: string;
  /** Path relative to the footage root, always under nl/. */
  file: string;
  title: string;
  sourceUrl?: string;
  /** Creator / channel / owner. */
  author: string;
  licence: Licence;
  licenceUrl?: string;
  /** YYYY-MM-DD */
  retrievedDate: string;
  /** Where it was filmed, in words. */
  location: string;
  durationS: number;
  width: number;
  height: number;
  /** true when the licence asks for credit (CC BY: always). The credit line then goes into caption.md. */
  creditRequired?: boolean;
  /** Overrides the generated credit line. */
  creditLine?: string;
  /** Horizontal crop focus 0..100 when a landscape clip is cropped to 9:16 (default 50). */
  focusX?: number;
  provider?: ClipProvider;
  /** Which source file/video this clip was cut from (slice plan source id). */
  sourceId?: string;
  /** Owner-provided footage: the owner's own statement about the rights (not independently verified). */
  rightsNote?: string;
  notes?: string;
}

export interface Manifest {
  version: 1;
  clips: Clip[];
}

export const emptyManifest = (): Manifest => ({ version: 1, clips: [] });

export function loadManifest(root: string): Manifest {
  const p = manifestPath(root);
  if (!existsSync(p)) return emptyManifest();
  const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<Manifest>;
  if (raw.version !== 1 || !Array.isArray(raw.clips)) throw new Error(`${p}: expected { "version": 1, "clips": [...] }`);
  return { version: 1, clips: raw.clips as Clip[] };
}

export function saveManifest(root: string, m: Manifest): void {
  const p = manifestPath(root);
  mkdirSync(dirname(p), { recursive: true });
  const sorted = [...m.clips].sort((a, b) => (a.id < b.id ? -1 : 1));
  writeFileSync(p, JSON.stringify({ version: 1, clips: sorted }, null, 2) + '\n');
}

export interface ClipReport {
  id: string;
  clip: Clip;
  usable: boolean;
  issues: string[];
}

const PLACEHOLDER = /^(todo|tbd|unknown|onbekend|n\/a|na|none|\?+|-+|xxx+|lorem.*)$/i;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const EXT_RE = /\.(mp4|mov|webm)$/i;

const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && !PLACEHOLDER.test(v.trim());
const isUrl = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

function validDate(v: unknown, today: Date): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && d.getTime() <= today.getTime() + 24 * 3600_000;
}

/** Issues that make one entry unusable. Empty array = complete entry with an allowed licence. */
export function clipIssues(c: Partial<Clip> | null | undefined, opts: { root?: string; checkFile?: boolean; today?: Date } = {}): string[] {
  const issues: string[] = [];
  if (!c || typeof c !== 'object') return ['entry is not an object'];
  if (typeof c.id !== 'string' || !ID_RE.test(c.id)) issues.push('id missing or not a lowercase slug');
  if (typeof c.file !== 'string' || !c.file.trim()) issues.push('file missing');
  else if (!c.file.startsWith('nl/') || c.file.includes('..') || c.file.includes('\\') || !EXT_RE.test(c.file)) issues.push('file must be nl/<name>.mp4|mov|webm (no ..)');
  if (!text(c.title)) issues.push('title missing');
  if (!text(c.author)) issues.push('author missing');
  if (!text(c.location)) issues.push('location description missing');
  if (!validDate(c.retrievedDate, opts.today ?? new Date())) issues.push('retrievedDate missing or not a valid YYYY-MM-DD date');
  if (typeof c.durationS !== 'number' || !(c.durationS > 0)) issues.push('durationS missing');
  if (!posInt(c.width) || !posInt(c.height)) issues.push('width/height (resolution) missing');
  if (c.focusX !== undefined && !(typeof c.focusX === 'number' && c.focusX >= 0 && c.focusX <= 100)) issues.push('focusX must be 0..100');

  if (!c.licence) issues.push('licence missing');
  else if (!(ALLOWED_LICENCES as readonly string[]).includes(c.licence)) issues.push(`licence "${String(c.licence)}" is not allowed (allowed: ${ALLOWED_LICENCES.join(', ')})`);
  else if (c.licence === 'Owner-provided') {
    // Own footage: the owner is the source; URLs are optional but must be valid when present.
    if (c.sourceUrl !== undefined && !isUrl(c.sourceUrl)) issues.push('sourceUrl is not a valid https URL');
    if (c.licenceUrl !== undefined && !isUrl(c.licenceUrl)) issues.push('licenceUrl is not a valid https URL');
  } else {
    if (!isUrl(c.sourceUrl)) issues.push('sourceUrl missing or not a valid https URL');
    if (!isUrl(c.licenceUrl)) issues.push('licenceUrl missing or not a valid https URL');
    if (c.licence === 'CC BY' && c.creditRequired !== true) issues.push('CC BY requires creditRequired: true (credit line is mandatory)');
  }

  if (opts.checkFile && opts.root && typeof c.file === 'string' && !issues.some((i) => i.startsWith('file'))) {
    if (!existsSync(join(opts.root, c.file))) issues.push(`file ${c.file} not found on disk`);
  }
  return issues;
}

export interface ValidationResult {
  reports: ClipReport[];
  usable: Clip[];
  /** Video files in nl/ that have no manifest entry: they are never used. */
  orphanFiles: string[];
  ok: boolean;
}

export function validateManifest(m: Manifest, opts: { root?: string; checkFiles?: boolean; today?: Date } = {}): ValidationResult {
  const seen = new Map<string, number>();
  for (const c of m.clips) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
  const reports: ClipReport[] = m.clips.map((clip) => {
    const issues = clipIssues(clip, { root: opts.root, checkFile: opts.checkFiles, today: opts.today });
    if ((seen.get(clip.id) ?? 0) > 1) issues.push('duplicate id');
    return { id: clip?.id ?? '(no id)', clip, usable: issues.length === 0, issues };
  });
  return { reports, usable: reports.filter((r) => r.usable).map((r) => r.clip), orphanFiles: [], ok: reports.every((r) => r.usable) };
}

/** Clips that may be used for a render: complete entry, allowed licence, file on disk. Sorted by id. */
export function usableClips(root: string): Clip[] {
  return validateManifest(loadManifest(root), { root, checkFiles: true }).usable.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Throws unless this exact manifest entry is usable. Use before staging a clip into a render. */
export function assertClipUsable(c: Clip, root: string): void {
  const issues = clipIssues(c, { root, checkFile: true });
  if (issues.length) throw new Error(`Clip ${c?.id ?? '?'} refused: ${issues.join('; ')}`);
}

/** Credit line for caption.md / metadata. Always generated (also when not required) so it can be recorded. */
export function creditLineOf(c: Clip): string {
  if (c.creditLine?.trim()) return c.creditLine.trim();
  if (c.licence === 'CC BY') return `Beeld: ${c.title} van ${c.author} (CC BY)`;
  const via = c.licence === 'Pexels License' ? ' via Pexels' : c.licence === 'Pixabay Content License' ? ' via Pixabay' : '';
  return `Beeld: ${c.author}${via}`;
}

/** The line to append to caption.md, or null when the licence does not ask for credit. */
export function captionCreditLine(c: Clip): string | null {
  return c.creditRequired ? creditLineOf(c) : null;
}
