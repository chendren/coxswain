import { describe, expect, it } from "vitest";
import { createMockTargetAdapter } from "../src/mock-adapter";
import { isCxAdapterError } from "../src/errors";
import type { CxBuildPlan, CxDeployment } from "../src/build";
import type { CxSpec } from "../src/spec";

const spec: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [],
};

describe("createMockTargetAdapter", () => {
  it("returns the configured plan() result", async () => {
    const plan: CxBuildPlan = { targetId: "local", specName: "billing-dispute", steps: [] };
    const adapter = createMockTargetAdapter("local", { plan });
    await expect(adapter.plan(spec)).resolves.toEqual(plan);
  });

  it("supports a function script for build()", async () => {
    const adapter = createMockTargetAdapter("local", {
      build: (p) => [
        {
          kind: "kpiFrame",
          id: "kpi-1",
          metrics: [],
          provenance: { specName: p.specName, phase: "tasks", targetId: p.targetId },
        },
      ],
    });
    const plan: CxBuildPlan = { targetId: "local", specName: "billing-dispute", steps: [] };
    const result = await adapter.build(plan);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("kpiFrame");
  });

  it("throws a CxAdapterError when a method has no script configured", async () => {
    const adapter = createMockTargetAdapter("aws", {});
    await expect(adapter.plan(spec)).rejects.toSatisfy((e: unknown) => {
      return isCxAdapterError(e) && e.targetId === "aws" && e.phase === "plan" && !e.retryable;
    });
  });

  it("teardown is a no-op by default and capabilities() defaults to the full set", async () => {
    const adapter = createMockTargetAdapter("artifacts", {});
    const dep: CxDeployment = {
      targetId: "artifacts",
      specName: "billing-dispute",
      deployedAt: "2026-07-22T00:00:00Z",
      resources: [],
    };
    await expect(adapter.teardown(dep)).resolves.toBeUndefined();
    expect(adapter.capabilities()).toEqual(["build", "deploy", "status", "simulate", "teardown"]);
  });
});
