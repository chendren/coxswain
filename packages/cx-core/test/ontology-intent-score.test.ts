import { describe, expect, it } from "vitest";
import { DEFAULT_ONTOLOGY, scoreIntents, routeIntent } from "../src/ontology";

describe("intent-score closed-world router", () => {
  it("ranks payment-related utterance toward billing.payment_issue", () => {
    const ranked = scoreIntents(
      DEFAULT_ONTOLOGY,
      "My payment didn't go through and I was charged twice on my bill",
      10,
    );
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]!.score).toBeGreaterThan(0);
    const ids = ranked.map((r) => r.intentId);
    expect(ids.some((id) => id.includes("payment") || id.includes("billing"))).toBe(true);
  });

  it("returns empty for empty utterance", () => {
    expect(scoreIntents(DEFAULT_ONTOLOGY, "   ")).toEqual([]);
    expect(scoreIntents(DEFAULT_ONTOLOGY, "")).toEqual([]);
  });

  it("routeIntent returns undefined for gibberish below threshold", () => {
    expect(routeIntent(DEFAULT_ONTOLOGY, "zzzz qxxy foobar", 50)).toBeUndefined();
  });

  it("routeIntent returns a top intent for clear payment language", () => {
    const top = routeIntent(
      DEFAULT_ONTOLOGY,
      "I keep getting an error when trying to pay my bill online",
      10,
    );
    expect(top).toBeDefined();
    expect(top!.intentId.length).toBeGreaterThan(0);
    expect(top!.score).toBeGreaterThanOrEqual(10);
  });
});
