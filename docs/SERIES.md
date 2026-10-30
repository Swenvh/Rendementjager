# Series and volume layer

Goal: many Reels per week (the owner wants "hoe meer hoe beter", as Instagram *trial reels*, which are shown to non-followers first) without invented numbers, without a feed full of near-identical posts, and without bypassing the owner's approval. `@rj/series-engine` generates drafts deterministically; people (and the five gates) decide what ships.

## What a series is

A series is a parameter grid. Each grid point is a calculation topic; each topic can be told with three hook patterns (question, statement, contrast), each pattern with three Dutch phrasings picked deterministically. Every number comes from `@rj/finance-engine`.

| Kind | Grid | Topics | Drafts (x3 hooks) |
| --- | --- | --- | --- |
| `compounding` ("Geld in cijfers: rente op rente") | monthly 50/100/250/500/1000 x 10/20/30 years x hypothetical 4/6/7/8% effective per year | 60 | 180 |
| `cost` (cost comparison) | same amounts and years, 7% hypothetical, yearly costs 0,2% vs 1,5% / 1% / 0,8% (`compareAnnualCosts`) | 45 | 135 |
| `inflation` | amounts x years x 2%/3% inflation, saving without return, nominal vs real (`futureValueOfMonthlyContributions` + `realValueOfAmount`) | 30 | 90 |
| **Total** | | **135** | **405** (270 with 2 variants per topic, 135 with 1) |

The first Reel (compounding 250/30/7%, question) was made by hand and is never regenerated. Extending a grid (more amounts, returns, cost pairs, new kinds) is a code change in `grids.ts`/`build.ts` with tests; capacity then grows multiplicatively.

Each draft contains: Dutch script (storyboard scenes for Template C), on-screen props (`storyboard.json` -> `onScreen`), caption (disclaimer line, risk warning, 5 hashtags), `series.json` (experiment tags, claims, hashes), metadata, and one `FinancialClaim` per number with a machine-readable `calculationRef` (`@rj/finance-engine:<fn>(<json input>)#<path>`). Hashes: `contentHash` (script + on-screen + caption + claims; date independent, used for dedupe) and `propsHash` (what the renderer consumes).

Limits of Template C for the new kinds (the template was not changed): the video shows one calculation. For `cost` the video shows the high-cost scenario; the low-cost end value and the difference are in the always-visible footnote and the voice-over. For `inflation` it shows saving at 0% return with the inflation card. A dedicated comparison scene would be a template change for the video owner.

## Trial reels and experiment tags

Every item is `trial: true` and carries `{kind, hookPattern, amount, horizon, template, durationS (estimate, replaced by the measured value after rendering), variantGroup, variantIndex, ratePct}` in `ContentIdea.notes` (JSON, no schema change) and in `content/scripts/<slug>/series.json` (the renderer rewrites `metadata.json`, so `series.json` is the stable record). A *variant group* is one topic with 2 or 3 differently-hooked variants (A/B): same numbers, different hook pattern/phrasing. The analytics-engine can join snapshots to these tags later; until real metrics exist they stay `null`.

## Variation rules (enforced, tested)

1. Spacing: consecutive items differ in at least two of kind, hook pattern, amount, horizon.
2. Hook-pattern rotation: never the same pattern three times in a row; patterns are kept balanced over a plan.
3. Variants of one topic are at least 6 items apart (`minVariantGap`) and at most `--variants` (default 2, max 3, env `RJ_SERIES_VARIANTS`).
4. Per-series maximum (`--max-per-kind`), default unlimited; the week planner caps each kind at its mix share.
5. Dedupe: by `contentHash` and by topic hash (title) against `content_items`, and against `content/scripts/*/series.json`.
6. When the rules leave fewer items than requested the planner stops short and says why; it never breaks a rule.

## Commands

```bash
npm run series -- plan --kind all --count 25          # dry run: list, variety, spacing check, render-hours estimate
npm run series -- generate --kind cost --count 40     # writes content/scripts/<date>-<slug>/ and registers rows (stage IDEA)
npm run series -- week                                # weekly capacity plan (RJ_WEEKLY_TARGET, default 30, no hard cap)
npm run series -- capacity                            # how many unique drafts the grids allow
```

Options: `--kind compounding|cost|inflation|all`, `--variants 1..3`, `--date yyyy-mm-dd`, `--out <dir>` (use a temp dir plus `RJ_DB_PATH=<temp db>` to try things out), `--json`.

