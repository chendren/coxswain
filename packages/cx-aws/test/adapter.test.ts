import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAwsAdapter, type AwsAdapterDeps } from "../src/adapter";
import type { CxSpec } from "@cox/cx-core";
import { isCxAdapterError } from "@cox/cx-core";

const journeyMap = {
  kind: "journeyMap" as const,
  id: "journeyMap",
  provenance: { specName: "billing-dispute", phase: "design" as const, targetId: "artifacts" as const },
  name: "Dispute resolution",
  stages: [{ id: "s1", name: "Report", description: "Customer reports the charge", touchpoints: ["phone"] }],
};

const spec: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [],
  design: { journeyMaps: [journeyMap], personas: [] },
};

const RESPONSES: Record<string, string> = {
  architectureDoc: JSON.stringify({
    title: "Dispute resolution CX stack",
    markdown: "AWSTemplateFormatVersion: '2010-09-09'",
  }),
  agentDefinition: JSON.stringify({
    name: "Dispute resolution agent",
    systemPrompt: "You handle the dispute resolution journey.",
    tools: ["classify-dispute"],
  }),
};

function makeDeps(cxRoot: string): AwsAdapterDeps {
  return {
    cxRoot,
    now: () => "2026-07-22T00:00:00Z",
    generate: async (prompt) => {
      if (prompt.includes("Connect")) return RESPONSES.architectureDoc!;
      if (prompt.includes("Bedrock Agent's behavior")) return RESPONSES.agentDefinition!;
      throw new Error(`test stub: no scripted response matches prompt: ${prompt}`);
    },
  };
}

describe("createAwsAdapter", () => {
  let cxRoot: string;

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-aws-adapter-"));
  });

  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("has id 'aws' and capabilities excluding simulate", () => {
    const adapter = createAwsAdapter(makeDeps(cxRoot));
    expect(adapter.id).toBe("aws");
    expect(adapter.capabilities()).toEqual(["build", "deploy", "status", "teardown"]);
  });

  it("plan() -> build() -> deploy() -> status() round-trips both artifacts", async () => {
    const adapter = createAwsAdapter(makeDeps(cxRoot));
    const plan = await adapter.plan(spec);
    expect(plan.steps).toHaveLength(2);
    const artifacts = await adapter.build(plan);
    expect(artifacts.map((a) => a.kind).sort()).toEqual(["agentDefinition", "architectureDoc"]);
    const dep = await adapter.deploy(artifacts);
    expect(dep.resources).toHaveLength(2);
    const health = await adapter.status(dep);
    expect(health.level).toBe("healthy");
  });

  it("teardown() removes what deploy() created", async () => {
    const adapter = createAwsAdapter(makeDeps(cxRoot));
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    const dep = await adapter.deploy(artifacts);
    await adapter.teardown(dep);
    const health = await adapter.status(dep);
    expect(health.level).toBe("down");
  });

  it("simulate() throws a non-retryable CxAdapterError", async () => {
    const adapter = createAwsAdapter(makeDeps(cxRoot));
    try {
      await adapter.simulate(
        { targetId: "aws", specName: "x", deployedAt: "2026-07-22T00:00:00Z", resources: [] },
        { name: "peak", volumePerMinute: 10, personaWeights: {}, durationMinutes: 5 },
      );
      throw new Error("expected simulate() to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("simulate");
        expect(e.retryable).toBe(false);
      }
    }
  });
});
