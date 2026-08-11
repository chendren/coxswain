import { describe, expect, it } from "vitest";
import { formatUsd } from "../src/index";

describe("formatUsd", () => {
  it("formats positive whole numbers correctly", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(1)).toBe("$1.00");
    expect(formatUsd(123)).toBe("$123.00");
  });

  it("formats positive decimals correctly", () => {
    expect(formatUsd(1.2)).toBe("$1.20");
    expect(formatUsd(1.23)).toBe("$1.23");
    expect(formatUsd(0.99)).toBe("$0.99");
    expect(formatUsd(0.01)).toBe("$0.01");
  });

  it("formats negative numbers with minus sign before dollar sign", () => {
    expect(formatUsd(-1)).toBe("-$1.00");
    expect(formatUsd(-1.2)).toBe("-$1.20");
    expect(formatUsd(-1.23)).toBe("-$1.23");
    expect(formatUsd(-0.99)).toBe("-$0.99");
  });

  it("handles non-finite numbers by returning $0.00", () => {
    expect(formatUsd(NaN)).toBe("$0.00");
    expect(formatUsd(Infinity)).toBe("$0.00");
    expect(formatUsd(-Infinity)).toBe("$0.00");
  });

  it("handles large numbers correctly", () => {
    expect(formatUsd(1000000)).toBe("$1000000.00");
    expect(formatUsd(999999.99)).toBe("$999999.99");
  });

  it("handles small decimal values correctly", () => {
    expect(formatUsd(0.001)).toBe("$0.00");
    expect(formatUsd(0.005)).toBe("$0.01");
    expect(formatUsd(0.0049)).toBe("$0.00");
  });
});
