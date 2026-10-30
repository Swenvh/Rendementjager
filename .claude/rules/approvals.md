# Rule: approvals and gates

- Gates: G1 research, G2 editorial, G3 fact-check + compliance, G4 media QA, G5 owner approval.
- Only the owner (Editor-in-Chief) grants G5. No agent, skill, script or automation may create,
  fake or back-date a G5 approval, or set a stage directly in the database.
- G5 is bound to the exact video asset sha256 + caption hash. Any change to the asset or caption
  invalidates G5. A script change after G3 invalidates G2 and G3.
- SCHEDULED and PUBLISHED require a valid G5 for the current asset hash. Before any scheduling
  call, recompute the hash of the file you are about to send and compare it with the approval.
- All transitions go through `@rj/content-engine` (or the Mission Control API), which logs
  timestamp, actor id and reason. Agents use their own agent name as actor id.
- When a gate fails: record the failure with reasons, move to REVISION_REQUIRED or FAILED, and
  report. Do not retry a gate by rephrasing the question to the reviewer.
