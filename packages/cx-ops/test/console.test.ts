import { describe, expect, it } from "vitest";
import { createMockTargetAdapter, type CxDeployment, type CxHealth } from "@cox/cx-core";
import { runConsoleTick } from "../src/console";

const dep: CxDeployment = {
  targetId: "local",
  specName: "demo",
  deployedAt: "2026-08-03T00:00:00Z",
  resources: [],
};

describe("runConsoleTick", () => {
  it("routes healthy → none and degraded → investigate + NBA", async () => {
    const healthy: CxHealth = {
      targetId: "artifacts",
      level: "healthy",
      metrics: [],
      checkedAt: "2026-08-03T00:00:00Z",
    };
    const degraded: CxHealth = {
      targetId: "local",
      level: "degraded",
      metrics: [{ name: "missingCount", value: 1, unit: "count" }],
      checkedAt: "2026-08-03T00:00:00Z",
    };

    const tick = await runConsoleTick(
      [
        {
          targetId: "artifacts",
          adapter: createMockTargetAdapter("artifacts", {
            status: healthy,
            capabilities: ["status"],
          }),
          dep: { ...dep, targetId: "artifacts" },
        },
        {
          targetId: "local",
          adapter: createMockTargetAdapter("local", {
            status: degraded,
            capabilities: ["status"],
          }),
          dep: { ...dep, targetId: "local" },
          nbaContext: {
            journey: "churn_prevention",
            stage: "cancel_requested",
            confidence: 0.9,
          },
        },
      ],
      { now: () => "2026-08-03T20:00:00Z" },
    );

    expect(tick.proposals).toHaveLength(2);
    expect(tick.proposals[0]?.kind).toBe("none");
    expect(tick.proposals[1]?.kind).toBe("investigate");
    expect(tick.proposals[1]?.nba?.primary?.id).toBe("CHURN_RISK_HIGH");
    expect(tick.path).toContain("poll_status");
    expect(tick.proposals[1]?.summary).toContain("human gate");
  });
});
