import { describe, expect, it } from "vitest";
import type {
  ChatModel,
  ChatRequest,
  Ledger,
  LedgerEntry,
  ModelRef,
  Router,
  RoutingDecision,
  StopReason,
  Tier,
  TokenUsage,
} from "@cox/core";
import { runOneshot } from "../src/commands/oneshot";

// Local test doubles only (per design.md: no @cox/providers import here).

interface ScriptedModel {
  textDeltas: string[];
  usage: TokenUsage;
  stopReason?: StopReason;
}

function fakeChatModel(ref: ModelRef, script: ScriptedModel): ChatModel & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    ref,
    requests,
    estimateTokens: (t: string) => Math.ceil(t.length / 4),
    async *stream(req) {
      requests.push(req);
      for (const d of script.textDeltas) yield { type: "text_delta" as const, text: d };
      yield { type: "usage" as const, usage: script.usage };
      yield { type: "done" as const, stopReason: script.stopReason ?? "end_turn" };
    },
  };
}

function fakeRouter(tier: Tier): Router & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async route(input) {
      calls.push(input);
      const decision: RoutingDecision = {
        tier,
        model: { provider: "anthropic", model: "claude-haiku-4-5" },
        reasons: ["policy oneshot"],
        estimate: { inputTokens: input.contextTokens, estOutputTokens: 200, estCostUsd: 0.001 },
      };
      return decision;
    },
    async reconsider() {
      return null;
    },
  };
}

function fakeLedger(): { ledger: Ledger; entries: LedgerEntry[] } {
  const entries: LedgerEntry[] = [];
  const ledger: Ledger = {
    async record(e) {
      entries.push(e);
    },
    async query() {
      return [];
    },
    async summary() {
      return {
        entries: 0,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        byTier: {},
        byModel: {},
        baselineArchitectCostUsd: 0,
      };
    },
    async budgetState() {
      return { level: "ok", spentUsd: 0, spentTokens: 0 };
    },
  };
  return { ledger, entries };
}

describe("R9.1: cox explain / cox suggest", () => {
  it("routes kind:oneshot, streams a tool-less ChatModel call, and prints the text", async () => {
    const model = fakeChatModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      {
        textDeltas: ["`grep -rn` searches recursively and prints line numbers."],
        usage: { inputTokens: 20, outputTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    );
    const router = fakeRouter("scout");
    const { ledger } = fakeLedger();
    const chunks: string[] = [];

    await runOneshot("explain", "grep -rn foo", {
      router,
      tierModel: () => model,
      ledger,
      sessionId: "ses_test",
      write: (s) => chunks.push(s),
    });

    expect(router.calls).toEqual([
      expect.objectContaining({ kind: "oneshot", text: "grep -rn foo", sessionId: "ses_test" }),
    ]);
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.tools).toEqual([]);
    expect(model.requests[0]?.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "grep -rn foo" }] },
    ]);
    expect(chunks.join("")).toContain("searches recursively");
  });

  it("writes exactly one LedgerEntry with kind oneshot and the routed tier/model", async () => {
    const model = fakeChatModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      {
        textDeltas: ["explanation text"],
        usage: { inputTokens: 20, outputTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    );
    const router = fakeRouter("scout");
    const { ledger, entries } = fakeLedger();

    await runOneshot("explain", "what does this do", {
      router,
      tierModel: () => model,
      ledger,
      sessionId: "ses_test",
      write: () => {},
      now: () => "2026-07-20T00:00:00.000Z",
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.kind).toBe("oneshot");
    expect(entry.tier).toBe("scout");
    expect(entry.model).toEqual({ provider: "anthropic", model: "claude-haiku-4-5" });
    expect(entry.usage).toEqual({ inputTokens: 20, outputTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(entry.costUsd).not.toBeNull();
    expect(entry.sessionId).toBe("ses_test");
    expect(entry.ts).toBe("2026-07-20T00:00:00.000Z");
  });

  it("records costUsd: null for a model with unknown pricing (never throws)", async () => {
    // Note: "ollama/*" is a known $0 wildcard in PRICING (local inference) —
    // use a provider id that matches nothing in the table at all.
    const model = fakeChatModel(
      { provider: "openai-compat:mystery-endpoint", model: "some-new-model" },
      {
        textDeltas: ["explanation"],
        usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    );
    const { ledger, entries } = fakeLedger();
    await runOneshot("explain", "x", {
      router: fakeRouter("scout"),
      tierModel: () => model,
      ledger,
      sessionId: "ses_test",
      write: () => {},
    });
    expect(entries[0]?.costUsd).toBeNull();
  });

  it("does not invoke any tool-use machinery (tools: [] on the request)", async () => {
    const model = fakeChatModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      { textDeltas: ["ok"], usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } },
    );
    await runOneshot("suggest", "list files", {
      router: fakeRouter("scout"),
      tierModel: () => model,
      ledger: fakeLedger().ledger,
      sessionId: "ses_test",
      write: () => {},
    });
    expect(model.requests[0]?.tools).toEqual([]);
  });
});

describe("R9.2: suggest prints the runnable command alone on the final line", () => {
  it("the last non-empty printed line is exactly the model's suggested command", async () => {
    const model = fakeChatModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      {
        textDeltas: ["Lists all files recursively.\n", "find . -type f"],
        usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    );
    const chunks: string[] = [];
    await runOneshot("suggest", "list all files recursively", {
      router: fakeRouter("scout"),
      tierModel: () => model,
      ledger: fakeLedger().ledger,
      sessionId: "ses_test",
      write: (s) => chunks.push(s),
    });
    const printed = chunks.join("");
    const lines = printed.split("\n").filter((l) => l.length > 0);
    expect(lines.at(-1)).toBe("find . -type f");
  });

  it("uses a suggest-specific system prompt instructing the bare-command-on-final-line format", async () => {
    const model = fakeChatModel(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      { textDeltas: ["ls -la"], usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } },
    );
    await runOneshot("suggest", "list files with details", {
      router: fakeRouter("scout"),
      tierModel: () => model,
      ledger: fakeLedger().ledger,
      sessionId: "ses_test",
      write: () => {},
    });
    expect(model.requests[0]?.system).toMatch(/alone on the final line/);
  });
});
