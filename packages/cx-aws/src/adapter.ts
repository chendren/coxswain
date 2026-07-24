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
import { agentPrompt, parseAgentDefinition } from "./agent";
import { deployArtifacts, statusFromDisk, teardownFromDisk, type DiskDeps } from "./disk";
import { AWS_STEP_SPECS, buildPlan } from "./plan";
import { parseArchitectureDoc, templatePrompt } from "./template";

export interface AwsAdapterDeps extends DiskDeps {
  generate: (prompt: string, tier: Tier) => Promise<string>;
}

interface BindStepPayload {
  journeyMap: Extract<CxArtifact, { kind: "journeyMap" }>;
}

export function createAwsAdapter(deps: AwsAdapterDeps): CxTargetAdapter {
  return {
    id: "aws",

    capabilities: () => ["build", "deploy", "status", "teardown"],

    async plan(spec: CxSpec): Promise<CxBuildPlan> {
      return buildPlan(spec);
    },

    async build(plan: CxBuildPlan): Promise<CxArtifact[]> {
      const artifacts: CxArtifact[] = [];
      for (const step of plan.steps) {
        const stepSpec = AWS_STEP_SPECS.find((s) => s.kind === step.producesArtifactKind);
        if (!stepSpec) {
          throw createCxAdapterError({
            message: `cx-aws: no generator registered for artifact kind "${step.producesArtifactKind}"`,
            targetId: "aws",
            phase: "build",
            retryable: false,
          });
        }
        const { journeyMap } = JSON.parse(step.description) as BindStepPayload;

        if (step.producesArtifactKind === "architectureDoc") {
          const stageNames = journeyMap.stages.map((s) => s.name).join(", ");
          const raw = await deps.generate(templatePrompt(journeyMap.name, stageNames), stepSpec.tier);
          artifacts.push(parseArchitectureDoc(raw, plan.specName, "aws"));
        } else if (step.producesArtifactKind === "agentDefinition") {
          const raw = await deps.generate(agentPrompt(journeyMap.name), stepSpec.tier);
          artifacts.push(parseAgentDefinition(raw, plan.specName, "aws"));
        } else {
          throw createCxAdapterError({
            message: `cx-aws: no dispatch branch for artifact kind "${step.producesArtifactKind}" (present in AWS_STEP_SPECS but not handled in build())`,
            targetId: "aws",
            phase: "build",
            retryable: false,
          });
        }
      }
      return artifacts;
    },

    async deploy(artifacts: CxArtifact[]): Promise<CxDeployment> {
      const specName = artifacts[0]?.provenance.specName;
      if (!specName) {
        throw createCxAdapterError({
          message: "cx-aws: deploy() called with no artifacts",
          targetId: "aws",
          phase: "deploy",
          retryable: false,
        });
      }
      return deployArtifacts(deps, "aws", specName, artifacts);
    },

    async status(dep: CxDeployment): Promise<CxHealth> {
      return statusFromDisk(deps, dep);
    },

    async simulate(_dep: CxDeployment, _traffic: CxTrafficProfile): Promise<CxSimReport> {
      throw createCxAdapterError({
        message: "cx-aws: simulate() is not supported — no live AWS stack exists to run traffic against",
        targetId: "aws",
        phase: "simulate",
        retryable: false,
      });
    },

    async teardown(dep: CxDeployment): Promise<void> {
      return teardownFromDisk(deps, dep);
    },
  };
}
