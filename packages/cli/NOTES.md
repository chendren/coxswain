# @cox/cli — NOTES

Decisions and deviations for the integrator. Kept to ~1 page; grows as
later tasks land.

## deps.ts owns the whole engine-graph construction, not just import+check

See `INTEGRATION-NOTES.md` (2026-07-20). `EngineDeps.agent`/`.specs` must be
fully-constructed instances, so `deps.ts::loadDeps` ends up doing what
design.md's "wire.ts order" section describes (registry -> ledger -> router
-> tools/steering/hooks -> agent -> specs), including the PreModelCall-hook
`Router` decorator and the steering-prepending `AgentRunner` decorator for
specs. `wire.ts` (task 13) only adds the session-level pieces design.md's
step 8 assigns to it (snapshot store, ledger-writer subscriber) plus
`SessionController` construction — it never imports an engine package
itself. `deps.ts` remains the *only* file with dynamic `import("@cox/...")`
calls; a grep-style test (`test/deps.test.ts`) checks every other `.ts`
file in `src/`.

`loadDeps` also stamps a generated session id (`LoadedDeps.sessionId`, an
extra property beyond design.md's literal `EngineDeps` shape) because
`createAgentRunner`'s real `budgetState` is a zero-arg closure with no
per-call sessionId seam — `wire.ts` reuses this id as
`SessionController.sessionId` so ledger writes/budget checks/hook payloads
agree on one identity.

## cli's tsconfig needs `"jsx": "react-jsx"` too

`@cox/cli` has no `.tsx` files of its own, but `packages/cli/src/commands/
replay.ts` imports `startTui` from `@cox/tui`, and since v1 has no build
step (packages export TS source directly, per docs/04), `tsc --noEmit` for
`@cox/cli` walks into `@cox/tui/src/app.tsx` as part of the same
compilation and needs to know how to parse JSX there. tui's own
package-local `jsx` setting doesn't apply when a *different* package's tsc
invocation pulls its source in. Added the same `"jsx": "react-jsx"` to
`packages/cli/tsconfig.json`. No new dependency needed for `@types/react`
resolution — TS/Node resolve it from `packages/tui/node_modules` based on
the importing file's own location on disk, not the invoking package.

## snapshot.ts (`createSnapshotStore`)

Used by both `cox replay` (task 5, no ledger) and, from task 13, the real
session. `get()` must stay synchronous (`TuiOptions.getSnapshot: () =>
SessionSnapshot`), so it cannot await `Ledger.budgetState()` — budget
numbers instead come from the fold's own running total of
`model_call_finished` usage/cost (self-sufficient in replay mode) and get
corrected to the ledger-authoritative numbers whenever a `budget_alert`
event arrives (see code comment: classify calls are ledgered directly by
the router and never emit `model_call_finished`, so the fold's own running
total slightly under-counts until a `budget_alert` corrects it — bounded
by design, since router-ledger's own docs treat >2% classify overhead as a
bug). `activeSpec.tasksDone`/`tasksTotal` cannot be derived from the event
stream at all — see `INTEGRATION-NOTES.md` (2026-07-20, task 5).

## cox replay

`runReplay` (`src/commands/replay.ts`) mounts the real `startTui` against
real `process.stdout`/`stdin` — design.md's `TuiOptions` has no
stream-injection seam, so `test/replay.test.ts` temporarily patches
`process.stdout.write` to a no-op around the calls that mount it, to keep
`pnpm --filter @cox/cli test` output readable. Assertions are against the
returned snapshot fold, not rendered frames.

## oneshot.ts (`runOneshot`)

Wired into `main.ts`'s `explain`/`suggest` handlers (task 13) via a small
`runOneshotCommand` helper that calls `loadDeps` directly (not
`buildSession` — oneshot only needs `router`/`tierModel`/`ledger`, not the
full session graph). `contextTokens` for the `router.route({kind:"oneshot",
…})` call is a plain `chars/4` estimate computed directly on the input
text, not `ChatModel.estimateTokens` — the model isn't known until *after*
routing decides the tier, so there's no model-specific estimator available
yet at that point. R9.2 ("suggest prints the command alone on the final
line") is purely a system-prompt instruction to the model
(`oneshotSystem("suggest")` ends with it) — `runOneshot` does no
parsing/extraction of the model's output; the test proves the wiring
forwards a well-behaved model's text faithfully, not that ill-behaved
output gets corrected.

## print.ts (`runPrint`)

Signature is `runPrint(prompt, flags)` per design.md, where `flags` bundles
`{bus, controller, yolo?, write?}` — the bus/controller a real caller gets
from `wire.ts`'s `buildSession`. Testable with a fake controller whose
`submitPrompt` just scripts events onto a real `EventBus` (no engines
needed). Wired into `main.ts`'s default action for `--print <prompt>`
(task 13). Exit-code inference (R6.3) and the plain-mode
routing-announcement limitation are documented in `INTEGRATION-NOTES.md`
(2026-07-20, task 11).

## session.ts / wire.ts / main.ts's default action (task 13)

`createSessionController` takes an already-built `LoadedDeps` (never calls
`loadDeps` itself) — fully testable with local fakes for every engine
field it touches (`hooks`, `steering`, `agent`, `resolvePermission`);
`test/session.test.ts` never exercises the real dynamic-import path.
`wire.ts::attachLedgerWriter` is factored out of `buildSession` as its own
exported function for the same reason (R8.3's pairing/budget_alert logic
needs a fake `Ledger` + a real `EventBus`, not a real graph).

`main.ts`'s bare `cox` action now: `--print <prompt>` → `buildSession` +
`runPrint`; else, if `process.stdout.isTTY` is falsy → `CliExit(2, ...)`
(R6.1 read as: non-interactive stdout with nothing to print is a usage
error, not a silent hang) — note this means the bare-invocation exit code
in a piped/CI/test-runner context is **2**, not the NotWiredError's 1,
since the TTY check runs before `buildSession` is ever called; else →
`buildSession` + `startTui` + `waitUntilExit()`. `explain`/`suggest` go
through `loadDeps` + `runOneshot`. All of these currently surface
`NotWiredError` as a generic exit-1 runtime error until every lane lands —
verified with `--print` specifically in `test/args.test.ts` (bypasses the
TTY gate) rather than the bare/default path (which the TTY gate intercepts
first in a test/CI environment).

`LoadedDeps` grew two more extra properties beyond design.md's literal
`EngineDeps` (see `INTEGRATION-NOTES.md`, 2026-07-21): `resolvePermission`
(bridges `SessionController.resolvePermission` to whatever
`ToolContext.requestPermission` the real agent ends up awaiting — see the
dedicated note, this is the biggest cross-lane gap found so far) and
`tierModel` (exposes the internal per-tier failover `ChatModel` closure so
`oneshot.ts` doesn't have to reconstruct a fallback-less version from
`registry` alone).
