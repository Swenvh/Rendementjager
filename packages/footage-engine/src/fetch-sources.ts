import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadManifest } from './manifest.js';
import { defaultRunner, ffprobeProber, type Prober, type Runner } from './media.js';
import { sliceClips, type PlanSource, type SlicePlan } from './slice.js';

/** Seconds downloaded before/after the planned range, so the cut can land on exact frames. */
export const SECTION_MARGIN_S = 3;
/** Best video up to 2160p, video only (audio is never downloaded; the cut also drops it). */
export const YT_FORMAT = 'bv*[height<=2160]/bv*[height<=1080]/bv*';

export type FailureKind = 'refused' | 'other';
export interface SourceFetchResult {
  made: string[];
  skipped: string[];
  failed: { id: string; kind: FailureKind; reason: string }[];
  total: number;
}

/** YouTube blocking: HTTP 403 from googlevideo, "Sign in to confirm you're not a bot", 429. */
export function isYoutubeRefusal(text: string): boolean {
  return /HTTP Error 403|\b403\b.*Forbidden|Sign in to confirm|confirm you.?re not a bot|HTTP Error 429|Too Many Requests/i.test(text);
}

export function ytDlpSectionArgs(url: string, fromS: number, toS: number, outTemplate: string): string[] {
  return [
    '--no-playlist', '--no-progress', '--js-runtimes', 'node', '--retries', '5', '--fragment-retries', '5', '--extractor-retries', '3',
    '-f', YT_FORMAT, '--download-sections', `*${fromS.toFixed(2)}-${toS.toFixed(2)}`, '--force-keyframes-at-cuts',
    '-o', outTemplate, '--', url,
  ];
}

export interface FetchSourcesOptions {
  plan: SlicePlan;
  root: string;
  only?: string[];
  force?: boolean;
  /** Runner for yt-dlp (mockable) and ffmpeg/ffprobe. */
  run?: Runner;
  probe?: Prober;
  workDir?: string;
  log?: (line: string) => void;
}

/**
 * Downloads ONLY the planned ranges of each source with yt-dlp (plus a few seconds of margin), then cuts the portrait
 * clips exactly like `slice` and registers them in the manifest. One failing clip never aborts the run.
 * UNTESTED live: YouTube is blocked in the build sandbox, tested with a mocked yt-dlp.
 */
export async function fetchSources(o: FetchSourcesOptions): Promise<SourceFetchResult> {
  const run = o.run ?? defaultRunner;
  const probe = o.probe ?? ffprobeProber(run);
  const log = o.log ?? (() => undefined);
  const work = o.workDir ?? mkdtempSync(join(tmpdir(), 'rj-ytsections-'));
  mkdirSync(work, { recursive: true });
  const have = new Set(loadManifest(o.root).clips.map((c) => c.id));
  const res: SourceFetchResult = { made: [], skipped: [], failed: [], total: 0 };
  const wantDur = o.plan.clipDurationS ?? 10;

  for (const s of o.plan.sources) {
    for (const c of s.clips) {
      if (o.only?.length && !o.only.includes(c.id)) continue;
      res.total++;
      if (!o.force && have.has(c.id)) {
        res.skipped.push(c.id);
        continue;
      }
      const dur = c.durationS ?? wantDur;
      const from = Math.max(0, c.start - SECTION_MARGIN_S);
      const offset = c.start - from;
      const stem = join(work, c.id);
      try {
        log(`${c.id}: ${from}s tot ${c.start + dur + SECTION_MARGIN_S}s ophalen`);
        await run('yt-dlp', ytDlpSectionArgs(s.url, from, c.start + dur + SECTION_MARGIN_S, `${stem}.%(ext)s`));
        const file = readdirSync(work).find((f) => f.startsWith(`${c.id}.`) && !f.endsWith('.part'));
        if (!file) throw new Error('yt-dlp produced no file');
        const single: PlanSource = { ...s, clips: [{ ...c, start: offset, durationS: dur }] };
        const r = await sliceClips({ inputs: { [s.id]: join(work, file) }, plan: { clipDurationS: wantDur, sources: [single] }, root: o.root, force: true, run, probe });
        // The cut ran on the downloaded section: restore the real start time in the manifest note.
        if (r.failed.length) throw new Error(r.failed[0]!.reason);
        res.made.push(c.id);
      } catch (e) {
        const text = e instanceof Error ? `${e.message}\n${(e as { stderr?: string }).stderr ?? ''}` : String(e);
        res.failed.push({ id: c.id, kind: isYoutubeRefusal(text) ? 'refused' : 'other', reason: text.trim().split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 300) });
      } finally {
        for (const f of readdirSync(work)) if (f.startsWith(`${c.id}.`)) rmSync(join(work, f), { force: true });
      }
    }
  }
  return res;
}

/** Dutch summary. When YouTube refuses, adds the explanation and the exact manual fallback. */
export function summarizeFetchSources(r: SourceFetchResult, planPath: string): string {
  const lines = [`${r.made.length} van ${r.total} clips gelukt${r.skipped.length ? ` (${r.skipped.length} stonden er al)` : ''}.`];
  for (const f of r.failed) lines.push(`  mislukt: ${f.id} (${f.kind === 'refused' ? 'YouTube weigert' : f.reason})`);
  if (r.failed.some((f) => f.kind === 'refused'))
    lines.push(
      '',
      'YouTube weigert het downloaden (403 of "log in om te bevestigen dat je geen bot bent"). Dat gebeurt vaak vanaf servers en cloud-omgevingen.',
      'Oplossing: download de 3 video\'s zelf op je eigen computer en zet ze in een map, bijvoorbeeld `inbox/`, met deze namen:',
      '  scenic-relaxation-nl.mp4, drone-snap-amsterdam.mp4, woerden-short.mp4',
      `Draai dan: npm run footage -- slice --plan ${planPath} --input-dir inbox`,
    );
  return lines.join('\n');
}
