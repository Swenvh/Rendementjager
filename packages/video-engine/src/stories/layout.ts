// Instagram Story layout (1080x1920). Pure constants: used by the Remotion component, the build script and the tests.
// Instagram covers the top (profile bar) and the bottom (reply bar) of a Story: no content within STORY.topSafe / bottomSafe.
export const STORY = {
  width: 1080,
  height: 1920,
  topSafe: 250,
  bottomSafe: 250,
  side: 80,
  /** Brand header (logo + handle + category label). */
  header: { top: 270, height: 72 },
  /** Main content column (title label, number, lines). */
  content: { top: 380, bottom: 1270 },
  /** Clearly empty band where the owner adds native Instagram stickers (poll, question, quiz, slider, link) in the app. Nothing is drawn here. */
  stickerBand: { top: 1290, bottom: 1590 },
  /** One-line disclaimer. */
  footer: { top: 1612, bottom: 1660 },
  /** Smallest legible font sizes (px) per role at 1080 px width. */
  minFont: { label: 48, big: 72, line: 36, assumptions: 30, pill: 26, footer: 28, handle: 30 },
} as const;

export const STORY_FOOTER = 'Rekenvoorbeeld, geen garantie of advies.';
export const STORY_CTA = 'Meer tips? Volg @rendementjager';
export const STORY_TEASER = 'Nieuw: zie de Reel';

export type StoryKind = 'vraag' | 'antwoord' | 'reel-teaser' | 'quick-fact';
export const KIND_FILE: Record<StoryKind, string> = { vraag: 'vraag', antwoord: 'antwoord', 'reel-teaser': 'reel-teaser', 'quick-fact': 'quick-fact' };

/** True when a vertical span [top, bottom] is allowed for visible text: inside the safe zones and outside the sticker band. */
export function spanAllowed(top: number, bottom: number): boolean {
  const { topSafe, bottomSafe, height, stickerBand } = STORY;
  if (top < topSafe || bottom > height - bottomSafe) return false;
  return bottom <= stickerBand.top || top >= stickerBand.bottom;
}
