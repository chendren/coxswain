/** Local stub Ledger for router tests — a controllable budgetState + a spy on record(). */
import { ZERO_USAGE } from "@cox/core";
import type { BudgetState, Ledger, LedgerEntry, LedgerQuery, LedgerSummary } from "@cox/core";

export interface StubLedgerOptions {
  /** Fixed state, or a function for scenarios that need per-call variation. */
  budgetState?: BudgetState | ((sessionId: string, specName?: string) => BudgetState);
  summary?: LedgerSummary;
}

export interface StubLedger extends Ledger {
  /** Every entry passed to record(), in call order — inspect in tests. */
  readonly recorded: LedgerEntry[];
}

const OK_STATE: BudgetState = { level: "ok", spentUsd: 0, spentTokens: 0 };

const EMPTY_SUMMARY: LedgerSummary = {
  entries: 0,
  usage: ZERO_USAGE,
  costUsd: 0,
  byTier: {},
  byModel: {},
  baselineArchitectCostUsd: 0,
};

export function createStubLedger(opts: StubLedgerOptions = {}): StubLedger {
  const recorded: LedgerEntry[] = [];
  const state = opts.budgetState ?? OK_STATE;
  const summary = opts.summary ?? EMPTY_SUMMARY;

  return {
    recorded,
    async record(entry: LedgerEntry) {
      recorded.push(entry);
    },
    async query(_q: LedgerQuery) {
      return recorded;
    },
    async summary(_q: LedgerQuery) {
      return summary;
    },
    async budgetState(sessionId: string, specName?: string) {
      return typeof state === "function" ? state(sessionId, specName) : state;
    },
  };
}
