import type { Tier } from "@cox/core";
import type {
  CxArtifact,
  CxBuildPlan,
  CxDeployment,
  CxHealth,
  CxSimReport,
  CxSpec,
  CxTargetAdapter,
  CxTrafficProfile,
} from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";
import { deployArtifacts, statusFromDisk, teardownFromDisk, type DiskDeps } from "./disk";
import { parseArtifact, promptFor } from "./generate";
import { ARTIFACT_STEP_SPECS, buildPlan } from "./plan";

export interface ArtifactsAdapterDeps extends DiskDeps {
  generate: (prompt: string, tier: Tier) => Promise<string>;
}

export function createArtifactsAdapter(deps: ArtifactsAdapterDeps): CxTargetAdapter {
  return {
    id: "artifacts",

    capabilities: () => ["build", "deploy", "status", "teardown"],

    async plan(spec: CxSpec): Promise<CxBuildPlan> {
      return buildPlan(spec);
    },

    async build(plan: CxBuildPlan): Promise<CxArtifact[]> {
      const artifacts: CxArtifact[] = [];
      for (const step of plan.steps) {
        const stepSpec = ARTIFACT_STEP_SPECS.find((s) => s.kind === step.producesArtifactKind);
        if (!stepSpec) {
          throw createCxAdapterError({
            message: `cx-artifacts: no generator registered for artifact kind "${step.producesArtifactKind}"`,
            targetId: "artifacts",
            phase: "build",
            retryable: false,
          });
        }
        const prompt = promptFor(step.producesArtifactKind, plan.specName, step.description);
        const raw = await deps.generate(prompt, stepSpec.tier);
        artifacts.push(parseArtifact(step.producesArtifactKind, raw, { specName: plan.specName, targetId: "artifacts" }));
      }
      return artifacts;
    },

    async deploy(artifacts: CxArtifact[]): Promise<CxDeployment> {
      const specName = artifacts[0]?.provenance.specName;
      if (!specName) {
        throw createCxAdapterError({
          message: "cx-artifacts: deploy() called with no artifacts",
          targetId: "artifacts",
          phase: "deploy",
          retryable: false,
        });
      }
      return deployArtifacts(deps, "artifacts", specName, artifacts);
    },

    async status(dep: CxDeployment): Promise<CxHealth> {
      return statusFromDisk(deps, dep);
    },

    async simulate(_dep: CxDeployment, _traffic: CxTrafficProfile): Promise<CxSimReport> {
      throw createCxAdapterError({
        message: "cx-artifacts: simulate() is not supported — a document factory has no traffic to run against",
        targetId: "artifacts",
        phase: "simulate",
        retryable: false,
      });
    },

    async teardown(dep: CxDeployment): Promise<void> {
      return teardownFromDisk(deps, dep);
    },
  };
}
