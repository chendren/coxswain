import type { CxArtifact, CxBuildPlan, CxSpec } from "@cox/cx-core";
import type { Tier } from "@cox/core";

export interface ArtifactStepSpec {
  kind: CxArtifact["kind"];
  tier: Tier;
}

/** The 6 target-neutral artifact kinds this adapter generates.
 * `agentDefinition` is deliberately excluded — see NOTES.md. */
export const ARTIFACT_STEP_SPECS: readonly ArtifactStepSpec[] = [
  { kind: "journeyMap", tier: "architect" },
  { kind: "persona", tier: "architect" },
  { kind: "intentTaxonomy", tier: "architect" },
  { kind: "nbaRuleSet", tier: "architect" },
  { kind: "kpiFrame", tier: "builder" },
  { kind: "architectureDoc", tier: "builder" },
];

function requirementsSummary(spec: CxSpec): string {
  if (spec.requirements.length === 0) return "No requirements recorded.";
  return spec.requirements.map((r) => `${r.id}: ${r.text}`).join("\n");
}

export function buildPlan(spec: CxSpec): CxBuildPlan {
  const description = requirementsSummary(spec);
  return {
    targetId: "artifacts",
    specName: spec.state.name,
    steps: ARTIFACT_STEP_SPECS.map((s) => ({
      id: s.kind,
      description,
      producesArtifactKind: s.kind,
    })),
  };
}
