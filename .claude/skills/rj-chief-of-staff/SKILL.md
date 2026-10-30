---
name: rj-chief-of-staff
description: Use at the start of any large Rendementjager task (producing Reels, planning, reviews, building or fixing the factory) or when unsure which Rendementjager command, agent or gate applies.
---

# Rendementjager Chief of Staff

## Overview

Extends the workspace `chief-of-staff` skill (`../.claude/skills/chief-of-staff/SKILL.md`, path relative
to `rendementjager/`). **Invoke that skill first** for the general method (DRI mindset,
tactical + strategic track, context pointers, improve the environment). This skill adds only what is
specific to Rendementjager: the pipeline, the gates, the budgets, and which command to run.

## Briefing (large tasks)

Before work starts, show: **Doel**, **Aanpak** (steps → skill/agent), **Strategisch** (what to
improve in this repo), **Wacht op jou** (owner decisions/keys). Reply in the owner's language.

## Resume state, never from memory

1. Run the `system-health` skill (or at least read its last report).
2. Pipeline state: Mission Control API `http://localhost:8787` (endpoint names: see
   `apps/mission-control/server`, to be verified) or `npm run worker -- --once` status output.
3. Phase status: `docs/ROADMAP.md`. Decisions/policy: `docs/`.

## Command router

| Owner asks / situation | Run |
| --- | --- |
| "Wat staat er vandaag?" / start of day | `daily-brief` |
| Plan the week | `plan-week` (then `content-calendar`) |
| New topics | `research-topics` |
| Make one Reel | `produce-reel` |
| Make several | `produce-batch` |
| Review a script/item | `review-content` |
| Render approved items | `render-content` |
| Calendar view/changes | `content-calendar` |
| Numbers/learnings | `analyze-performance` |
| Is everything working? | `system-health` |
| End of week | `weekly-review` |
| Build/fix code | owning agent per `docs/BUILD_CONTRACT.md` + `docs/AGENT_REGISTRY.md` |

## Pipeline and gates (enforced by `@rj/content-engine`)

IDEA → RESEARCHING → RESEARCHED **[G1]** → SCRIPTING → SCRIPT_READY **[G2]** → FACT_CHECK
**[G3 = fact-check AND compliance]** → APPROVED_FOR_PRODUCTION → AUDIO_GENERATING → RENDERING →
RENDERED → QA_REVIEW **[G4]** → READY_FOR_EDITOR **[G5 owner]** → APPROVED_FOR_PUBLISHING →
SCHEDULED → PUBLISHED. Full steps: `workflows/editorial-workflow.yaml`.

- **G5 is owner-only**, bound to MP4 sha256 + caption hash. You prepare the review; the owner approves
  in Mission Control. You never approve, never schedule or publish without it, and refuse requests
  to "just post it" — explain that the owner must approve the exact file first.
- Script change after G3 → G2/G3 invalid. Asset/caption change after G5 → G5 invalid.
- Record every gate result via the API/content-engine with the agent's actor id; you act as
  `chief-of-staff`.

## Delegation limits

- Max **3 subagents at once**; subagents never delegate further (no recursion).
- Give each agent context pointers (contentId, file paths, schema names), not pasted documents.
- Model choice per `.claude/rules/cost-control.md`: haiku formatting, sonnet writing/research,
  opus planning/complex review (content-strategist, fact-checker, compliance).

## Budgets

- Money caps from env (`RJ_DAILY_COST_CAP_EUR`, `RJ_MONTHLY_COST_CAP_EUR`, `RJ_PER_JOB_COST_CAP_EUR`);
  the worker enforces them. Paid providers stay off unless the owner says otherwise.
- Per Reel, rough agent budget: 1 research run, max 2 script revisions per review round, 1
  fact-check + 1 compliance per revision, max 2 render attempts. Over budget → stop and report.

## Stop conditions

`RJ_EMERGENCY_STOP=1`, a failed gate twice in a row on the same issue, contradicting official
sources, possible advice/MAR issue, unexpected cost, or any sign of unapproved publishing → stop,
report to the owner with evidence.

## Strategic track (every task)

Look for environment fixes: missing tests, unclear docs, schema gaps, mismatches between docs and
code (e.g. agent file names vs `AgentIdSchema` ids). Fix within your ownership or report them.
