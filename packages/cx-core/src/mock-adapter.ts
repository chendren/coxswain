import type { CxArtifact } from "./artifacts";
import type { CxTargetAdapter } from "./adapter";
import type { CxBuildPlan, CxDeployment } from "./build";
import { createCxAdapterError } from "./errors";
import type { CxHealth, CxSimReport, CxTrafficProfile } from "./operate";
import type { CxSpec } from "./spec";
import type { CxCapability, CxTargetId } from "./target";

/** Each field is either a fixed result or a function of its inputs — mirrors
 * @cox/providers's createMockModel() scripting style. Omitted methods throw
 * a CxAdapterError naming the phase, so a test's intent (which methods it
 * actually exercises) stays visible in the script it configures. */
export interface MockAdapterScript {
  capabilities?: CxCapability[];
  plan?: CxBuildPlan | ((spec: CxSpec) => CxBuildPlan);
  build?: CxArtifact[] | ((plan: CxBuildPlan) => CxArtifact[]);
  deploy?: CxDeployment | ((artifacts: CxArtifact[]) => CxDeployment);
  status?: CxHealth | ((dep: CxDeployment) => CxHealth);
  simulate?: CxSimReport | ((dep: CxDeployment, traffic: CxTrafficProfile) => CxSimReport);
}

const DEFAULT_CAPABILITIES: CxCapability[] = ["build", "deploy", "status", "simulate", "teardown"];

function resolveOrThrow<TIn extends unknown[], TOut>(
  id: CxTargetId,
  phase: "plan" | "build" | "deploy" | "status" | "simulate",
  scripted: TOut | ((...args: TIn) => TOut) | undefined,
  args: TIn,
): TOut {
  if (scripted === undefined) {
    throw createCxAdapterError({
      message: `mock adapter "${id}": no ${phase}() script configured`,
      targetId: id,
      phase,
      retryable: false,
    });
  }
  return typeof scripted === "function" ? (scripted as (...a: TIn) => TOut)(...args) : scripted;
}

export function createMockTargetAdapter(id: CxTargetId, script: MockAdapterScript): CxTargetAdapter {
  return {
    id,
    capabilities: () => script.capabilities ?? DEFAULT_CAPABILITIES,
    async plan(spec) {
      return resolveOrThrow(id, "plan", script.plan, [spec]);
    },
    async build(plan) {
      return resolveOrThrow(id, "build", script.build, [plan]);
    },
    async deploy(artifacts) {
      return resolveOrThrow(id, "deploy", script.deploy, [artifacts]);
    },
    async status(dep) {
      return resolveOrThrow(id, "status", script.status, [dep]);
    },
    async simulate(dep, traffic) {
      return resolveOrThrow(id, "simulate", script.simulate, [dep, traffic]);
    },
    async teardown(_dep) {
      // No-op by default. Tests that need to assert teardown behavior wrap
      // the adapter returned here with their own spy.
    },
  };
}
