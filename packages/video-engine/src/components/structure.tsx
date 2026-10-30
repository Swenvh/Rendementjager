import React from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp, theme } from '../theme';
import { msToFrame } from '../schemas';
import { BgMesh, BrandHeader, BrandLogo, DroneBackground, Grade, Grain, Vignette } from './layout';
import type { BackgroundProps } from '../schemas';
import { CaptionOverlay, SourceFootnote } from './text';

/** Segmented progress bar: one segment per scene. */
export const ProgressIndicator: React.FC<{ scenes: { startMs: number; endMs: number }[] }> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  return (
    <div style={{ position: 'absolute', top: theme.safe.top + 100, left: theme.safe.left, right: theme.safe.right, display: 'flex', gap: 10 }}>
      {scenes.map((s, i) => {
        const fill = interpolate(ms, [s.startMs, s.endMs], [0, 1], clamp);
        return (
          <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: theme.colors.hairline, overflow: 'hidden' }}>
            <div style={{ width: `${fill * 100}%`, height: '100%', background: theme.colors.surface, opacity: 0.85 }} />
          </div>
        );
      })}
    </div>
  );
};

/** Scene wrapper: entrance (rise + scale + blur) and a faster exit. */
export const SceneTransition: React.FC<{ children: React.ReactNode; exit?: boolean }> = ({ children, exit = true }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: theme.spring.smooth });
  const exitP = exit ? interpolate(frame, [durationInFrames - 10, durationInFrames - 1], [0, 1], { ...clamp, easing: theme.ease.in }) : 0;
  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(enter * 1.4, 1) * (1 - exitP),
        transform: `translateY(${interpolate(enter, [0, 1], [40, 0], clamp) - exitP * 50}px) scale(${interpolate(enter, [0, 1], [0.97, 1], clamp) + exitP * 0.03})`,
        filter: `blur(${(1 - Math.min(enter * 1.2, 1)) * 8 + exitP * 10}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Content area between header/progress and captions, inside the safe area. */
export const SceneBody: React.FC<{ children: React.ReactNode; justify?: React.CSSProperties['justifyContent'] }> = ({ children, justify = 'center' }) => (
  <div
    style={{
      position: 'absolute', top: theme.safe.top + 150, bottom: theme.safe.bottom + 250, left: theme.safe.left, right: theme.safe.right,
      display: 'flex', flexDirection: 'column', justifyContent: justify, gap: 28,
    }}
  >
    {children}
  </div>
);

export const AudioTrack: React.FC<{ src: string | null; volume?: number }> = ({ src, volume = 1 }) =>
  src ? <Audio src={staticFile(src)} volume={volume} /> : null;

/** Logo, CTA and brand promise. */
export const BrandedOutro: React.FC<{ cta: string; tagline: string }> = ({ cta, tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lp = spring({ frame, fps, config: theme.spring.bouncy });
  const tp = spring({ frame: frame - 10, fps, config: theme.spring.smooth });
  const gp = spring({ frame: frame - 22, fps, config: theme.spring.smooth });
  const breathe = 1 + Math.sin(frame / 20) * 0.012;
  const [lead, ...rest] = cta.split(' @');
  const handle = rest.length ? `@${rest.join(' @')}` : '';
  const [handleWord, ...after] = handle.split(' ');
  return (
    <SceneBody>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 44, textAlign: 'center' }}>
        <div style={{ transform: `scale(${interpolate(lp, [0, 1], [0.6, 1], clamp) * breathe}) rotate(${interpolate(lp, [0, 1], [-8, 0], clamp)}deg)`, opacity: lp, filter: `drop-shadow(0 0 60px ${theme.colors.limeGlow})` }}>
          <BrandLogo size={280} style={{ borderRadius: 64 }} />
        </div>
        <div style={{ opacity: tp, transform: `translateY(${interpolate(tp, [0, 1], [30, 0], clamp)}px)` }}>
          <div style={{ fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: 70, lineHeight: 1.1, letterSpacing: '-0.03em', color: theme.colors.surface }}>
            {lead}
          </div>
          {handleWord ? (
            <div style={{ fontFamily: theme.fonts.heading, fontWeight: 800, fontSize: 80, lineHeight: 1.1, letterSpacing: '-0.03em', color: theme.colors.lime, textShadow: `0 0 50px ${theme.colors.limeGlow}` }}>
              {handleWord}
            </div>
          ) : null}
          {after.length ? (
            <div style={{ fontFamily: theme.fonts.heading, fontWeight: 700, fontSize: 56, lineHeight: 1.2, color: theme.colors.surface }}>{after.join(' ')}</div>
          ) : null}
        </div>
        <div style={{ opacity: gp, transform: `translateY(${interpolate(gp, [0, 1], [20, 0], clamp)}px)`, fontFamily: theme.fonts.body, fontWeight: 500, fontSize: 32, color: theme.colors.textDim }}>
          {tagline}
        </div>
      </div>
    </SceneBody>
  );
};

/**
 * Five-layer reel shell: mesh → scenes → header/progress/captions/footnote → grade → grain + vignette.
 * `renderScene` receives each scene id; scenes are placed on the timeline from props (voice timings).
 */
export const ReelShell: React.FC<{
  scenes: { id: string; startMs: number; endMs: number }[];
  renderScene: (id: string) => React.ReactNode;
  captions: React.ComponentProps<typeof CaptionOverlay>['pages'];
  footnote: { text: string; source?: string };
  voiceSrc: string | null;
  headerLabel?: string;
  hideFootnoteIn?: string[];
  /** Licensed drone footage; null/undefined = animated dark-green fallback. */
  background?: BackgroundProps | null;
  /** Scene ids with chart cards: the footage is blurred and darkened a bit behind them. */
  blurSceneIds?: string[];
  /** Segmented progress bar at the top. OFF by default: viewers scroll away when they see it run out. */
  showProgress?: boolean;
}> = ({ scenes, renderScene, captions, footnote, voiceSrc, headerLabel, hideFootnoteIn = [], background, blurSceneIds = [], showProgress = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const current = scenes.find((s) => ms >= s.startMs && ms < s.endMs)?.id;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      <BgMesh />
      {background ? <DroneBackground background={background} blurWindows={scenes.filter((x) => blurSceneIds.includes(x.id)).map((x) => ({ fromMs: x.startMs, toMs: x.endMs }))} /> : null}
      {scenes.map((s, i) => {
        const from = msToFrame(s.startMs, fps);
        const dur = Math.max(1, msToFrame(s.endMs, fps) - from);
        return (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={s.id} layout="none">
            <SceneTransition exit={i < scenes.length - 1}>{renderScene(s.id)}</SceneTransition>
          </Sequence>
        );
      })}
      <BrandHeader label={headerLabel} />
      {showProgress ? <ProgressIndicator scenes={scenes} /> : null}
      <CaptionOverlay pages={captions} />
      {current && hideFootnoteIn.includes(current) ? null : <SourceFootnote text={footnote.text} source={footnote.source} />}
      <Grade />
      <Grain />
      <Vignette />
      <AudioTrack src={voiceSrc} />
    </AbsoluteFill>
  );
};
