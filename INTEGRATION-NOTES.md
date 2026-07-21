# Integration Notes (append-only)

Builder agents: when a `@cox/core` contract blocks you, append a dated section
here instead of editing core. Format:

```
## <date> — <workstream>
- Blocked on: <type/interface + what's missing or wrong>
- Workaround taken: <local decision>
- Proposed contract change: <one line>
```

The integrator (M2) resolves these and logs any core changes under
"Contract changes" below.

## 2026-07-20 — tui-cli (task 2, deps.ts)

- Blocked on: tui-cli/design.md's own "wire.ts order" section sketches
  factory calls that do not match the actual factory signatures published in
  each lane's own design.md:
  - `createLedger({ dir, budgets, now })` (tui-cli sketch) vs the real
    `createLedger({ filePath, config, pricing, now })` (router-ledger/design.md).
    There is no separate `budgets` param — budgets live on `config.budgets`.
  - `createRouter({ ..., scoutModel, ... })` vs the real param name
    `classifyModel` (router-ledger/design.md).
  - `createBuiltinTools({ cwd, permissions })` vs the real
    `createBuiltinTools({ cwd, config })` (agent-tools/design.md).
  - `createSteeringStore(cfg.steering)` (positional, sub-config) vs the real
    `createSteeringStore({ config })` (steering-hooks/design.md, whole config).
  - `createHookEngine({ cwd, enabled })` vs the real
    `createHookEngine({ cwd, config, env? })` (steering-hooks/design.md).
  - Biggest one: `createAgentRunner({ route, reconsider, modelForTier, tools,
    preToolUse, postToolUse })` (tui-cli sketch, a `route` closure) vs the
    real `createAgentRunner({ router, modelForTier, tools, permissionMode,
    config, budgetState, preToolUse?, postToolUse?, now? })`
    (agent-tools/design.md) — it takes the whole `Router` interface, not an
    injectable `route` closure. There is no seam to fire PreModelCall hooks
    "underneath" a plain `route` function.
- Workaround taken (per tui-cli/design.md's own "adapt only in wire.ts,
  record any mismatch" allowance): `packages/cli/src/deps.ts` calls every
  factory with the *real* signature above. The PreModelCall-hook-firing +
  tierOverride-merge step is implemented as a `Router`-shaped decorator
  (`routerWithHooks`) wrapping the real router, passed as `deps.router` to
  `createAgentRunner` — `route()` fires the hook and merges
  `hookOverrideTier`, `reconsider()` passes through unchanged. PreModelCall
  *blocking* is intentionally not implemented: docs/01's dataflow diagram
  only documents "[may override tier]" for PreModelCall (unlike
  UserPromptSubmit's "[may block]"), and `Router.route`'s return type
  (`Promise<RoutingDecision>`) has no channel to signal cancellation anyway.
- Also: because `EngineDeps.agent`/`.specs` must be fully-constructed
  instances, `deps.ts::loadDeps` ended up doing the *entire* engine-graph
  construction (registry → ledger → router → tools/steering/hooks → agent →
  specs), not just "dynamic import + runtime check". `wire.ts` (task 13)
  only adds the session-level pieces design.md assigns to its step 8
  (snapshot store, ledger-writer subscriber) plus `SessionController`
  construction. Documented in `packages/cli/NOTES.md`.
- Separate contract gap (not a mismatch, an omission): `AgentRunner`'s
  `budgetState: () => Promise<BudgetState>` (agent-tools/design.md) is a
  zero-arg closure bound once at `createAgentRunner(...)` time, but
  `Ledger.budgetState(sessionId, specName?)` is meant to be checked per
  scope. `spec-engine/design.md` has the engine build `AgentTask`s with
  `sessionId: "spec:<name>"`, and reuses the *same* injected `runner` for
  every spec — so there is no way for one fixed `budgetState` closure to
  enforce both the interactive session's budget AND each spec's `specUsd`
  budget through this seam. `deps.ts` binds `budgetState` to the
  interactive session id only (`ledger.budgetState(sessionId)`); spec-task
  runs share the same agent instance and therefore the same (session-level
  only) budget check — `specUsd` is not enforced for spec-task-exec calls
  in the current wiring. Flagging for the integrator; no local workaround
  changes the interface shape enough to fix this without picking a lane.
- Proposed contract change: give `AgentRunner.run`'s budget check a way to
  read `task.specName`/`task.sessionId` (e.g. `budgetState:
  (task: AgentTask) => Promise<BudgetState>`) instead of a zero-arg closure;
  and/or add a `route` closure alternative to `createAgentRunner`'s `router`
  param so hook-wrapping doesn't require reimplementing `Router.reconsider`
  as a pass-through.

## Contract changes
(none yet)
