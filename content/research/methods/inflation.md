---
topic: "Methodebrief reeks: inflation"
series_kind: inflation
kind: evergreen
status: draft
brief_hash: d3a0397e1a5b797720a0916e9a4654cc2d6ade63736f0d1cef9ea9e9dacab9ce
created_by: research-analyst
sources: 5
unverified_sources: 5
---

# Inflatie: nominaal tegenover reëel (methodebrief)

Methode voor de inflatiereeks (grid: inleg 50/100/250/500/1000 per maand, 10/20/30 jaar, hypothetische inflatie 2% of 3% per jaar; sparen zonder rendement, 0%; plus een vast voorbeeldbedrag van 1.000 euro).

Reëel tegenover nominaal: reële waarde (in euro's van vandaag) = nominale waarde / (1 + p)^jaren, met p de hypothetische jaarlijkse inflatie. Dit is de Fisher-relatie in de vorm van deflateren: (1 + reëel rendement) = (1 + nominaal)/(1 + p); bij 0% nominaal rendement daalt de koopkracht met factor 1/(1 + p) per jaar. De eindwaarde wordt in zijn geheel met (1 + p)^jaren gedeflateerd (inleg van latere jaren wordt dus iets te sterk gedeflateerd: een conservatieve vereenvoudiging, zichtbaar als aanname).
Functies: futureValueOfMonthlyContributions({..., annualReturn:0, inflationRate:p}).totals.endValueReal en realValueOfAmount(amount, years, inflationRate) / purchasingPowerLoss in packages/finance-engine/src/compound.ts (futureValueOfMonthlyContributions, periodGrowthFactor, annuityFutureValue) en series.ts. Inleg aan het einde van de maand.
Testbewijs (finance.test.ts): "real value deflates by (1+p)^years; null when no inflation given"; realValueOfAmount(1000, 10, 0.02) ~ 820,35 en purchasingPowerLoss ~ 179,65; validatie van invoer (RangeError); 0% rendement: nominaal == som van inleg en reëel kleiner.

Beperkingen:
- Alle parameters (inleg, looptijd, rendement, kosten, inflatie) zijn HYPOTHETISCH en gelden als rekenvoorbeeld; het zijn geen verwachtingen of voorspellingen.
- Geen belasting (bijv. box 3) in het model; geen valutarisico, geen schommelingen: een vast gemiddeld rendement per jaar, terwijl echte rendementen per jaar sterk wisselen en verlies mogelijk is.
- Dit is geen advies en geen productaanbeveling. In het verleden behaalde resultaten bieden geen garantie voor de toekomst.
- De bronnen hieronder leggen de begrippen uit; er staat GEEN cijfer uit een bron in de reeks-items. Elk getal komt uit @rj/finance-engine.
- 2% en 3% inflatie zijn hypothetisch en geen prognose; de feitelijke inflatie (CPI/HICP) verschilt per jaar en per huishouden (eigen bestedingspatroon). De ECB streeft op middellange termijn naar 2% (HICP); dat is een doelstelling, geen voorspelling.

## Kernfeiten en wat niet te claimen
- Inflatie is de gemiddelde prijsstijging van wat consumenten kopen, gemeten als de jaarlijkse verandering van de consumentenprijsindex (CPI); voor hetzelfde bedrag kun je minder kopen (definitie; bronnen UNVERIFIED).
- Reële waarde = nominale waarde / (1 + p)^jaren (Fisher-vorm; realValueOfAmount, getest: 1.000 euro na 10 jaar bij 2% ~ 820,35 euro in euro's van vandaag).
- Inflatiepercentages (2% en 3%) zijn HYPOTHETISCH rekenvoorbeelden; geen CPI-cijfer en geen prognose. Geen actuele CPI-cijfers gebruiken zonder aparte, gedateerde bron.
- Niet claimen: dat inflatie in de toekomst deze waarde heeft, of dat sparen/beleggen deze koopkracht beschermt.

## Bronnen
- [Inflatie (CBS, begrippen)](https://www.cbs.nl/nl-nl/onze-diensten/methoden/begrippen/inflatie) | Centraal Bureau voor de Statistiek (CBS) (tier 1) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: definitie van inflatie en berekening uit de CPI (zoekresultaat).
- [Wat meet de CPI? (CBS)](https://www.cbs.nl/nl-nl/longread/diversen/2026/cpi-lange-onderzoeksbeschrijving/1-wat-meet-de-cpi-) | Centraal Bureau voor de Statistiek (CBS) (tier 1) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: wat de consumentenprijsindex meet (zoekresultaat).
- [Two per cent inflation target (ECB)](https://www.ecb.europa.eu/mopo/strategy/pricestab/html/index.en.html) | Europese Centrale Bank (ECB) (tier 1) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: prijsstabiliteit, 2%-doelstelling op middellange termijn, HICP (zoekresultaat).
- [Hoe wordt koopkracht berekend? (Rijksoverheid)](https://www.rijksoverheid.nl/onderwerpen/koopkracht/vraag-en-antwoord/hoe-wordt-koopkracht-berekend) | Rijksoverheid (tier 1) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: koopkracht en inflatie (zoekresultaat).
- [Wat is de impact van inflatie op loon, vermogen en schuld? (DNB)](https://www.dnb.nl/algemeen-nieuws/achtergrond-2025/wat-is-de-impact-van-inflatie-op-loon-vermogen-en-schuld/) | De Nederlandsche Bank (DNB) (tier 1) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: effect van inflatie op vermogen (zoekresultaat).

## Goedkeuring
G1 voor reeks-items wordt uitsluitend door de eigenaar vastgelegd (Mission Control, Methodebrieven), gebonden aan de brief-hash hierboven. Elke wijziging van deze brief maakt die goedkeuring ongeldig.
