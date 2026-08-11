import { describe, expect, it } from "vitest";
import { urgencyLabel } from "../src/urgency-label";

describe("urgencyLabel", () => {
  it("returns high for scores >= 70", () => {
    expect(urgencyLabel(70)).toBe("high");
    expect(urgencyLabel(80)).toBe("high");
    expect(urgencyLabel(90)).toBe("high");
    expect(urgencyLabel(100)).toBe("high");
  });

  it("returns med for scores >= 40 and < 70", () => {
    expect(urgencyLabel(40)).toBe("med");
    expect(urgencyLabel(50)).toBe("med");
    expect(urgencyLabel(69)).toBe("med");
  });

  it("returns low for scores < 40", () => {
    expect(urgencyLabel(0)).toBe("low");
    expect(urgencyLabel(10)).toBe("low");
    expect(urgencyLabel(39)).toBe("low");
  });

  it("returns low for non-finite numbers", () => {
    expect(urgencyLabel(NaN)).toBe("low");
    expect(urgencyLabel(Infinity)).toBe("low");
    expect(urgencyLabel(-Infinity)).toBe("low");
  });
});
