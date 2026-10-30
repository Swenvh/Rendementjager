import React from 'react';
import { AbsoluteFill } from 'remotion';
import { SavingsGrowthChart } from '../components/charts';
import { BgMesh, BrandLogo, Grade, Grain, Vignette } from '../components/layout';
import { formatEuro, formatEuroCents, formatPct } from '../format';
import type { TemplateCProps } from '../schemas';
import { theme } from '../theme';

/**
 * Static cover for Template C. All key content sits in the central 1080x1350 band
 * (y 285..1635) so the Instagram 4:5 grid crop keeps it.
 */
export const CoverC: React.FC<TemplateCProps> = (props) => {
  const c = props.calculation;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      <BgMesh />
      <div style={{ position: 'absolute', top: 330, left: 90, right: 90, bottom: 330, display: 'flex', flexDirection: 'column', gap: 34 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <BrandLogo size={72} style={{ borderRadius: 18 }} />
          <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 30, letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.colors.textDim }}>
            {props.kicker}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {props.hookLines.map((l, i) => (
            <span
              key={i}
              style={{
                fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: 104, lineHeight: 1.04, letterSpacing: '-0.035em',
                color: i === props.hookHighlightLine ? theme.colors.lime : theme.colors.surface,
                textShadow: i === props.hookHighlightLine ? `0 0 48px ${theme.colors.limeGlow}` : undefined,
              }}
            >
              {l}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 'auto' }}>
          <SavingsGrowthChart
            series={c.series.map((s) => ({ year: s.year, contributed: s.contributedCents / 100, value: s.valueCents / 100 }))}
            progress={1}
            width={900}
            height={380}
            formatAxis={(v) => formatEuro(v)}
            labels={{ value: `${formatEuroCents(c.finalValueCents)} (hypothetisch)`, contributed: `${formatEuroCents(c.totalContributedCents)} inleg` }}
          />
        </div>
        <span style={{ fontFamily: theme.fonts.body, fontWeight: 400, fontSize: 24, color: theme.colors.textFaint }}>
          Rekenvoorbeeld met {formatPct(c.annualReturnPct)} effectief per jaar · geen garantie · geen advies
        </span>
      </div>
      <Grade />
      <Grain />
      <Vignette />
    </AbsoluteFill>
  );
};
