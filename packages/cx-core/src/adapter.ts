import type { CxArtifact } from "./artifacts";
import type { CxBuildPlan, CxDeployment } from "./build";
import type { CxHealth, CxSimReport, CxTrafficProfile } from "./operate";
import type { CxSpec } from "./spec";
import type { CxCapability, CxTargetId } from "./target";

/** Implemented by each build/operate target: cx-artifacts, cx-local, cx-aws. */
export interface CxTargetAdapter {
  readonly id: CxTargetId;
  capabilities(): CxCapability[];
  plan(spec: CxSpec): Promise<CxBuildPlan>;
  build(plan: CxBuildPlan): Promise<CxArtifact[]>;
  deploy(artifacts: CxArtifact[]): Promise<CxDeployment>;
  status(dep: CxDeployment): Promise<CxHealth>;
  simulate(dep: CxDeployment, traffic: CxTrafficProfile): Promise<CxSimReport>;
  teardown(dep: CxDeployment): Promise<void>;
}
