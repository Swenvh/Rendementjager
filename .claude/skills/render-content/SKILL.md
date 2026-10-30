---
name: render-content
description: Use when Rendementjager items in APPROVED_FOR_PRODUCTION need rendering to MP4 and cover, or a render must be redone after a storyboard or template change.
---

# Render content

## Steps

1. Select items in APPROVED_FOR_PRODUCTION / AUDIO_GENERATING with audio ready. Refuse items below
   APPROVED_FOR_PRODUCTION.
2. Preferred: let the worker do it — enqueue `render_video` and `render_cover` jobs and run
   `npm run worker -- --once` (to be verified).
   Direct (for debugging, via `remotion-video-engineer`):
   `npm run render -w @rj/video-engine -- --content <slug>` → `output/reels/<slug>.mp4` (to be verified).
3. `sha256sum output/reels/<slug>.mp4` and record the `VideoAssetSchema` via the API.
4. Extract 3–5 frames with ffmpeg (e.g. `ffmpeg -i <mp4> -vf fps=1/3 output/reels/tmp/<slug>-%02d.png`)
   and have `creative-director` look at them.
5. Hand over to G4: `npm run qa -w @rj/video-engine -- output/reels/<slug>.mp4` via
   `qa-reliability-engineer`.

Re-render only when inputs changed. A new render after G5 produces a new hash and invalidates G5.

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
