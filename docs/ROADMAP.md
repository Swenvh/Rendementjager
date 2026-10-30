# Roadmap

Living status document. Update the status column when a milestone changes; this file plus the DB is
how a new session resumes work. Phase names reconstructed from the build brief; the owner may
re-scope them.

Status values: `done`, `in progress`, `designed`, `not started`, `blocked`.

| Phase | Goal | Milestones | Depends on | Status (2026-10-23) |
| --- | --- | --- | --- | --- |
| 0 — Audit and contract | Know what the environment can do; fix package contract | CAPABILITY_AUDIT, BUILD_CONTRACT, docs set, agents/skills/rules | — | done (docs), contract owned by Chief of Staff |
| 1 — Foundation | Pipeline core runs locally with tests | shared schemas, node:sqlite DB + migrations, content-engine gates + invalidation, finance-engine, research-engine, analytics-engine, integrations mocks, worker `--once` | 0 | in progress (parallel build) |
| 2 — Mission Control | Owner can see the pipeline and grant G5 | Hono API on :8787, React UI on :5173, approvals bound to hashes, emergency stop, status with `configured`/`mock` | 1 | in progress (parallel build) |
| 3 — Brand and video | Branded Reels render reproducibly | @rj/brand tokens + placeholder logo, Remotion 4.0.535 Templates A/B/C, covers, media QA (G4) | 1 | in progress (parallel build) |
| 4 — Voice | Narration with QA | voice-engine interface, local fallback (labelled), pronunciation dictionary, cache; ElevenLabs when key + network allow | 3 | in progress; ElevenLabs blocked in cloud, espeak-ng missing |
| 5 — First Reels end-to-end | 3–5 Reels pass G1–G5; owner publishes manually | research → script → G3 → render → G4 → G5; manual upload by owner; analytics entered manually or `null` | 1–4, official logo (or owner accepts placeholder), voice decision | not started |
| 6 — Distribution and platforms | Scheduling behind G5; more platforms | IG professional account + Meta app review or Buffer/Hyper route; hash check before schedule; TikTok/Shorts adapters | 5, owner decisions, security review | not started |
| 7 — Growth loop and scale | Learn from data; newsletter/website | automated insights, experiments, recurring jobs activated, PostgreSQL adapter for persistent scheduling, newsletter + website | 6 | not started |

## Open owner decisions

1. Official logo asset (until then: placeholder, not publishable without explicit acceptance).
2. Voice: ElevenLabs (paid; needs local run or network allow-list) vs. another option.
3. Publishing route: Meta Graph API (app review), Buffer, Hyper MCP, or manual.
4. Where the DB lives persistently, and which scheduler activates `workflows/recurring-jobs.yaml`.
5. Legal review of `docs/EDITORIAL_POLICY.md` before any monetisation.

## Change log

- 2026-10-23: phase 0 docs, 12 agents, 12 skills, 4 rules, workflows written (org-docs agent).
- 2026-10-30: independent QA pass (`docs/QA_REPORT.md`): phases 1-3 build verified from a clean copy; first Reel rendered as a CONCEPT (no gate passed, no research brief or script revision in the DB yet). Phase statuses above predate the build and were not re-scored.
