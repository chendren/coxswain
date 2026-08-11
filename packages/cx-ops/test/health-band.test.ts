import { describe, expect, it } from "vitest";
import { healthBand } from "../src/health-band";

describe("healthBand", () => {
  it("returns green for score >= 80", () => {
    expect(healthBand(100)).toBe("green");
    expect(healthBand(95)).toBe("green");
    expect(healthBand(80)).toBe("green");
  });

  it("returns yellow for score >= 50 and < 80", () => {
    expect(healthBand(79)).toBe("yellow");
    expect(healthBand(60)).toBe("yellow");
    expect(healthBand(50)).toBe("yellow");
  });

  it("returns red for score < 50", () => {
    expect(healthBand(49)).toBe("red");
    expect(healthBand(10)).toBe("red");
    expect(healthBand(0)).toBe("red");
  });

  it("returns red for non-finite values", () => {
    expect(healthBand(NaN)).toBe("red");
    expect(healthBand(Infinity)).toBe("red");
    expect(healthBand(-Infinity)).toBe("red");
  });
});
