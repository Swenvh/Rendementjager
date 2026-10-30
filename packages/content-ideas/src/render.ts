import type { Idea, IdeasDocument } from './schema.js';

/** Markdown and HTML renderings of the ideas document (same content, no extra numbers). */

const FORMAT_NAME = { D: 'Template D (tabel)', C: 'Template C (grafiek)', A: 'Template A (uitleg)' } as const;

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const mdTable = (head: string[], rows: string[][]) =>
  [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

function tableMd(i: Idea): string {
  const cols = i.table.columns;
  return mdTable(cols.map((c) => c.label), i.table.rows.map((r) => cols.map((c) => (r.highlight && c === cols[0] ? `**${r.cells[c.key]}**` : r.cells[c.key]!))));
}

function chartMd(i: Idea): string {
  if (!i.chart) return '';
  const xs = i.chart.series[0]!.points.map((p) => p.x).filter((x, idx, a) => x % 5 === 0 || idx === a.length - 1);
  const head = [i.chart.xLabel, ...i.chart.series.map((s) => s.label)];
  const rows = xs.map((x) => [String(x), ...i.chart!.series.map((s) => `€${Math.round(s.points.find((p) => p.x === x)!.y).toLocaleString('nl-NL')}`)]);
  return [`Grafiekdata (${i.chart.title}, elke 5 jaar; volledig in de JSON en het Excel-bestand). Berekening: ${i.chart.calculation}`, '', mdTable(head, rows)].join('\n');
}

function ideaMd(i: Idea): string {
  const n = String(i.id).padStart(2, '0');
  const L: string[] = [];
  L.push(`## ${n}. ${i.title}`, '');
  L.push(mdTable(['Veld', 'Waarde'], [
    ['id / slug', `${n} / \`${i.slug}\``],
    ['Categorie', i.category],
    ['Format', FORMAT_NAME[i.format]],
    ['Soort', i.dataOrigin === 'calculated' ? 'Berekend met @rj/finance-engine' : 'SJABLOON, wacht op data van de eigenaar'],
    ['Achtergrond (drone)', `${i.background.clipId}: ${i.background.location}. ${i.background.reason}`],
    ['Duurzaamheid als serie', `${i.sustainability.score} van 5`],
  ]), '');
  L.push('**Haakjes (3 varianten)**', '', ...i.hooks.map((h) => `- ${h.pattern}: "${h.text}"`), '');
  L.push('**Op het scherm (kort en simpel)**', '', `- Titel: ${i.onScreen.title}`, `- Regel: ${i.onScreen.subtitle || '(geen)'}`, `- Voetregel: ${i.onScreen.footer}`, `- CTA: ${i.onScreen.cta}`, '- Geen voortgangsbalk. Lengte 10 seconden.', '');
  L.push('**Storyboard, 10 seconden**', '', mdTable(['Sec', 'Beeld', 'Tekst op scherm'], i.storyboard.map((s) => [String(s.second), s.visual, s.onScreen || '-'])), '');
  L.push(i.dataOrigin === 'calculated' ? '**Tabeldata (berekend)**' : '**Tabelsjabloon (geen echte cijfers)**', '', tableMd(i), '');
  const inputs = Object.entries(i.inputs).map(([k, v]) => `${k}: ${v}`).join('; ');
  L.push(`Inputs: ${inputs}.`, '');
  if (i.chart) L.push(chartMd(i), '');
  L.push('**Aannames**', '', ...i.assumptions.map((a) => `- ${a}`), '');
  L.push('**Caption (volledig)**', '', '```', i.caption, '```', '');
  L.push(`**Hashtags:** ${i.hashtags.join(' ')}`, '', `**CTA:** ${i.cta}`, '');
  L.push('**Aandachtspunten compliance en fact-check**', '', ...i.compliance.map((c) => `- ${c}`), '');
  L.push('**Benodigde bronnen of data**', '', ...i.sourcesNeeded.map((c) => `- ${c}`));
  if (i.dataNeeded) {
    L.push('', '**DATA NODIG van eigenaar: bron + peildatum + periode**', '', ...i.dataNeeded.items.map((c) => `- ${c}`), '', `Compliance-escalatie: ${i.dataNeeded.complianceEscalation}`, `Importroute: ${i.dataNeeded.importCommand}`);
  }
  L.push('', `**Duurzaamheidsscore: ${i.sustainability.score} van 5.** ${i.sustainability.rationale}`, '', `- Varianten (schatting): ${i.sustainability.variants}`, `- Overlap met bestaande reeksen: ${i.sustainability.overlapWithExistingSeries}`, '');
  return L.join('\n');
}

export function renderMarkdown(doc: IdeasDocument): string {
  const L: string[] = [];
  L.push('# 15 Reel-ideeën met rekenvoorbeelden', '', `Datum: ${doc.date}. Status: IDEEËN, nog niet gerenderd en niet in de pipeline geregistreerd. De eigenaar beoordeelt eerst.`, '');
  L.push('> **Aanname over de categorieën.** ' + doc.categoryInspirationAssumption, '');
  L.push('## Hoe je dit leest', '', 'Elk idee heeft haakjes, titel, storyboard van 10 seconden, tekst op het scherm, tabel- of grafiekdata, caption, hashtags, CTA, aandachtspunten, bronnen, achtergrondsuggestie en een duurzaamheidsscore. Stijlvoorbeeld is de tabel-Reel `content/scripts/2026-10-30-tabel-r8-m50-500-contrast/` (10 seconden, Template D, korte teksten, een regel in de voet, geen voortgangsbalk).', '');
  L.push('**Gemeenschappelijke aannames**', '', ...doc.globalAssumptions.map((a) => `- ${a}`), '');
  L.push('## Overzicht', '', mdTable(['#', 'Categorie', 'Format', 'Titel', 'Soort', 'Serie-score'], doc.ideas.map((i) => [String(i.id), i.category, i.format, i.title, i.dataOrigin === 'calculated' ? 'berekend' : 'sjabloon, data nodig', `${i.sustainability.score}/5`])), '');
  const by = (c: string) => doc.ideas.filter((i) => i.category === c).map((i) => `${i.id}`).join(', ');
  L.push(`Verdeling: Beurswijzer ${by('Beurswijzer')}; Finance op orde ${by('Finance op orde')}; Koerstijgers ${by('Koerstijgers')}. Koerstijgers is licht bezet met berekende inzichten (4, 15), omdat echte koersbewegingen of nieuws een dataset met bron en peildatum van de eigenaar vragen. Idee 14 is het sjabloon voor de ETF-ranglijst; een tweede sjabloon (stijgers en dalers van de week) kan op dezelfde manier met een eigen dataset.`, '');
  L.push('## Wat de eigenaar moet beslissen of aanleveren', '',
    '- Kies welke ideeën verder gaan (Reel renderen volgt pas daarna; er is nu niets gerenderd).',
    '- Idee 14: lever een dataset aan (bron, peildatum, periode, rendementsdefinitie, selectie). Zonder dat blijft het een sjabloon. Compliance-reviewer beoordeelt de ranglijst vóór G3.',
    '- Ideeën 6, 7 en 11 noemen vuistregels (50/30/20, 3 tot 6 maanden buffer, 4%-regel): de herkomst moet eerst geverifieerd worden voordat een bron in beeld of caption komt.',
    '- Alle achtergrondclips staan in `assets/footage/plans/nl-scenic.json`, maar het manifest bevat nog geen clips (bestanden nog niet binnen).', '');
  L.push('## Controle', '', '- Elk getal in de tabellen, grafieken en captions is een aanroep van `@rj/finance-engine`; elke cel heeft een `calculationRef` in de JSON en de tests rekenen ze opnieuw uit.', '- Nieuwe, geteste functies in `packages/finance-engine/src/planning.ts`: lening/annuïteit, vroeg versus laat, 25x/4%-regel, tijd tot doel, rente-frequentie, budgetverdeling, noodbuffer, stapsgewijs sparen, herstel na daling, kostenvergelijking op een eenmalig bedrag.', '- Geen belastingcijfers en geen marktdata zijn gebruikt.', '');
  L.push('## De 15 ideeën', '');
  for (const i of doc.ideas) L.push(ideaMd(i), '---', '');
  return L.join('\n').replace(/\n---\n\n$/, '\n');
}

// ---------- tiny markdown to HTML (subset used above) ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

export function markdownToHtml(md: string, title: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) buf.push(lines[i++]!);
      i++;
      out.push(`<pre>${esc(buf.join('\n'))}</pre>`);
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) {
        const cells = lines[i]!.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(/(?<!\\) \| /).map((c) => c.replace(/\\\|/g, '|'));
        if (!cells.every((c) => /^-+$/.test(c.trim()))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(`<table><thead><tr>${head!.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else if (/^#{1,3} /.test(line)) {
      const level = /^#+/.exec(line)![0].length;
      out.push(`<h${level}${level === 2 && /^## \d\d\./.test(line) ? ' class="idea"' : ''}>${inline(line.replace(/^#+ /, ''))}</h${level}>`);
      i++;
    } else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('- ')) items.push(`<li>${inline(lines[i++]!.slice(2))}</li>`);
      out.push(`<ul>${items.join('')}</ul>`);
    } else if (line.startsWith('> ')) {
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      i++;
    } else if (line.trim() === '---') {
      out.push('<hr>');
      i++;
    } else if (line.trim() === '') {
      i++;
    } else {
      out.push(`<p>${inline(line)}</p>`);
      i++;
    }
  }
  const css = `
  @page { size: A4; margin: 16mm 14mm; }
  body { font: 10pt/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14202b; }
  h1 { font-size: 22pt; margin: 0 0 6mm; color: #0b2a3d; }
  h2 { font-size: 14pt; margin: 8mm 0 3mm; color: #0b2a3d; border-bottom: 1px solid #c9d3da; padding-bottom: 1mm; }
  h2.idea { page-break-before: always; margin-top: 0; background: #0b2a3d; color: #fff; padding: 3mm 4mm; border: 0; }
  p, li { margin: 1.5mm 0; } ul { padding-left: 5mm; margin: 1.5mm 0; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; font-size: 8.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #c9d3da; padding: 1.2mm 2mm; text-align: left; vertical-align: top; }
  th { background: #e9eff3; }
  pre { white-space: pre-wrap; background: #f4f6f8; border: 1px solid #dde3e8; padding: 3mm; font: 8.5pt/1.4 ui-monospace, Menlo, Consolas, monospace; page-break-inside: avoid; }
  code { font: 8.5pt ui-monospace, Menlo, Consolas, monospace; background: #f0f3f5; padding: 0 1mm; }
  blockquote { margin: 3mm 0; padding: 2mm 4mm; border-left: 3px solid #e0a100; background: #fff8e5; }
  p:has(> strong:only-child), p:has(> strong:only-child) + ul { break-after: avoid; }
  p:has(> strong:only-child) { break-after: avoid; }
  hr { display: none; }
  `;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${out.join('\n')}</body></html>`;
}
