---
name: produce-reel
description: Use when the Rendementjager owner asks to make one Reel from a topic, idea or contentId, up to the point of owner review.
---

# Produce reel

Takes one item from its current stage to READY_FOR_EDITOR (waiting for owner G5). Never further.

## Steps

1. Resolve the item (contentId or create an IDEA via the API). Check emergency stop and caps.
2. If not RESEARCHED with G1: run `research-topics` for it.
3. `editorial-copywriter` (sonnet): script + caption from the brief; numbers from
   `@rj/finance-engine` only. Save in `content/scripts/<slug>.md`. Stage → SCRIPT_READY.
4. G2: `content-strategist` reviews (`review-content` logic). Fail → back to step 3 (max 2 loops).
5. G3: `financial-fact-checker` and `compliance-reviewer` in parallel (opus). Both `pass` required.
   Record both via the API. Fail → REVISION_REQUIRED → step 3 (script change invalidates G2/G3).
6. Snapshot the approved script to `content/approved/<slug>/`; stage APPROVED_FOR_PRODUCTION.
7. `creative-director`: storyboard + cover concept.
8. `audio-voice-producer`: enqueue/run `generate_audio` (`npm run worker -- --once`). Without an ElevenLabs
   opt-in the Reel is voiceless (captions only, `voice: none`); that is valid. There is no local voice.
9. `render-content` for this slug.
10. G4: `qa-reliability-engineer` runs `npm run qa -w @rj/video-engine -- output/reels/<slug>.mp4`.
11. On G4 pass: stage READY_FOR_EDITOR. Tell the owner: MP4 path, cover, caption, sha256, QA
    summary, flags (placeholder logo, voiceless, background footage credit). Owner approves G5 in Mission Control.

Concurrency: at most 3 agents at once (step 5 uses 2).

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
