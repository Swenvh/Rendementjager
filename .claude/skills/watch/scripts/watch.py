#!/usr/bin/env python3
"""/watch entry point: download video, extract frames, parse transcript.

Prints a markdown report to stdout listing frame paths + transcript. Claude
then Reads each frame path to see the video.
"""
from __future__ import annotations

import argparse
import math
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

from config import ConfigError, frame_cap, get_config, load_gemini_key, resolve_engine  # noqa: E402
import gemini  # noqa: E402
from download import download, fetch_captions, is_url, auth_args  # noqa: E402
from frames import MAX_FPS, auto_fps, auto_fps_focus, extract_at_timestamps, extract_keyframes, extract_scene_or_uniform, format_time, get_metadata, merge_frames, parse_time, parse_timestamps, validate_controls  # noqa: E402
from transcribe import filter_range, format_transcript, parse_vtt  # noqa: E402
from whisper import load_api_key, transcribe_video  # noqa: E402
from runtime import configure_stdio  # noqa: E402


LOCAL_ONLY_FLAGS = (("--detail", "detail"), ("--fps", "fps"), ("--max-frames", "max_frames"),
                    ("--timestamps", "timestamps"), ("--whisper", "whisper"), ("--sub-lang", "sub_lang"))
# Gemini skips or fails on long videos; past ~35 minutes it watches parts of ~25 minutes in parallel instead.
CHUNK_SECONDS = 25 * 60
MAX_PARALLEL = 4


def video_duration(source, auth, media_path=None):
    """Duration in seconds, or None when it cannot be found (then the video is sent whole)."""
    try:
        if media_path or not is_url(source):
            return get_metadata(media_path or source)["duration_seconds"]
        result = subprocess.run(["yt-dlp", "--no-playlist", "--skip-download", "--print", "duration",
                                 *auth_args(auth["cookies_file"], auth["cookies_from_browser"]), source],
                                capture_output=True, text=True, timeout=90)
        return float(result.stdout.split()[-1]) if result.returncode == 0 else None
    except (SystemExit, OSError, ValueError, IndexError, KeyError, subprocess.TimeoutExpired):
        return None


_TIME = r"\d{1,3}:\d{2}(?::\d{2})?"
_RANGE = re.compile(rf"({_TIME})\s*(?:–|—|-|to)\s*({_TIME})")


def seconds(stamp):
    total = 0
    for piece in stamp.split(":"):
        total = total * 60 + int(piece)
    return total


def check_blocks(text, start, end):
    """None when the time blocks run gap-free from start to end and the times cited in each block fall inside it."""
    body = re.split(r"(?im)^.*overview.*$", text, maxsplit=1)[-1]
    body = re.split(r"(?im)^.*action points.*$", body, maxsplit=1)[0]
    blocks, inside, outside = [], 0, 0
    for line in body.splitlines():
        bare = line.replace("*", "").strip().lstrip("#|- ")
        header = _RANGE.search(bare)
        if header and header.start() <= 12:  # A range at the start of a heading, bullet or table row opens a block.
            blocks.append((seconds(header[1]), seconds(header[2])))
            bare = bare[header.end():]
        if blocks:
            for stamp in re.findall(_TIME, bare):
                low, high = blocks[-1]
                inside, outside = (inside + 1, outside) if low - 20 <= seconds(stamp) <= high + 20 else (inside, outside + 1)
    if not blocks:
        return "no time blocks found"
    tolerance = max(45, 0.05 * ((end or blocks[-1][1]) - start))
    if blocks[0][0] > start + tolerance:
        return f"blocks start at {format_time(blocks[0][0])}, not {format_time(start)}"
    for (_, before), (after, _) in zip(blocks, blocks[1:]):
        if after - before > tolerance:
            return f"gap {format_time(before)}–{format_time(after)}"
    if end is not None and blocks[-1][1] < end - tolerance:
        return f"blocks stop at {format_time(blocks[-1][1])}, not {format_time(end)}"
    if inside + outside >= 4 and outside > 0.25 * (inside + outside):
        return f"{outside} of {inside + outside} cited times fall outside their blocks"
    return None


def plan_parts(clip, duration):
    """[clip] for a short or focused video, else consecutive equal parts covering the whole video."""
    if clip or not duration or duration <= CHUNK_SECONDS * 1.4:
        return [clip]
    count = math.ceil(duration / CHUNK_SECONDS)
    edges = [round(duration * i / count) for i in range(count + 1)]
    return [(edges[i], edges[i + 1]) for i in range(count)]


