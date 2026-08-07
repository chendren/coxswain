/**
 * Offline CXOS e2e: golden path via runCxRun + orchestrate layer.
 * Temp dir, createOfflineCxRuntime / orchestrate* from @cox/cx-ops.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCxSpec,
  loadCxWorkspace,
  loadDeployments,
  approveCxPhase,
  orchestrateBuild,
  orchestrateStatus,
  orchestrateSimulate,
  orchestrateReport,
} from "@cox/cx-ops";
import { createOfflineCxRuntime } from "../src/cx/runtime";
import { runCxRun, type CxCommandContext } from "../src/commands/cx";

describe("CXOS offline e2e (cx run)", () => {
  let cwd: string;
  const now = () => "2026-08-06T12:00:00Z";

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "cox-cx-e2e-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  function lines(): { write: (line: string) => void; out: string[] } {
    const out: string[] = [];
    return {
      out,
      write: (line: string) => {
        out.push(line);
      },
    };
  }

  function ctx(write: (line: string) => void): CxCommandContext {
    return {
      cwd,
      write,
      mode: "offline",
      pack: "local",
    };
  }

  it("runCxRun: missing spec → create → approve → build all → status → sim local → report", async () => {
    const { write, out } = lines();
    const code = await runCxRun(
      ctx(write),
      "billing-dispute",
      ["reduce dispute handle time"],
      "all",
    );

    expect(code).toBe(0);

    const joined = out.join("\n");
    expect(joined).toMatch(/creating CX spec/);
    expect(joined).toMatch(/approving requirements/);
    expect(joined).toMatch(/build artifacts: ok/);
    expect(joined).toMatch(/build local: ok/);
    expect(joined).toMatch(/build aws: ok/);
    expect(joined).toMatch(/status (artifacts|local|aws):/);
    expect(joined).toMatch(/simulate local:/);
    expect(joined).toMatch(/summary:/);
    expect(joined).toMatch(/ok=true/);
    expect(joined).toMatch(/path:/);
    expect(joined).toMatch(/next steps:/);
    expect(joined).toMatch(/cox cx console billing-dispute/);
    expect(joined).toMatch(/cox cx apply billing-dispute/);
    expect(joined).toMatch(/cox cx daemon start billing-dispute/);

    const rt = createOfflineCxRuntime({ cwd, now });
    const record = await loadCxWorkspace(rt.workspace, "billing-dispute");
    expect(record).not.toBeNull();
    expect(record!.spec.state.phases.requirements).toBe("approved");
    expect(record!.spec.design?.journeyMaps.length).toBeGreaterThan(0);

    const deps = await loadDeployments(rt.workspace, "billing-dispute");
    expect(deps.deployments.artifacts).toBeDefined();
    expect(deps.deployments.local).toBeDefined();
    expect(deps.deployments.aws).toBeDefined();
  });

  it("runCxRun: existing approved spec skips create/approve and rebuilds", async () => {
    const rt0 = createOfflineCxRuntime({ cwd, now });
    let record = await createCxSpec(
      rt0.workspace,
      "existing",
      "existing idea",
    );
    record = await approveCxPhase(rt0.workspace, "existing", "requirements");
    expect(record.spec.state.phases.requirements).toBe("approved");

    const { write, out } = lines();
    const code = await runCxRun(ctx(write), "existing", [], "all");
    expect(code).toBe(0);

    const joined = out.join("\n");
    expect(joined).toMatch(/already exists/);
    expect(joined).not.toMatch(/creating CX spec/);
    expect(joined).not.toMatch(/approving requirements/);
    expect(joined).toMatch(/ok=true/);

    const deps = await loadDeployments(rt0.workspace, "existing");
    expect(deps.deployments.local).toBeDefined();
  });

  it("orchestrate layer offline: build ok and deployments exist", async () => {
    const rt = createOfflineCxRuntime({ cwd, now });
    const ws = rt.workspace;
    let record = await createCxSpec(ws, "orch-only", "orchestrate layer path");
    record = await approveCxPhase(ws, "orch-only", "requirements");

    const orchDeps = {
      ...ws,
      adapters: rt.adapters,
      ontology: rt.ontology,
    };

    const built = await orchestrateBuild(
      orchDeps,
      record,
      ["artifacts", "local", "aws"],
      { deploy: true },
    );
    expect(built.ok).toBe(true);
    expect(built.targets.every((t) => !t.error && t.deployment)).toBe(true);
    expect(built.path).toContain("build:artifacts");
    expect(built.path).toContain("deploy:local");

    const deps = await loadDeployments(ws, "orch-only");
    expect(deps.deployments.artifacts).toBeDefined();
    expect(deps.deployments.local).toBeDefined();
    expect(deps.deployments.aws).toBeDefined();

    const reloaded = await loadCxWorkspace(ws, "orch-only");
    expect(reloaded?.spec.design?.journeyMaps.length).toBeGreaterThan(0);

    const status = await orchestrateStatus(
      orchDeps,
      reloaded!,
      deps.deployments,
      ["artifacts", "local", "aws"],
    );
    expect(status.ok).toBe(true);
    expect(status.targets.every((t) => t.health?.level === "healthy")).toBe(true);

    const sim = await orchestrateSimulate(
      orchDeps,
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
      orchDeps,
      reloaded!,
      deps.deployments,
      ["artifacts", "local", "aws"],
      {
        name: "smoke",
        volumePerMinute: 5,
        personaWeights: { p: 1 },
        durationMinutes: 1,
      },
      { journey: "billing_dispute", stage: "under_review", confidence: 0.75 },
    );
    expect(report.report?.summary.length).toBeGreaterThan(0);
    expect(report.path).toContain("recommend_nba");
  });
});
