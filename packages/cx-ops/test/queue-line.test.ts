import { describe, expect, it } from "vitest";
import { formatQueueProposalLine } from "../src/queue-line";

describe("formatQueueProposalLine", () => {
  it("formats with ageDisplay", () => {
    expect(
      formatQueueProposalLine({
        urgency: "high",
        specName: "alpha",
        id: "p-1",
        ageDisplay: "12h",
        kind: "remediate",
        summary: "fix billing path",
      }),
    ).toBe("[high] alpha p-1 12h remediate - fix billing path");
  });
  it("falls back to ageHours", () => {
    expect(
      formatQueueProposalLine({
        urgency: "med",
        specName: "beta",
        id: "p-2",
        ageHours: 6,
        kind: "investigate",
        summary: "check latency",
      }),
    ).toBe("[med] beta p-2 6h investigate - check latency");
  });
  it("truncates long summary to 60 chars", () => {
    const long = "x".repeat(80);
    const line = formatQueueProposalLine({
      urgency: "low",
      specName: "g",
      id: "p",
      ageDisplay: "0h",
      kind: "other",
      summary: long,
    });
    expect(line.endsWith("x".repeat(60))).toBe(true);
    expect(line.length).toBe("[low] g p 0h other - ".length + 60);
  });
});
