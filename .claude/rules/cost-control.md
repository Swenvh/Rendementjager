# Rule: cost control

- Caps from env: `RJ_DAILY_COST_CAP_EUR` (default 5), `RJ_MONTHLY_COST_CAP_EUR` (50),
  `RJ_PER_JOB_COST_CAP_EUR` (1), `RJ_MAX_CONCURRENT_JOBS` (2), `RJ_MAX_RETRIES` (3).
  The worker refuses jobs that would exceed a cap; do not work around it.
- No paid service (TTS, LLM API, scheduling, ads, stock media) is activated or upgraded without
  explicit owner instruction. Default is mock/local fallback, clearly labelled.
- Claude Code orchestration: max 3 subagents at once, no recursive delegation. Use haiku for
  formatting, sonnet for writing/research, opus only for planning and complex review.
- Cache: reuse research briefs, TTS audio (by text hash) and renders (by input hash) instead of
  regenerating. Re-render only when inputs changed.
- Report estimated spend in daily-brief and weekly-review; unknown costs are reported as unknown.
