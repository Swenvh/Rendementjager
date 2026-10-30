import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertClipUsable, captionCreditLine, clipIssues, creditLineOf, loadManifest, saveManifest, usableClips, validateManifest, type Clip } from '../src/index.js';
import { clipsNeeded, pickClipChain } from '../src/index.js';

const good: Clip = {
  id: 'polder-01', file: 'nl/polder-01.mp4', title: 'Polder bij zonsopkomst', sourceUrl: 'https://www.pexels.com/video/x-1/', author: 'Jan Jansen',
  licence: 'Pexels License', licenceUrl: 'https://www.pexels.com/license/', retrievedDate: '2026-10-30', location: 'Polder bij Zwolle', durationS: 12, width: 1080, height: 1920,
};
const today = new Date('2026-10-30T12:00:00Z');
const issues = (c: Partial<Clip>) => clipIssues(c, { today });

describe('clip validator (licence gate)', () => {
  it('accepts a complete entry with an allowed licence', () => expect(issues(good)).toEqual([]));
  it.each(['id', 'file', 'title', 'author', 'location', 'retrievedDate', 'durationS', 'width', 'height', 'licence', 'sourceUrl', 'licenceUrl'] as const)('refuses a missing %s', (k) => {
    const c = { ...good } as Record<string, unknown>;
    delete c[k];
    expect(issues(c as Partial<Clip>).length).toBeGreaterThan(0);
  });
  it.each(['Standard YouTube License', 'All rights reserved', 'unknown', 'CC BY-NC', 'pexels license', ''])('refuses the licence "%s"', (licence) => {
    expect(issues({ ...good, licence: licence as never }).join()).toMatch(/licence/);
  });
  it('refuses placeholders, bad dates, path escapes and non-https URLs', () => {
    expect(issues({ ...good, author: 'TODO' })).toContain('author missing');
    expect(issues({ ...good, retrievedDate: '2026-02-31' }).join()).toMatch(/retrievedDate/);
    expect(issues({ ...good, retrievedDate: '2027-01-01' }).join()).toMatch(/retrievedDate/);
    expect(issues({ ...good, file: 'nl/../../etc/x.mp4' }).join()).toMatch(/file/);
    expect(issues({ ...good, file: 'other/x.mp4' }).join()).toMatch(/file/);
    expect(issues({ ...good, sourceUrl: 'http://pexels.com/x' }).join()).toMatch(/sourceUrl/);
  });
  it('CC BY needs creditRequired and gets a credit line', () => {
    const cc: Clip = { ...good, licence: 'CC BY', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/', title: 'Dutch Windmills', author: 'Scenic NL' };
    expect(issues(cc).join()).toMatch(/creditRequired/);
    const ok = { ...cc, creditRequired: true };
    expect(issues(ok)).toEqual([]);
    expect(captionCreditLine(ok)).toBe('Beeld: Dutch Windmills van Scenic NL (CC BY)');
  });
  it('Pexels needs no credit but a credit line is recorded', () => {
    expect(captionCreditLine(good)).toBeNull();
    expect(creditLineOf(good)).toBe('Beeld: Jan Jansen via Pexels');
  });
  it('Owner-provided: URLs optional, rightsNote kept, author required', () => {
    const own: Clip = { id: 'eigen-01', file: 'nl/eigen-01.mov', title: 'Eigen drone', author: 'Eigenaar', licence: 'Owner-provided', retrievedDate: '2026-10-30', location: 'Zwolle', durationS: 10, width: 1080, height: 1920, rightsNote: 'Owner declares rights held; not independently verified' };
    expect(issues(own)).toEqual([]);
    expect(issues({ ...own, author: '' })).toContain('author missing');
  });
});

describe('manifest on disk', () => {
  const root = mkdtempSync(join(tmpdir(), 'rj-footage-'));
  mkdirSync(join(root, 'nl'));
  writeFileSync(join(root, 'nl', 'polder-01.mp4'), 'x');
  it('missing manifest = empty library', () => expect(loadManifest(root).clips).toEqual([]));
  it('usable only with file present, complete entry and allowed licence; duplicates refused', () => {
    const missingFile = { ...good, id: 'weg-01', file: 'nl/weg-01.mp4' };
    const badLicence = { ...good, id: 'bad-01', file: 'nl/bad-01.mp4', licence: 'Standard YouTube License' as never };
    writeFileSync(join(root, 'nl', 'bad-01.mp4'), 'x');
    saveManifest(root, { version: 1, clips: [good, missingFile, badLicence] });
    expect(usableClips(root).map((c) => c.id)).toEqual(['polder-01']);
    const v = validateManifest({ version: 1, clips: [good, good] }, { root, checkFiles: true, today });
    expect(v.usable).toHaveLength(0);
    expect(v.reports[0]!.issues).toContain('duplicate id');
    expect(() => assertClipUsable(badLicence, root)).toThrow(/refused/);
    expect(() => assertClipUsable(good, root)).not.toThrow();
  });
});

describe('deterministic clip chains', () => {
  const clips = Array.from({ length: 12 }, (_, i) => ({ ...good, id: `c${String(i).padStart(2, '0')}` }));
  const slugs = ['2026-10-23-a', '2026-10-24-b', '2026-10-25-c', '2026-10-26-d'];
  it('empty library = none', () => expect(pickClipChain([], 'x', [], 3)).toEqual([]));
  it('same input, same output; no clip twice in one Reel', () => {
    const a = pickClipChain(clips, slugs[1]!, slugs, 4).map((c) => c.id);
    expect(a).toEqual(pickClipChain(clips, slugs[1]!, slugs, 4).map((c) => c.id));
    expect(new Set(a).size).toBe(4);
  });
  it('neighbouring Reels share no clip (library >= 12, chains <= 6)', () => {
    for (let i = 0; i + 1 < slugs.length; i++) {
      const a = pickClipChain(clips, slugs[i]!, slugs, 5).map((c) => c.id);
      const b = pickClipChain(clips, slugs[i + 1]!, slugs, 5).map((c) => c.id);
      expect(a.some((id) => b.includes(id))).toBe(false);
    }
  });
  it('a small library gives a shorter chain, never repeats', () => {
    expect(pickClipChain(clips.slice(0, 2), slugs[0]!, slugs, 5)).toHaveLength(2);
  });
  it('clipsNeeded covers the Reel with 1 s crossfades', () => {
    expect(clipsNeeded(8, 10)).toBe(1);
    expect(clipsNeeded(50, 10)).toBe(6);
    expect(clipsNeeded(19, 10)).toBe(2);
  });
});
