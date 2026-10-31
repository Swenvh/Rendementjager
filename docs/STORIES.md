# Instagram Stories: set en 7-dagen-schema

Gegenereerd door `npm run stories -- build` (video-engine). Alles is concept: niets is gepubliceerd of ingepland. De eigenaar plaatst de Stories zelf in de app.

## Wat zit erin

Per idee (14 van de 15; idee 14 heeft nog geen data) vier beelden van 1080x1920, in `output/stories/<idee-slug>/`:

- `01-vraag.png`: de vraag, het antwoord staat er niet op (een groot vraagteken).
- `02-antwoord.png`: het echte getal, met label Hypothetisch of Rekenvoorbeeld.
- `03-reel-teaser.png`: "Nieuw: zie de Reel", zonder link (de link-sticker plaats je zelf, pas als de Reel live staat).
- `04-quick-fact.png`: een los feit met één groot getal (staat los van de reeks).
- `stickers.txt`: poll-, quiz-, slider- en vragen-tekst om in te typen.

Reeks = 01, 02 en 03 achter elkaar. Alle getallen komen uit `@rj/finance-engine` via de claims in `content/ideas/2026-10-30-15-ideeen.json`; geen andere accounts' namen, geen verboden zinnen, voetregel op elk beeld: "Rekenvoorbeeld, geen garantie of advies."

## Veilige zones en stickerruimte

- Boven 250 px en onder 250 px staat niets belangrijks (profielbalk en antwoordbalk van Instagram). Het logo met @rendementjager staat net onder 250 px.
- Tussen ongeveer y 1290 en y 1590 (300 px, onder het midden) is bewust niets getekend: daar zet je zelf een poll-, vragen-, quiz-, slider- of link-sticker.
- De build mislukt als tekst niet past, wordt afgekapt, kleiner wordt dan de minimale leesbare maat of in de veilige zones of de stickerband komt.

## Schema week 1 (voorstel, geen data over beste tijden)

| Dag | Reeks (idee) | Ochtend | Middag | Avond | Tussendoor: quick fact (los) |
| --- | --- | --- | --- | --- | --- |
| 1 | 9. €4 per dag: wat wordt dat na 10, 20 en 30 jaar? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 1. Rente per jaar of per dag: wat scheelt het? |
| 2 | 2. 10 jaar eerder beginnen: wat scheelt het? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 5. €200 per maand, 20 jaar: vijf mogelijke rendementen |
| 3 | 4. €10.000 die stilstaat: wat is het later waard? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 7. Noodbuffer: hoeveel is 3 tot 6 maanden uitgaven? |
| 4 | 6. 50/30/20-regel: zo ziet €2.500 netto eruit | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 8. €5.000 lenen: wat kost de rente? |
| 5 | 3. Kosten van 0,2% of 1,5%: wat scheelt het? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 10. €10.000 in één keer of €100 per maand? |
| 6 | 15. Na -50% heb je +100% nodig om terug te zijn | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 11. Financiële vrijheid: wat is 25 keer je uitgaven? |
| 7 | 13. Hoe lang duurt het om €100.000 te bereiken? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 12. Salarisverhoging: wat als je de helft belegt? |

Elke dag: ochtend de vraag met een poll of quiz, middag het antwoord (laat de stemmen zien), avond de teaser nadat de Reel van die dag is gepubliceerd. Geen Reel gepubliceerd? Sla de teaser over. De quick fact plaats je op een rustig moment.

## Schema week 2 (rollen omgedraaid)

| Dag | Reeks (idee) | Ochtend | Middag | Avond | Tussendoor: quick fact (los) |
| --- | --- | --- | --- | --- | --- |
| 1 | 1. Rente per jaar of per dag: wat scheelt het? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 9. €4 per dag: wat wordt dat na 10, 20 en 30 jaar? |
| 2 | 5. €200 per maand, 20 jaar: vijf mogelijke rendementen | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 2. 10 jaar eerder beginnen: wat scheelt het? |
| 3 | 7. Noodbuffer: hoeveel is 3 tot 6 maanden uitgaven? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 4. €10.000 die stilstaat: wat is het later waard? |
| 4 | 8. €5.000 lenen: wat kost de rente? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 6. 50/30/20-regel: zo ziet €2.500 netto eruit |
| 5 | 10. €10.000 in één keer of €100 per maand? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 3. Kosten van 0,2% of 1,5%: wat scheelt het? |
| 6 | 11. Financiële vrijheid: wat is 25 keer je uitgaven? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 15. Na -50% heb je +100% nodig om terug te zijn |
| 7 | 12. Salarisverhoging: wat als je de helft belegt? | 01 vraag | 02 antwoord | 03 reel-teaser (alleen als de Reel live staat) | 13. Hoe lang duurt het om €100.000 te bereiken? |

## Afspraken

- Onderwijs, geen advies; de opties in polls zijn gokjes, geen verwachtingen.
- De ideeën zijn nog niet door de vijf gates; de eigenaar beslist wat live gaat. Niets wordt automatisch gepubliceerd.
- Opnieuw bouwen: `npm run stories -- build` (alles) of `npm run stories -- build --ids 1,2,3` (deel; zonder zip en schema).
