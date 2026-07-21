import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configSchema, pricingFor, type LedgerEntry } from "@cox/core";
import { createLedger } from "../src/index";

const FIXED_NOW = "2026-07-20T12:00:00.000Z";

function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    ts: FIXED_NOW,
    sessionId: "s1",
    kind: "chat",
    tier: "scout",
    model: { provider: "anthropic", model: "claude-haiku-4-5" },
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.001,
    routingReasons: ["policy chat"],
    durationMs: 100,
    ...overrides,
  };
}

// 6 entries spanning 3 tiers (scout x3, builder x2, architect x1) and 3
// models (haiku, sonnet, opus). costUsd chosen for easy hand-verification.
const FIXTURE: LedgerEntry[] = [
  makeEntry({
    sessionId: "s1",
    tier: "scout",
    model: { provider: "anthropic", model: "claude-haiku-4-5" },
    usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01,
  }),
  makeEntry({
    sessionId: "s1",
    tier: "scout",
    model: { provider: "anthropic", model: "claude-haiku-4-5" },
    usage: { inputTokens: 200, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 0 },
    costUsd: 0.02,
  }),
  makeEntry({
    sessionId: "s1",
    tier: "scout",
    model: { provider: "anthropic", model: "claude-haiku-4-5" },
    usage: { inputTokens: 50, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: null, // unknown pricing — contributes 0 to costUsd
  }),
  makeEntry({
    sessionId: "s1",
    tier: "builder",
    model: { provider: "anthropic", model: "claude-sonnet-5" },
    usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.3,
  }),
  makeEntry({
    sessionId: "s1",
    tier: "builder",
    model: { provider: "anthropic", model: "claude-sonnet-5" },
    usage: { inputTokens: 500, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.15,
  }),
  makeEntry({
    sessionId: "s1",
    tier: "architect",
    model: { provider: "anthropic", model: "claude-opus-4-8" },
    usage: { inputTokens: 300, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.5,
  }),
];

async function ledgerWithEntries(entries: LedgerEntry[]) {
  const dir = await mkdtemp(join(tmpdir(), "cox-ledger-"));
  const path = join(dir, "ledger.jsonl");
  await writeFile(path, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");
  return createLedger({
    filePath: path,
    config: configSchema.parse({}),
    pricing: pricingFor,
    now: () => FIXED_NOW,
  });
}

describe("summary totals + byTier/byModel (R7.1)", () => {
  it("R7.1: entries count and usage totals use addUsage", async () => {
    const ledger = await ledgerWithEntries(FIXTURE);
    const summary = await ledger.summary({});
    expect(summary.entries).toBe(6);
    expect(summary.usage).toEqual({
      inputTokens: 100 + 200 + 50 + 1000 + 500 + 300,
      outputTokens: 10 + 20 + 5 + 100 + 50 + 30,
      cacheReadTokens: 50,
      cacheWriteTokens: 0,
    });
  });

  it("R7.1: null costUsd entries count as 0 toward the total", async () => {
    const ledger = await ledgerWithEntries(FIXTURE);
    const summary = await ledger.summary({});
    expect(summary.costUsd).toBeCloseTo(0.01 + 0.02 + 0 + 0.3 + 0.15 + 0.5, 5);
  });

  it("R7.1: byTier buckets carry per-tier usage + cost", async () => {
    const ledger = await ledgerWithEntries(FIXTURE);
    const summary = await ledger.summary({});
    expect(summary.byTier.scout?.costUsd).toBeCloseTo(0.03, 5);
    expect(summary.byTier.scout?.usage.inputTokens).toBe(100 + 200 + 50);
    expect(summary.byTier.builder?.costUsd).toBeCloseTo(0.45, 5);
    expect(summary.byTier.builder?.usage.inputTokens).toBe(1000 + 500);
    expect(summary.byTier.architect?.costUsd).toBeCloseTo(0.5, 5);
    expect(summary.byTier.architect?.usage.inputTokens).toBe(300);
  });

  it("R7.1: byModel keyed by modelKey (provider/model) carries per-model usage + cost", async () => {
    const ledger = await ledgerWithEntries(FIXTURE);
    const summary = await ledger.summary({});
    expect(Object.keys(summary.byModel).sort()).toEqual([
      "anthropic/claude-haiku-4-5",
      "anthropic/claude-opus-4-8",
      "anthropic/claude-sonnet-5",
    ]);
    expect(summary.byModel["anthropic/claude-haiku-4-5"]?.costUsd).toBeCloseTo(0.03, 5);
    expect(summary.byModel["anthropic/claude-sonnet-5"]?.costUsd).toBeCloseTo(0.45, 5);
    expect(summary.byModel["anthropic/claude-opus-4-8"]?.costUsd).toBeCloseTo(0.5, 5);
  });

  it("R7.1: summary respects the query filter (e.g. by tier)", async () => {
    const ledger = await ledgerWithEntries(FIXTURE);
    const summary = await ledger.summary({ tier: "builder" });
    expect(summary.entries).toBe(2);
    expect(summary.costUsd).toBeCloseTo(0.45, 5);
  });

  it("R7.1: empty entry set yields zeroed totals", async () => {
    const ledger = await ledgerWithEntries([]);
    const summary = await ledger.summary({});
    expect(summary.entries).toBe(0);
    expect(summary.costUsd).toBe(0);
    expect(summary.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(summary.byTier).toEqual({});
    expect(summary.byModel).toEqual({});
  });
});

describe("baseline-vs-architect calculation (R7.2)", () => {
  async function ledgerWithPricing(
    entries: LedgerEntry[],
    pricing: typeof pricingFor,
  ) {
    const dir = await mkdtemp(join(tmpdir(), "cox-ledger-"));
    const path = join(dir, "ledger.jsonl");
    await writeFile(path, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");
    return createLedger({
      filePath: path,
      config: configSchema.parse({}), // architect primary = anthropic/claude-opus-4-8
      pricing,
      now: () => FIXED_NOW,
    });
  }

  it("R7.2: re-prices every matched entry's usage at the architect primary's pricing", async () => {
    const ledger = await ledgerWithPricing(FIXTURE, pricingFor);
    const summary = await ledger.summary({});
    // Hand-computed at anthropic/claude-opus-4-8 rates ($5/$25/$0.5/$6.25 per
    // MTok): totals in=2150 out=215 cacheRead=50 cacheWrite=0 →
    // (2150*5 + 215*25 + 50*0.5) / 1e6 = (10750 + 5375 + 25) / 1e6 = 0.01615
    expect(summary.baselineArchitectCostUsd).toBeCloseTo(0.01615, 5);
  });

  it("R7.2: baseline ignores each entry's own costUsd/tier and only re-prices usage", async () => {
    // A single scout entry with cheap actual cost still re-prices at the
    // (expensive) architect rate for the baseline.
    const entry = makeEntry({
      tier: "scout",
      usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0.001, // real (haiku) cost — irrelevant to baseline
    });
    const ledger = await ledgerWithPricing([entry], pricingFor);
    const summary = await ledger.summary({});
    expect(summary.baselineArchitectCostUsd).toBeCloseTo(5.0, 5); // 1M in @ $5/M opus
  });

  it("R7.2: unknown architect pricing yields baseline 0", async () => {
    const ledger = await ledgerWithPricing(FIXTURE, () => null);
    const summary = await ledger.summary({});
    expect(summary.baselineArchitectCostUsd).toBe(0);
  });

  it("R7.2: empty entry set yields baseline 0", async () => {
    const ledger = await ledgerWithPricing([], pricingFor);
    const summary = await ledger.summary({});
    expect(summary.baselineArchitectCostUsd).toBe(0);
  });
});
