# QA-rapport Rendementjager (onafhankelijke controle)

Datum: 2026-10-30. Uitgevoerd door de QA- en betrouwbaarheidscontrole, niet door de bouwers. Er is niets gecommit of gepusht.
De echte database `data/rendementjager.sqlite` is alleen gelezen (read-only); alle proeven met goedkeuringen liepen op tijdelijke databases.

## Eindoordeel

Het systeem bouwt, test en draait vanuit een schone kopie. De goedkeuringsregels (G1 t/m G5) houden stand tegen alle pogingen via de API en via
`WorkflowService`. Er zijn twee kanttekeningen: (1) de API heeft geen authenticatie, dus G5 beschermt tegen foutjes en
vreemde websites, niet tegen een lokaal proces dat opzettelijk de eigenaar speelt; (2) de database zelf heeft geen schrijfbeveiliging op
`stage`/`approvals` (alleen `script_revisions` en `audit_log` zijn append-only).
De eerste Reel (EUR 250 per maand) is een CONCEPT: er is **geen** poort gehaald, geen onderzoeksbrief en geen scriptrevisie in de database,
en de voice-over is de lokale fallback. Hij is niet publiceerbaar. De bedragen kloppen wel (zie 3), maar er zijn tekstpunten voor de redactie.

## Acceptatiecriteria

| # | Criterium | Oordeel | Bewijs |
| --- | --- | --- | --- |
| 1 | Dashboard start | PASS | `npm run build -w @rj/mission-control` + `npm run start` op tijdelijke DB: `/api/health` geeft `{"ok":true,"db":"ok"}`, UI op `/` geeft 200. Gebonden aan 127.0.0.1 (verbinding via het externe IP faalt). |
| 2 | Database blijft bestaan | PASS | Test "keeps items, approvals and audit log across a restart" slaagt; `db:migrate` en `db:seed` zijn herhaalbaar; `VACUUM INTO`-back-up geverifieerd (6 items terug te lezen). |
| 3 | Eén item doorloopt de pijplijn | PASS | Wegwerp-item op een tijdelijke DB-kopie: IDEA tot en met PUBLISHED via de API (28 auditregels); onderweg correct geweigerd: overslaan van fases, zelf-beoordeling G3, APPROVED_FOR_PUBLISHING zonder G5. Op de echte DB staat het EUR 250-item nog op IDEA (bewust, "keurt niets goed"). |
| 4 | Onderzoek/scripts opgeslagen met bronverwijzing | **FAIL** | Echte DB: `research_briefs` 0, `sources` 0, `script_revisions` 0, `approvals` 0. Het script staat alleen als bestand (`content/scripts/.../script.md`, bron = `finance-engine`); het Mission Control-script is gelabeld "Concept uit bestand, nog geen revisie in de database". De code voor briefs/bronnen bestaat en is getest. |
| 5 | Rekentests | PASS | `finance-engine` 23 tests; mijn onafhankelijke herberekening komt overeen (zie 3). |
| 6 | Render bestaat | PASS | `output/reels/2026-10-23-250-per-maand-30-jaar.mp4` (1080x1920, 30 fps, 47 s, sha256 `b8d13945...eeb47`), `.qa.json` pass. Hernieuwde render in een schone kopie geeft dezelfde sha256. |
| 7 | Voorbeeld/preview | PASS | Video Studio speelt de MP4 af met Range-ondersteuning; schermafdruk `docs/screenshots/video-studio-1440.png`. |
| 8 | Cover | PASS | `output/covers/...png` en `...-grid-1080x1350.png` bestaan en zijn aan het item gekoppeld (1 `thumbnail_assets`-rij). |
| 9 | Voice-fallback gelabeld | PASS | `metadata.json`: `provider: local-fallback`, `brandVoice: false`, label "NOT the brand voice"; Instellingen toont `local-tts` als "niet de merkstem". Kanttekening: `voice_assets` in de DB is leeg. |
| 10 | Goedkeuring afgedwongen | PASS (met kanttekening) | Zie "Bypass-bevindingen". Geen route naar SCHEDULED/PUBLISHED of G5 zonder geldige eigenaar-goedkeuring via API of service. |
| 11 | Fouten zichtbaar | PASS | `ErrorNote` toont code + bericht (nu Nederlands); Agents-pagina toont errorlog; geweigerde pogingen komen als `transition_denied`/`approval_denied` in het auditlog. |
| 12 | Credentials beschermd | PASS | Geen sleutels in de broncode; `.env` genegeerd (alleen `.env.example` aanwezig); status toont alleen `configured`; worker redacteert foutteksten; API geeft geen interne details bij 500. |
| 13 | Documentatie | PARTIAL | Verouderde en onduidelijke punten zijn aangepast (zie "Doorgevoerde fixes"); ROADMAP-fasestatus is niet opnieuw gescoord. |

