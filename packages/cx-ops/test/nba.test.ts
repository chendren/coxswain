import { describe, expect, it } from "vitest";
import { opsRecommendNba, parseNbaContext } from "../src/nba";

describe("opsRecommendNba", () => {
  it("returns CHURN_RISK_HIGH with path audit for cancel_requested", () => {
    const result = opsRecommendNba({
      journey: "churn_prevention",
      stage: "cancel_requested",
      confidence: 0.9,
    });
    expect(result.primary?.id).toBe("CHURN_RISK_HIGH");
    expect(result.path).toEqual(
      expect.arrayContaining(["load_strong", "match_rules", "confidence_band", "next_stages", "emit"]),
    );
    expect(result.confidence?.band).toBe("high");
    expect(Array.isArray(result.nextStages)).toBe(true);
  });
});

describe("parseNbaContext", () => {
  it("parses key=value and coerces numbers", () => {
    expect(parseNbaContext(["journey=churn_prevention", "priority=8", "stage=cancel_requested"])).toEqual({
      journey: "churn_prevention",
      priority: 8,
      stage: "cancel_requested",
    });
  });
});
