import { describe, expect, it } from "vitest";
import {
  createMockTargetAdapter,
  type CxDeployment,
  type CxHealth,
  type CxSimReport,
  type CxTrafficProfile,
} from "@cox/cx-core";
import { generateReport } from "../src/report";

const traffic: CxTrafficProfile = {
  name: "smoke",
  volumePerMinute: 5,
  personaWeights: { p: 1 },
  durationMinutes: 1,
};

function dep(targetId: "artifacts" | "local" | "aws"): CxDeployment {
  return {
    targetId,
    specName: "billing-dispute",
    deployedAt: "2026-08-03T00:00:00Z",
    resources: [],
  };
}

describe("generateReport", () => {
  it("aggregates multi-target status, simulates when capable, summarizes once at scout", async () => {
    const healthy: CxHealth = {
      targetId: "local",
      level: "healthy",
      metrics: [{ name: "total_contacts", value: 10, unit: "count" }],
      checkedAt: "2026-08-03T00:00:00Z",
    };
    const sim: CxSimReport = {
      targetId: "local",
      profile: traffic,
      outcomes: [{ kpiName: "total_contacts", achieved: 10, target: 10 }],
      ranAt: "2026-08-03T00:00:00Z",
    };

    const local = createMockTargetAdapter("local", {
      status: healthy,
      simulate: sim,
      capabilities: ["status", "simulate", "teardown"],
    });
    const broken = createMockTargetAdapter("aws", {
      status: () => {
        throw new Error("aws down");
      },
      capabilities: ["status"],
    });
    const docs = createMockTargetAdapter("artifacts", {
      status: {
        targetId: "artifacts",
        level: "healthy",
        metrics: [],
        checkedAt: "2026-08-03T00:00:00Z",
      },
      capabilities: ["status", "build", "deploy", "teardown"],
    });

    const calls: { tier: string }[] = [];
    const report = await generateReport(
      {
        generate: async (_p, tier) => {
          calls.push({ tier });
          return "All systems mostly fine.";
        },
        now: () => "2026-08-03T12:00:00Z",
      },
      "billing-dispute",
      [
        { targetId: "local", adapter: local, dep: dep("local"), traffic },
        { targetId: "aws", adapter: broken, dep: dep("aws") },
        { targetId: "artifacts", adapter: docs, dep: dep("artifacts"), traffic },
      ],
    );

    expect(report.targets).toHaveLength(3);
    expect(report.targets.find((t) => t.targetId === "local")?.simReport).toEqual(sim);
    expect(report.targets.find((t) => t.targetId === "aws")?.error).toContain("aws down");
    // artifacts has traffic but no simulate capability — no simReport
    expect(report.targets.find((t) => t.targetId === "artifacts")?.simReport).toBeUndefined();
    expect(calls).toEqual([{ tier: "scout" }]);
    expect(report.summary).toBe("All systems mostly fine.");
    expect(report.path).toContain("aggregate_status");
    expect(report.path).toContain("scout_summary");
    expect(report.path).toContain("emit");
  });
});
