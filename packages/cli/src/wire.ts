/**
 * wire.ts — buildSession(cfg, cwd, bus): the composition root's top-level
 * entry point (R8.1). Calls loadDeps (the only place that dynamic-imports
 * engine packages — see deps.ts) then adds the session-level pieces
 * design.md's step 8 assigns here: the snapshot store subscriber and the
 * ledger-writer subscriber (R8.3), plus SessionController construction.
 *
 * `attachLedgerWriter` is factored out and exported so it's testable with
 * a local fake Ledger + a real EventBus, without going through
 * `buildSession`'s `loadDeps` call (which throws NotWiredError against the
 * current stub packages — see deps.test.ts).
 *
 * Signature extends design.md's `buildSession(cfg, cwd, bus)` sketch with
 * an optional 4th `cliFlagTier` param (the -m/--model startup flag) —
 * design.md's own session.ts section computes
 * `userOverrideTier: modelOverride ?? cliFlagTier`, but `cliFlagTier` has
 * to come from somewhere, and main.ts's parsed argv is the only source;
 * there is no config-schema field for it (it's inherently a per-invocation
 * concept, not a persisted setting).
 */
import type {
  BudgetConfig,
  CoxConfig,
  EventBus,
  Ledger,
  LedgerEntry,
  RoutingDecision,
  SessionController,
  SessionSnapshot,
  TaskKind,
  Tier,
} from "@cox/core";
import { loadDeps } from "./deps";
import { createSnapshotStore } from "./snapshot";
import { createSessionController } from "./session";

export interface SessionHandle {
  controller: SessionController;
  getSnapshot: () => SessionSnapshot;
  /** Retained mutable object — /budget extend (task 14) mutates it in place. */
  budgets: BudgetConfig;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * R8.3: pairs the most recent `routing_decision` with each
 * `model_call_finished` into one `LedgerEntry`, writes it, then emits
 * `budget_alert` when the resulting level != "ok". Safe under the
 * documented v1 assumption that a session is strictly sequential (no
 * parallel subagents) — a second `routing_decision` always arrives before
 * the `model_call_finished` it caused, so `lastDecision` is never stale
 * across two different decisions. Returns an unsubscribe function.
 */
export function attachLedgerWriter(opts: {
  bus: EventBus;
  ledger: Ledger;
  sessionId: string;
}): () => void {
  const { bus, ledger, sessionId } = opts;
  let lastDecision: { decision: RoutingDecision; kind: TaskKind } | null = null;
  return bus.subscribe((e) => {
    if (e.type === "routing_decision") {
      lastDecision = { decision: e.decision, kind: e.kind };
      return;
    }
    if (e.type !== "model_call_finished" || !lastDecision) return;
    const { decision, kind } = lastDecision;
    const entry: LedgerEntry = {
      ts: new Date().toISOString(),
      sessionId,
      kind,
      tier: decision.tier,
      model: e.model,
      usage: e.usage,
      costUsd: e.costUsd,
      routingReasons: decision.reasons,
      escalatedFrom: decision.escalatedFrom,
      durationMs: e.durationMs,
    };
    ledger
      .record(entry)
      .then(() => ledger.budgetState(sessionId))
      .then((state) => {
        if (state.level !== "ok") bus.emit({ type: "budget_alert", state });
      })
      .catch((err: unknown) => {
        bus.emit({ type: "error", message: errorMessage(err) });
      });
  });
}

export async function buildSession(
  cfg: CoxConfig,
  cwd: string,
  bus: EventBus,
  cliFlagTier?: Tier,
): Promise<SessionHandle> {
  const deps = await loadDeps(cfg, cwd, bus);
  const budgets: BudgetConfig = cfg.budgets;

  const fold = createSnapshotStore({ sessionId: deps.sessionId, budgets, ledger: deps.ledger });
  bus.subscribe(fold.onEvent);
  attachLedgerWriter({ bus, ledger: deps.ledger, sessionId: deps.sessionId });

  const controller = createSessionController({
    deps,
    bus,
    cfg,
    cwd,
    snapshot: fold,
    budgets,
    cliFlagTier,
  });

  return { controller, getSnapshot: fold.get, budgets };
}
