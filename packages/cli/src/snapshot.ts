/**
 * createSnapshotStore — folds the AgentEvent stream into a SessionSnapshot
 * (docs/specs/tui-cli/design.md). Consumed both by `cox replay` (task 5,
 * no ledger) and by wire.ts's real session (task 13, alongside the
 * ledger-writer subscriber).
 */
import {
  addUsage,
  ZERO_USAGE,
  type AgentEvent,
  type BudgetConfig,
  type BudgetLevel,
  type Ledger,
  type ModelRef,
  type SessionSnapshot,
  type Tier,
  type TokenUsage,
} from "@cox/core";

export interface SnapshotStore {
  onEvent(e: AgentEvent): void;
  get(): SessionSnapshot;
}

export interface SnapshotStoreOpts {
  sessionId: string;
  budgets: BudgetConfig;
  /**
   * Accepted for interface completeness (docs/specs/tui-cli/design.md's
   * exact factory signature) but not queried here: `get()` must stay
   * synchronous (TuiOptions.getSnapshot is `() => SessionSnapshot`), so the
   * async `Ledger.budgetState` can't be called from it. Budget numbers
   * instead come from `budget_alert` events (the ledger-writer subscriber
   * already computes and emits those) plus this store's own running totals.
   */
  ledger?: Ledger;
}

export function createSnapshotStore(opts: SnapshotStoreOpts): SnapshotStore {
  let currentTier: Tier = "builder";
  let currentModel: ModelRef | null = null;
  let usage: TokenUsage = ZERO_USAGE;
  let costUsd = 0;
  let budgetLevel: BudgetLevel = "ok";
  let budgetScope: string | undefined;
  // Mirrors `usage`/`costUsd` for the session-wide budget display. A
  // budget_alert's own numbers (ledger-authoritative) override these when
  // one arrives — see the case below for why this fold can under-count
  // slightly on its own (classify calls never emit model_call_finished).
  let budgetSpentUsd = 0;
  let budgetSpentTokens = 0;
  let activeSpec: SessionSnapshot["activeSpec"];

  function onEvent(e: AgentEvent): void {
    switch (e.type) {
      case "model_call_started": {
        currentTier = e.tier;
        currentModel = e.model;
        break;
      }
      case "model_call_finished": {
        usage = addUsage(usage, e.usage);
        costUsd += e.costUsd ?? 0;
        budgetSpentUsd += e.costUsd ?? 0;
        budgetSpentTokens += e.usage.inputTokens + e.usage.outputTokens;
        break;
      }
      case "budget_alert": {
        budgetLevel = e.state.level;
        budgetScope = e.state.scope;
        // Router-ledger's classify calls are ledgered directly by the
        // router (docs/specs/router-ledger/design.md), bypassing the
        // model_call_finished path this fold otherwise relies on — so once
        // a real BudgetState arrives, trust it over our own running total.
        budgetSpentUsd = e.state.spentUsd;
        budgetSpentTokens = e.state.spentTokens;
        break;
      }
      case "spec_event": {
        // AgentEvent's spec_event carries no tasksDone/tasksTotal (see
        // INTEGRATION-NOTES.md) — best effort: track name/phase, preserve
        // whatever counts we already had for the same spec, else 0/0.
        const carried =
          activeSpec && activeSpec.name === e.specName
            ? { tasksDone: activeSpec.tasksDone, tasksTotal: activeSpec.tasksTotal }
            : { tasksDone: 0, tasksTotal: 0 };
        activeSpec = { name: e.specName, phase: e.phase, ...carried };
        break;
      }
      default:
        break;
    }
  }

  function get(): SessionSnapshot {
    return {
      sessionId: opts.sessionId,
      currentTier,
      currentModel,
      usage,
      costUsd,
      budget: {
        level: budgetLevel,
        spentUsd: budgetSpentUsd,
        spentTokens: budgetSpentTokens,
        limitUsd: opts.budgets.sessionUsd,
        limitTokens: opts.budgets.sessionTokens,
        scope: budgetScope,
      },
      activeSpec,
    };
  }

  return { onEvent, get };
}
