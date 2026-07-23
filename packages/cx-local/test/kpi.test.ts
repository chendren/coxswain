import { describe, expect, it } from "vitest";
import { kpiPrompt, parseKpiFrame } from "../src/kpi";
import { isCxAdapterError } from "@cox/cx-core";

describe("kpiPrompt", () => {
  it("includes the journey type and asks for JSON only", () => {
    const prompt = kpiPrompt("billing_dispute");
    expect(prompt).toContain("billing_dispute");
    expect(prompt).toContain("JSON only");
  });
});

describe("parseKpiFrame", () => {
  it("parses a valid response and stamps id/provenance", () => {
    const raw = JSON.stringify({ metrics: [{ name: "handle-time", target: 300, unit: "seconds" }] });
    const frame = parseKpiFrame(raw, "billing-dispute", "local");
    expect(frame.kind).toBe("kpiFrame");
    expect(frame.id).toBe("kpiFrame");
    expect(frame.provenance).toEqual({ specName: "billing-dispute", phase: "design", targetId: "local" });
    expect(frame.metrics).toEqual([{ name: "handle-time", target: 300, unit: "seconds" }]);
  });

  it("throws a CxAdapterError on malformed JSON", () => {
    try {
      parseKpiFrame("not json", "billing-dispute", "local");
      throw new Error("expected parseKpiFrame to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("build");
        expect(e.retryable).toBe(false);
      }
    }
  });

  it("throws a CxAdapterError when metrics is missing", () => {
    expect(() => parseKpiFrame(JSON.stringify({}), "billing-dispute", "local")).toThrow(/missing required fields/);
  });
});
