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

## 2026-07-20 — tui-cli (task 5, snapshot.ts)

- Blocked on: `SessionSnapshot.activeSpec` (core/types.ts) is
  `{ name: string; phase: SpecPhase; tasksDone: number; tasksTotal: number }`,
  but the only event that could populate it, `AgentEvent`'s `spec_event`
  variant, carries `{ specName, phase, status, taskId? }` — no task counts
  at all. `packages/cli/src/snapshot.ts`'s fold (used by both `cox replay`
  and, from task 13, the real session) cannot derive `tasksDone`/
  `tasksTotal` from the event stream.
- Workaround taken: `spec_event` handling in the fold tracks `name`/`phase`
  only and leaves `tasksDone`/`tasksTotal` at whatever was last known for
  that spec name (0/0 until something else sets them — nothing currently
  does). The status line's spec segment (task 8) will render `0/0` for a
  real spec-in-progress until this is resolved.
- Proposed contract change: either add `tasksDone`/`tasksTotal` (or the
  full `SpecTask[]`) to the `spec_event` payload, or have `cli` populate
  `activeSpec` by calling `SpecEngine.load(name)` directly (outside the
  event stream) whenever a `spec_event` arrives — the latter doesn't need a
  core change but does mean the snapshot fold can no longer be a pure
  function of the event stream alone for this one field.

## 2026-07-20 — tui-cli (task 6, RoutingAnnouncement label)

- Blocked on: `docs/specs/tui-cli/design.md`'s RoutingAnnouncement label
  rule needs `taskId` when `decision`'s `kind` is `spec-task-exec`
  (`spec task <taskId>`), but neither the `routing_decision` `AgentEvent`
  variant (`{decision, kind}`) nor `RoutingDecision` itself carries a
  `taskId` anywhere. (`RoutingInput.taskId` exists but is never surfaced
  onto the event bus.)
- Workaround taken: `packages/tui/src/app.tsx` remembers the most recent
  `spec_event`'s `taskId` and uses it as a fallback for the next
  `spec-task-exec` `routing_decision` (spec-engine's `runTask` sequence
  emits `spec_event task:in_progress` with a `taskId` immediately before
  the `agent.run(...)` call that produces the matching decision — see
  spec-engine/design.md's sequence diagram). Renders `spec task ?` if
  nothing has been seen yet. This is an inference from event *ordering*,
  not a documented guarantee — a concurrent/reordered stream would break
  it.
- Proposed contract change: add `taskId?: string` to the `routing_decision`
  `AgentEvent` variant (mirroring `RoutingInput.taskId`), so consumers
  don't have to infer it from a different event type.

## 2026-07-20 — tui-cli (task 11, print.ts / plain.ts)

- Blocked on: two gaps in the `AgentEvent` shape for R6.1/R6.3:
  1. `createPlainRenderer(write)`'s design.md-specified signature takes only
     `write: (line: string) => void` — no snapshot accessor — so the
     `routing_decision` block's "session $spent/$limit" segment cannot
     reflect live budget state in plain/`--print` mode the way `<App>`'s
     does via `getSnapshot()`. It always renders `spent $0`, no limit.
  2. `turn_done` carries `{usage, costUsd}` — no `stopReason` — but R6.3
     wants exit 0 specifically for `end_turn` and 1 for the *other* stop
     reasons that also route through `turn_done` (`max_tokens`, `refusal`,
     per agent-tools/design.md's loop algorithm). The only place a
     `stopReason` is observable at all is the `model_call_finished` event
     that always immediately precedes `turn_done` in the same loop step.
- Workaround taken: (1) documented as a known limitation, not fixable
  without changing the public signature. (2) `packages/cli/src/print.ts`
  remembers the most recent `model_call_finished.stopReason` and uses it
  when `turn_done` arrives. This works because of the algorithm's
  documented step ordering, not because of any event-level guarantee that
  pairs them — a `turn_done` with no preceding `model_call_finished` (not
  possible in the real loop, but not ruled out by the types) would exit 1.
- Proposed contract change: add `stopReason: StopReason` to the `turn_done`
  `AgentEvent` variant so consumers don't have to infer it from a
  different, only-conventionally-paired event.

## 2026-07-21 — tui-cli (task 13, requestPermission bridging)

- Blocked on: design.md's session.ts section says `resolvePermission(d)
  resolves the promise created by the wired ToolContext.requestPermission
  (cli supplies that function when constructing tools/agent...)` — but
  agent-tools/design.md's *published* `createAgentRunner` signature
  (`{router, modelForTier, tools, permissionMode, config, budgetState,
  preToolUse?, postToolUse?, now?}`) has no `requestPermission` parameter
  at all, and no other documented seam exists for `SessionController.
  resolvePermission` to reach whatever promise the real agent runner's
  internal `tool.permissionFor` / `ctx.requestPermission` gate is awaiting.
- Workaround taken: `packages/cli/src/deps.ts` adds `requestPermission`
  to its *local* `AgentModule` factory-shape type (the one it casts the
  dynamically-imported module through) and passes an implementation when
  calling `createAgentRunner(...)`: emits `permission_request` on the bus
  and parks the resolver; `LoadedDeps.resolvePermission` (also a new,
  documented-as-extra property) calls that parked resolver.
  `session.ts`'s `SessionController.resolvePermission` just forwards to
  it. If the real `@cox/agent` factory doesn't accept a
  `requestPermission` property, this is silently ignored (plain JS
  objects don't reject unknown properties) and interactive/print-mode
  permission resolution simply won't connect end-to-end until this gap is
  closed — everything *up to* that connection point (the bridge itself,
  `resolvePermission`'s forwarding, the emitted event) is implemented and
  unit-tested with local fakes (`test/session.test.ts`).
- Proposed contract change: add `requestPermission: (req: PermissionRequest)
  => Promise<PermissionDecision>` to `createAgentRunner`'s published deps
  in agent-tools/design.md, matching what tui-cli/design.md already
  assumes cli can supply.

## Contract changes
(none yet)
