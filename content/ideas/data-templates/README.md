# ETF-ranglijst: gegevenssjabloon (idee 14)

`etf-ranking-template.csv` bevat alleen de kopregel; er staan bewust geen voorbeeldrijen of getallen in. Vul per ETF een rij in
(geen cijfers verzinnen; alles uit een bron die je zelf aanlevert) en importeer met:

```
npm run dataset -- import content/ideas/data-templates/etf-ranking-template.csv --id etf-ranglijst --title "ETF-ranglijst: rendement over <periode>" --subject products --metric "Totaalrendement" --unit percent --direction desc --value-label "Rendement" --sort --dry-run
```

Kolommen (de import verwacht deze namen): `ticker`, `naam` (labelkolommen), `value` (rendement in procent, bijv. 12,3), `source_name`,
`source_url`, `as_of_date` (JJJJ-MM-DD), `period` (bijv. kalenderjaar 2025). Elke rij heeft eigen bron, peildatum en periode nodig.
Een ranglijst van producten op basis van verleden rendement gaat eerst langs de compliance-reviewer (EDITORIAL_POLICY 7.3).
