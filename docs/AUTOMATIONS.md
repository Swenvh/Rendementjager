# Automations

**Status: designed, not activated.** No cron entry, Claude Code scheduled task or GitHub Action
exists for Rendementjager. Nothing paid and nothing that publishes is activated. Definitions:
`workflows/recurring-jobs.yaml` (schedules) and `workflows/editorial-workflow.yaml` (16 steps).

## Principles

- **Idempotent**: every job has an idempotency key (see YAML); running a schedule twice is a no-op.
- **Bounded**: each job has a timeout; the worker kills and marks it failed when exceeded.
- **Retries**: up to `RJ_MAX_RETRIES` (3) with exponential backoff (1, 4, 16 min), then `failed`,
  visible in Mission Control and in the next daily-brief.
- **Capped**: per-job/day/month cost caps (`RJ_*_COST_CAP_EUR`); `RJ_MAX_CONCURRENT_JOBS` (2).
- **Stoppable**: `RJ_EMERGENCY_STOP=1` makes every job exit without work.
- **Honest output**: mocks labelled `mock`; missing metrics `null`; failures reported, not hidden.
- **Publishing is owner-gated**: no job schedules anything. The `publish_due` job only acts on items the owner already approved (G5) and scheduled; it re-verifies hashes and G5, and by default only *stages* them for manual posting. Live posting needs the extra opt-ins in `docs/INTEGRATIONS.md` and is untested.

## Jobs

| Cadence | Job | Runs | Timeout | Idempotency key | Output |
| --- | --- | --- | --- | --- | --- |
| Daily 06:50 | system-health | skill `system-health` | 10 min | `system-health:{date}` | health section in brief |
| Daily 06:55, 18:47 | worker drain | `npm run worker -- --once` | 30 min | per job | job results in DB |
| Daily 07:07 | daily-brief | skill `daily-brief` | 15 min | `daily-brief:{date}` | `output/reports/{date}-daily-brief.md` |
| Every 15 min (not activated) | publish_due | `npm run publish -- due --run` | 10 min | `publish_due:{contentId}:{scheduledAt}` | staged item (manual) or post id/url; deferred by caps/spacing/stop, retried; refusals -> failed + `error_logs` |
| Daily 09:13 | analytics snapshot | worker job `collect_metrics` | 15 min | `{content_id}:{window}` | metric snapshots (mock until insights live) |
| Mon 08:17 | research-topics | skill | 45 min | `research-topics:{iso_week}` | ResearchBrief + ContentIdea records |
| Mon 09:43 | plan-week | skill | 30 min | `plan-week:{iso_week}` | week plan (ContentIdea set, `output/reports/`) |
| Fri 16:37 | weekly-review | skill | 30 min | `weekly-review:{iso_week}` | `output/reports/{week}-weekly-review.md` |
| Sun 23:11 | DB backup | OPERATIONS "Backup" | 5 min | `backup:{date}` | copy of sqlite file |
| 1st 08:23 | regulation re-verify | financial-fact-checker | 60 min | `reverify:{yyyy-mm}` | FactCheck records for yearly figures |
| 1st 08:29 | monthly cost report | weekly-review (monthly mode) | 15 min | `costs:{yyyy-mm}` | cost section |
| 2nd 09:41 | performance deep-dive | analyze-performance | 45 min | `perf:{yyyy-mm}` | report in `output/reports/` from AnalyticsSnapshot |
| 2nd 09:53 | archive proposal | rj-chief-of-staff | 10 min | `archive:{yyyy-mm}` | list for owner to confirm |

Minutes are deliberately off the hour to avoid scheduler congestion.

## Activation options (owner decides)

1. **Local cron/launchd** on an always-on machine with the repo and DB: simplest; DB persists.
2. **Claude Code scheduled tasks** (fresh session per run, running the skill). Caveat: a cloud
   container does not keep `data/rendementjager.sqlite` between sessions; needs a persistent DB
   location or an export/import step first.
3. **GitHub Actions** schedule: later, after the DB moves to persistent storage (PostgreSQL via the
   repository adapter). GitHub MCP failed to connect this session.

Before activating any option: confirm caps in `.env`, run `system-health`, and record the change in
`docs/ROADMAP.md`.
