import { describe, expect, it } from 'vitest';
import { auditReason, nl } from '../src/lib/nl';

describe('Dutch UI messages', () => {
  it('translates gate reasons and workflow errors', () => {
    expect(nl('G1 not approved yet')).toBe('G1 is nog niet goedgekeurd');
    expect(nl('G2 approval does not match the current script revision')).toContain('G2-goedkeuring');
    expect(nl('G3 needs a fact-checker (or owner) approval')).toContain('feitencontrole');
    expect(nl('IDEA -> SCHEDULED is not an allowed transition')).toBe('De stap van “Idee” naar “Ingepland” is niet toegestaan');
    expect(nl('Emergency stop is active: only FAILED or ARCHIVED are allowed')).toContain('noodstop');
    expect(nl('Iets onbekends')).toBe('Iets onbekends');
  });
  it('translates audit reasons', () => {
    expect(auditReason('created')).toBe('aangemaakt');
    expect(auditReason('G5 invalidated: caption changed')).toBe('G5 ongeldig gemaakt: caption gewijzigd');
    expect(auditReason('Handmatig naar Idee')).toBe('Handmatig naar Idee');
  });
});
