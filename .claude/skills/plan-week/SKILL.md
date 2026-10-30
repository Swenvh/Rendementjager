---
name: plan-week
description: Use when the Rendementjager owner wants next week's Reels planned or the content mix rebalanced.
---

# Plan week

## Steps

1. Gather pointers: last `weekly-review` report, latest `analyze-performance` report, open
   ContentIdeas and ResearchBriefs (API), owner priorities from chat.
2. Dispatch `content-strategist` (opus) with those pointers → week plan of `ContentIdeaSchema`
   items: pillar, template (A/B/C), hook angle, goal/hypothesis, target day.
3. If fewer than N researched topics exist, run `research-topics` for the gap (max 3 agents in parallel).
4. Save the plan as `output/reports/<iso-week>-week-plan.md`; create the ideas through the API
   (stage IDEA, actor `chief-of-staff`).
5. Show the owner the plan for confirmation; then `content-calendar` updates the calendar.

Planned ≠ approved: every item still passes G1–G5.

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
