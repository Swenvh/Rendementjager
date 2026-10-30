# Capability audit

Audited 2026-10-23 in a Claude Code cloud session (Linux, ephemeral container) by running commands
in this environment. "Verified" = checked with a command this session. "Reported" = taken from the
session context and not independently tested. Re-run the `system-health` skill to refresh.

## 1. Repository and instructions

| Item | Finding | Verified |
| --- | --- | --- |
| Repo | `Swenvh/Rendementjager` (factory + skill toolbox in one repo; moved here from the workspace on 2026-10-30) | yes |
| Branch | `main` | yes |

## 2. Skills

Skills: 126 folders in `.claude/skills/` (114 toolbox + 12 Rendementjager) (verified `ls | wc`).
User-level `~/.claude/skills/`: `session-start-hook` and a `synced/` set of Anthropic skills
(docx, pdf, pptx, xlsx, deep-research, skill-creator, browser tools, morning, import-memory).

| Skill | Location | Purpose | Invocation | Usable now? | Dependencies | Limitations | Reuse decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| chief-of-staff | `../.claude/skills/chief-of-staff` | Long-running goal coordination via subagents, strategic + tactical track | Skill tool | yes | none | Generic; no pipeline knowledge | **Extend** via `rj-chief-of-staff` (references it, no copy) |
| remotion-motion-graphics | `../.claude/skills/remotion-motion-graphics` | Motion-design craft rules for Remotion (easing, stagger, 5-layer stack, render-and-look loop) | Skill tool | yes | Remotion project | Generic look rules, not brand | **Reuse by reference** in remotion-video-engineer |
| remotion-best-practices | `../.claude/skills/remotion-best-practices` | Router to Remotion API rules | Skill tool | yes | — | — | Reuse for API questions |
| video-shotcraft | `../.claude/skills/video-shotcraft` | Cinematic product/website promo shots | Skill tool | yes | Remotion, screenshots | Product promo focus; not core for finance Reels | Optional, not in default pipeline |
| hyperframes (+cli, registry, media-use) | `../.claude/skills/hyperframes*` | HTML-to-video | Skill tool | partially | `npx hyperframes@0.8.188` | Toolbox rule: only when user asks; heygen.com and cdn.jsdelivr.net blocked in cloud | Not used; Remotion is the default |
| ui-ux-pro-max | `../.claude/skills/ui-ux-pro-max` | UI/UX design intelligence (has scripts/data) | Skill tool | yes | Python 3 for its scripts | — | Reuse for Mission Control UI + covers |
| frontend-ui-engineering | `../.claude/skills/frontend-ui-engineering` | Accessible production UI | Skill tool | yes | — | — | Reuse for Mission Control |
| design, design-system, ui-styling, brand, banner-design | `../.claude/skills/<name>` | Tokens, brand identity, styling, banners | Skill tool | yes | some features call Gemini (key present) | Logo generation would be AI-made, not official | Reuse design-system for tokens; **do not** generate an "official" logo |
| dataviz | built-in plugin skill (listed by the Skill tool, not in the workspace folder) | Chart design method + palette validator | Skill tool | yes | — | — | Reuse for chart scenes and dashboard charts |
| watch | `../.claude/skills/watch` | Watch/summarise a video (yt-dlp + ffmpeg + Gemini) | Skill tool | yes | yt-dlp (verified), ffmpeg (verified), `GEMINI_API_KEY` (set) | Many video sites blocked by network policy in cloud | Reuse for competitor/trend Reel analysis |
| last30days | `../.claude/skills/last30days` | What people say lately (Reddit, X, YouTube, TikTok…) | Skill tool | partially | network | Many sources likely blocked in cloud; run its doctor | Reuse in research-topics |
| research | `../.claude/skills/research` | Primary-source research to a Markdown file | Skill tool | yes | WebSearch/WebFetch | — | Reuse by research-analyst |
| writing-skills | `../.claude/skills/writing-skills` | Conventions for writing skills | Skill tool | yes | — | — | Followed for `.claude/skills/` |
| no-ai-slop | `../.claude/skills/no-ai-slop` | De-AI writing edits | Skill tool | yes | — | — | Reuse by editorial-copywriter |
| instagram (Hyper) | `../.claude/skills/instagram` | Publish Reels, insights via Hyper MCP | Skill tool | **no** | Hyper MCP (not connected), IG professional account | Acts on live accounts | Future publishing/insights option, only behind G5 |
| other Hyper skills (meta-ads, tiktok, …) | `../.claude/skills/<name>` | Ads and social via Hyper MCP | — | **no** | Hyper MCP | Paid/live actions | Not used |
| skill-inspector | `../.claude/skills/skill-inspector` | Security review of third-party code | Skill tool | yes | `skillspector` v2.12.0 (verified) | — | Mandatory before adding deps/skills |
| test-driven-development, systematic-debugging, code-review-and-quality, ci-cd-and-automation | `../.claude/skills/<name>` | Engineering discipline | Skill tool | yes | — | — | Reuse by automation-engineer and qa-reliability-engineer |

## 3. Workspace agents (BennAI marketing team)

44 agents in `../.claude/agents/` (Dutch, generic marketing, written for the old workspace profile;
they save to `content/...`, which the parent CLAUDE.md maps to `marketing/content/`).

