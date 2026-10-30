#!/usr/bin/env bash
# Codespaces / devcontainer setup. Everything after the npm install is best-effort: a failure never blocks the Codespace.
set -u
cd "$(dirname "$0")/.."

sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg pipx
cp -n .env.example .env
npm ci --no-audit --no-fund && npm run db:migrate && npm run db:seed || exit 1

# yt-dlp (pinned) for the footage downloader. Best-effort.
YT_DLP_VERSION="2026.10.26"
pipx install "yt-dlp==${YT_DLP_VERSION}" >/dev/null 2>&1 || pip install --user --break-system-packages "yt-dlp==${YT_DLP_VERSION}" >/dev/null 2>&1 \
  || echo "yt-dlp kon niet worden geinstalleerd: gebruik 'npm run footage -- slice' met zelf gedownloade video's"
export PATH="$HOME/.local/bin:$PATH"

# Download only the planned time ranges of the owner-declared sources and cut portrait clips (best-effort; YouTube may refuse).
npm run footage -- fetch-sources --plan assets/footage/plans/nl-scenic.json || true
exit 0
