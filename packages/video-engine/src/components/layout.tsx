import React from 'react';
import { AbsoluteFill, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, getInputProps } from 'remotion';
import type { BackgroundProps } from '../schemas';
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

/**
 * Licensed drone footage behind the Reel. A chain of DIFFERENT clips, cross-faded (clips are never looped or
 * time-stretched). Each clip drifts slowly (scale + pan). On top: brand-green grade (#0B1F17), top/bottom
 * gradient and vignette so text stays legible. Optional extra blur/darkening behind chart cards.
 * Without a background the caller renders the animated BgMesh instead (graceful fallback).
 */
export const DroneBackground: React.FC<{ background: BackgroundProps; blurWindows?: { fromMs: number; toMs: number }[]; blurPx?: number }> = ({
  background, blurWindows = [], blurPx = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const fade = Math.round((background.fadeMs / 1000) * fps);
  const ms = (frame / fps) * 1000;
  // Layout: clip k starts when clip k-1 has `fade` frames left.
  let t = 0;
  const placed = background.clips.map((c) => {
    const len = Math.round(c.durationS * fps);
    const from = t;
    t += Math.max(1, len - fade);
    return { c, from, len };
  });
  // Smooth 0..1 blur amount: eases in/out over 12 frames at window edges.
  const blurAmt = blurWindows.reduce((m, w) => {
    const inP = interpolate(ms, [w.fromMs, w.fromMs + 400, w.toMs - 300, w.toMs], [0, 1, 1, 0], clamp);
    return Math.max(m, inP);
  }, 0);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ filter: blurAmt > 0.01 ? `blur(${(blurAmt * blurPx).toFixed(2)}px)` : undefined }}>
        {placed.map(({ c, from, len }, i) => {
          const last = i === placed.length - 1;
          const dur = Math.min(len, durationInFrames - from);
          if (dur <= 0) return null;
          return (
            <Sequence key={`${c.clipId}-${i}`} from={from} durationInFrames={dur} layout="none">
              <ClipLayer src={c.src} focusX={c.focusX ?? 50} len={len} fade={fade} first={i === 0} fadeOut={last && from + len < durationInFrames} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
      {/* Grade: brand-green wash, then legibility gradients and vignette. */}
      <AbsoluteFill style={{ backgroundColor: theme.colors.bg, opacity: 0.52 + blurAmt * 0.12 }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${theme.colors.bg}E6 0%, ${theme.colors.bg}80 24%, ${theme.colors.bg}33 48%, ${theme.colors.bg}80 70%, ${theme.colors.bg}F2 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 46%, transparent 38%, ${theme.colors.bg}CC 100%)` }} />
    </AbsoluteFill>
  );
};

const ClipLayer: React.FC<{ src: string; focusX: number; len: number; fade: number; first: boolean; fadeOut: boolean }> = ({ src, focusX, len, fade, first, fadeOut }) => {
  const frame = useCurrentFrame();
  const p = frame / Math.max(1, len - 1);
  // Slow drone drift: push-in with a small lateral pan. Never faster than ~8% scale over a 10 s clip.
  const scale = 1.04 + p * 0.07;
  const pan = (p - 0.5) * -26;
  const inOp = first ? 1 : interpolate(frame, [0, fade], [0, 1], { ...clamp, easing: theme.ease.soft });
  const outOp = fadeOut ? interpolate(frame, [len - fade, len], [1, 0], clamp) : 1;
  return (
    <AbsoluteFill style={{ opacity: inOp * outOp }}>
      <OffthreadVideo
        src={staticFile(src)}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focusX}% 50%`, transform: `scale(${scale}) translateX(${pan}px)` }}
      />
    </AbsoluteFill>
  );
};
