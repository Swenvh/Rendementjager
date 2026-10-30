---
name: weekly-review
description: Use at the end of a Rendementjager week, or monthly for costs, to review output, gates, performance, costs and next priorities.
---

# Weekly review

## Steps

1. Gather: items moved this week per stage, gate failures and reasons, items published (owner
   confirmed), costs vs caps, failed jobs, `analyze-performance` output (run it if older than 7 days).
2. Dispatch `growth-analyst` for numbers and `content-strategist` for editorial learnings (2 agents
   in parallel, max 3).
3. Write `output/reports/<iso-week>-weekly-review.md` in Dutch: Wat is gemaakt, Wat liep vast (gate
   reasons), Wat presteerde (with n), Kosten, Systeem, Besluiten nodig, Volgende week.
4. Update `docs/ROADMAP.md` status/change log if a milestone moved.
5. Monthly mode (`mode: monthly-costs`): add month cost summary and trigger the fact-checker
   re-verification of yearly-changing figures (`workflows/recurring-jobs.yaml`).

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