`generate` registers a ContentIdea (stage **IDEA**), an immutable ScriptRevision (caption set), a Storyboard row and FinancialClaims (`unverified`). It never approves a gate and does not move the stage: IDEA -> SCRIPTING still needs G1, and nothing here weakens it. Series items have no external source, so G1 for them is covered by a **method brief** (below) that the owner approves once per series kind.

## Method briefs and G1 for series

One `ResearchBrief` per series kind (`compounding`, `cost`, `inflation`), topic `Methodebrief reeks: <kind>`, stored with `Source` rows by `@rj/research-engine` and exported as markdown in `content/research/methods/<kind>.md`. Each states the formula and conventions (effective-annual rate, month-end contributions, cost as `(1+r)(1-c)` not `r-c`, real value = nominal / (1+p)^years), the exact `@rj/finance-engine` functions, the unit-test evidence, the limitations (all parameters hypothetical, no tax, no volatility, education not advice) and authoritative sources for the concepts only (no statistic from a source ends up in an item; every number comes from the finance-engine). Sources that could not be fetched are recorded as `UNVERIFIED` (excerpt starts with "UNVERIFIED"); the Review UI shows the flag and the owner must tick an acknowledgement. Create or list them: `npm run methods -- seed|list` (creates drafts, approves nothing).

How G1 works for a series item:

1. The owner opens **Methodebriefs** in Mission Control (`#/methodebrieven`), reads the brief and presses **G1 goedkeuren voor serie**. The API (`POST /api/methods/:kind/approve`) needs the owner-action header, the exact confirmation sentence, the brief id and the brief hash the owner reviewed.
2. `WorkflowService.approveMethodBriefForSeries` (owner only) marks the brief approved and records one G1 approval (actor `owner`, notes `METHOD_BRIEF_G1 {briefId, briefHash, kind}`) on each series item of that kind that is still before SCRIPTING. The approval row is the item's reference to the brief by id and hash. Items generated later need another click (idempotent).
3. The gate check re-verifies every time: the approval counts only if it was given by the owner, the item is a series item of the same kind as the brief, the brief is still approved and its **current hash equals the approved hash**. Editing the brief or any of its sources changes the hash, so G1 stops counting for all linked items at once (`invalidateStaleMethodApprovals` also marks the rows invalidated, with audit). "Goedkeuring intrekken" does the same on purpose.
4. No agent can do this: other actors get `NOT_AUTHORIZED` (audited), `recordApproval` refuses the marker, and a marker row from anyone but the owner never counts. G2 to G5 are unchanged and still needed per item.

Tests: `packages/content-engine/src/method-g1.test.ts` (agent actors, forged marker, stale hash, wrong kind, copied approval, brief edit, revoke, unverified without acknowledgement), `packages/research-engine/src/research.test.ts`, `apps/mission-control/test/methods.test.ts`. Source status at time of writing: all sources UNVERIFIED (hosts blocked in the cloud session; titles and URLs come from search results of 2026-10-30). A reviewer with network access must open each URL, confirm the page says what the brief claims, replace the UNVERIFIED excerpt with a short verified one and update the brief; the owner then approves the new hash.

## Weekly capacity planner

`npm run series -- week` splits `RJ_WEEKLY_TARGET` over the mix from CLAUDE.md (30/25/20/15/10, largest remainder): vermogensopbouw = compounding drafts, beleggen/ETF's = cost drafts, persoonlijke financiën = inflation drafts, **markt en economie = placeholders for current-news explainers** (they need a research brief with dated sources; agents fill them, they are never auto-generated), fouten/mythes = existing evergreen ideas or placeholders. Exhausted series supply becomes an explicit placeholder. The output lists slots per day and a render estimate. 100 Reels/week: 70 generated drafts + 30 placeholders to be filled by agents.

## Rendering at volume

`render_batch` (worker): `npm run worker -- --enqueue render_batch [--limit N] --run`, or "Zet alle klare items in de render-wachtrij" on the Review page. Only items with valid G2 + G3. Env: `RJ_RENDER_CONCURRENCY` (default 2), `RJ_RENDER_JOB_TIMEOUT_MS` (per render, default 15 min), `RJ_RENDER_DAILY_MINUTES_CAP` (default 480), `RJ_RENDER_ITEM_RETRIES` (default 1), `RJ_RENDER_MINUTES_PER_REEL` (estimate, default 4), `RJ_RENDER_COST_PER_REEL_CENTS` (default 0; checked against the per-job and daily cost caps), `RJ_EMERGENCY_STOP`. Idempotent: `output/reels/<slug>.render.json` stores the input hash (storyboard + TTS provider + template source); identical hash and untouched MP4 means no re-render. Render time: about 4 minutes per Reel on 4 CPUs; 100 Reels is about 6,7 machine-hours sequentially. Whether concurrency 2 is faster on 4 CPUs must be measured; the plan prints the sequential figure and a best case.

