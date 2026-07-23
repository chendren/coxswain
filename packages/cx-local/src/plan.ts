import type { CxBuildPlan, CxSpec } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

export function buildPlan(spec: CxSpec): CxBuildPlan {
  const journeyMap = spec.design?.journeyMaps[0];
  if (!journeyMap) {
    throw createCxAdapterError({
      message: `cx-local: spec "${spec.state.name}" has no design.journeyMaps — run the artifacts adapter's build phase first`,
      targetId: "local",
      phase: "plan",
      retryable: false,
    });
  }
  return {
    targetId: "local",
    specName: spec.state.name,
    steps: [
      {
        id: "bind",
        description: JSON.stringify({ journeyMap }),
        producesArtifactKind: "agentDefinition",
      },
    ],
  };
}
