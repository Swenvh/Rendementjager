import { describe, expect, it } from 'vitest';
import { integerToDutch, numberToDutch, euroToDutch, parseDutchNumber, normalizeForSpeech } from '../src/index.js';

describe('Dutch numbers', () => {
  it.each([
    [0, 'nul'], [7, 'zeven'], [21, 'eenentwintig'], [22, 'tweeëntwintig'], [30, 'dertig'], [83, 'drieëntachtig'],
    [100, 'honderd'], [250, 'tweehonderdvijftig'], [1000, 'duizend'], [2026, 'tweeduizend zesentwintig'],
    [90000, 'negentigduizend'], [292382, 'tweehonderdtweeënnegentigduizend driehonderdtweeëntachtig'],
    [1000000, 'een miljoen'], [2500000, 'twee miljoen vijfhonderdduizend'],
  ])('%i → %s', (n, words) => expect(integerToDutch(n)).toBe(words));
  it('decimals and euros', () => {
    expect(numberToDutch(2.5)).toBe('twee komma vijf');
    expect(euroToDutch(12.5)).toBe('twaalf euro vijftig');
    expect(euroToDutch(250)).toBe('tweehonderdvijftig euro');
  });
  it('parses Dutch notation', () => {
    expect(parseDutchNumber('292.382')).toBe(292382);
    expect(parseDutchNumber('2,5')).toBe(2.5);
    expect(parseDutchNumber('1.250,75')).toBe(1250.75);
  });
});

describe('normalizeForSpeech', () => {
  it('reads percentages and euro amounts in Dutch words', () => {
    expect(normalizeForSpeech('7%')).toBe('zeven procent');
    expect(normalizeForSpeech('Stel: €250 per maand, 30 jaar lang, 7% per jaar.')).toBe(
      'Stel: tweehonderdvijftig euro per maand, dertig jaar lang, zeven procent per jaar.',
    );
    expect(normalizeForSpeech('€ 90.000 ingelegd')).toBe('negentigduizend euro ingelegd');
    expect(normalizeForSpeech('€1,5 miljoen')).toBe('een komma vijf miljoen euro');
    expect(normalizeForSpeech('2,5% inflatie')).toBe('twee komma vijf procent inflatie');
  });
  it('applies the pronunciation dictionary', () => {
    expect(normalizeForSpeech('Een ETF volgt de AEX')).toBe('Een ee-tee-ef volgt de aa-ee-iks');
    expect(normalizeForSpeech('De ECB verhoogt de rente')).toBe('De ee-cee-bee verhoogt de rente');
    expect(normalizeForSpeech('Volg @rendementjager')).toBe('Volg rendementjager');
    expect(normalizeForSpeech('samengestelde rente', 'local')).toBe('samen-gestelde rente');
    expect(normalizeForSpeech('financial independence', 'local')).toBe('fainensjel indiependens');
    expect(normalizeForSpeech('obligaties en dividend')).toBe('obligaties en dividend');
  });
  it('does not touch acronyms inside words', () => {
    expect(normalizeForSpeech('ETFonds')).toBe('ETFonds');
  });
});
