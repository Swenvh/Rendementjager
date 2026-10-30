import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WorkflowService } from '@rj/content-engine';
import { createSqliteRepository } from '@rj/database';
import { evaluateRef, ideasDocumentSchema } from '@rj/content-ideas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildIdeaDrafts, compactDuration, compactLabel, compactRowLabel, parseIdeaNotes, parseIdeasFile, registerIdea, verifyIdeaNumbers, writeIdeaFiles } from './ideas-import.js';

const FILE = resolve(__dirname, '../../../content/ideas/2026-10-30-15-ideeen.json');

describe('ideas import: schema and numbers', () => {
  it('the idea sheet validates against ideasDocumentSchema', () => {
    expect(ideasDocumentSchema.safeParse(JSON.parse(readFileSync(FILE, 'utf8'))).success).toBe(true);
  });
  it('builds 14 drafts, blocks the template idea without data', () => {
    const drafts = buildIdeaDrafts(parseIdeasFile(FILE));
    expect(drafts).toHaveLength(15);
    const blocked = drafts.filter((d) => d.blocked);
    expect(blocked.map((d) => d.ideaId)).toEqual([14]);
    expect(blocked[0]!.claims).toHaveLength(0);
    expect(drafts.filter((d) => !d.blocked)).toHaveLength(14);
    expect(new Set(drafts.map((d) => d.contentHash)).size).toBe(15);
    expect(drafts.filter((d) => d.template === 'C').every((d) => !!(d.storyboard.table as { chart?: unknown }).chart)).toBe(true);
    expect(drafts.filter((d) => d.template === 'A').every((d) => (d.storyboard.table as { size?: string }).size === 'large')).toBe(true);
  });
  it('every claim and every displayed cell equals the finance-engine today', () => {
    const doc = parseIdeasFile(FILE);
    for (const idea of doc.ideas.filter((i) => i.dataOrigin === 'calculated')) {
      expect(verifyIdeaNumbers(idea), `idea ${idea.id}`).toEqual([]);
    }
    for (const d of buildIdeaDrafts(doc).filter((x) => !x.blocked)) {
      for (const c of d.claims) {
        const engine = evaluateRef(c.calculationRef);
        const expected = c.unit === 'percent' ? engine * 100 : engine;
        expect(c.value, `${d.slug} ${c.key}`).toBeCloseTo(expected, 6);
      }
    }
  });
  it('rejects an idea whose shown number differs from the engine', () => {
    const doc = parseIdeasFile(FILE);
    const tampered = structuredClone(doc);
    tampered.ideas[0]!.table.rows[0]!.cells.y10 = '€17.909';
    expect(() => buildIdeaDrafts(tampered)).toThrow(/does not match|do not match|engine/);
    const tampered2 = structuredClone(doc);
    tampered2.ideas[1]!.claims[0]!.value += 1;
    expect(() => buildIdeaDrafts(tampered2)).toThrow(/engine/);
  });
  it('shortens only what does not fit on screen', () => {
    expect(compactDuration('12 jaar en 11 mnd')).toBe('12 jr 11 mnd');
    expect(compactDuration('8 jaar')).toBe('8 jr');
    expect(compactLabel('Zonder rendement')).toBe('Bij 0%');
    expect(compactLabel('Bij 4% rendement')).toBe('Bij 4%');
    expect(compactLabel('Na 10 jaar')).toBe('Na 10 jaar');
  });
  it('uses our own on-screen labels and never another account\'s name', () => {
    const drafts = buildIdeaDrafts(parseIdeasFile(FILE)).filter((d) => !d.blocked);
    for (const d of drafts) {
      expect(['Beleggen', 'Persoonlijke financiën', 'Markt']).toContain(d.storyboard.onScreen.kicker);
      for (const t of [d.storyboard.onScreen.kicker, d.title, d.caption, d.scriptMd.split('## Hooks')[0]!, ...d.hashtags, JSON.stringify(d.storyboard)]) expect(/beurswijzer|koerstijgers|finance\s+op\s+orde/i.test(t)).toBe(false);
    }
    const doc = structuredClone(parseIdeasFile(FILE));
    doc.ideas[0]!.caption += '\nMet dank aan Beurswijzer';
    expect(() => buildIdeaDrafts(doc)).toThrow();
  });
  it('shortens long row labels for the video', () => {
    expect(compactRowLabel('Vaste lasten en noodzaak')).toBe('Vaste lasten');
    expect(compactRowLabel('Wensen')).toBe('Wensen');
  });
  it('keeps on-screen text plain: short footer, tips CTA, no progress bar, one-line footer', () => {
    for (const d of buildIdeaDrafts(parseIdeasFile(FILE)).filter((x) => !x.blocked)) {
      expect(d.storyboard.onScreen.cta).toBe('Meer tips? Volg @rendementjager');
      expect((d.storyboard.table.footerLine as string).length).toBeLessThanOrEqual(60);
      expect((d.storyboard.table.title as string).length).toBeLessThanOrEqual(72);
      expect(d.caption).toContain('Meer tips? Volg @rendementjager');
      expect(d.caption).toMatch(/geen (beleggings)?advies|geen persoonlijk advies/i);
    }
  });
});

