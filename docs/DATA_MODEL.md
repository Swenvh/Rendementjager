# Data model

SQLite via `node:sqlite` (`DatabaseSync`), file `RJ_DB_PATH` (default `data/rendementjager.sqlite`).
Migrations: `packages/database/migrations/NNN_name.sql`, tracked in `schema_migrations`, applied on open
or with `npm run db:migrate`. Zod schemas in `@rj/shared` (`packages/shared/src/schemas.ts`) are the
source of truth: each camelCase field is one snake_case column. JSON columns hold arrays/objects,
booleans are 0/1, timestamps are ISO-8601 UTC text, money is integer euro cents, unknown metrics are NULL.

Access goes through the `Repository` interface (`packages/database/src/repository.ts`, async so a
PostgreSQL implementation can follow); `createSqliteRepository()` implements it. Stage changes and
approvals go through `WorkflowService` (`@rj/content-engine`), never direct table writes.

| Table | Entity | Key columns / notes | Indexes |
| --- | --- | --- | --- |
| `content_items` | ContentIdea | `stage`, `template` (A/B/C), `pillar`, `series`, `topic_hash` (UNIQUE, dedupe), `current_script_revision_id`, `current_asset_sha256`, `caption_hash`, `scheduled_at` | stage, scheduled_at |
| `research_briefs` | ResearchBrief | `kind` evergreen/current_news, `key_facts` JSON, `status` draft/approved/rejected | content_id, status |
| `sources` | Source | `url`, `domain`, `publisher`, `trust_tier` 1-3 (from the registry), `published_at`, `accessed_at` | brief_id |
| `scripts` | Script | one per content item, `current_revision_id` | content_id |
| `script_revisions` | ScriptRevision | immutable, `version` (UNIQUE per script), `sha256`, `author_id`; UPDATE/DELETE blocked by trigger | content_id |
| `financial_claims` | FinancialClaim | claim per revision, `source_id` or `calculation_ref`, `status` | content_id, status |
| `fact_checks` | FactCheck | verdict per revision | content_id |
| `compliance_reviews` | ComplianceReview | verdict + `flags` JSON per revision | content_id |
| `storyboards` | Storyboard | `scenes` JSON per revision + template | content_id |
| `voice_assets` | VoiceAsset | `provider`, `is_fallback`, `sha256`, `text_hash` (TTS cache key) | content_id, text_hash |
| `video_assets` | VideoAsset | every render, `sha256` | content_id |
| `thumbnail_assets` | ThumbnailAsset | cover per video | content_id |
| `render_jobs` | RenderJob | audio/video/cover render bookkeeping, `input_hash` (render cache) | content_id, status |
| `approvals` | Approval | `gate` G1-G5, `decision`, `status` valid/invalidated, bound to `script_revision_id` (G2/G3), `asset_sha256` (G4/G5), `caption_hash` (G5) | (content_id, gate), status |
| `publications` | Publication | `platform`, `status`, `video_asset_sha256` + `caption_hash` + `approval_id` (the G5 it relied on) | content_id, scheduled_at, status |
| `analytics_snapshots` | AnalyticsSnapshot | reach/views/likes/comments/shares/saves/follows, all nullable | content_id, publication_id |
| `agent_tasks` | AgentTask | agent work items, `input`/`output` JSON | status, content_id |
| `workflow_runs` | WorkflowRun | multi-step workflow runs | status |
| `error_logs` | ErrorLog | redacted errors (worker failures) | created_at |
| `cost_records` | CostRecord | `amount_cents`, `is_estimate`, `provider`, `job_id` | created_at, job_id |
| `brand_assets` | BrandAsset | versioned brand files with sha256 | |
| `system_configuration` | SystemConfiguration | key/value JSON, e.g. `emergency_stop` | PK key |
| `audit_log` | AuditLog | append-only (trigger): `action` (transition, transition_denied, approval, approval_denied, invalidation, script_revision, asset_change, caption_change, emergency_stop, publication), `from_stage`, `to_stage`, `actor_id`, `reason`, `created_at` | (content_id, created_at) |
| `jobs` | Job | worker queue: `type`, `idempotency_key` UNIQUE, `status` queued/running/succeeded/failed/cancelled, `attempts`/`max_attempts`, `timeout_ms`, `estimated_cost_cents`, `run_after` | (status, run_after), content_id |

## Gate binding rules (enforced in `@rj/content-engine`)

- G1 needs a research brief. G2/G3 approve the current script revision; a new revision invalidates them.
- G3 needs a fact-checker and a compliance-reviewer approval (or the owner); the fact-checker may not be the revision author.
- G4 approves the current video sha256; G5 (owner only) approves video sha256 + caption hash.
  A new video invalidates G4/G5 (item back to QA_REVIEW, scheduled publications cancelled); a new caption invalidates G5 (back to READY_FOR_EDITOR).
- An approval row only counts if its bindings match the item's current hashes; a G5 row from anyone but `owner` never counts.
