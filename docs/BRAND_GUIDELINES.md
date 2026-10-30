# Brand guidelines

Source of truth for values: `packages/brand/src/tokens.ts` (+ `tokens.css`). This document explains
how to use them; if values differ, the package wins and this file is updated.

## Brand in one line

Rendementjager is an anonymous, premium, calm voice on money for Dutch adults: clear numbers,
no hype. Promise: "Meer inzicht. Meer vermogen. Meer vrijheid." Handle: `@rendementjager`.

## Colour tokens

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0B1F17` deep forest | Default background |
| `bgRaised` | `#10291F` | Cards, panels |
| `green` | `#166534` | Positive bars, contributed capital |
| `lime` | `#A7F36A` | Hero accent: **max one element per frame** |
| `red` | `#EF4444` | Negative values, risk |
| `surface` | `#F8FAF9` | Primary text on dark, light surfaces |
| `textDim` / `textFaint` | 68% / 42% white | Secondary text, labels |
| `hairline` | 12% white | Dividers, axes |

Never use red/green as the only carrier of meaning: pair with a sign (+/−) or label.
Check contrast (WCAG AA) for text; `lime` on `bg` and `surface` on `bg` pass for large text.

## Typography

- Headings: **Manrope** 700/800, fallback Inter. Body: **Inter** 400/500.
- Fonts are bundled from @fontsource files (SIL OFL) and loaded locally; Manrope is not installed
  system-wide, so never rely on the system font in renders.
- Reel sizes (px at 1080 wide): hero 112, h1 88, h2 64, h3 48, body 38, captions 52, small 28.
  Minimum on-screen text: 28 px. Max ~7 words per caption line, max 2 lines.
- Numbers: nl-NL formatting (`€ 1.234,56`, `7,5%`), tabular figures for animated counters.

## Format and safe areas

- Reel: 1080×1920, 30 fps. Covers: 1080×1920 with a 1080×1350 (4:5) centre-safe crop for the grid.
- Safe area (tokens): top 220, bottom 380, left 90, right 90 px. Keep text, numbers and logo inside;
  the IG header, caption block and action buttons cover the rest. Meta changes the UI; re-check
  against a real Reel preview before a template is approved.

## Logo

- **There is no official logo yet.** `@rj/brand` uses `logo-placeholder.svg`, marked
  `isPlaceholder: true`. Every render that uses it is labelled placeholder in its QA report.
- Placeholder content may be produced for internal review but must not pass G5 for publication
  unless the owner explicitly accepts the placeholder for that item.
- Switching: the owner delivers `assets/brand/logo-official.svg`; `resolveLogo()` prefers it.
- Rules for the official logo (once delivered): do not recolour outside tokens, stretch, add effects,
  or place outside the safe area; minimum width 120 px on a Reel; clear space = height of the mark.
- Never generate an "official" logo with AI tools (the `design` skill can make one; it would not be
  the owner's mark).

## Tone of voice (Dutch output)

- "Je"-vorm, kalm, precies, nuchter. Explain like a smart friend who works with numbers.
- Lead with a concrete number or situation, then the why, then what it means for you, then the
  assumption/risk. One idea per Reel.
- Anonymous: no face, no personal stories presented as real, no "ik verdien…".
- CTA: one per item, default "Volg @rendementjager voor meer inzicht".

## Avoid

- Hype and urgency: "snel rijk", "gegarandeerd", "nu instappen", "dit moet je kopen", rockets, 🚀💰.
- Product, fund, broker or coin recommendations; affiliate links without disclosure.
- Unsourced statistics; returns without timeframe, costs and risk.
- Clickbait that the video does not deliver; fear-mongering about pensions or tax.
- Stock-photo luxury (Lambos, cash piles), generic AI-video look (linear fades, flat backgrounds:
  see the `remotion-motion-graphics` skill rules).
- More than one lime accent per frame; text outside the safe area.
