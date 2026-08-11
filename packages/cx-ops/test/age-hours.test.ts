import { describe, expect, it } from "vitest";
import { formatAgeHours } from "../src/age-hours";

describe("formatAgeHours", () => {
  it("handles zero hours", () => {
    expect(formatAgeHours(0)).toBe("0h");
  });

  it("handles hours less than 24", () => {
    expect(formatAgeHours(6)).toBe("6h");
    expect(formatAgeHours(23)).toBe("23h");
  });

  it("handles 24 hours (1 day threshold)", () => {
    expect(formatAgeHours(24)).toBe("1d");
  });

  it("handles between 24 and 48 hours", () => {
    expect(formatAgeHours(30)).toBe("1d");
  });

  it("handles exactly 48 hours (2 days)", () => {
    expect(formatAgeHours(48)).toBe("2d");
  });

  it("handles more than 48 hours", () => {
    expect(formatAgeHours(72)).toBe("3d");
  });

  it("handles non-finite values", () => {
    expect(formatAgeHours(NaN)).toBe("0h");
    expect(formatAgeHours(Infinity)).toBe("0h");
    expect(formatAgeHours(-Infinity)).toBe("0h");
  });

  it("handles negative values", () => {
    expect(formatAgeHours(-1)).toBe("0h");
    expect(formatAgeHours(-5.5)).toBe("0h");
  });
});
