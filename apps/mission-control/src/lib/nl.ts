import { stageLabel } from './stages';

/**
 * Dutch UI layer for engine/API messages. The engines and API stay English (technical, tested);
 * the owner only ever sees Dutch. Unknown messages fall through unchanged.
 */
const BINDING_NL: Record<string, string> = {
  'script revision': 'het huidige script',
  'video asset hash': 'de huidige video',
  'video asset hash + caption hash': 'de huidige video en caption',
  state: 'de huidige status',
};

const ACTOR_NL = (a: string) => a;

type Rule = [RegExp, (m: RegExpMatchArray) => string];

const RULES: Rule[] = [
  [/^(G\d) not approved yet$/, (m) => `${m[1]} is nog niet goedgekeurd`],
  [/^(G\d) approval does not match the current (.+)$/, (m) => `${m[1]}-goedkeuring hoort bij een eerdere versie; ${BINDING_NL[m[2]!] ?? m[2]} is gewijzigd`],
  [/^(G\d) rejected$/, (m) => `${m[1]} is afgekeurd`],
  [/^(G\d) satisfied$/, (m) => `${m[1]} is in orde`],
  [/^G3 needs a fact-checker/, () => 'G3 mist nog de goedkeuring van de feitencontrole (of de eigenaar)'],
  [/^G3 needs a compliance-reviewer/, () => 'G3 mist nog de goedkeuring van de compliance-controle (of de eigenaar)'],
  [/^([A-Z_]+) -> ([A-Z_]+) is not an allowed transition$/, (m) => `De stap van “${stageLabel(m[1]!)}” naar “${stageLabel(m[2]!)}” is niet toegestaan`],
  [/^Emergency stop is active: no new jobs$/, () => 'De noodstop is actief: er worden geen nieuwe jobs aangemaakt'],
  [/^Emergency stop is active/, () => 'De noodstop is actief: alleen “Mislukt” of “Gearchiveerd” is toegestaan'],
  [/^Only the owner can lift the emergency stop$/, () => 'Alleen de eigenaar kan de noodstop opheffen'],
  [/^(.+) may not move content to (SCHEDULED|PUBLISHED)$/, (m) => `${ACTOR_NL(m[1]!)} mag content niet naar “${stageLabel(m[2]!)}” zetten`],
  [/^(.+) may not decide (G\d)/, (m) => `${ACTOR_NL(m[1]!)} mag ${m[2]} niet beoordelen`],
  [/^(.+) wrote this script revision and may not decide (G\d)$/, (m) => `${m[1]} schreef dit script en mag ${m[2]} niet beoordelen (geen zelfbeoordeling)`],
  [/^(G\d) must be given on the current script revision$/, (m) => `${m[1]} moet op de huidige scriptversie worden gegeven`],
  [/^(G\d) asset hash does not match the current video asset$/, (m) => `${m[1]}: de videohash komt niet overeen met de huidige video`],
  [/^(G\d) caption hash does not match the current caption$/, (m) => `${m[1]}: de captionhash komt niet overeen met de huidige caption`],
  [/^G1 needs a research brief/, () => 'G1 vraagt eerst een onderzoeksbrief bij dit item'],
  [/^A rejection needs notes/, () => 'Een afkeuring heeft een toelichting nodig'],
  [/^Topic already exists: (.+)$/, (m) => `Dit onderwerp bestaat al: ${m[1]}`],
  [/^Content item (\S+) not found$/, () => 'Dit content-item bestaat niet (meer)'],
  [/^Published content cannot (.+)$/, () => 'Gepubliceerde content kan niet meer worden aangepast'],
  [/^Use POST \/api\/content\/:id\/schedule/, () => 'Inplannen gaat via de kalender, zodat bestand en caption opnieuw worden gecontroleerd'],
  [/^Use POST \/api\/content\/:id\/published/, () => 'Publicatie wordt geregistreerd via een geplande publicatie'],
  [/^G5 can only be granted by the owner/, () => 'G5 kan alleen door de eigenaar worden gegeven, met de knop in Video Studio'],
  [/^Only the owner can decide G5/, () => 'Alleen de eigenaar kan G5 beslissen'],
  [/^Confirmation must be exactly/, () => 'De bevestigingszin klopt niet'],
  [/^G5 is given on READY_FOR_EDITOR/, () => 'G5 geef je pas in de fase “Wacht op eigenaar”'],
  [/^No video asset registered/, () => 'Er is nog geen video aan dit item gekoppeld'],
  [/^The video file is missing on disk/, () => 'Het videobestand ontbreekt op schijf'],
  [/^The video file on disk differs/, () => 'Het videobestand op schijf wijkt af van de geregistreerde versie: registreer opnieuw en bekijk het opnieuw'],
  [/^Stale review: the video/, () => 'Verouderde beoordeling: de video die je zag is niet meer de huidige versie'],
  [/^Stale review: the caption/, () => 'Verouderde beoordeling: de caption is gewijzigd sinds je hem las'],
  [/^No caption/, () => 'Er is nog geen caption'],
  [/^scheduledAt must be in the future$/, () => 'Kies een moment in de toekomst'],
  [/^Content-Type must be application\/json$/, () => 'Ongeldig verzoek (Content-Type moet JSON zijn)'],
  [/^Host not allowed$/, () => 'Deze host is niet toegestaan; open Mission Control via localhost'],
  [/^Invalid input$/, () => 'Ongeldige invoer'],
  [/^Internal server error$/, () => 'Interne serverfout; bekijk het logboek'],
  [/^Only queued jobs can be cancelled$/, () => 'Alleen wachtende jobs kunnen worden geannuleerd'],
  [/^Only failed or cancelled jobs can be retried$/, () => 'Alleen mislukte of geannuleerde jobs kunnen opnieuw'],
  [/^(\w+) needs G2\+G3/, () => 'Productie-jobs vragen G2 en G3 (script goedgekeurd)'],
  [/^No route /, () => 'Onbekend API-adres'],
];