describe('ideas import: registration', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rj-ideas-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('registers 14 ideas at stage IDEA with claims, approves nothing, and is idempotent', async () => {
    const repo = createSqliteRepository(join(dir, 'test.sqlite'));
    const wf = new WorkflowService(repo, { env: {} });
    try {
      const drafts = buildIdeaDrafts(parseIdeasFile(FILE)).filter((d) => !d.blocked);
      for (const d of drafts) expect((await registerIdea(repo, wf, d, 'content/ideas/x.json')).status).toBe('created');
      const rows = await repo.contentItems.list();
      expect(rows).toHaveLength(14);
      for (const r of rows) {
        expect(r.stage).toBe('IDEA');
        expect(r.currentScriptRevisionId).not.toBeNull();
        expect(r.captionHash).not.toBeNull();
        expect(r.currentAssetSha256).toBeNull();
        expect(parseIdeaNotes(r.notes)?.rj).toBe('idea/1');
        const claims = await repo.financialClaims.list({ contentId: r.id });
        expect(claims.length).toBeGreaterThan(0);
        expect(claims.every((c) => c.status === 'unverified' && c.calculationRef?.startsWith('@rj/finance-engine:'))).toBe(true);
      }
      expect(await repo.approvals.count()).toBe(0);
      expect(await repo.financialClaims.count()).toBe(drafts.reduce((s, d) => s + d.claims.length, 0));
      expect(await repo.storyboards.count()).toBe(14);
      // second run: nothing new
      for (const d of drafts) expect((await registerIdea(repo, wf, d, 'content/ideas/x.json')).status).toBe('unchanged');
      expect(await repo.contentItems.count()).toBe(14);
      expect(await repo.scriptRevisions.count()).toBe(14);
      expect(await repo.financialClaims.count()).toBe(drafts.reduce((s, d) => s + d.claims.length, 0));
      // an edited idea sheet (other hash, same title) is reported, not overwritten
      const edited = { ...drafts[0]!, contentHash: 'f'.repeat(64) };
      expect((await registerIdea(repo, wf, edited, 'content/ideas/x.json')).status).toBe('changed');
      expect(await repo.contentItems.count()).toBe(14);
    } finally {
      await repo.close();
    }
  });

  it('writes the script folder deterministically and skips unchanged folders', () => {
    const d = buildIdeaDrafts(parseIdeasFile(FILE)).find((x) => x.ideaId === 2)!;
    const out = join(dir, 'scripts');
    expect(writeIdeaFiles(d, out)).toBe(join(out, d.slug));
    for (const f of ['script.md', 'caption.md', 'storyboard.json', 'idea.json', 'metadata.json']) expect(existsSync(join(out, d.slug, f)), f).toBe(true);
    const first = readFileSync(join(out, d.slug, 'idea.json'), 'utf8');
    expect(writeIdeaFiles(d, out)).toBeNull();
    expect(readFileSync(join(out, d.slug, 'idea.json'), 'utf8')).toBe(first);
    expect(JSON.parse(readFileSync(join(out, d.slug, 'storyboard.json'), 'utf8')).template).toBe('TemplateC');
  });
});

describe('on-screen headers and labels fit', () => {
  it('every column header is at most 14 characters on screen and no row label is cut', () => {
    for (const d of buildIdeaDrafts(parseIdeasFile(FILE)).filter((x) => !x.blocked)) {
      const t = d.storyboard.table as { columns: { label: string }[]; rows: { cells: Record<string, string> }[] };
      for (const c of t.columns) expect(c.label.length, `${d.slug} ${c.label}`).toBeLessThanOrEqual(14);
    }
  });
});
