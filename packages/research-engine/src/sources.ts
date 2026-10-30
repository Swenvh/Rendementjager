/**
 * Approved source registry. Tier 1 = official regulator / government / central bank / statistics
 * office (primary source). Tier 2 = official EU bodies, exchanges, index providers, consumer
 * authorities. Tier 3 = reputable secondary sources (only for context, never the sole source
 * for a number on screen).
 */
export type TrustTier = 1 | 2 | 3;

export interface ApprovedSource {
  id: string;
  name: string;
  domains: readonly string[];
  tier: TrustTier;
  topics: readonly string[];
}

export const APPROVED_SOURCES: readonly ApprovedSource[] = [
  { id: 'afm', name: 'Autoriteit Financiële Markten (AFM)', domains: ['afm.nl'], tier: 1, topics: ['toezicht', 'beleggen', 'risico', 'waarschuwingen'] },
  { id: 'dnb', name: 'De Nederlandsche Bank (DNB)', domains: ['dnb.nl'], tier: 1, topics: ['rente', 'inflatie', 'pensioen', 'sparen', 'statistiek'] },
  { id: 'ecb', name: 'Europese Centrale Bank (ECB)', domains: ['ecb.europa.eu'], tier: 1, topics: ['rente', 'inflatie', 'monetair beleid'] },
  { id: 'cbs', name: 'Centraal Bureau voor de Statistiek (CBS)', domains: ['cbs.nl', 'opendata.cbs.nl'], tier: 1, topics: ['inflatie', 'cpi', 'inkomen', 'vermogen', 'woningmarkt'] },
  { id: 'belastingdienst', name: 'Belastingdienst', domains: ['belastingdienst.nl'], tier: 1, topics: ['box 3', 'belasting', 'toeslagen', 'heffingskorting'] },
  { id: 'rijksoverheid', name: 'Rijksoverheid', domains: ['rijksoverheid.nl', 'government.nl'], tier: 1, topics: ['wetgeving', 'aow', 'pensioen', 'belastingplan'] },
  { id: 'overheid-wetten', name: 'Wetten.overheid.nl', domains: ['wetten.overheid.nl', 'officielebekendmakingen.nl'], tier: 1, topics: ['wetgeving'] },
  { id: 'svb', name: 'Sociale Verzekeringsbank (SVB)', domains: ['svb.nl'], tier: 1, topics: ['aow', 'kinderbijslag'] },
  { id: 'cpb', name: 'Centraal Planbureau (CPB)', domains: ['cpb.nl'], tier: 1, topics: ['economie', 'ramingen'] },
  { id: 'nibud', name: 'Nibud', domains: ['nibud.nl'], tier: 2, topics: ['budget', 'huishoudfinanciën'] },
  { id: 'wijzeringeldzaken', name: 'Wijzer in geldzaken', domains: ['wijzeringeldzaken.nl'], tier: 2, topics: ['financiële educatie', 'pensioen', 'beleggen'] },
  { id: 'esma', name: 'European Securities and Markets Authority (ESMA)', domains: ['esma.europa.eu'], tier: 2, topics: ['toezicht', 'fondsen', 'kosten'] },
  { id: 'eurostat', name: 'Eurostat', domains: ['ec.europa.eu'], tier: 2, topics: ['inflatie', 'hicp', 'statistiek'] },
  { id: 'euronext', name: 'Euronext', domains: ['euronext.com'], tier: 2, topics: ['beurs', 'aex', 'indices'] },
  { id: 'msci', name: 'MSCI (index methodology/factsheets)', domains: ['msci.com'], tier: 2, topics: ['indices', 'historisch rendement'] },
  { id: 'acm', name: 'Autoriteit Consument & Markt (ACM)', domains: ['acm.nl', 'consuwijzer.nl'], tier: 2, topics: ['consumentenrecht'] },
  { id: 'kifid', name: 'Kifid', domains: ['kifid.nl'], tier: 2, topics: ['klachten financiële dienstverlening'] },
];

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Matches the URL's host to a registry domain (exact or subdomain). Null = not approved. */
export function findApprovedSource(url: string): ApprovedSource | null {
  const host = hostnameOf(url);
  if (!host) return null;
  return APPROVED_SOURCES.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? null;
}

export function isApprovedUrl(url: string): boolean {
  const u = hostnameOf(url) !== null && url.startsWith('https://');
  return u && findApprovedSource(url) !== null;
}
