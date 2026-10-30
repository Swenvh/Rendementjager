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
| Local/robotic TTS | removed | n.a. | voice-engine test | Decision 2026-10-30: no robotic voice in the product. Without ElevenLabs a Reel is voiceless (captions only) |
| Footage library (owner-provided slices) | none | **built and tested** (synthetic clips) | `npm test -w @rj/footage-engine` | `footage slice` cuts portrait clips from files the owner supplies; no real clips are in the repo yet |
| Pexels Videos API | `PEXELS_API_KEY` | built, **UNTESTED live** (pexels.com blocked here; mocked transport only) | mocked tests | Official API `api.videos.pexels.com`, Pexels License. Free key. Terms page not reachable from the sandbox: re-check https://www.pexels.com/license/ before use |
| Pixabay Videos API | `PIXABAY_API_KEY` | built, **UNTESTED live** (mocked transport only) | mocked tests | Official API `pixabay.com/api/videos/`, Pixabay Content License. Re-check https://pixabay.com/service/license-summary/ before use |
| YouTube CC BY via yt-dlp (`youtube-cc`) | none (yt-dlp installed) | built, **UNTESTED live** (YouTube blocked here; mocked yt-dlp output only) | mocked tests | Only videos whose metadata says "Creative Commons Attribution"; refuses otherwise or when the licence field is missing; video only; credit mandatory |
| Buffer | `BUFFER_ACCESS_TOKEN` | mock | `status()` | *Verify* current Buffer API availability and Instagram Reels support; Buffer has restricted new API access in the past |
| n8n | `N8N_WEBHOOK_URL` | mock | `status()` | Optional relay; no instance configured |
| Google Sheets | MCP (session) / adapter mock | mock | Sheets MCP read | MCP available in Claude Code sessions; adapter is mock |
| Instagram Reels publishing (`InstagramGraphAdapter`) | `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN` (+ optional `INSTAGRAM_API_HOST`, `INSTAGRAM_API_VERSION`), `RJ_PUBLISH_MODE=instagram`, `RJ_PUBLIC_MEDIA_BASE_URL`, `RJ_INTEGRATIONS_LIVE=1` | mock (built, **live calls untested**) | `status()`, mock-transport tests | See "Instagram Reels publishing (Phase 5)" below |
| Hyper MCP `instagram` skill | Hyper MCP + account at app.hyperfx.ai | not connected | — | Could publish Reels and read insights; third-party; would act on the live account; only after G5 and security review |
| YouTube Shorts | not defined | not built | — | Phase 6 |
| TikTok | not defined | not built | — | Phase 6 |
| GitHub | `gh` CLI / MCP | MCP failed to connect this session | — | For CI later |

## Footage library (background drone footage)

Files live in `assets/footage/nl/` (git-ignored, only the manifest `assets/footage/manifest.json` and `assets/footage/plans/` are tracked). Allowed licences: Pexels License, Pixabay Content License, CC0, CC BY, Owner-provided (see `docs/EDITORIAL_POLICY.md` section 7.1). Commands:

```bash
npm run footage -- list | validate
npm run footage -- pick --slug <slug>
npm run footage -- slice --plan assets/footage/plans/nl-scenic.json --input-dir <dir with <sourceId>.mp4>   # owner-supplied files
npm run footage -- fetch-sources --plan assets/footage/plans/nl-scenic.json                  # yt-dlp: only the planned ranges of the owner-declared sources; UNTESTED live (mocked yt-dlp)
npm run footage -- fetch --provider pexels --query "polder luchtfoto Nederland" --count 5     # UNTESTED live
npm run footage -- fetch --provider pixabay --query "windmolens Kinderdijk" --count 5          # UNTESTED live
npm run footage -- fetch --provider youtube-cc --url <https://youtu.be/...>                    # UNTESTED live, CC BY only
```

Suggested Dutch queries: polder, Amsterdam grachten, Rotterdam Erasmusbrug, windmolens Kinderdijk, tulpenvelden, Zwolle, Waddenzee, Delta Werken. `slice` output: portrait 1080x1920, 30 fps, H.264 crf 19, no audio, faststart, 10 s per clip (`clipDurationS`, 8 to 12 wanted). Slice plans list several sources (each with URL, channel, rights note, optional `avoid` ranges for title cards and end screens); the manifest records the source of every clip (`sourceId`). Each Reel uses a chain of different clips with 1 s cross-fades, never a looped or stretched clip. Fetch keys come from env only (`.env.example`).

