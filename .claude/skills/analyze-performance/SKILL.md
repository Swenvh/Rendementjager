---
name: analyze-performance
description: Use when the Rendementjager owner asks how Reels perform, what works, or wants experiments based on analytics.
---

# Analyze performance

## Steps

1. Collect: `npm run worker -- --once` for pending `collect_metrics` jobs (mock until an insights
   integration is live; to be verified). Then read `AnalyticsSnapshotSchema` records via the API.
2. Dispatch `growth-analyst` (sonnet) with the date range and pointers. It uses
   `@rj/analytics-engine`; null stays null; mock data labelled.
3. Output `output/reports/<date>-performance.md`: per item and per template/pillar/hook type, sample
   sizes, learnings, max 3 experiment proposals.
4. Summarise in chat: what to keep, stop, test.

If there is no real data yet, say so and propose how to collect it (manual entry from IG insights by
the owner, or an integration in phase 6).

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
