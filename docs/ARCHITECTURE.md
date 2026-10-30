# Architecture

Status: design document for the foundation build. Package ownership and conventions are defined in
`BUILD_CONTRACT.md` (source of truth); table shapes in `DATA_MODEL.md`. Where this document and
the code disagree, the code and the contract win; fix this document.

## 1. Packages

```
                         apps/mission-control (Hono API :8787 + React UI :5173)
                                   |                    \
                                   v                     v
 apps/worker ---> @rj/content-engine (transitions, gates, approval invalidation, audit)
     |                 |                 |
     |                 v                 v
     |           @rj/database      @rj/shared (Zod schemas, stages, gate rules, hashing)
     |           (node:sqlite,          ^
     |            repositories)         | used by every package
     v
 job handlers:  @rj/research-engine  @rj/finance-engine  @rj/voice-engine  @rj/video-engine
                @rj/analytics-engine @rj/integrations (LLM, Buffer, n8n, Sheets; mock by default)
                @rj/brand (tokens, logo, fonts) -> used by video-engine and mission-control
```

| Package | Responsibility | Must not |
| --- | --- | --- |
| `@rj/shared` | Schemas, `PipelineStage`, gate definitions, allowed transitions, sha256 helpers | Do I/O |
| `@rj/database` | `DatabaseSync` connection, SQL migrations, repository interfaces + SQLite implementation | Contain business rules |
| `@rj/content-engine` | The only code that changes a stage or records a gate/approval; writes the audit log | Be bypassed by direct SQL |
| `@rj/finance-engine` | Deterministic calculations (compound interest, inflation, costs), nl-NL EUR formatting | Call the network or an LLM |
| `@rj/research-engine` | Approved source registry, `ResearchBrief` storage, topic dedupe by content hash | Accept unregistered sources as evidence |
| `@rj/analytics-engine` | Derived metrics (null stays null), experiment comparisons | Fill gaps with 0 |
| `@rj/integrations` | Provider interface, config validation, `status()` with `mode: live|mock` | Activate paid/live providers by default |
| `@rj/voice-engine` | TTS interface, ElevenLabs adapter, labelled local fallback, pronunciation dictionary, cache, audio QA | Pass fallback audio off as brand voice |
| `@rj/video-engine` | Remotion 4.0.535 templates A/B/C (only C is wired into the render pipeline today; A/B are compositions without a content pipeline), render + cover scripts, media QA | Render without APPROVED_FOR_PRODUCTION |
| `@rj/brand` | Tokens (TS + CSS vars), logo resolution, fonts | Ship an unofficial logo as official |
| `@rj/worker` | Queue runner: claims jobs, idempotency, retries, timeouts, concurrency and cost caps, emergency stop | Publish without G5 |
| `@rj/mission-control` | Dashboard + API for owner review, approvals (G5), status, emergency stop | Grant G5 on behalf of the owner |

## 2. Data flow: idea to published

```
IDEA -> RESEARCHING -> RESEARCHED --G1--> SCRIPTING -> SCRIPT_READY --G2--> FACT_CHECK
  --G3 (fact-check + compliance)--> APPROVED_FOR_PRODUCTION -> AUDIO_GENERATING -> RENDERING
  -> RENDERED -> QA_REVIEW --G4--> READY_FOR_EDITOR --G5 (owner, bound to sha256 + caption hash)-->
  APPROVED_FOR_PUBLISHING -> SCHEDULED -> PUBLISHED -> (analytics snapshots)
Side exits: REVISION_REQUIRED (back to SCRIPTING), FAILED, ARCHIVED.
```

Artefacts per stage: research brief (`content/research/`), script (`content/scripts/`), approved
script snapshot (`content/approved/`), audio (cache), MP4 (`output/reels/`), cover
(`output/covers/`), QA and analytics reports (`output/reports/`). The DB stores metadata, hashes
and gate results; files hold the bulky artefacts. The 16-step editorial workflow is defined in
`workflows/editorial-workflow.yaml`.

Approval invalidation (enforced in content-engine): editing the script after G3 drops G2 and G3 and
moves the item back to SCRIPT_READY; any change to the MP4 or caption after G5 drops G5. Scheduling
re-hashes the file and refuses on mismatch.

## 3. Queue / worker model

- Jobs live in a `jobs` table (`JobSchema`): type (`generate_audio`, `render_video`, `render_cover`, `media_qa`, `collect_metrics`, `daily_brief`), payload, `idempotency_key` (unique), status
  (`JobStatusSchema`: queued/running/succeeded/failed/cancelled), attempts, `run_after`, `timeout_ms`, cost estimate.
- `npm run worker -- --once` claims ready jobs (respecting `RJ_MAX_CONCURRENT_JOBS`), runs each
  with a timeout, records the outcome, and exits. A long-running mode may exist for local use.
- Idempotency: the key is derived from job type + content id + input hash; re-enqueueing the same
  work is a no-op, so cron can safely run the same schedule twice.
- Retries: exponential backoff up to `RJ_MAX_RETRIES`, then stays `failed` and visible in Mission Control.
- Cost caps: per job, per day, per month (`RJ_*_COST_CAP_EUR`); a job that would exceed a cap is
  not started and is reported.
- Emergency stop: `RJ_EMERGENCY_STOP=1` (and/or a DB flag set from Mission Control) makes the
  worker claim nothing and exit.
- Claude Code agents do the judgement work (research, writing, review) and hand structured output
  to the API/content-engine; the worker does the deterministic work (render, TTS, QA, snapshots).

## 4. Why `node:sqlite` with repository adapters

- Zero native modules: no `better-sqlite3` build step, works in the cloud container and on the
  owner's laptop with Node >= 22.13 only. Verified working here (bundled SQLite 3.50.4).
- One file (`data/rendementjager.sqlite`) is easy to back up, inspect and move.
- Synchronous `DatabaseSync` keeps transactions simple for a single-writer worker.
- Repository interfaces isolate SQL so a PostgreSQL implementation can replace SQLite when
  there are multiple writers or a hosted dashboard. Trade-off: `node:sqlite` is still flagged
  experimental by Node (prints a warning); pin the Node major version.

## 5. Scheduling honesty

Nothing in this repo runs by itself. A closed laptop is not a scheduler, and a Claude Code cloud
container is ephemeral: it stops when the session ends, and processes started in it die with it.
Therefore:

- All recurring work is expressed as idempotent `npm run worker -- --once` invocations plus
  Claude Code skills (e.g. `daily-brief`).
- Options to actually trigger them, none activated yet: (a) cron/launchd on an always-on machine,
  (b) Claude Code scheduled tasks that start a fresh session and run the skill, (c) GitHub Actions
  on a schedule (later; needs the DB somewhere persistent, which SQLite in an ephemeral runner is
  not — that is the trigger to move to PostgreSQL or a persisted artefact).
- The DB file must live somewhere persistent; in a cloud session it disappears unless committed
  (it is git-ignored) or exported. See OPERATIONS "Backup".

## 6. Security boundaries

- Secrets only from env; status endpoints report `configured: true/false`.
- Publishing adapters default to mock; live mode requires explicit config **and** a valid G5.
- The API binds to localhost by default; it has no authentication yet, so it must not be exposed.
