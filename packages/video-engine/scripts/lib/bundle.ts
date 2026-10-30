import { bundle } from '@remotion/bundler';
import { webpackOverride } from '../../src/webpack-override.js';
import { ENTRY, PUBLIC_DIR } from './paths.js';

let cached: Promise<string> | null = null;
export function getBundle(): Promise<string> {
  cached ??= bundle({ entryPoint: ENTRY, publicDir: PUBLIC_DIR, webpackOverride });
  return cached;
}
