---
name: review-content
description: Use when a Rendementjager script, caption or rendered item needs a gate review (G2 editorial, G3 fact-check and compliance, or G4 media QA) or the owner asks for a second opinion.
---

# Review content

## Pick the gate by stage

| Stage | Gate | Agent(s) |
| --- | --- | --- |
| SCRIPT_READY | G2 | `content-strategist` (format, tone, strategy; eindredacteur method from `../.claude/agents/eindredacteur.md`) |
| FACT_CHECK | G3 | `financial-fact-checker` + `compliance-reviewer` in parallel; both must `pass` |
| QA_REVIEW | G4 | `qa-reliability-engineer` with `npm run qa -w @rj/video-engine -- <mp4>`; `creative-director` for the visual check |
| READY_FOR_EDITOR | G5 | **Owner only.** You prepare a review sheet (MP4 path, sha256, caption, QA flags); you do not approve |

## Steps

1. Read the item and current revision via the API; confirm the stage matches the gate.
2. Dispatch the agent(s) with pointers (contentId, file paths, revision id).
3. Record results through the API (`ReviewVerdictSchema`: pass / needs_revision / fail) with the
   agent's actor id. Fact-checker and compliance return reports; you record them.
4. Verdict summary to the owner: per gate pass/fail, numbered fixes, next step.

A reviewer's `fail` is final for that revision: fix the content, do not re-ask the reviewer with
different wording.

## Guardrails

- Never publish, schedule or grant G5; publishing requires the owner's G5 approval of the exact
  MP4 sha256 + caption hash. If asked to publish, refuse and point to Mission Control approval.
- Max 3 subagents at once; subagents do not delegate further.
- `RJ_EMERGENCY_STOP=1` → do nothing except report.
- Never fabricate numbers or metrics; missing = `null` / "onbekend". Mocks labelled `mock`.
- Commands marked (to be verified) may not exist yet; if one fails, report it instead of improvising
  a workaround that bypasses the content-engine.
