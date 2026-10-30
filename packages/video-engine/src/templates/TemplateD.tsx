import React, { useLayoutEffect, useRef } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandedOutro, ReelShell } from '../components/structure';
import { formatDateNl } from '../format';
import type { TemplateDProps } from '../schemas';
import { clamp, theme } from '../theme';

/**
 * Layout budget (1080x1920). Everything stays inside the IG safe areas:
 * left 90, right 130 (action icons live in the right-hand ~120 px), bottom 380 free.
 * y 350..  title label · column header · rows · footer disclaimer (ReelShell footnote, ends above y = 1534).
 */
export const D_LAYOUT = {
  left: theme.safe.left,
  rightClear: 130,
  titleTop: theme.safe.top + 130,
  rowsTop: 600,
  rowsBottom: 1405,
  headerH: 44,
  gap: 6,
  minFont: 34,
  maxFont: 44,
  maxRowH: 92,
} as const;

/** Row height and font size from the number of rows: 8 rows get roomy boxes, 20 rows still read at >= 34 px. */
export function rowMetrics(n: number, opts: { availableH?: number; large?: boolean } = {}) {
  const avail = opts.availableH ?? D_LAYOUT.rowsBottom - D_LAYOUT.rowsTop - D_LAYOUT.headerH - 8;
  const maxRowH = opts.large ? 150 : 118;
  const maxFont = opts.large ? 60 : 50;
  const rowH = Math.min(maxRowH, Math.floor((avail - D_LAYOUT.gap * (n - 1)) / n));
  const font = Math.max(D_LAYOUT.minFont, Math.min(maxFont, Math.round(rowH * 0.48)));
  return { rowH, font };
}

/** Line under the title: subtitle and stated assumptions (calculated) or period (provided). */
export const tableInfoLine = (p: Pick<TemplateDProps, 'subtitle' | 'assumptions' | 'dataOrigin'>) =>
  [p.subtitle, ...(p.dataOrigin === 'provided' ? p.assumptions : [])].filter(Boolean).join(' · ');

const isNegative = (s: string) => /^[−-]/.test(s.trim());

/**
 * One table cell. FAILS THE RENDER when the text would be cut off (ellipsis): a truncated label or figure must never reach
 * a Reel. The layout shrinks the font to fit first (TableBlock), so this only fires when even the smallest font does not fit.
 */
const Cell: React.FC<{ text: string; style: React.CSSProperties }> = ({ text, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth + 1) throw new Error(`Table cell "${text}" does not fit its column (it would be shown with an ellipsis): shorten the text or the column header`);
  });
  return (
    <div ref={ref} style={style}>
      {text}
    </div>
  );
};

export interface TableBlockProps {
  columns: TemplateDProps['columns'];
  rows: TemplateDProps['rows'];
  /** Top of the column header (px) and bottom of the last row (px). */
  top: number;
  bottom: number;
  /** Enter progress of the header (0..1) and the frame at which the first row starts. */
  headerProgress: number;
  firstRowFrame?: number;
  /** Frames between rows. */
  step: number;
  large?: boolean;
}

