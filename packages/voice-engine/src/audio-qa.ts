import { probeDurationMs, run } from './ffmpeg.js';

export interface LoudnessMeasurement {
  integratedLufs: number;
  truePeakDb: number;
  lra: number;
  threshold: number;
}

export interface SilenceSpan {
  startS: number;
  endS: number;
  durationS: number;
}

export interface AudioQaReport {
  file: string;
  durationMs: number;
  targetLufs: number;
  inputLufs: number | null;
  outputLufs: number | null;
  truePeakDb: number | null;
  maxVolumeDb: number | null;
  meanVolumeDb: number | null;
  clipping: boolean;
  silences: SilenceSpan[];
  maxSilenceS: number;
  pass: boolean;
  issues: string[];
}

function parseLoudnormJson(stderr: string): LoudnessMeasurement {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('loudnorm produced no JSON');
  const j = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  return {
    integratedLufs: Number(j.input_i),
    truePeakDb: Number(j.input_tp),
    lra: Number(j.input_lra),
    threshold: Number(j.input_thresh),
  };
}

export async function measureLoudness(file: string): Promise<LoudnessMeasurement> {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
  return parseLoudnormJson(stderr);
}

/** Two-pass EBU R128 loudness normalization (default -16 LUFS, true peak -1.5 dBTP). */
export async function normalizeLoudness(input: string, output: string, targetLufs = -16): Promise<LoudnessMeasurement> {
  const m = await measureLoudness(input);
  const filter = `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:measured_I=${m.integratedLufs}:measured_TP=${m.truePeakDb}:measured_LRA=${m.lra}:measured_thresh=${m.threshold}:linear=true,aresample=48000`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-af', filter, '-ar', '48000', '-ac', '1', output]);
  return m;
}

export async function volumeStats(file: string): Promise<{ maxVolumeDb: number | null; meanVolumeDb: number | null }> {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const max = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr)?.[1];
  const mean = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr)?.[1];
  const num = (v?: string) => (v === undefined || v === '-inf' ? null : Number(v));
  return { maxVolumeDb: num(max), meanVolumeDb: num(mean) };
}

export async function detectSilences(file: string, minDurationS = 1.5, noiseDb = -45): Promise<SilenceSpan[]> {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDurationS}`, '-f', 'null', '-']);
  const spans: SilenceSpan[] = [];
  let start: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/.exec(line);
    if (e && start !== null) {
      spans.push({ startS: start, endS: Number(e[1]), durationS: Number(e[2]) });
      start = null;
    }
  }
  if (start !== null) {
    const end = (await probeDurationMs(file)) / 1000;
    spans.push({ startS: start, endS: end, durationS: Number((end - start).toFixed(3)) });
  }
  return spans;
}

export interface AudioQaOptions {
  targetLufs?: number;
  /** Loudness tolerance in LU. */
  toleranceLu?: number;
  maxSilenceS?: number;
  /** Measured input loudness, when the file is the output of normalizeLoudness. */
  inputLufs?: number | null;
}

/** QA a (normalized) audio file: loudness near target, no clipping, no silence > maxSilenceS. */
export async function audioQa(file: string, opts: AudioQaOptions = {}): Promise<AudioQaReport> {
  const targetLufs = opts.targetLufs ?? -16;
  const tol = opts.toleranceLu ?? 1.5;
  const maxSilenceS = opts.maxSilenceS ?? 1.5;
  const [loud, vol, silences, durationMs] = await Promise.all([
    measureLoudness(file).catch(() => null),
    volumeStats(file),
    detectSilences(file, maxSilenceS),
    probeDurationMs(file),
  ]);
  const issues: string[] = [];
  const outputLufs = loud && Number.isFinite(loud.integratedLufs) ? loud.integratedLufs : null;
  if (outputLufs === null) issues.push('loudness could not be measured (silent file?)');
  else if (Math.abs(outputLufs - targetLufs) > tol) issues.push(`loudness ${outputLufs} LUFS outside ${targetLufs}±${tol}`);
  const clipping = vol.maxVolumeDb !== null && vol.maxVolumeDb >= -0.1;
  if (clipping) issues.push(`clipping: max volume ${vol.maxVolumeDb} dB`);
  if (vol.maxVolumeDb === null) issues.push('audio is completely silent');
  for (const s of silences) issues.push(`silence of ${s.durationS.toFixed(2)}s at ${s.startS.toFixed(2)}s`);
  return {
    file,
    durationMs,
    targetLufs,
    inputLufs: opts.inputLufs ?? null,
    outputLufs,
    truePeakDb: loud && Number.isFinite(loud.truePeakDb) ? loud.truePeakDb : null,
    maxVolumeDb: vol.maxVolumeDb,
    meanVolumeDb: vol.meanVolumeDb,
    clipping,
    silences,
    maxSilenceS,
    pass: issues.length === 0,
    issues,
  };
}
