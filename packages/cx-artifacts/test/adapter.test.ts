import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArtifactsAdapter, type ArtifactsAdapterDeps } from "../src/adapter";
import type { CxSpec } from "@cox/cx-core";
import { isCxAdapterError } from "@cox/cx-core";

const spec: CxSpec = {
  state: {
    name: "billing-dispute",
    createdAt: "2026-07-22T00:00:00Z",
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    tasks: [],
    approvals: [],
  },
  requirements: [{ id: "R1.1", text: "resolve disputes fast" }],
};

const RESPONSES: Record<string, string> = {
  journeyMap: JSON.stringify({ name: "Dispute journey", stages: [] }),
  persona: JSON.stringify({ name: "Alex", goals: [], painPoints: [] }),
  intentTaxonomy: JSON.stringify({
    domains: [{ id: "billing", name: "Billing", intents: ["payment_issue", "billing_inquiry"] }],
  }),
  nbaRuleSet: JSON.stringify({ rules: [] }),
  kpiFrame: JSON.stringify({ metrics: [{ name: "total_contacts", target: 300, unit: "count" }] }),
  architectureDoc: JSON.stringify({ title: "Dispute architecture", markdown: "# Design" }),
};

// Distinctive lowercase phrases that actually appear in each artifact
// kind's real promptFor() text (verbatim from generate.ts) — the kind
// names themselves ("journeyMap", "nbaRuleSet", ...) do NOT appear as
// contiguous substrings in the prompt prose, so matching on the key name
// directly would fail for 5 of 6 kinds.
const PROMPT_PHRASE: Record<string, string> = {
  journeyMap: "customer journey",
  persona: "customer persona",
  intentTaxonomy: "intent taxonomy",
  nbaRuleSet: "next-best-action rules",
  kpiFrame: "kpi frame",
  architectureDoc: "cx architecture",
};

// Expected tier per artifact kind, straight from ARTIFACT_STEP_SPECS in plan.ts.
const EXPECTED_TIER: Record<string, string> = {
  journeyMap: "architect",
  persona: "architect",
  intentTaxonomy: "architect",
  nbaRuleSet: "architect",
  kpiFrame: "builder",
  architectureDoc: "builder",
};

function makeDeps(cxRoot: string): ArtifactsAdapterDeps & { calls: { prompt: string; tier: string }[] } {
  const calls: { prompt: string; tier: string }[] = [];
  return {
    cxRoot,
    now: () => "2026-07-22T00:00:00Z",
    generate: async (prompt, tier) => {
      calls.push({ prompt, tier });
      const lower = prompt.toLowerCase();
      for (const [k, phrase] of Object.entries(PROMPT_PHRASE)) {
        if (lower.includes(phrase)) return RESPONSES[k]!;
      }
      throw new Error(`test stub: no scripted response matches prompt: ${prompt}`);
    },
    calls,
  };
}

describe("createArtifactsAdapter", () => {
  let cxRoot: string;

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-artifacts-adapter-"));
  });

  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("has id 'artifacts' and capabilities excluding simulate", () => {
    const adapter = createArtifactsAdapter(makeDeps(cxRoot));
    expect(adapter.id).toBe("artifacts");
    expect(adapter.capabilities()).toEqual(["build", "deploy", "status", "teardown"]);
  });

  it("plan() -> build() -> deploy() -> status() round-trips all 6 artifacts", async () => {
    const adapter = createArtifactsAdapter(makeDeps(cxRoot));
    const plan = await adapter.plan(spec);
    expect(plan.steps).toHaveLength(6);
    const artifacts = await adapter.build(plan);
    expect(artifacts).toHaveLength(6);
    const dep = await adapter.deploy(artifacts);
    expect(dep.resources).toHaveLength(6);
    const health = await adapter.status(dep);
    expect(health.level).toBe("healthy");
  });

  it("build() forwards the correct tier per artifact kind to deps.generate", async () => {
    const deps = makeDeps(cxRoot);
    const adapter = createArtifactsAdapter(deps);
    const plan = await adapter.plan(spec);
    await adapter.build(plan);

    expect(deps.calls).toHaveLength(6);
    for (const [kind, phrase] of Object.entries(PROMPT_PHRASE)) {
      const call = deps.calls.find((c) => c.prompt.toLowerCase().includes(phrase));
      expect(call, `expected a generate() call for kind "${kind}"`).toBeDefined();
      expect(call!.tier).toBe(EXPECTED_TIER[kind]);
    }
  });

  it("teardown() removes what deploy() created", async () => {
    const adapter = createArtifactsAdapter(makeDeps(cxRoot));
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    const dep = await adapter.deploy(artifacts);
    await adapter.teardown(dep);
    const health = await adapter.status(dep);
    expect(health.level).toBe("down");
  });

  it("simulate() throws a non-retryable CxAdapterError", async () => {
    const adapter = createArtifactsAdapter(makeDeps(cxRoot));
    try {
      await adapter.simulate(
        { targetId: "artifacts", specName: "x", deployedAt: "2026-07-22T00:00:00Z", resources: [] },
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
