import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateRef, formatValue } from './calc.js';
import { buildIdeasDocument } from './ideas.js';
import { markdownToHtml, renderMarkdown } from './render.js';
import { CTA_TEXT, FORBIDDEN_BRAND_NAMES, ON_SCREEN_LABEL, ideaSchema, ideasDocumentSchema } from './schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const jsonPath = resolve(root, 'content/ideas/2026-10-30-15-ideeen.json');
const doc = ideasDocumentSchema.parse(buildIdeasDocument());

describe('ideas document', () => {
  it('has 15 ideas, 3 hooks each, 10 storyboard seconds, the brand CTA and the three categories', () => {
    expect(doc.ideas).toHaveLength(15);
    for (const i of doc.ideas) {
      expect(i.hooks).toHaveLength(3);
      expect(new Set(i.hooks.map((h) => h.pattern))).toEqual(new Set(['vraag', 'stelling', 'contrast']));
      expect(i.storyboard.map((s) => s.second)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(i.cta).toBe(CTA_TEXT);
      expect(i.onScreen.progressBar).toBe(false);
    }
    expect(new Set(doc.ideas.map((i) => i.category))).toEqual(new Set(['Koerstijgers', 'Finance op orde', 'Beurswijzer']));
    expect(doc.categoryInspirationAssumption).toMatch(/AANNAME/);
    expect(doc.categoryInspirationAssumption).toMatch(/niet bereikbaar/);
  });

  it('every number is reproducible: each ref re-evaluates to the stored value and the cell text', () => {
    let checked = 0;
    for (const i of doc.ideas.filter((x) => x.dataOrigin === 'calculated')) {
      for (const r of i.table.rows) {
        for (const c of i.table.columns) {
          if (c.kind !== 'value' || c.unit === 'text') continue;
          const v = evaluateRef(r.refs[c.key]!);
          expect(v).toBeCloseTo(r.values[c.key]!, 9);
          expect(r.cells[c.key]).toBe(formatValue(c.unit, v));
          checked++;
        }
      }
      for (const cl of i.claims) {
        expect(evaluateRef(cl.calculationRef)).toBeCloseTo(cl.value, 9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('hand-checked anchor values', () => {
    const byId = (n: number) => doc.ideas.find((i) => i.id === n)!;
    // 1: yearly compounding of 10.000 at 6% for 10 years = 17.908,48; effective rate of 6% yearly = 6,00%
    expect(byId(1).table.rows[0]!.cells.y10).toBe('€17.908');
    expect(byId(1).table.rows[0]!.cells.eff).toBe('6,00%');
    // 15: -50% needs +100%
    expect(byId(15).table.rows.find((r) => r.cells.label === '-50%')!.cells.need).toBe('100%');
    expect(byId(15).table.rows.find((r) => r.cells.label === '-10%')!.cells.need).toBe('11,1%');
    // 6: 50/30/20 of 2500
    expect(byId(6).table.rows.map((r) => r.cells.amount)).toEqual(['€1.250', '€750', '€500']);
    // 11: 4% rule = 25x
    expect(byId(11).table.rows[1]!.cells.r4).toBe('€750.000');
    // 13: 0% return, 500 per month = 200 months = 16 jaar en 8 mnd
    expect(byId(13).table.rows[1]!.cells.r0).toBe('16 jaar en 8 mnd');
    // 7: 3 months of 2000 = 6000, built at 250 per month in 24 months
    expect(byId(7).table.rows[0]!.cells.target).toBe('€6.000');
    expect(byId(7).table.rows[0]!.cells.build).toBe('2 jaar');
  });

  it('table ideas respect the Template D limits (2-4 columns, 3-20 rows, title <= 72, footer <= 60)', () => {
    for (const i of doc.ideas) {
      expect(i.table.columns.length).toBeGreaterThanOrEqual(2);
      expect(i.table.columns.length).toBeLessThanOrEqual(4);
      expect(i.table.rows.length).toBeGreaterThanOrEqual(3);
      expect(i.table.rows.length).toBeLessThanOrEqual(20);
      expect(i.onScreen.title.length).toBeLessThanOrEqual(72);
      expect(i.onScreen.footer.length).toBeLessThanOrEqual(60);
    }
  });

  it('the market-data template carries no numbers and asks the owner for source + as-of date + period + compliance escalation', () => {
    const t = doc.ideas.filter((i) => i.dataOrigin === 'template-awaiting-data');
    expect(t.length).toBeGreaterThanOrEqual(1);
    for (const i of t) {
      expect(i.claims).toEqual([]);
      expect(i.chart).toBeUndefined();
      expect(i.dataNeeded!.complianceEscalation).toMatch(/compliance-reviewer/);
      expect(i.caption).toMatch(/\{periode\}/);
      for (const r of i.table.rows) {
        expect(r.placeholder).toBe(true);
        expect(Object.values(r.cells).join(' ')).toMatch(/DATA NODIG|naam uit dataset/);
      }
    }
  });

  it('every caption has the CTA, a disclaimer and (for return examples) the risk warning', () => {
    for (const i of doc.ideas) {
      expect(i.caption).toContain(CTA_TEXT);
      expect(i.caption).toMatch(/geen (beleggings|persoonlijk )?advies/i);
      if (i.involvesReturns) expect(i.caption).toMatch(/Beleggen brengt risico/);
      expect(i.caption).not.toMatch(/\b\d+\s?%\s+(per jaar )?zeker/i);
    }
  });

  it('never states tax figures (box 3 etc. only with the verify note)', () => {
    for (const i of doc.ideas) {
      const texts = [i.caption, ...i.assumptions, ...i.compliance, i.onScreen.subtitle];
      for (const t of texts) if (/box 3/i.test(t)) expect(t).toMatch(/verifieer/i);
    }
  });
});

describe('schema rejects bad input', () => {
  const good = doc.ideas[0]!;
  it('rejects forbidden phrases, wrong CTA, missing refs and fabricated template data', () => {
    expect(ideaSchema.safeParse({ ...good, hooks: [{ pattern: 'vraag', text: 'Koop nu deze ETF voor zeker rendement' }, good.hooks[1], good.hooks[2]] }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...good, cta: 'Volg ons' }).success).toBe(false);
    const noRef = structuredClone(good);
    noRef.table.rows[0]!.refs = {};
    expect(ideaSchema.safeParse(noRef).success).toBe(false);
    expect(ideaSchema.safeParse({ ...good, caption: good.caption.replace('Beleggen brengt risico', 'Beleggen is leuk') }).success).toBe(false);
    const tpl = structuredClone(doc.ideas.find((i) => i.dataOrigin === 'template-awaiting-data')!);
    tpl.table.rows[0]!.cells.ret = '12,3%';
    expect(ideaSchema.safeParse(tpl).success).toBe(false);
    const tpl2 = structuredClone(doc.ideas.find((i) => i.dataOrigin === 'template-awaiting-data')!);
    tpl2.dataNeeded = null;
    expect(ideaSchema.safeParse(tpl2).success).toBe(false);
  });
  it('rejects duplicate slugs and the wrong number of ideas', () => {
    expect(ideasDocumentSchema.safeParse({ ...doc, ideas: doc.ideas.slice(0, 14) }).success).toBe(false);
    const dup = structuredClone(doc);
    dup.ideas[1]!.slug = dup.ideas[0]!.slug;
    expect(ideasDocumentSchema.safeParse(dup).success).toBe(false);
  });
});

describe('committed files', () => {
  it('content/ideas JSON validates and equals a fresh build (run `npx tsx packages/content-ideas/src/build.ts` after changes)', () => {
    const onDisk = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(ideasDocumentSchema.safeParse(onDisk).success).toBe(true);
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(doc)));
  });
  it('content/ideas markdown equals the rendering of the document', () => {
    expect(readFileSync(resolve(root, 'content/ideas/2026-10-30-15-ideeen.md'), 'utf8')).toBe(renderMarkdown(doc));
  });
  it('html rendering keeps tables and escapes content', () => {
    const html = markdownToHtml('## 01. A <b>\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n', 't');
    expect(html).toContain('<table>');
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('other accounts\' names never reach the screen', () => {
  it('no on-screen text, hook, caption or hashtag mentions them; our own labels exist for every category', () => {
    for (const i of doc.ideas) {
      const texts = [i.title, i.onScreen.title, i.onScreen.subtitle, i.onScreen.footer, i.caption, ...i.hashtags, ...i.hooks.map((h) => h.text), ...i.storyboard.map((s) => s.onScreen)];
      for (const t of texts) expect(FORBIDDEN_BRAND_NAMES.test(t), t).toBe(false);
    }
    expect(Object.values(ON_SCREEN_LABEL).every((l) => !FORBIDDEN_BRAND_NAMES.test(l))).toBe(true);
    expect(doc.categoryInspirationAssumption).toMatch(/inspiratiebronnen, geen labels/);
  });
  it('the schema rejects them (case-insensitive) in captions, titles and hashtags', () => {
    const base = doc.ideas[0]!;
    for (const bad of ['BEURSWIJZER', 'Koerstijgers', 'finance op orde']) {
      expect(ideaSchema.safeParse({ ...base, caption: `${base.caption}\n${bad}` }).success, bad).toBe(false);
      expect(ideaSchema.safeParse({ ...base, onScreen: { ...base.onScreen, subtitle: bad } }).success, bad).toBe(false);
    }
    expect(ideaSchema.safeParse({ ...base, hashtags: [...base.hashtags.slice(0, 4), '#beurswijzer'] }).success).toBe(false);
  });
});
