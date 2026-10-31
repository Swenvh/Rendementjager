import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, cancelRender, continueRender, delayRender } from 'remotion';
import { BgMesh, BrandLogo, DroneBackground, Grade, Grain, Vignette } from '../components/layout';
import { fontsLoaded } from '../fonts';
import { STORY, spanAllowed } from '../stories/layout';
import type { StoryFrameProps } from '../stories/schema';
import { theme } from '../theme';

type Role = keyof typeof STORY.minFont;

/**
 * Shrinks the text to the largest size (down to `min`) at which it fits its box; FAILS THE RENDER when even the smallest size
 * does not fit (text would be cut off or overlap), like Template D does for table cells. Text is never ellipsized.
 */
const Fit: React.FC<{ role: Role; max: number; min?: number; maxHeight?: number; nowrap?: boolean; style?: React.CSSProperties; children: React.ReactNode }> = ({
  role, max, min, maxHeight, nowrap = false, style, children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const floor = Math.max(min ?? STORY.minFont[role], STORY.minFont[role]);
  useEffect(() => {
    const run = () => {
      const el = ref.current;
      // Not laid out (e.g. the composition is only being selected, not rendered): nothing to measure.
      if (!el || el.clientWidth === 0) return;
      let f = max;
      el.style.fontSize = `${f}px`;
      const over = () => el.scrollWidth > el.clientWidth + 1 || (maxHeight !== undefined && el.getBoundingClientRect().height > maxHeight + 1);
      while (over() && f > floor) {
        f -= 2;
        el.style.fontSize = `${f}px`;
      }
      if (over()) cancelRender(new Error(`Story text does not fit at ${f}px (minimum ${floor}px; box ${el.clientWidth}x${Math.round(el.getBoundingClientRect().height)}, scrollWidth ${el.scrollWidth}, maxHeight ${maxHeight}): "${el.textContent}". Shorten the text.`));
    };
    run();
    // Measure again with the real fonts (the first pass may have used the fallback font).
    fontsLoaded.then(run, cancelRender);
  }, []);
  return (
    <div ref={ref} data-story-text={role} style={{ fontSize: max, whiteSpace: nowrap ? 'nowrap' : 'normal', overflowWrap: 'normal', ...style }}>
      {children}
    </div>
  );
};

const tone = (t: 'lime' | 'surface' | 'red') => (t === 'lime' ? theme.colors.lime : t === 'red' ? theme.colors.red : theme.colors.surface);

/** After layout: every text element is inside the Story safe zones, outside the sticker band, inside the side margins and at least the minimum size. */
function guard(root: HTMLElement) {
  const problems: string[] = [];
  if (root.clientWidth === 0) return;
  root.querySelectorAll<HTMLElement>('[data-story-text]').forEach((el) => {
    const role = el.dataset.storyText as Role;
    const r = el.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const name = `"${(el.textContent ?? '').slice(0, 40)}"`;
    if (!spanAllowed(r.top, r.bottom)) problems.push(`${name} is outside the safe zones or inside the sticker band (y ${Math.round(r.top)}-${Math.round(r.bottom)})`);
    if (r.left < STORY.side - 1 || r.right > STORY.width - STORY.side + 1) problems.push(`${name} leaves the side margins (x ${Math.round(r.left)}-${Math.round(r.right)})`);
    if (fs < STORY.minFont[role]) problems.push(`${name} is ${fs}px, below the minimum ${STORY.minFont[role]}px`);
    if (el.scrollWidth > el.clientWidth + 1) problems.push(`${name} is cut off horizontally`);
  });
  if (problems.length) throw new Error(`Story media check failed:\n- ${problems.join('\n- ')}`);
}

const Pill: React.FC<{ text: string; solid?: boolean }> = ({ text, solid }) => (
  <Fit
    role="pill"
    max={28}
    nowrap
    style={{
      alignSelf: 'flex-start', fontFamily: theme.fonts.body, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 22px',
      borderRadius: theme.radii.pill, color: solid ? theme.colors.bg : theme.colors.textDim, background: solid ? theme.colors.lime : 'transparent',
      border: solid ? 'none' : `1.5px solid ${theme.colors.hairline}`, lineHeight: 1.1,
    }}
  >
    {text}
  </Fit>
);

/**
 * Instagram Story still (1080x1920): the dark-green Reel look with a light title label, plain text and a one-line footer.
 * Layout: header at y 270, content y 380-1270, EMPTY sticker band y 1290-1590, footer y 1612-1660. No progress bar, no fake sticker or link UI.
 */
export const Story: React.FC<StoryFrameProps> = (p) => {
  const root = useRef<HTMLDivElement>(null);
  const [handle] = useState(() => delayRender('story-fonts'));
  useEffect(() => {
    fontsLoaded.then(() => {
      // Fit effects of children ran before the fonts were ready: measure again once they are.
      requestAnimationFrame(() => {
        try {
          if (root.current) guard(root.current);
          continueRender(handle);
        } catch (e) {
          cancelRender(e);
        }
      });
    }, cancelRender);
  }, [handle]);
  const bigLines = p.big ?? [];
  const labelMax = p.kind === 'vraag' ? 70 : 56;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      <BgMesh />
      {p.background ? <DroneBackground background={p.background} /> : null}
      <div ref={root} style={{ position: 'absolute', inset: 0 }}>
        {/* Header: logo + handle, category label on the right. */}
        <div style={{ position: 'absolute', top: STORY.header.top, left: STORY.side, right: STORY.side, height: STORY.header.height, display: 'flex', alignItems: 'center', gap: 18 }}>
          <BrandLogo size={64} style={{ borderRadius: 16 }} />
          <Fit role="handle" max={32} nowrap style={{ fontFamily: theme.fonts.heading, fontWeight: 700, color: theme.colors.surface, letterSpacing: '-0.01em' }}>
            {theme.brand.handle}
          </Fit>
          <div style={{ marginLeft: 'auto' }}>
            <Pill text={p.kicker} />
          </div>
        </div>
        {/* Content column. */}
        <div
          style={{
            position: 'absolute', left: STORY.side, right: STORY.side, top: STORY.content.top, height: STORY.content.bottom - STORY.content.top,
            display: 'flex', flexDirection: 'column', gap: 28,
          }}
        >
          <div style={{ padding: '28px 36px', borderRadius: theme.radii.md, background: theme.colors.surface, boxShadow: '0 18px 60px rgba(0,0,0,0.35)' }}>
            <Fit role="label" max={labelMax} maxHeight={p.kind === 'vraag' ? 400 : 250} style={{ color: theme.colors.bg, fontFamily: theme.fonts.heading, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em' }}>
              {p.label}
            </Fit>
          </div>
          {p.kind === 'vraag' ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Answer withheld: a big question mark instead of the number. */}
              <Fit role="big" max={240} nowrap style={{ color: theme.colors.lime, fontFamily: theme.fonts.heading, fontWeight: 800, lineHeight: 1, textShadow: `0 0 60px ${theme.colors.limeGlow}` }}>
                ?
              </Fit>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
              {p.eyebrow ? <Pill text={p.eyebrow} solid /> : null}
              {bigLines.map((b, i) => (
                <Fit key={i} role="big" max={bigLines.length > 1 ? 120 : 176} nowrap style={{ color: tone(b.tone), fontFamily: theme.fonts.heading, fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.035em', fontVariantNumeric: 'tabular-nums', textShadow: b.tone === 'lime' ? `0 0 56px ${theme.colors.limeGlow}` : undefined }}>
                  {b.text}
                </Fit>
              ))}
              {p.line ? (
                <Fit role="line" max={44} maxHeight={150} style={{ color: theme.colors.surface, fontFamily: theme.fonts.body, fontWeight: 500, lineHeight: 1.25 }}>
                  {p.line}
                </Fit>
              ) : null}
              {p.cta ? (
                <Fit role="line" max={44} nowrap style={{ color: theme.colors.lime, fontFamily: theme.fonts.heading, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 10 }}>
                  {p.cta}
                </Fit>
              ) : null}
            </div>
          )}
          {p.assumptions ? (
            <Fit role="assumptions" max={32} maxHeight={110} style={{ color: theme.colors.textDim, fontFamily: theme.fonts.body, fontWeight: 500, lineHeight: 1.3 }}>
              {p.assumptions}
            </Fit>
          ) : null}
        </div>
        {/* Sticker band y 1290-1590: intentionally empty. */}
        <div style={{ position: 'absolute', left: STORY.side, right: STORY.side, top: STORY.footer.top, height: STORY.footer.bottom - STORY.footer.top, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Fit role="footer" max={30} nowrap style={{ color: theme.colors.textDim, fontFamily: theme.fonts.body, fontWeight: 500, textAlign: 'center' }}>
            {p.footer}
          </Fit>
        </div>
      </div>
      <Grade />
      <Grain />
      <Vignette />
    </AbsoluteFill>
  );
};

// Only required fields: optional fields of a frame must not fall back to a default (input props are merged over these).
export const defaultStory: StoryFrameProps = {
  kind: 'antwoord',
  kicker: 'Beleggen',
  label: 'Voorbeeld: €250 per maand, 30 jaar',
  big: [{ text: '€250.000', tone: 'lime' }],
  footer: 'Rekenvoorbeeld, geen garantie of advies.',
};
