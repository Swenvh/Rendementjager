/**
 * Automated copy checks (education, not advice). These are a first filter only: G3 (fact-check +
 * compliance by reviewers) still decides. A hit here blocks bulk advancing in Mission Control.
 */
export interface LintFinding {
  rule: string;
  match: string;
}

const RULES: { rule: string; re: RegExp }[] = [
  { rule: 'promise-as-claim: "Meer vermogen. Meer vrijheid."', re: /meer\s+vermogen\.?\s*meer\s+vrijheid/i },
  { rule: 'promise: gegarandeerd/zeker rendement', re: /gegarandeerd|zeker\s+(rendement|winst)|risicoloos|zonder\s+risico/i },
  { rule: 'guarantee wording without negation', re: /(?<!geen\s)(?<!geen\s\w+\s)garantie(?!\s+voor\s+de\s+toekomst)/i },
  { rule: 'advice: koop/verkoop/instappen', re: /\b(koop|verkoop|stap\s+nu\s+in|nu\s+instappen|je\s+moet\s+(beleggen|kopen))\b/i },
  { rule: 'urgency/FOMO', re: /\b(mis\s+het\s+niet|laatste\s+kans|nu\s+of\s+nooit|voordat\s+het\s+te\s+laat|snel\s+rijk|rijk\s+worden|vandaag\s+nog)\b/i },
  { rule: 'hype: financiële vrijheid belofte', re: /financieel\s+vrij\s+(worden|zijn)\s+(met|in)/i },
  { rule: 'named product/broker', re: /\b(degiro|trading\s*212|bitvavo|coinbase|vanguard|ishares|bux|brand\s+new\s+day|meesman)\b/i },
];

export function lintCopy(text: string): LintFinding[] {
  const out: LintFinding[] = [];
  for (const { rule, re } of RULES) {
    const m = re.exec(text);
    if (m) out.push({ rule, match: m[0] });
  }
  return out;
}

/** Items must state the hypothetical nature and carry the risk warning. */
export function requiredDisclaimers(caption: string): string[] {
  const missing: string[] = [];
  if (!/hypothetisch/i.test(caption)) missing.push('woord "hypothetisch" ontbreekt in caption');
  if (!/geen\s+garantie/i.test(caption)) missing.push('"geen garantie" ontbreekt in caption');
  if (!/geen\s+advies/i.test(caption)) missing.push('"geen advies" ontbreekt in caption');
  if (!/risico/i.test(caption)) missing.push('risicowaarschuwing ontbreekt in caption');
  return missing;
}
