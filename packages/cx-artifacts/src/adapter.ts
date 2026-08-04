import type { Tier } from "@cox/core";
import type {
  CxArtifact,
  CxBuildPlan,
  CxDeployment,
  CxHealth,
  CxOntology,
  CxSimReport,
  CxSpec,
  CxTargetAdapter,
  CxTrafficProfile,
} from "@cox/cx-core";
import {
  createCxAdapterError,
  DEFAULT_ONTOLOGY,
  runClosedWorldPass,
} from "@cox/cx-core";
import { deployArtifacts, statusFromDisk, teardownFromDisk, type DiskDeps } from "./disk";
import { parseArtifact, promptFor } from "./generate";
import { ARTIFACT_STEP_SPECS, buildPlan } from "./plan";

export interface ArtifactsAdapterDeps extends DiskDeps {
  generate: (prompt: string, tier: Tier) => Promise<string>;
  /** Closed-world ontology for prompts + strong/weak graph absorption. */
  ontology?: CxOntology;
  /**
   * When true (default), KPI/intent weak labels are absorbed into strong
   * ontology ids after parse. Unknown closed-set labels are dropped or fail
   * the step if nothing remains resolvable for required kinds.
   */
  absorbWeak?: boolean;
}

export function createArtifactsAdapter(deps: ArtifactsAdapterDeps): CxTargetAdapter {
  const ontology = deps.ontology ?? DEFAULT_ONTOLOGY;
  const absorbWeak = deps.absorbWeak !== false;

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
        const prompt = promptFor(
          step.producesArtifactKind,
          plan.specName,
          step.description,
          ontology,
        );
        const raw = await deps.generate(prompt, stepSpec.tier);
        let artifact = parseArtifact(step.producesArtifactKind, raw, {
          specName: plan.specName,
          targetId: "artifacts",
        });

        // Graph-node practice: strong graph resolve + optional absorb of weak labels
        // Hard closed-world only for intentTaxonomy + kpiFrame (journey maps stay free-form).
        if (artifact.kind === "kpiFrame" || artifact.kind === "intentTaxonomy") {
          const pass = runClosedWorldPass(ontology, artifact, { absorb: absorbWeak });
          if (!pass.state.ok || !pass.artifact) {
            throw createCxAdapterError({
              message: `cx-artifacts: closed-world validation failed for "${artifact.kind}": ${pass.state.errors.join("; ")}`,
              targetId: "artifacts",
              phase: "build",
              retryable: false,
            });
          }
          artifact = pass.artifact;
        }

        artifacts.push(artifact);
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
