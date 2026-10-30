# Build contract (for agents working on this repo)

This is the source of truth for package names, ownership and conventions while the
foundation is built. Read it before touching code. Change it only via the Chief of Staff.

## Layout and ownership

| Path | Package name | Owner (build phase) | Purpose |
| --- | --- | --- | --- |
| `packages/shared` | `@rj/shared` | foundation | Zod schemas, domain types, pipeline stages, transition rules, quality gates, IDs, hashing |
| `packages/database` | `@rj/database` | foundation | `node:sqlite` connection, SQL migrations, repositories (adapter interface so PostgreSQL can follow) |
| `packages/finance-engine` | `@rj/finance-engine` | foundation | Deterministic financial calculations + EUR formatting (nl-NL), fully unit-tested |
| `packages/content-engine` | `@rj/content-engine` | foundation | Workflow service: state transitions, gate enforcement, approval invalidation, audit log |
| `packages/integrations` | `@rj/integrations` | foundation | Provider adapter interface + mock adapters (LLM, Buffer, n8n, Sheets) with config validation and status |
| `packages/research-engine` | `@rj/research-engine` | foundation | Approved source registry, ResearchBrief storage, topic dedupe by content hash |
| `packages/analytics-engine` | `@rj/analytics-engine` | foundation | Metric derivations (null stays null, never 0), experiment comparisons |
| `apps/worker` | `@rj/worker` | foundation | Job queue runner: idempotency keys, retries, timeouts, concurrency + cost caps, emergency stop |
| `apps/mission-control` | `@rj/mission-control` | mission-control | Hono/Node API (`server/`) + Vite/React/Tailwind UI (`src/`) |
| `packages/brand` | `@rj/brand` | video | Design tokens (TS + CSS variables), logo assets, typography |
| `packages/voice-engine` | `@rj/voice-engine` | video | TTS provider interface: ElevenLabs adapter (explicit opt-in) + voiceless mode (reading-speed timings; no local voice), pronunciation dictionary, cache, audio QA |
| `packages/video-engine` | `@rj/video-engine` | video | Remotion project: shared components, Templates A/B/C, render + cover scripts, media QA |
| `.claude/`, `docs/`, `CLAUDE.md`, `workflows/` | — | org-docs | Agents, project skills (Chief of Staff commands), rules, documentation |

Never edit files owned by another agent during the parallel build; leave a note in your final report instead.

## Conventions

- Node >= 22.13, ESM (`"type": "module"`), TypeScript strict, extend `../../tsconfig.base.json`.
- Run TS directly with `tsx`; tests with `vitest` (`"test": "vitest run"`), typecheck with `"typecheck": "tsc -p ."`.
- Internal deps use `"@rj/shared": "*"` and export source directly: `"exports": { ".": "./src/index.ts" }`.
- **npm install only from the repo root `rendementjager/`, always wrapped in a lock:**
  `flock /tmp/rj-npm.lock npm install <pkg> -w @rj/<name>`. Never run npm install inside a package dir.
- Pin exact versions for new dependencies (`--save-exact`). Remotion must stay on `4.0.535` (same as `../video`).
- Database: `node:sqlite` (`DatabaseSync`), no native modules. DB path from `RJ_DB_PATH` (default `data/rendementjager.sqlite`).
- Money: integer euro cents internally where exactness matters; format with `Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })`.
- Unavailable metrics are `null`, never `0`. Never fabricate data; mocks are labelled `mock` in every status output.
- Consumer-facing text in Dutch; code identifiers and technical docs in English.
- Secrets only from env; never log them. Status endpoints report `configured: true/false` only.

## Domain essentials

Pipeline stages (in order): IDEA, RESEARCHING, RESEARCHED, SCRIPTING, SCRIPT_READY, FACT_CHECK,
REVISION_REQUIRED, APPROVED_FOR_PRODUCTION, AUDIO_GENERATING, RENDERING, RENDERED, QA_REVIEW,
READY_FOR_EDITOR, APPROVED_FOR_PUBLISHING, SCHEDULED, PUBLISHED, FAILED, ARCHIVED.

Gates: G1 research, G2 editorial, G3 fact-check + compliance, G4 media QA, G5 owner approval
(bound to the exact video asset sha256 + caption hash). Script change after G3 invalidates G2/G3;
asset or caption change after G5 invalidates G5. SCHEDULED/PUBLISHED require a valid G5 for the
current asset hash. Every transition is logged with timestamp, actor id and reason.
