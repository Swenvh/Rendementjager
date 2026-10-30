import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PLAIN_LEGEND_LINE_H, PlainLineChart, plainLegendLines } from '../components/charts';
import { BrandedOutro, ReelShell } from '../components/structure';
import { formatEuro } from '../format';
import type { TemplateCPlainProps } from '../schemas';
import { clamp, theme } from '../theme';
import { D_LAYOUT, PlainTitleBlock, TableBlock } from './TemplateD';

/** Layout (1080x1920): title block 350..592, chart from 604, legend under it, summary table down to y 1405 (footer below). */
export const CPLAIN_LAYOUT = { chartTop: 616, chartH: 368, tableBottom: D_LAYOUT.rowsBottom } as const;

const ChartScene: React.FC<{ props: TemplateCPlainProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const tp = spring({ frame: frame - 2, fps, config: theme.spring.smooth });
  const width = theme.reel.width - D_LAYOUT.left - D_LAYOUT.rightClear;
  // The lines draw over the first ~55% of the scene, then everything holds still.
  const progress = interpolate(frame, [10, Math.round(durationInFrames * 0.55)], [0, 1], { ...clamp, easing: theme.ease.inOut });
  const legendH = plainLegendLines(props.chart.series.map((s) => s.label), width) * PLAIN_LEGEND_LINE_H;
  const tableTop = CPLAIN_LAYOUT.chartTop + CPLAIN_LAYOUT.chartH + 6 + legendH + 14;
  const n = props.rows.length;
  const firstRow = Math.round(durationInFrames * 0.42);
  const step = Math.max(3, Math.min(10, Math.floor((durationInFrames * 0.3) / n)));
  return (
    <>
      <PlainTitleBlock title={props.title} info={props.subtitle} progress={tp} />
      <div style={{ position: 'absolute', left: D_LAYOUT.left, top: CPLAIN_LAYOUT.chartTop, width, opacity: tp }}>
        <PlainLineChart series={props.chart.series} progress={progress} width={width} height={CPLAIN_LAYOUT.chartH} formatY={(v) => formatEuro(v)} xSuffix={props.chart.xLabel.toLowerCase()} />
      </div>
      <TableBlock columns={props.columns} rows={props.rows} top={tableTop} bottom={CPLAIN_LAYOUT.tableBottom} headerProgress={interpolate(frame, [firstRow - 8, firstRow + 4], [0, 1], clamp)} firstRowFrame={firstRow} step={step} />
    </>
  );
};

/** Template C, plain 10 s style: chart + summary table, one-line footer, tips CTA, header only. */
export const TemplateCPlain: React.FC<TemplateCPlainProps> = (props) => (
  <ReelShell
    scenes={props.timeline.scenes}
    captions={props.captions}
    footnote={{ text: props.footerLine }}
    voiceSrc={props.voice.src}
    headerLabel={props.kicker}
    hideFootnoteIn={['cta']}
    background={props.background}
    showProgress={props.showProgress}
    blurSceneIds={['table']}
    renderScene={(id) => {
      if (id === 'table') return <ChartScene props={props} />;
      if (id === 'cta') return <BrandedOutro cta={props.cta.text} tagline={props.cta.tagline} />;
      return null;
    }}
  />
);
