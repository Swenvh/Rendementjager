/** Pipeline stages in order (mirrors @rj/shared; kept local so the browser bundle has no node deps). */
export const STAGES = [
  ['IDEA', 'Idee'],
  ['RESEARCHING', 'Onderzoek bezig'],
  ['RESEARCHED', 'Onderzocht'],
  ['SCRIPTING', 'Script schrijven'],
  ['SCRIPT_READY', 'Script klaar'],
  ['FACT_CHECK', 'Feiten en compliance'],
  ['REVISION_REQUIRED', 'Herziening nodig'],
  ['APPROVED_FOR_PRODUCTION', 'Klaar voor productie'],
  ['AUDIO_GENERATING', 'Audio genereren'],
  ['RENDERING', 'Renderen'],
  ['RENDERED', 'Gerenderd'],
  ['QA_REVIEW', 'Media-QA'],
  ['READY_FOR_EDITOR', 'Wacht op eigenaar'],
  ['APPROVED_FOR_PUBLISHING', 'Goedgekeurd'],
  ['SCHEDULED', 'Ingepland'],
  ['PUBLISHED', 'Gepubliceerd'],
  ['FAILED', 'Mislukt'],
  ['ARCHIVED', 'Gearchiveerd'],
] as const;

export type Stage = (typeof STAGES)[number][0];
export const stageLabel = (s: string) => STAGES.find(([id]) => id === s)?.[1] ?? s;

export const GATE_LABELS: Record<string, string> = {
  G1: 'Onderzoek',
  G2: 'Redactie',
  G3: 'Feiten en compliance',
  G4: 'Media-QA',
  G5: 'Eigenaar',
};

export const ERROR_HINTS: Record<string, string> = {
  INVALID_TRANSITION: 'Deze overgang is niet toegestaan vanuit de huidige fase.',
  GATE_NOT_SATISFIED: 'Een verplichte poort (gate) is nog niet goedgekeurd.',
  NOT_AUTHORIZED: 'Deze actor mag dit niet.',
  BINDING_MISMATCH: 'De goedkeuring hoort bij een andere versie van video of caption.',
  EMERGENCY_STOP: 'De noodstop is actief.',
  DUPLICATE_TOPIC: 'Dit onderwerp bestaat al.',
};
