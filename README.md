# Rendementjager AI Content Factory

An AI-assisted production system for **@rendementjager**, an anonymous premium Dutch
personal-finance education brand. It turns an idea into a researched, fact-checked,
compliance-reviewed, rendered and owner-approved Instagram Reel, and tracks performance afterwards.

Status: volume build (series engine, review queue, publishing package/adapter). See `docs/ROADMAP.md`.
Nothing publishes automatically; live Instagram posting is off and untested.

## Starten op je eigen computer (Nederlands)

Het dashboard draait lokaal (`localhost`), het staat niet online. Wat je nodig hebt:
Node 22.13 of nieuwer, ffmpeg, Google Chrome of Chromium (voor het renderen van video's) en `git`.

```bash
git clone https://github.com/Swenvh/Rendementjager.git
cd Rendementjager
cp .env.example .env              # alle sleutels zijn optioneel; zonder sleutels draaien gelabelde lokale alternatieven
npm ci
npm run db:migrate && npm run db:seed
npm run dev                       # dashboard op http://localhost:5173 (API op 8787)
```

De eerste Reel ("Wat doet €250 per maand beleggen over 30 jaar?") staat als tekst en cijfers in de
repo, maar de MP4 zelf niet (te groot, staat in `.gitignore`). Maak hem lokaal opnieuw (ongeveer 4 minuten):

```bash
npm run render -w @rj/video-engine -- --content 2026-10-23-250-per-maand-30-jaar
npm run link-first-reel -w @rj/mission-control   # koppelt video, cover en caption aan het item
```

Dagelijks gebruik:
- **Methodebrieven** (eenmalig per serie): `npm run methods -- seed`, open `#/methodebrieven`, lees de 3 briefs en de bronnen, keur G1 goed per serie. Open eerst elke bronlink zelf; ze zijn nog niet geverifieerd.
- **Reels maken**: `npm run series -- plan --kind compounding --count 25`, daarna `generate` met dezelfde opties. Weekplan: `npm run series -- week`.
- **Controleren en goedkeuren**: pagina **Review** (toets `?` toont de sneltoetsen). Elke Reel wordt apart goedgekeurd tegen zijn exacte video en caption.
- **Publiceren**: pagina **Publicatie**, of `npm run publish -- export <contentId>` voor het handmatige pakket.
- **Noodstop**: zet `RJ_EMERGENCY_STOP=1` in `.env` of gebruik de schakelaar bij Instellingen.

Voor de echte stem: `ELEVENLABS_API_KEY` en `ELEVENLABS_VOICE_ID` in `.env` en `RJ_TTS_PROVIDER=elevenlabs`
(kost geld; standaard staat het uit). Je officiële logo: zet het als `assets/brand/logo-official.svg`.

## Developer quickstart

```bash
npm ci && npm run db:migrate && npm run db:seed
npm test && npm run typecheck
npm run build -w @rj/mission-control && npm run start   # API + UI op http://127.0.0.1:8787
```

Requirements: Node >= 22.13 (uses built-in `node:sqlite`), ffmpeg, Chromium for Remotion renders.
Worker and render commands: `docs/OPERATIONS.md`.

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
