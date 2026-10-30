#!/usr/bin/env bash
# Short status shown every time the Codespace is attached.
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
n=$(npm run -s footage -- list 2>/dev/null | tail -1)
echo "----- Rendementjager status -----"
echo "Beelden: ${n:-onbekend}"
echo "yt-dlp: $(command -v yt-dlp >/dev/null && yt-dlp --version || echo 'niet geinstalleerd')   ffmpeg: $(command -v ffmpeg >/dev/null && echo ok || echo 'ontbreekt')"
echo "Stem: $([ "${RJ_TTS_PROVIDER:-}" = elevenlabs ] && echo 'ElevenLabs (opt-in)' || echo 'stemloos (alleen ondertitels)')"
echo "Zijn de beelden nog niet binnen? npm run footage -- fetch-sources --plan assets/footage/plans/nl-scenic.json"
echo "Daarna: npm run reels:rebuild"
echo "---------------------------------"
