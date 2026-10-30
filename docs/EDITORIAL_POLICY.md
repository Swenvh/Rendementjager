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

## 5. Approval invalidation

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