## 1. Schone kopie

Kopie zonder `node_modules`, `data/*.sqlite`, `output/`, `dist` naar een tijdelijke map. Resultaat:

| Stap | Resultaat |
| --- | --- |
| `npm ci` | OK (350 pakketten). Meldt 12 kwetsbaarheden (zie 4). |
| `npm run db:migrate` | OK (`001_init`, `002_append_only_guards`) |
| `npm run db:seed` | OK (6 onderwerpen, geen bronnen) |
| `npm test` | OK: alle workspaces plus `tests/` groen |
| `npm run typecheck` | OK, geen fouten |
| `npm run build -w @rj/mission-control` | OK |
| `npm run render -w @rj/video-engine -- --content <slug>` | OK: 353 s, media-QA PASS, MP4 **byte-identiek** aan de bestaande (zelfde sha256 `b8d13945...eeb47`), dus reproduceerbaar |

Niet gedocumenteerd maar nodig: `ffmpeg`, `espeak-ng` en Chromium moeten aanwezig zijn voor voice/render (README noemt ffmpeg en Chromium, niet espeak-ng). Ontbrekende `.env` is geen probleem.

## 2. Bypass-bevindingen (goedkeuring, noodstop)

Geprobeerd en geweigerd (getest, `apps/mission-control/test/qa-adversarial.test.ts`):

- SCHEDULED/PUBLISHED/APPROVED_FOR_PUBLISHING zonder G5 via `WorkflowService.transition` voor alle vier de toegestane publicatie-actoren: geweigerd.
- G5 via `recordApproval` met niet-eigenaar-actoren, via de generieke `/approvals`-route (ook als `owner`), en via `/owner-approval` zonder de UI-header: geweigerd (403).
- Scriptwijziging na G5 (item op APPROVED_FOR_PUBLISHING): G2/G3 vervallen, `/schedule`, `transition(SCHEDULED)` en `transition(PUBLISHED)` worden geweigerd.
- Verouderde video- of captionhash, gewijzigd bestand op schijf, G5 in de verkeerde fase: geweigerd (bestaande tests plus eigen run).
- Ongeldigmaken: scriptwijziging maakt G2/G3 ongeldig; nieuwe video maakt G4/G5 ongeldig en zet terug naar QA_REVIEW; captionwijziging maakt G5 ongeldig en zet APPROVED_FOR_PUBLISHING/SCHEDULED terug naar READY_FOR_EDITOR. Alleen witruimte-wijziging behoudt G5 (hash is genormaliseerd).
- Noodstop: blokkeert transities (behalve FAILED/ARCHIVED), `/schedule` en nieuwe jobs; alleen de eigenaar kan hem opheffen; `RJ_EMERGENCY_STOP=1` werkt ook. De worker verwerkt dan niets.

Zwakke plekken (geen "bypass" in de zin van de regels, wel te weten):

