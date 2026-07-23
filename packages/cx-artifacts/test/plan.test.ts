import { describe, expect, it } from "vitest";
import { ARTIFACT_STEP_SPECS, buildPlan } from "../src/plan";
import type { CxSpec } from "@cox/cx-core";

const spec: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [
    { id: "R1.1", text: "WHEN a customer disputes a charge, THE SYSTEM SHALL resolve in <= 1 contact" },
  ],
};

describe("buildPlan", () => {
  it("returns the 6 standard artifact steps in order", () => {
    const plan = buildPlan(spec);
    expect(plan.targetId).toBe("artifacts");
    expect(plan.specName).toBe("billing-dispute");
    expect(plan.steps.map((s) => s.producesArtifactKind)).toEqual([
      "journeyMap",
      "persona",
      "intentTaxonomy",
      "nbaRuleSet",
      "kpiFrame",
      "architectureDoc",
    ]);
  });

  it("renders spec.requirements into every step's description", () => {
    const plan = buildPlan(spec);
    for (const step of plan.steps) {
      expect(step.description).toContain("R1.1: WHEN a customer disputes a charge, THE SYSTEM SHALL resolve in <= 1 contact");
    }
  });

  it("falls back to a placeholder description when there are no requirements", () => {
    const emptySpec: CxSpec = { ...spec, requirements: [] };
    const plan = buildPlan(emptySpec);
    expect(plan.steps[0]?.description).toBe("No requirements recorded.");
  });

  it("ARTIFACT_STEP_SPECS assigns architect tier to design artifacts and builder tier to rendering artifacts", () => {
    const byKind = Object.fromEntries(ARTIFACT_STEP_SPECS.map((s) => [s.kind, s.tier]));
    expect(byKind.journeyMap).toBe("architect");
    expect(byKind.persona).toBe("architect");
    expect(byKind.intentTaxonomy).toBe("architect");
    expect(byKind.nbaRuleSet).toBe("architect");
    expect(byKind.kpiFrame).toBe("builder");
    expect(byKind.architectureDoc).toBe("builder");
  });
});
