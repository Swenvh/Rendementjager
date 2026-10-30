import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { clipIssues, loadManifest, saveManifest, type Clip } from './manifest.js';
import { defaultRunner, ffprobeProber, type Prober, type Runner } from './media.js';

export interface PlanClip {
  id: string;
  /** Start in the source, seconds. */
  start: number;
  location: string;
  title?: string;
  /** Horizontal crop focus 0..100 (default 50 = centre). Move it away from a watermark. */
  focusX?: number;
  durationS?: number;
}

export interface PlanSource {
  /** Short id; the owner-supplied file is matched by it (`--input <id>=<file>` or `--input-dir` with <id>.mp4). */
  id: string;
  title: string;
  /** Where the owner got the video (recorded in the manifest). */
  url: string;
  /** Channel / creator. */
  author: string;
  retrievedDate: string;
  /** Always "Owner-provided": the owner supplies the file and declares the rights. */
  licence: 'Owner-provided';
  rightsNote: string;
  licenceUrl?: string;
  /** Time ranges (seconds) that must not appear in a clip: title cards, end screens, watermarks overlays. */
  avoid?: { from: number; to: number; why?: string }[];
  clips: PlanClip[];
}

export interface SlicePlan {
  /** Seconds per clip (default 10). */
  clipDurationS?: number;
  sources: PlanSource[];
}

/** Old single-source format: { source, clipDurationS, clips }. */
interface LegacyPlan extends Omit<PlanSource, 'id' | 'clips'> {}
export function normalizePlan(raw: unknown): SlicePlan {
  const r = raw as { source?: LegacyPlan; clips?: PlanClip[]; clipDurationS?: number; sources?: PlanSource[] };
  if (Array.isArray(r.sources)) return { clipDurationS: r.clipDurationS, sources: r.sources };
  if (r.source) return { clipDurationS: r.clipDurationS, sources: [{ id: 'source', ...(r.source as LegacyPlan), clips: r.clips ?? [] }] };
  return { clipDurationS: r.clipDurationS, sources: [] };
}

export function loadPlan(path: string): SlicePlan {
  const plan = normalizePlan(JSON.parse(readFileSync(path, 'utf8')));
  const issues = planIssues(plan);
  if (issues.length) throw new Error(`Plan ${path} invalid:\n- ${issues.join('\n- ')}`);
  return plan;
}

export function planIssues(plan: SlicePlan): string[] {
  const out: string[] = [];
  const d = plan.clipDurationS ?? 10;
  if (!(d >= 3 && d <= 30)) out.push('clipDurationS must be 3..30 (owner wants 8..12)');
  if (!plan.sources?.length) return [...out, 'sources missing'];
  const ids = new Set<string>();
  const srcIds = new Set<string>();
  for (const s of plan.sources) {
    const w = `source ${s?.id ?? '?'}`;
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(s.id ?? '')) out.push(`${w}: id must be a lowercase slug`);
    if (srcIds.has(s.id)) out.push(`${w}: duplicate source id`);
    srcIds.add(s.id);
    if (s.licence !== 'Owner-provided') out.push(`${w}: licence must be "Owner-provided"`);
    for (const k of ['title', 'url', 'author', 'retrievedDate', 'rightsNote'] as const) if (!String(s[k] ?? '').trim()) out.push(`${w}: ${k} missing`);
    if (!Array.isArray(s.clips) || !s.clips.length) out.push(`${w}: clips missing`);
    for (const c of s.clips ?? []) {
      if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(c.id ?? '')) out.push(`clip id "${c.id}" is not a lowercase slug`);
      if (ids.has(c.id)) out.push(`duplicate clip id ${c.id}`);
      ids.add(c.id);
      if (!(typeof c.start === 'number' && c.start >= 0)) out.push(`${c.id}: start (seconds) missing`);
      if (!String(c.location ?? '').trim()) out.push(`${c.id}: location missing`);
      const dur = c.durationS ?? d;
      for (const a of s.avoid ?? []) if (c.start < a.to && c.start + dur > a.from) out.push(`${c.id}: ${c.start}s-${c.start + dur}s overlaps the avoided range ${a.from}s-${a.to}s${a.why ? ` (${a.why})` : ''}`);
    }
  }
  return out;
}