Voice: renders are voiceless (captions only, reading-speed timings) unless `RJ_TTS_PROVIDER=elevenlabs` with a key. There is no local voice. Paid TTS cost at this volume is unknown and needs the owner's decision (cost caps will stop it).

## Backgrounds and the "Tabel in cijfers" series

- `generate` gives every item a deterministic chain of different clips from the footage manifest (`storyboard.background.clipIds`; rotation over the id-sorted library with a stride of 6 clips per Reel, so neighbouring Reels share none while the library has 12+ clips). Library empty: nothing is set and the Reel uses the animated background. CC BY clips add their mandatory credit line to `caption.md` (above the hashtags); credits for all clips are recorded in `metadata.json` at render time. The content hash does not depend on the background.
- **Tabel in cijfers** (`--kind table`, opt-in; `--kind all` still means the three Template C series): Template D matrix of monthly amount x years -> nominal end value, 4 return rates x 2 amount sets = 8 topics x 3 title patterns = 24 drafts. Every cell is a finance-engine call (claim with `calculationRef`), assumptions are on screen, the disclaimer is in the footer. Items are stored without a `content_items.template` value (DB check allows A/B/C only); the storyboard says D.

## Review at volume

The Review page (`#/review`) has queues by readiness (G1 prep, G2, G3, render, G4, G5, schedule), filters (series, text), keyboard control (`j/k` next/previous, space play, `a` approve, `r` reject, `s` select, `1-7` queue), the numbers table with calculation refs, caption, and all hashes. Automatic checks: numbers recomputed with the finance-engine, forbidden phrases, disclaimers, file hash. Bulk "naar volgende fase" only moves items that pass all checks and whose gate a reviewer already gave (the workflow re-checks); it never approves anything. **G5 stays one approval per exact video sha256 + caption hash**; "Keur deze N goed" calls the owner-approval endpoint once per item with that item's own hashes and requires a "bekeken" tick per item. There is no blanket approval endpoint (tested).

## Spam risk (recommendation, not a blocker)

Instagram can treat large amounts of near-identical posts as low quality, which lowers distribution; there is no public number for where that starts, so treat the figures below as a starting point to test, not as facts. Trial reels are a good way to test this because they reach non-followers first and cost followers nothing. Recommendation: start with the default of 30 per week, keep the mix (no more than about half of the week from one series kind), let at most two variants per topic run, spread variants over different days, and read results per experiment tag before raising `RJ_WEEKLY_TARGET`. Raise it freely when the data supports it; nothing here caps it.

## Idea sheets and a later import (15 ideas, 2026-10-30)

`content/ideas/2026-10-30-15-ideeen.{md,json}` holds 15 worked-out Reel ideas (hooks, 10 s storyboard, on-screen text, table or chart data, caption, hashtags, compliance notes, background suggestion, repeatability score). They are **not rendered and not registered**: the owner reviews them first. Every number is a `@rj/finance-engine` call (`calculationRef` per cell; the tests re-evaluate all of them); the two market-data style items are templates without numbers (`dataOrigin: "template-awaiting-data"`, `dataNeeded` lists source + as-of date + period, product rankings go to the `compliance-reviewer`, EDITORIAL_POLICY 7.3). The JSON is validated by `@rj/content-ideas` (`ideasDocumentSchema`); the table shape mirrors Template D (2-4 columns, 3-20 rows). Rebuild after edits: `npx tsx packages/content-ideas/src/build.ts`, then `python3 packages/content-ideas/scripts/make_xlsx.py` and `node packages/content-ideas/scripts/make-pdf.mjs` (outputs in `output/reports/`).

Import idea for later (not implemented, no series-engine change yet): a one-line command such as `npm run series -- import-ideas content/ideas/2026-10-30-15-ideeen.json --ids 2,9,13` that parses the file with `ideasDocumentSchema`, skips `template-awaiting-data` items unless an owner dataset is given, maps each idea to the existing draft flow (`title`, `hooks[0]`, `onScreen`, `table` for Template D or `chart` for C, `caption`, `claims` with their `calculationRef`, `background.clipId`) and registers it at stage IDEA like `generate` does. Gates G1 to G5 stay untouched; ideas of a new kind need a method brief first (see above).
