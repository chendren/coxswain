import { describe, expect, it } from "vitest";
import {
  addUsage,
  computeCostUsd,
  configSchema,
  EventBus,
  modelKey,
  pricingFor,
  ZERO_USAGE,
  type AgentEvent,
} from "../src/index.js";

describe("@cox/core", () => {
  it("computes anthropic cost with cache rates", () => {
    const p = pricingFor("anthropic", "claude-sonnet-5");
    expect(p).not.toBeNull();
    const cost = computeCostUsd(
      { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 500_000, cacheWriteTokens: 0 },
      p!,
    );
    // 1M in @ $3 + 100k out @ $15/M + 500k cache-read @ $0.30/M
    expect(cost).toBeCloseTo(3 + 1.5 + 0.15, 5);
  });

  it("parses default config with anthropic tier map", () => {
    const cfg = configSchema.parse({});
    expect(cfg.tiers.scout.primary.model).toBe("claude-haiku-4-5");
    expect(cfg.tiers.builder.primary.model).toBe("claude-sonnet-5");
    expect(cfg.tiers.architect.primary.model).toBe("claude-opus-4-8");
    expect(cfg.budgets.warnAt).toBe(0.8);
  });

  it("event bus swallows listener errors", () => {
    const bus = new EventBus();
    const seen: AgentEvent[] = [];
    bus.subscribe(() => {
      throw new Error("broken renderer");
    });
    bus.subscribe((e) => seen.push(e));
    bus.emit({ type: "user_prompt", text: "hi" });
    expect(seen).toHaveLength(1);
  });

  it("adds usage and formats model keys", () => {
    const u = addUsage(ZERO_USAGE, {
      inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4,
    });
    expect(u.cacheWriteTokens).toBe(4);
    expect(modelKey({ provider: "xai", model: "grok-4-1-fast" })).toBe("xai/grok-4-1-fast");
  });
});
