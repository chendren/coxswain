import type { CxArtifact, CxBuildPlan, CxSpec } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";
import type { Tier } from "@cox/core";

export interface AwsStepSpec {
  kind: CxArtifact["kind"];
  tier: Tier;
}

/** The 2 artifacts this adapter generates: the CloudFormation template
 * (architect tier — infrastructure design) and the Bedrock Agent's own
 * behavior definition (builder tier — mechanical derivation from the
 * template's declared resources). */
export const AWS_STEP_SPECS: readonly AwsStepSpec[] = [
  { kind: "architectureDoc", tier: "architect" },
  { kind: "agentDefinition", tier: "builder" },
];

export function buildPlan(spec: CxSpec): CxBuildPlan {
  const journeyMap = spec.design?.journeyMaps[0];
  if (!journeyMap) {
    throw createCxAdapterError({
      message: `cx-aws: spec "${spec.state.name}" has no design.journeyMaps — run the artifacts adapter's build phase first`,
      targetId: "aws",
      phase: "plan",
      retryable: false,
    });
  }
  const description = JSON.stringify({ journeyMap });
  return {
    targetId: "aws",
    specName: spec.state.name,
    steps: AWS_STEP_SPECS.map((s) => ({
      id: s.kind,
      description,
      producesArtifactKind: s.kind,
    })),
  };
}
