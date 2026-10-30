# Rule: financial accuracy

Applies to every script, caption, on-screen text, cover and report.

- Every number comes from `@rj/finance-engine` (deterministic, unit-tested) or from a cited source
  in the approved source registry (`@rj/research-engine`). Record the source URL + access date.
- Never invent returns, rates, tax figures, statistics, quotes or examples presented as real.
- State assumptions on screen when a calculation depends on them (rendement %, looptijd, inflatie,
  kosten, belasting). Historical returns are labelled as historical; never imply a guarantee.
- Dutch tax and regulation (box 3, AOW, pensioen, hypotheekrenteaftrek, toeslagen) change yearly:
  name the tax year and use the current official source (Belastingdienst, Rijksoverheid, DNB, AFM).
- Format money with `Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })`.
- Education, not advice: no "koop X", no named product/fund recommendation, no personal advice,
  no return promises, no urgency/FOMO. Risks are mentioned whenever returns are.
- Unknown = say unknown. Missing metrics are `null`, never `0`.
- Any doubt → status `REVISION_REQUIRED` with the reason; never "probably fine".

Full policy: `docs/EDITORIAL_POLICY.md`.
