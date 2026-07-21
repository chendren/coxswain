# agent-tools — Tasks

Execute top to bottom. One commit per task: `ws/agent-tools: task N — <title>`.
Check a box only after its `verify` command passes.

- [ ] 1. Tools scaffolding: validate.ts, paths.ts, registry.ts
  requirements: R8.2, R6.1
  complexity: 2
  accept: resolveWithin flags escapes via `..`/absolute paths; registry list/get; invalid inputs raise actionable errors
  verify: pnpm --filter @cox/tools test -- registry

- [ ] 2. read tool
  requirements: R1 (support), R8.1, R9.2
  complexity: 2
  accept: numbered output, offset/limit, 2000-line + 2MB truncation markers; permissionFor null in all modes
  verify: pnpm --filter @cox/tools test -- read

- [ ] 3. write tool
  requirements: R8.2
  complexity: 2
  accept: parent dirs created; OUTSIDE PROJECT summary when escaping cwd, prompted even in acceptEdits/yolo per matrix
  verify: pnpm --filter @cox/tools test -- write

- [ ] 4. diff.ts + edit tool
  requirements: R8.3
  complexity: 3
  accept: exactly-once match enforced with count-naming errors; unified diff in PermissionRequest.detail; multi-line old_string works
  verify: pnpm --filter @cox/tools test -- edit

- [ ] 5. globmatch.ts + walk.ts
  requirements: R8.5
  complexity: 2
  accept: ** * ? {a,b} translated correctly (table-driven); walker skips node_modules/.git; yields mtimes
  verify: pnpm --filter @cox/tools test -- globmatch

- [ ] 6. glob tool
  requirements: R8.5
  complexity: 1
  accept: cwd-relative results, mtime-desc, limit honored
  verify: pnpm --filter @cox/tools test -- glob

- [ ] 7. grep tool
  requirements: R8.6
  complexity: 3
  accept: three modes; binary skip; invalid-regex error; 1000-match cap marker
  verify: pnpm --filter @cox/tools test -- grep

- [ ] 8. bash tool
  requirements: R8.4
  complexity: 3
  accept: deny-prefix beats allow-prefix; timeout kill + isError; 30k truncation; exit-code line on failure; $SHELL fallback /bin/sh
  verify: pnpm --filter @cox/tools test -- bash

- [ ] 9. permissionFor matrix (all tools × all modes)
  requirements: R6.4, R8.2, R8.4
  complexity: 2
  accept: table-driven test mirrors the design matrix exactly, incl. outside-cwd rows and bash prefix rows
  verify: pnpm --filter @cox/tools test -- permissions

- [ ] 10. ScriptedChatModel helper + preview.ts
  requirements: R9.1, R3.3
  complexity: 2
  accept: scripted turns replay deltas/toolUses/usage/stopReason; records requests; failWith throws mid-stream; previews truncate at 80/120
  verify: pnpm --filter @cox/agent test -- scripted

- [ ] 11. assemble.ts: ChatRequest construction + cache breakpoints
  requirements: R2.1, R2.2, R2.3
  complexity: 3
  accept: system verbatim; assistant text+tool_use ordering; single tool_result user message; breakpoint = prev messages last index (first call: history.length-1/undefined) asserted via recorded requests
  verify: pnpm --filter @cox/agent test -- assemble

- [ ] 12. Single-turn loop: routing, events, usage/cost
  requirements: R1.1, R1.3, R3.1, R3.2
  complexity: 3
  accept: routing_decision precedes model_call_started; end_turn resolves with finalText/history; costUsd via core pricing (null-pricing model → 0-contribution + costUsd null on event); durations from injected now
  verify: pnpm --filter @cox/agent test -- runner

- [ ] 13. Tool-execution turns: sequential exec, unknown tool, permission flow
  requirements: R1.2, R1.6, R6.1, R6.2, R6.3
  complexity: 4
  accept: multi-tool order preserved; unknown-tool isError lists names; deny feeds "user denied"; allowAlways skips second prompt (bash keyed by first token); events wrap each call
  verify: pnpm --filter @cox/agent test -- permissions-flow

- [ ] 14. Hook callbacks + plan mode
  requirements: R5.1, R5.2, R6.4
  complexity: 3
  accept: preToolUse block → skip + isError(stderr); postToolUse block → "[hook]" appended; plan mode auto-denies mutating tools with no prompt, read tools still run
  verify: pnpm --filter @cox/agent test -- runner -t hook

- [ ] 15. Escalation: SignalTracker + reconsider swap
  requirements: R4.1, R4.2, R4.3
  complexity: 4
  accept: streak counts reset on success; JSON-equal stuck detection; reconsider called with accumulated signals; swap emits escalation + new routing_decision and later requests hit the new model (asserted via two ScriptedChatModels)
  verify: pnpm --filter @cox/agent test -- escalation

- [ ] 16. Termination matrix + NOTES.md + full green
  requirements: R1.4, R1.5, R7.1, R7.2, R7.3
  complexity: 3
  accept: max_turns, budget_stop (hardStop true/false), warn-once alert, aborted (pre-iteration and mid-stream), max_tokens, refusal all covered; NOTES.md lists decisions (walker perf ceiling, cost-null caveat); typecheck+test green for both packages
  verify: pnpm --filter @cox/tools typecheck && pnpm --filter @cox/agent typecheck && pnpm --filter @cox/tools test && pnpm --filter @cox/agent test
