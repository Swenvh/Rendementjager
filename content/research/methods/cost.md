---
topic: "Methodebrief reeks: cost"
series_kind: cost
kind: evergreen
status: draft
brief_hash: 3d1059de6a144d2ffe4c2c39989497436ab7e32cbf4587c5983047810a91da38
created_by: research-analyst
sources: 2
unverified_sources: 2
---

# Kosten van beleggen (kostenvergelijking) (methodebrief)

Methode voor de kostenreeks (grid: inleg 50/100/250/500/1000 per maand, 10/20/30 jaar, hypothetisch 7% effectief per jaar vóór kosten, jaarlijkse kosten 0,2% tegenover 1,5% / 1,0% / 0,8%).

Kostenbehandeling: de jaarlijkse kostenvoet c wordt ingehouden op het belegde vermogen. Netto groeifactor per jaar = (1 + r) x (1 - c); maandelijks g = ((1 + r)(1 - c))^(1/12). Dit is NIET r - c: bij r = 7% en c = 1,5% is de netto groei 5,395% per jaar, niet 5,5%. Kosten worden elke maand pro rata ingehouden; in- en uitstapkosten, transactiekosten en spreads zitten niet in het model.
Functies: compareAnnualCosts(base, lowCostRate, highCostRate) in packages/finance-engine/src/series.ts (twee runs van futureValueOfMonthlyContributions met alleen annualCostRate verschillend; verschil = eindwaarde laag minus hoog; inleg is gelijk). Inleg aan het einde van de maand, effectieve conventie.
Testbewijs (finance.test.ts, "series helpers"): compareAnnualCosts == twee directe engine-runs; gelijke kosten geven verschil 0; omgekeerde kosten (laag > hoog) gooit RangeError; kosten verlagen het resultaat en matchen brute force (maandelijkse kostenfactor).

Beperkingen:
- Alle parameters (inleg, looptijd, rendement, kosten, inflatie) zijn HYPOTHETISCH en gelden als rekenvoorbeeld; het zijn geen verwachtingen of voorspellingen.
- Geen belasting (bijv. box 3) in het model; geen valutarisico, geen schommelingen: een vast gemiddeld rendement per jaar, terwijl echte rendementen per jaar sterk wisselen en verlies mogelijk is.
- Dit is geen advies en geen productaanbeveling. In het verleden behaalde resultaten bieden geen garantie voor de toekomst.
- De bronnen hieronder leggen de begrippen uit; er staat GEEN cijfer uit een bron in de reeks-items. Elk getal komt uit @rj/finance-engine.
- 0,2% en 1,5% zijn hypothetische kostenpercentages om het effect van het kostenverschil te laten zien; ze zeggen niets over wat een bepaald product of een bepaalde aanbieder rekent. Geen productnamen, geen aanbeveling.

## Kernfeiten en wat niet te claimen
- Beleggingsproducten hebben doorlopende kosten (bijv. beheer- en servicekosten) die het rendement verlagen; het verschil telt op over de jaren (concept; bronnen UNVERIFIED).
- Kostenbehandeling in het model: netto groeifactor per jaar = (1 + r)(1 - c), ingehouden op het vermogen; niet r - c (compareAnnualCosts, getest).
- Kostenpercentages (0,2% / 0,8% / 1,0% / 1,5%) en het rendement (7%) zijn HYPOTHETISCH; geen productkosten van een bestaande aanbieder.
- Niet claimen: dat een bepaald product/aanbieder deze kosten heeft, dat lage kosten hoger rendement garanderen, of een keuze tussen producten.

## Bronnen
- [Wat kost beleggen? (Autoriteit Financiële Markten)](https://www.afm.nl/nl-nl/consumenten/themas/zelf-beleggen/wat-kost-beleggen) | Autoriteit Financiële Markten (AFM) (tier 1) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: soorten kosten van beleggen, o.a. doorlopende productkosten (zoekresultaat).
- [Transparency of costs (AFM)](https://www.afm.nl/en/sector/themas/belangrijke-europese-wet--en-regelgeving/mifid-ii/bescherming-beleggers/kostentransparantie) | Autoriteit Financiële Markten (AFM) (tier 1) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: MiFID II-kostentransparantie: overzicht van verwachte kosten vooraf (zoekresultaat).

## Goedkeuring
G1 voor reeks-items wordt uitsluitend door de eigenaar vastgelegd (Mission Control, Methodebrieven), gebonden aan de brief-hash hierboven. Elke wijziging van deze brief maakt die goedkeuring ongeldig.
