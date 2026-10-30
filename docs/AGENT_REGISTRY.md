# Agent registry

Project subagents live in `.claude/agents/` (Claude Code subagent format). They load when Claude
Code's project directory is `rendementjager/`. Orchestration: `rj-chief-of-staff` skill;
max 3 subagents at once; subagents never spawn subagents. Record names refer to `packages/shared/src/schemas.ts` (checked 2026-10-23 while it was being built;
re-check if it changes).

| Agent file | Audit actor id (`AgentIdSchema`) | Model | Tools | Gate role | Main records (`@rj/shared`) | Reuses (by reference) |
| --- | --- | --- | --- | --- | --- | --- |
| research-analyst | `research-analyst` | sonnet | Read, Grep, Glob, Write, WebSearch, WebFetch | prepares G1 | `ResearchBriefSchema`, `SourceSchema`, `FinancialClaimSchema` | `research`, `last30days`, `watch` skills; trendspotter method |
| content-strategist | `content-strategist` | opus | Read, Grep, Glob, Write | G2 reviewer, planning | `ContentIdeaSchema`, `ReviewVerdictSchema` | contentkalender-planner method |
| editorial-copywriter | `editorial-copywriter` | sonnet | Read, Grep, Glob, Write, Edit | prepares G2 | `ScriptSchema`, `ScriptRevisionSchema` | videoscript-schrijver + hook-specialist methods; `no-ai-slop` |
| financial-fact-checker | `fact-checker` | opus | Read, Grep, Glob, WebSearch, WebFetch | G3 (facts) | `FactCheckSchema`, `FinancialClaimSchema` | bewijscontroleur status vocabulary |
| compliance-reviewer | `compliance-reviewer` | opus | Read, Grep, Glob, WebFetch | G3 (compliance) | `ComplianceReviewSchema` | — |
| creative-director | `creative-director` | sonnet | Read, Grep, Glob, Write | storyboard, G4 visual review | `StoryboardSchema`, `TemplateIdSchema`, `ThumbnailAssetSchema` | `remotion-motion-graphics`, `design-system`, `dataviz` |
| remotion-video-engineer | `video-engineer` | sonnet | Read, Grep, Glob, Write, Edit, Bash | builds templates, renders | `RenderJobSchema`, `VideoAssetSchema` | `remotion-motion-graphics`, `remotion-best-practices` |
| audio-voice-producer | `voice-producer` | sonnet | Read, Grep, Glob, Write, Edit, Bash | prepares audio for G4 | `VoiceAssetSchema` | — |
| automation-engineer | `automation-engineer` | sonnet | Read, Grep, Glob, Write, Edit, Bash | none (builds jobs) | `JobSchema`, `WorkflowRunSchema` | `ci-cd-and-automation`, `test-driven-development` |
| distribution-manager | `distribution-manager` | haiku | Read, Grep, Glob, Bash | acts only after G5 | `PublicationSchema`, `ApprovalSchema` (read) | Hyper `instagram` skill (future, not connected) |
| growth-analyst | `growth-analyst` | sonnet | Read, Grep, Glob, Write, Bash | none | `AnalyticsSnapshotSchema`, `CostRecordSchema` | data-analist + experiment-coach methods; `dataviz` |
| qa-reliability-engineer | `qa-engineer` | sonnet | Read, Grep, Glob, Bash | G4 | `media_qa` job result, `ErrorLogSchema` | `systematic-debugging`, `verification-before-completion` |

Note: four agent file names (required by the brief) differ from the ids in
`packages/shared/src/agents.ts`; agents always write the **actor id** column to the audit log.
Orchestrating skills act as `chief-of-staff`. Only the actor `owner` can grant G5.

Why reference instead of invoking the workspace BennAI agents: they are written for the the previous client
profile and save into `marketing/`; invoking them would mix contexts. Their methods are cited in
the project agents' instructions.

Gate authority summary: no agent can grant G5. G3 needs both fact-checker and compliance PASS.
Fact-checker and compliance have no Write/Edit/Bash: they return reports; the calling skill
records them through the API.
