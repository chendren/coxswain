import { describe, expect, it } from "vitest";
import {
  createMockTargetAdapter,
  isCxAdapterError,
  type CxDeployment,
  type CxHealth,
  type CxSimReport,
  type CxTrafficProfile,
} from "@cox/cx-core";
import { getStatus, runSimulate, runTeardown } from "../src/status";

const dep: CxDeployment = {
  targetId: "local",
  specName: "billing-dispute",
  deployedAt: "2026-08-03T00:00:00Z",
  resources: [],
};

const traffic: CxTrafficProfile = {
  name: "smoke",
  volumePerMinute: 10,
  personaWeights: { a: 1 },
  durationMinutes: 1,
};

describe("cx-ops status commands", () => {
  it("getStatus / runTeardown passthrough", async () => {
    const health: CxHealth = {
      targetId: "local",
      level: "healthy",
      metrics: [],
      checkedAt: "2026-08-03T00:00:00Z",
    };
    const adapter = createMockTargetAdapter("local", {
      status: health,
      capabilities: ["build", "deploy", "status", "simulate", "teardown"],
    });
    await expect(getStatus(adapter, dep)).resolves.toEqual(health);
    await expect(runTeardown(adapter, dep)).resolves.toBeUndefined();
  });

  it("runSimulate refuses when capability missing (intent router)", async () => {
    const adapter = createMockTargetAdapter("artifacts", {
      capabilities: ["build", "deploy", "status", "teardown"],
    });
    await expect(runSimulate(adapter, dep, traffic)).rejects.toSatisfy((e: unknown) => {
      return isCxAdapterError(e) && e.phase === "simulate" && e.targetId === "artifacts";
    });
  });

  it("runSimulate delegates when capability present", async () => {
    const report: CxSimReport = {
      targetId: "local",
      profile: traffic,
      outcomes: [],
      ranAt: "2026-08-03T00:00:00Z",
    };
    const adapter = createMockTargetAdapter("local", {
      simulate: report,
      capabilities: ["simulate", "status"],
    });
    await expect(runSimulate(adapter, dep, traffic)).resolves.toEqual(report);
  });
});
