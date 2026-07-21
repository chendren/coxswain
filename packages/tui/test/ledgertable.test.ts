import { describe, expect, it } from "vitest";
import type { LedgerSummary } from "@cox/core";
import { renderLedgerTable } from "../src/ledger-table";

// Synthetic LedgerSummary chosen so every derived number (shares, savings
// pct, cache savings) matches docs/05-ROUTING-AND-LEDGER.md §2's example
// numbers exactly (verified with a throwaway script before writing this
// test) — see packages/tui/NOTES.md for why the *shape* (no per-tier
// "calls" column; this file's own consistent column widths, not the doc's
// inconsistent hand-typed spacing) intentionally diverges from a literal
// byte-for-byte copy of that example.
const summary: LedgerSummary = {
  entries: 47,
  usage: { inputTokens: 891_000, outputTokens: 103_000, cacheReadTokens: 612_000, cacheWriteTokens: 0 },
  costUsd: 1.87,
  byTier: {
    scout: {
      usage: { inputTokens: 102_000, outputTokens: 11_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0.16,
    },
    builder: {
      usage: { inputTokens: 614_000, outputTokens: 78_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 1.32,
    },
    architect: {
      usage: { inputTokens: 175_000, outputTokens: 14_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0.39,
    },
  },
  byModel: {
    "anthropic/claude-sonnet-5": {
      usage: { inputTokens: 891_000, outputTokens: 103_000, cacheReadTokens: 612_000, cacheWriteTokens: 0 },
      costUsd: 1.87,
    },
  },
  baselineArchitectCostUsd: 8.28,
};

describe("R11.2: renderLedgerTable", () => {
  it("matches the docs/05 §2 table shape for a synthetic LedgerSummary (literal assertion)", () => {
    const table = renderLedgerTable(summary, "session ses_a1b2");
    const expected = [
      "session ses_a1b2 — 47 calls, 891k in (612k cached) / 103k out, $1.87",
      "  tier       in-tok  out-tok    cost  share",
      "  scout        102k      11k   $0.16     9%",
      "  builder      614k      78k   $1.32    71%",
      "  architect    175k      14k   $0.39    21%",
      "  ─ savings vs all-architect baseline: $6.41 (77% saved)",
      "  ─ cache: 612k reads saved ≈ $1.65 vs uncached",
    ].join("\n");
    expect(table).toBe(expected);
  });

  it("omits a tier's row entirely when it has no entries (Partial<Record<Tier,...>>)", () => {
    const scoutOnly: LedgerSummary = {
      entries: 5,
      usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0.05,
      byTier: {
        scout: {
          usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0.05,
        },
      },
      byModel: {},
      baselineArchitectCostUsd: 0.1,
    };
    const table = renderLedgerTable(scoutOnly, "session s1");
    const rowLines = table.split("\n").filter((l) => /^ {2}\S/.test(l) && !l.trimStart().startsWith("─"));
    // rowLines[0] is the header; only one tier data row should follow.
    expect(rowLines).toHaveLength(2);
    expect(rowLines[1]?.trimStart().startsWith("scout")).toBe(true);
    expect(table).not.toContain("builder");
  });

  it("handles a zero baseline/zero cost summary without NaN or Infinity", () => {
    const empty: LedgerSummary = {
      entries: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0,
      byTier: {},
      byModel: {},
      baselineArchitectCostUsd: 0,
    };
    const table = renderLedgerTable(empty, "session s2");
    expect(table).not.toMatch(/NaN|Infinity/);
    expect(table).toContain("0% saved");
  });

  it("cache savings is 0 when no model has cached reads", () => {
    const noCache: LedgerSummary = {
      entries: 1,
      usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0.01,
      byTier: {
        scout: {
          usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0.01,
        },
      },
      byModel: {
        "anthropic/claude-haiku-4-5": {
          usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0.01,
        },
      },
      baselineArchitectCostUsd: 0.05,
    };
    const table = renderLedgerTable(noCache, "session s3");
    expect(table).toContain("cache: 0 reads saved ≈ $0.000 vs uncached");
  });
});
