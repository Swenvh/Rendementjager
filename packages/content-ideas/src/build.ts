import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdeasDocument } from './ideas.js';
import { markdownToHtml, renderMarkdown } from './render.js';
import { ideasDocumentSchema } from './schema.js';

/**
 * Writes content/ideas/<date>-15-ideeen.{md,json} and output/reports/<date>-15-ideeen.html (print source for the PDF).
 * Run from the repo root: npx tsx packages/content-ideas/src/build.ts
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const doc = ideasDocumentSchema.parse(buildIdeasDocument());
const base = `${doc.date}-15-ideeen`;
mkdirSync(resolve(root, 'content/ideas'), { recursive: true });
mkdirSync(resolve(root, 'output/reports'), { recursive: true });
const md = renderMarkdown(doc);
writeFileSync(resolve(root, `content/ideas/${base}.json`), JSON.stringify(doc, null, 2) + '\n');
writeFileSync(resolve(root, `content/ideas/${base}.md`), md);
writeFileSync(resolve(root, `output/reports/${base}.html`), markdownToHtml(md, '15 Reel-ideeën met rekenvoorbeelden'));
console.log(`wrote ${base}.json, .md, .html (${doc.ideas.length} ideas)`);
