/**
 * Rendementjager design tokens. Single source of truth for video and dashboard.
 * CSS variables with the same values live in ./tokens.css (kept in sync by test).
 */

export const colors = {
  /** Deep forest background */
  bg: '#0B1F17',
  /** Slightly lifted surface on the dark background */
  bgRaised: '#10291F',
  /** Secondary green (positive bars, contributed capital) */
  green: '#166534',
  /** Brighter green for positive marks that must read on the dark background (candles) */
  positive: '#3FB86A',
  /** Accent lime: THE hero colour, max one element per frame */
  lime: '#A7F36A',
  /** Negative / risk */
  red: '#EF4444',
  /** Light surface and primary text on dark */
  surface: '#F8FAF9',
  black: '#000000',
  /** Dimmed text on dark backgrounds */
  textDim: 'rgba(248, 250, 249, 0.68)',
  textFaint: 'rgba(248, 250, 249, 0.42)',
  hairline: 'rgba(248, 250, 249, 0.12)',
  limeGlow: 'rgba(167, 243, 106, 0.35)',
} as const;

export type ColorToken = keyof typeof colors;

export const typography = {
  fontFamily: {
    heading: "'Manrope', 'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
  },
  /** Font files shipped with @fontsource (SIL OFL); loaded locally, never from the network. */
  fontFiles: [
    { family: 'Manrope', weight: 800, file: 'manrope-latin-800-normal.woff2' },
    { family: 'Manrope', weight: 700, file: 'manrope-latin-700-normal.woff2' },
    { family: 'Inter', weight: 400, file: 'inter-latin-400-normal.woff2' },
    { family: 'Inter', weight: 500, file: 'inter-latin-500-normal.woff2' },
  ],
  weight: { regular: 400, medium: 500, bold: 700, extraBold: 800 },
  /** Px sizes tuned for a 1080-wide reel. */
  reelSize: { hero: 112, h1: 88, h2: 64, h3: 48, body: 38, caption: 52, small: 28, micro: 22 },
  /** Rem sizes for the dashboard. */
  uiSize: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.25rem', xl: '1.5rem', '2xl': '2rem' },
  letterSpacing: { tight: '-0.03em', normal: '0', wide: '0.08em' },
  lineHeight: { tight: 1.05, snug: 1.2, normal: 1.5 },
} as const;

/** 4px base spacing scale (px). */
export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64, 9: 96, 10: 128 } as const;

export const radii = { sm: 8, md: 16, lg: 28, xl: 40, pill: 999 } as const;

/** 1080x1920 reel format. */
export const reel = { width: 1080, height: 1920, fps: 30 } as const;

/**
 * Safe areas for Instagram Reels: keep key content inside these insets so the
 * IG header, caption block and action buttons never cover it.
 */
export const safeArea = { top: 220, bottom: 380, left: 90, right: 90 } as const;

export const safeRect = {
  x: safeArea.left,
  y: safeArea.top,
  width: reel.width - safeArea.left - safeArea.right,
  height: reel.height - safeArea.top - safeArea.bottom,
} as const;

export const brand = {
  name: 'Rendementjager',
  handle: '@rendementjager',
  promise: 'Meer inzicht. Meer vermogen. Meer vrijheid.',
  cta: 'Volg @rendementjager voor meer inzicht',
} as const;

export const tokens = { colors, typography, spacing, radii, reel, safeArea, safeRect, brand } as const;