| Agent | Purpose | Usable now? | Limitation | Reuse decision |
| --- | --- | --- | --- | --- |
| videoscript-schrijver | Short-video scripts: hook in 2 s, 3–5 beats, one action | yes | No financial accuracy, the previous client context, saves to marketing/ | **Method reused** by editorial-copywriter (not invoked directly) |
| hook-specialist | Openers and headlines | yes | same | Method reused by editorial-copywriter |
| bewijscontroleur | Claim table with status ONDERBOUWD / ALLEEN AANGELEVERD / TEGENSTRIJDIG / ONBEVESTIGD | yes | Marketing claims, not finance | Status vocabulary reused by financial-fact-checker |
| carrousel-maker | Carousel structure | yes | — | Future (carousel format, phase 6) |
| eindredacteur | Final language/consistency edit | yes | Has Edit on source text | Method reused in G2 checklist |
| merkstem-bewaker, kwaliteitscontroleur | Brand voice check; GO/HERZIEN verdict | yes | — | Pattern reused in review-content |
| contentkalender-planner | Calendar with format mix | yes | — | Method reused by content-strategist |
| trendspotter | Trends and news hooks | yes | — | Method reused by research-analyst |
| data-analist, experiment-coach | Trends in exports; hypothesis-driven experiments | yes | — | Method reused by growth-analyst |

Decision: Rendementjager agents are self-contained and **reference** these methods instead of
invoking them, so the old workspace profile and `marketing/` save paths never touch Rendementjager output.

## 4. Hooks and settings

- `../.claude/hooks/session-start.sh` (registered in `../.claude/settings.json`): in cloud sessions
  installs SkillSpector (pinned v2.12.0), ffmpeg, yt-dlp, configures `watch` for Gemini, and runs
  `npm ci` in `../video`. It does **not** install `rendementjager/` dependencies (follow-up for the
  Chief of Staff; changing the hook is outside this agent's ownership).
- `../.claude/settings.json` env: `HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1`, `HYPERFRAMES_SKIP_SKILLS=1`.
- No project-level `rendementjager/.claude/settings.json` exists.

## 5. MCP servers (reported by the session; not exercised by this audit)

| Server | Status | Use for Rendementjager |
| --- | --- | --- |
| Gmail | tools available | Possible owner notifications (draft only; sending needs explicit instruction) |
| Google Calendar | tools available | Possible content calendar mirror (not planned yet) |
| Google Sheets | tools available | Possible metrics import/export; `@rj/integrations` has a Sheets mock |
| GitHub | **failed to connect this session** (proxy tunnel 403); `gh` CLI exists at `/usr/local/bin/gh` | CI later; retry next session |
| Composio | tools available | Not used; would need security review per toolbox rules |
| Claude Docs | tools available | Not used for pipeline state |
| Hyper MCP | **not connected** | Needed for Hyper `instagram` skill (future publish/insights) |

## 6. Runtime and tools (verified)

| Tool | Version / finding |
| --- | --- |
| Node | v22.22.0 (satisfies >= 22.13) |
| npm / pnpm | 10.9.4 / 10.28.0 (project uses npm workspaces) |
| `node:sqlite` | Works (`DatabaseSync` in memory). Bundled SQLite reports **3.50.4** (the brief said 3.45; 3.45 may be a system library — no `sqlite3` CLI is installed). Node prints an ExperimentalWarning |
| ffmpeg | 6.1.1 (`ffmpeg -version`) |
| Chromium | `/opt/pw-browsers/` has `chromium-1243`, `chromium_headless_shell-1243`; `../video/remotion.config.ts` already points Remotion at the headless shell |
| Remotion | `../video/node_modules/remotion` = **4.0.535** (package.json ranges are `^4.0.0`; lockfile pins 4.0.535) |
| Python | 3.13.17 |
| skillspector / yt-dlp / gh / flock | present in `~/.local/bin` or `/usr/bin` |
| espeak-ng | **not installed when this audit was written; installed and working on 2026-10-30 (QA pass)** (`.env.example` names it as the local TTS fallback; voice-engine needs to install or pick another fallback) |
| Fonts | Inter installed system-wide (`/usr/share/fonts/opentype/inter`); **Manrope not installed** (`fc-list` 0 hits) — must be bundled in `assets/fonts/` or loaded via `@remotion/fonts` |

## 7. Environment variables and network (verified)

| Item | Finding |
| --- | --- |
| `ELEVENLABS_API_KEY` | not set |
| `ANTHROPIC_API_KEY` | not set (agents run as Claude Code subagents; no direct API calls) |
| `BUFFER_ACCESS_TOKEN` | not set |
| `GEMINI_API_KEY` | set (used by `watch`) |
| api.elevenlabs.io | **blocked**: `curl` → `CONNECT tunnel failed, response 403`. ElevenLabs cannot work in cloud sessions even with a key; local machine only, or ask the environment admin to allow the host |
| registry.npmjs.org | reachable (HTTP 200) |

## 8. Implications

1. Voice: only a local fallback can run here, and espeak-ng is missing. All audio from the fallback
   must be labelled "not the brand voice" and cannot pass G4 for publication.
2. Logo: placeholder wordmark only until the owner supplies an official asset (see BRAND_GUIDELINES).
3. Publishing and insights: no live route exists (no Buffer key, Hyper MCP not connected,
   no Meta app). Distribution stays mock.
4. Scheduling: this container is ephemeral; see ARCHITECTURE "Scheduling honesty".
5. Project agents/skills in `rendementjager/.claude/` load when Claude Code's project directory is
   `rendementjager/`. Whether they are discovered from a session rooted at `AI-workspace/` is
   **to be verified** (skills in nested folders are typically path-scoped; agents may not be).