def run_gemini(args, config, key, start_sec, end_sec, auth) -> int:
    """Google watches the video. Returns None after printing an answer, else the error for the local fallback."""
    ignored = [flag for flag, name in LOCAL_ONLY_FLAGS if getattr(args, name) is not None]
    ignored += [flag for flag, on in (("--no-whisper", args.no_whisper), ("--no-dedup", args.no_dedup)) if on]
    clip = (start_sec, end_sec) if start_sec is not None or end_sec is not None else None
    uploaded, warning, results, error, sent, work, media = None, None, [], None, "URL sent to Google", None, None
    try:
        if gemini.is_youtube(args.source):
            video = {"uri": gemini.canonical_youtube(args.source)}
        else:
            parent = Path(args.out_dir).expanduser().resolve() if args.out_dir else None
            if parent:
                parent.mkdir(parents=True, exist_ok=True)
            sent = "not sent to Google"
            work = Path(tempfile.mkdtemp(prefix="watch-", dir=parent))
            print("[watch] downloading media…" if is_url(args.source) else "[watch] using local file…", file=sys.stderr)
            media = download(args.source, work / "download", **(auth if is_url(args.source) else {}))
            sent = "upload to Google failed"
            print("[watch] uploading to the Gemini Files API…", file=sys.stderr)
            uploaded = gemini.upload_file(Path(media["video_path"]), key)
            video = {"uri": uploaded["uri"], "mime_type": uploaded["mime_type"]}
            sent = "video uploaded to Google, deleted after the answer"
        length = None if clip else (video_duration(args.source, auth, media and media["video_path"])
                                    or gemini.duration(video, key, [*config["gemini_fallback_models"], config["gemini_model"]]))
        parts = plan_parts(clip, length)
        if len(parts) > 1:
            print(f"[watch] long video: asking about {len(parts)} parts of ~{CHUNK_SECONDS // 60} min in parallel…",
                  file=sys.stderr)
        print(f"[watch] asking {config['gemini_model']}…", file=sys.stderr)

        def ask_part(part, retry=True):
            """[(part, answer, failure)]; an answer whose blocks fail the check is rewatched once, in two halves."""
            try:
                result = gemini.ask(video, args.question, model=config["gemini_model"], key=key,
                                    clip=part, timeout=config["gemini_timeout"],
                                    fallback_models=config["gemini_fallback_models"])
            except SystemExit as exc:
                return [(part, None, str(exc))]
            low, high = part or (start_sec or 0, end_sec if clip else length)
            problem = check_blocks(result["text"], low, high)
            if problem and retry and high is not None and high - low >= 240:
                print(f"[watch] {format_time(low)}–{format_time(high)}: {problem}; rewatching in two halves…", file=sys.stderr)
                middle = round((low + high) / 2)
                with ThreadPoolExecutor(2) as pool:
                    halves = [entry for chunk in pool.map(lambda half: ask_part(half, False), [(low, middle), (middle, high)])
                              for entry in chunk]
                if all(answer for _, answer, _ in halves):
                    return halves
            if problem:
                result["check"] = problem
            return [(part, result, None)]

        with ThreadPoolExecutor(min(MAX_PARALLEL, len(parts))) as pool:
            results = [entry for chunk in pool.map(ask_part, parts) for entry in chunk]
        if not any(result for _, result, _ in results):
            error = "\n".join(failure for _, _, failure in results)
    except SystemExit as exc:
        error = str(exc)
    finally:
        if uploaded:
            warning = gemini.delete_file(uploaded["name"], key)
        if work:  # Run-owned; holds at most a downloaded copy. A local source file lives elsewhere.
            shutil.rmtree(work, ignore_errors=True)

    if error:
        return error + (f" Cleanup warning: {warning}" if warning else "")
    print()
    print("# watch: video report")
    print()
    print(f"- **Source:** {args.source} ({sent})")
    answered = [(part, result) for part, result, _ in results if result]
    missing = [(part, failure) for part, _, failure in results if failure]
    for part, result in answered:
        span = f"{format_time(part[0])}–{format_time(part[1])}: " if len(results) > 1 else ""
        print(f"- **Engine:** {span}{result['model']} ({result['processing']})")
    fallbacks = sum(len(result.get("fallback_notes") or []) for _, result in answered)
    if fallbacks:
        print(f"- **Earlier Gemini attempts failed:** {fallbacks} (answer came from a fallback)")
    if len(results) > 1:
        print(f"- **Parts:** {len(results)} consecutive parts covering the whole video, watched in parallel")
    for part, failure in missing:
        print(f"- **Missing part:** {format_time(part[0])}–{format_time(part[1])} ({failure.splitlines()[0]}); "
              f"rerun with `--start {format_time(part[0])} --end {format_time(part[1])}`")
    for part, result in answered:
        if result.get("check"):
            span = f"{format_time(part[0])}–{format_time(part[1])}" if part else "the answer"
            print(f"- **Block check failed:** {span}: {result['check']}; treat its block times as unverified")
    if clip:
        print(f"- **Focus range:** {format_time(start_sec or 0)} → {format_time(end_sec) if end_sec is not None else 'end'}")
    if ignored:
        print(f"- **Ignored local options:** {', '.join(ignored)} (these only apply with --engine local)")
    tokens = [result["total_tokens"] for _, result in answered if result["total_tokens"] is not None]
    if tokens:
        print(f"- **Gemini tokens:** {sum(tokens)}")
    if warning:
        print(f"- **Cleanup warning:** {warning}")
    print()
    for index, (part, result) in enumerate(answered, 1):
        print(f"## Answer (from Gemini), part {index}/{len(results)}: {format_time(part[0])}–{format_time(part[1])}"
              if len(results) > 1 else "## Answer (from Gemini)")
        print()
        if index == 1:
            print("_These are Gemini's observations of the video, not frames you viewed yourself. "
                  "Relay them as such; rerun with `--engine local` to inspect frames directly._")
            print()
        print(result["text"])
        print()
    return None


