---
name: research-topics
description: Use when Rendementjager needs new topic ideas or ResearchBriefs for planned ideas (stage IDEA to RESEARCHED).
---

# Research topics

## Steps

1. Input: list of ContentIdeas (contentIds) or a theme. Dedupe first via `@rj/research-engine`
   (content hash) and existing `content/research/`.
2. Dispatch `research-analyst` (sonnet), max 3 in parallel, one topic each, with contentId, topic
   and pointers to `docs/EDITORIAL_POLICY.md` and the approved source registry.
3. Move each item IDEA → RESEARCHING → RESEARCHED through the API (actor `research-analyst`).
4. Check G1 yourself (rj-chief-of-staff): ≥2 approved sources per key fact, clear question, not a
   duplicate, risks listed. Record G1 pass/fail via the API with reasons.
5. Report: briefs created (paths), G1 results, blocked sources.

Optional skills for the analyst: `research`, `last30days` (run its doctor; many sources blocked in
cloud), `watch` for competitor Reels.

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
