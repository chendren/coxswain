import { describe, expect, it } from "vitest";
import { parseArchitectureDoc, templatePrompt } from "../src/template";
import { isCxAdapterError } from "@cox/cx-core";

describe("templatePrompt", () => {
  it("includes the journey name, stage names, Connect/Lex/Bedrock Agent, and a JSON-only instruction", () => {
    const prompt = templatePrompt("Dispute resolution", "Report, Investigate, Resolve");
    expect(prompt).toContain("Dispute resolution");
    expect(prompt).toContain("Report, Investigate, Resolve");
    expect(prompt).toContain("Connect");
    expect(prompt).toContain("Lex");
    expect(prompt).toContain("Bedrock Agent");
    expect(prompt).toContain("JSON only");
  });
});

describe("parseArchitectureDoc", () => {
  it("parses a valid response and stamps id/provenance", () => {
    const raw = JSON.stringify({
      title: "Dispute resolution CX stack",
      markdown: "AWSTemplateFormatVersion: '2010-09-09'\nDescription: >\n  Dispute resolution stack",
    });
    const doc = parseArchitectureDoc(raw, "billing-dispute", "aws");
    expect(doc.kind).toBe("architectureDoc");
    expect(doc.id).toBe("architectureDoc");
    expect(doc.provenance).toEqual({ specName: "billing-dispute", phase: "design", targetId: "aws" });
    expect(doc.title).toBe("Dispute resolution CX stack");
    expect(doc.markdown).toContain("AWSTemplateFormatVersion");
  });

  it("throws a CxAdapterError on malformed JSON", () => {
    try {
      parseArchitectureDoc("not json", "billing-dispute", "aws");
      throw new Error("expected parseArchitectureDoc to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("build");
        expect(e.retryable).toBe(false);
      }
    }
  });

  it("throws a CxAdapterError when required fields are missing", () => {
    const raw = JSON.stringify({ title: "Dispute resolution CX stack" }); // missing "markdown"
    expect(() => parseArchitectureDoc(raw, "billing-dispute", "aws")).toThrow(/missing required fields/);
  });
});
