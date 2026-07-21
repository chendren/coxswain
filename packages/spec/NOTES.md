# @cox/spec — notes for the integrator

## Decisions

- **runs.json** (`<specDir>/runs.json`) is engine-private consecutive-failure
  tracking for R7.6/R7.7 (`{ [taskId]: { consecutiveFailures, lastStopReason,
  lastRunAt } }`). It is never part of `SpecState` and never crosses the
  `SpecEngine` interface. Unlike `spec.json`, it is disposable: a missing or
  corrupt file silently resets to `{}` (never throws) — losing a failure
  streak is harmless, unlike losing phase/approval state.
- **idea.md** (`<specDir>/idea.md`) persists `create()`'s idea text so every
  later `generate()` call — including regenerations long after the original
  `create()` — can rebuild its prompt without the caller re-supplying it.
  Engine-private, not part of `SpecState`.
- **sessionId** on every `AgentTask` the engine builds (`generate` and
  `runTask` alike) is `spec:<name>`, exactly as design.md specifies — groups
  a spec's calls in the ledger regardless of phase.
- **Steering is out of scope here by design**: `AgentTask.system` is always
  the fixed `SPEC_SYSTEM` string (prompt-cacheable). This package never
  imports `@cox/steering`; `@cox/cli` is expected to wrap the injected
  `AgentRunner` with a decorator that prepends project steering docs to
  `task.system` before the call reaches a model. Nothing here assumes that
  decorator exists — tests pass a bare `fakeRunner`.
- `generate("tasks")`'s success path writes the **canonical re-render**
  (`renderTasks(name, freshTasks)`), not the model's raw text — this
  guarantees "fresh list, all pending" (R4.4) even if the model's own
  checkboxes were wrong. `requirements.md`/`design.md` have no machine-owned
  invariant, so they're written verbatim (fence-stripped only).
- R1.2's name check is one regex (`^[a-z0-9][a-z0-9-]*$`) covering both the
  charset rule and the path-separator ban, since `/` and `\` are already
  outside that charset — no separate check needed.
- `create()`'s "already exists" test (R1.3) checks for `spec.json`
  specifically, not just the directory, so a stray empty directory doesn't
  count as an existing spec.

## Deviations from design.md

- `applyDemotionCascade(s, regenerated)` unconditionally sets the
  regenerated phase itself to `"draft"` (covering R4.1), not just the
  downstream cascade (R4.2) that design.md's inline comment implied was the
  caller's job. This makes R4.1 directly unit-testable as a pure function
  per task 7's "tested directly without filesystem," and it simplified
  `generate()`. Its `demoted` return value still lists **only** the
  downstream flips — the regenerated phase's own transition is still
  reported via generate()'s "draft" `spec_event` (R5.3), never a "demoted"
  one, so the R4.3 event contract is unchanged from the caller's view.
- Guard unit tests live in `test/state.test.ts` (persistence + transition
  guards + cascade), not folded into `engine.test.ts`. design.md's file list
  doesn't enumerate this file, but task 7 explicitly wants the pure
  functions tested "without filesystem," which reads most naturally as its
  own file; `engine.test.ts` still owns the integration-level lifecycle/
  gating/approval/demotion/e2e coverage its file comment describes.

## Process note

`pnpm --filter @cox/spec test -- -t "<pattern>"` does not actually apply
vitest's `-t` filter (pnpm's `--` forwarding quirk) — the wrapped command
runs the whole suite regardless of the pattern. Every task's commit body
pastes both that literal command's output and a direct `vitest run -t
"<pattern>"` run confirming the intended subset passes on its own.
