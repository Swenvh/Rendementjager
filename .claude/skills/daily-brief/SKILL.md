---
name: daily-brief
description: Use when the Rendementjager owner starts the day or asks what needs attention today (wat staat er vandaag, status, blockers).
---

# Daily brief

## Steps

1. Read-only status check (do not run the worker here): check `RJ_EMERGENCY_STOP` and whether
   the API is reachable at `http://localhost:8787` (to be verified).
2. Read pipeline state from the API (items per stage, items waiting in READY_FOR_EDITOR for G5,
   REVISION_REQUIRED, FAILED, failed jobs, cost today/month vs caps).
3. Read today's plan from the content calendar (see `content-calendar`).
4. Write `output/reports/<yyyy-mm-dd>-daily-brief.md` in Dutch:
   - **Wacht op jou** (G5 reviews with links/paths, decisions) first
   - Vandaag gepland, Geblokkeerd (with reason), Kosten (estimate or "onbekend"), Systeem.
5. Reply with the top 3 items in chat.

Agents: none by default; optionally `growth-analyst` (haiku-level summary) for yesterday's numbers.
Worker job type `daily_brief` exists in `@rj/shared`; once implemented, prefer
`npm run worker -- --once` to generate it (to be verified).

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
