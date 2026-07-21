import { describe, expect, it } from "vitest";
import { estimateTokens } from "../src/estimate.js";

describe("estimateTokens", () => {
  it("R8.1: returns ceil(text.length / 4), with no network involved", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1); // ceil(1/4)
    expect(estimateTokens("ab")).toBe(1); // ceil(2/4)
    expect(estimateTokens("abcd")).toBe(1); // ceil(4/4)
    expect(estimateTokens("abcde")).toBe(2); // ceil(5/4)
    expect(estimateTokens("a".repeat(100))).toBe(25);
    expect(estimateTokens("a".repeat(101))).toBe(26);
  });
});
