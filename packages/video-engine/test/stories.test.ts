import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateRef, formatValue, ideasDocumentSchema, type Unit } from '@rj/content-ideas';
import { KIND_FILE, STORY, STORY_CTA, STORY_FOOTER, spanAllowed } from '../src/stories/layout';
import { storyFrameSchema } from '../src/stories/schema';
import { STORY_DEFS, allowedNumbers, buildAllStorySets, frameTexts, numberTokens, setProblems, textProblems } from '../src/stories/spec';
import { REPO_DIR } from '../scripts/lib/paths';

const doc = ideasDocumentSchema.parse(JSON.parse(readFileSync(join(REPO_DIR, 'content/ideas/2026-10-30-15-ideeen.json'), 'utf8')));
const sets = buildAllStorySets(doc);

describe('Instagram Stories', () => {
  it('builds 4 frames for 14 ideas and skips idea 14 (no data)', () => {
    expect(sets).toHaveLength(14);
    expect(sets.some((s) => s.ideaId === 14)).toBe(false);
    for (const s of sets) expect(s.frames.map((f) => `${f.order}-${KIND_FILE[f.kind]}`)).toEqual(['1-vraag', '2-antwoord', '3-reel-teaser', '4-quick-fact']);
  });

  it('safe zones: header, content and footer stay out of the top/bottom 250 px; the sticker band is 300 px and empty', () => {
    const { header, content, footer, stickerBand } = STORY;
    for (const [top, bottom] of [[header.top, header.top + header.height], [content.top, content.bottom], [footer.top, footer.bottom]] as const) expect(spanAllowed(top, bottom)).toBe(true);
    expect(stickerBand.bottom - stickerBand.top).toBeGreaterThanOrEqual(300);
    expect(content.bottom).toBeLessThanOrEqual(stickerBand.top);
    expect(footer.top).toBeGreaterThanOrEqual(stickerBand.bottom);
    expect(spanAllowed(100, 200)).toBe(false);
    expect(spanAllowed(1700, 1800)).toBe(false);
    expect(spanAllowed(1400, 1450)).toBe(false);
    expect(Math.min(...Object.values(STORY.minFont))).toBeGreaterThanOrEqual(26);
  });

  it('every frame: one-line footer, tips CTA style, no progress bar, no link or sticker text', () => {
    for (const s of sets) for (const f of s.frames) {
      expect(f.props.footer).toBe(STORY_FOOTER);
      expect(Object.keys(f.props)).not.toContain('showProgress');
      if (f.props.cta) expect(f.props.cta).toBe(STORY_CTA);
      expect(frameTexts(f.props).join(' ')).not.toMatch(/https?:|www\.|swipe|sticker/i);
      expect(storyFrameSchema.safeParse(f.props).success).toBe(true);
    }
    expect(sets[0]!.frames[2]!.props.big!.map((b) => b.text).join(' ')).toBe('Nieuw: zie de Reel');
  });

  it('rejects other accounts\' names and forbidden phrases', () => {
    expect(textProblems(['Beurswijzer', 'KOERSTIJGERS tips', 'finance op orde'])).toHaveLength(3);
    expect(textProblems(['koop dit nu', 'gegarandeerd rendement'])).toHaveLength(2);
    expect(textProblems(['Beleggen', 'Persoonlijke financiën', 'Markt'])).toHaveLength(0);
    for (const s of sets) expect(textProblems(s.frames.flatMap((f) => frameTexts(f.props)).concat(s.stickers.lines))).toEqual([]);
  });

  it('numbers equal the engine: claims re-evaluate, are on the frame, and no unknown number appears', () => {
    for (const s of sets) {
      const idea = doc.ideas.find((i) => i.id === s.ideaId)!;
      expect(setProblems(idea, s, evaluateRef)).toEqual([]);
      const ans = s.frames[1]!;
      const claim = idea.claims.find((c) => c.key === STORY_DEFS[idea.id]!.answer)!;
      expect(ans.props.big![0]!.text).toBe(formatValue(claim.unit as Unit, evaluateRef(claim.calculationRef)));
    }
  });

  it('the checks catch a wrong number', () => {
    const idea = doc.ideas.find((i) => i.id === 1)!;
    const set = structuredClone(sets[0]!);
    set.frames[1]!.props.big![0]!.text = '€61.000';
    expect(setProblems(idea, set, evaluateRef).length).toBeGreaterThan(0);
    expect(allowedNumbers(idea).has('61000')).toBe(false);
    expect(numberTokens('€10.000 bij 6,17%')).toEqual(['10000', '6,17']);
  });

  it('the Vraag frame withholds the answer; the poll has exactly one correct bucket', () => {
    for (const s of sets) {
      const idea = doc.ideas.find((i) => i.id === s.ideaId)!;
      const answer = frameTexts(s.frames[1]!.props)[3];
      expect(frameTexts(s.frames[0]!.props).join(' ')).not.toContain(answer!);
      expect(s.stickers.poll.options).toHaveLength(3);
      const [lo, hi] = STORY_DEFS[idea.id]!.poll;
      expect(lo).toBeLessThan(hi);
    }
  });
});

describe('Story frames without optional parts', () => {
  it('the Remotion default props carry no optional fields that would leak into other frames', async () => {
    const { readFileSync: rf } = await import('node:fs');
    const src = rf(join(REPO_DIR, 'packages/video-engine/src/templates/Story.tsx'), 'utf8');
    const def = src.slice(src.indexOf('export const defaultStory'));
    for (const key of ['eyebrow', 'line', 'assumptions', 'cta']) expect(def).not.toContain(`${key}:`);
    const teaser = sets[0]!.frames[2]!.props;
    expect(teaser.eyebrow).toBeUndefined();
    expect(teaser.assumptions).toBeUndefined();
  });
});
