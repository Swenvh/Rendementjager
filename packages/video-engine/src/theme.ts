// Single theme object for every composition. NEVER inline colours or easings in components.
import { Easing } from 'remotion';
import { colors, typography, safeArea, reel, radii, brand } from '@rj/brand';

export const theme = {
  colors,
  fonts: { heading: typography.fontFamily.heading, body: typography.fontFamily.body },
  size: typography.reelSize,
  safe: safeArea,
  reel,
  radii,
  brand,
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.83, 0, 0.17, 1),
    in: Easing.bezier(0.7, 0, 0.84, 0),
    soft: Easing.bezier(0.45, 0, 0.2, 1),
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
    counter: { damping: 30, stiffness: 60, mass: 1 },
  },
} as const;

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
