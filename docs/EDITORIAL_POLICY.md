# Editorial policy

Applies to all consumer-facing output of Rendementjager (Reels, captions, covers, later TikTok,
Shorts, newsletter, website). The owner is Editor-in-Chief and final approver.

> **Not legal advice.** This policy is an editorial safeguard written by an AI-assisted team. It
> is not a legal opinion on the Wft, MAR or advertising codes. Before monetisation (sponsoring,
> affiliate links, paid products) the owner should have it reviewed by a qualified Dutch
> financial-regulatory lawyer and check current AFM guidance.

## 1. Financial accuracy

1. Every figure is either computed by `@rj/finance-engine` (inputs and assumptions stored with the
   item) or taken from a source in the approved source registry, with URL and access date.
2. Preferred sources: Belastingdienst, Rijksoverheid, CBS, DNB, AFM, ECB, Wettenbank, official
   index/fund factsheets for historical data. News and blogs are leads, not evidence.
3. Tax and regulation figures name the year they apply to ("in 2026"). Re-verify yearly items in
   January and on any announced change (box 3 in particular is in transition — always check).
4. Every return mentioned comes with timeframe, whether before/after costs and inflation, and the
   statement that past results are no guarantee ("In het verleden behaalde resultaten bieden geen
   garantie voor de toekomst" or an equivalent plain-language line).
5. Examples are labelled as examples ("Rekenvoorbeeld"). No fabricated people, testimonials or quotes.
6. Rounding is honest (no rounding up of returns); totals add up on screen.
7. Unknown data is stated as unknown; metrics that are unavailable are `null`, never `0`.

## 2. Education versus advice (AFM boundary — orientation only)

Rendementjager provides **general financial education**. Our working understanding, to be verified
with a lawyer and current AFM publications:

- Explaining how something works (compound interest, box 3, index funds as a concept, costs,
  risk/spread) to a general audience = education.
- Recommending a **specific financial product/instrument** or telling someone what *they* should
  do with their money = may be advice (Wft) or an investment recommendation (MAR), which carry
  licence and disclosure obligations. **We do not do this.**
- Receiving payment for steering people to a provider can make you an intermediary
  (bemiddeling) under the Wft. **No affiliate/sponsor deals with financial providers without
  legal review.**
- AFM has published guidance for "finfluencers"; check the current version before any change of course.

Red lines (automatic compliance FAIL): "koop", "verkoop", "stap nu in" on a named instrument;
named broker/fund/coin as the thing to choose; guaranteed or "zeker" returns; personal situations
answered as advice in comments/DMs; urgency/FOMO; crypto or leverage presented without prominent risk.

## 3. Advertising, sponsoring and affiliate disclosure

- Currently: no ads, sponsors or affiliate links. Any change needs owner approval and legal review.
- If introduced: disclose clearly at the start of the video and in the caption (e.g. "#adv",
  "Advertentie", "Bevat affiliate links") in line with the Reclamecode Social Media &
  Influencer Marketing (RSM) and the platform's paid-partnership tools. Verify current code text.
- Sponsored content still passes all five gates; the sponsor gets no approval right over facts.

## 4. The five gates

| Gate | Name | Owner | Passes when |
| --- | --- | --- | --- |
| G1 | Research | research-analyst (checked by rj-chief-of-staff) | ResearchBrief has a clear question, ≥2 approved sources for each key fact, topic not a duplicate, risks noted |
| G2 | Editorial | editorial-copywriter + content-strategist review | Script follows the format (hook ≤2 s, one idea, 3–5 beats, one CTA), Dutch tone, length fits template, every number tagged with its source/calculation |
| G3 | Fact-check + compliance | financial-fact-checker **and** compliance-reviewer (both must PASS) | Every claim SUPPORTED; no red lines; disclaimers present; assumptions on screen |
| G4 | Media QA | qa-reliability-engineer (via `npm run qa -w @rj/video-engine`) | Technical checks pass (resolution, fps, duration, loudness, safe area, no black frames), on-screen numbers match approved script, audio labelled correctly, placeholder flags reported |
| G5 | Owner approval | **owner only** (Mission Control) | Owner approves the exact MP4 sha256 + caption hash |

### G1 for pure-calculation series items

Series items (`@rj/series-engine`) carry no external source. G1 for them is satisfied only by an **owner-recorded** approval that points at the approved **method brief** of their series kind (brief id + content hash). It does not replace G2 to G5. It stops counting when the brief or its sources change, when the brief is un-approved, or when the item belongs to another kind. No agent may record or forge it; unverified sources need an explicit owner acknowledgement. Details: `docs/SERIES.md`.

## 5. Approval invalidation

- Method brief changed after the owner's G1 for a series → G1 invalid for every linked item until the owner approves the new brief hash.
- Script changed after G3 → G2 and G3 invalid; item returns to SCRIPT_READY.
- MP4 or caption changed after G5 → G5 invalid; item returns to READY_FOR_EDITOR.
- SCHEDULED/PUBLISHED only with a valid G5 for the current hashes; the scheduler recomputes the hash.
- Corrections after publication: see escalation; a corrected video is a new asset and needs a new G5.

## 6. Escalation procedure

| Situation | Action | Who decides |
| --- | --- | --- |
| Fact cannot be verified | Mark UNVERIFIED, remove or rephrase without the claim; if central to the item → REVISION_REQUIRED | fact-checker → copywriter |
| Fact-checker and compliance disagree, or legal doubt | Stop; item stays in FACT_CHECK with both reports; ask owner | owner |
| Possible advice/MAR issue | Compliance FAIL, never "soften and pass" | owner (and lawyer if monetised) |
| Error found after publishing | Emergency stop for scheduling of related items; draft correction (pinned comment / corrected video); log incident | owner |
| Leaked secret, unexpected spend, unexpected publishing | `RJ_EMERGENCY_STOP=1`; report | owner |
| Comment/DM asking for personal advice | Do not answer individually; generic education response template only after owner approval | owner |

Every escalation is recorded in the audit log with reason and actor.

## 7. Footage, voice and rankings

### 7.1 Background footage: only licensed or owner-provided
1. Backgrounds come from the footage library (`assets/footage/manifest.json`). A clip is used only with a complete manifest entry (id, file, title, source URL, author, licence, licence URL, retrieved date, location, duration, resolution) and an allowed licence: Pexels License, Pixabay Content License, CC0, CC BY (with credit), or Owner-provided. The validator refuses everything else; it cannot be switched off.
2. **YouTube downloads are not supported by design (copyright).** There is no command that downloads a normal YouTube video, and nobody should add one. The only YouTube route is `footage fetch --provider youtube-cc`, which reads the video metadata first and refuses unless the licence is "Creative Commons Attribution" (CC BY). The credit line is then mandatory in `caption.md` and recorded in `metadata.json`.
3. Owner-provided footage (own drone files, or files the owner declares rights for) is recorded as `Owner-provided` with a `rightsNote` ("Owner declares rights held; not independently verified"). The system does not verify the rights: the responsibility stays with the owner, who is also the only G5 approver.
4. The owner confirms the licence on the video page. Third-party content inside a CC video (music, other people's footage) may not be covered by the licence, so only muted video is used; audio is always stripped. A visible watermark or title card in a source is avoided (plan `avoid` ranges, crop focus) and checked on a frame.
5. A Reel that uses a clip whose licence asks for credit is not G4-clean until the credit line is in the caption (Review shows this).

### 7.2 Voice
No local or robotic voice exists. Without an ElevenLabs key a Reel is voiceless (captions only, timings from reading speed). ElevenLabs is an explicit, paid opt-in (`RJ_TTS_PROVIDER=elevenlabs` plus key). A voiceless Reel is valid for media QA.

### 7.3 Tables and rankings (Template D)
1. Calculated tables (finance-engine) follow section 1: assumptions on screen, nominal vs real stated, disclaimer in the footer.
2. Market-data rankings use only an owner-provided dataset (`npm run dataset -- import`): source, as-of date and period on every row, one period per ranking, sorted order verified. Figures are never recalled from memory or filled in by an agent.
3. **A ranking of products (funds, ETFs, shares) by past performance is escalated to the `compliance-reviewer` before G3.** Risks: it reads as a recommendation and invites cherry-picking (period, universe). The import flags `subject: products` and writes `compliance.json`; the item cannot pass G3 without the reviewer's verdict. Rankings of macro data (inflation, rates by country) follow the normal G3.
4. Every table shows the disclaimer "Rendementen uit het verleden bieden geen garantie voor de toekomst. Geen beleggingsadvies." in the footer, plus source and as-of date.
