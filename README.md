# Rendementjager AI Content Factory

An AI-assisted production system for **@rendementjager**, an anonymous premium Dutch
personal-finance education brand. It turns an idea into a researched, fact-checked,
compliance-reviewed, rendered and owner-approved Instagram Reel, and tracks performance afterwards.

Status: foundation build (phase 1). See `docs/ROADMAP.md`. Nothing publishes automatically;
publishing integrations are mock/off by default.

## Quickstart (verified from a clean copy on 2026-10-30)

```bash
cd rendementjager
cp .env.example .env              # all keys optional; without keys, labelled mocks/fallbacks run
npm install                       # from this folder only (see BUILD_CONTRACT for the lock rule); `npm ci` also works
npm run db:migrate && npm run db:seed
npm run test                      # all workspaces + tests/
npm run typecheck
npm run build -w @rj/mission-control && npm run start   # dashboard on http://127.0.0.1:8787
# worker and render commands: docs/OPERATIONS.md
```

Requirements: Node >= 22.13 (uses built-in `node:sqlite`), ffmpeg, Chromium for Remotion renders.

## Structure

```
apps/
  mission-control/   Hono API (server/) + Vite/React/Tailwind dashboard (src/)
  worker/            job queue runner (idempotent, retries, caps, emergency stop)
packages/
  shared/            Zod schemas, pipeline stages, gates, hashing
  database/          node:sqlite, migrations, repositories
  finance-engine/    deterministic calculations, nl-NL EUR formatting
  content-engine/    workflow transitions, gate enforcement, audit log
  research-engine/   approved sources, research briefs, topic dedupe
  analytics-engine/  metric derivations, experiments
  integrations/      provider adapters + mocks (LLM, Buffer, n8n, Sheets)
  brand/             design tokens, logo, typography
  voice-engine/      TTS (ElevenLabs + labelled local fallback)
  video-engine/      Remotion templates, render, covers, media QA
content/             research/, scripts/, approved/ (text artefacts)
output/              reels/, covers/, reports/ (generated; mp4/wav git-ignored)
assets/              brand/, fonts/, audio/, graphics/
data/                SQLite database (git-ignored)
workflows/           editorial workflow + recurring job definitions
docs/                architecture, policy, operations, roadmap, audits
.claude/             project agents, skills (Chief of Staff commands), rules
```

## Working with Claude Code

Open Claude Code in this folder. Read `CLAUDE.md`. The `rj-chief-of-staff` skill coordinates
the 12 project agents in `.claude/agents/`; see `docs/AGENT_REGISTRY.md`.
