import type {
  CoxConfig,
  Ledger,
  LedgerEntry,
  LedgerQuery,
  LedgerSummary,
  ModelPricing,
} from "@cox/core";
import { ZERO_USAGE } from "@cox/core";
import { appendEntry, readEntries } from "./jsonl";

export interface CreateLedgerDeps {
  /** Absolute path to the JSONL ledger file, e.g. `<cwd>/.cox/ledger.jsonl`. */
  filePath: string;
  config: CoxConfig;
  /** Injected for test override; production wiring passes `pricingFor`. */
  pricing: (provider: string, model: string) => ModelPricing | null;
  /** ISO-8601 UTC clock, injected for determinism. */
  now: () => string;
}

/**
 * `Ledger` plus a non-contract debug property. `lastReadSkippedLines`
 * reflects the corrupt-line count from the most recent read (query/summary/
 * budgetState) — exposed for tests only; nothing outside tests may rely on
 * it (see packages/ledger/NOTES.md).
 */
export interface LedgerWithDebug extends Ledger {
  readonly lastReadSkippedLines: number;
}

export function createLedger(deps: CreateLedgerDeps): LedgerWithDebug {
  let skippedLines = 0;

  async function readAll(): Promise<LedgerEntry[]> {
    const { entries, skipped } = await readEntries(deps.filePath);
    skippedLines = skipped;
    return entries;
  }

  const ledger: LedgerWithDebug = {
    async record(entry: LedgerEntry) {
      await appendEntry(deps.filePath, entry);
    },

    // TODO(task 2, R6.3): filter by sessionId/specName/tier/since.
    async query(_q: LedgerQuery) {
      return readAll();
    },

    // TODO(task 3/4, R7.1/R7.2): totals, byTier/byModel, baseline calc.
    async summary(_q: LedgerQuery): Promise<LedgerSummary> {
      return {
        entries: 0,
        usage: ZERO_USAGE,
        costUsd: 0,
        byTier: {},
        byModel: {},
        baselineArchitectCostUsd: 0,
      };
    },

    // TODO(task 5, R8.1-R8.3): scopes + levels.
    async budgetState(_sessionId: string, _specName?: string) {
      return { level: "ok" as const, spentUsd: 0, spentTokens: 0 };
    },

    get lastReadSkippedLines() {
      return skippedLines;
    },
  };

  return ledger;
}
