import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, getInputProps } from 'remotion';
import { logo } from '@rj/brand';
import { clamp, theme } from '../theme';

/** Keeps key content inside the Instagram Reels safe area (top 220 / bottom 380 / sides 90). */
export const SafeAreaContainer: React.FC<{ children: React.ReactNode; showGuides?: boolean; style?: React.CSSProperties }> = ({
  children,
  showGuides = false,
  style,
}) => (
  <div
    style={{
      position: 'absolute',
      top: theme.safe.top,
      bottom: theme.safe.bottom,
      left: theme.safe.left,
      right: theme.safe.right,
      display: 'flex',
      flexDirection: 'column',
      outline: showGuides ? `2px dashed ${theme.colors.red}` : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * Brand logo. Reads the single logo config from @rj/brand (PLACEHOLDER until the official file
 * exists). The render script passes `brandLogoFile` when assets/brand/logo-official.svg is present.
 */
export const BrandLogo: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => {
  const input = getInputProps() as { brandLogoFile?: string };
  const file = input.brandLogoFile ?? logo.file;
  return (
    <Img
      src={staticFile(`brand/${file}`)}
      style={{ width: size, height: size / logo.aspectRatio, display: 'block', ...style }}
      alt={logo.alt}
    />
  );
};

/** Background mesh: two slow drifting glows over the forest base. Never a flat background. */
export const BgMesh: React.FC = () => {
  const frame = useCurrentFrame();
  const d1 = Math.sin(frame / 70) * 60;
  const d2 = Math.cos(frame / 90) * 50;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', width: 1400, height: 1400, borderRadius: '50%', top: -620, left: -520 + d1,
          background: `radial-gradient(circle, ${theme.colors.green}66, transparent 62%)`, filter: 'blur(40px)',
        }}
      />
      <div
        style={{
          position: 'absolute', width: 1200, height: 1200, borderRadius: '50%', bottom: -560, right: -480 - d2,
          background: `radial-gradient(circle, ${theme.colors.lime}1A, transparent 64%)`, filter: 'blur(60px)',
        }}
      />
      {/* fine grid for a "financial terminal" texture */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${theme.colors.hairline} 1px, transparent 1px), linear-gradient(90deg, ${theme.colors.hairline} 1px, transparent 1px)`,
          backgroundSize: '90px 90px',
          backgroundPosition: `0px ${-frame * 0.4}px`,
          opacity: 0.22,
          maskImage: 'radial-gradient(ellipse at 50% 45%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, black 20%, transparent 75%)',
        }}
      />
    </AbsoluteFill>
  );
};

export const Grade: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ backgroundColor: theme.colors.green, mixBlendMode: 'soft-light', opacity: 0.2 }} />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.28), transparent 22%, transparent 70%, rgba(0,0,0,0.42))' }} />
  </AbsoluteFill>
);

export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const noise = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none', backgroundImage: noise, backgroundSize: '220px',
        backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`, opacity: 0.06, mixBlendMode: 'overlay',
      }}
    />
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }} />
);

/** Small top bar: logo + handle, inside the safe area. */
export const BrandHeader: React.FC<{ label?: string }> = ({ label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - 2, fps, config: theme.spring.smooth });
  return (
    <div
      style={{
        position: 'absolute', top: theme.safe.top + 8, left: theme.safe.left, right: theme.safe.right,
        display: 'flex', alignItems: 'center', gap: 18, opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [-16, 0], clamp)}px)`,
      }}
    >
      <BrandLogo size={64} style={{ borderRadius: 16 }} />
      <span style={{ fontFamily: theme.fonts.heading, fontWeight: 700, fontSize: 30, color: theme.colors.surface, letterSpacing: '-0.01em' }}>
        {theme.brand.handle}
      </span>
      {label ? (
        <span
          style={{
            marginLeft: 'auto', fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 22, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: theme.colors.textDim, border: `1px solid ${theme.colors.hairline}`,
            borderRadius: theme.radii.pill, padding: '8px 18px',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
};