def main() -> int:
    ap = argparse.ArgumentParser(
        prog="watch",
        description="Download a video, extract auto-scaled frames, and surface the transcript.",
    )
    ap.add_argument("source", help="Video URL or local file path")
    ap.add_argument("--max-frames", type=int, default=None, help="Override frame cap")
    ap.add_argument("--resolution", type=int, default=512, help="Frame width in pixels (default 512)")
    ap.add_argument("--fps", type=float, default=None, help="Override auto-fps")
    ap.add_argument(
        "--detail",
        choices=["transcript", "efficient", "balanced", "token-burner"],
        default=None,
        help="Fidelity/speed dial: transcript (no frames), efficient (fast keyframes, cap 50), "
             "balanced (scene, cap 100), token-burner (scene, uncapped).",
    )
    ap.add_argument(
        "--timestamps",
        type=str,
        default=None,
        help="Comma-separated absolute timestamps (SS, MM:SS, HH:MM:SS) to grab a frame at, "
             "e.g. transcript-flagged 'look here' moments. Added on top of the detail frames "
             "(reserved against the cap); with --detail transcript these become the only frames.",
    )
    ap.add_argument("--start", type=str, default=None, help="Range start (SS, MM:SS, or HH:MM:SS)")
    ap.add_argument("--end", type=str, default=None, help="Range end (SS, MM:SS, or HH:MM:SS)")
    ap.add_argument("--out-dir", type=str, default=None, help="Working directory (default: tmp)")
    ap.add_argument(
        "--no-whisper",
        action="store_true",
        help="Disable all local/cloud transcription fallbacks; native captions still work.",
    )
    ap.add_argument(
        "--whisper",
        choices=["groq", "openai", "whisperx"],
        default=None,
        help="Select the fallback backend for this run; native captions still come first.",
    )
    ap.add_argument(
        "--no-dedup",
        action="store_true",
        help="Disable near-duplicate frame removal. Keeps visually identical "
             "frames (static screen recordings, held slides) instead of collapsing them.",
    )
    ap.add_argument("--sub-lang", default=None, help="Exact caption language preference (default auto/native)")
    cookies = ap.add_mutually_exclusive_group()
    cookies.add_argument("--cookies", default=None, help="Explicit cookie file (yt-dlp may update this jar)")
    cookies.add_argument("--cookies-from-browser", default=None, help="Explicit yt-dlp browser selector")
    ap.add_argument("--engine", choices=["auto", "gemini", "local"], default=None,
                    help="gemini: Google watches the video and answers (needs GEMINI_API_KEY). "
                         "local: frames + transcript on this machine. Default auto: gemini when a key exists.")
    ap.add_argument("--question", default=None,
                    help="The user's question. Sent to Gemini on a gemini run; unused by the local engine.")
    args = ap.parse_args()
    if args.no_whisper and args.whisper:
        ap.error("--no-whisper conflicts with --whisper")

    config = get_config(backend_override="none" if args.no_whisper else args.whisper)
    detail = args.detail or config["detail"]
    max_frames = args.max_frames if args.max_frames is not None else frame_cap(detail)
    budget_cap = max_frames if max_frames is not None else 100
    start_sec, end_sec = parse_time(args.start), parse_time(args.end)
    validate_controls(args.resolution, max_frames, start_sec, end_sec, args.fps)
    cue_timestamps = parse_timestamps(args.timestamps)
    backend_choice = "none" if args.no_whisper else args.whisper or config["whisper_backend"]
    cookies_file = args.cookies if args.cookies is not None else (None if args.cookies_from_browser else config["cookies_file"])
    cookies_browser = args.cookies_from_browser if args.cookies_from_browser is not None else (None if args.cookies else config["cookies_from_browser"])
    auth_args(cookies_file, cookies_browser)  # Validate even before starting network work.
    auth = {"cookies_file": cookies_file, "cookies_from_browser": cookies_browser}

    gemini_key = load_gemini_key()
    gemini_error = None
    if resolve_engine(args.engine or config["engine"], bool(gemini_key)) == "gemini":
        gemini_error = run_gemini(args, config, gemini_key, start_sec, end_sec, auth)
        if gemini_error is None:
            return 0
        # Never end on a bare error: fall back to frames + transcript on this machine.
        print(f"[watch] {gemini_error}\n[watch] Gemini failed; falling back to the local engine…", file=sys.stderr)

    parent = Path(args.out_dir).expanduser().resolve() if args.out_dir else None
    if parent:
        parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="watch-", dir=parent))
    print(f"[watch] working dir: {work}", file=sys.stderr)
    url_source = is_url(args.source)
    dl = {"subtitle_path": None, "info": {}, "downloaded": False}
    errors = [f"{gemini_error} Fell back to the local engine."] if gemini_error else []
    all_segments = []
    track_available = False
    transcript_source = None
    video_path = None
    visual_error = None
    gaps = []

    if url_source:
        print("[watch] checking metadata/captions via yt-dlp…", file=sys.stderr)
        dl = fetch_captions(args.source, work / "download", sub_lang=args.sub_lang or config["sub_lang"], **auth)
        errors.extend(dl.get("errors", []))
        if dl.get("subtitle_path"):
            try:
                all_segments = parse_vtt(dl["subtitle_path"])
                track_available = bool(all_segments)
                track = dl.get("caption_track") or {}
                transcript_source = (f"captions ({track.get('language', 'unknown')}, "
                                     f"{track.get('kind', 'unknown')}, {track.get('provenance', 'unknown')})")
            except (OSError, ValueError) as exc:
                errors.append(f"Caption parsing failed: {exc}")

    audio_only = detail == "transcript" and not cue_timestamps
    # Captions are assessed before range filtering: a quiet interval is not a missing track.
    need_media = not (audio_only and (track_available or backend_choice == "none") and url_source)
    if need_media:
        try:
            print("[watch] downloading media…" if url_source else "[watch] using local file…", file=sys.stderr)
            media = download(args.source, work / "download", audio_only=audio_only,
                             **({"context": dl, **auth} if url_source else {}))
            dl.update(media)
            video_path = dl["video_path"]
        except SystemExit as exc:
            visual_error = f"Media unavailable: {exc}"
            errors.append(visual_error)

    try:
        duration = float((dl.get("info") or {}).get("duration") or 0)
        if not math.isfinite(duration) or duration < 0:
            duration = 0.0
    except (TypeError, ValueError):
        duration = 0.0
    meta = {"duration_seconds": duration, "width": None, "height": None, "codec": None,
            "has_audio": False, "has_video": False}
    if video_path:
        try:
            meta = get_metadata(video_path)
        except SystemExit as exc:
            visual_error = f"Visuals/audio metadata unavailable: {exc}"
            errors.append(visual_error)
    full_duration = meta["duration_seconds"]
    if full_duration > 0 and start_sec is not None and start_sec >= full_duration:
        raise SystemExit(f"--start {start_sec:.1f}s is past end of video ({full_duration:.1f}s)")
    effective_start = start_sec or 0.0
    effective_end = min(end_sec, full_duration) if end_sec is not None and full_duration > 0 else end_sec or full_duration
    effective_duration = max(0.0, effective_end - effective_start)
    focused = start_sec is not None or end_sec is not None
    if focused:
        fps, target = auto_fps_focus(effective_duration, max_frames=budget_cap)
    else:
        fps, target = auto_fps(effective_duration, max_frames=budget_cap)
    if args.fps is not None:
        fps = min(args.fps, MAX_FPS)
        target = max(1, int(round(fps * effective_duration)))

    frames, cue_frames = [], []
    frame_meta = {"engine": "none", "candidate_count": 0, "selected_count": 0, "fallback": False}
    cue_meta = {}
    detail_budget = max_frames
    if video_path and meta.get("has_video", bool(meta.get("width"))):
        try:
            if cue_timestamps:
                cue_frames, cue_meta = extract_at_timestamps(
                    video_path, work / "frames", cue_timestamps, resolution=args.resolution,
                    max_frames=max_frames, start_seconds=start_sec, end_seconds=effective_end or end_sec)
            detail_budget = None if max_frames is None else max_frames - len(cue_frames)
            if detail != "transcript" and detail_budget != 0:
                kwargs = dict(resolution=args.resolution, max_frames=detail_budget,
                              start_seconds=start_sec, end_seconds=effective_end or end_sec, dedup=not args.no_dedup)
                if detail == "efficient":
                    frames, frame_meta = extract_keyframes(video_path, work / "frames", **kwargs)
                else:
                    frames, frame_meta = extract_scene_or_uniform(video_path, work / "frames", fps=fps, target_frames=target, **kwargs)
        except SystemExit as exc:
            visual_error = f"Visual extraction unavailable: {exc}"
            errors.append(visual_error)
    elif video_path and not visual_error and (detail != "transcript" or cue_timestamps):
        visual_error = "No video stream; visual evidence is unavailable."
    if cue_frames:
        frames = merge_frames(frames, cue_frames)

    transcript_state = "missing"
    if not track_available and backend_choice != "none" and video_path and meta.get("has_audio"):
        backend, api_key = ("whisperx", None) if backend_choice == "whisperx" else load_api_key(None if backend_choice == "auto" else backend_choice)
        if backend:
            try:
                all_segments, used_backend = transcribe_video(video_path, work / "audio.mp3", backend=backend, api_key=api_key)
                gaps = getattr(all_segments, "gaps", [])
                track_available = True
                transcript_state = "no speech" if not all_segments else "available"
                if used_backend == "whisperx":
                    language = config["whisperx_language"] or "auto (unverified)"
                    transcript_source = f"whisper (whisperx {config['whisperx_model']}, language {language})"
                else:
                    transcript_source = f"whisper ({used_backend})"
            except SystemExit as exc:
                transcript_state = "failed"
                errors.append(f"Transcription failed: {exc}")
        else:
            transcript_state = f"unavailable: no matching API key for {backend_choice}"
    elif not track_available and backend_choice == "none":
        transcript_state = "fallback disabled; no captions available"
    elif not track_available and video_path and not meta.get("has_audio"):
        transcript_state = "no audio stream" if not visual_error else "audio metadata unavailable"

    transcript_segments = filter_range(all_segments, start_sec, end_sec) if focused else all_segments
    transcript_text = format_transcript(transcript_segments)
    if track_available:
        transcript_state = "available" if transcript_segments else ("no speech in selected range" if focused and all_segments else "no speech")
    for error in errors:
        print(f"[watch] {error}", file=sys.stderr)

    info = dl.get("info") or {}

    print()
    print("# watch: video report")
    print()
    print(f"- **Source:** {args.source}")
    if video_path:
        print(f"- **Local media:** `{video_path}`")
    if visual_error:
        print(f"- **Visual status:** {visual_error}")
    if errors:
        print("- **Result:** partial evidence" if frames or transcript_segments else "- **Result:** unavailable evidence")
    if info.get("title"):
        print(f"- **Title:** {info['title']}")
    if info.get("uploader"):
        print(f"- **Uploader:** {info['uploader']}")
    print(f"- **Duration:** {format_time(full_duration)} ({full_duration:.1f}s)")
    if focused:
        print(
            f"- **Focus range:** {format_time(effective_start)} → {format_time(effective_end)} "
            f"({effective_duration:.1f}s)"
        )
    if meta.get("width") and meta.get("height"):
        print(f"- **Resolution:** {meta['width']}x{meta['height']} ({meta.get('codec') or 'unknown codec'})")
    range_mode = "focused" if focused else "full"
    print(f"- **Detail:** {detail}")
    detail_count = frame_meta.get("selected_count", 0)
    if detail != "transcript":
        cap_label = "unlimited" if detail_budget is None else str(detail_budget)
        engine = frame_meta.get("engine", "scene")
        fallback = " fallback" if frame_meta.get("fallback") else ""
        deduped = frame_meta.get("deduped_count", 0)
        dedup_note = f", {deduped} near-duplicate{'s' if deduped != 1 else ''} dropped" if deduped else ""
        print(
            f"- **Frames:** {detail_count} selected from {frame_meta.get('candidate_count', detail_count)} "
            f"candidates ({engine}{fallback}{dedup_note}, {range_mode} range, budget {target}, cap {cap_label})"
        )
    elif not cue_frames:
        print("- **Frames:** skipped (transcript detail)")
    if cue_frames:
        dropped = cue_meta.get("dropped_out_of_window", 0)
        drop_note = f", {dropped} dropped outside range" if dropped else ""
        print(
            f"- **Cue frames:** {len(cue_frames)} at transcript-flagged timestamps "
            f"(transcript-cue{drop_note})"
        )
    if frames:
        print(f"- **Frame size:** max {args.resolution}px wide, max 1998px tall")
    if transcript_segments:
        in_range = " in range" if focused else ""
        print(
            f"- **Transcript:** {len(transcript_segments)} segments{in_range} "
            f"(via {transcript_source or 'captions'})"
        )
    else:
        print(f"- **Transcript:** {transcript_state}")
    if gaps:
        print("- **Transcript status:** partial; missing intervals:")
        for gap in gaps:
            end = gap["end"] if gap["end"] is not None else full_duration
            print(f"  - {format_time(gap['start'])} → {format_time(end)}")

    if detail == "token-burner" and len(frames) > 250:
        print()
        print(
            f"> **Warning:** token-burner detail selected {len(frames)} frames. "
            "This may use a large number of image tokens."
        )

    if not focused and full_duration > 600 and detail not in ("transcript", "token-burner"):
        mins = int(full_duration // 60)
        print()
        print(
            f"> **Warning:** This is a {mins}-minute video. Frame coverage is sparse at this length "
            f"under `{detail}` detail — its cap spreads thin across the full clip. For better results, "
            "re-run with `--start HH:MM:SS --end HH:MM:SS` to zoom into a section, or use "
            "`--detail token-burner` to keep every scene-change frame across the whole video."
        )

    print()
    print("## Frames")
    print()
    if frames:
        print(f"Frames live at: `{work / 'frames'}`")
        print()
        print(
            "**Read each frame path below with the Read tool to view the image.** "
            "Frames are in chronological order; `t=MM:SS` is the absolute timestamp in the source video."
        )
        print()
        for frame in frames:
            print(
                f"- `{frame['path']}` "
                f"(t={format_time(frame['timestamp_seconds'])}, reason={frame.get('reason', 'selected')})"
            )
    else:
        print("_No frames extracted._")

    print()
    print("## Transcript")
    print()
    if transcript_text:
        label = transcript_source or "captions"
        if focused:
            print(f"_Source: {label}. Filtered to {format_time(effective_start)} → {format_time(effective_end)}:_")
        else:
            print(f"_Source: {label}._")
        print()
        print("```")
        print(transcript_text)
        print("```")
    else:
        print(f"_{transcript_state.capitalize()}._")
        if detail == "transcript" and not track_available:
            print("_Re-run with `--detail balanced` for visual evidence, or configure a transcription backend with setup.py._")
    if errors:
        print()
        print("## Unavailable evidence")
        for error in errors:
            print(f"- {error}")

    print()
    print("---")
    print(f"_Work dir: `{work}` — delete when done._")

    return 1 if errors and not frames and not transcript_segments and not track_available else 0


if __name__ == "__main__":
    configure_stdio()
    try:
        raise SystemExit(main())
    except (ConfigError, OSError) as exc:
        raise SystemExit(str(exc)) from None
