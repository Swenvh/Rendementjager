---
name: seo-artikel
description: Schrijft een SEO- en AI-geoptimaliseerd artikel van zoekwoord tot publicatieklare tekst. Gebruik wanneer de gebruiker een blog of artikel wil voor vindbaarheid.
---

# SEO-artikel

1. Laat de zoekwoord-onderzoeker het hoofdzoekwoord en 5 tot 10 gerelateerde vragen bepalen.
2. Laat de contentcluster-planner bepalen waar dit artikel in het cluster valt en naar welke pagina's het moet linken.
3. Laat de blogschrijver het artikel schrijven.
4. Laat de on-page-optimalisator titel, meta description, koppen en interne links nalopen.
5. Laat de ai-zichtbaarheid-specialist het artikel geschikt maken voor ChatGPT, Perplexity en Google AI Overviews.
6. Laat de eindredacteur de eindcontrole doen. Sla op in seo/.
## Uitvoeringsafspraken voor het hoofdgesprek
Deze Skill coördineert de stappen in het hoofdgesprek. Controleer welke agents zijn geïnstalleerd voordat je begint. Ontbreekt een agent, meld de exacte naam en vraag om installatie; doe niet alsof hij is uitgevoerd.
Lees CLAUDE.md en maak per run een korte briefing met doel, doelgroep, aanbod, één CTA, benodigde input en acceptatiecriteria.
Geef elke specialist de exacte briefing, de relevante bronbestanden en de resultaatbestanden uit eerdere stappen. Wacht op afhankelijke stappen. Laat parallel werk alleen in aparte bestanden uitvoeren.
Houd een manifest bij in strategie/JJJJ-MM-DD-workflow-naam.md: stap, agent, inputbestanden, resultaatbestand, status en open punten. Maak de map indien nodig; voeg een volgnummer toe als de bestandsnaam al bestaat.
Na elke stap: controleer of het bestand bestaat en de gevraagde inhoud bevat. Bij ontbrekende feiten of tools, registreer de blokkade en vraag gericht om de input; markeer een niet uitgevoerde stap nooit als afgerond.
Voer maximaal 2 gerichte revisierondes uit op basis van de eindcontrole. Zijn er daarna open punten, lever die duidelijk op.
Gebruik de bewijscontroleur en kwaliteitscontroleur als ze geïnstalleerd zijn. Zo niet, controleer zelf de claims en acceptatiecriteria en vermeld dat de bonusagents niet zijn gebruikt.
Lever de bestanden, bronnen, beperkingen en één volgende stap terug. Publiceren, versturen, accounts koppelen en budgetwijzigingen vallen buiten deze Skill tenzij de gebruiker dat expliciet opdraagt.
