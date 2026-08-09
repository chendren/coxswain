import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAdapter, type LocalAdapterDeps } from "../src/adapter";
import type { CxSpec } from "@cox/cx-core";

const journeyMap = {
  kind: "journeyMap" as const,
  id: "journeyMap",
  provenance: { specName: "billing-dispute", phase: "design" as const, targetId: "artifacts" as const },
  name: "Dispute resolution",
  stages: [],
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

describe("createLocalAdapter", () => {
  let cxRoot: string;
  let deps: LocalAdapterDeps;
  let posted: { path: string; body: unknown }[];

  beforeEach(async () => {
    posted = [];
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cx-local-adapter-"));

    // Mock fetch instead of listening on 127.0.0.1 (EPERM-safe)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? "GET";

        if (method === "GET" && u.endsWith("/api/journeys/definitions")) {
          return new Response(JSON.stringify({ billing_dispute: { label: "Billing Dispute Resolution" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (method === "GET" && u.endsWith("/api/health/ready")) {
          return new Response(JSON.stringify({ status: "healthy" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (method === "GET" && u.includes("/api/journeys")) {
          return new Response(JSON.stringify({ stats: { billing_dispute: { active: 3 } } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (method === "POST" && u.endsWith("/api/events/batch")) {
          const bodyText = init?.body ? String(init.body) : "{}";
          const body = JSON.parse(bodyText) as unknown;
          posted.push({ path: "/api/events/batch", body });
          return new Response(JSON.stringify({ processed: 2, results: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (method === "GET" && u.endsWith("/api/dashboard/kpis")) {
          return new Response(
            JSON.stringify({ sla_compliance_rate: 280, sentiment_distribution: { positive: 3, negative: 1 } }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );

    deps = {
      cxRoot,
      baseUrl: "http://dummy.test",
      now: () => "2026-07-22T00:00:00Z",
      randomFn: () => 0,
      generate: async (prompt) => {
        if (prompt.includes("Which of these journey types")) {
          return JSON.stringify({ journeyType: "billing_dispute" });
        }
        return JSON.stringify({ metrics: [{ name: "sla_compliance_rate", target: 300, unit: "seconds" }] });
      },
    };
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("has id 'local' and capabilities including simulate", () => {
    const adapter = createLocalAdapter(deps);
    expect(adapter.id).toBe("local");
    expect(adapter.capabilities()).toEqual(["build", "deploy", "status", "simulate", "teardown"]);
  });

  it("plan() -> build() -> deploy() -> status() binds to billing_dispute and reports healthy", async () => {
    const adapter = createLocalAdapter(deps);
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    expect(artifacts.map((a) => a.kind).sort()).toEqual(["agentDefinition", "journeyMap", "kpiFrame"]);
    const dep = await adapter.deploy(artifacts);
    expect(dep.resources).toHaveLength(3);
    const health = await adapter.status(dep);
    expect(health.level).toBe("healthy");
  });

  it("simulate() posts synthetic events and reports outcomes against the recovered KPI target", async () => {
    const adapter = createLocalAdapter(deps);
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    const dep = await adapter.deploy(artifacts);
    const report = await adapter.simulate(dep, {
      name: "peak",
      volumePerMinute: 2,
      personaWeights: { alex: 1 },
      durationMinutes: 1,
    });
    expect(posted).toHaveLength(1);
    expect((posted[0]!.body as { events: unknown[] }).events).toHaveLength(2);
    expect(report.outcomes).toEqual([{ kpiName: "sla_compliance_rate", achieved: 280, target: 300 }]);
  });

  it("teardown() removes what deploy() created", async () => {
    const adapter = createLocalAdapter(deps);
    const plan = await adapter.plan(spec);
    const artifacts = await adapter.build(plan);
    const dep = await adapter.deploy(artifacts);
    await adapter.teardown(dep);
    await expect(adapter.status(dep)).rejects.toThrow();
  });
});
