# Requirements — spec-engine workstream (`@cox/spec`)

Implements the `SpecEngine` contract from `packages/core/src/types.ts`: the
Kiro-style spec-coding workflow (`requirements → design → tasks → execution`)
with human approval gates. All EARS ids below are referenced by
`design.md`, `tasks.md`, and test names.

Vocabulary: "the engine" = the `SpecEngine` implementation returned by
`createSpecEngine`. "spec dir" = `<cwd>/.cox/specs/<name>/`.

## Story 1: Spec lifecycle & storage

As a developer, I want specs stored as plain files in my repo, so that specs
are reviewable, diffable, and survive tool restarts.

Acceptance criteria:

- R1.1: WHEN `create(name, idea)` is called with a name matching
  `^[a-z0-9][a-z0-9-]*$`, THE engine SHALL create the spec dir, persist
  `spec.json` (a serialized `SpecState` with all three phases `"missing"`,
  empty `tasks`, empty `approvals`, `createdAt` from the injected `now()`),
  and persist the idea text to `idea.md`.
- R1.2: IF `create` is called with a name that fails the pattern in R1.1 or
  contains a path separator, THEN THE engine SHALL throw an `Error` naming
  the offending value and SHALL NOT touch the filesystem.
- R1.3: IF `create` is called for a spec dir that already exists, THEN THE
  engine SHALL throw and leave the existing spec unmodified.
- R1.4: WHEN `load(name)` is called for an existing spec, THE engine SHALL
  return a `SpecState` whose phase statuses come from `spec.json` and whose
  `tasks` are the merge of `tasks.md` content (task set: ids, titles,
  requirements, complexity) with `spec.json` statuses (status truth),
  defaulting unknown ids to `"pending"`.
- R1.5: WHEN `load(name)` is called for a spec that does not exist, THE
  engine SHALL return `null` (not throw).
- R1.6: WHEN `list()` is called, THE engine SHALL return one `SpecState` per
  readable spec dir; IF a `spec.json` is unreadable or corrupt, THEN THE
  engine SHALL skip that spec, emit an `{type:"error"}` `AgentEvent` naming
  the file, and continue.

## Story 2: Phase gating

As a developer, I want generation gated on prior approvals, so that design
never runs against unapproved requirements.

Acceptance criteria:

- R2.1: WHEN `generate(name, "requirements")` is called, THE engine SHALL
  proceed with no precondition on other phases.
- R2.2: IF `generate(name, "design")` is called while
  `phases.requirements !== "approved"`, THEN THE engine SHALL throw an
  `Error` stating which phase blocks it, and change nothing.
- R2.3: IF `generate(name, "tasks")` is called while
  `phases.design !== "approved"`, THEN THE engine SHALL throw likewise.
- R2.4: IF `generate` or `approve` is called with phase `"execution"` or an
  unknown phase string, THEN THE engine SHALL throw (execution is driven by
  `runTask`, never by `generate`/`approve`).

## Story 3: Approval gates

As a developer, I want approval to be an explicit, human-only action, so
that the model never advances its own work.

Acceptance criteria:

- R3.1: WHEN `approve(name, phase)` is called while that phase is
  `"draft"`, THE engine SHALL set it to `"approved"`, append
  `{phase, at: now()}` to `approvals`, persist `spec.json`, emit a
  `spec_event` with status `"approved"`, and await the `onPhaseChange`
  callback (when provided) with a `HookPayload{event:"SpecPhaseChange"}`.
- R3.2: IF `approve` is called while the phase is `"missing"` or
  `"approved"`, THEN THE engine SHALL throw and change nothing.
- R3.3: WHEN `approve(name, "tasks")` runs, THE engine SHALL re-parse
  `tasks.md` first (picking up user edits to the draft) and persist the
  parsed task set with all statuses `"pending"`; IF the file no longer
  parses (per Story 6), THEN the approval SHALL fail with an actionable
  error and the phase SHALL remain `"draft"`.

## Story 4: Regeneration demotion cascade

As a developer, I want regenerating an earlier phase to invalidate later
approvals, so that downstream documents can't silently outlive their inputs.

Acceptance criteria:

- R4.1: WHEN `generate` runs for a phase whose status is `"approved"`, THE
  engine SHALL demote that phase to `"draft"` upon writing the new content.
- R4.2: WHEN a phase is regenerated, THE engine SHALL demote every
  downstream phase (`requirements → design, tasks`; `design → tasks`) that
  is currently `"approved"` to `"draft"`, leaving `"draft"`/`"missing"`
  downstream phases unchanged.
- R4.3: WHEN a demotion occurs, THE engine SHALL keep the full `approvals`
  history (append-only log; current validity lives in `phases`), emit one
  `spec_event` with status `"demoted"` per demoted phase, and await
  `onPhaseChange` per demoted phase with `data.from`/`data.to` set.
- R4.4: WHEN `generate(name, "tasks")` replaces an existing task list, THE
  engine SHALL reset all task statuses (fresh list, all `"pending"`) and,
  IF any previous task was `"done"`, emit a `spec_event` with status
  `"tasks-reset"` so the loss is visible.

## Story 5: Generation via the injected AgentRunner

As a developer, I want phase documents drafted by the agent with
routing-relevant metadata, so that the router (not the engine) picks models.

Acceptance criteria:

