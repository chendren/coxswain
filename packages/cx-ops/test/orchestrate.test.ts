import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCxSpec,
  createOfflineArtifactsAdapter,
  createOfflineAwsAdapter,
  createOfflineLocalAdapter,
  loadDeployments,
  loadCxWorkspace,
  orchestrateBuild,
  orchestrateReport,
  orchestrateSimulate,
  orchestrateStatus,
  approveCxPhase,
} from "../src/index";

describe("CXOS offline graph orchestration", () => {
  let cxRoot: string;
  const now = () => "2026-08-03T18:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-orch-"));
  });

  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("new → approve → build all targets → status → simulate → report", async () => {
    const ws = { cxRoot, now };
    let record = await createCxSpec(ws, "billing-dispute", "reduce dispute handle time");
    record = await approveCxPhase(ws, "billing-dispute", "requirements");

    const adapters = {
      artifacts: createOfflineArtifactsAdapter({ cxRoot, now }),
      local: createOfflineLocalAdapter({ cxRoot, now }),
      aws: createOfflineAwsAdapter({ cxRoot, now }),
    };

    const built = await orchestrateBuild(
      { ...ws, adapters },
      record,
      ["artifacts", "local", "aws"],
      { deploy: true },
    );
    expect(built.ok).toBe(true);
    expect(built.targets.every((t) => !t.error)).toBe(true);
    expect(built.path).toContain("build:artifacts");
    expect(built.path).toContain("merge_design");
    expect(built.path).toContain("deploy:local");

    const reloaded = await loadCxWorkspace(ws, "billing-dispute");
    expect(reloaded?.spec.design?.journeyMaps.length).toBeGreaterThan(0);
    expect(reloaded?.spec.state.phases.design).toBe("approved");
    expect(built.path).toContain("auto_approve_design");

    const deps = await loadDeployments(ws, "billing-dispute");
    expect(deps.deployments.artifacts).toBeDefined();
    expect(deps.deployments.local).toBeDefined();
    expect(deps.deployments.aws).toBeDefined();

    const status = await orchestrateStatus(
      { ...ws, adapters },
      reloaded!,
      deps.deployments,
      ["artifacts", "local", "aws"],
    );
    expect(status.ok).toBe(true);
    expect(status.targets.every((t) => t.health?.level === "healthy")).toBe(true);

    const sim = await orchestrateSimulate(
      { ...ws, adapters },
      reloaded!,
      deps.deployments,
      ["local"],
      {
        name: "smoke",
        volumePerMinute: 10,
        personaWeights: { p: 1 },
        durationMinutes: 1,
      },
    );
    expect(sim.ok).toBe(true);
    expect(sim.targets[0]?.sim?.outcomes.length).toBeGreaterThan(0);

    const report = await orchestrateReport(
      { ...ws, adapters },
      reloaded!,
      deps.deployments,
      ["artifacts", "local", "aws"],
      {
        name: "smoke",
        volumePerMinute: 5,
        personaWeights: { p: 1 },
        durationMinutes: 1,
      },
      { journey: "churn_prevention", stage: "cancel_requested", confidence: 0.9 },
    );
    expect(report.report?.summary.length).toBeGreaterThan(0);
    expect(report.nba?.primary?.id).toBe("CHURN_RISK_HIGH");
    expect(report.path).toContain("recommend_nba");
  });
});
