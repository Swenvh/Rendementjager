# Operations

Commands follow `BUILD_CONTRACT.md` and the root `package.json`. Run everything from
`rendementjager/`. Every command below was run by the independent QA pass on 2026-10-30
(see `QA_REPORT.md`); items still marked **(to be verified)** were not run.

## Install

```bash
cd rendementjager
cp .env.example .env                    # fill only what you need; all keys optional
flock /tmp/rj-npm.lock npm install      # root only; never inside a package dir. A clean checkout also works with `npm ci` (verified 2026-10-30)
```

Adding a dependency: `flock /tmp/rj-npm.lock npm install <pkg> --save-exact -w @rj/<name>`, after the
security check in `CLAUDE.md` for anything new.

## Test and typecheck

```bash
npm run test          # all workspaces + tests/ integration (verified 2026-10-30)
npm run typecheck     # (verified 2026-10-30)
```

## Database

```bash
npm run db:migrate    # applies SQL migrations to RJ_DB_PATH (verified 2026-10-30, fresh copy)
npm run db:seed       # seeds six IDEA-stage topics (no sources, briefs or approvals); idempotent (verified 2026-10-30)
```

Default DB file: `data/rendementjager.sqlite` (git-ignored). Never edit stages or approvals with
raw SQL; use the API or content-engine so the audit log and gate rules apply.

## Mission Control (dashboard + API)

```bash
npm run dev                                   # API http://127.0.0.1:8787 + UI http://127.0.0.1:5173 (Vite proxies /api and /media); verified 2026-10-30
npm run build -w @rj/mission-control          # builds the UI into apps/mission-control/dist; verified 2026-10-30
npm run start                                 # built UI + API on one port (RJ_API_PORT, default 8787); verified 2026-10-30
curl -s http://127.0.0.1:8787/api/health      # {"ok":true,"service":"mission-control","db":"ok",...}; verified 2026-10-30
npm test -w @rj/mission-control               # API tests incl. G5 bypass attempts and restart persistence; verified 2026-10-30
npm run link-first-reel -w @rj/mission-control  # attaches the existing MP4 (real sha256), cover and caption to the seeded EUR 250 item; approves nothing; verified 2026-10-30
```

The API has no authentication, so it also refuses non-JSON state-changing requests (CSRF) and requests whose Host is not
localhost/127.0.0.1/[::1] (DNS rebinding; extend with `RJ_ALLOWED_HOSTS=name1,name2` if you expose it on purpose). Anyone who can
reach the port can act as any actor, the owner included: do not expose it. It binds to 127.0.0.1 (override with `RJ_API_HOST`); keep it on localhost.
G5 is only accepted by `POST /api/content/:id/owner-approval` (the owner-approval button in Video Studio): the
server re-hashes the MP4 on disk and the stored caption and rejects stale or mismatching hashes. The generic
approvals endpoint refuses G5 for every actor. Screenshots of the UI: `docs/screenshots/`.

## Worker

```bash
npm run worker -- --once     # claim ready jobs, run them with timeouts/caps, exit (verified 2026-10-30: empty queue -> "processed 0")
```

```bash
npm run worker -- --enqueue render_batch [--limit N] --run   # render every Reel with G2+G3 (RJ_RENDER_CONCURRENCY, default 2)
npm run series -- plan|generate|week|capacity                # see docs/SERIES.md
```

Use `--once` for every scheduled run (cron, Claude Code scheduled task, CI). Do not rely on a
long-running worker in a cloud session; it dies with the container.

## Publishing (Phase 5)

```bash
npm run publish -- export <contentId>   # output/publish/<slug>/: video.mp4, cover.png, caption.txt, hashtags.txt, schedule.txt, manifest.json (refuses without a valid owner G5)
npm run publish -- verify <contentId>   # recomputes video sha256 + caption hash, checks G5; exit 1 = do NOT post
npm run publish -- due [--run]          # enqueue publish_due for due SCHEDULED items (--run also drains the queue)
npm run publish -- status               # mode, caps, usage in the last 24 h
```

Default is manual: a due item is "klaargezet" (staged); the owner downloads the package on Mission Control > Publicatie, posts it, and
records the `instagram.com/reel/...` link with "Markeer als handmatig gepubliceerd" (G5 is re-checked). Env: `RJ_DAILY_PUBLISH_CAP`
(10), `RJ_PUBLISH_MIN_SPACING_MIN` (60), `RJ_PUBLISH_MODE` (`manual` default | `instagram`), `RJ_PUBLIC_MEDIA_BASE_URL`,
`RJ_PUBLISH_MAX_ATTEMPTS` (3). Live Instagram: see `docs/INTEGRATIONS.md` (untested). Failures land in Publicatie (log + errors) and in
`error_logs` (scope `publish`).

## Render and media QA

```bash
npm run render -w @rj/video-engine -- --content <slug>         # -> output/reels/<slug>.mp4 (verified 2026-10-30 in a fresh copy: ~6 min, byte-identical sha256; only Template C is wired)
npm run qa -w @rj/video-engine -- output/reels/<slug>.mp4      # media QA report (verified 2026-10-30)
sha256sum output/reels/<slug>.mp4                              # hash that G5 binds to
```

Remotion uses the Chromium headless shell in `/opt/pw-browsers` in cloud sessions (as `../video`
does). Renders require stage APPROVED_FOR_PRODUCTION or later.

## Approve (owner only)

G5 is granted by the owner in Mission Control on the READY_FOR_EDITOR item: watch the exact MP4,
read the caption, approve. The approval stores the MP4 sha256 and caption hash. Agents and skills
never call the G5 approval endpoint.

## Emergency stop

1. Set `RJ_EMERGENCY_STOP=1` in `.env` (or the session environment) — the worker claims nothing.
2. Use the Noodstop switch in Mission Control > Instellingen (any actor may switch it on; only the owner can lift it; verified 2026-10-30). It sets the DB flag; `RJ_EMERGENCY_STOP=1` in the environment can only be removed there.
3. Stop any running worker process (`Ctrl+C` / kill the PID).
4. Nothing is published automatically today; if a live integration is ever active, revoke its token
   at the provider.
5. Record the incident (what, when, why) and clear the flag only on owner instruction.

## Backup

The whole state is one SQLite file plus `content/` and `output/`.

```bash
mkdir -p backups
node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; \
  const db=new DatabaseSync(process.env.RJ_DB_PATH ?? 'data/rendementjager.sqlite'); \
  db.exec(\"VACUUM INTO 'backups/rendementjager-$(date +%F).sqlite'\")"
```

`VACUUM INTO` makes a consistent copy while the DB is in use (verified that `node:sqlite` works here;
the exact command was verified 2026-10-30 against a temp copy of the DB; `VACUUM INTO` fails if the target file already exists, and `backups/` is git-ignored). Copy `backups/` off the machine.
In a cloud session the DB is lost when the container ends: export it before ending the session.
