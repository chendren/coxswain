import { describe, expect, it } from "vitest";
import { utilizationPercent, utilizationLevel } from "../src/index";

describe("utilizationPercent", () => {
  it("returns 50 for 50/100", () => {
    expect(utilizationPercent(50, 100)).toBe(50);
  });

  it("returns 0 for 0/100", () => {
    expect(utilizationPercent(0, 100)).toBe(0);
  });

  it("returns 100 for 100/100", () => {
    expect(utilizationPercent(100, 100)).toBe(100);
  });

  it("caps at 100 for 150/100", () => {
    expect(utilizationPercent(150, 100)).toBe(100);
  });

  it("returns 0 when spent is NaN", () => {
    expect(utilizationPercent(NaN, 100)).toBe(0);
  });

  it("returns 0 when limit is NaN", () => {
    expect(utilizationPercent(50, NaN)).toBe(0);
  });

  it("returns 0 when both spent and limit are NaN", () => {
    expect(utilizationPercent(NaN, NaN)).toBe(0);
  });

  it("returns 0 when spent is Infinity", () => {
    expect(utilizationPercent(Infinity, 100)).toBe(0);
  });

  it("returns 0 when limit is Infinity", () => {
    expect(utilizationPercent(50, Infinity)).toBe(0);
  });

  it("returns 0 when limit is 0 and spent is 0", () => {
    expect(utilizationPercent(0, 0)).toBe(0);
  });

  it("returns 100 when limit is 0 and spent > 0", () => {
    expect(utilizationPercent(50, 0)).toBe(100);
  });

  it("returns 100 when limit is negative and spent > 0", () => {
    expect(utilizationPercent(50, -10)).toBe(100);
  });

  it("returns 0 when limit is negative and spent <= 0", () => {
    expect(utilizationPercent(0, -10)).toBe(0);
    expect(utilizationPercent(-5, -10)).toBe(0);
  });
});

describe("utilizationLevel", () => {
  describe("with default warnAt (80)", () => {
    it("returns ok for pct < 80", () => {
      expect(utilizationLevel(79)).toBe("ok");
    });

    it("returns warn for pct = 80", () => {
      expect(utilizationLevel(80)).toBe("warn");
    });

    it("returns exceeded for pct >= 100", () => {
      expect(utilizationLevel(100)).toBe("exceeded");
      expect(utilizationLevel(150)).toBe("exceeded");
    });
  });

  describe("with custom warnAt", () => {
    it("uses custom threshold", () => {
      expect(utilizationLevel(75, 75)).toBe("warn");
      expect(utilizationLevel(74, 75)).toBe("ok");
    });
  });

  it("returns ok for non-finite pct", () => {
    expect(utilizationLevel(NaN)).toBe("ok");
    expect(utilizationLevel(Infinity)).toBe("ok");
    expect(utilizationLevel(-Infinity)).toBe("ok");
  });
});
