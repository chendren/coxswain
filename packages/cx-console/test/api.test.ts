import { describe, it, expect } from "vitest";
import {
  apiGraphFind,
  apiGraphPath,
  apiIntent,
  apiHealth,
} from "../src/api";

describe("api", () => {
  describe("apiGraphFind", () => {
    it('default "billing" returns hits or empty array ok', () => {
      const result = apiGraphFind("default", "billing");
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data?.result.hits)).toBe(true);
    });
  });

  describe("apiGraphPath", () => {
    it('domain:billing to intent:billing.payment_issue has pathDisplay or undefined ok', () => {
      const result = apiGraphPath(
        "default",
        "domain:billing",
        "intent:billing.payment_issue",
        4,
      );
      expect(result.ok).toBe(true);
      // Either pathDisplay exists or it's undefined (no path found)
      if (result.data?.path) {
        expect(typeof result.data.pathDisplay).toBe("string");
      } else {
        expect(result.data?.pathDisplay).toBeUndefined();
      }
    });
  });

  describe("apiIntent", () => {
    it('payment utterance has ranked', () => {
      const result = apiIntent("default", "payment issue");
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data?.ranked)).toBe(true);
      if (result.data?.ranked && result.data.ranked.length > 0) {
        expect(typeof result.data.ranked[0]!.intentId).toBe("string");
      }
    });
  });

  describe("apiHealth", () => {
    it("ok", () => {
      const result = apiHealth();
      expect(result.ok).toBe(true);
      expect(result.path).toEqual(["healthz"]);
      expect(result.data?.status).toBe("ok");
    });
  });
});
