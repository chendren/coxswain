import { describe, expect, it } from "vitest";
import { JOURNEY_TYPE_KEYS, matchPrompt, parseMatch } from "../src/match";
import { isCxAdapterError } from "@cox/cx-core";
import type { JourneyMap } from "@cox/cx-core";

const journeyMap: JourneyMap = {
  kind: "journeyMap",
  id: "journeyMap",
  provenance: { specName: "billing-dispute", phase: "design", targetId: "artifacts" },
  name: "Dispute resolution",
  stages: [{ id: "s1", name: "Report", description: "Customer reports the charge", touchpoints: ["phone"] }],
};

describe("matchPrompt", () => {
  it("includes the journey map name, stage names, and all 13 candidate keys", () => {
    const prompt = matchPrompt(journeyMap);
    expect(prompt).toContain("Dispute resolution");
    expect(prompt).toContain("Report");
    for (const key of JOURNEY_TYPE_KEYS) {
      expect(prompt).toContain(key);
    }
    expect(JOURNEY_TYPE_KEYS).toHaveLength(13);
  });
});

describe("parseMatch", () => {
  it("parses a valid match response", () => {
    const key = parseMatch(JSON.stringify({ journeyType: "billing_dispute" }), "local");
    expect(key).toBe("billing_dispute");
  });

  it("throws a CxAdapterError on malformed JSON", () => {
    expect(() => parseMatch("not json", "local")).toThrow();
    try {
      parseMatch("not json", "local");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("build");
        expect(e.retryable).toBe(false);
      }
    }
  });

  it("throws a CxAdapterError when the matched key is not one of the 13 journey types", () => {
    expect(() => parseMatch(JSON.stringify({ journeyType: "made_up_type" }), "local")).toThrow(
      /not one of the platform's 13 journey types/,
    );
  });
});
