import type {
  CxDeployment,
  CxHealth,
  CxSimReport,
  CxTargetAdapter,
  CxTrafficProfile,
} from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

/** Thin passthrough — node: status. */
export async function getStatus(
  adapter: CxTargetAdapter,
  dep: CxDeployment,
): Promise<CxHealth> {
  return adapter.status(dep);
}

/**
 * Capability-gated simulate. Intent router: refuse before adapter call if
 * the target does not declare `"simulate"`.
 */
export async function runSimulate(
  adapter: CxTargetAdapter,
  dep: CxDeployment,
  traffic: CxTrafficProfile,
): Promise<CxSimReport> {
  if (!adapter.capabilities().includes("simulate")) {
    throw createCxAdapterError({
      message: `cx-ops: target "${adapter.id}" does not support simulate`,
      targetId: adapter.id,
      phase: "simulate",
      retryable: false,
    });
  }
  return adapter.simulate(dep, traffic);
}

/** Thin passthrough — node: teardown. */
export async function runTeardown(
  adapter: CxTargetAdapter,
  dep: CxDeployment,
): Promise<void> {
  return adapter.teardown(dep);
}