## Instagram publishing and insights (verify against current Meta docs)

- Requires an Instagram **professional account** (Business or Creator). Content publishing via the
  official API works for professional accounts; *verify* whether Creator accounts are supported for
  the specific endpoints you need.
- Needs a Meta developer app, the relevant permissions (content publishing, insights), and **Meta
  App Review** for use beyond the app's own test users; *verify* current permission names, the
  Instagram Login vs Facebook Login choice, and the business verification requirements.
- Publishing has a rate limit (a fixed number of API-published posts per 24 h); *verify* the current number.
- Reels must be hosted at a public URL at publish time; this system has no public file host yet (the owner provides one: `RJ_PUBLIC_MEDIA_BASE_URL`).
- Insights: some metrics are only available after a delay or above follower thresholds; missing
  metrics are stored as `null`.

## Instagram Reels publishing (Phase 5)

Code: `packages/integrations/src/adapters/instagram.ts` (adapter), `apps/worker/src/publishing.ts` (G5 check, caps, staging,
`publish_due`), Mission Control page **Publicatie**. Default route is **manual**: the system builds a publish package and the
owner posts by hand; the live adapter is optional and off.

Flow implemented (Instagram Graph content publishing): `POST /{ig-user-id}/media` (`media_type=REELS`, `video_url`, `caption`) ->
poll `GET /{container}?fields=status_code` until `FINISHED` (`ERROR`/`EXPIRED` abort) -> `POST /{ig-user-id}/media_publish` ->
`GET /{media}?fields=permalink`. Retry/backoff with `Retry-After` and Graph rate-limit codes; `media_publish` is never retried after an
ambiguous failure (5xx/timeout) because the post may exist: the publication is marked failed and the owner checks Instagram.
The token is only sent in the `Authorization` header and is redacted from every error, log, audit row and status.

**Verification status (honest).** Live calls are untested: from the build sandbox `developers.facebook.com` did not resolve
(blocked by the network policy) and `graph.facebook.com` / `graph.instagram.com` are not reachable, so nothing below could be
checked against current Meta documentation. The adapter is verified only against a mock transport.

| Topic | Status |
| --- | --- |
| Endpoint names, `media_type=REELS`, container -> status -> publish flow | From memory of Meta docs; **not verified now** |
| Status values (`FINISHED`, `ERROR`, `EXPIRED`, `IN_PROGRESS`) and rate-limit error codes | From memory; **not verified** |
| Current Graph API version (placeholder default `v21.0`) | **Not verified**; set `INSTAGRAM_API_VERSION` |
| Permission names, Instagram Login vs Facebook Login, whether Meta **App Review** / Business Verification is needed | **Not verified**; assume review may be required for accounts outside your own app's testers |
| Daily publishing quota (Meta limits API-published posts per rolling 24 h; number not assumed) | **Not verified**; `getPublishingLimit()` reads the live usage, our own cap is `RJ_DAILY_PUBLISH_CAP` |
| Trial reels via the API | **Not verified**; the adapter refuses any trial parameter |
| Account type | Requires an Instagram **professional** account (Business or Creator); whether Creator works for every endpoint is unverified |
| Video source | The API **fetches the video from a PUBLIC HTTPS URL**: a hosting step is required (this repo has none) |

Before enabling live: (1) verify all rows above against the current official docs; (2) create the Meta app, get a long-lived token
(expires, roughly 60 days: the owner renews it) and put `INSTAGRAM_USER_ID` / `INSTAGRAM_ACCESS_TOKEN` in `.env`; (3) host the
**exact** package MP4 at `${RJ_PUBLIC_MEDIA_BASE_URL}/<slug>/video.mp4` (the worker downloads it and refuses if its sha256 differs
from the approved hash); (4) set `RJ_PUBLISH_MODE=instagram` and `RJ_INTEGRATIONS_LIVE=1`; (5) the owner switches live consent on in
Mission Control (Publicatie) or the item stays staged for manual posting. Missing any of these means the item is staged, never posted.

Publish guards (every one tested): valid **owner** G5 bound to the sha256 recomputed from the file on disk and the recomputed caption
hash; item still SCHEDULED; no emergency stop; duplicate-post guard (an asset hash that is published or staged for another item is
refused); `RJ_DAILY_PUBLISH_CAP` (default 10, rolling 24 h) and `RJ_PUBLISH_MIN_SPACING_MIN` (default 60) defer with a retry time.

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
