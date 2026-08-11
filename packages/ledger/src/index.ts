import { stat } from "node:fs/promises";
import type {
  CoxConfig,
  Ledger,
  LedgerEntry,
  LedgerQuery,
  LedgerSummary,
  ModelPricing,
} from "@cox/core";
import { appendEntry, readEntries } from "./jsonl";
import { summarize } from "./summary";
import { computeBudgetState } from "./budget";
export { savingsPercent } from "./savings.js";
export { formatUsd } from "./format.js";
export { formatSavingsLine } from "./savings-line.js";
export { utilizationPercent, utilizationLevel } from "./utilization.js";

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
  let cached:
    | { entries: LedgerEntry[]; skipped: number; mtimeMs: number; size: number }
    | null = null;

  async function readAll(): Promise<LedgerEntry[]> {
    // Use mtime+size as a cheap invalidation token to avoid re-reading the
    // file when multiple summary() / query() calls happen in the same tick
    // (e.g. budgetState does two summary() calls). Invalidated on record()
    // or when the file changes on disk.
    try {
      const s = await stat(deps.filePath);
      if (cached && cached.mtimeMs === s.mtimeMs && cached.size === s.size) {
        skippedLines = cached.skipped;
        return cached.entries;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      if (cached && cached.mtimeMs === 0 && cached.size === 0) {
        skippedLines = cached.skipped;
        return cached.entries;
      }
    }
    const { entries, skipped } = await readEntries(deps.filePath);
    skippedLines = skipped;
    try {
      const s2 = await stat(deps.filePath);
      cached = { entries, skipped, mtimeMs: s2.mtimeMs, size: s2.size };
    } catch {
      // file missing right after read -> treat as empty cache entry
      cached = { entries, skipped, mtimeMs: 0, size: 0 };
    }
    return entries;
  }

  function invalidateCache(): void {
    cached = null;
  }

  function architectPricing(): ModelPricing | null {
    const ref = deps.config.tiers.architect.primary;
    return deps.pricing(ref.provider, ref.model);
  }

  async function summary(q: LedgerQuery): Promise<LedgerSummary> {
    const all = await readAll();
    const filtered = all.filter((e) => matches(e, q));
    return summarize(filtered, architectPricing());
  }

  const ledger: LedgerWithDebug = {
    async record(entry: LedgerEntry) {
      await appendEntry(deps.filePath, entry);
      invalidateCache();
    },

    async query(q: LedgerQuery) {
      const all = await readAll();
      return all.filter((e) => matches(e, q));
    },

    summary,

    async budgetState(sessionId: string, specName?: string) {
      // Two summary calls max: session filter, plus a spec filter only when
      // both a specName and a specUsd limit are present (design.md).
      const sessionSummary = await summary({ sessionId });
      let specSummary: LedgerSummary | null = null;
      if (specName !== undefined && deps.config.budgets.specUsd !== undefined) {
        specSummary = await summary({ specName });
      }
      return computeBudgetState(sessionSummary, specSummary, deps.config.budgets);
    },

    get lastReadSkippedLines() {
      return skippedLines;
    },
  };

  return ledger;
}
