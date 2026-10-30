import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CandlestickChart, FinancialLineChart } from '../components/charts';
import { BrandedOutro, ReelShell, SceneBody } from '../components/structure';
import { HookTitle, StatHighlight } from '../components/text';
import { formatDateNl, formatEuro, formatNumber, formatPct } from '../format';
import type { TemplateAProps, TemplateBProps } from '../schemas';
import { clamp, theme } from '../theme';

const Line: React.FC<{ text: string; size?: number; dim?: boolean; delay?: number }> = ({ text, size = 44, dim, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <div
      style={{
        fontFamily: dim ? theme.fonts.body : theme.fonts.heading, fontWeight: dim ? 400 : 700, fontSize: size, lineHeight: 1.25,
        color: dim ? theme.colors.textDim : theme.colors.surface, opacity: p, transform: `translateY(${interpolate(p, [0, 1], [26, 0], clamp)}px)`,
      }}
    >
      {text}
    </div>
  );
};

const progressOverScene = (frame: number, dur: number) =>
  interpolate(frame, [6, Math.max(7, dur - 30)], [0, 1], { ...clamp, easing: theme.ease.inOut });

/** Template A — "Rendement in 30 seconden": hook → chart → stats → takeaway → CTA. */
export const TemplateA: React.FC<TemplateAProps> = (props) => {
  const fmt = props.chart.unit === 'eur' ? formatEuro : props.chart.unit === 'pct' ? formatPct : formatNumber;
  const Chart: React.FC = () => {
    const frame = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();
    return (
      <SceneBody>
        <FinancialLineChart points={props.chart.points} illustrative={props.chart.illustrative} title={props.chart.title} progress={progressOverScene(frame, durationInFrames)} formatValue={fmt} height={620} />
      </SceneBody>
    );
  };
  return (
    <ReelShell
      scenes={props.timeline.scenes}
      captions={props.captions}
      footnote={props.footnote}
      voiceSrc={props.voice.src}
      headerLabel="Rendement in 30 sec"
      hideFootnoteIn={['cta']}
      background={props.background}
      blurSceneIds={['chart']}
      renderScene={(id) => {
        if (id === 'hook')
          return (
            <SceneBody>
              <Line text={props.kicker.toUpperCase()} size={30} dim />
              <HookTitle lines={props.hookLines} highlightLine={props.hookHighlightLine} size={104} delay={4} />
            </SceneBody>
          );
        if (id === 'chart') return <Chart />;
        if (id === 'stats')
          return (
            <SceneBody>
              {props.stats.map((s, i) => (
                <StatHighlight key={i} value={s.value} label={s.label} delay={4 + i * 6} hero={i === 0} />
              ))}
            </SceneBody>
          );
        if (id === 'takeaway')
          return (
            <SceneBody>
              <Line text={props.takeaway} size={64} />
            </SceneBody>
          );
        if (id === 'cta') return <BrandedOutro cta={props.cta.text} tagline={props.cta.tagline} />;
        return null;
      }}
    />
  );
};

/** Template B — "De markt uitgelegd": requires a source + publication date (SourceFootnote). */
export const TemplateB: React.FC<TemplateBProps> = (props) => {
  const sourceLine = `${props.source.name}, gepubliceerd ${formatDateNl(props.source.publishedAt)}`;
  return (
    <ReelShell
      scenes={props.timeline.scenes}
      captions={props.captions}
      footnote={{ text: props.footnote.text, source: sourceLine }}
      voiceSrc={props.voice.src}
      headerLabel="De markt uitgelegd"
      hideFootnoteIn={['cta']}
      background={props.background}
      blurSceneIds={['chart']}
      renderScene={(id) => {
        if (id === 'hook')
          return (
            <SceneBody>
              <Line text={props.kicker.toUpperCase()} size={30} dim />
              <HookTitle lines={[props.headline]} highlightLine={-1} size={92} delay={4} />
            </SceneBody>
          );
        if (id === 'chart')
          return (
            <SceneBody>
              <CandlestickChart data={props.candles.data} illustrative={props.candles.illustrative} title={props.candles.title} delay={6} height={600} />
            </SceneBody>
          );
        if (id === 'points')
          return (
            <SceneBody>
              {props.points.map((p, i) => (
                <Line key={i} text={p} size={46} delay={4 + i * 8} />
              ))}
            </SceneBody>
          );
        if (id === 'cta') return <BrandedOutro cta={props.cta.text} tagline={props.cta.tagline} />;
        return null;
      }}
    />
  );
};
