import { describe, expect, it } from "vitest";
import type { IntentTaxonomy, KpiFrame, JourneyMap } from "../src/artifacts";
import {
  DEFAULT_ONTOLOGY,
  assertKnownIntent,
  validateArtifact,
  validateOntology,
} from "../src/ontology";

const provenance = {
  specName: "billing-dispute",
  phase: "design" as const,
  targetId: "artifacts" as const,
};

describe("validateArtifact", () => {
  it("accepts an intent taxonomy using ontology domain and intent ids", () => {
    const artifact: IntentTaxonomy = {
      kind: "intentTaxonomy",
      id: "intentTaxonomy",
      provenance,
      domains: [
        {
          id: "billing",
          name: "Billing",
          intents: ["payment_issue", "billing.refund_request"],
        },
      ],
    };
    expect(validateArtifact(DEFAULT_ONTOLOGY, artifact)).toEqual({ ok: true, issues: [] });
  });

  it("rejects unknown domains and intents", () => {
    const artifact: IntentTaxonomy = {
      kind: "intentTaxonomy",
      id: "intentTaxonomy",
      provenance,
      domains: [
        { name: "NotARealDomain", intents: ["nope"] },
        { id: "billing", name: "Billing", intents: ["not_an_intent"] },
      ],
    };
    const result = validateArtifact(DEFAULT_ONTOLOGY, artifact);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects KPI frames with invented metric names", () => {
    const artifact: KpiFrame = {
      kind: "kpiFrame",
      id: "kpiFrame",
      provenance,
      metrics: [
        { name: "total_contacts", target: 100, unit: "count" },
        { name: "made_up_metric", target: 1, unit: "count" },
      ],
    };
    const result = validateArtifact(DEFAULT_ONTOLOGY, artifact);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("made_up_metric"))).toBe(true);
  });

  it("allows free-form journey maps that do not match a known journey id", () => {
    const artifact: JourneyMap = {
      kind: "journeyMap",
      id: "custom-journey",
      provenance,
      name: "Custom One-Off Journey",
      stages: [
        {
          id: "start",
          name: "Start",
          description: "begin",
          touchpoints: ["chat"],
        },
      ],
    };
    expect(validateArtifact(DEFAULT_ONTOLOGY, artifact).ok).toBe(true);
  });
});

describe("assertKnownIntent", () => {
  it("accepts known intents and rejects unknown", () => {
    expect(assertKnownIntent(DEFAULT_ONTOLOGY, "billing.payment_issue").ok).toBe(true);
    expect(assertKnownIntent(DEFAULT_ONTOLOGY, "billing.nope").ok).toBe(false);
    expect(assertKnownIntent(DEFAULT_ONTOLOGY, "bad").ok).toBe(false);
  });
});

describe("validateOntology integrity", () => {
  it("flags broken stage references", () => {
    const broken = {
      ...DEFAULT_ONTOLOGY,
      journeys: [
        {
          id: "broken",
          name: "Broken",
          triggerIntents: [],
          stages: [{ id: "a", name: "A", nextStages: ["missing"] }],
          terminalStages: ["gone"],
        },
      ],
    };
    const result = validateOntology(broken);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("missing"))).toBe(true);
    expect(result.issues.some((i) => i.message.includes("gone"))).toBe(true);
  });
});
