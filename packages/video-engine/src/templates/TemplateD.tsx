import React from 'react';
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
export function rowMetrics(n: number) {
  const avail = D_LAYOUT.rowsBottom - D_LAYOUT.rowsTop - D_LAYOUT.headerH - 8;
  const rowH = Math.min(D_LAYOUT.maxRowH, Math.floor((avail - D_LAYOUT.gap * (n - 1)) / n));
  const font = Math.max(D_LAYOUT.minFont, Math.min(D_LAYOUT.maxFont, Math.round(rowH * 0.48)));
  return { rowH, font };
}

/** Line under the title: subtitle and stated assumptions (calculated) or period (provided). */
export const tableInfoLine = (p: Pick<TemplateDProps, 'subtitle' | 'assumptions'>) => [p.subtitle, ...p.assumptions].filter(Boolean).join(' · ');

const isNegative = (s: string) => /^[−-]/.test(s.trim());

const TableScene: React.FC<{ props: TemplateDProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const n = props.rows.length;
  const info = tableInfoLine(props);
  const { rowH, font } = rowMetrics(n);
  const width = theme.reel.width - D_LAYOUT.left - D_LAYOUT.rightClear;
  const tp = spring({ frame: frame - 2, fps, config: theme.spring.smooth });
  // Row reveal: spread over the first ~60% of the scene, never slower than 7 frames per row.
  const step = Math.max(2, Math.min(7, Math.floor((durationInFrames * 0.6) / n)));
  const labelCols = props.columns.filter((c) => c.kind === 'label');
  const valueCols = props.columns.filter((c) => c.kind === 'value');
  // Column widths: value columns share the space; label columns take what they need.
  const longest = (key: string) => Math.max(...props.rows.map((r) => r.cells[key]!.length), props.columns.find((c) => c.key === key)!.label.length);
  const charW = 0.6;
  const pad = 20;
  const inner = width - pad * 2;
  const valueW = valueCols.map((c) => Math.ceil(longest(c.key) * font * charW) + 16);
  const labelNeed = labelCols.map((c) => Math.ceil(longest(c.key) * font * 0.56));
  const labelSpace = inner - valueW.reduce((a, b) => a + b, 0);
  const labelTotal = labelNeed.reduce((a, b) => a + b, 0) || 1;
  const labelW = labelNeed.map((w) => Math.max(90, Math.floor((w / labelTotal) * labelSpace)));
  const widthOf = (c: { key: string; kind: string }) => (c.kind === 'value' ? valueW[valueCols.findIndex((v) => v.key === c.key)]! : labelW[labelCols.findIndex((v) => v.key === c.key)]!);
  const fitFont = (c: { key: string; kind: string }) => Math.min(font, Math.floor((widthOf(c) - 8) / (longest(c.key) * charW)));
  return (
    <>
      {/* Title block: light label, dark Manrope ExtraBold; assumptions / period line below it (max 2 lines). */}
      <div style={{ position: 'absolute', left: D_LAYOUT.left, width, top: D_LAYOUT.titleTop, height: D_LAYOUT.rowsTop - D_LAYOUT.titleTop - 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            padding: '20px 30px', borderRadius: theme.radii.md, background: theme.colors.surface, color: theme.colors.bg,
            fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: props.title.length > 40 ? 44 : 52, lineHeight: 1.1, letterSpacing: '-0.025em',
            opacity: tp, transform: `translateY(${interpolate(tp, [0, 1], [-24, 0], clamp)}px) scale(${interpolate(tp, [0, 1], [0.97, 1], clamp)})`,
          }}
        >
          {props.title}
        </div>
        {info ? <div style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 26, lineHeight: 1.3, color: theme.colors.textDim, opacity: tp }}>{info}</div> : null}
      </div>
      {/* Column header */}
      <div style={{ position: 'absolute', left: D_LAYOUT.left, width, top: D_LAYOUT.rowsTop, height: D_LAYOUT.headerH, display: 'flex', alignItems: 'center', padding: `0 ${pad}px`, opacity: tp }}>
        {props.columns.map((c) => (
          <div key={c.key} style={{ width: widthOf(c), flex: '0 0 auto', textAlign: c.kind === 'value' ? 'right' : 'left', fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 28, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.colors.textDim, whiteSpace: 'nowrap' }}>
            {c.label}
          </div>
        ))}
      </div>
      {/* Rows: individual label boxes, revealed one by one. */}
      <div style={{ position: 'absolute', left: D_LAYOUT.left, width, top: D_LAYOUT.rowsTop + D_LAYOUT.headerH + 8, display: 'flex', flexDirection: 'column', gap: D_LAYOUT.gap }}>
        {props.rows.map((r, i) => {
          const p = spring({ frame: frame - 12 - i * step, fps, config: theme.spring.snappy });
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
              {props.columns.map((c) => {
                const text = r.cells[c.key]!;
                const neg = c.kind === 'value' && isNegative(text);
                const color = neg ? theme.colors.red : hl && c.kind === 'value' ? theme.colors.lime : c.kind === 'value' ? theme.colors.surface : theme.colors.surface;
                return (
                  <div
                    key={c.key}
                    style={{
                      width: widthOf(c), flex: '0 0 auto', textAlign: c.kind === 'value' ? 'right' : 'left', color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontFamily: c.kind === 'value' ? theme.fonts.heading : theme.fonts.body, fontWeight: c.kind === 'value' ? 800 : 500,
                      fontSize: fitFont(c), fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
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
      footnote={{ text: props.disclaimer, source: sourceLine }}
      voiceSrc={props.voice.src}
      headerLabel={props.kicker}
      hideFootnoteIn={['cta']}
      background={props.background}
      blurSceneIds={['table']}
      renderScene={(id) => {
        if (id === 'table') return <TableScene props={props} />;
        if (id === 'cta') return <BrandedOutro cta={props.cta.text} tagline={props.cta.tagline} />;
        return null;
      }}
    />
  );
};
