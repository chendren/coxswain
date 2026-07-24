import { describe, expect, it } from "vitest";
import { AWS_STEP_SPECS, buildPlan } from "../src/plan";
import type { CxSpec } from "@cox/cx-core";
import { isCxAdapterError } from "@cox/cx-core";

const journeyMap = {
  kind: "journeyMap" as const,
  id: "journeyMap",
  provenance: { specName: "billing-dispute", phase: "design" as const, targetId: "artifacts" as const },
  name: "Dispute resolution",
  stages: [{ id: "s1", name: "Report", description: "Customer reports the charge", touchpoints: ["phone"] }],
};

const specWithDesign: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [],
  design: { journeyMaps: [journeyMap], personas: [] },
};

describe("buildPlan", () => {
  it("returns 2 steps — architectureDoc then agentDefinition — embedding the journey map", () => {
    const plan = buildPlan(specWithDesign);
    expect(plan.targetId).toBe("aws");
    expect(plan.specName).toBe("billing-dispute");
    expect(plan.steps.map((s) => s.producesArtifactKind)).toEqual(["architectureDoc", "agentDefinition"]);
    for (const step of plan.steps) {
      const embedded = JSON.parse(step.description) as { journeyMap: typeof journeyMap };
      expect(embedded.journeyMap).toEqual(journeyMap);
    }
  });

  it("throws a CxAdapterError when spec.design is missing", () => {
    const specNoDesign: CxSpec = { ...specWithDesign, design: undefined };
    try {
      buildPlan(specNoDesign);
      throw new Error("expected buildPlan to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("plan");
        expect(e.retryable).toBe(false);
      }
    }
  });

  it("throws a CxAdapterError when spec.design.journeyMaps is empty", () => {
    const specEmptyMaps: CxSpec = { ...specWithDesign, design: { journeyMaps: [], personas: [] } };
    expect(() => buildPlan(specEmptyMaps)).toThrow(/no design.journeyMaps/);
  });

  it("AWS_STEP_SPECS assigns architect tier to architectureDoc and builder tier to agentDefinition", () => {
    const byKind = Object.fromEntries(AWS_STEP_SPECS.map((s) => [s.kind, s.tier]));
    expect(byKind.architectureDoc).toBe("architect");
    expect(byKind.agentDefinition).toBe("builder");
  });
});
