// Prints output/reports/<date>-15-ideeen.html to PDF with the preinstalled Chromium (Playwright).
// Usage: node packages/content-ideas/scripts/make-pdf.mjs [html] [pdf]
// Env: PLAYWRIGHT_MODULE (path to the playwright package, default /opt/node-tools/node_modules/playwright),
//      PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers).
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const html = resolve(process.argv[2] ?? `${root}/output/reports/2026-10-30-15-ideeen.html`);
const pdf = resolve(process.argv[3] ?? `${root}/output/reports/2026-10-30-15-ideeen.pdf`);
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/opt/node-tools/node_modules/playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href);
await page.pdf({ path: pdf, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#667">Rendementjager, 15 Reel-ideeën, <span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
await browser.close();
console.log(`wrote ${pdf}`);
