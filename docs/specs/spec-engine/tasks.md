# Tasks — spec-engine workstream (`@cox/spec`)

Execute top to bottom. One commit per task: `ws/spec-engine: task N — <title>`.
A task is done only when its `verify` command passes; paste output into the
commit body. All paths relative to `packages/spec/`.

- [x] 1. Scaffold package internals and test helpers
  requirements: R1.1
  complexity: 1
  accept: src/{engine,state,parser,prompts}.ts exist with typed exports (bodies may throw "not implemented"); test/helpers.ts provides fakeRunner (recording calls), tmpProject via fs.mkdtemp, VALID_TASKS_MD and REQ_FIXTURE_MD fixtures; remove --passWithNoTests from package.json.
  verify: pnpm --filter @cox/spec typecheck

- [x] 2. Implement spec.json/runs.json persistence with temp-file+rename writes
  requirements: R1.1, R8.3
  complexity: 2
  accept: state.ts read/write for SpecState and runs.json; writes go .tmp→rename; corrupt spec.json on a mutating path throws with file path and never overwrites; corrupt runs.json resets to {} (it is disposable telemetry, note in NOTES.md).
  verify: pnpm --filter @cox/spec test -- -t "R8.3"

- [x] 3. Implement create() with name validation
  requirements: R1.1, R1.2, R1.3
  complexity: 2
  accept: valid name creates dir + spec.json (phases all "missing", createdAt from injected now()) + idea.md; pattern violations and path separators throw pre-filesystem; existing spec throws untouched.
  verify: pnpm --filter @cox/spec test -- -t "R1.1|R1.2|R1.3"

- [x] 4. Implement tasks.md parser and renderer with round-trip property
  requirements: R6.1, R6.2, R6.3, R6.4
  complexity: 3
  accept: parseTasks per the design grammar (tolerant of human lines, collects errors); renderTasks emits the strict format; property test: parse(render(t)) deep-equals t for representative task lists incl. sub-ids; validation catches duplicate ids, bad complexity, bad R-ids, missing metadata lines.
  verify: pnpm --filter @cox/spec test -- -t "R6"

- [x] 5. Implement surgical checkbox flip and requirement excerpt extraction
  requirements: R6.5, R7.4
  complexity: 2
  accept: flipCheckbox changes exactly one line, byte-identical elsewhere (assert full-file equality); throws when task line absent; extractRequirementExcerpts pulls each "- R<id>: ..." line plus indented continuations from REQ_FIXTURE_MD, notes missing ids inline.
  verify: pnpm --filter @cox/spec test -- -t "R6.5"

- [x] 6. Implement load() and list() with tolerant merge
  requirements: R1.4, R1.5, R1.6
  complexity: 3
  accept: load merges task set from tasks.md with statuses from spec.json (unknown ids → pending); missing spec → null; list skips corrupt spec.json with an error event and continues.
  verify: pnpm --filter @cox/spec test -- -t "R1.4|R1.5|R1.6"

- [x] 7. Implement transition guards and demotion cascade as pure functions
  requirements: R2.1, R2.2, R2.3, R2.4, R4.1, R4.2
  complexity: 3
  accept: assertCanGenerate/assertCanApprove/applyDemotionCascade in state.ts, tested directly without filesystem; every illegal transition from the requirements throws with the blocking phase named; cascade demotes only "approved" downstream phases.
  verify: pnpm --filter @cox/spec test -- -t "R2|R4.1|R4.2"

- [x] 8. Write prompts.ts verbatim from the design
  requirements: R5.1
  complexity: 1
  accept: SPEC_SYSTEM and the four builders copied exactly from design.md §Generation prompts; snapshot tests pin them (template drift must be a conscious diff).
  verify: pnpm --filter @cox/spec test -- -t "prompts"

- [x] 9. Implement generate() for requirements and design
  requirements: R5.1, R5.2, R5.3, R5.4, R4.3
  complexity: 4
  accept: correct AgentTask (kind, sessionId "spec:<name>", system=SPEC_SYSTEM, maxTurns per R5.2) asserted via fakeRunner.calls; fence-strip; write + draft + spec_event on end_turn; no write + error event on other stop reasons or blank text; regen demotion cascade fires events and awaits onPhaseChange with from/to.
  verify: pnpm --filter @cox/spec test -- -t "R5.3|R5.4|R4.3"

- [x] 10. Implement generate("tasks") with validation and rejects
  requirements: R5.5, R4.4
  complexity: 3
  accept: valid output → tasks.md written, statuses reset to pending, spec.json tasks populated; invalid output → tasks.rejected.md written, tasks.md and statuses untouched, error event with first parse error; "tasks-reset" event when done tasks existed.
  verify: pnpm --filter @cox/spec test -- -t "R5.5|R4.4"

- [x] 11. Implement approve() including tasks re-parse
  requirements: R3.1, R3.2, R3.3
  complexity: 3
  accept: draft→approved with approvals append + persist + spec_event + awaited onPhaseChange; missing/approved throw unchanged; approve("tasks") re-parses the (possibly hand-edited) file, populates statuses pending, fails actionably on parse errors leaving phase draft.
  verify: pnpm --filter @cox/spec test -- -t "R3"

- [ ] 12. Implement runTask() selection, execution, and failure ladder
  requirements: R7.1, R7.2, R7.3, R7.4, R7.5, R7.6, R7.7
  complexity: 4
  accept: gating throw; auto-pick first pending; explicit re-run rules incl. done-throws and blocked-reset; in_progress persisted before run; AgentTask fields per R7.4 asserted via fakeRunner.calls (kind, complexityHint, prompt contains title + excerpts + design body); end_turn → done + flip + onTaskComplete awaited; failure → pending, count in runs.json; second consecutive failure → blocked.
  verify: pnpm --filter @cox/spec test -- -t "R7"

- [ ] 13. Hand-edit tolerance suite
  requirements: R8.1, R8.2
  complexity: 2
  accept: reworded title + inserted prose survive a task completion byte-for-byte outside the flipped line; engine paths all derive from deps.cwd (grep test source asserts no process.cwd in src/); no network imports in src/ (grep for "fetch(" and "http").
  verify: pnpm --filter @cox/spec test -- -t "R8.1"

- [ ] 14. End-to-end happy path: safe-divide scenario
  requirements: R1.1, R2.1, R3.1, R5.3, R7.5
  complexity: 3
  accept: scripted fakeRunner walks create → generate/approve ×3 → runTask ×3 in a tmpProject copy of examples/demo-project; asserts final file states, full ordered spec_event sequence, ledger-relevant AgentTask fields, and that all checkboxes read [x].
  verify: pnpm --filter @cox/spec test -- -t "e2e"

- [ ] 15. Package NOTES.md and full-lane green
  requirements: R1.1
  complexity: 1
  accept: NOTES.md (≤1 page) records decisions (runs.json, idea.md, sessionId scheme, steering-via-runner-decorator expectation) and any deviations; whole lane green.
  verify: pnpm --filter @cox/spec typecheck && pnpm --filter @cox/spec test