/** Translate one engine/API message (or reason string) to Dutch; unknown text is returned as-is. */
export function nl(message: string | null | undefined): string {
  if (!message) return '';
  for (const [re, fn] of RULES) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return message;
}

/** Audit-log reasons mix engine text with owner-typed text; translate the known engine patterns. */
const AUDIT_RULES: Rule[] = [
  [/^created$/, () => 'aangemaakt'],
  [/^automatic: (.+)$/, (m) => `automatisch: ${auditReason(m[1]!)}`],
  [/^(G\d) invalidated: (.+)$/, (m) => `${m[1]} ongeldig gemaakt: ${auditReason(m[2]!)}`],
  [/^(G\d) (approved|rejected)(?:: (.+))?$/, (m) => `${m[1]} ${m[2] === 'approved' ? 'goedgekeurd' : 'afgekeurd'}${m[3] ? `: ${m[3]}` : ''}`],
  [/^(.+) — denied: (.+)$/, (m) => `${m[1]} — geweigerd: ${nl(m[2])}`],
  [/^(G\d) (approved|rejected) denied: (.+)$/, (m) => `${m[1]} ${m[2] === 'approved' ? 'goedkeuring' : 'afkeuring'} geweigerd: ${nl(m[3])}`],
  [/^script changed to v(\d+)$/, (m) => `script gewijzigd naar v${m[1]}`],
  [/^script v(\d+)(?:: (.+))?$/, (m) => `script v${m[1]}${m[2] ? `: ${m[2]}` : ''}`],
  [/^video asset changed(?: \((\d+) approvals invalidated\))?$/, (m) => `video gewijzigd${m[1] ? ` (${m[1]} goedkeuringen ongeldig)` : ''}`],
  [/^new video asset$/, () => 'nieuwe video geregistreerd'],
  [/^same video hash re-registered$/, () => 'dezelfde video opnieuw geregistreerd'],
  [/^caption changed( after G5)?$/, (m) => `caption gewijzigd${m[1] ? ' na G5' : ''}`],
  [/^schedule denied: (.+)$/, (m) => `inplannen geweigerd: ${nl(m[1])}`],
  [/^scheduled on (\S+) for (.+)$/, (m) => `ingepland op ${m[1]} voor ${m[2]}`],
  [/^published on (\S+)$/, (m) => `gepubliceerd op ${m[1]}`],
  [/^publication (\S+) scheduled$/, () => 'publicatie ingepland'],
  [/^reschedule to (.+)$/, (m) => `opnieuw ingepland naar ${m[1]}`],
];

export function auditReason(reason: string | null | undefined): string {
  if (!reason) return '';
  for (const [re, fn] of AUDIT_RULES) {
    const m = reason.match(re);
    if (m) return fn(m);
  }
  return nl(reason);
}

const AUDIT_ACTION_NL: Record<string, string> = {
  transition: 'Fase-overgang',
  transition_denied: 'Overgang geweigerd',
  approval: 'Goedkeuring',
  approval_denied: 'Goedkeuring geweigerd',
  invalidation: 'Goedkeuring ongeldig',
  script_revision: 'Nieuw script',
  asset_change: 'Videowijziging',
  caption_change: 'Captionwijziging',
  publication: 'Publicatie',
  emergency_stop: 'Noodstop',
};

export const auditAction = (a: string) => AUDIT_ACTION_NL[a] ?? a;
