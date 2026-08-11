import { describe, it, expect } from "vitest";
import {
  multiHopQuery,
  neighborhoodQuery,
  intentRouteQuery,
} from "../src/graph-ops";

describe("graph-ops", () => {
  describe("multiHopQuery", () => {
    it("finds path or returns undefined gracefully", () => {
      const result = multiHopQuery(
        "default",
        "domain:billing",
        "intent:billing.payment_issue"
      );
      expect(result.pack).toBe("default");
      expect(result.fromUid).toBe("domain:billing");
      expect(result.toUid).toBe("intent:billing.payment_issue");
      // Either finds a path or returns undefined (both acceptable)
      expect(typeof result.pathDisplay === "string" || result.pathDisplay === undefined).toBe(true);
      expect(Array.isArray(result.controlPath)).toBe(true);
    });
  });

  describe("neighborhoodQuery", () => {
    it("returns k=1 neighborhood with keys for domain:billing", () => {
      const result = neighborhoodQuery("default", "domain:billing", 1);
      expect(result.pack).toBe("default");
      expect(result.startUid).toBe("domain:billing");
      expect(result.k).toBe(1);
      expect(typeof result.distances).toBe("object");
      // domain:billing should be at distance 0
      expect(result.distances["domain:billing"]).toBe(0);
    });
  });

  describe("intentRouteQuery", () => {
    it("returns ranked intents for payment utterance", () => {
      const result = intentRouteQuery("default", "payment");
      expect(result.pack).toBe("default");
      expect(result.utterance).toBe("payment");
      expect(Array.isArray(result.ranked)).toBe(true);
      // Should return at least one intent
      expect(result.ranked.length).toBeGreaterThan(0);
    });
  });
});
