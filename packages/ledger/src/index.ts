import type {
  CoxConfig,
  Ledger,
  LedgerEntry,
  LedgerQuery,
  ModelPricing,
} from "@cox/core";
import { appendEntry, readEntries } from "./jsonl";
import { summarize } from "./summary";

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

/** R6.3: sessionId/specName/tier exact match; since = ISO string >= compare. */
function matches(entry: LedgerEntry, q: LedgerQuery): boolean {
  if (q.sessionId !== undefined && entry.sessionId !== q.sessionId) return false;
  if (q.specName !== undefined && entry.specName !== q.specName) return false;
  if (q.tier !== undefined && entry.tier !== q.tier) return false;
  if (q.since !== undefined && !(entry.ts >= q.since)) return false;
  return true;
}

export function createLedger(deps: CreateLedgerDeps): LedgerWithDebug {
  let skippedLines = 0;

  async function readAll(): Promise<LedgerEntry[]> {
    const { entries, skipped } = await readEntries(deps.filePath);
    skippedLines = skipped;
    return entries;
  }

  function architectPricing(): ModelPricing | null {
    const ref = deps.config.tiers.architect.primary;
    return deps.pricing(ref.provider, ref.model);
  }

  const ledger: LedgerWithDebug = {
    async record(entry: LedgerEntry) {
      await appendEntry(deps.filePath, entry);
    },

    async query(q: LedgerQuery) {
      const all = await readAll();
      return all.filter((e) => matches(e, q));
    },

    async summary(q: LedgerQuery) {
      const all = await readAll();
      const filtered = all.filter((e) => matches(e, q));
      return summarize(filtered, architectPricing());
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
