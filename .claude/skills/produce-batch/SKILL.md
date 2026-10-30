---
name: produce-batch
description: Use when the Rendementjager owner wants several Reels produced at once, for example a week's planned items.
---

# Produce batch

## Steps

1. List target items (from `plan-week` or owner list). Check caps: estimated cost × items must fit
   `RJ_DAILY_COST_CAP_EUR`; otherwise propose a smaller batch.
2. Run `produce-reel` per item as a pipeline, not all at once: **never more than 3 subagents
   running in total** across items (e.g. research for item 2 while item 1 is in fact-check).
3. Renders go through the worker queue (`npm run worker -- --once`), respecting
   `RJ_MAX_CONCURRENT_JOBS`.
4. Stop the batch on emergency stop, cap hit, or the same gate failing for the same reason on two items
   (likely a systemic issue: report it).
5. Report a table: item, stage reached, gates, flags, what waits for the owner (G5).

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
