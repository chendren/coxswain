import { describe, expect, it } from "vitest";
import { agentPrompt, parseAgentDefinition } from "../src/agent";
import { isCxAdapterError } from "@cox/cx-core";

describe("agentPrompt", () => {
  it("includes the journey name and a JSON-only instruction", () => {
    const prompt = agentPrompt("Dispute resolution");
    expect(prompt).toContain("Dispute resolution");
    expect(prompt).toContain("JSON only");
  });
});

describe("parseAgentDefinition", () => {
  it("parses a valid response and stamps id/provenance", () => {
    const raw = JSON.stringify({
      name: "Dispute resolution agent",
      systemPrompt: "You handle the dispute resolution journey.",
      tools: ["classify-dispute", "issue-refund"],
    });
    const def = parseAgentDefinition(raw, "billing-dispute", "aws");
    expect(def.kind).toBe("agentDefinition");
    expect(def.id).toBe("agentDefinition");
    expect(def.provenance).toEqual({ specName: "billing-dispute", phase: "design", targetId: "aws" });
    expect(def.name).toBe("Dispute resolution agent");
    expect(def.tools).toEqual(["classify-dispute", "issue-refund"]);
  });

  it("throws a CxAdapterError on malformed JSON", () => {
    try {
      parseAgentDefinition("not json", "billing-dispute", "aws");
      throw new Error("expected parseAgentDefinition to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("build");
        expect(e.retryable).toBe(false);
      }
    }
  });

  it("throws a CxAdapterError when required fields are missing", () => {
    const raw = JSON.stringify({ name: "Dispute resolution agent" }); // missing systemPrompt, tools
    expect(() => parseAgentDefinition(raw, "billing-dispute", "aws")).toThrow(/missing required fields/);
  });
});
