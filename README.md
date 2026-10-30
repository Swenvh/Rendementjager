# Rendementjager AI Content Factory

An AI-assisted production system for **@rendementjager**, an anonymous premium Dutch
personal-finance education brand. It turns an idea into a researched, fact-checked,
compliance-reviewed, rendered and owner-approved Instagram Reel, and tracks performance afterwards.

Status: volume build (series engine, review queue, publishing package/adapter). See `docs/ROADMAP.md`.
Nothing publishes automatically; live Instagram posting is off and untested.

## Starten op je eigen computer (Nederlands)

Het dashboard draait lokaal (`localhost`), het staat niet online. Wat je nodig hebt:
Node 22.13 of nieuwer, ffmpeg, Google Chrome of Chromium (voor het renderen van video's) en `git`.

```bash
git clone https://github.com/Swenvh/Rendementjager.git
cd Rendementjager
cp .env.example .env              # alle sleutels zijn optioneel; zonder sleutels draaien gelabelde lokale alternatieven
npm ci
npm run db:migrate && npm run db:seed
npm run dev                       # dashboard op http://localhost:5173 (API op 8787)
```

De eerste Reel ("Wat doet €250 per maand beleggen over 30 jaar?") staat als tekst en cijfers in de
repo, maar de MP4 zelf niet (te groot, staat in `.gitignore`). Maak hem lokaal opnieuw (ongeveer 4 minuten):

```bash
npm run render -w @rj/video-engine -- --content 2026-10-23-250-per-maand-30-jaar
npm run link-first-reel -w @rj/mission-control   # koppelt video, cover en caption aan het item
```

Dagelijks gebruik:
- **Methodebrieven** (eenmalig per serie): `npm run methods -- seed`, open `#/methodebrieven`, lees de 3 briefs en de bronnen, keur G1 goed per serie. Open eerst elke bronlink zelf; ze zijn nog niet geverifieerd.
- **Reels maken**: `npm run series -- plan --kind compounding --count 25`, daarna `generate` met dezelfde opties. Weekplan: `npm run series -- week`.
- **Controleren en goedkeuren**: pagina **Review** (toets `?` toont de sneltoetsen). Elke Reel wordt apart goedgekeurd tegen zijn exacte video en caption.
- **Publiceren**: pagina **Publicatie**, of `npm run publish -- export <contentId>` voor het handmatige pakket.
- **Noodstop**: zet `RJ_EMERGENCY_STOP=1` in `.env` of gebruik de schakelaar bij Instellingen.

Stem: er is **geen robotstem**. Zonder ElevenLabs zijn Reels stemloos: alleen ondertitels op leestempo (dat is geldig en wordt zo gelabeld).
Voor de echte stem: `ELEVENLABS_API_KEY` en `ELEVENLABS_VOICE_ID` in `.env` en `RJ_TTS_PROVIDER=elevenlabs`
(kost geld; standaard staat het uit).

### De hele procedure in 4 stappen (Codespaces)

1. **Open de Codespace** (groene knop Code, tab Codespaces). De dronebeelden downloaden zichzelf: alleen de 10-seconden stukken uit het planbestand, zonder geluid, staand gesneden (best effort).
2. **Wacht** tot de installatie klaar is (enkele minuten). Onderaan de terminal staat de status ("Beelden: x/y clips bruikbaar"). Staat er 0? Dan weigerde YouTube de download (vaak vanaf cloud-servers): download de 3 video's zelf, zet ze in de map `inbox/` als `scenic-relaxation-nl.mp4`, `drone-snap-amsterdam.mp4`, `woerden-short.mp4` en draai `npm run footage -- slice --plan assets/footage/plans/nl-scenic.json --input-dir inbox`. Opnieuw proberen kan met `npm run footage -- fetch-sources --plan assets/footage/plans/nl-scenic.json`.
3. **Bouw de Reels opnieuw:** `npm run reels:rebuild`. Alle bestaande Reels met een nieuwe achtergrond worden na elkaar gerenderd (ongeveer 6 minuten per Reel), gecontroleerd (media-QA), en opnieuw gekoppeld aan Mission Control. Met `-- --dry-run` zie je eerst wat er gebeurt.
4. **Open het dashboard** (`npm run dev`, poort 5173) en kijk op **Review**. Je ziet per Reel welke clips zijn gebruikt. Een nieuwe video maakt een eerdere goedkeuring ongeldig: keur opnieuw goed.

Niet live getest: de download vanaf YouTube (hier geblokkeerd), alleen met een nagebootste yt-dlp.

### Achtergrondbeelden (dronebeelden) toevoegen

Zonder beelden gebruikt elke Reel de geanimeerde donkergroene achtergrond. Er worden alleen beelden gebruikt met een compleet manifest-item en een toegestane licentie (Pexels, Pixabay, CC0, CC BY met bronvermelding, of door jou aangeleverd). **YouTube-video's worden bewust niet gedownload door de tool** (auteursrecht); jij downloadt zelf wat je mag gebruiken.

1. **Eigen of door jou aangeleverde video's** (bijvoorbeeld de drie YouTube-video's in `assets/footage/plans/nl-scenic.json`): download het bestand zelf, sleep het in de bestandenverkenner van je Codespace (of zet het op je eigen computer) en geef het de naam van het bron-id uit het plan: `scenic-relaxation-nl.mp4`, `drone-snap-amsterdam.mp4`, `woerden-short.mp4` in een map, bijvoorbeeld `inbox/`. Knip daarna de clips:
   ```bash
   npm run footage -- slice --plan assets/footage/plans/nl-scenic.json --input-dir inbox
   npm run footage -- validate
   ```
   Elke clip wordt 10 seconden, staand (1080x1920), zonder geluid, en komt in `assets/footage/manifest.json` met jouw rechtenverklaring ("Owner declares rights held; not independently verified"). Jij blijft verantwoordelijk voor de rechten. Pas starttijden in het planbestand aan als je wilt, en vul het echte kanaal van de Short in. Kijk een frame na op watermerken.
