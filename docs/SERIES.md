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

`generate` registers a ContentIdea (stage **IDEA**), an immutable ScriptRevision (caption set), a Storyboard row and FinancialClaims (`unverified`). It never approves a gate and does not move the stage: IDEA -> SCRIPTING needs G1, which needs a research brief with sources from the approved registry. Series items have no external source, so a research-analyst must attach a brief (for example one method brief per series citing CBS/DNB/AFM) before a reviewer can grant G1. **Open decision for the owner:** keep G1 for pure calculation items, or allow a documented shortcut (this would change the transition map in `@rj/shared`; not done here).

## Weekly capacity planner

`npm run series -- week` splits `RJ_WEEKLY_TARGET` over the mix from CLAUDE.md (30/25/20/15/10, largest remainder): vermogensopbouw = compounding drafts, beleggen/ETF's = cost drafts, persoonlijke financiën = inflation drafts, **markt en economie = placeholders for current-news explainers** (they need a research brief with dated sources; agents fill them, they are never auto-generated), fouten/mythes = existing evergreen ideas or placeholders. Exhausted series supply becomes an explicit placeholder. The output lists slots per day and a render estimate. 100 Reels/week: 70 generated drafts + 30 placeholders to be filled by agents.

## Rendering at volume

`render_batch` (worker): `npm run worker -- --enqueue render_batch [--limit N] --run`, or "Zet alle klare items in de render-wachtrij" on the Review page. Only items with valid G2 + G3. Env: `RJ_RENDER_CONCURRENCY` (default 2), `RJ_RENDER_JOB_TIMEOUT_MS` (per render, default 15 min), `RJ_RENDER_DAILY_MINUTES_CAP` (default 480), `RJ_RENDER_ITEM_RETRIES` (default 1), `RJ_RENDER_MINUTES_PER_REEL` (estimate, default 4), `RJ_RENDER_COST_PER_REEL_CENTS` (default 0; checked against the per-job and daily cost caps), `RJ_EMERGENCY_STOP`. Idempotent: `output/reels/<slug>.render.json` stores the input hash (storyboard + TTS provider + template source); identical hash and untouched MP4 means no re-render. Render time: about 4 minutes per Reel on 4 CPUs; 100 Reels is about 6,7 machine-hours sequentially. Whether concurrency 2 is faster on 4 CPUs must be measured; the plan prints the sequential figure and a best case.

Voice: renders use the local fallback voice unless `RJ_TTS_PROVIDER=elevenlabs`. The fallback is not the brand voice. Paid TTS cost at this volume is unknown and needs the owner's decision (cost caps will stop it).

## Review at volume

The Review page (`#/review`) has queues by readiness (G1 prep, G2, G3, render, G4, G5, schedule), filters (series, text), keyboard control (`j/k` next/previous, space play, `a` approve, `r` reject, `s` select, `1-7` queue), the numbers table with calculation refs, caption, and all hashes. Automatic checks: numbers recomputed with the finance-engine, forbidden phrases, disclaimers, file hash. Bulk "naar volgende fase" only moves items that pass all checks and whose gate a reviewer already gave (the workflow re-checks); it never approves anything. **G5 stays one approval per exact video sha256 + caption hash**; "Keur deze N goed" calls the owner-approval endpoint once per item with that item's own hashes and requires a "bekeken" tick per item. There is no blanket approval endpoint (tested).

## Spam risk (recommendation, not a blocker)

Instagram can treat large amounts of near-identical posts as low quality, which lowers distribution; there is no public number for where that starts, so treat the figures below as a starting point to test, not as facts. Trial reels are a good way to test this because they reach non-followers first and cost followers nothing. Recommendation: start with the default of 30 per week, keep the mix (no more than about half of the week from one series kind), let at most two variants per topic run, spread variants over different days, and read results per experiment tag before raising `RJ_WEEKLY_TARGET`. Raise it freely when the data supports it; nothing here caps it.
