import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp, theme } from '../theme';
import { msToFrame } from '../schemas';

/** Staggered word reveal; the highlight line gets the lime hero colour. */
export const HookTitle: React.FC<{
  lines: string[];
  highlightLine?: number;
  size?: number;
  delay?: number;
  align?: 'left' | 'center';
}> = ({ lines, highlightLine = -1, size = theme.size.hero, delay = 0, align = 'left' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let wordIndex = 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      {lines.map((line, li) => {
        const hl = li === highlightLine;
        return (
          <div key={li} style={{ display: 'flex', flexWrap: 'wrap', columnGap: size * 0.26, justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
            {line.split(' ').map((word, wi) => {
              const i = wordIndex++;
              const p = spring({ frame: frame - delay - i * 3, fps, config: theme.spring.snappy });
              return (
                <span
                  key={wi}
                  style={{
                    display: 'inline-block',
                    fontFamily: theme.fonts.heading,
                    fontWeight: 800,
                    fontSize: size,
                    lineHeight: 1.04,
                    letterSpacing: '-0.035em',
                    color: hl ? theme.colors.lime : theme.colors.surface,
                    textShadow: hl ? `0 0 48px ${theme.colors.limeGlow}` : undefined,
                    opacity: p,
                    transform: `translateY(${interpolate(p, [0, 1], [46, 0], clamp)}px) scale(${interpolate(p, [0, 1], [0.92, 1], clamp)})`,
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/** Animated number with tabular figures. `progress` (0..1) overrides the internal spring. */
export const AnimatedCounter: React.FC<{
  from?: number;
  to: number;
  format: (n: number) => string;
  delay?: number;
  progress?: number;
  style?: React.CSSProperties;
}> = ({ from = 0, to, format, delay = 0, progress, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = progress ?? spring({ frame: frame - delay, fps, config: theme.spring.counter });
  const value = from + (to - from) * p;
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{format(value)}</span>;
};

/** Card with a big value and a label; used for assumptions and key stats. */
export const StatHighlight: React.FC<{
  value: string;
  label: string;
  note?: string;
  delay?: number;
  hero?: boolean;
}> = ({ value, label, note, delay = 0, hero = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  const breathe = Math.sin((frame - delay) / 26) * 2;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
        padding: '34px 40px', borderRadius: theme.radii.lg,
        background: hero ? 'rgba(167, 243, 106, 0.08)' : 'rgba(248, 250, 249, 0.045)',
        border: `1.5px solid ${hero ? 'rgba(167, 243, 106, 0.45)' : theme.colors.hairline}`,
        boxShadow: '0 30px 60px -30px rgba(0,0,0,0.6)',
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [50, 0], clamp) + breathe * (p > 0.99 ? 1 : 0)}px) scale(${interpolate(p, [0, 1], [0.95, 1], clamp)})`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 30, color: theme.colors.textDim }}>{label}</span>
        {note ? <span style={{ fontFamily: theme.fonts.body, fontWeight: 400, fontSize: 24, color: theme.colors.textFaint }}>{note}</span> : null}
      </div>
      <span
        style={{
          fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: 76, letterSpacing: '-0.03em',
          color: hero ? theme.colors.lime : theme.colors.surface, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
};

/** Small "Illustratief" pill: every illustrative (non-data) visual must carry it. */
export const IllustrativeBadge: React.FC<{ text?: string }> = ({ text = 'Illustratief' }) => (
  <span
    style={{
      fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 22, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: theme.colors.surface, background: 'rgba(248,250,249,0.1)', border: `1px solid ${theme.colors.hairline}`,
      borderRadius: theme.radii.pill, padding: '6px 16px', whiteSpace: 'nowrap',
    }}
  >
    {text}
  </span>
);

/** Small source / assumption line at the bottom of the safe area. */
export const SourceFootnote: React.FC<{ text: string; source?: string }> = ({ text, source }) => (
  <div
    style={{
      position: 'absolute', left: theme.safe.left, right: theme.safe.right, bottom: theme.safe.bottom + 6,
      fontFamily: theme.fonts.body, fontWeight: 400, fontSize: 25, lineHeight: 1.35, color: theme.colors.textDim,
      textAlign: 'center',
    }}
  >
    {text}
    {source ? <span style={{ display: 'block' }}>Bron: {source}</span> : null}
  </div>
);

/** Risk list with red markers. Appears whenever returns are discussed. */
export const RiskDisclaimer: React.FC<{ title: string; items: string[]; delay?: number }> = ({ title, items, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tp = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div
        style={{
          fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: theme.size.h1, letterSpacing: '-0.03em', color: theme.colors.surface,
          opacity: tp, transform: `translateY(${interpolate(tp, [0, 1], [30, 0], clamp)}px)`,
        }}
      >
        {title}
      </div>
      {items.map((item, i) => {
        const p = spring({ frame: frame - delay - 8 - i * 6, fps, config: theme.spring.smooth });
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 24, padding: '26px 30px', borderRadius: theme.radii.md,
              background: 'rgba(239, 68, 68, 0.07)', border: '1.5px solid rgba(239, 68, 68, 0.28)',
              opacity: p, transform: `translateX(${interpolate(p, [0, 1], [-40, 0], clamp)}px)`,
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: 4, background: theme.colors.red, flexShrink: 0, transform: 'rotate(45deg)' }} />
            <span style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 36, lineHeight: 1.25, color: theme.colors.surface }}>{item}</span>
          </div>
        );
      })}
    </div>
  );
};

/** Word-timed captions from real (measured) segment timings. Active word bright, rest dim. */
export const CaptionOverlay: React.FC<{
  pages: { text: string; startMs: number; endMs: number; words: { text: string; startMs: number; endMs: number }[] }[];
  bottom?: number;
}> = ({ pages, bottom = theme.safe.bottom + 92 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const page = pages.find((p) => ms >= p.startMs - 60 && ms < p.endMs + 140);
  if (!page) return null;
  const local = frame - msToFrame(page.startMs - 60, fps);
  const p = spring({ frame: local, fps, config: theme.spring.snappy });
  return (
    <div style={{ position: 'absolute', left: theme.safe.left, right: theme.safe.right, bottom, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 4, maxWidth: 860,
          padding: '14px 28px', borderRadius: theme.radii.md, background: 'rgba(0, 0, 0, 0.42)',
          opacity: p, transform: `translateY(${interpolate(p, [0, 1], [18, 0], clamp)}px) scale(${interpolate(p, [0, 1], [0.96, 1], clamp)})`,
        }}
      >
        {page.words.map((w, i) => {
          const active = ms >= w.startMs - 40;
          return (
            <span
              key={i}
              style={{
                fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: theme.size.caption, lineHeight: 1.15,
                letterSpacing: '-0.01em', color: theme.colors.surface, opacity: active ? 1 : 0.45,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