2. **Pexels of Pixabay** (gratis sleutel, niet live getest): zet `PEXELS_API_KEY` (of `PIXABAY_API_KEY`) in `.env` of de Codespaces-secrets en draai bijvoorbeeld `npm run footage -- fetch --provider pexels --query "windmolens Kinderdijk" --count 5`. Andere zoekopdrachten: polder, Amsterdam grachten, Rotterdam Erasmusbrug, tulpenvelden, Zwolle, Waddenzee, Delta Werken. Controleer daarna locatie en titel in het manifest.
3. **YouTube met Creative Commons (CC BY)**: `npm run footage -- fetch --provider youtube-cc --url <link>` weigert alles wat geen CC BY is. De bronvermelding komt dan verplicht in de caption. Controleer de licentie zelf op de videopagina.

Meer: `docs/INTEGRATIONS.md`, regels in `docs/EDITORIAL_POLICY.md` (paragraaf 7).

### Tabellen en ranglijsten (Template D)

`npm run series -- plan --kind table --count 6` maakt rekentabellen (inleg x looptijd). Een ranglijst met marktdata maak je alleen uit een bestand dat jij aanlevert, met bron, peildatum en periode per rij: `npm run dataset -- import <bestand.json|csv> --draft`. Ranglijsten van producten op basis van rendement uit het verleden gaan eerst langs de compliance-reviewer. Je officiële logo: zet het als `assets/brand/logo-official.svg`.

## Developer quickstart

```bash
npm ci && npm run db:migrate && npm run db:seed
npm test && npm run typecheck
npm run build -w @rj/mission-control && npm run start   # API + UI op http://127.0.0.1:8787
```

Requirements: Node >= 22.13 (uses built-in `node:sqlite`), ffmpeg, Chromium for Remotion renders.
Worker and render commands: `docs/OPERATIONS.md`.

## Structure

```
apps/
  mission-control/   Hono API (server/) + Vite/React/Tailwind dashboard (src/)
  worker/            job queue runner (idempotent, retries, caps, emergency stop)
packages/
  shared/            Zod schemas, pipeline stages, gates, hashing
  database/          node:sqlite, migrations, repositories
  finance-engine/    deterministic calculations, nl-NL EUR formatting
  content-engine/    workflow transitions, gate enforcement, audit log
  research-engine/   approved sources, research briefs, topic dedupe
  analytics-engine/  metric derivations, experiments
  integrations/      provider adapters + mocks (LLM, Buffer, n8n, Sheets)
  brand/             design tokens, logo, typography
  voice-engine/      TTS (ElevenLabs opt-in; otherwise voiceless)
  footage-engine/    licensed drone-footage library (manifest, validator, slice, fetch)
  video-engine/      Remotion templates, render, covers, media QA
content/             research/, scripts/, approved/ (text artefacts)
output/              reels/, covers/, reports/ (generated; mp4/wav git-ignored)
assets/              brand/, fonts/, audio/, graphics/
data/                SQLite database (git-ignored)
workflows/           editorial workflow + recurring job definitions
docs/                architecture, policy, operations, roadmap, audits
.claude/             project agents, skills (Chief of Staff commands), rules
```

## Working with Claude Code

Open Claude Code in this folder. Read `CLAUDE.md`. The `rj-chief-of-staff` skill coordinates
the 12 project agents in `.claude/agents/`; see `docs/AGENT_REGISTRY.md`.
