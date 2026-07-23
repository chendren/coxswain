import { describe, expect, it } from "vitest";
import { parseArtifact, promptFor } from "../src/generate";
import { isCxAdapterError } from "@cox/cx-core";

const ctx = { specName: "billing-dispute", targetId: "artifacts" as const };

describe("promptFor", () => {
  it("includes the spec name, requirements text, and a JSON-only instruction", () => {
    const prompt = promptFor("journeyMap", "billing-dispute", "R1.1: some requirement");
    expect(prompt).toContain("billing-dispute");
    expect(prompt).toContain("R1.1: some requirement");
    expect(prompt).toContain("JSON only");
  });

  it("throws for agentDefinition — this adapter does not generate it", () => {
    expect(() => promptFor("agentDefinition", "billing-dispute", "")).toThrow(/does not generate/);
  });
});

describe("parseArtifact", () => {
  it("parses a valid journeyMap response and stamps id/provenance", () => {
    const raw = JSON.stringify({
      name: "Dispute resolution",
      stages: [{ id: "s1", name: "Report", description: "Customer reports the charge", touchpoints: ["phone"] }],
    });
    const artifact = parseArtifact("journeyMap", raw, ctx);
    expect(artifact.kind).toBe("journeyMap");
    expect(artifact.id).toBe("journeyMap");
    expect(artifact.provenance).toEqual({ specName: "billing-dispute", phase: "design", targetId: "artifacts" });
    if (artifact.kind === "journeyMap") {
      expect(artifact.name).toBe("Dispute resolution");
      expect(artifact.stages).toHaveLength(1);
    }
  });

  it("parses a valid kpiFrame response", () => {
    const raw = JSON.stringify({ metrics: [{ name: "handle-time", target: 300, unit: "seconds" }] });
    const artifact = parseArtifact("kpiFrame", raw, ctx);
    expect(artifact.kind).toBe("kpiFrame");
    if (artifact.kind === "kpiFrame") {
      expect(artifact.metrics).toEqual([{ name: "handle-time", target: 300, unit: "seconds" }]);
    }
  });

  it("throws a CxAdapterError on unparseable JSON", () => {
    expect(() => parseArtifact("journeyMap", "not json", ctx)).toThrow();
    try {
      parseArtifact("journeyMap", "not json", ctx);
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("build");
        expect(e.retryable).toBe(false);
      }
    }
  });

  it("throws a CxAdapterError when required fields are missing", () => {
    const raw = JSON.stringify({ name: "Dispute resolution" }); // missing "stages"
    expect(() => parseArtifact("journeyMap", raw, ctx)).toThrow(/missing required fields/);
  });
});
