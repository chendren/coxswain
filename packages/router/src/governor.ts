import type {
  BudgetLevel,
  BudgetState,
  CoxConfig,
  ModelRef,
  RoutingDecision,
  TaskKind,
  Tier,
} from "@cox/core";

export interface GovernorInput {
  tier: Tier;
  model: ModelRef;
  reasons: string[];
  estimate: RoutingDecision["estimate"];
  /** Carried through untouched — set by the escalation ladder (R4.*). */
  escalatedFrom?: Tier;
}

/** floor(100 * max utilization across the configured limits in `state`). */
function pctOf(state: BudgetState): number {
  let util = 0;
  if (state.limitUsd !== undefined && state.limitUsd > 0) {
    util = Math.max(util, state.spentUsd / state.limitUsd);
  }
  if (state.limitTokens !== undefined && state.limitTokens > 0) {
    util = Math.max(util, state.spentTokens / state.limitTokens);
  }
  return Math.floor(100 * util);
}

/**
 * Governs a resolved decision against the current BudgetState (R3.1-R3.6).
 * Never raises a tier (R3.6): the only mutation is architect -> builder,
 * which by construction also satisfies R3.3 (spec-requirements/spec-design
 * can never end up below builder; scout/builder are never touched).
 */
export function applyGovernor(
  input: GovernorInput,
  state: BudgetState,
  config: CoxConfig,
  _kind: TaskKind,
): RoutingDecision {
  const reasons = [...input.reasons];
  let tier = input.tier;
  let degradedByBudget = false;

  // R3.5: a projected overrun (spent + this call's estimate) against the
  // active scope's USD limit counts as exceeded even if the ledger's own
  // (backward-looking) level is only "warn" or "ok".
  let effectiveLevel: BudgetLevel = state.level;
  if (
    effectiveLevel !== "exceeded" &&
    state.limitUsd !== undefined &&
    typeof input.estimate.estCostUsd === "number"
  ) {
    const projected = state.spentUsd + input.estimate.estCostUsd;
    if (projected >= state.limitUsd) {
      effectiveLevel = "exceeded";
    }
  }

  // R3.2: warn touches architect only.
  if (effectiveLevel === "warn" && tier === "architect") {
    tier = "builder";
    degradedByBudget = true;
    reasons.push(`budget ${pctOf(state)}% — degraded architect→builder`);
  }

  // R3.4: exceeded (real or projected) blocks or annotates, independent of tier.
  if (effectiveLevel === "exceeded") {
    if (config.budgets.hardStop) {
      const scope = state.scope ?? "session";
      const spent = state.spentUsd.toFixed(2);
      const limit = (state.limitUsd ?? 0).toFixed(2);
      throw Object.assign(
        new Error(
          `budget exceeded: ${scope} $${spent}/$${limit} — /budget extend to continue`,
        ),
        { code: "budget_exceeded" as const },
      );
    }
    reasons.push("budget exceeded — hardStop off");
  }

  const model = tier === input.tier ? input.model : config.tiers[tier].primary;

  const decision: RoutingDecision = {
    tier,
    model,
    reasons,
    estimate: input.estimate,
  };
  if (degradedByBudget) decision.degradedByBudget = true;
  if (input.escalatedFrom) decision.escalatedFrom = input.escalatedFrom;
  return decision;
}
