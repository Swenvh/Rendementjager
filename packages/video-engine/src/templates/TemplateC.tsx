import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BarComparison, FinancialLineChart, SavingsGrowthChart } from '../components/charts';
import { BrandedOutro, ReelShell, SceneBody } from '../components/structure';
import { AnimatedCounter, HookTitle, RiskDisclaimer, StatHighlight } from '../components/text';
import { formatEuro, formatEuroCents, formatPct } from '../format';
import type { TemplateCProps } from '../schemas';
import { clamp, theme } from '../theme';

const Kicker: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [-30, 0], clamp)}px)` }}>
      <span style={{ width: 56 * p, height: 5, borderRadius: 3, background: theme.colors.surface, opacity: 0.8 }} />
      <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 30, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.colors.textDim }}>
        {text}
      </span>
    </div>
  );
};

const SceneTitle: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <div
      style={{
        fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: theme.size.h2, lineHeight: 1.08, letterSpacing: '-0.03em',
        color: theme.colors.surface, opacity: p, transform: `translateY(${interpolate(p, [0, 1], [30, 0], clamp)}px)`,
      }}
    >
      {text}
    </div>
  );
};

const HookScene: React.FC<{ props: TemplateCProps }> = ({ props }) => (
  <SceneBody>
    <Kicker text={props.kicker} />
    <HookTitle lines={props.hookLines} highlightLine={props.hookHighlightLine} size={108} delay={4} />
  </SceneBody>
);

const AssumptionsScene: React.FC<{ props: TemplateCProps }> = ({ props }) => {
  const c = props.calculation;
  return (
    <SceneBody>
      <SceneTitle text="De aannames" />
      <StatHighlight value={formatEuroCents(c.monthlyContributionCents)} label="Inleg per maand" note={c.contributionTiming === 'end-of-month' ? 'aan het eind van elke maand' : 'aan het begin van elke maand'} delay={6} />
      <StatHighlight value={`${c.years} jaar`} label="Looptijd" note={`${c.years * 12} maandelijkse inleggen`} delay={12} />
      <StatHighlight value={formatPct(c.annualReturnPct)} label="Effectief rendement per jaar" note="hypothetisch, geen garantie" delay={18} hero />
      <div style={{ fontFamily: theme.fonts.body, fontWeight: 400, fontSize: 27, lineHeight: 1.4, color: theme.colors.textDim, marginTop: 6 }}>
        {props.assumptionsFootnote}
      </div>
    </SceneBody>
  );
};

const GrowthScene: React.FC<{ props: TemplateCProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const c = props.calculation;
  // Draw over most of the scene, then hold still (contrast reads premium).
  const progress = interpolate(frame, [8, Math.max(9, durationInFrames - 34)], [0, 1], { ...clamp, easing: theme.ease.inOut });
  // Whole months only: every displayed value is an engine value, never an interpolation.
  const last = c.monthly.length - 1;
  const m = Math.min(last, Math.floor(progress * last));
  const cur = c.monthly[m]!.valueCents;
  const yrs = Math.floor(m / 12);
  const mo = m % 12;
  const label = mo === 0 ? `${yrs} jaar` : `${yrs} jaar en ${mo} ${mo === 1 ? 'maand' : 'maanden'}`;
  return (
    <SceneBody justify="flex-start">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
        <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 32, color: theme.colors.textDim }}>
          Waarde na <span style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</span>
        </span>
        <AnimatedCounter
          to={cur}
          progress={1}
          format={(v) => formatEuroCents(v)}
          style={{ fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: 124, letterSpacing: '-0.04em', color: theme.colors.surface, lineHeight: 1 }}
        />
      </div>
      <SavingsGrowthChart
        series={c.monthly.map((s) => ({ year: s.month / 12, contributed: s.contributedCents / 100, value: s.valueCents / 100 }))}
        progress={m / last}
        width={900}
        height={560}
        formatAxis={(v) => formatEuro(v)}
        labels={{ value: 'Waarde (hypothetisch)', contributed: 'Eigen inleg' }}
      />
    </SceneBody>
  );
};

const ResultScene: React.FC<{ props: TemplateCProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = props.calculation;
  // The inflation note lands in the second half of the scene, together with its voice line.
  const noteDelay = Math.round(durationInFrames * 0.48);
  const np = spring({ frame: frame - noteDelay, fps, config: theme.spring.smooth });
  return (
    <SceneBody justify="flex-start">
      <SceneTitle text={`Na ${c.years} jaar`} />
      <BarComparison
        height={560}
        delay={6}
        format={(v) => formatEuro(v)}
        items={[
          { label: 'Eigen inleg', value: c.totalContributedCents / 100, tone: 'green' },
          { label: 'Eindwaarde (nominaal)', value: c.finalValueCents / 100, tone: 'lime', sublabel: `waarvan ${formatEuroCents(c.growthCents)} rendement` },
        ]}
      />
      {c.inflation ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 22, padding: '24px 30px', borderRadius: theme.radii.md,
            border: `1.5px solid ${theme.colors.hairline}`, background: 'rgba(248,250,249,0.05)',
            opacity: np, transform: `translateY(${interpolate(np, [0, 1], [30, 0], clamp)}px)`,
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 26, color: theme.colors.textDim }}>Zelfde eindbedrag in geld van nu</span>
            <span style={{ fontFamily: theme.fonts.body, fontWeight: 400, fontSize: 25, color: theme.colors.textFaint }}>bij {formatPct(c.inflation.annualRatePct)} inflatie per jaar (aanname)</span>
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: 46, color: theme.colors.surface, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {formatEuroCents(c.inflation.realFinalValueCents)}
          </span>
        </div>
      ) : null}
    </SceneBody>
  );
};

/** Deterministic, clearly labelled illustrative path: shows that returns fluctuate. Not data. */
const ILLUSTRATIVE_PATH = [100, 108, 103, 115, 109, 96, 104, 118, 112, 125, 119, 131, 122, 138, 145, 136, 150].map((value, i) => ({ label: String(i), value }));

const RisksScene: React.FC<{ props: TemplateCProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [20, Math.max(21, durationInFrames - 20)], [0, 1], { ...clamp, easing: theme.ease.inOut });
  return (
    <SceneBody justify="flex-start">
      <RiskDisclaimer title={props.risks.title} items={props.risks.items} delay={2} />
      <div style={{ marginTop: 6 }}>
        <FinancialLineChart points={ILLUSTRATIVE_PATH} progress={progress} illustrative title="Koersen schommelen" showAxis={false} tone="surface" height={210} />
      </div>
    </SceneBody>
  );
};

export const TemplateC: React.FC<TemplateCProps> = (props) => (
  <ReelShell
    scenes={props.timeline.scenes}
    captions={props.captions}
    footnote={props.footnote}
    voiceSrc={props.voice.src}
    headerLabel="Geld in cijfers"
    hideFootnoteIn={['cta']}
    renderScene={(id) => {
      switch (id) {
        case 'hook':
          return <HookScene props={props} />;
        case 'assumptions':
          return <AssumptionsScene props={props} />;
        case 'growth':
          return <GrowthScene props={props} />;
        case 'result':
          return <ResultScene props={props} />;
        case 'risks':
          return <RisksScene props={props} />;
        case 'cta':
          return <BrandedOutro cta={props.cta.text} tagline={props.cta.tagline} />;
        default:
          return null;
      }
    }}
  />
);
