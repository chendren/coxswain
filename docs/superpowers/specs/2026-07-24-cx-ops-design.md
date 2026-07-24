# cx-ops: the CXOS ops-console engine

Date: 2026-07-24
Status: Approved (design), pending implementation plan

## Summary

`@cox/cx-ops` is the fourth and final planned CXOS package. Unlike
`cx-artifacts`/`cx-local`/`cx-aws` (each a `CxTargetAdapter`
implementation), `cx-ops` is an orchestration layer that operates
already-constructed adapters across all three targets for a spec. Design-
time investigation found two real gaps in the originally-envisioned
scope: `@cox/spec`'s engine has no API to append a single new task to an
approved spec (only bulk-regenerate or run-one-pending), so the watcher-
proposes-a-task mechanism the CXOS design sketched has no real backing
today; and no part of the system tracks deployment history, so
`rollback` (in the original command reference) has nothing to roll back
to. Given both, `cx-ops` v1 is scoped to **commands-only**: a deterministic
ops console with no watcher daemon, no autonomous mode, no task
proposal, and no `rollback`.

## Goals

- Implement a thin, capability-aware command layer over
  `CxTargetAdapter` instances: `getStatus`, `runSimulate`,
  `runTeardown`.
- Implement `generateReport()` — the one command with real value beyond a
  direct adapter call: aggregates `status()` (and `simulate()`, if
  supported and requested) across all targets for a spec, then produces
  a scout-tier natural-language summary.
- Stay fully offline-testable against `@cox/cx-core`'s
  `createMockTargetAdapter()` — no dependency on the sibling adapter
  packages at all.

## Non-goals (v1)

- No watcher daemon, no `metricThreshold`/`opsEvent` hook triggers, no
  `console`/`autonomous` ops modes — all of these depended on a
  task-proposal mechanism `@cox/spec` doesn't support today. Deferred
  until `@cox/spec` gains a real `appendTask()`-class capability, which
  is out of scope for a `cx-*` package to add unilaterally.
- No `rollback` — nothing tracks deployment history to roll back to.
- No real adapter construction or `deps.generate` wiring — same
  deferral every other CXOS package makes: that's `@cox/cli`'s job (a
  future cli-integration lane).
- No budget-governor integration for v1 — with only one scout-tier call
  per `generateReport()` invocation and no watcher loop accumulating
  spend, the existing per-call ledger already covers it; a dedicated
  `cxOpsUsd` budget check would be premature for a single command.

## Architecture

```
packages/cx-ops/
  src/
    status.ts   getStatus / runSimulate / runTeardown
    report.ts   generateReport (cross-target aggregation + summary)
    index.ts
```

Imports only `@cox/core` and `@cox/cx-core` — same import law as the
three adapter packages, even though `cx-ops` isn't itself an adapter.
Adapters are injected as already-constructed instances
(`Record<CxTargetId, CxTargetAdapter>`), never imported directly from
`@cox/cx-artifacts`/`@cox/cx-local`/`@cox/cx-aws` — the composition root
wires real adapters in; tests use `createMockTargetAdapter()`.

### `status.ts`

- **`getStatus(adapter, dep)`** — direct passthrough to `adapter.status(dep)`.
- **`runSimulate(adapter, dep, traffic)`** — checks
  `adapter.capabilities().includes("simulate")` first; throws
  `createCxAdapterError({ phase: "simulate", targetId: adapter.id,
  retryable: false })` naming the target if unsupported, giving a
  clearer orchestration-level message than letting `cx-artifacts`'s or
  `cx-aws`'s own internal throw surface confusingly through this layer.
  Otherwise delegates to `adapter.simulate(dep, traffic)`.
- **`runTeardown(adapter, dep)`** — direct passthrough to
  `adapter.teardown(dep)`.

### `report.ts`

**`generateReport(deps, specName, deployments)`** where `deployments` is
`{ targetId: CxTargetId; adapter: CxTargetAdapter; dep: CxDeployment;
traffic?: CxTrafficProfile }[]`. For each entry: calls `status()`, and
`simulate()` too if the adapter supports it and `traffic` was provided —
**both calls are caught individually**, so one target's failure is
recorded as an error note in that target's report entry rather than
aborting the whole report (the point of a cross-target report is telling
you what's up everywhere, including what's down). Once all targets are
processed, one `deps.generate()` call at **scout** tier (cheap —
summarization, not design work) produces a natural-language rollup.
Returns a package-local `CxOpsReport` type:

```ts
interface CxOpsReportEntry {
  targetId: CxTargetId;
  health?: CxHealth;
  simReport?: CxSimReport;
  error?: string;
}

interface CxOpsReport {
  specName: string;
  generatedAt: string;
  targets: CxOpsReportEntry[];
  summary: string;
}
```

No `@cox/cx-core` changes needed — nothing downstream consumes this
type, so it stays local to `cx-ops`.

## Error handling

- `runSimulate()`'s capability check → `CxAdapterError(phase: "simulate",
  retryable: false)`, naming the target, before any adapter call.
- `generateReport()` catches `status()`/`simulate()` failures per-target
  and records them as `error: string` on that target's entry — never
  propagates them to abort the whole report.
- `deps.generate()` failures during the summary call propagate
  unwrapped, same as every other CXOS package.

## Testing (offline)

- `test/status.test.ts`: a mock adapter (via `createMockTargetAdapter()`)
  with `capabilities` omitting `"simulate"` → `runSimulate()` throws
  before calling anything; one including it → delegates and returns the
  real result. `getStatus`/`runTeardown` round-trip through thin
  wrappers.
- `test/report.test.ts`: three mock adapters (healthy; one whose
  `status()` rejects; one supporting `simulate()` with a traffic profile
  supplied) — asserts `generateReport()` aggregates all three (including
  the failed one, with its error captured), calls `simulate()` only for
  the target that supports it and has traffic supplied, and calls
  `deps.generate` exactly once at `"scout"` tier for the summary.