| # | Bevinding | Ernst |
| --- | --- | --- |
| B1 | **Geen authenticatie.** `/owner-approval` vraagt een vaste header en een vaste zin die in de repo staan. Elk lokaal proces (of agent met `curl`) kan G5 geven. De header stopt websites (CORS-preflight), geen lokale aanroepers. Ook de noodstop kan met `actorId: owner` worden opgeheven. | Gemiddeld. Verbeterpad: een eigenaarstoken uit `.env` (`RJ_OWNER_TOKEN`) dat de UI bij start vraagt. |
| B2 | **Geen DB-guard.** Rechtstreeks `repo.contentItems.update(id, {stage:'SCHEDULED'})` slaagt (aangetoond), net als een handmatig ingevoegde `owner`-G5-rij met de juiste hashes. Alleen `script_revisions` en `audit_log` zijn append-only. Regel "nooit de DB bewerken" is dus afspraak, geen techniek. | Gemiddeld. Verbeterpad: triggers die `stage`-wijzigingen naar SCHEDULED/PUBLISHED en G5-inserts controleren, of een SQLite-gebruiker met alleen-lezen rechten voor agents. |
| B3 | `WorkflowService.transition(id,'SCHEDULED'/'PUBLISHED')` rechtstreeks (niet via de API, die dit blokkeert) vereist wel geldige G5, maar hasht het bestand niet opnieuw en maakt geen `publication`-rij. De sanctioned weg is `schedulePublication`/`markPublished`. | Laag |
| B4 | Een G5-beslissing wordt tijdens een actieve noodstop nog geaccepteerd (201); alleen de volgende stap wordt geblokkeerd. | Laag |
| B5 | Beleid (`EDITORIAL_POLICY` par. 5) zegt: scriptwijziging na G3 zet het item terug naar SCRIPT_READY. De code maakt G2/G3 ongeldig maar laat de fase staan; publiceren blijft wel geblokkeerd. Beleid en gedrag wijken af. | Laag (documentatie of code aanpassen) |
| B6 | Worker-CLI `--enqueue render_video --slug x` kent geen fasecontrole (die zit alleen in de API-route). Dat rendert, publiceert niet. | Laag |
| B7 | De opmerking in `adapters/buffer.ts` zegt dat `schedulePost` alleen na G5 wordt aangeroepen "enforced by schedulePublication()". Er is geen koppeling; de live-modus is een stub die altijd een fout geeft. Veilig, maar de opmerking is te sterk. | Laag |

## 3. Financiele juistheid (EUR 250 per maand, 30 jaar, 7% effectief per jaar, einde van de maand)

Onafhankelijk herberekend (Python `Decimal`, 40 cijfers, som van 360 stortingen met maandfactor 1,07^(1/12)):

| Grootheid | Eigen berekening | In materiaal | Oordeel |
| --- | --- | --- | --- |
| Eindwaarde | 292.363,15 | 292.363 (script, caption, props, frame, metadata) | klopt |
| Inleg | 90.000 | 90.000 | klopt |
| Rendement | 202.363,15 | 202.363 | klopt |
| Eindwaarde in koopkracht van nu (2% p.j., 30 jaar, factor 1,8114) | 161.405,18 | 161.405 (caption/frame), "ruim 161.000" (stem) | klopt; alleen de eindwaarde is gedeflateerd |
| Afrondingen in de stem | 292.363 / 202.363 / 161.405 | "ruim 292.000 / 202.000 / 161.000" | niet hoger dan de berekening: goed |

Ter vergelijking: 7%/12 nominaal per maand zou 304.993 geven. Wie "7% per jaar, rente-op-rente per maand" zo leest, zit er EUR 12.630 naast.

Bevindingen in de tekst en beeld (voor de redactie, niet aangepast omdat het de goedgekeurde inhoud raakt):

