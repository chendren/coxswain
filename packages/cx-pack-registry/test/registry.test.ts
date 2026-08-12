import { describe, expect, it } from "vitest";
import {
  detectPack,
  scorePack,
  listPacks,
  isTelcoIdea,
} from "../src/index";

describe("cx-pack-registry", () => {
  describe("detectPack", () => {
    it("maps clear idea strings to correct pack IDs", () => {
      expect(detectPack("retail store returns and loyalty program")).toBe("retail");
      expect(detectPack("mobile broadband 5g network outage")).toBe("telco");
      expect(detectPack("banking account loan fraud detection")).toBe("financial");
      expect(detectPack("healthcare appointment claims prior auth patient")).toBe("healthcare");
      expect(detectPack("travel booking flight disruption hotel reservation")).toBe("travel");
    });

    it("returns 'default' for low-signal text", () => {
      expect(detectPack("the sky is blue")).toBe("default");
      expect(detectPack("hello world")).toBe("default");
      expect(detectPack("")).toBe("default");
    });
  });

  describe("scorePack", () => {
    it("returns matchedKeywords and score in [0,1]", () => {
      const retailScore = scorePack("retail store returns loyalty", "retail");
      expect(retailScore.score).toBeGreaterThanOrEqual(0);
      expect(retailScore.score).toBeLessThanOrEqual(1);
      expect(Array.isArray(retailScore.matchedKeywords)).toBe(true);

      // Verify scoring behavior
      const telcoScore = scorePack("broadband 5g mobile", "telco");
      expect(telcoScore.score).toBeGreaterThan(0.3);
      expect(telcoScore.matchedKeywords.length).toBeGreaterThanOrEqual(2);
    });

    it("default pack returns minimal score and empty keywords", () => {
      const defaultScore = scorePack("anything", "default");
      expect(defaultScore.packId).toBe("default");
      expect(defaultScore.score).toBeCloseTo(0.1);
      expect(defaultScore.matchedKeywords).toEqual([]);
    });
  });

  describe("listPacks", () => {
    it("includes all PackIds", () => {
      const packs = listPacks();
      expect(packs).toContain("default");
      expect(packs).toContain("retail");
      expect(packs).toContain("telco");
      expect(packs).toContain("financial");
      expect(packs).toContain("healthcare");
      expect(packs).toContain("travel");
    });
  });

  describe("isTelcoIdea", () => {
    it("returns true when multi-keyword telco signal clears detectPack threshold", () => {
      // detectPack requires score >= 0.3 (typically 2+ keyword hits).
      expect(isTelcoIdea("mobile broadband 5g outage")).toBe(true);
      expect(isTelcoIdea("telco fiber isp connectivity")).toBe(true);
      expect(isTelcoIdea("wireless carrier prepaid roaming")).toBe(true);
    });

    it("returns false for non-telco and single weak keyword ideas", () => {
      expect(isTelcoIdea("retail store checkout system")).toBe(false);
      expect(isTelcoIdea("banking app fraud detection")).toBe(false);
      // single keyword "broadband" alone scores below threshold
      expect(isTelcoIdea("broadband internet service")).toBe(false);
    });
  });
});
