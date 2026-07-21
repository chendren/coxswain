import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configSchema, pricingFor, type CoxConfig, type LedgerEntry } from "@cox/core";
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

async function ledgerWithEntries(
  entries: LedgerEntry[],
  budgets: Partial<CoxConfig["budgets"]> = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "cox-ledger-"));
  const path = join(dir, "ledger.jsonl");
  const body = entries.length > 0 ? `${entries.map((e) => JSON.stringify(e)).join("\n")}\n` : "";
  await writeFile(path, body, "utf8");
  return createLedger({
    filePath: path,
    config: configSchema.parse({ budgets }),
    pricing: pricingFor,
    now: () => FIXED_NOW,
  });
}

describe("budgetState scopes + levels (R8.1-R8.3)", () => {
  it("R8.1: spentTokens sums input+output+cacheRead+cacheWrite across matched entries", async () => {
    const ledger = await ledgerWithEntries(
      [
        makeEntry({
          usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 3 },
          costUsd: 0.1,
        }),
        makeEntry({
          usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0.05,
        }),
      ],
      { sessionUsd: 10 },
    );
    const state = await ledger.budgetState("s1");
    expect(state.spentTokens).toBe(100 + 20 + 5 + 3 + 50 + 10);
    expect(state.spentUsd).toBeCloseTo(0.15, 5);
  });

  it("R8.1: session scope filters by sessionId only", async () => {
    const ledger = await ledgerWithEntries(
      [
        makeEntry({ sessionId: "s1", costUsd: 1 }),
        makeEntry({ sessionId: "s2", costUsd: 100 }), // different session, must not count
      ],
      { sessionUsd: 10 },
    );
    const state = await ledger.budgetState("s1");
    expect(state.spentUsd).toBeCloseTo(1, 5);
  });

  it("R8.1: spec scope computed from spec-filtered cost (spans sessions) when specName + specUsd both present", async () => {
    const ledger = await ledgerWithEntries(
      [
        makeEntry({ sessionId: "s1", specName: "auth", costUsd: 2 }),
        makeEntry({ sessionId: "s2", specName: "auth", costUsd: 3 }), // different session, same spec — still counts
        makeEntry({ sessionId: "s1", specName: "billing", costUsd: 100 }), // different spec — must not count
      ],
      { specUsd: 10 },
    );
    const state = await ledger.budgetState("s1", "auth");
    expect(state.scope).toBe("spec");
    expect(state.spentUsd).toBeCloseTo(5, 5); // 2 + 3, across sessions
  });

  it("R8.2: level is ok below warnAt", async () => {
    const ledger = await ledgerWithEntries([makeEntry({ costUsd: 1 })], {
      sessionUsd: 10,
      warnAt: 0.8,
    });
    const state = await ledger.budgetState("s1");
    expect(state.level).toBe("ok");
  });

  it("R8.2: level is warn at exactly warnAt (boundary)", async () => {
    const ledger = await ledgerWithEntries([makeEntry({ costUsd: 8 })], {
      sessionUsd: 10,
      warnAt: 0.8,
    });
    const state = await ledger.budgetState("s1");
    expect(state.level).toBe("warn");
    expect(state.scope).toBe("session");
  });

  it("R8.2: level is exceeded at exactly 1.0 (boundary)", async () => {
    const ledger = await ledgerWithEntries([makeEntry({ costUsd: 10 })], {
      sessionUsd: 10,
      warnAt: 0.8,
    });
    const state = await ledger.budgetState("s1");
    expect(state.level).toBe("exceeded");
  });

  it("R8.2: just below warnAt boundary stays ok", async () => {
    const ledger = await ledgerWithEntries([makeEntry({ costUsd: 7.99 })], {
      sessionUsd: 10,
      warnAt: 0.8,
    });
    const state = await ledger.budgetState("s1");
    expect(state.level).toBe("ok");
  });

  it("R8.2: just below the 1.0 boundary stays warn, not exceeded", async () => {
    const ledger = await ledgerWithEntries([makeEntry({ costUsd: 9.99 })], {
      sessionUsd: 10,
      warnAt: 0.8,
    });
    const state = await ledger.budgetState("s1");
    expect(state.level).toBe("warn");
  });

  it("R8.2: worst level across scopes wins — spec worse than session", async () => {
    const ledger = await ledgerWithEntries(
      [
        makeEntry({ sessionId: "s1", specName: "auth", costUsd: 1 }),
        makeEntry({ sessionId: "s1", specName: "auth", costUsd: 4 }),
      ],
      { sessionUsd: 10, specUsd: 5, warnAt: 0.8 }, // session 5/10=50% ok; spec 5/5=100% exceeded
    );
    const state = await ledger.budgetState("s1", "auth");
    expect(state.level).toBe("exceeded");
    expect(state.scope).toBe("spec");
  });

  it("R8.2: worst level across scopes wins — session worse than spec", async () => {
    const ledger = await ledgerWithEntries(
      [makeEntry({ sessionId: "s1", specName: "auth", costUsd: 9 })],
      { sessionUsd: 10, specUsd: 100, warnAt: 0.8 }, // session 9/10=90% warn; spec 9/100=9% ok
    );
    const state = await ledger.budgetState("s1", "auth");
    expect(state.level).toBe("warn");
    expect(state.scope).toBe("session");
  });

  it("R8.3: no limits configured -> ok with spent figures populated and limit/scope fields absent", async () => {
    const ledger = await ledgerWithEntries([makeEntry({ costUsd: 1.23 })], {});
    const state = await ledger.budgetState("s1");
    expect(state.level).toBe("ok");
    expect(state.spentUsd).toBeCloseTo(1.23, 5);
    expect(state).not.toHaveProperty("limitUsd");
    expect(state).not.toHaveProperty("limitTokens");
    expect(state).not.toHaveProperty("scope");
  });

  it("R8.3: specUsd not configured -> specName ignored, state stays session-scoped", async () => {
    const ledger = await ledgerWithEntries(
      [makeEntry({ sessionId: "s1", specName: "auth", costUsd: 1 })],
      { sessionUsd: 10 }, // no specUsd
    );
    const state = await ledger.budgetState("s1", "auth");
    expect(state.scope).toBe("session");
  });

  it("R8.3: no entries at all -> ok, spent 0", async () => {
    const ledger = await ledgerWithEntries([], {});
    const state = await ledger.budgetState("s1");
    expect(state).toEqual({ level: "ok", spentUsd: 0, spentTokens: 0 });
  });
});