| # | Bevinding | Ernst | Voorstel |
| --- | --- | --- | --- |
| F1 | **Teller in de groeigrafiek klopt niet op stilstaand beeld.** Frame bij 20,2 s toont "Waarde na 29 jaar EUR 280.576", maar de waarde na 29 jaar is EUR 270.344. `TemplateC.tsx` interpoleert lineair tussen jaarpunten en rondt het jaarlabel af. De teller toont dus bedragen die in de berekening niet bestaan. Alleen tijdens de animatie zichtbaar (~1 s), maar een screenshot of pauze toont een fout bedrag. | Gemiddeld | Teller en label op jaareindwaarden laten springen (of "ruim N jaar" weglaten); opnieuw renderen, nieuwe hash, opnieuw G4/G5. |
| F2 | "7% per jaar" staat nergens in de caption, op het scherm of in de stem als **effectief** rendement; alleen `script.md` zegt dat. "Rente-op-rente per maand" kan als 7%/12 gelezen worden (zie 304.993 hierboven). | Gemiddeld | "7% effectief per jaar (maandelijks omgerekend)" in caption en op de aannamekaart. |
| F3 | Vaste voetregel "exclusief kosten, belasting **en inflatie**" staat ook in de resultaatscene naast de inflatiegecorrigeerde EUR 161.405 en in de stem ("inflatie zit niet in het eindbedrag" na "in geld van nu"). Dat is correct bedoeld (eindbedrag is nominaal) maar leest als tegenstrijdig; nominaal en reeel staan in een beeld. | Laag-gemiddeld | Kaart labelen "Zelfde bedrag, uitgedrukt in geld van nu (2% inflatie, aanname)" en de voetregel in die scene aanpassen. |
| F4 | De uitoutro toont "Meer inzicht. Meer vermogen. Meer vrijheid." Dit staat niet in het script maar in het beeld, en leest als belofte van vermogen/vrijheid. | Gemiddeld | Schrappen of neutraliseren ("Meer inzicht in je geld"); valt onder rode lijn "geen rendementbeloftes". |
| F5 | Hashtag `#vermogenopbouwen` plus "7%" kan als aansporing gelezen worden; geen verwijzing naar een product, dus geen rode lijn. | Laag | Overwegen te vervangen door `#sparen`/`#beleggenvoorbeginners`. |
| F6 | De 7% is een aanname zonder bron of historische context. Dat is goed gelabeld ("hypothetisch, geen garantie"), maar beleid 1.4 vraagt bij elk genoemd rendement tijdsbestek, kosten/inflatie en "geen garantie": aanwezig. Kleine voetregel (ca. 13 px bij 540 px breed) is slecht leesbaar op een telefoon. | Laag | Voetregel groter/contrastrijker. |
| F7 | De caption noemt "ongeveer EUR 161.405": exact bedrag met "ongeveer" is onhandig. | Laag | "ruim EUR 161.000" zoals in de stem. |

Geen advies of garantie gevonden: er staat geen product, geen "koop", geen urgentie; "geen garantie", "geen advies", verlies-mogelijkheid en "echte rendementen schommelen" zijn aanwezig. Status van het item is CONCEPT; G2/G3 (feitencheck en compliance) zijn nog niet uitgevoerd en dit rapport vervangt die niet.

## 4. Beveiliging

