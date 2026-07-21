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

## Public API surface (index.ts)

`cachePct` is implemented in `format.ts` (used internally by the status
line, task 8) but is intentionally **not** re-exported from `index.ts` —
design.md's "Public API (exact)" block lists only `formatTokens`,
`formatUsd`, `formatDuration`, `budgetBar`. The stub's `PACKAGE` marker
export was removed once real exports landed (docs/03 DoD: "no extra
exports beyond what the design lists").
