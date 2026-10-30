import fs from 'node:fs';
import path from 'node:path';

/** Cloud sessions cannot download Chrome Headless Shell: use the preinstalled Playwright one. */
export function findBrowserExecutable(): string | null {
  if (process.env.RJ_BROWSER_EXECUTABLE) return process.env.RJ_BROWSER_EXECUTABLE;
  const pw = '/opt/pw-browsers';
  if (!fs.existsSync(pw)) return null;
  return (
    fs
      .readdirSync(pw)
      .filter((d) => d.startsWith('chromium_headless_shell-'))
      .flatMap((d) => [path.join(pw, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'), path.join(pw, d, 'chrome-linux', 'headless_shell')])
      .find((p) => fs.existsSync(p)) ?? null
  );
}