| Onderwerp | Resultaat |
| --- | --- |
| Geheimen | Geen sleutels in code of docs; `.env`/`data/*.sqlite`/`output/reels/*.mp4` staan in `.gitignore`; alleen `.env.example` aanwezig. `redact()` dekt env-waarden en tokenpatronen; worker slaat foutteksten geredacteerd op; API-500 geeft geen details. Kanttekening: de ElevenLabs-adapter in `voice-engine` gebruikt `redact` niet (laag; de API echoot de sleutel normaal niet). Schermafdruk `instellingen-1440.png` toont een lokaal DB-pad uit de werkmap (geen geheim). |
| Binding | `main.ts` bindt standaard op `127.0.0.1` (`RJ_API_HOST` overschrijfbaar); Vite ook `127.0.0.1`. Bevestigd: verbinding via het externe IP wordt geweigerd. |
| CSRF | **Gevonden en opgelost.** Een cross-site `text/plain`-POST met JSON-body werd geaccepteerd (201), want `parseBody` leest JSON ongeacht Content-Type: een vreemde website kon items maken, G1-G4 geven, transities doen en de noodstop opheffen. Nu eist `/api/*` bij POST/PUT/PATCH/DELETE `application/json` (415 anders). |
| DNS-rebinding | **Opgelost.** Alleen Host `localhost`, `127.0.0.1`, `[::1]` (en `RJ_ALLOWED_HOSTS`) wordt beantwoord (403 anders). |
| Pad-traversal `/media` | Veilig: naam moet `^[\w][\w.-]*$` zijn, geen `..`, `realpath` blijft binnen de map, vaste MIME-lijst, SVG met CSP. Getest met `..%2f`-varianten: 404; `/media/reels/../../package.json` geeft de SPA-index (genormaliseerd door de server, geen lekkage). |
| Invoervalidatie | Alle bodies lopen via Zod (`parseBody`); query-parameters `stage`/`status` via Zod, overige filters zijn geparametriseerd. SQL: alle waarden `?`-parameters, kolomnamen via whitelist. |
| Shell-injectie in worker | `spawn`/`execFile` zonder shell, argumenten als array: geen shell-injectie. **Opgelost (hardening):** de slug/`contentId` uit de DB werd als `--content <waarde>` doorgegeven en in paden gebruikt; een waarde met leidende `-` of `..` was niet uitgesloten. Nu strikte slugcontrole in API, worker-handler en `prepareContent`. Verder kon voor `espeak-ng` scripttekst die met `-` begint als optie worden gelezen (bijvoorbeeld een tweede `-w` voor een ander uitvoerbestand); nu staat er `--` voor de tekst (getest met de echte binary). |
| `npm audit --omit=dev` | 10 high, allemaal `zod <4.6.6` (GHSA-mrhx-c7xc-m3w5, geheugenuitputting bij enorme collecties) in **Remotion-tooling** (`@remotion/studio`, `cli`, `bundler`, ...) die zijn eigen `zod@4.5.4` meebrengt. Niet bereikbaar via de HTTP-server (die gebruikt `zod@4.6.7`); alleen lokaal bij Remotion Studio/render met eigen props. Volledige audit meldt ook 2 critical: `shell-quote` en `concurrently` (alleen devDependency van `npm run dev`; kwetsbaarheid vraagt aanvaller-gestuurde tokens). Geen actie nodig; Remotion is vastgepind op 4.0.535 volgens het contract. Heroverwegen bij een Remotion-update. |

## 5. Nederlandse UI

Gevonden: Engelse poortredenen ("G1 not approved yet", "G2 approval does not match the current script revision"), Engelse foutmeldingen van de API in `ErrorNote`, Engelse auditactienamen en -redenen (`transition_denied`, `created`, `G5 invalidated: caption changed`), badge-tekst "configured: false", en navigatielabels "Research" en "Analytics".

Opgelost in de UI-laag, zonder engine of tests te wijzigen: nieuw `apps/mission-control/src/lib/nl.ts` (patroonvertaling met doorval naar de originele tekst), toegepast in `ItemDrawer`, `ErrorNote`, Instellingen (auditlog, providers); navigatie en kop "Onderzoek"/"Analyse". Test: `apps/mission-control/test/nl.test.ts`.

Nog Engels of half-Engels: namen van agents en providers (`anthropic`, `buffer`), de badges `mock`/`live`/`disabled`, fouttekst uit jobs in het logboek (technisch), producttermen "Mission Control", "Video Studio", "Agents". Acceptabel; `mock` moet volgens het contract zo blijven.

Afgekapte labels: schermafdrukken (1440 px en 400 px) tonen geen afgekapte zijbalk- of kolomtitels. Pijplijnkolommen zijn 256 px breed en scrollen horizontaal; het langste label ("Feiten en compliance") past. Alleen de eerste vier kolommen zijn in `pipeline-1440.png` zichtbaar; de overige 14 fases zijn niet visueel gecontroleerd (alleen via code).

## 6. Eerlijkheid van de documentatie

Alle "(to be verified)"-commando's zijn uitgevoerd en bijgewerkt in `docs/OPERATIONS.md`: `db:migrate`, `db:seed`, `worker --once` (lege wachtrij: "processed 0"), `qa`, back-up (`VACUUM INTO` werkt; faalt als het doelbestand al bestaat), `render` (schone kopie, 353 s, identieke sha256).

