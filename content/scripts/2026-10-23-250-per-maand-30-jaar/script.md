# Wat doet €250 per maand beleggen over 30 jaar?

- Template: C "Geld in cijfers" · 1080x1920 · 30 fps · ~47 s
- Status: CONCEPT (nog geen G2/G3/G5). Bron van alle cijfers: `@rj/finance-engine` `buildReelCalculation()` (standaardinput, geen overrides).
- Voice-over: LOKALE FALLBACK (espeak-ng/MBROLA nl2), niet de merkstem. Vervangen door ElevenLabs vóór publicatie.

## Aannames (zoals de finance-engine ze rekent)
- Inleg €250 aan het **eind** van elke maand, 360 maanden.
- Hypothetisch gemiddeld rendement 7% **effectief per jaar** (dus niet 7%/12 per maand), rente-op-rente **per maand** (maandfactor (1,07)^(1/12)).
- Geen kosten, geen belasting (box 3). Inflatie 2% per jaar alleen voor de koopkrachtnotitie.
- Uitkomst: inleg €90.000, eindwaarde €292.363, waarvan €202.363 rendement; ≈ €161.405 in koopkracht van nu.

## Tekst (gesproken, per scène)
| Scène | Voice-over |
| --- | --- |
| Hook | Wat doet €250 per maand beleggen over 30 jaar? |
| Aannames | We rekenen met een hypothetisch rendement van 7% effectief per jaar. Je legt aan het eind van elke maand €250 in. Het rendement wordt per maand verrekend. |
| Berekening | In 30 jaar leg je zelf €90.000 in. Door rente op rente groeit dat in dit voorbeeld naar ruim €292.000. |
| Resultaat | Daarvan is ruim €202.000 rendement. Reken je met 2% inflatie per jaar, dan is hetzelfde eindbedrag ruim €161.000 in geld van nu. |
| Risico's | Dit is een rekenvoorbeeld, geen garantie. Het eindbedrag is nominaal: kosten, belasting en inflatie zitten er niet in. En echte rendementen schommelen: sommige jaren gaat het omlaag. |
| CTA | Volg @rendementjager voor meer inzicht. |

Gesproken bedragen zijn naar beneden afgerond ("ruim"), zodat ze nooit hoger klinken dan de berekening. Op het scherm staan de exacte bedragen.

## Op het scherm
- Doorlopend: "Hypothetisch rekenvoorbeeld · geen advies · bedragen exclusief kosten en belasting, inflatie alleen waar vermeld".
- Resultaatscène: staaf 'Eindwaarde (nominaal)' en kaart 'Zelfde eindbedrag in geld van nu, bij 2% inflatie per jaar (aanname)'.
- Outro: tagline 'Meer inzicht.' (de volledige merkbelofte is bewust weggelaten).
- Groeiscène: teller en grafiek tonen alleen waarden uit de maandreeks van de finance-engine (geen interpolatie).
- Risico-scène: kleine lijn "Koersen schommelen" met label **Illustratief** (geen data).
