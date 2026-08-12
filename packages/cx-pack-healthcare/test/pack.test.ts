import { describe, expect, it } from "vitest";
import type { CxSpec, CxOntology } from "@cox/cx-core";
import { seedHealthcareDesignPack } from "../src/index";

const sampleSpec: CxSpec = {
  state: {
    name: "pack-test-spec",
    createdAt: "2026-08-12T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [
    { id: "R1.1", text: "WHEN a customer needs help, THE SYSTEM SHALL resolve within policy" },
  ],
};

const emptyOntology = {
  version: "test",
  source: "test",
  domains: [],
  journeys: [],
  nbaRules: [],
  actionPolicies: {},
  kpis: [],
  channels: [],
  sentiments: [],
  urgencies: [],
  actionTypes: [],
  targets: [],
  capabilities: [],
  opsModes: [],
  artifactKinds: [],
} as unknown as CxOntology;

describe("cx-pack-healthcare", () => {
  it("generates >=5 journeyMap artifacts and exactly 1 architectureDoc", () => {
    const artifacts = seedHealthcareDesignPack(sampleSpec, emptyOntology);

    const journeyMaps = artifacts.filter((a) => a.kind === "journeyMap");
    const architectureDocs = artifacts.filter((a) => a.kind === "architectureDoc");

    expect(journeyMaps.length).toBeGreaterThanOrEqual(5);
    expect(architectureDocs.length).toBe(1);
  });

  it("all artifacts have correct provenance.specName", () => {
    const artifacts = seedHealthcareDesignPack(sampleSpec, emptyOntology);

    for (const artifact of artifacts) {
      expect(artifact.provenance?.specName).toBe(sampleSpec.state.name);
    }
  });

  it("journey ids are unique and non-empty stages", () => {
    const artifacts = seedHealthcareDesignPack(sampleSpec, emptyOntology);
    const journeyMaps = artifacts.filter((a) => a.kind === "journeyMap") as any[];

    const ids = new Set<string>();
    for (const map of journeyMaps) {
      expect(map.id).toBeDefined();
      expect(typeof map.id).toBe("string");
      expect(map.id.length).toBeGreaterThan(0);
      expect(ids.has(map.id)).toBe(false);
      ids.add(map.id);

      // Check non-empty stages
      expect(Array.isArray(map.stages)).toBe(true);
      expect(map.stages.length).toBeGreaterThan(0);
    }
  });

  it("does not embed obvious PHI patterns in artifacts", () => {
    const artifacts = seedHealthcareDesignPack(sampleSpec, emptyOntology);
    const jsonStr = JSON.stringify(artifacts);

    // SSN pattern: ###-##-####
    expect(jsonStr).not.toMatch(/\d{3}-\d{2}-\d{4}/);

    // Email pattern with @
    expect(jsonStr).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  });
});