/** Column header + one box per row, revealed one by one. Shared by Template D, A (large) and C (below the chart). */
export const TableBlock: React.FC<TableBlockProps> = ({ columns, rows, top, bottom, headerProgress, firstRowFrame = 12, step, large = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = rows.length;
  const width = theme.reel.width - D_LAYOUT.left - D_LAYOUT.rightClear;
  const { rowH, font: maxFontPx } = rowMetrics(n, { availableH: bottom - top - D_LAYOUT.headerH - 8, large });
  const labelCols = columns.filter((c) => c.kind === 'label');
  const valueCols = columns.filter((c) => c.kind === 'value');
  const headFont = 24;
  const pad = 20;
  const inner = width - pad * 2;
  // Estimated text width in em: digits and capitals are wide, spaces and separators narrow (Manrope 800 / Inter 500).
  const em = (t: string) => [...t].reduce((a, ch) => a + (/\d/.test(ch) ? 0.64 : ch === ' ' ? 0.28 : /[%€]/.test(ch) ? 0.8 : /[.,:;]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.68 : 0.56), 0);
  const cellEm = (key: string) => Math.max(...rows.map((r) => em(r.cells[key]!)));
  const headW = (key: string) => Math.ceil(columns.find((c) => c.key === key)!.label.length * headFont * 0.66);
  const valueWAt = (f: number) => valueCols.map((c) => Math.max(Math.ceil(cellEm(c.key) * f) + 16, headW(c.key)));
  const labelNeedAt = (f: number) => labelCols.map((c) => Math.max(cellEm(c.key) * f * 1.08, headW(c.key)));
  // Largest font (down to 30 px) at which every column fits on one line; fewer rows and shorter figures keep the big font.
  let font = maxFontPx;
  while (font > 30 && valueWAt(font).reduce((a, b) => a + b, 0) + labelNeedAt(font).reduce((a, b) => a + b, 0) > inner) font -= 1;
  const valueW = valueWAt(font);
  const labelSpace = inner - valueW.reduce((a, b) => a + b, 0);
  const labelNeed = labelNeedAt(font);
  const labelTotal = labelNeed.reduce((a, b) => a + b, 0) || 1;
  const labelW = labelNeed.map((w) => Math.max(90, Math.floor((w / labelTotal) * labelSpace)));
  const widthOf = (c: { key: string; kind: string }) => (c.kind === 'value' ? valueW[valueCols.findIndex((v) => v.key === c.key)]! : labelW[labelCols.findIndex((v) => v.key === c.key)]!);
  const fitFont = (c: { key: string; kind: string }) => Math.min(font, Math.floor((widthOf(c) - 8) / (cellEm(c.key) * (c.kind === 'label' ? 1.08 : 1))));
  return (
    <>
      {/* Column header */}
      <div style={{ position: 'absolute', left: D_LAYOUT.left, width, top, height: D_LAYOUT.headerH, display: 'flex', alignItems: 'center', padding: `0 ${pad}px`, opacity: headerProgress }}>
        {columns.map((c) => (
          <div key={c.key} style={{ width: widthOf(c), flex: '0 0 auto', textAlign: c.kind === 'value' ? 'right' : 'left', fontFamily: theme.fonts.body, fontWeight: 500, fontSize: headFont, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.colors.textDim, whiteSpace: 'nowrap' }}>
            {c.label}
          </div>
        ))}
      </div>
      {/* Rows: individual label boxes, revealed one by one. */}
      <div style={{ position: 'absolute', left: D_LAYOUT.left, width, top: top + D_LAYOUT.headerH + 8, display: 'flex', flexDirection: 'column', gap: D_LAYOUT.gap }}>
        {rows.map((r, i) => {
          const p = spring({ frame: frame - firstRowFrame - i * step, fps, config: theme.spring.snappy });
          const hl = !!r.highlight;
          return (
            <div
              key={i}
              style={{
                height: rowH, display: 'flex', alignItems: 'center', padding: `0 ${pad}px`, borderRadius: theme.radii.sm + 4,
                background: hl ? 'rgba(167,243,106,0.16)' : 'rgba(16,41,31,0.82)', border: `1.5px solid ${hl ? theme.colors.lime : theme.colors.hairline}`,
                opacity: p, transform: `translateX(${interpolate(p, [0, 1], [-46, 0], clamp)}px) scale(${interpolate(p, [0, 1], [0.97, 1], clamp)})`,
              }}
            >
              {columns.map((c) => {
                const text = r.cells[c.key]!;
                const neg = c.kind === 'value' && isNegative(text);
                const color = neg ? theme.colors.red : hl && c.kind === 'value' ? theme.colors.lime : theme.colors.surface;
                return (
                  <Cell
                    key={c.key}
                    text={text}
                    style={{
                      width: widthOf(c), flex: '0 0 auto', textAlign: c.kind === 'value' ? 'right' : 'left', color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontFamily: c.kind === 'value' ? theme.fonts.heading : theme.fonts.body, fontWeight: c.kind === 'value' ? 800 : 500,
                      fontSize: fitFont(c), fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
};

/** Title label (light box, dark text) with the single plain assumptions line below it. Shared by the plain-style templates. */
export const PlainTitleBlock: React.FC<{ title: string; info?: string; progress: number }> = ({ title, info, progress: tp }) => (
  <div style={{ position: 'absolute', left: D_LAYOUT.left, width: theme.reel.width - D_LAYOUT.left - D_LAYOUT.rightClear, top: D_LAYOUT.titleTop, height: D_LAYOUT.rowsTop - D_LAYOUT.titleTop - 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div
      style={{
        padding: '20px 30px', borderRadius: theme.radii.md, background: theme.colors.surface, color: theme.colors.bg,
        fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: title.length > 40 ? 48 : 56, lineHeight: 1.1, letterSpacing: '-0.025em',
        opacity: tp, transform: `translateY(${interpolate(tp, [0, 1], [-24, 0], clamp)}px) scale(${interpolate(tp, [0, 1], [0.97, 1], clamp)})`,
      }}
    >
      {title}
    </div>
    {info ? <div style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 32, lineHeight: 1.3, color: theme.colors.textDim, opacity: tp }}>{info}</div> : null}
  </div>
);

const TableScene: React.FC<{ props: TemplateDProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const n = props.rows.length;
  const tp = spring({ frame: frame - 2, fps, config: theme.spring.smooth });
  // Row reveal: spread over the first ~60% of the scene, never slower than 7 frames per row.
  const step = Math.max(2, Math.min(10, Math.floor((durationInFrames * 0.6) / n)));
  return (
    <>
      <PlainTitleBlock title={props.title} info={tableInfoLine(props)} progress={tp} />
      <TableBlock columns={props.columns} rows={props.rows} top={D_LAYOUT.rowsTop} bottom={D_LAYOUT.rowsBottom} headerProgress={tp} step={step} large={props.size === 'large'} />
    </>
  );
};

/** Template D: table / ranking Reel. Scenes: `table`, `cta`. Footer disclaimer + source stay on screen during the table. */
export const TemplateD: React.FC<TemplateDProps> = (props) => {
  const sourceLine = `${props.source.name}${props.source.url ? ` (${new URL(props.source.url).hostname.replace(/^www\./, '')})` : ''}, per ${formatDateNl(props.asOfDate)}`;
  return (
    <ReelShell
      scenes={props.timeline.scenes}
      captions={props.captions}
      footnote={props.footerLine ? { text: props.footerLine } : { text: props.disclaimer, source: sourceLine }}
      voiceSrc={props.voice.src}
      headerLabel={props.kicker}
      hideFootnoteIn={['cta']}
      background={props.background}
      showProgress={props.showProgress}
      blurSceneIds={['table']}
      renderScene={(id) => {
        if (id === 'table') return <TableScene props={props} />;
        if (id === 'cta') return <BrandedOutro cta={props.cta.text} tagline={props.cta.tagline} />;
        return null;
      }}
    />
  );
};

/** Template A in the plain 10 s style ("uitleg"): the same title / one-line assumptions / footer layout with bigger figures. */
export const TemplateAPlain: React.FC<TemplateDProps> = (props) => <TemplateD {...props} size="large" />;
