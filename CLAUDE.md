# Rendementjager — project instructions

Rendementjager (@rendementjager) is an anonymous, premium Dutch personal-finance education brand and the
AI content factory behind it. Instagram Reels first; TikTok, YouTube Shorts, newsletter and website later.
The owner is Editor-in-Chief and the only person who can approve publication.

This repo is both the factory (`apps/`, `packages/`, `.claude/agents|skills|rules`) and the user's toolbox of
Claude Code skills (`.claude/skills/`, shared checklists in `.claude/references/`, licenses in
`.claude/skills/_licenses/`). The BennAI marketing agents in `.claude/agents/` (Dutch, generic marketing) are
kept for their skills (`campagne`, `contentweek`, `seo-artikel`, `maandrapport`); Rendementjager's own
agents are the 12 listed in `docs/AGENT_REGISTRY.md`. Marketing agents save to `marketing/`-style folders
only when asked; Rendementjager output lives in `content/` and `output/`.

## Bedrijfsprofiel (marketing-agents en -skills)

- Naam: RENDEMENTJAGER (@rendementjager). Premium Nederlands financieel educatie- en mediamerk, anoniem.
- Belofte: Meer inzicht. Meer vermogen. Meer vrijheid. (intern; niet in video's als belofte gebruiken)
- Doelgroep: Nederlandstalige beleggers van beginner tot ervaren particulier.
- Thema's: beleggen, vermogensopbouw, financiële onafhankelijkheid, ETF's, aandelen, rente-op-rente, inflatie, persoonlijke financiën.
- Toon: professioneel, betrouwbaar, modern, analytisch, toegankelijk; "je"-vorm; geen hype, geen FOMO, geen rendementsbeloftes.
- Contentmix (startpunt): 30% vermogensopbouw, 25% beleggen/ETF's, 20% markt en economie, 15% persoonlijke financiën, 10% fouten/mythes.
- Kanalen: Instagram (eerst), later TikTok, YouTube Shorts, nieuwsbrief, website. Doel en KPI: ONBEKEND (door de eigenaar te bepalen).
- Alles wat niet in dit profiel staat is ONBEKEND: nooit verzinnen.

## Security check before installing anything

Before installing any skill, script, CLI or other third-party code: download it to the scratchpad (never straight into
this repo), scan it with `skillspector scan <path> --no-llm --format json --output <report.json>` (installed by the
session-start hook; if missing, review manually), read the source around every HIGH/CRITICAL finding and every finding
involving network, credentials, shell execution or persistence, report APPROVE / CAUTION / REJECT with evidence, and only
then install. The `skill-inspector` skill describes this in detail.

## Using skills

When a skill fails (API overload, rate limit, download error), try other routes before replying: retry, fallbacks,
narrower scope. Report failure only after the options are exhausted, and say what was tried.
Large tasks (several steps/skills/agents, research, building, campaigns) start with the `chief-of-staff` skill
(for Rendementjager work: `rj-chief-of-staff`) and a short briefing: Doel, Aanpak, Strategisch, Wacht op jou.
Small questions get a direct answer.

| Task | Use |
| --- | --- |
| Video, Reel, animation | `remotion-motion-graphics` (Remotion is the default; `packages/video-engine`) |
| Remotion API questions | `remotion-best-practices` |
| HyperFrames video | `hyperframes*` only when the user asks |
| Cinematic promo shots | `video-shotcraft` |
| Watch/summarise a video | `watch` |
| Vague idea/plan | `brainstorming`, then `writing-plans` |
| Bug | `systematic-debugging` |
| Is something safe to install | `skill-inspector` |
| Scrape public pages | `scrapling` (most sites blocked in cloud sessions) |
| Hyper skills (ads/social accounts) | only with the Hyper MCP connected |

Skills and agents live on `main`; changes land on `main`.

## Language

- Consumer-facing content (scripts, captions, on-screen text, newsletter): **Dutch**, "je"-vorm.
- Code, identifiers, commits, technical docs: **English**.

## Read first

- `docs/BUILD_CONTRACT.md` — packages, ownership, conventions (source of truth).
- `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` — how it fits together.
- `docs/EDITORIAL_POLICY.md` — financial accuracy, compliance, the 5 gates.
- `docs/OPERATIONS.md` — commands. `docs/ROADMAP.md` — current phase and status.
- `docs/CAPABILITY_AUDIT.md` — what actually works in this environment.

## Hard rules

1. **Never publish or schedule without owner approval.** SCHEDULED/PUBLISHED require a valid
   G5 approval bound to the current video sha256 + caption hash. No agent or skill may approve G5.
2. **Five gates**: G1 research, G2 editorial, G3 fact-check + compliance, G4 media QA,
   G5 owner approval. A script change after G3 invalidates G2/G3; an asset or caption change after
   G5 invalidates G5. Gates are enforced by `@rj/content-engine`, never bypassed by editing the DB.
3. **Never fabricate data**: no invented numbers, returns, sources, quotes or metrics. Unknown
   metrics are `null`, never `0`. Every figure in a script comes from `@rj/finance-engine` or a
   cited, approved source. Mocks are labelled `mock`.
4. **Education, not advice.** No personal investment advice, no product recommendations, no
   return promises. See `.claude/rules/financial-accuracy.md`.
5. **Secrets only from env**, never logged or committed (`.claude/rules/secrets.md`).
6. **Cost caps** from env (`RJ_*_COST_CAP_EUR`); nothing paid is activated without the owner
   (`.claude/rules/cost-control.md`). Emergency stop: `RJ_EMERGENCY_STOP=1`.
7. **Orchestration**: max 3 subagents at once; subagents never spawn subagents.

## Resuming work

State lives in the SQLite DB (`RJ_DB_PATH`, default `data/rendementjager.sqlite`: content items,
gate results, approvals, jobs, audit log) and in `docs/ROADMAP.md` (phase status). Start a session
with the `system-health` skill, then `daily-brief`. Do not rely on chat history.

## Entry points

The `rj-chief-of-staff` skill coordinates everything (it extends the workspace `chief-of-staff`).
Commands: `daily-brief`, `plan-week`, `research-topics`, `produce-reel`, `produce-batch`,
`review-content`, `render-content`, `content-calendar`, `analyze-performance`, `system-health`,
`weekly-review`. Recurring jobs: `workflows/` and `docs/AUTOMATIONS.md` (designed, not activated).
