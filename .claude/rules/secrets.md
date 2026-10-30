# Rule: secrets

- Secrets come only from environment variables (`.env`, git-ignored; template `.env.example`).
- Never print, log, echo, commit, paste into prompts, or write secrets into files, reports or
  screenshots. Status output reports `configured: true/false` only.
- Never ask the owner to paste a key into chat; ask them to set it in `.env` or the environment
  settings of the cloud session.
- Do not add a new external service, SDK or MCP without the security check in `CLAUDE.md`.
- If a secret leaks: stop, tell the owner which key and where, and recommend rotation.
