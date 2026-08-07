import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONTOLOGY,
  type CxOntology,
  type CxSpec,
} from "@cox/cx-core";
import { resolveNbaContextFromSpec } from "../src/nba";

function baseSpec(overrides?: Partial<CxSpec>): CxSpec {
  return {
    state: {
      name: "demo",
      createdAt: "2026-08-06T00:00:00Z",
      phases: { requirements: "approved", design: "draft", tasks: "missing" },
      tasks: [],
      approvals: [],
    },
    requirements: [],
    ...overrides,
  };
}

describe("resolveNbaContextFromSpec", () => {
  it("defaults journey/stage/confidence when design is missing", () => {
    const ctx = resolveNbaContextFromSpec(baseSpec());
    expect(ctx).toEqual({
      journey: "billing_dispute",
      stage: "under_review",
      confidence: 0.75,
    });
  });

  it("uses design.journeyMaps[0].id when present", () => {
    const ctx = resolveNbaContextFromSpec(
      baseSpec({
        design: {
          journeyMaps: [
            {
              kind: "journeyMap",
              id: "churn_prevention",
              provenance: {
                specName: "demo",
                phase: "design",
                targetId: "artifacts",
              },
              name: "Churn",
              stages: [],
            },
          ],
          personas: [],
        },
      }),
    );
    expect(ctx.journey).toBe("churn_prevention");
    expect(ctx.confidence).toBe(0.75);
    // churn_prevention has no under_review; second stage is non-terminal
    expect(ctx.stage).toBe("retention_offer");
  });

  it("prefers under_review when that stage exists and is non-terminal", () => {
    const ctx = resolveNbaContextFromSpec(
      baseSpec({
        design: {
          journeyMaps: [
            {
              kind: "journeyMap",
              id: "billing_dispute",
              provenance: {
                specName: "demo",
                phase: "design",
                targetId: "artifacts",
              },
              name: "Billing",
              stages: [],
            },
          ],
          personas: [],
        },
      }),
      DEFAULT_ONTOLOGY,
    );
    expect(ctx).toEqual({
      journey: "billing_dispute",
      stage: "under_review",
      confidence: 0.75,
    });
  });

  it("falls back to second stage when under_review is absent", () => {
    const ontology: CxOntology = {
      ...DEFAULT_ONTOLOGY,
      journeys: [
        {
          id: "custom_flow",
          name: "Custom",
          triggerIntents: [],
          stages: [
            { id: "start", name: "Start", nextStages: ["middle"] },
            { id: "middle", name: "Middle", nextStages: ["done"] },
            { id: "done", name: "Done", nextStages: [] },
          ],
          terminalStages: ["done"],
        },
      ],
    };
    const ctx = resolveNbaContextFromSpec(
      baseSpec({
        design: {
          journeyMaps: [
            {
              kind: "journeyMap",
              id: "custom_flow",
              provenance: {
                specName: "demo",
                phase: "design",
                targetId: "artifacts",
              },
              name: "Custom",
              stages: [],
            },
          ],
          personas: [],
        },
      }),
      ontology,
    );
    expect(ctx.journey).toBe("custom_flow");
    expect(ctx.stage).toBe("middle");
    expect(ctx.confidence).toBe(0.75);
  });

  it("falls back to under_review when journey is unknown in ontology", () => {
    const ctx = resolveNbaContextFromSpec(
      baseSpec({
        design: {
          journeyMaps: [
            {
              kind: "journeyMap",
              id: "not_in_ontology",
              provenance: {
                specName: "demo",
                phase: "design",
                targetId: "artifacts",
              },
              name: "Unknown",
              stages: [],
            },
          ],
          personas: [],
        },
      }),
    );
    expect(ctx).toEqual({
      journey: "not_in_ontology",
      stage: "under_review",
      confidence: 0.75,
    });
  });
});
