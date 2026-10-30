# Integrations

All integrations go through `@rj/integrations` (provider interface + config validation + `status()`
reporting `configured: true/false` and `mode: live|mock`). Default for everything: **mock or local
fallback, clearly labelled**. Platform rules change often: everything below marked *verify* must be
checked against current official documentation before building or activating.

| Integration | Config (env) | Current mode | Test | Notes |
| --- | --- | --- | --- | --- |
| Claude (agents) | none (Claude Code subagents) | live via Claude Code | run any skill | `ANTHROPIC_API_KEY` optional for direct API use; not set |
| LLM adapter (programmatic) | `ANTHROPIC_API_KEY` | mock | `status()` | Not needed for phase 1 |
| ElevenLabs TTS | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` | **unavailable** here | voice-engine test (to be verified) | api.elevenlabs.io blocked in cloud (CONNECT 403); works only where the host is reachable. Paid; owner activates |
| Local TTS fallback | none | fallback | voice-engine test | espeak-ng not installed in this container; audio labelled "niet de merkstem", not publishable |
| Buffer | `BUFFER_ACCESS_TOKEN` | mock | `status()` | *Verify* current Buffer API availability and Instagram Reels support; Buffer has restricted new API access in the past |
| n8n | `N8N_WEBHOOK_URL` | mock | `status()` | Optional relay; no instance configured |
| Google Sheets | MCP (session) / adapter mock | mock | Sheets MCP read | MCP available in Claude Code sessions; adapter is mock |
| Instagram (Graph API / Instagram Login) | not defined yet | not built | — | See below |
| Hyper MCP `instagram` skill | Hyper MCP + account at app.hyperfx.ai | not connected | — | Could publish Reels and read insights; third-party; would act on the live account; only after G5 and security review |
| YouTube Shorts | not defined | not built | — | Phase 6 |
| TikTok | not defined | not built | — | Phase 6 |
| GitHub | `gh` CLI / MCP | MCP failed to connect this session | — | For CI later |

## Instagram publishing and insights (verify against current Meta docs)

- Requires an Instagram **professional account** (Business or Creator). Content publishing via the
  official API works for professional accounts; *verify* whether Creator accounts are supported for
  the specific endpoints you need.
- Needs a Meta developer app, the relevant permissions (content publishing, insights), and **Meta
  App Review** for use beyond the app's own test users; *verify* current permission names, the
  Instagram Login vs Facebook Login choice, and the business verification requirements.
- Publishing has a rate limit (a fixed number of API-published posts per 24 h); *verify* the current number.
- Reels must be hosted at a public URL at publish time; this system has no public file host yet.
- Insights: some metrics are only available after a delay or above follower thresholds; missing
  metrics are stored as `null`.

## YouTube (verify)

YouTube Data API v3 uploads use OAuth and a daily quota in which an upload is expensive; unverified
API projects may have uploads restricted to private. *Verify* quota cost and audit requirements.

## TikTok (verify)

TikTok Content Posting API requires an approved developer app; unaudited apps may only post
privately/to limited audiences. *Verify* current audit and scope requirements.

## Activation checklist (any live integration)

1. Owner instruction in writing (chat or ROADMAP entry). 2. Security check per `CLAUDE.md` for
any new SDK/MCP. 3. Key set in env, never in files. 4. `status()` shows `configured: true`.
5. Dry run in mock mode. 6. For publishing: G5 hash check verified in a test. 7. Record in ROADMAP.
