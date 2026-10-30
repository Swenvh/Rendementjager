import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';
import { typography } from '@rj/brand';

// Fonts ship in public/fonts (SIL OFL, from @fontsource). No network at render time.
export const fontsLoaded = Promise.all(
  typography.fontFiles.map((f) =>
    loadFont({ family: f.family, url: staticFile(`fonts/${f.file}`), weight: String(f.weight) }),
  ),
);