/** ffmpeg filter: cover-scale to 1080x1920 (center crop of 16:9 by default), lanczos, 30 fps. */
export function portraitFilter(focusX = 50): string {
  const f = (focusX / 100).toFixed(3);
  return `scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920:(iw-1080)*${f}:(ih-1920)/2,fps=30,format=yuv420p,setsar=1`;
}

export function ffmpegSliceArgs(input: string, out: string, startS: number, durationS: number, focusX = 50): string[] {
  return [
    '-v', 'error', '-y', '-ss', String(startS), '-t', String(durationS), '-i', input,
    '-vf', portraitFilter(focusX),
    '-an', '-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4', out,
  ];
}

export interface SliceOptions {
  /** Owner-supplied files by source id. */
  inputs: Record<string, string>;
  plan: SlicePlan;
  root: string;
  only?: string[];
  force?: boolean;
  run?: Runner;
  probe?: Prober;
}

export interface SliceResult {
  made: string[];
  skipped: string[];
  failed: { id: string; reason: string }[];
  /** Sources in the plan for which the owner has not supplied a file (yet). */
  missingSources: { id: string; url: string }[];
}

/**
 * Cut the planned clips from owner-supplied files and register them in the manifest as Owner-provided, with the
 * source they came from. Sources are read-only; outputs are portrait 1080x1920, 30 fps, H.264, never any audio.
 * The manifest entry is only written when the finished clip passes the validator.
 */
export async function sliceClips(opts: SliceOptions): Promise<SliceResult> {
  const run = opts.run ?? defaultRunner;
  const probe = opts.probe ?? ffprobeProber(run);
  const manifest = loadManifest(opts.root);
  const res: SliceResult = { made: [], skipped: [], failed: [], missingSources: [] };
  mkdirSync(join(opts.root, 'nl'), { recursive: true });
  const wantDur = opts.plan.clipDurationS ?? 10;

  for (const s of opts.plan.sources) {
    const input = opts.inputs[s.id];
    if (!input || !existsSync(input)) {
      res.missingSources.push({ id: s.id, url: s.url });
      continue;
    }
    const src = await probe(input);
    for (const c of s.clips) {
      if (opts.only?.length && !opts.only.includes(c.id)) continue;
      const file = `nl/${c.id}.mp4`;
      const abs = join(opts.root, file);
      if (!opts.force && existsSync(abs) && manifest.clips.some((m) => m.id === c.id)) {
        res.skipped.push(c.id);
        continue;
      }
      const dur = c.durationS ?? wantDur;
      if (c.start + dur > src.durationS + 0.01) {
        res.failed.push({ id: c.id, reason: `start ${c.start}s + ${dur}s is beyond the end of ${s.id} (${src.durationS}s)` });
        continue;
      }
      const tmp = `${abs}.part.mp4`;
      try {
        mkdirSync(dirname(abs), { recursive: true });
        await run('ffmpeg', ffmpegSliceArgs(input, tmp, c.start, dur, c.focusX ?? 50));
        const out = await probe(tmp);
        if (out.hasAudio) throw new Error('output has an audio stream');
        renameSync(tmp, abs);
        const entry: Clip = {
          id: c.id,
          file,
          title: c.title ?? `${s.title} (${c.id})`,
          sourceUrl: s.url,
          author: s.author,
          licence: 'Owner-provided',
          ...(s.licenceUrl ? { licenceUrl: s.licenceUrl } : {}),
          retrievedDate: s.retrievedDate,
          location: c.location,
          durationS: out.durationS,
          width: out.width,
          height: out.height,
          ...(c.focusX !== undefined ? { focusX: c.focusX } : {}),
          provider: 'owner',
          sourceId: s.id,
          rightsNote: s.rightsNote,
          notes: `Cut by "footage slice" from source "${s.id}" at ${c.start}s (${dur}s), crop to 9:16, audio removed.`,
        };
        const issues = clipIssues(entry, { root: opts.root, checkFile: true });
        if (issues.length) throw new Error(`manifest entry invalid: ${issues.join('; ')}`);
        const idx = manifest.clips.findIndex((m) => m.id === c.id);
        if (idx >= 0) manifest.clips[idx] = entry;
        else manifest.clips.push(entry);
        res.made.push(c.id);
      } catch (e) {
        rmSync(tmp, { force: true });
        res.failed.push({ id: c.id, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  saveManifest(opts.root, manifest);
  return res;
}
