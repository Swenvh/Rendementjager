import fs from 'node:fs';
import path from 'node:path';
import { Config } from '@remotion/cli/config';
import { webpackOverride } from './src/webpack-override';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.overrideWebpackConfig(webpackOverride);

// Cloud sessions can't download Chrome Headless Shell: use the preinstalled Playwright one.
// (Same logic as scripts/lib/browser.ts; kept inline because the CLI config loader is minimal.)
const pw = '/opt/pw-browsers';
const shell =
  process.env.RJ_BROWSER_EXECUTABLE ??
  (fs.existsSync(pw)
    ? fs
        .readdirSync(pw)
        .filter((d) => d.startsWith('chromium_headless_shell-'))
        .flatMap((d) => [path.join(pw, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'), path.join(pw, d, 'chrome-linux', 'headless_shell')])
        .find((p) => fs.existsSync(p))
    : undefined);
if (shell) Config.setBrowserExecutable(shell);
