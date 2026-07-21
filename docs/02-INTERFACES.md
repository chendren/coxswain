# Interfaces — Reading Guide

**The source of truth is code, not this doc:** [`packages/core/src/types.ts`](../packages/core/src/types.ts)
(plus `events.ts`, `config.ts`, `pricing.ts`). It typechecks and its tests
pass. This doc is the guided tour — who implements what, who consumes what.

| Contract (types.ts) | Implemented by | Consumed by |
|---|---|---|
| `ProviderAdapter`, `ChatModel`, `ProviderRegistry` | providers | router (estimates), agent (streaming), cli |
| `Router` (`route`, `reconsider`) | router | cli (per turn), agent (mid-task escalation) |
| `Ledger`, `LedgerSummary`, `BudgetState` | ledger | cli (records + reports), router (budget degradation), tui (status line) |
| `AgentRunner`, `AgentTask`, `AgentRunResult` | agent | cli, spec, hooks |
| `Tool`, `ToolRegistry`, `PermissionRequest` | tools | agent (executes), cli (registry wiring) |
| `SpecEngine`, `SpecState`, `SpecTask` | spec | cli |
| `SteeringStore`, `SteeringDoc`, `SteeringSelection` | steering | cli (prompt assembly), tui (/context) |
| `HookEngine`, `CommandHookConfig`, `AgentHookConfig` | hooks | cli (fires lifecycle events), agent (PreToolUse/PostToolUse via callback wiring in cli) |
| `AgentEvent`, `EventBus` | core (bus), everyone emits | tui (renders), cli (ledger writes) |
| `SessionController`, `SessionSnapshot` | cli | tui |
| `CoxConfig`, `loadConfig` | core | everyone |
| `PRICING`, `pricingFor`, `computeCostUsd` | core | ledger, router, providers |

## Contract rules

1. **Never edit `@cox/core`.** Blocked by a contract? Append to
   `/INTEGRATION-NOTES.md` (what you needed, what you did instead) and keep
   moving with a local workaround that doesn't leak across the boundary.
2. **Implement interfaces exactly** — same names, same signatures. Your
   package's `src/index.ts` must export a factory, e.g.
   `createRouter(deps): Router`, `createAnthropicAdapter(cfg): ProviderAdapter`.
   Factories take plain dependency objects; no DI framework.
3. **Emit events, don't print.** Only the TUI writes to stdout in interactive
   mode. Engines communicate exclusively through `AgentEvent`s and return
   values.
4. **Errors:** throw `Error` with actionable messages; the agent loop and cli
   convert to `{type:"error"}` events. Never `process.exit()` outside cli.

## Cross-cutting behaviors every implementer must honor

- **AbortSignal:** `ChatModel.stream` and `AgentRunner.run` take signals;
  Esc in the TUI aborts the in-flight call. Check `signal.aborted` between
  loop iterations and pass signals through to fetch.
- **Cost math:** always via `computeCostUsd` + `pricingFor` from core.
  Unknown model → `costUsd: null`, tokens still recorded.
- **Tier overrides precedence** (router must implement exactly this order):
  1. `userOverrideTier` (highest)
  2. `hookOverrideTier`
  3. budget degradation (may cap the tier chosen below)
  4. spec-phase / task-kind policy table
  5. scout classification
  6. `routing.defaultTier` (fallback)
- **Every `RoutingDecision.reasons[]` entry is user-facing prose.** Write
  them like `"task-type=tests"`, `"complexity=4 from spec task"`,
  `"budget 92% — degraded architect→builder"`. The TUI prints them verbatim.
