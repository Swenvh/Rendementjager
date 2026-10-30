import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colors, safeArea, safeRect, reel, logo, resolveLogo, officialLogo } from '../src/index.js';

const css = readFileSync(fileURLToPath(new URL('../src/tokens.css', import.meta.url)), 'utf8');

describe('brand tokens', () => {
  it('core brand colours match the spec', () => {
    expect(colors.bg).toBe('#0B1F17');
    expect(colors.green).toBe('#166534');
    expect(colors.lime).toBe('#A7F36A');
    expect(colors.red).toBe('#EF4444');
    expect(colors.surface).toBe('#F8FAF9');
    expect(colors.black).toBe('#000000');
  });
  it('CSS variables stay in sync with TS tokens', () => {
    const pairs: [string, string][] = [
      ['--rj-color-bg', colors.bg], ['--rj-color-green', colors.green], ['--rj-color-lime', colors.lime],
      ['--rj-color-red', colors.red], ['--rj-color-surface', colors.surface], ['--rj-color-black', colors.black],
      ['--rj-safe-top', `${safeArea.top}px`], ['--rj-safe-bottom', `${safeArea.bottom}px`],
      ['--rj-safe-left', `${safeArea.left}px`], ['--rj-safe-right', `${safeArea.right}px`],
    ];
    for (const [name, value] of pairs) expect(css).toContain(`${name}: ${value};`);
  });
  it('safe rect fits inside the reel', () => {
    expect(safeRect.x + safeRect.width).toBe(reel.width - safeArea.right);
    expect(safeRect.y + safeRect.height).toBe(reel.height - safeArea.bottom);
  });
  it('logo is flagged as placeholder and prefers the official file when present', () => {
    expect(logo.isPlaceholder).toBe(true);
    expect(logo.file).toContain('placeholder');
    expect(resolveLogo(() => false).isPlaceholder).toBe(true);
    expect(resolveLogo((f) => f === officialLogo.file)).toBe(officialLogo);
  });
});
