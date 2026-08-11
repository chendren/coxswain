import { describe, expect, it } from "vitest";
import { savingsPercent } from "../src/index";

describe("savingsPercent", () => {
  it("returns correct percentage for typical case (6.41 / 8.28 ≈ 77.4%)", () => {
    const result = savingsPercent(6.41, 8.28);
    expect(result).toBeCloseTo(77.4, 1);
  });

  it("returns 0 when baselineUsd is 0", () => {
    expect(savingsPercent(5.0, 0)).toBe(0);
  });

  it("returns 0 when baselineUsd is negative", () => {
    expect(savingsPercent(5.0, -10)).toBe(0);
  });

  it("clamps to 0 for negative savedUsd", () => {
    const result = savingsPercent(-5.0, 10);
    expect(result).toBe(0);
  });

  it("clamps to 100 when savedUsd exceeds baselineUsd", () => {
    const result = savingsPercent(15.0, 10);
    expect(result).toBe(100);
  });

  it("returns 0 when savedUsd is Infinity", () => {
    expect(savingsPercent(Infinity, 10)).toBe(0);
  });

  it("returns 0 when baselineUsd is Infinity", () => {
    expect(savingsPercent(5.0, Infinity)).toBe(0);
  });

  it("returns 0 when savedUsd is NaN", () => {
    expect(savingsPercent(NaN, 10)).toBe(0);
  });

  it("returns 0 when baselineUsd is NaN", () => {
    expect(savingsPercent(5.0, NaN)).toBe(0);
  });

  it("handles exact 0% savings (savedUsd = 0)", () => {
    expect(savingsPercent(0, 10)).toBe(0);
  });

  it("handles exact 100% savings (baselineUsd = savedUsd)", () => {
    expect(savingsPercent(10, 10)).toBe(100);
  });
});
