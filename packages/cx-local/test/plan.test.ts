import { describe, expect, it } from "vitest";
import { buildPlan } from "../src/plan";
import type { CxSpec } from "@cox/cx-core";
import { isCxAdapterError } from "@cox/cx-core";

const journeyMap = {
  kind: "journeyMap" as const,
  id: "journeyMap",
  provenance: { specName: "billing-dispute", phase: "design" as const, targetId: "artifacts" as const },
  name: "Dispute resolution",
  stages: [],
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
  it("returns a single 'bind' step embedding the first journey map", () => {
    const plan = buildPlan(specWithDesign);
    expect(plan.targetId).toBe("local");
    expect(plan.specName).toBe("billing-dispute");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.id).toBe("bind");
    expect(plan.steps[0]?.producesArtifactKind).toBe("agentDefinition");
    const embedded = JSON.parse(plan.steps[0]!.description) as { journeyMap: typeof journeyMap };
    expect(embedded.journeyMap).toEqual(journeyMap);
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
});
