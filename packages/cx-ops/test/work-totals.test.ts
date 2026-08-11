import { describe, expect, it } from "vitest";
import { formatWorkTotals } from "../src/index";

describe("formatWorkTotals", () => {
  it("formats normal case correctly", () => {
    expect(formatWorkTotals({ proposals: 2, tasks: 1, specsWithWork: 2 })).toBe(
      "2 proposals, 1 task across 2 specs"
    );
  });

  it("handles singular forms correctly", () => {
    expect(formatWorkTotals({ proposals: 1, tasks: 1, specsWithWork: 1 })).toBe(
      "1 proposal, 1 task across 1 spec"
    );
  });

  it("handles zero values with plural forms", () => {
    expect(formatWorkTotals({ proposals: 0, tasks: 0, specsWithWork: 0 })).toBe(
      "0 proposals, 0 tasks across 0 specs"
    );
  });

  it("treats NaN as 0", () => {
    expect(formatWorkTotals({ proposals: NaN, tasks: 1, specsWithWork: 2 })).toBe(
      "0 proposals, 1 task across 2 specs"
    );
  });

  it("treats negative values as 0", () => {
    expect(formatWorkTotals({ proposals: -5, tasks: -1, specsWithWork: -2 })).toBe(
      "0 proposals, 0 tasks across 0 specs"
    );
  });

  it("handles Infinity as 0", () => {
    expect(formatWorkTotals({ proposals: Infinity, tasks: 1, specsWithWork: 2 })).toBe(
      "0 proposals, 1 task across 2 specs"
    );
  });

  it("handles decimal numbers by flooring", () => {
    expect(formatWorkTotals({ proposals: 2.7, tasks: 1.3, specsWithWork: 2.9 })).toBe(
      "2 proposals, 1 task across 2 specs"
    );
  });
});