Onjuiste of te sterke claims, nu verholpen:
- "Templates A/B/C" in `ARCHITECTURE.md`, `BUILD_CONTRACT.md`, `ROADMAP.md` en de Merk-pagina: alleen Template C zit in de render-pijplijn (`prepareContent` weigert andere templates, `render.ts` selecteert alleen `TemplateC`). A/B bestaan als Remotion-composities. `ARCHITECTURE.md` en de Merk-pagina zeggen dat nu; `BUILD_CONTRACT.md` en `ROADMAP.md` zijn de eigendom van de Chief of Staff en zijn niet herschreven (open punt).
- `README.md` Quickstart stond op "to be verified once the packages land": nu geverifieerd.
- `CAPABILITY_AUDIT.md` zei "espeak-ng niet geinstalleerd": nu wel (op 2026-10-30 aanwezig).
- `ROADMAP.md` fasestatussen dateren van 2026-10-23 ("parallel build"): changelogregel toegevoegd, statussen niet herschoord.

Geen enkele doc beweert een live Buffer-, ElevenLabs-, n8n- of Sheets-koppeling: `INTEGRATIONS.md`, Instellingen-pagina en code zijn consistent (mock/disabled; Buffer live = stub). ElevenLabs is geimplementeerd en getest met een mock-`fetch`, niet tegen de echte API.

Opmerking over versiebeheer: `.git/info/exclude` van de bovenliggende repo sluit `rendementjager/` volledig uit. Het project staat dus niet in git en is niet op `main` gebracht; het bestaat alleen in deze werkmap.

## Doorgevoerde fixes (bestanden)

1. CSRF- en DNS-rebinding-guard: `apps/mission-control/server/app.ts`; UI stuurt nu altijd `content-type: application/json` bij niet-GET: `apps/mission-control/src/lib/api.ts`.
2. Nederlandse UI-laag: `apps/mission-control/src/lib/nl.ts` (nieuw), `components/ItemDrawer.tsx`, `components/ui.tsx`, `pages/Settings.tsx`, `App.tsx`, `pages/Research.tsx`, `pages/Analytics.tsx`.
3. Slug-hardening: `apps/mission-control/server/routes/ops.ts`, `apps/worker/src/handlers/shell.ts`, `packages/video-engine/scripts/lib/prepare.ts`; `--` voor `espeak-ng`-tekst: `packages/voice-engine/src/providers/local-fallback.ts`.
4. Merk-templates gelabeld "nog niet gekoppeld aan de render-pijplijn": `apps/mission-control/server/routes/library.ts`.
5. Documentatie: `docs/OPERATIONS.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/CAPABILITY_AUDIT.md`, `docs/ROADMAP.md`; `backups/` toegevoegd aan `.gitignore`.
6. Nieuwe tests: `apps/mission-control/test/qa-adversarial.test.ts` (6, o.a. CSRF, bypasspogingen, noodstop, ruwe repo-write), `apps/mission-control/test/nl.test.ts` (2). Volledige `npm test` en `npm run typecheck` zijn na de fixes groen.

## Resterende problemen, op volgorde van ernst

1. **Item niet publicatieklaar:** geen onderzoeksbrief/bronnen, geen scriptrevisie in de DB, G1 t/m G5 open; voice is lokale fallback (niet de merkstem); logo is een placeholder (`isPlaceholder: true`). (criterium 4 FAIL)
2. **F1 teller toont niet-bestaande bedragen** (en F2, F4): vraagt codewijziging in `TemplateC.tsx`/storyboard, opnieuw renderen en nieuwe hash. Niet gedaan omdat dit de MP4 ongeldig maakt.
3. **B1 geen authenticatie op G5/noodstop** en **B2 geen DB-guard**: beslissen of een eigenaarstoken en triggers gewenst zijn.
4. F3, F5, F6, F7 redactionele verbeteringen aan tekst en voetregel.
5. B5 beleid versus gedrag (SCRIPT_READY na scriptwijziging); B3, B4, B6, B7 kleine inconsistenties.
6. `BUILD_CONTRACT.md` en `ROADMAP.md` noemen nog "Templates A/B/C" zonder voorbehoud; ROADMAP-fasestatus verouderd.
7. `npm audit`: zod in Remotion-tooling; opnieuw bekijken bij een Remotion-upgrade.
8. Niet gecontroleerd: pijplijnkolommen voorbij "Script klaar" visueel, mobiele weergave van alle pagina's (alleen Overzicht en Video Studio op 400 px aanwezig), echte ElevenLabs-aanroep, echte Buffer-aanroep.
