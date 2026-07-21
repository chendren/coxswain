import type { BudgetConfig, BudgetLevel, BudgetState, LedgerSummary } from "@cox/core";

function tokensOf(s: LedgerSummary): number {
  return (
    s.usage.inputTokens +
    s.usage.outputTokens +
    s.usage.cacheReadTokens +
    s.usage.cacheWriteTokens
  );
}

/** spent / limit, guarding the degenerate zero-limit case. */
function ratio(spent: number, limit: number): number {
  if (limit <= 0) return spent > 0 ? Infinity : 0;
  return spent / limit;
}

interface ScopeInfo {
  scope: "session" | "spec";
  spentUsd: number;
  spentTokens: number;
  limitUsd?: number;
  limitTokens?: number;
  utilization: number;
}

/**
 * Combines a session-scope summary and an optional spec-scope summary into
 * one BudgetState (R8.1–R8.3). `specSummary` should be pre-filtered by
 * specName only (not also sessionId) — a spec's budget spans sessions.
 */
export function computeBudgetState(
  sessionSummary: LedgerSummary,
  specSummary: LedgerSummary | null,
  budgets: BudgetConfig,
): BudgetState {
  const scopes: ScopeInfo[] = [];

  if (budgets.sessionUsd !== undefined || budgets.sessionTokens !== undefined) {
    const spentUsd = sessionSummary.costUsd;
    const spentTokens = tokensOf(sessionSummary);
    let utilization = 0;
    if (budgets.sessionUsd !== undefined) {
      utilization = Math.max(utilization, ratio(spentUsd, budgets.sessionUsd));
    }
    if (budgets.sessionTokens !== undefined) {
      utilization = Math.max(utilization, ratio(spentTokens, budgets.sessionTokens));
    }
    scopes.push({
      scope: "session",
      spentUsd,
      spentTokens,
      limitUsd: budgets.sessionUsd,
      limitTokens: budgets.sessionTokens,
      utilization,
    });
  }

  if (specSummary && budgets.specUsd !== undefined) {
    const spentUsd = specSummary.costUsd;
    scopes.push({
      scope: "spec",
      spentUsd,
      spentTokens: tokensOf(specSummary),
      limitUsd: budgets.specUsd,
      utilization: ratio(spentUsd, budgets.specUsd),
    });
  }

  if (scopes.length === 0) {
    // R8.3: no limits configured — spent figures populated, limits absent.
    return {
      level: "ok",
      spentUsd: sessionSummary.costUsd,
      spentTokens: tokensOf(sessionSummary),
    };
  }

  let worst = scopes[0]!;
  for (const s of scopes) {
    if (s.utilization > worst.utilization) worst = s;
  }

  const level: BudgetLevel =
    worst.utilization >= 1 ? "exceeded" : worst.utilization >= budgets.warnAt ? "warn" : "ok";

  const state: BudgetState = {
    level,
    spentUsd: worst.spentUsd,
    spentTokens: worst.spentTokens,
    scope: worst.scope,
  };
  if (worst.limitUsd !== undefined) state.limitUsd = worst.limitUsd;
  if (worst.limitTokens !== undefined) state.limitTokens = worst.limitTokens;
  return state;
}
