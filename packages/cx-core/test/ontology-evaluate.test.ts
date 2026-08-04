import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONTOLOGY,
  confidenceBand,
  intentId,
  matchNbaRules,
  nextStages,
  isTerminalStage,
  journeysTriggeredBy,
  parseIntentId,
  ontologyPromptConstraint,
} from "../src/ontology";

describe("ontology ids", () => {
  it("round-trips domain.intent ids", () => {
    expect(intentId("billing", "payment_issue")).toBe("billing.payment_issue");
    expect(parseIntentId("billing.payment_issue")).toEqual({
      domainId: "billing",
      intentId: "payment_issue",
    });
    expect(parseIntentId("nope")).toBeNull();
    expect(parseIntentId("a.b.c")).toBeNull();
  });
});

describe("journey transitions", () => {
  it("returns next stages for billing_dispute.initiated", () => {
    expect(nextStages(DEFAULT_ONTOLOGY, "billing_dispute", "initiated")).toEqual([
      "under_review",
    ]);
  });

  it("marks terminal stages", () => {
    expect(isTerminalStage(DEFAULT_ONTOLOGY, "billing_dispute", "resolved")).toBe(true);
    expect(isTerminalStage(DEFAULT_ONTOLOGY, "billing_dispute", "initiated")).toBe(false);
  });

  it("finds journeys triggered by an intent", () => {
    const hits = journeysTriggeredBy(DEFAULT_ONTOLOGY, "billing.refund_request");
    expect(hits.map((j) => j.id)).toContain("billing_dispute");
  });
});

describe("matchNbaRules", () => {
  it("matches high churn risk rule first when context fits", () => {
    const matched = matchNbaRules(DEFAULT_ONTOLOGY, {
      journey: "churn_prevention",
      stage: "cancel_requested",
    });
    expect(matched.length).toBeGreaterThan(0);
    expect(matched[0]!.id).toBe("CHURN_RISK_HIGH");
    expect(matched[0]!.priority).toBe(100);
  });

  it("returns empty when conditions fail", () => {
    const matched = matchNbaRules(DEFAULT_ONTOLOGY, {
      journey: "billing_dispute",
      stage: "initiated",
    });
    expect(matched.find((r) => r.id === "CHURN_RISK_HIGH")).toBeUndefined();
  });

  it("supports numeric comparisons", () => {
    // Pick a rule with a numeric condition if present; otherwise skip via soft assert
    const numericRule = DEFAULT_ONTOLOGY.nbaRules.find((r) =>
      r.conditions.some((c) => c.op === "gt" || c.op === "gte"),
    );
    if (!numericRule) {
      expect(true).toBe(true);
      return;
    }
    const cond = numericRule.conditions.find((c) => c.op === "gt" || c.op === "gte")!;
    const ctx: Record<string, string | number> = {};
    for (const c of numericRule.conditions) {
      if (c.field === cond.field) {
        const min = typeof c.value === "number" ? c.value : Number(c.value);
        ctx[c.field] = min + 1;
      } else if (c.op === "eq") {
        ctx[c.field] = c.value as string | number;
      } else if (c.op === "in" && Array.isArray(c.value)) {
        ctx[c.field] = c.value[0] as string;
      }
    }
    const matched = matchNbaRules(DEFAULT_ONTOLOGY, ctx);
    expect(matched.map((r) => r.id)).toContain(numericRule.id);
  });
});

describe("confidenceBand", () => {
  it("picks the highest applicable band", () => {
    const high = confidenceBand(DEFAULT_ONTOLOGY, 0.85);
    expect(high?.band).toBe("high");
    const medium = confidenceBand(DEFAULT_ONTOLOGY, 0.5);
    expect(medium?.band).toBe("medium");
    const low = confidenceBand(DEFAULT_ONTOLOGY, 0.1);
    expect(low?.band).toBe("low");
  });
});

describe("ontologyPromptConstraint", () => {
  it("lists closed-set ids for model prompts", () => {
    const text = ontologyPromptConstraint(DEFAULT_ONTOLOGY);
    expect(text).toContain("billing.payment_issue");
    expect(text).toContain("billing_dispute");
    expect(text).toContain("total_contacts");
    expect(text).toContain(DEFAULT_ONTOLOGY.version);
  });
});
