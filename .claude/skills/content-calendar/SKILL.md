---
name: content-calendar
description: Use when the Rendementjager owner wants to see or change the content calendar, posting slots or what is planned when.
---

# Content calendar

## Steps

1. Read planned items and their stages from the API, plus the current week plan in `output/reports/`.
2. Render a Dutch calendar table (dag, tijd Europe/Amsterdam, onderwerp, template, stage, G5 status).
   Items without G5 are shown as "concept", never as "ingepland".
3. Changes requested by the owner: update planned dates on ContentIdeas via the API. Moving a date
   never changes gates.
4. Optional mirrors (only on owner request): Google Calendar or Google Sheets MCP tools, writing
   drafts/plans only.
5. Save `output/reports/<iso-week>-calendar.md`.

Method reference: `../.claude/agents/contentkalender-planner.md` (format mix), with Rendementjager
paths and rules.

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
