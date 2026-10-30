---
topic: "Methodebrief reeks: compounding"
series_kind: compounding
kind: evergreen
status: draft
brief_hash: 6cc50c63fcc19c63f189ba9e1238889d4d6b261f57760c016c23f98955c9598a
created_by: research-analyst
sources: 2
unverified_sources: 2
---

# Rente op rente (maandelijks inleggen) (methodebrief)

Methode voor reeks "Geld in cijfers: rente op rente" (grid: inleg 50/100/250/500/1000 per maand, 10/20/30 jaar, hypothetisch 4/6/7/8% effectief per jaar).

Formule: maandelijks groeifactor g = (1 + r)^(1/12) (effectieve conventie, geen r/12); eindwaarde = M x (g^n - 1) / (g - 1) met n = 12 x jaren en M de maandinleg. Inleg aan het EINDE van elke maand (gewone annuïteit, timing "end"); de eerste inleg groeit dus 12 x jaren - 1 maanden.
Functie: futureValueOfMonthlyContributions({monthlyContribution, years, annualReturn, compounding:"monthly", timing:"end", rateConvention:"effective", annualCostRate:0}) in packages/finance-engine/src/compound.ts (futureValueOfMonthlyContributions, periodGrowthFactor, annuityFutureValue) en series.ts. Uitkomsten zijn ongeronde floats; weergave via formatEur (nl-NL).
Testbewijs (packages/finance-engine/src/finance.test.ts): gesloten formule == brute-force maand-voor-maand simulatie voor effectief en nominaal, begin/eind van de maand, jaarlijkse samenstelling; 0% rendement = som van inleg; 0 jaar = 0; ongeldige invoer gooit RangeError. Series-engine herberekent elk getal in zijn tests uit de calculationRef.

Beperkingen:
- Alle parameters (inleg, looptijd, rendement, kosten, inflatie) zijn HYPOTHETISCH en gelden als rekenvoorbeeld; het zijn geen verwachtingen of voorspellingen.
- Geen belasting (bijv. box 3) in het model; geen valutarisico, geen schommelingen: een vast gemiddeld rendement per jaar, terwijl echte rendementen per jaar sterk wisselen en verlies mogelijk is.
- Dit is geen advies en geen productaanbeveling. In het verleden behaalde resultaten bieden geen garantie voor de toekomst.
- De bronnen hieronder leggen de begrippen uit; er staat GEEN cijfer uit een bron in de reeks-items. Elk getal komt uit @rj/finance-engine.
- Effectief 7% per jaar is geen nominaal 7% (maandelijks samengesteld r/12 geeft ~7,23% effectief); de video noemt "effectief per jaar".

## Kernfeiten en wat niet te claimen
- Rente-op-rente: over eerder behaalde rente ontvang/behaal je zelf ook weer rente; bij een langere looptijd groeit het bedrag daardoor steeds sneller (concept; bron UNVERIFIED).
- Formule: eindwaarde = M x (g^n - 1) / (g - 1), g = (1 + r)^(1/12), inleg aan het einde van de maand (futureValueOfMonthlyContributions, getest tegen brute force).
- Het rendement in alle items is een HYPOTHETISCH gemiddelde (4/6/7/8% effectief per jaar), geen verwachting of historisch cijfer.
- Niet claimen: dat dit rendement gehaald wordt, dat een product of fonds dit oplevert, of dat belasting/kosten/schommelingen ontbreken in de praktijk.

## Bronnen
- [Verschillende spaardoelen en -vormen (Wijzer in geldzaken)](https://www.wijzeringeldzaken.nl/Sparen/verschillende-spaardoelen-en-vormen/) | Wijzer in geldzaken (tier 2) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: uitleg van het rente-op-rente-effect en het effect van een klein renteverschil op lange termijn (zoekresultaat).
- [Rente (De Nederlandsche Bank)](https://www.dnb.nl/actuele-economische-vraagstukken/rente/) | De Nederlandsche Bank (DNB) (tier 1) | opgehaald/gevonden: 2026-10-30 | UNVERIFIED
  UNVERIFIED: pagina niet opgehaald (sandbox blokkeert de host: DNS/proxy 403); titel en URL komen uit een zoekresultaat van 2026-10-30. Inhoud nog niet gecontroleerd; te verifiëren door een reviewer met toegang. Waarvoor: definitie van rente als vergoeding voor lenen/uitlenen en van spaarrente (zoekresultaat).

## Goedkeuring
G1 voor reeks-items wordt uitsluitend door de eigenaar vastgelegd (Mission Control, Methodebrieven), gebonden aan de brief-hash hierboven. Elke wijziging van deze brief maakt die goedkeuring ongeldig.
