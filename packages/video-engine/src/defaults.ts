// Studio preview defaults. Silent (no voice), no captions. Template C uses the REAL finance-engine
// calculation; Templates A/B use clearly labelled illustrative example data only.
import { brand } from '@rj/brand';
import { reelCalculationFromEngine } from './calc/from-finance-engine';
import type { TemplateAProps, TemplateBProps, TemplateCProps } from './schemas';

const scenes = (ids: [string, number][]) => {
  let t = 0;
  return ids.map(([id, ms]) => {
    const s = { id, startMs: t, endMs: t + ms };
    t += ms;
    return s;
  });
};
const timeline = (ids: [string, number][]) => {
  const s = scenes(ids);
  return { totalMs: s[s.length - 1]!.endMs, scenes: s };
};
const silent = { src: null, provider: 'none' as const, brandVoice: false, durationMs: 0 };
// Neutral tagline: the full brand promise reads as a promise of wealth/freedom in a returns context.
const cta = { text: brand.cta, tagline: 'Meer inzicht.' };

export const defaultTemplateC: TemplateCProps = {
  timeline: timeline([['hook', 3500], ['assumptions', 6500], ['growth', 7500], ['result', 7500], ['risks', 6500], ['cta', 3500]]),
  voice: silent,
  captions: [],
  footnote: { text: 'Hypothetisch rekenvoorbeeld · geen advies · bedragen exclusief kosten en belasting, inflatie alleen waar vermeld' },
  cta,
  kicker: 'Geld in cijfers',
  hookLines: ['Wat doet', '€250 per maand', 'beleggen over 30 jaar?'],
  hookHighlightLine: 1,
  calculation: reelCalculationFromEngine(),
  assumptionsFootnote: 'Rente-op-rente per maand, afgeleid van 7% effectief per jaar. Zonder kosten en belasting.',
  risks: { title: 'Let op', items: ['Hypothetisch voorbeeld, geen garantie', 'Eindbedrag is nominaal: exclusief kosten, belasting en inflatie', 'Echte rendementen schommelen, ook negatief'] },
};

export const defaultTemplateA: TemplateAProps = {
  timeline: timeline([['hook', 3000], ['chart', 6000], ['stats', 5000], ['takeaway', 4000], ['cta', 3000]]),
  voice: silent,
  captions: [],
  footnote: { text: 'VOORBEELD: illustratieve data, geen echte koersen' },
  cta,
  kicker: 'Rendement in 30 seconden',
  hookLines: ['Wat is', 'rendement', 'eigenlijk?'],
  hookHighlightLine: 1,
  chart: { title: 'Voorbeeldverloop', illustrative: true, unit: 'index', points: [100, 104, 101, 109, 113, 110, 118].map((value, i) => ({ label: `jaar ${i}`, value })) },
  stats: [{ value: '+18', label: 'Voorbeeld: indexpunten' }],
  takeaway: 'Voorbeeldtekst: vervang door een goedgekeurde boodschap.',
};

export const defaultTemplateB: TemplateBProps = {
  timeline: timeline([['hook', 3000], ['chart', 6000], ['points', 6000], ['cta', 3000]]),
  voice: silent,
  captions: [],
  footnote: { text: 'VOORBEELD: illustratieve data' },
  cta,
  kicker: 'De markt uitgelegd',
  headline: 'Voorbeeld: wat betekent een renteverlaging?',
  source: { name: 'VOORBEELDBRON (placeholder)', url: 'https://example.org/bron', publishedAt: '2026-10-01' },
  candles: {
    title: 'Voorbeeldkoers',
    illustrative: true,
    data: [
      [100, 104, 98, 103], [103, 106, 101, 102], [102, 108, 101, 107], [107, 109, 103, 104], [104, 111, 104, 110],
      [110, 113, 106, 108], [108, 115, 107, 114], [114, 116, 109, 111],
    ].map(([open, high, low, close], i) => ({ label: `d${i + 1}`, open: open!, high: high!, low: low!, close: close! })),
  },
  points: ['Voorbeeldpunt één', 'Voorbeeldpunt twee', 'Voorbeeldpunt drie'],
};
