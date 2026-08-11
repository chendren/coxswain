import { describe, expect, it } from "vitest";
import { formatSavingsLine } from "../src/index";

describe("formatSavingsLine", () => {
  it("formats pilot-like savings", () => {
    // 6.41/8.28 ≈ 77.42 → rounds to 77
    expect(formatSavingsLine(6.41, 8.28)).toBe("saved $6.41 of $8.28 (77%)");
  });
  it("handles zero baseline", () => {
    expect(formatSavingsLine(5, 0)).toBe("saved $5.00 of $0.00 (0%)");
  });
  it("handles full save", () => {
    expect(formatSavingsLine(10, 10)).toBe("saved $10.00 of $10.00 (100%)");
  });
  it("handles non-finite", () => {
    expect(formatSavingsLine(NaN, 10)).toBe("saved $0.00 of $10.00 (0%)");
  });
});
