import { describe, expect, it } from "vitest";
import type { TokenUsage } from "@cox/core";
import { budgetBar, cachePct, formatDuration, formatTokens, formatUsd } from "../src/format";

describe("R1.4/R2.1: formatTokens", () => {
  const cases: Array<[number, string]> = [
    [0, "0"],
    [1, "1"],
    [612, "612"],
    [999, "999"],
    [1000, "1k"], // 1.0k, trailing .0 dropped
    [1234, "1.2k"],
    [12400, "12.4k"],
    [128000, "128k"], // 128.0k -> trimmed
    [999999, "1000k"], // documented rounding edge: 999.999 -> toFixed(1) "1000.0"
    [1_000_000, "1M"], // 1.0M -> trimmed
    [1_200_000, "1.2M"],
    [24_000, "24k"],
  ];
  for (const [input, expected] of cases) {
    it(`formatTokens(${input}) === ${JSON.stringify(expected)}`, () => {
      expect(formatTokens(input)).toBe(expected);
    });
  }
});

describe("R1.4/R2.1: formatUsd", () => {
  const cases: Array<[number | null, string]> = [
    [null, "n/a"], // edge case: unknown pricing
    [0, "$0.000"], // zero denominator-ish edge: below the 2dp threshold
    [0.005, "$0.005"],
    [0.0721, "$0.07"],
    [0.009999, "$0.010"], // just under threshold, 3dp
    [0.01, "$0.01"], // exactly the 2dp/3dp boundary
    [1.87, "$1.87"],
    [12, "$12.00"],
    [6.41, "$6.41"],
  ];
  for (const [input, expected] of cases) {
    it(`formatUsd(${input}) === ${JSON.stringify(expected)}`, () => {
      expect(formatUsd(input)).toBe(expected);
    });
  }
});

describe("R1.4: formatDuration", () => {
  const cases: Array<[number, string]> = [
    [0, "0ms"],
    [1, "1ms"],
    [450, "450ms"],
    [999, "999ms"],
    [1000, "1.0s"],
    [9450, "9.4s"], // fixture's model_call_finished durationMs
    [9500, "9.5s"],
  ];
  for (const [input, expected] of cases) {
    it(`formatDuration(${input}) === ${JSON.stringify(expected)}`, () => {
      expect(formatDuration(input)).toBe(expected);
    });
  }
});

describe("R1.3/R2.1: budgetBar", () => {
  it("empty at 0 spend", () => {
    expect(budgetBar(0, 5, 10)).toBe("░░░░░░░░░░");
  });
  it("full at spend === limit", () => {
    expect(budgetBar(5, 5, 10)).toBe("██████████");
  });
  it("half filled at 50%", () => {
    expect(budgetBar(2.5, 5, 10)).toBe("█████░░░░░");
  });
  it("clamps to full width when spend exceeds limit", () => {
    expect(budgetBar(9, 5, 10)).toBe("██████████");
  });
  it("zero-denominator edge case: limit 0 renders empty, never NaN/Infinity", () => {
    expect(budgetBar(3, 0, 10)).toBe("░░░░░░░░░░");
  });
  it("rounds fractional fill (spent 0.42 / limit 5.00, width 10)", () => {
    expect(budgetBar(0.42, 5, 10)).toBe("█░░░░░░░░░");
  });
});

describe("R2.1: cachePct", () => {
  it("zero-denominator edge case returns 0, not NaN", () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    expect(cachePct(usage)).toBe(0);
  });
  it("all-cache-miss returns 0", () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    expect(cachePct(usage)).toBe(0);
  });
  it("all-cache-hit returns 100", () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 10,
      cacheReadTokens: 500,
      cacheWriteTokens: 0,
    };
    expect(cachePct(usage)).toBe(100);
  });
  it("matches the fixture's model_call_finished usage (44%)", () => {
    const usage: TokenUsage = {
      inputTokens: 11834,
      outputTokens: 2110,
      cacheReadTokens: 9200,
      cacheWriteTokens: 2634,
    };
    expect(cachePct(usage)).toBe(44);
  });
});
