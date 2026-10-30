---
name: system-health
description: Use at the start of a Rendementjager session, before batch production, or when something seems broken (tests, worker, renders, integrations).
---

# System health

## Checks (run, do not assume)

1. `node -v` (>= 22.13), `ffmpeg -version`, Chromium in `/opt/pw-browsers` (cloud).
2. `npm run typecheck` and `npm run test` (to be verified; report failures with the failing package).
3. DB: file at `RJ_DB_PATH` exists; `npm run db:migrate` is up to date (to be verified).
4. API: `curl -s http://localhost:8787/...` health endpoint (name to be verified) — reachable or not.
5. Worker: failed jobs, stuck `running` jobs older than their timeout (via API/DB read).
6. Integrations: `status()` per provider → `configured: true/false`, `mode: live/mock`. Never print keys.
7. Emergency stop state; cost today/month vs caps.
8. Brand: official logo present? (`assets/brand/logo-official.svg`) — otherwise "placeholder".

Delegate to `qa-reliability-engineer` when anything fails. Output a short table (check, result,
action) and save `output/reports/<date>-system-health.md`. Update `docs/CAPABILITY_AUDIT.md` only
when a capability changed.

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
