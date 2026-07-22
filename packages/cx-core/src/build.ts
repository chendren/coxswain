import type { CxArtifact } from "./artifacts";
import type { CxTargetId } from "./target";

export interface CxBuildStep {
  id: string;
  description: string;
  producesArtifactKind: CxArtifact["kind"];
}

export interface CxBuildPlan {
  targetId: CxTargetId;
  specName: string;
  steps: CxBuildStep[];
}

export interface CxDeploymentResource {
  id: string;
  /** Adapter-defined resource kind, e.g. "connect-flow", "platform-journey". */
  kind: string;
  createdAt: string;
}

/** Ordered record of what deploy() created — teardown() consumes it in
 * reverse, per the design's transactional-deploy rule. */
export interface CxDeployment {
  targetId: CxTargetId;
  specName: string;
  deployedAt: string;
  resources: CxDeploymentResource[];
}