- R5.1: WHEN generating a phase, THE engine SHALL call `runner.run` with an
  `AgentTask` whose `kind` is exactly `"spec-requirements"`,
  `"spec-design"`, or `"spec-tasks"`, whose `specName`, `cwd`, and
  `sessionId` (= `"spec:<name>"`) are set, whose `system` is the fixed
  `SPEC_SYSTEM` prompt, and whose `prompt` is built from the templates in
  `design.md` embedding the idea and all prior-phase documents verbatim.
- R5.2: WHERE the phase is `requirements` or `tasks`, THE engine SHALL set
  `maxTurns: 1`; WHERE the phase is `design`, THE engine SHALL leave
  `maxTurns` unset so the model may explore the repository with tools.
- R5.3: WHEN `runner.run` resolves with `stopReason === "end_turn"` and
  non-blank `finalText`, THE engine SHALL strip a single wrapping
  ```` ```markdown ```` / ```` ``` ```` fence if present, write the result
  to the phase's markdown file, set the phase to `"draft"`, persist, and
  emit `spec_event{status:"draft"}`.
- R5.4: IF `runner.run` resolves with any other `stopReason` or blank text,
  THEN THE engine SHALL write nothing, leave all statuses unchanged, and
  emit an `{type:"error"}` event naming the phase and stop reason.
- R5.5: WHEN generating `tasks`, THE engine SHALL validate the output per
  Story 6 before writing; IF validation fails, THEN THE engine SHALL save
  the raw output to `tasks.rejected.md`, leave `tasks.md` and all statuses
  unchanged, and emit an `{type:"error"}` event with the first parse error.

## Story 6: tasks.md format & parser round-trip

As a tool, I need a machine-parseable task list, so that execution state
can be tracked in the same file humans read.

Acceptance criteria:

- R6.1: THE parser SHALL accept task lines matching
  `- [ ] <id>. <title>` or `- [x] <id>. <title>` where `<id>` matches
  `\d+(\.\d+)?`, followed by indented metadata lines
  `requirements: <R-ids, comma-separated>` and `complexity: <1-5>`.
- R6.2: THE parser SHALL ignore (and preserve on disk) any other lines —
  headings, prose, blank lines — treating them as human-owned content.
- R6.3: Validation after generation SHALL require: at least one task,
  unique ids, integer complexity in 1..5, every requirement id matching
  `^R\d+\.\d+$`, and both metadata lines present on every task; any
  violation is a parse failure (R5.5).
- R6.4: FOR every valid task list, `parse(render(tasks))` SHALL deep-equal
  `tasks` (round-trip property, where `render` is the initial writer).
- R6.5: WHEN a task completes, THE engine SHALL flip exactly that task's
  checkbox `- [ ]` → `- [x]` by surgical line replacement, leaving every
  other byte of `tasks.md` unchanged.

## Story 7: Task execution

As a developer, I want `runTask` to execute one task at a time with
complexity-driven routing and honest failure handling.

Acceptance criteria:

- R7.1: IF `runTask` is called while `phases.tasks !== "approved"`, THEN
  THE engine SHALL throw.
- R7.2: WHEN `runTask(name)` is called without `taskId`, THE engine SHALL
  select the first task (document order) with status `"pending"`; IF none
  exists, THEN THE engine SHALL throw stating whether all tasks are done
  or blocked.
- R7.3: WHEN `runTask(name, taskId)` names an explicit task, THE engine
  SHALL run it if its status is `"pending"`, `"blocked"`, or
  `"in_progress"` (crash recovery); IF `"done"`, THEN THE engine SHALL throw.
- R7.4: WHEN a task starts, THE engine SHALL set its status to
  `"in_progress"`, persist, emit `spec_event{phase:"execution",
  status:"task:in_progress", taskId}`, and call `runner.run` with
  `AgentTask{kind:"spec-task-exec", complexityHint: task.complexity,
  taskId, specName}` and a prompt containing the task title, the EARS
  criterion lines for each referenced requirement id extracted from
  `requirements.md`, the full `design.md` body, and the execution
  instruction template.
- R7.5: WHEN the run resolves with `stopReason === "end_turn"`, THE engine
  SHALL set the task `"done"`, flip its checkbox (R6.5), reset its failure
  count, persist, emit `spec_event{status:"task:done"}`, and await
  `onTaskComplete` with `HookPayload{event:"TaskComplete"}`.
- R7.6: WHEN the run resolves with any other stop reason, THE engine SHALL
  set the task back to `"pending"`, increment its persisted consecutive
  failure count (`runs.json`), and emit `spec_event{status:"task:failed"}`.
- R7.7: IF a task's consecutive failure count reaches 2, THEN THE engine
  SHALL set it to `"blocked"`, persist, and emit
  `spec_event{status:"task:blocked"}`; a subsequent explicit `runTask`
  (R7.3) resets the count to 0 before running.

## Story 8: Tolerance & safety

As a developer, I want to hand-edit spec documents freely, so that the tool
augments my workflow instead of owning it.

Acceptance criteria:

- R8.1: WHEN documents contain user edits (reworded titles, extra prose,
  reordered prose sections), THE engine SHALL preserve them across status
  updates: only checkbox markers and machine metadata lines are rewritten.
- R8.2: THE engine SHALL never write outside the spec dir, SHALL resolve
  the spec dir from the injected `cwd` (never `process.cwd()`), and SHALL
  perform no network access itself (all model work goes through the
  injected `AgentRunner`).
- R8.3: IF `spec.json` exists but is corrupt when a mutating method runs,
  THEN THE engine SHALL throw with the file path and SHALL NOT overwrite it.
