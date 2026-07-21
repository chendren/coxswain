# @cox/tui — NOTES

Decisions and deviations for the integrator. Kept to ~1 page; grows as
later tasks land.

## Runtime JSX transform needs an explicit `React` import (task 4)

`tsconfig.json` sets `"jsx": "react-jsx"` per design.md, which is what
`tsc --noEmit` typechecks against — but the *runtime* transforms used by
`tsx` (dev/prod execution) and vitest's Vite/esbuild pipeline do not honor
that setting the same way; both emit the classic `React.createElement(...)`
pragma. Without an explicit `import React from "react"` in every `.tsx`
file, this fails at runtime with `ReferenceError: React is not defined`
(silently swallowed if it happens inside a `bus.emit` listener, since
core's `EventBus.emit` swallows listener exceptions — R1.6's guarantee is
real and it cost real debugging time here). Fix: every `.tsx` file imports
`React` explicitly even though only JSX syntax (not the `React` identifier)
is used directly. Harmless under either transform.

## Bus subscription must use `useLayoutEffect`, not `useEffect` (task 4)

`<App>` subscribes to the `EventBus` once on mount. With `useEffect`
(React's default, deferred/passive timing), the subscription is not active
by the time `startTui(opts)`/`render(...)` returns control to the caller —
confirmed by a debug repro where `bus.emit(...)` called immediately after
`render()` was silently dropped (zero listeners yet). This matters for
real callers: `cox replay` (task 5) and `--print` start emitting events
right after mounting. Switched to `useLayoutEffect`, which Ink's reconciler
runs synchronously as part of the same commit, so the subscription is live
before `render()`/`startTui()` returns. Tests still call `render()` then
emit — this now works without an artificial delay, but a small `flush()`
(`setTimeout(0)`) is used before asserting `lastFrame()`, since each
`setState` call inside the handler is its own commit (Ink does not appear
to batch updates from outside a React-managed event the way react-dom
does under React 18 automatic batching) and asserting immediately
sometimes reads a not-yet-committed frame.

## Tests need `FORCE_COLOR=1` (task 4)

Ink's `<Text color="red">` etc. go through chalk, which auto-detects color
support and disables ANSI codes when it doesn't believe it's writing to a
color-capable terminal — true of ink-testing-library's fake stdout. Without
forcing it, colored-text assertions see plain text with no escape codes.
`package.json`'s `test` script sets `FORCE_COLOR=1` (must be set before the
process starts — chalk's detection runs at import time, so setting
`process.env.FORCE_COLOR` inside a test file is too late).

## routing_decision has no taskId; spec-task label uses a heuristic (task 6)

design.md's RoutingAnnouncement label rule: first 40 chars of the turn's
`user_prompt`, or `spec task <taskId>` when `decision`'s kind is
`spec-task-exec`. But `AgentEvent`'s `routing_decision` variant is
`{decision, kind}` — no `taskId` field anywhere on it or on
`RoutingDecision`. Worked around by remembering the most recent
`spec_event`'s `taskId` (spec-engine's `runTask` flow emits `spec_event
task:in_progress` with a `taskId` immediately before the `agent.run(...)`
call that produces the matching `routing_decision` — see its sequence
diagram) and using that as a fallback; renders `spec task ?` if none seen
yet. Logged in INTEGRATION-NOTES.md — this is an inference from adjacent
event ordering, not a documented guarantee.

## docs/05's routing/ledger examples are illustrative prose, not literal output

Found three cases where hand-typed example numbers in
docs/05-ROUTING-AND-LEDGER.md don't reproduce under the *algorithms*
design.md itself specifies (which are what's actually implemented and
tested):
1. `budgetBar(0.42, 5.00, 10)` per design.md's formula
   (`round(width*spent/limit)`) is 1 filled block, not the doc's "██" (2).
2. The ledger table's header row and data rows use different implied
   column widths in the doc (verified by measuring exact character offsets
   with a small script) — there is no single consistent column algorithm
   that reproduces both.
3. The routing announcement's spec-task example shows
   `spec task 4 "wire divide guard"` — a quoted *task title* appended after
   the id — but no contract (RoutingDecision, the routing_decision
   AgentEvent, RoutingInput) carries a task title anywhere, so this can't
   be reproduced; implemented `spec task <taskId>` per design.md's simpler
   literal rule instead (see previous section).

Not treated as blockers: R1.3/R2.1's "byte-compatible" requirement is
matched to the *structure* design.md defines (prefixes, indentation,
spacing, glyphs, 10-char bar) using literal, self-consistent test
assertions — not a byte-for-byte replay of these particular illustrative
numbers.

## Public API surface (index.ts)

`cachePct` is implemented in `format.ts` (used internally by the status
line, task 8) but is intentionally **not** re-exported from `index.ts` —
design.md's "Public API (exact)" block lists only `formatTokens`,
`formatUsd`, `formatDuration`, `budgetBar`. The stub's `PACKAGE` marker
export was removed once real exports landed (docs/03 DoD: "no extra
exports beyond what the design lists").
